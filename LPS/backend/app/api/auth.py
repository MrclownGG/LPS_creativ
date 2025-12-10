from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import User
from app.db.session import get_db

router = APIRouter(tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


class UserInfo(BaseModel):
  id: int
  username: str
  nickname: Optional[str] = None
  role: str
  status: str


class LoginRequest(BaseModel):
  username: str
  password: str


class RegisterRequest(BaseModel):
  username: str
  password: str
  nickname: Optional[str] = None
  role: Optional[str] = "operator"


class LoginResponse(BaseModel):
  code: int
  message: str
  data: Optional[dict] = None


def hash_password(password: str) -> str:
  return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
  try:
    return pwd_context.verify(plain_password, hashed_password)
  except Exception:
    return False


def create_access_token(user: User) -> str:
  settings = get_settings()
  expire = datetime.utcnow() + timedelta(
      minutes=settings.access_token_expire_minutes
  )
  payload = {
      "sub": str(user.id),
      "username": user.username,
      "role": user.role,
      "exp": expire,
  }
  token = jwt.encode(
      payload, settings.jwt_secret, algorithm=settings.jwt_algorithm
  )
  return token


def get_current_user(
  credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
  db: Session = Depends(get_db),
) -> User:
  if credentials is None:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing Authorization header",
    )
  token = credentials.credentials
  settings = get_settings()
  try:
    payload = jwt.decode(
        token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
    )
    user_id = int(payload.get("sub") or 0)
  except Exception:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )

  user = db.get(User, user_id)
  if not user or user.status != "active":
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="User not found or disabled",
    )
  return user


@router.post(
  "/auth/login",
  response_model=LoginResponse,
  summary="用户登录（账号 + 密码）",
)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
  user: Optional[User] = (
      db.execute(select(User).where(User.username == payload.username))
      .scalars()
      .first()
  )
  if not user or not verify_password(payload.password, user.password_hash):
    return LoginResponse(code=1, message="用户名或密码错误", data=None)
  if user.status != "active":
    return LoginResponse(code=1, message="账号已禁用", data=None)

  token = create_access_token(user)
  info = UserInfo(
      id=user.id,
      username=user.username,
      nickname=user.nickname,
      role=user.role,
      status=user.status,
  )
  return LoginResponse(
      code=0,
      message="ok",
      data={"access_token": token, "token_type": "bearer", "user": info.model_dump()},
  )


@router.post(
  "/auth/register",
  response_model=LoginResponse,
  summary="用户注册（自助创建账号）",
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> LoginResponse:
  existed: Optional[User] = (
      db.execute(select(User).where(User.username == payload.username))
      .scalars()
      .first()
  )
  if existed:
    return LoginResponse(code=1, message="用户名已存在", data=None)

  user = User(
      username=payload.username,
      password_hash=hash_password(payload.password),
      nickname=payload.nickname,
      role=payload.role or "operator",
      status="active",
  )
  db.add(user)
  db.commit()
  db.refresh(user)

  token = create_access_token(user)
  info = UserInfo(
      id=user.id,
      username=user.username,
      nickname=user.nickname,
      role=user.role,
      status=user.status,
  )
  return LoginResponse(
      code=0,
      message="ok",
      data={"access_token": token, "token_type": "bearer", "user": info.model_dump()},
  )


@router.get(
  "/auth/me",
  response_model=LoginResponse,
  summary="获取当前登录用户",
)
def get_me(user: User = Depends(get_current_user)) -> LoginResponse:
  info = UserInfo(
      id=user.id,
      username=user.username,
      nickname=user.nickname,
      role=user.role,
      status=user.status,
  )
  return LoginResponse(code=0, message="ok", data={"user": info.model_dump()})
