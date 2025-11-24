# LPS Creativ 项目总览

LPS Creativ 是一个内部使用的 FB 广告落地页生成系统，
目标是帮助美工和投流同事围绕“视频素材 + 模板”快速生成可下载的落地页批次。

本仓库的 `LPS` 目录用于存放「正式实现」，而 `Test` 目录用于蓝图、实验和参考 demo。

当前阶段，后端已经具备基础骨架和视频模块的 CRUD，前端已经有统一布局和左侧导航。

## 目录结构（当前阶段）

以 `LPS_creativ` 为根目录，当前关键目录如下：

- `LPS/`
  - `backend/`：后端 FastAPI 项目（Python）
    - `app/`
      - `main.py`：FastAPI 应用入口（定义 `/health`、`/db-check`、`/api/*` 等路由）
      - `core/config.py`：配置加载（`.env` / 环境变量）
      - `db/base.py`：SQLAlchemy Base 定义与模型收集点
      - `db/models.py`：ORM 模型定义（video / template / workflow / ...）
      - `db/session.py`：数据库引擎、Session 工厂、健康检查
    - `requirements.txt`：后端 Python 依赖列表
    - `.env.example`：本地开发配置示例（需要复制为 `.env`）
  - `frontend/`：前端 React 项目
    - 使用 Vite + React + TypeScript
    - 使用 Ant Design 作为 UI 组件库
    - 使用 React Router 管理多页面（左侧菜单在 4 个一级页面之间切换）
    - 使用 Axios + TanStack Query 调用后端接口并管理缓存
  - `docs/`：项目级文档
    - `架构说明.md`：整体架构与分层说明
    - `接口约定.md`：统一返回格式与接口规范（含视频模块的 CRUD 接口）
    - `数据库设计说明.md`：数据库表结构与实体关系（根据蓝图落地）
    - `开发日志.md`：按时间记录已经完成的里程碑与下一步计划

> 提示：`Test` 目录里包含了需求文档、数据库蓝图和前端技术栈说明，
> 它们是设计的“真理源”，但正式实现会放在 `LPS` 目录下。

## 技术栈（当前确定部分）

- 后端
  - 语言：Python（建议使用 3.11，已在 conda 环境中配置）
  - 框架：FastAPI
  - 数据库：PostgreSQL
  - ORM：SQLAlchemy
  - 迁移工具：Alembic

- 前端
  - 语言：TypeScript
  - 框架：React（基于 Vite）
  - UI 组件库：Ant Design
  - 路由：React Router（配合 Ant Design Layout + Menu 实现左侧导航）
  - 网络与缓存：Axios + TanStack Query

> 本文件只做整体性说明。  
> 具体到后端的安装运行步骤，请参考 `LPS/backend/README.md`。  
> API 设计细节请参考 `LPS/docs/接口约定.md`。  
> 开发过程与当前进度请参考 `LPS/docs/开发日志.md`。

