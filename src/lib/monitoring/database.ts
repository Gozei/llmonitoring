/**
 * 数据库操作层 - 大模型平台和模型
 */

import { getSqliteClient } from '@/storage/database/sqlite-client';
import type {
  EvaluationCaseSummary,
  EvaluationRecord,
  EvaluationScore,
  Platform,
  InsertPlatform,
  Model,
  InsertModel,
  PingRecord,
  InsertPingRecord,
} from '@/storage/database/shared/schema';

type SqlValue = string | number | null;
type Row = Record<string, unknown>;

const EVALUATION_CASE_POLICY = {
  connectivity_check: { timeout: 30, latencyField: 'avg_latency_s' },
  identity_check: { timeout: 30, latencyField: 'avg_latency_s' },
  json_check: { timeout: 30, latencyField: 'avg_latency_s' },
  code_check: { timeout: 60, latencyField: 'avg_latency_s' },
  reasoning_check: { timeout: 180, latencyField: 'avg_total_time_s' },
  consistency_check: { timeout: 45, latencyField: 'avg_latency_s' },
} as const;

const EVALUATION_CASE_ORDER = Object.keys(EVALUATION_CASE_POLICY) as Array<keyof typeof EVALUATION_CASE_POLICY>;

function nowIso(): string {
  return new Date().toISOString();
}

function toJson(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

function fromJson(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toBool(value: unknown): boolean {
  return value === true || value === 1;
}

function normalizePlatform(row: Row): Platform {
  return {
    ...row,
    is_active: toBool(row.is_active),
    config: fromJson(row.config),
  } as Platform;
}

function normalizeModel(row: Row): Model {
  return {
    ...row,
    is_active: toBool(row.is_active),
    config: fromJson(row.config),
  } as Model;
}

function normalizePingRecord(row: Row): PingRecord {
  return {
    ...row,
    request_params: fromJson(row.request_params),
    response_data: fromJson(row.response_data),
  } as PingRecord;
}

function deriveEvaluationAvgLatencyMs(summary: EvaluationCaseSummary[]): number | null {
  if (EVALUATION_CASE_ORDER.length === 0) return null;

  const byCase = new Map(summary.map(item => [item.case, item]));
  const total = EVALUATION_CASE_ORDER.reduce((sum, caseName) => {
    const policy = EVALUATION_CASE_POLICY[caseName];
    const item = byCase.get(caseName);
    const value = item?.[policy.latencyField];
    const latencySeconds = typeof value === 'number' ? value : policy.timeout;
    return sum + latencySeconds * 1000;
  }, 0);

  return Math.round(total / EVALUATION_CASE_ORDER.length);
}

function normalizeEvaluationRecord(row: Row): EvaluationRecord {
  const summary = ((fromJson(row.summary) ?? []) as EvaluationCaseSummary[]).map(item => ({
    ...item,
    score: typeof item.score === 'number' ? item.score : Math.round(item.success_rate * 100),
    metrics: Array.isArray(item.metrics) ? item.metrics : [],
    avg_ttft_s: typeof item.avg_ttft_s === 'number' ? item.avg_ttft_s : null,
    avg_total_time_s: typeof item.avg_total_time_s === 'number' ? item.avg_total_time_s : null,
    avg_total_tokens: typeof item.avg_total_tokens === 'number' ? item.avg_total_tokens : null,
  }));
  const inferredRawScore = EVALUATION_CASE_ORDER.length > 0
    ? Math.round(EVALUATION_CASE_ORDER.reduce((sum, caseName) => {
      const item = summary.find(entry => entry.case === caseName);
      return sum + (item?.score ?? 0);
    }, 0) / EVALUATION_CASE_ORDER.length)
    : 0;
  const derivedAvgLatencyMs = deriveEvaluationAvgLatencyMs(summary);
  const storedScore = typeof row.score === 'number' ? row.score : inferredRawScore;
  const inferredPenalty = Math.max(0, Number((inferredRawScore - storedScore).toFixed(1)));
  const evaluationComplete = typeof row.evaluation_complete === 'number'
    ? toBool(row.evaluation_complete)
    : EVALUATION_CASE_ORDER.every(caseName => summary.some(item => item.case === caseName));

  return {
    ...row,
    raw_score: typeof row.raw_score === 'number' ? row.raw_score : inferredRawScore,
    latency_penalty: typeof row.latency_penalty === 'number' ? row.latency_penalty : inferredPenalty,
    evaluation_complete: evaluationComplete,
    notes: (fromJson(row.notes) ?? []) as string[],
    risks: (fromJson(row.risks) ?? []) as string[],
    summary,
    raw_logs: (fromJson(row.raw_logs) ?? {}) as Record<string, unknown>,
    avg_latency_ms: typeof row.avg_latency_ms === 'number' ? row.avg_latency_ms : derivedAvgLatencyMs,
  } as EvaluationRecord;
}

function platformParams(platform: InsertPlatform): Record<string, SqlValue> {
  return {
    name: platform.name,
    slug: platform.slug,
    description: platform.description ?? null,
    api_endpoint: platform.api_endpoint,
    api_key: platform.api_key ?? null,
    is_active: platform.is_active === false ? 0 : 1,
    config: toJson(platform.config),
  };
}

function modelParams(model: InsertModel): Record<string, SqlValue> {
  return {
    platform_id: model.platform_id,
    name: model.name,
    model_id: model.model_id,
    description: model.description ?? null,
    is_active: model.is_active === false ? 0 : 1,
    config: toJson(model.config),
  };
}

function pingRecordParams(record: InsertPingRecord): Record<string, SqlValue> {
  return {
    model_id: record.model_id,
    platform_id: record.platform_id,
    latency_ms: record.latency_ms ?? null,
    ttft_ms: record.ttft_ms ?? null,
    total_time_ms: record.total_time_ms ?? null,
    status: record.status ?? 'pending',
    error_message: record.error_message ?? null,
    request_params: toJson(record.request_params),
    response_data: toJson(record.response_data),
  };
}

function buildUpdateSet(
  updates: Record<string, unknown>,
  serializers: Record<string, (value: unknown) => SqlValue> = {}
): { setClause: string; params: Record<string, SqlValue> } {
  const params: Record<string, SqlValue> = {};
  const columns: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;

    columns.push(`${key} = @${key}`);
    params[key] = serializers[key] ? serializers[key](value) : (value as SqlValue);
  }

  columns.push('updated_at = @updated_at');
  params.updated_at = nowIso();

  return {
    setClause: columns.join(', '),
    params,
  };
}

function requirePlatform(id: number): Platform {
  const platform = getPlatformByIdSync(id);
  if (!platform) throw new Error('平台不存在');
  return platform;
}

function requireModel(id: number): Model {
  const model = getModelByIdSync(id);
  if (!model) throw new Error('模型不存在');
  return model;
}

function getPlatformByIdSync(id: number): Platform | null {
  const row = getSqliteClient()
    .prepare('SELECT * FROM platforms WHERE id = ?')
    .get(id) as Row | undefined;

  return row ? normalizePlatform(row) : null;
}

function getModelByIdSync(id: number): Model | null {
  const row = getSqliteClient()
    .prepare('SELECT * FROM models WHERE id = ?')
    .get(id) as Row | undefined;

  return row ? normalizeModel(row) : null;
}

// ==================== 平台操作 ====================

/**
 * 获取所有启用的平台
 */
export async function getActivePlatforms(): Promise<Platform[]> {
  const rows = getSqliteClient()
    .prepare('SELECT * FROM platforms WHERE is_active = 1 ORDER BY id')
    .all() as Row[];

  return rows.map(normalizePlatform);
}

/**
 * 根据ID获取平台
 */
export async function getPlatformById(id: number): Promise<Platform | null> {
  return getPlatformByIdSync(id);
}

/**
 * 根据slug获取平台
 */
export async function getPlatformBySlug(slug: string): Promise<Platform | null> {
  const row = getSqliteClient()
    .prepare('SELECT * FROM platforms WHERE slug = ?')
    .get(slug) as Row | undefined;

  return row ? normalizePlatform(row) : null;
}

/**
 * 获取所有平台
 */
export async function getAllPlatforms(): Promise<Platform[]> {
  const rows = getSqliteClient()
    .prepare('SELECT * FROM platforms ORDER BY id')
    .all() as Row[];

  return rows.map(normalizePlatform);
}

/**
 * 创建平台
 */
export async function createPlatform(platform: InsertPlatform): Promise<Platform> {
  const params = platformParams(platform);
  const info = getSqliteClient()
    .prepare(`
      INSERT INTO platforms (name, slug, description, api_endpoint, api_key, is_active, config)
      VALUES (@name, @slug, @description, @api_endpoint, @api_key, @is_active, @config)
    `)
    .run(params);

  return requirePlatform(Number(info.lastInsertRowid));
}

/**
 * 更新平台
 */
export async function updatePlatform(id: number, updates: Partial<InsertPlatform>): Promise<Platform> {
  const { setClause, params } = buildUpdateSet(updates, {
    is_active: (value) => value === false ? 0 : 1,
    config: toJson,
  });

  getSqliteClient()
    .prepare(`UPDATE platforms SET ${setClause} WHERE id = @id`)
    .run({ ...params, id });

  return requirePlatform(id);
}

/**
 * 删除平台
 */
export async function deletePlatform(id: number): Promise<void> {
  getSqliteClient()
    .prepare('DELETE FROM platforms WHERE id = ?')
    .run(id);
}

// ==================== 模型操作 ====================

/**
 * 获取平台的所有模型
 */
export async function getModelsByPlatformId(platformId: number, activeOnly = false): Promise<Model[]> {
  const sql = activeOnly
    ? 'SELECT * FROM models WHERE platform_id = ? AND is_active = 1 ORDER BY id'
    : 'SELECT * FROM models WHERE platform_id = ? ORDER BY id';

  const rows = getSqliteClient().prepare(sql).all(platformId) as Row[];
  return rows.map(normalizeModel);
}

/**
 * 获取启用的模型（带平台信息）
 */
export async function getActiveModelsWithPlatforms(): Promise<Array<Model & { platform: Platform }>> {
  const rows = getSqliteClient()
    .prepare(`
      SELECT
        m.id AS m_id,
        m.platform_id AS m_platform_id,
        m.name AS m_name,
        m.model_id AS m_model_id,
        m.description AS m_description,
        m.is_active AS m_is_active,
        m.config AS m_config,
        m.created_at AS m_created_at,
        m.updated_at AS m_updated_at,
        p.id AS p_id,
        p.name AS p_name,
        p.slug AS p_slug,
        p.description AS p_description,
        p.api_endpoint AS p_api_endpoint,
        p.api_key AS p_api_key,
        p.is_active AS p_is_active,
        p.config AS p_config,
        p.created_at AS p_created_at,
        p.updated_at AS p_updated_at
      FROM models m
      INNER JOIN platforms p ON p.id = m.platform_id
      WHERE m.is_active = 1
      ORDER BY m.platform_id, m.id
    `)
    .all() as Row[];

  return rows.map(row => {
    const model = normalizeModel({
      id: row.m_id,
      platform_id: row.m_platform_id,
      name: row.m_name,
      model_id: row.m_model_id,
      description: row.m_description,
      is_active: row.m_is_active,
      config: row.m_config,
      created_at: row.m_created_at,
      updated_at: row.m_updated_at,
    });
    const platform = normalizePlatform({
      id: row.p_id,
      name: row.p_name,
      slug: row.p_slug,
      description: row.p_description,
      api_endpoint: row.p_api_endpoint,
      api_key: row.p_api_key,
      is_active: row.p_is_active,
      config: row.p_config,
      created_at: row.p_created_at,
      updated_at: row.p_updated_at,
    });

    return { ...model, platform };
  });
}

/**
 * 根据ID获取模型
 */
export async function getModelById(id: number): Promise<Model | null> {
  return getModelByIdSync(id);
}

/**
 * 获取所有模型（带平台信息）
 */
export async function getAllModelsWithPlatforms(): Promise<Array<Model & { platform: Platform }>> {
  const models = getSqliteClient()
    .prepare('SELECT * FROM models ORDER BY platform_id, id')
    .all() as Row[];

  const platforms = getSqliteClient()
    .prepare('SELECT * FROM platforms')
    .all() as Row[];

  const platformMap = new Map(platforms.map(row => {
    const platform = normalizePlatform(row);
    return [platform.id, platform];
  }));

  return models.map(row => {
    const model = normalizeModel(row);
    return {
      ...model,
      platform: platformMap.get(model.platform_id) as Platform,
    };
  });
}

export async function getModelWithPlatformById(id: number): Promise<(Model & { platform: Platform }) | null> {
  const model = getModelByIdSync(id);
  if (!model) return null;

  const platform = getPlatformByIdSync(model.platform_id);
  if (!platform) return null;

  return { ...model, platform };
}

/**
 * 创建模型
 */
export async function createModel(model: InsertModel): Promise<Model> {
  const params = modelParams(model);
  const info = getSqliteClient()
    .prepare(`
      INSERT INTO models (platform_id, name, model_id, description, is_active, config)
      VALUES (@platform_id, @name, @model_id, @description, @is_active, @config)
    `)
    .run(params);

  return requireModel(Number(info.lastInsertRowid));
}

/**
 * 批量创建模型
 */
export async function createModels(models: InsertModel[]): Promise<Model[]> {
  const database = getSqliteClient();
  const insert = database.prepare(`
    INSERT INTO models (platform_id, name, model_id, description, is_active, config)
    VALUES (@platform_id, @name, @model_id, @description, @is_active, @config)
  `);

  const insertMany = database.transaction((items: InsertModel[]) => {
    const ids: number[] = [];
    for (const model of items) {
      const info = insert.run(modelParams(model));
      ids.push(Number(info.lastInsertRowid));
    }
    return ids;
  });

  return insertMany(models).map(requireModel);
}

/**
 * 更新模型
 */
export async function updateModel(id: number, updates: Partial<InsertModel>): Promise<Model> {
  const { setClause, params } = buildUpdateSet(updates, {
    is_active: (value) => value === false ? 0 : 1,
    config: toJson,
  });

  getSqliteClient()
    .prepare(`UPDATE models SET ${setClause} WHERE id = @id`)
    .run({ ...params, id });

  return requireModel(id);
}

/**
 * 删除模型
 */
export async function deleteModel(id: number): Promise<void> {
  getSqliteClient()
    .prepare('DELETE FROM models WHERE id = ?')
    .run(id);
}

// ==================== 延迟记录操作 ====================

/**
 * 插入延迟记录
 */
export async function insertPingRecord(record: InsertPingRecord): Promise<PingRecord> {
  const params = pingRecordParams(record);
  const info = getSqliteClient()
    .prepare(`
      INSERT INTO ping_records (
        model_id, platform_id, latency_ms, ttft_ms, total_time_ms,
        status, error_message, request_params, response_data
      )
      VALUES (
        @model_id, @platform_id, @latency_ms, @ttft_ms, @total_time_ms,
        @status, @error_message, @request_params, @response_data
      )
    `)
    .run(params);

  const row = getSqliteClient()
    .prepare('SELECT * FROM ping_records WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as Row;

  return normalizePingRecord(row);
}

export async function insertEvaluationRecord(record: {
  model_id: number;
  platform_id: number;
  final_score: EvaluationScore;
  summary: EvaluationCaseSummary[];
  raw_logs: Record<string, unknown>;
}): Promise<EvaluationRecord> {
  const totalCalls = record.summary.reduce((sum, item) => sum + item.calls, 0);
  const successCalls = record.summary.reduce((sum, item) => sum + item.success_calls, 0);
  const timeoutCalls = record.summary.reduce((sum, item) => sum + item.timeout_calls, 0);

  const info = getSqliteClient()
    .prepare(`
      INSERT INTO evaluation_records (
        model_id, platform_id, score, level, notes, risks, summary, raw_logs,
        total_calls, success_rate, avg_latency_ms, timeout_rate,
        raw_score, latency_penalty, evaluation_complete
      )
      VALUES (
        @model_id, @platform_id, @score, @level, @notes, @risks, @summary, @raw_logs,
        @total_calls, @success_rate, @avg_latency_ms, @timeout_rate,
        @raw_score, @latency_penalty, @evaluation_complete
      )
    `)
    .run({
      model_id: record.model_id,
      platform_id: record.platform_id,
      score: record.final_score.score,
      raw_score: record.final_score.raw_score,
      latency_penalty: record.final_score.latency_penalty,
      evaluation_complete: record.final_score.evaluation_complete ? 1 : 0,
      level: record.final_score.level,
      notes: toJson(record.final_score.notes),
      risks: toJson(record.final_score.risks),
      summary: toJson(record.summary),
      raw_logs: toJson(record.raw_logs),
      total_calls: totalCalls,
      success_rate: totalCalls > 0 ? successCalls / totalCalls : 0,
      avg_latency_ms: record.final_score.avg_latency_ms ?? deriveEvaluationAvgLatencyMs(record.summary),
      timeout_rate: totalCalls > 0 ? timeoutCalls / totalCalls : 0,
    });

  const row = getSqliteClient()
    .prepare('SELECT * FROM evaluation_records WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as Row;

  return normalizeEvaluationRecord(row);
}

export async function getLatestEvaluationByModel(modelId: number): Promise<EvaluationRecord | null> {
  const row = getSqliteClient()
    .prepare('SELECT * FROM evaluation_records WHERE model_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .get(modelId) as Row | undefined;

  return row ? normalizeEvaluationRecord(row) : null;
}

export async function getLatestEvaluationsByModels(): Promise<Map<number, EvaluationRecord>> {
  const rows = getSqliteClient()
    .prepare(`
      SELECT er.*
      FROM evaluation_records er
      INNER JOIN (
        SELECT model_id, MAX(id) AS id
        FROM evaluation_records
        GROUP BY model_id
      ) latest ON latest.id = er.id
    `)
    .all() as Row[];

  return new Map(rows.map(row => {
    const evaluation = normalizeEvaluationRecord(row);
    return [evaluation.model_id, evaluation];
  }));
}

/**
 * 获取模型的最新延迟记录
 */
export async function getLatestPingRecordByModel(modelId: number): Promise<PingRecord | null> {
  const row = getSqliteClient()
    .prepare('SELECT * FROM ping_records WHERE model_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .get(modelId) as Row | undefined;

  return row ? normalizePingRecord(row) : null;
}

/**
 * 获取模型的历史延迟记录
 */
export async function getPingRecordsHistory(
  modelId: number,
  limit: number = 100,
  offset: number = 0
): Promise<PingRecord[]> {
  const rows = getSqliteClient()
    .prepare('SELECT * FROM ping_records WHERE model_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
    .all(modelId, limit, offset) as Row[];

  return rows.map(normalizePingRecord);
}

/**
 * 获取模型的统计数据（最近N小时）
 */
export async function getModelStats(modelId: number, hours: number = 24): Promise<{
  avg_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  success_count: number;
  error_count: number;
  total_count: number;
  success_rate: number;
}> {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const records = getSqliteClient()
    .prepare(`
      SELECT latency_ms, status
      FROM ping_records
      WHERE model_id = ? AND created_at >= ?
      ORDER BY created_at DESC, id DESC
    `)
    .all(modelId, startTime) as Array<{ latency_ms: number | null; status: string }>;

  const successRecords = records.filter(r => r.status === 'success' && r.latency_ms !== null);
  const latencies = successRecords.map(r => r.latency_ms as number);

  return {
    avg_latency_ms: latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0,
    min_latency_ms: latencies.length > 0 ? Math.min(...latencies) : 0,
    max_latency_ms: latencies.length > 0 ? Math.max(...latencies) : 0,
    success_count: successRecords.length,
    error_count: records.filter(r => r.status !== 'success').length,
    total_count: records.length,
    success_rate: records.length > 0 ? (successRecords.length / records.length) * 100 : 0,
  };
}

/**
 * 获取所有模型的状态概览
 */
export async function getAllModelsStatus(hours: number = 24): Promise<Array<{
  model: Model;
  platform: Platform;
  latest: PingRecord | null;
  evaluation: EvaluationRecord | null;
  stats: {
    avg_latency_ms: number;
    min_latency_ms: number;
    max_latency_ms: number;
    success_count: number;
    error_count: number;
    total_count: number;
    success_rate: number;
  };
}>> {
  const modelsWithPlatforms = await getAllModelsWithPlatforms();
  const evaluations = await getLatestEvaluationsByModels();

  const results = await Promise.all(
    modelsWithPlatforms.map(async (model) => {
      const [latest, stats] = await Promise.all([
        getLatestPingRecordByModel(model.id),
        getModelStats(model.id, hours),
      ]);
      return {
        model,
        platform: model.platform,
        latest,
        evaluation: evaluations.get(model.id) ?? null,
        stats,
      };
    })
  );

  return results;
}

/**
 * 清理旧记录（保留最近N天的数据）
 */
export async function cleanupOldRecords(daysToKeep: number = 7): Promise<number> {
  const cutoffTime = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
  const database = getSqliteClient();
  const countRow = database
    .prepare('SELECT COUNT(*) AS count FROM ping_records WHERE created_at < ?')
    .get(cutoffTime) as { count: number };

  database
    .prepare('DELETE FROM ping_records WHERE created_at < ?')
    .run(cutoffTime);

  return countRow.count;
}
