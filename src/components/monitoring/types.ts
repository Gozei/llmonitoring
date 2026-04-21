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

export interface EvaluationCaseSummary {
  case: string;
  score: number;
  metrics: EvaluationMetric[];
  calls: number;
  success_calls: number;
  failed_calls: number;
  timeout_calls: number;
  success_rate: number;
  timeout_rate: number;
  avg_latency_s: number | null;
  avg_ttft_s: number | null;
  avg_total_time_s: number | null;
  min_latency_s: number | null;
  max_latency_s: number | null;
  response_models: string[];
  consistency_score: number;
  samples: string[];
  exceptions: string[];
  all_valid_json?: boolean;
}

export interface EvaluationMetric {
  key: string;
  label: string;
  value: number;
  display: string;
}

export interface EvaluationRecord {
  id: number;
  model_id: number;
  platform_id: number;
  score: number;
  raw_score: number;
  latency_penalty: number;
  evaluation_complete: boolean;
  level: string;
  notes: string[];
  risks: string[];
  summary: EvaluationCaseSummary[];
  raw_logs: Record<string, unknown>;
  total_calls: number;
  success_rate: number;
  avg_latency_ms: number | null;
  timeout_rate: number;
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
  evaluation: EvaluationRecord | null;
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
