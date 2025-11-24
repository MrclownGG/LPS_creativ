# LPS Creativ 后端（FastAPI）说明

本目录包含 LPS Creativ 系统的后端实现。
当前阶段仅实现了一个最小可运行的骨架：

- FastAPI 应用启动
- 环境配置加载
- PostgreSQL 数据库连接检查
- 两个基础接口：
  - `GET /health`：服务健康状态
  - `GET /db-check`：数据库连通性

后续所有业务接口会在此骨架上逐步扩展。

## 1. 运行环境要求

- Python：推荐 3.11（通过 conda 已创建 `lps` 环境）
- PostgreSQL：已在本机安装，并能通过 DBeaver 正常连接

建议的环境创建命令（供参考）：

```bash
conda create -n lps python=3.11 -y
conda activate lps
```

> 注意：如果你已经创建了名为 `lps` 的环境，可以直接 `conda activate lps`。

## 2. 安装依赖

在终端中切换到 `LPS_creativ/LPS/backend` 目录，并确保已激活 `lps` 环境：

```bash
cd LPS_creativ/LPS/backend
conda activate lps
pip install -r requirements.txt
```

安装完成后，你的环境中将包含：

- FastAPI（含 Uvicorn）
- SQLAlchemy
- psycopg（PostgreSQL 驱动）
- Alembic（后续用于数据库迁移）
- python-dotenv（加载 `.env` 配置）

## 3. 配置 `.env` 文件

在 `backend` 目录下，已经提供了一个示例文件 `.env.example`。

1. 复制一份：

```bash
cd LPS_creativ/LPS/backend
copy .env.example .env
```

2. 编辑 `.env` 文件，根据你的 PostgreSQL 实际配置修改 `DATABASE_URL`：

```env
ENVIRONMENT=local
API_VERSION=0.1.0
DATABASE_URL=postgresql+psycopg://postgres:你的密码@localhost:5432/lps_creativ
```

注意事项：

- `postgres` 是常见的默认用户名，如果你安装时用的是其他用户，请同步修改。
- `你的密码` 替换为你给 PostgreSQL 用户设置的密码。
- `lps_creativ` 是数据库名：
  - 如果已经在 PostgreSQL 中创建这个数据库，就保持一致；
  - 如果还没有，可以先用 DBeaver 或 SQL 手动创建：

```sql
CREATE DATABASE lps_creativ;
```

## 4. 启动开发服务器

在 `backend` 目录下，执行：

```bash
cd LPS_creativ/LPS/backend
conda activate lps
uvicorn app.main:app --reload
```

- `app.main:app` 意味着：
  - `app`：Python 包目录 `app/`
  - `main`：模块 `main.py`
  - `app`：FastAPI 实例对象（在 `main.py` 末尾定义）
- `--reload`：代码变更时自动重启，仅用于本地开发。

如果启动成功，你会在终端看到类似输出：

- Uvicorn running on `http://127.0.0.1:8000`

## 5. 测试基础接口

在浏览器中访问：

1. 服务健康检查：

   - URL：`http://127.0.0.1:8000/health`
   - 预期返回：

   ```json
   {
     "code": 0,
     "message": "ok",
     "data": {
       "service": "lps-backend",
       "version": "0.1.0",
       "environment": "local"
     }
   }
   ```

   如果能看到类似的 JSON，说明 FastAPI 服务运行正常。

2. 数据库连通性检查：

   - URL：`http://127.0.0.1:8000/d  b-check`
   - 成功时预期返回：

   ```json
   {
     "code": 0,
     "message": "ok",
     "data": {
       "status": "connected",
       "test_query_result": 1
     }
   }
   ```

   - 如果配置错误（例如密码不对、数据库不存在），会返回：

   ```json
   {
     "code": 1,
     "message": "database connection failed",
     "data": {
       "status": "error",
       "error_type": "...",
       "error_message": "..."
     }
   }
   ```

   此时可以根据 `error_message` 来检查：

   - 数据库是否启动
   - `DATABASE_URL` 中的用户名/密码/端口/数据库名是否正确

## 6. 代码结构与职责说明

当前后端代码结构：

- `app/main.py`
  - 创建 FastAPI 应用实例（`create_app`）
  - 注册两个路由：
    - `GET /health`
    - `GET /db-check`
  - 统一返回格式：
    - 成功：`{"code": 0, "message": "ok", "data": {...}}`
    - 失败：`{"code": 1, "message": "错误说明", "data": {...}}`
  - 后续所有业务接口也会遵守这个约定。

- `app/core/config.py`
  - 使用 `python-dotenv` 加载 `.env` 文件。
  - 使用 Pydantic 的 `BaseModel` 定义 `Settings`：
    - `environment`：当前环境标记（local/dev/prod）
    - `api_version`：API 版本号
    - `database_url`：数据库连接字符串
  - `get_settings()`：
    - 读取环境变量
    - 构造并缓存 `Settings` 实例（利用 `lru_cache`）
    - 如果缺少必要变量或格式非法，抛出清晰的错误。

- `app/db/session.py`
  - `get_engine()`：
    - 从配置中读取 `database_url`
    - 创建 SQLAlchemy `Engine` 对象（启用 `pool_pre_ping`）
  - `get_db_health()`：
    - 打开连接并执行 `SELECT 1`
    - 返回 `(ok, details)`：
      - `ok = True`：连接成功，`details` 中包含测试结果。
      - `ok = False`：捕获异常，`details` 中包含错误类型与错误信息。

> 说明：后续会在此基础上增加 Session 管理、ORM Base 类、具体模型和仓储层。

## 7. 下一步计划（预告）

在基础骨架稳定并通过测试后，下一步将分阶段实现：

1. 引入 Alembic，创建数据库迁移框架，并根据你的“数据库蓝图文档”创建实际表结构。
2. 实现第一个业务模块的接口（例如：视频素材 `video` 的查询/同步）。
3. 在 `LPS/docs/接口约定.md` 中详细记录每个接口的请求/响应格式。

每一步都会：

- 先更新文档（说明要实现什么、数据结构如何）。
- 再实现代码。
- 最后给出本地测试步骤与常见错误排查建议。

