# LLM 延迟监控系统

实时监控第三方大模型服务的响应延迟和可用性状态。

## 功能特性

- 实时监控多个第三方大模型服务的延迟
- 支持智谱AI、京东言犀等主流大模型
- 可扩展的适配器架构，便于添加新的提供商
- 完整的延迟统计（平均、最小、最大、TTFT）
- 历史记录查询和导出
- 自动刷新和手动测试

## 技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端监控面板                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ 实时状态卡片 │  │ 延迟趋势图  │  │ 历史记录表  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼────────────────────────────────────────┐
│                     Next.js API                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ /api/ping   │  │ /api/status │  │ /api/history│              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    监控系统核心                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ ZhipuAI适配 │  │ JD适配器   │  │ 通用适配器   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                   SQLite Database                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ ping_records│  │ platforms   │  │ models      │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## API 接口

### 平台管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/platforms` | 获取所有平台 |
| POST | `/api/platforms` | 创建新平台 |
| GET | `/api/platforms/[id]` | 获取单个平台 |
| PUT | `/api/platforms/[id]` | 更新平台 |
| DELETE | `/api/platforms/[id]` | 删除平台 |

### 延迟测试

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ping` | 测试所有提供商 |
| POST | `/api/ping/[id]` | 测试单个提供商 |

### 状态查询

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 获取监控状态概览 |
| GET | `/api/status?platform_id=x` | 获取单个平台详细状态 |
| GET | `/api/history/[modelId]` | 获取延迟记录历史 |

### 初始化

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/init` | 初始化默认平台和模型 |

## 数据表结构

### platforms - 平台表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| name | text | 平台名称 |
| slug | text | 唯一标识 |
| description | text | 描述 |
| api_endpoint | text | API地址 |
| api_key | text | API密钥 |
| is_active | integer | 是否启用 |
| config | text | JSON配置 |
| created_at | text | 创建时间 |
| updated_at | text | 更新时间 |

### models - 模型表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| platform_id | integer | 平台ID |
| name | text | 模型名称 |
| model_id | text | 模型标识 |
| description | text | 描述 |
| is_active | integer | 是否启用 |
| config | text | JSON配置 |
| created_at | text | 创建时间 |
| updated_at | text | 更新时间 |

### ping_records - 延迟记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| model_id | integer | 模型ID |
| platform_id | integer | 平台ID |
| latency_ms | integer | 延迟时间(毫秒) |
| ttft_ms | integer | 首token时间 |
| total_time_ms | integer | 总响应时间 |
| status | text | 状态 |
| error_message | text | 错误信息 |
| request_params | text | JSON请求参数 |
| response_data | text | JSON响应数据 |
| created_at | text | 创建时间 |

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发环境
pnpm dev

# 构建生产版本
pnpm build

# 启动生产环境
pnpm start

# 代码检查
pnpm lint
pnpm ts-check
```

## 添加新的提供商适配器

1. 创建适配器文件 `src/lib/monitoring/[slug]-adapter.ts`
2. 实现 `IProviderAdapter` 接口
3. 在 `registry.ts` 中注册适配器
4. 在 `src/app/api/init/route.ts` 添加默认配置（可选）

示例适配器：

```typescript
import { IProviderAdapter, ProviderConfig, PingResult, DEFAULT_TEST_MESSAGE } from './adapter';

export class MyProviderAdapter implements IProviderAdapter {
  readonly slug = 'my-provider';
  readonly name = '我的提供商';

  async ping(config: ProviderConfig): Promise<PingResult> {
    const startTime = Date.now();
    try {
      // 调用API并测量延迟
      const response = await fetch(config.api_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.api_key}`,
        },
        body: JSON.stringify({
          model: config.model_name,
          messages: [{ role: 'user', content: DEFAULT_TEST_MESSAGE }],
          stream: true,
        }),
      });

      // 处理流式响应，测量TTFT
      // ...

      return {
        provider_id: 0,
        latency_ms: ttft,
        ttft_ms: ttft,
        total_time_ms: Date.now() - startTime,
        status: 'success',
      };
    } catch (error) {
      return {
        provider_id: 0,
        latency_ms: Date.now() - startTime,
        ttft_ms: null,
        total_time_ms: Date.now() - startTime,
        status: 'error',
        error_message: error.message,
      };
    }
  }
}
```

## 环境变量

默认无需配置，系统使用本地 SQLite 数据库：

- `SQLITE_DATABASE_PATH` - SQLite 数据库文件路径（可选，默认 `data/llmmonitoring.db`）
- `DATABASE_PATH` - SQLite 数据库文件路径备用变量（可选）

## 监控指标说明

- **Latency (延迟)**: 从请求发送到收到首token的时间
- **TTFT (Time To First Token)**: 首token时间，流式响应特有指标
- **Total Time**: 完整响应时间
- **Success Rate**: 成功率百分比

## 核心组件

### 组件列表

| 组件 | 说明 |
|------|------|
| `MonitoringDashboard` | 监控仪表盘主组件 |
| `StatusCard` | 模型状态卡片组件 |
| `PlatformManagementDialog` | 平台管理对话框（创建/编辑平台及模型） |

### PlatformManagementDialog 功能

支持两种模式：

**创建模式（mode="create"）**：
- 分步流程：选择适配器 → 配置平台 → 配置模型
- 支持从预设模板快速创建

**编辑模式（mode="edit"）**：
- Tab 切换：平台配置 / 模型管理
- 同时支持平台信息和模型的管理

### 交互流程

1. 点击平台卡片的"配置"按钮 → 打开编辑对话框
2. 在 Tab "平台配置" 中：
   - 修改平台名称、API端点、API密钥、描述
   - 启用/停用平台监控
   - 点击"保存平台"保存更改
3. 在 Tab "模型管理" 中：
   - 查看所有模型列表
   - 添加新模型（填写名称、模型ID、描述，设置启用状态）
   - 编辑现有模型（点击编辑按钮修改任意字段）
   - 删除模型（确认后删除）
4. 点击"删除平台"可删除整个平台
5. 点击"关闭"完成操作
