/**
 * 大模型平台适配器接口
 * 定义所有大模型平台必须实现的接口
 */

export interface PingResult {
  /** 模型ID */
  model_id: number;
  /** 平台ID */
  platform_id: number;
  /** 延迟时间（毫秒） */
  latency_ms: number;
  /** 首token时间（毫秒）- 流式响应特有 */
  ttft_ms: number | null;
  /** 总响应时间（毫秒） */
  total_time_ms: number;
  /** 状态 */
  status: 'success' | 'error' | 'timeout';
  /** 错误信息 */
  error_message?: string;
  /** 请求参数 */
  request_params?: Record<string, unknown>;
  /** 响应数据（脱敏后） */
  response_data?: Record<string, unknown>;
}

export interface ModelConfig {
  /** 模型标识，如 glm-4、gpt-4 */
  model_id: string;
  /** 模型名称 */
  name: string;
  /** 模型特定配置（可选） */
  config?: Record<string, unknown>;
}

export interface PlatformConfig {
  /** 统一API端点 */
  api_endpoint: string;
  /** 统一API密钥 */
  api_key?: string;
  /** 要测试的模型配置 */
  models: ModelConfig[];
  /** 平台特定配置 */
  config?: Record<string, unknown>;
}

export interface IPlatformAdapter {
  /** 平台标识 */
  readonly slug: string;
  /** 平台名称 */
  readonly name: string;
  /** 平台默认端点 */
  readonly defaultEndpoint: string;

  /**
   * 执行延迟测试
   * @param platformConfig 平台配置
   * @param signal AbortSignal 可用于取消请求
   * @returns 测试结果数组（每个模型一个结果）
   */
  ping(platformConfig: PlatformConfig, signal?: AbortSignal): Promise<PingResult[]>;
}

/**
 * 测试消息
 */
export const DEFAULT_TEST_MESSAGE = '请简单介绍一下你自己，只回答一句话。';

/**
 * 请求超时时间（毫秒）
 */
export const DEFAULT_TIMEOUT_MS = 60000;
