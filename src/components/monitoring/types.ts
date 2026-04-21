/**
 * 监控系统类型定义
 */

export interface Platform {
  id: number;
  name: string;
  slug: string;
  description?: string;
  api_endpoint: string;
  api_key?: string;
  is_active: boolean;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  models?: Model[];
}

export interface Model {
  id: number;
  platform_id: number;
  name: string;
  model_id: string;
  description?: string;
  is_active: boolean;
  config?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
  platform?: Platform;
}

export interface PingRecord {
  id: number;
  model_id: number;
  platform_id: number;
  latency_ms: number | null;
  ttft_ms: number | null;
  total_time_ms: number | null;
  status: 'success' | 'error' | 'timeout' | 'pending';
  error_message?: string;
  request_params?: Record<string, unknown>;
  response_data?: Record<string, unknown>;
  created_at: string;
}

export interface ModelStats {
  avg_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  success_count: number;
  error_count: number;
  total_count: number;
  success_rate: number;
}

export interface ModelStatus {
  model: Model;
  platform: Platform;
  latest: PingRecord | null;
  stats: ModelStats;
}

export interface PlatformStatus {
  platform: Platform;
  models: ModelStatus[];
  stats: {
    avg_latency: number;
    total_tests: number;
    success_rate: number;
  };
}

export interface StatusSummary {
  total_models: number;
  active_models: number;
  avg_latency: number;
  total_tests: number;
  overall_success_rate: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AdapterInfo {
  slug: string;
  name: string;
  defaultEndpoint: string;
}
