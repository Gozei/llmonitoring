import { z } from 'zod';

export const jsonValueSchema = z.record(z.string(), z.unknown()).nullable().optional();

export const insertPlatformSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().nullable().optional(),
  api_endpoint: z.string().min(1),
  api_key: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  config: jsonValueSchema,
});

export type InsertPlatform = z.infer<typeof insertPlatformSchema>;

export interface Platform {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  api_endpoint: string;
  api_key: string | null;
  is_active: boolean;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
}

export const insertModelSchema = z.object({
  platform_id: z.number().int().positive(),
  name: z.string().min(1),
  model_id: z.string().min(1),
  description: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  config: jsonValueSchema,
});

export type InsertModel = z.infer<typeof insertModelSchema>;

export interface Model {
  id: number;
  platform_id: number;
  name: string;
  model_id: string;
  description: string | null;
  is_active: boolean;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
}

export const insertPingRecordSchema = z.object({
  model_id: z.number().int().positive(),
  platform_id: z.number().int().positive(),
  latency_ms: z.number().int().nullable().optional(),
  ttft_ms: z.number().int().nullable().optional(),
  total_time_ms: z.number().int().nullable().optional(),
  status: z.enum(['success', 'error', 'timeout', 'pending']).optional(),
  error_message: z.string().nullable().optional(),
  request_params: jsonValueSchema,
  response_data: jsonValueSchema,
});

export type InsertPingRecord = z.infer<typeof insertPingRecordSchema>;

export interface PingRecord {
  id: number;
  model_id: number;
  platform_id: number;
  latency_ms: number | null;
  ttft_ms: number | null;
  total_time_ms: number | null;
  status: 'success' | 'error' | 'timeout' | 'pending';
  error_message: string | null;
  request_params: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
  created_at: string;
}

export interface EvaluationScore {
  score: number;
  raw_score: number;
  latency_penalty: number;
  evaluation_complete: boolean;
  avg_latency_ms: number | null;
  level: string;
  notes: string[];
  risks: string[];
}

export interface EvaluationMetric {
  key: string;
  label: string;
  value: number;
  display: string;
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
  avg_total_tokens: number | null;
  min_latency_s: number | null;
  max_latency_s: number | null;
  response_models: string[];
  consistency_score: number;
  samples: string[];
  exceptions: string[];
  all_valid_json?: boolean;
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
