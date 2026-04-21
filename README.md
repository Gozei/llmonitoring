# LLM Monitoring

一个用于监控第三方大模型服务延迟和可用性的本地化监控面板。

项目可以定时或手动测试多个模型接口，记录首 token 时间、总耗时、成功率和历史延迟数据。当前内置智谱 AI、京东言犀以及通用 OpenAI 兼容接口适配器，适合部署在自己的服务器、NAS 或 Docker 环境中长期运行。

## 功能

- 多平台、多模型延迟监控
- 支持 TTFT、总耗时、成功率统计
- 支持手动测试单个模型、单个平台或全部模型
- 支持平台和模型的新增、编辑、启停、删除
- 支持历史记录查看
- 本地 SQLite 持久化，无需依赖外部数据库
- 可通过环境变量指定数据库文件位置，方便服务器和 Docker 挂载

## 技术栈

- Next.js 16 App Router
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui + Radix UI
- Recharts
- SQLite + better-sqlite3
- pnpm

## 本地启动

安装依赖：

```bash
pnpm install
```

启动开发服务：

```bash
pnpm dev
```

默认访问：

```text
http://localhost:5000
```

如果 `5000` 端口被占用，可以指定其他端口：

```bash
PORT=5001 pnpm dev
```

然后访问：

```text
http://localhost:5001
```

## 数据库

项目默认使用 SQLite，启动时会自动创建数据库文件和数据表。

默认数据库位置：

```text
data/llmmonitoring.db
```

可以通过环境变量指定数据库文件路径：

```bash
SQLITE_DATABASE_PATH=/data/llmmonitoring.db pnpm dev
```

也支持备用变量：

```bash
DATABASE_PATH=/data/llmmonitoring.db pnpm dev
```

建议部署时把数据库目录挂载到宿主机或持久化卷，例如 Docker 中挂载 `/data`。

## 常用命令

```bash
# 开发
pnpm dev

# 类型检查
pnpm ts-check

# 代码检查
pnpm lint

# 构建
pnpm build

# 生产启动
pnpm start
```

## 生产部署

直接部署到服务器时：

```bash
pnpm install
pnpm build
SQLITE_DATABASE_PATH=/data/llmmonitoring.db pnpm start
```

如果使用 Docker，重点是持久化 SQLite 数据库文件：

```bash
SQLITE_DATABASE_PATH=/data/llmmonitoring.db
```

并将容器内 `/data` 挂载到宿主机目录。

## 项目结构

```text
src/
├── app/                         # 页面和 API 路由
│   ├── api/                     # 监控、平台、模型、历史接口
│   ├── history/[id]/            # 模型历史记录页面
│   └── page.tsx                 # 首页监控面板
├── components/
│   ├── monitoring/              # 监控业务组件
│   └── ui/                      # shadcn/ui 基础组件
├── lib/
│   └── monitoring/              # 适配器、注册表、数据库操作层
└── storage/
    └── database/                # SQLite 客户端和共享类型
```

## 主要接口

平台管理：

```text
GET    /api/platforms
POST   /api/platforms
GET    /api/platforms/[id]
PUT    /api/platforms/[id]
DELETE /api/platforms/[id]
```

模型管理：

```text
GET    /api/models
POST   /api/models
GET    /api/models/[id]
PUT    /api/models/[id]
DELETE /api/models/[id]
```

监控测试：

```text
POST /api/ping
POST /api/ping/models/[id]
POST /api/ping/platforms/[id]
```

状态和历史：

```text
GET /api/status
GET /api/history/[modelId]
```

初始化默认平台和模型：

```text
POST /api/init
```

## 添加新的模型平台

1. 在 `src/lib/monitoring/` 下创建新的适配器文件。
2. 实现现有适配器接口。
3. 在 `src/lib/monitoring/registry.ts` 注册适配器。
4. 如需内置默认平台，在 `src/app/api/init/route.ts` 添加初始化配置。

## 注意事项

- 平台 API Key 存在本地 SQLite 数据库中，请保护好数据库文件。
- SQLite 适合单机部署。如果未来需要多实例并发部署，建议迁移到 PostgreSQL。
- 当前项目使用 pnpm，`preinstall` 会阻止 npm/yarn 安装。
