from __future__ import annotations

"""
用户管理相关接口：列表、创建、更新（含重置密码、变更角色/状态）。
"""

from typing import List, Optional

from fastapi import APIRouter, Depends
from passlib.context import CryptContext
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import get_db

router = APIRouter(tags=["users"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UserItem(BaseModel):
  id: int
  username: str
  nickname: Optional[str] = None
  role: str
  status: str
  created_at: str


class UserListResponse(BaseModel):
  code: int
  message: str
  data: dict


class UserCreateRequest(BaseModel):
  username: str = Field(..., max_length=100)
  password: str = Field(..., min_length=6, max_length=100)
  nickname: Optional[str] = Field(None, max_length=100)
  role: str = Field("operator", max_length=20)
  status: str = Field("active", max_length=20)


class UserUpdateRequest(BaseModel):
  nickname: Optional[str] = Field(None, max_length=100)
  role: Optional[str] = Field(None, max_length=20)
  status: Optional[str] = Field(None, max_length=20)
  password: Optional[str] = Field(None, min_length=6, max_length=100)


def _hash_password(password: str) -> str:
  return pwd_context.hash(password)


def _to_item(user: User) -> UserItem:
  return UserItem(
      id=user.id,
      username=user.username,
      nickname=user.nickname,
      role=user.role,
      status=user.status,
      created_at=user.created_at.isoformat() if user.created_at else "",
  )


@router.get("/users", response_model=UserListResponse)
def list_users(
  page: int = 1,
  page_size: int = 20,
  status: Optional[str] = None,
  role: Optional[str] = None,
  db: Session = Depends(get_db),
) -> UserListResponse:
  query = select(User)
  if status:
    query = query.where(User.status == status)
  if role:
    query = query.where(User.role == role)
  total = db.scalar(select(func.count()).select_from(query.subquery()))
  rows: List[User] = (
      db.execute(
          query.order_by(User.created_at.desc())
          .offset((page - 1) * page_size)
          .limit(page_size)
      )
      .scalars()
      .all()
  )
  return UserListResponse(
      code=0,
      message="ok",
      data={
          "total": total or 0,
          "items": [_to_item(u).model_dump() for u in rows],
      },
  )


@router.post("/users", response_model=UserListResponse)
def create_user(
  payload: UserCreateRequest, db: Session = Depends(get_db)
) -> UserListResponse:
  exists = (
      db.execute(select(User).where(User.username == payload.username))
      .scalars()
      .first()
  )
  if exists:
    return UserListResponse(code=1, message="用户名已存在", data={})

  user = User(
      username=payload.username,
      password_hash=_hash_password(payload.password),
      nickname=payload.nickname,
      role=payload.role,
      status=payload.status,
  )
  db.add(user)
  db.commit()
  db.refresh(user)
  return UserListResponse(
      code=0,
      message="ok",
      data={"user": _to_item(user).model_dump()},
  )


@router.patch("/users/{user_id}", response_model=UserListResponse)
def update_user(
  user_id: int, payload: UserUpdateRequest, db: Session = Depends(get_db)
) -> UserListResponse:
  user = db.get(User, user_id)
  if not user:
    return UserListResponse(code=1, message="用户不存在", data={})

  if payload.nickname is not None:
    user.nickname = payload.nickname
  if payload.role is not None:
    user.role = payload.role
  if payload.status is not None:
    user.status = payload.status
  if payload.password:
    user.password_hash = _hash_password(payload.password)

  db.add(user)
  db.commit()
  db.refresh(user)
  return UserListResponse(
      code=0,
      message="ok",
      data={"user": _to_item(user).model_dump()},
  )
