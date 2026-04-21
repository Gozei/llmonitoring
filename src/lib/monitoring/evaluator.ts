import vm from 'node:vm';
import type {
  EvaluationCaseSummary,
  EvaluationMetric,
  EvaluationScore,
  Model,
  Platform,
} from '@/storage/database/shared/schema';
import {
  buildProtocolHeaders,
  buildProtocolPayload,
  extractProtocolModel,
  extractProtocolStreamText,
  extractProtocolText,
  resolveProtocolEndpoint,
  resolveProviderProtocol,
} from './protocols';

type EvaluationRun = {
  case: string;
  ok: boolean;
  http_status: number | null;
  elapsed_seconds: number | null;
  ttft_seconds: number | null;
  total_time_seconds: number | null;
  timed_out: boolean;
  request_exception: string | null;
  response_model: string | null;
  content: string;
  usage: unknown;
  raw_text: string;
  error: string | null;
};

export type ModelEvaluationReport = {
  target: {
    url: string;
    declared_model: string;
    generated_at_epoch: number;
  };
  summary: EvaluationCaseSummary[];
  final_score: EvaluationScore;
  raw_logs: Record<string, EvaluationRun[]>;
};

type JsonObject = Record<string, unknown>;

type IdentityPayload = {
  self_model: string;
  knowledge_cutoff: string;
  supports_function_call: boolean;
};

type JsonCheckPayload = {
  ok: true;
  msg: 'success';
  skills: ['latency', 'stability'];
};

type CodePayload = {
  language: 'javascript';
  function_name: 'topKFrequent';
  solution: string;
  time_complexity: string;
};

type CaseEvaluation = {
  score: number;
  metrics: EvaluationMetric[];
};

type LatencyMetric = 'latency' | 'total_time';

type TestCaseConfig = {
  name: string;
  input: string;
  repeat: number;
  timeout: number;
  stream: boolean;
  latency_metric: LatencyMetric;
  latency_target: number;
  latency_bad: number;
  max_penalty: number;
};

function preview(text: string, limit = 180): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, limit);
}

const TEST_CASES: TestCaseConfig[] = [
  {
    name: 'connectivity_check',
    input: '你好，请只回复：接口已连通',
    repeat: 2,
    timeout: 30,
    stream: false,
    latency_metric: 'latency',
    latency_target: 2,
    latency_bad: 10,
    max_penalty: 2,
  },
  {
    name: 'identity_check',
    input:
      '请严格只输出 JSON，不要输出 Markdown、代码块或解释。' +
      '字段必须完整且类型正确：' +
      '{"self_model":"你的模型名","knowledge_cutoff":"你的知识截止时间","supports_function_call":true}',
    repeat: 3,
    timeout: 30,
    stream: false,
    latency_metric: 'latency',
    latency_target: 3,
    latency_bad: 15,
    max_penalty: 3,
  },
  {
    name: 'json_check',
    input:
      '请严格只输出 JSON，不要输出任何解释、Markdown 或代码块。' +
      '键和值必须完全一致：{"ok":true,"msg":"success","skills":["latency","stability"]}',
    repeat: 3,
    timeout: 30,
    stream: false,
    latency_metric: 'latency',
    latency_target: 3,
    latency_bad: 15,
    max_penalty: 3,
  },
  {
    name: 'code_check',
    input:
      '请严格只输出 JSON，不要输出 Markdown 或解释。' +
      '请返回一个可直接执行的 JavaScript 解答，函数名必须是 topKFrequent，' +
      '输入整数数组，返回出现频率前 2 高的元素，空数组返回 []。' +
      '输出格式必须是：' +
      '{"language":"javascript","function_name":"topKFrequent","solution":"function topKFrequent(nums) { return []; }","time_complexity":"O(n log n)"}',
    repeat: 2,
    timeout: 60,
    stream: false,
    latency_metric: 'latency',
    latency_target: 5,
    latency_bad: 25,
    max_penalty: 4,
  },
  {
    name: 'reasoning_check',
    input:
      '请设计一个分布式任务调度系统，要求支持：幂等、重试、优先级队列、' +
      '延迟任务、失败告警。请给出：1. 架构设计 2. 核心表结构 3. 调度流程 4. 伪代码。',
    repeat: 2,
    timeout: 180,
    stream: true,
    latency_metric: 'total_time',
    latency_target: 20,
    latency_bad: 90,
    max_penalty: 5,
  },
  {
    name: 'consistency_check',
    input: '请用 200 字左右解释 CAP 定理，并举一个电商例子。',
    repeat: 5,
    timeout: 45,
    stream: false,
    latency_metric: 'latency',
    latency_target: 3,
    latency_bad: 15,
    max_penalty: 3,
  },
];

const TEST_CASE_ORDER = TEST_CASES.map(item => item.name);
const TEST_CASE_MAP = new Map(TEST_CASES.map(item => [item.name, item]));

const STRICT_JSON_EXPECTED: JsonCheckPayload = {
  ok: true,
  msg: 'success',
  skills: ['latency', 'stability'],
};

const REASONING_REQUIREMENTS = [
  ['幂等', 'idempotent', 'idempotency'],
  ['重试', 'retry', 'backoff'],
  ['优先级', 'priority'],
  ['延迟任务', 'delay', 'scheduled', 'schedule'],
  ['告警', '报警', 'alert', 'alarm', 'notification'],
];

const REASONING_STRUCTURE = [
  ['架构设计', '架构', 'architecture'],
  ['表结构', 'schema', 'table'],
  ['调度流程', '流程', 'flow'],
  ['伪代码', 'pseudocode'],
];

const CAP_CONCEPT_GROUPS = [
  ['一致性', 'consistency'],
  ['可用性', 'availability'],
  ['分区容错', 'partition tolerance', 'partition'],
  ['电商', '订单', '库存', '购物车', 'e-commerce'],
];

const CODE_TEST_CASES = [
  { input: [], expected: [] },
  { input: [1, 1, 1, 2, 2, 3], expected: [1, 2] },
  { input: [5, 5, 5, 5, 2, 2, 2, 3, 3, 1], expected: [5, 2] },
  { input: [9, 9, 8, 8, 8, 7, 7, 7, 7, 6], expected: [7, 8] },
] as const;

function safeJsonParse(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function populationStddev(values: number[]): number {
  const avg = mean(values);
  const variance = mean(values.map(value => (value - avg) ** 2));
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  return Number(value.toFixed(digits));
}

function toScore(value: number): number {
  return Math.round(clamp(value, 0, 1) * 100);
}

function toPercent(value: number): string {
  return `${toScore(value)}%`;
}

function createMetric(key: string, label: string, value: number, display?: string): EvaluationMetric {
  return {
    key,
    label,
    value: toScore(value),
    display: display ?? toPercent(value),
  };
}

function getTestCaseConfig(caseName: string): TestCaseConfig {
  const config = TEST_CASE_MAP.get(caseName);
  if (!config) {
    throw new Error(`unknown evaluation case: ${caseName}`);
  }

  return config;
}

function getEffectiveRunLatency(run: EvaluationRun, config: TestCaseConfig): number {
  const observed = config.latency_metric === 'total_time'
    ? run.total_time_seconds
    : run.elapsed_seconds;

  if (run.ok && run.content && typeof observed === 'number') {
    return observed;
  }

  return config.timeout;
}

function getCaseLatencySeconds(summary: EvaluationCaseSummary): number {
  const config = getTestCaseConfig(summary.case);
  const observed = config.latency_metric === 'total_time'
    ? summary.avg_total_time_s
    : summary.avg_latency_s;

  return typeof observed === 'number' ? observed : config.timeout;
}

function parseJsonObject(text: string): JsonObject | null {
  const candidates = [
    text.trim(),
    text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as JsonObject;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function isBareJsonObjectText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}');
}

function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
}

function textMatches(a: string, b: string): boolean {
  const left = normalizeToken(a);
  const right = normalizeToken(b);
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function dominantRatio(values: Array<string | boolean>): number {
  if (values.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const value of values) {
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Math.max(...counts.values()) / values.length;
}

function calcConsistencyScore(texts: string[]): number {
  const valid = texts.map(text => text.trim()).filter(Boolean);
  if (valid.length <= 1) return 1;

  const lengths = valid.map(text => text.length);
  const avgLength = mean(lengths);
  if (avgLength === 0) return 0;

  return Number(Math.max(0, 1 - populationStddev(lengths) / avgLength).toFixed(3));
}

function calcResponseModelConsistency(runs: EvaluationRun[]): number {
  const validModels = runs
    .map(run => run.response_model?.trim())
    .filter((value): value is string => Boolean(value));

  if (validModels.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const model of validModels) {
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }

  const dominant = Math.max(...counts.values());
  const stability = dominant / validModels.length;
  const coverage = validModels.length / runs.length;

  return Number((stability * 0.7 + coverage * 0.3).toFixed(3));
}

function calcKeywordCoverage(texts: string[], keywordGroups: string[][]): number {
  if (texts.length === 0) return 0;

  const coverages = texts.map((text) => {
    const normalized = text.toLowerCase();
    const matched = keywordGroups.filter(group => group.some(keyword => normalized.includes(keyword))).length;
    return matched / keywordGroups.length;
  });

  return Number(mean(coverages).toFixed(3));
}

function calcConnectivityAccuracy(texts: string[]): number {
  if (texts.length === 0) return 0;

  const hits = texts.filter(text => text.replace(/\s+/g, '').includes('接口已连通')).length;
  return Number((hits / texts.length).toFixed(3));
}

function calcJsonValidityScore(texts: string[]): number {
  if (texts.length === 0) return 0;
  return Number((texts.filter(safeJsonParse).length / texts.length).toFixed(3));
}

function parseIdentityPayload(text: string): IdentityPayload | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;

  if (
    typeof parsed.self_model === 'string' &&
    parsed.self_model.trim() &&
    typeof parsed.knowledge_cutoff === 'string' &&
    parsed.knowledge_cutoff.trim() &&
    typeof parsed.supports_function_call === 'boolean'
  ) {
    return {
      self_model: parsed.self_model.trim(),
      knowledge_cutoff: parsed.knowledge_cutoff.trim(),
      supports_function_call: parsed.supports_function_call,
    };
  }

  return null;
}

function parseJsonCheckPayload(text: string): JsonCheckPayload | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;

  if (
    parsed.ok === true &&
    parsed.msg === 'success' &&
    Array.isArray(parsed.skills) &&
    parsed.skills.length === 2 &&
    parsed.skills[0] === 'latency' &&
    parsed.skills[1] === 'stability'
  ) {
    return STRICT_JSON_EXPECTED;
  }

  return null;
}

function parseCodePayload(text: string): CodePayload | null {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;

  if (
    parsed.language === 'javascript' &&
    parsed.function_name === 'topKFrequent' &&
    typeof parsed.solution === 'string' &&
    parsed.solution.trim() &&
    typeof parsed.time_complexity === 'string' &&
    parsed.time_complexity.trim()
  ) {
    return {
      language: 'javascript',
      function_name: 'topKFrequent',
      solution: parsed.solution.trim(),
      time_complexity: parsed.time_complexity.trim(),
    };
  }

  return null;
}

function calcSchemaValidity<T>(texts: string[], parser: (text: string) => T | null): number {
  if (texts.length === 0) return 0;
  return Number((texts.filter(text => Boolean(parser(text))).length / texts.length).toFixed(3));
}

function calcIdentitySelfConsistency(payloads: IdentityPayload[]): number {
  if (payloads.length === 0) return 0;

  const modelStability = dominantRatio(payloads.map(item => item.self_model));
  const cutoffStability = dominantRatio(payloads.map(item => item.knowledge_cutoff));
  const toolStability = dominantRatio(payloads.map(item => item.supports_function_call));

  return Number(((modelStability * 0.4) + (cutoffStability * 0.35) + (toolStability * 0.25)).toFixed(3));
}

function calcIdentityAlignment(payloads: IdentityPayload[], runs: EvaluationRun[]): number {
  const successfulRuns = runs.filter(run => run.ok && run.content);
  if (payloads.length === 0 || successfulRuns.length === 0) return 0;

  const aligned = successfulRuns.reduce((count, run, index) => {
    const payload = payloads[index];
    if (!payload || !run.response_model) return count;
    return count + (textMatches(payload.self_model, run.response_model) ? 1 : 0);
  }, 0);

  return Number((aligned / successfulRuns.length).toFixed(3));
}

function deepEqualJson(left: JsonObject, right: JsonObject): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function calcExactJsonMatchRate(texts: string[]): number {
  if (texts.length === 0) return 0;

  const matches = texts.filter((text) => {
    if (!isBareJsonObjectText(text)) return false;
    const parsed = parseJsonObject(text);
    return parsed ? deepEqualJson(parsed, STRICT_JSON_EXPECTED) : false;
  }).length;

  return Number((matches / texts.length).toFixed(3));
}

function cloneArray(values: readonly number[]): number[] {
  return values.map(value => value);
}

function isExpectedTopK(output: unknown, expected: readonly number[]): boolean {
  if (!Array.isArray(output) || output.length !== expected.length) return false;
  return output.every((value, index) => Number(value) === expected[index]);
}

function runJavaScriptSolution(code: string): { passRate: number; passed: number; total: number; error: string | null } {
  if (!code.trim()) {
    return { passRate: 0, passed: 0, total: CODE_TEST_CASES.length, error: 'solution is empty' };
  }

  if (code.length > 8000) {
    return { passRate: 0, passed: 0, total: CODE_TEST_CASES.length, error: 'solution is too long' };
  }

  try {
    const context = vm.createContext({
      Math,
      JSON,
      Map,
      Set,
      Array,
      Object,
      Number,
      String,
      Boolean,
    });

    new vm.Script(
      `"use strict";\n${code}\nif (typeof topKFrequent !== "function") { throw new Error("topKFrequent is not defined"); }`
    ).runInContext(context, { timeout: 800 });

    let passed = 0;
    for (const testCase of CODE_TEST_CASES) {
      (context as Record<string, unknown>).__input = cloneArray(testCase.input);
      const output = new vm.Script('topKFrequent(__input)').runInContext(context, { timeout: 800 });
      if (isExpectedTopK(output, testCase.expected)) {
        passed += 1;
      }
    }

    return {
      passRate: Number((passed / CODE_TEST_CASES.length).toFixed(3)),
      passed,
      total: CODE_TEST_CASES.length,
      error: null,
    };
  } catch (error) {
    return {
      passRate: 0,
      passed: 0,
      total: CODE_TEST_CASES.length,
      error: error instanceof Error ? error.message : 'execution failed',
    };
  }
}

function calcCodeExecutionScore(texts: string[]): { ratio: number; detail: string } {
  if (texts.length === 0) return { ratio: 0, detail: '0/0' };

  let passed = 0;
  let total = 0;

  for (const text of texts) {
    const payload = parseCodePayload(text);
    const result = payload
      ? runJavaScriptSolution(payload.solution)
      : { passRate: 0, passed: 0, total: CODE_TEST_CASES.length, error: 'invalid schema' };

    passed += result.passed;
    total += result.total;
  }

  return {
    ratio: total > 0 ? Number((passed / total).toFixed(3)) : 0,
    detail: `${passed}/${total}`,
  };
}

function calcComplexityMentionRate(texts: string[]): number {
  const payloads = texts.map(parseCodePayload).filter((value): value is CodePayload => Boolean(value));
  if (payloads.length === 0) return 0;

  const valid = payloads.filter(payload => /O\([^)]+\)/i.test(payload.time_complexity)).length;
  return Number((valid / payloads.length).toFixed(3));
}

function calcReasoningDepthScore(texts: string[]): number {
  if (texts.length === 0) return 0;

  const scores = texts.map(text => clamp((text.trim().length - 280) / 420, 0, 1));
  return Number(mean(scores).toFixed(3));
}

function calcConsistencyConceptCoverage(texts: string[]): number {
  return calcKeywordCoverage(texts, CAP_CONCEPT_GROUPS);
}

function evaluateConnectivityCase(texts: string[], successRate: number): CaseEvaluation {
  const accuracy = calcConnectivityAccuracy(texts);
  return {
    score: toScore(successRate * 0.65 + accuracy * 0.35),
    metrics: [
      createMetric('success_rate', '成功率', successRate),
      createMetric('instruction_match', '指令命中', accuracy),
    ],
  };
}

function evaluateIdentityCase(runs: EvaluationRun[], texts: string[], successRate: number): CaseEvaluation {
  const payloads = texts.map(parseIdentityPayload).filter((value): value is IdentityPayload => Boolean(value));
  const schemaValidity = calcSchemaValidity(texts, parseIdentityPayload);
  const selfConsistency = calcIdentitySelfConsistency(payloads);
  const responseConsistency = calcResponseModelConsistency(runs);
  const alignment = calcIdentityAlignment(payloads, runs);

  return {
    score: toScore(
      successRate * 0.2 +
      schemaValidity * 0.25 +
      selfConsistency * 0.25 +
      responseConsistency * 0.15 +
      alignment * 0.15
    ),
    metrics: [
      createMetric('success_rate', '成功率', successRate),
      createMetric('schema_validity', '结构合法', schemaValidity),
      createMetric('self_consistency', '自报一致', selfConsistency),
      createMetric('response_consistency', '返回模型稳定', responseConsistency),
      createMetric('model_alignment', '自报与返回对齐', alignment),
    ],
  };
}

function evaluateJsonCase(texts: string[], successRate: number): CaseEvaluation {
  const validJson = calcJsonValidityScore(texts);
  const schemaValidity = calcSchemaValidity(texts, parseJsonCheckPayload);
  const exactMatch = calcExactJsonMatchRate(texts);

  return {
    score: toScore(successRate * 0.2 + validJson * 0.15 + schemaValidity * 0.3 + exactMatch * 0.35),
    metrics: [
      createMetric('success_rate', '成功率', successRate),
      createMetric('valid_json', '可解析 JSON', validJson),
      createMetric('schema_validity', '结构命中', schemaValidity),
      createMetric('exact_match', '值完全一致', exactMatch),
    ],
  };
}

function evaluateCodeCase(texts: string[], successRate: number): CaseEvaluation {
  const schemaValidity = calcSchemaValidity(texts, parseCodePayload);
  const execution = calcCodeExecutionScore(texts);
  const complexity = calcComplexityMentionRate(texts);

  return {
    score: toScore(successRate * 0.15 + schemaValidity * 0.2 + execution.ratio * 0.5 + complexity * 0.15),
    metrics: [
      createMetric('success_rate', '成功率', successRate),
      createMetric('schema_validity', '结构合法', schemaValidity),
      createMetric('execution_pass', '隐藏用例通过', execution.ratio, execution.detail),
      createMetric('complexity', '复杂度声明', complexity),
    ],
  };
}

function evaluateReasoningCase(texts: string[], successRate: number): CaseEvaluation {
  const requirementCoverage = calcKeywordCoverage(texts, REASONING_REQUIREMENTS);
  const structureCoverage = calcKeywordCoverage(texts, REASONING_STRUCTURE);
  const depth = calcReasoningDepthScore(texts);

  return {
    score: toScore(successRate * 0.2 + requirementCoverage * 0.45 + structureCoverage * 0.2 + depth * 0.15),
    metrics: [
      createMetric('success_rate', '成功率', successRate),
      createMetric('requirement_coverage', '需求覆盖', requirementCoverage),
      createMetric('structure_coverage', '结构完整', structureCoverage),
      createMetric('depth', '回答深度', depth),
    ],
  };
}

function evaluateConsistencyCase(texts: string[], successRate: number): CaseEvaluation {
  const lengthConsistency = calcConsistencyScore(texts);
  const conceptCoverage = calcConsistencyConceptCoverage(texts);

  return {
    score: toScore(successRate * 0.3 + lengthConsistency * 0.4 + conceptCoverage * 0.3),
    metrics: [
      createMetric('success_rate', '成功率', successRate),
      createMetric('length_consistency', '长度稳定', lengthConsistency),
      createMetric('concept_coverage', '概念覆盖', conceptCoverage),
    ],
  };
}

function evaluateCase(caseName: string, runs: EvaluationRun[], texts: string[], successRate: number): CaseEvaluation {
  switch (caseName) {
    case 'connectivity_check':
      return evaluateConnectivityCase(texts, successRate);
    case 'identity_check':
      return evaluateIdentityCase(runs, texts, successRate);
    case 'json_check':
      return evaluateJsonCase(texts, successRate);
    case 'code_check':
      return evaluateCodeCase(texts, successRate);
    case 'reasoning_check':
      return evaluateReasoningCase(texts, successRate);
    case 'consistency_check':
      return evaluateConsistencyCase(texts, successRate);
    default:
      return {
        score: toScore(successRate),
        metrics: [createMetric('success_rate', '成功率', successRate)],
      };
  }
}

function resolveEvaluationUrl(platform: Platform, model: Model): string {
  return resolveProtocolEndpoint(
    platform.api_endpoint,
    resolveProviderProtocol(model.config as Record<string, unknown> | undefined)
  );
}

function resolvePayload(
  platform: Platform,
  model: Model,
  input: string,
  stream: boolean
): Record<string, unknown> {
  return buildProtocolPayload({
    protocol: resolveProviderProtocol(model.config as Record<string, unknown> | undefined),
    modelId: model.model_id,
    input,
    stream,
    extraParams: model.config?.extra_params as Record<string, unknown> | undefined,
  });
}

async function parseStreamingResponse(
  response: Response,
  startedAtMs: number
): Promise<{
  rawText: string;
  content: string;
  responseModel: string | null;
  ttftSeconds: number | null;
  totalTimeSeconds: number;
  usage: unknown;
}> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let rawText = '';
  let content = '';
  let responseModel: string | null = null;
  let ttftSeconds: number | null = null;
  let usage: unknown = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    rawText += chunk;
    buffer += chunk;

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        responseModel = responseModel ?? extractProtocolModel(parsed);
        usage = parsed.usage ?? usage;
        const chunkText = extractProtocolStreamText(parsed);
        if (chunkText && ttftSeconds == null) {
          ttftSeconds = Number(((Date.now() - startedAtMs) / 1000).toFixed(3));
        }
        content += chunkText;
      } catch {
        // Ignore malformed SSE frames from upstream and keep collecting.
      }
    }
  }

  return {
    rawText,
    content: content.trim(),
    responseModel,
    ttftSeconds,
    totalTimeSeconds: Number(((Date.now() - startedAtMs) / 1000).toFixed(3)),
    usage,
  };
}

async function callModel(
  platform: Platform,
  model: Model,
  caseName: string,
  promptText: string,
  timeoutSeconds: number,
  stream: boolean
): Promise<EvaluationRun> {
  const url = resolveEvaluationUrl(platform, model);
  const headers = buildProtocolHeaders({
    protocol: resolveProviderProtocol(model.config as Record<string, unknown> | undefined),
    apiKey: platform.api_key,
    extraHeaders: platform.config?.extra_headers as Record<string, unknown> | undefined,
    anthropicVersion: platform.config?.anthropic_version as string | undefined,
  });

  const startedAt = Date.now();
  const result: EvaluationRun = {
    case: caseName,
    ok: false,
    http_status: null,
    elapsed_seconds: null,
    ttft_seconds: null,
    total_time_seconds: null,
    timed_out: false,
    request_exception: null,
    response_model: null,
    content: '',
    usage: null,
    raw_text: '',
    error: null,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(resolvePayload(platform, model, promptText, stream)),
      signal: controller.signal,
    });

    result.elapsed_seconds = Number(((Date.now() - startedAt) / 1000).toFixed(3));
    result.http_status = response.status;
    result.ok = response.ok;

    if (stream) {
      const streamResult = await parseStreamingResponse(response, startedAt);
      result.raw_text = streamResult.rawText;
      result.response_model = streamResult.responseModel;
      result.content = streamResult.content;
      result.ttft_seconds = streamResult.ttftSeconds;
      result.total_time_seconds = streamResult.totalTimeSeconds;
      result.usage = streamResult.usage;
    } else {
      result.raw_text = await response.text();

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(result.raw_text) as Record<string, unknown>;
      } catch {
        result.error = 'response is not valid json';
        return result;
      }

        result.response_model = extractProtocolModel(data);
        result.content = extractProtocolText(data);
      result.total_time_seconds = result.elapsed_seconds;
      result.usage = data.usage ?? null;
    }

    if (!result.content && response.ok) {
      result.error = 'response parsed but no text content found';
    }

    return result;
  } catch (error) {
    result.elapsed_seconds = Number(((Date.now() - startedAt) / 1000).toFixed(3));
    if (error instanceof Error && error.name === 'AbortError') {
      result.timed_out = true;
      result.request_exception = `AbortError: request exceeded ${timeoutSeconds}s`;
      result.error = 'request timed out';
      return result;
    }

    result.request_exception = error instanceof Error
      ? `${error.name}: ${error.message}`
      : 'Unknown request error';
    result.error = 'request failed';
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeCase(caseName: string, runs: EvaluationRun[]): EvaluationCaseSummary {
  const config = getTestCaseConfig(caseName);
  const successRuns = runs.filter(run => run.ok && run.content);
  const timeoutRuns = runs.filter(run => run.timed_out);
  const failedRuns = runs.filter(run => !run.ok || run.error || run.request_exception);
  const effectiveLatencies = runs.map(run => getEffectiveRunLatency(run, config));
  const ttft = runs
    .map(run => run.ttft_seconds)
    .filter((value): value is number => typeof value === 'number');
  const texts = successRuns.map(run => run.content).filter(Boolean);
  const responseModels = Array.from(new Set(
    runs
      .map(run => run.response_model)
      .filter((value): value is string => Boolean(value))
  )).sort();
  const successRate = runs.length > 0 ? Number((successRuns.length / runs.length).toFixed(3)) : 0;
  const timeoutRate = runs.length > 0 ? Number((timeoutRuns.length / runs.length).toFixed(3)) : 0;
  const caseEvaluation = evaluateCase(caseName, runs, texts, successRate);

  const summary: EvaluationCaseSummary = {
    case: caseName,
    score: caseEvaluation.score,
    metrics: caseEvaluation.metrics,
    calls: runs.length,
    success_calls: successRuns.length,
    failed_calls: failedRuns.length,
    timeout_calls: timeoutRuns.length,
    success_rate: successRate,
    timeout_rate: timeoutRate,
    avg_latency_s: effectiveLatencies.length > 0 ? roundTo(mean(effectiveLatencies), 3) : null,
    avg_ttft_s: ttft.length > 0 ? Number(mean(ttft).toFixed(3)) : null,
    avg_total_time_s: config.latency_metric === 'total_time' && effectiveLatencies.length > 0
      ? roundTo(mean(effectiveLatencies), 3)
      : null,
    min_latency_s: effectiveLatencies.length > 0 ? roundTo(Math.min(...effectiveLatencies), 3) : null,
    max_latency_s: effectiveLatencies.length > 0 ? roundTo(Math.max(...effectiveLatencies), 3) : null,
    response_models: responseModels,
    consistency_score: calcConsistencyScore(texts),
    samples: texts.slice(0, 2),
    exceptions: runs
      .map(run => run.request_exception)
      .filter((value): value is string => Boolean(value))
      .slice(0, 3),
  };

  if (caseName === 'json_check') {
    summary.all_valid_json = texts.length > 0 && texts.every(safeJsonParse);
  }

  return summary;
}

function scoreModel(report: EvaluationCaseSummary[]): EvaluationScore {
  const notes: string[] = [];
  const risks: string[] = [];
  const byCase = new Map(report.map(item => [item.case, item]));
  const totalCalls = report.reduce((sum, item) => sum + item.calls, 0);
  const totalSuccessCalls = report.reduce((sum, item) => sum + item.success_calls, 0);
  const overallSuccessRate = totalCalls > 0 ? totalSuccessCalls / totalCalls : 0;
  const evaluationComplete = TEST_CASE_ORDER.every(caseName => byCase.has(caseName));
  const rawScore = TEST_CASE_ORDER.length > 0
    ? Math.round(mean(TEST_CASE_ORDER.map(caseName => byCase.get(caseName)?.score ?? 0)))
    : 0;
  const avgLatencyMs = TEST_CASE_ORDER.length > 0
    ? Math.round(mean(TEST_CASE_ORDER.map(caseName => {
      const summary = byCase.get(caseName);
      return summary ? getCaseLatencySeconds(summary) * 1000 : getTestCaseConfig(caseName).timeout * 1000;
    })))
    : null;
  const latencyPenalty = roundTo(TEST_CASE_ORDER.reduce((sum, caseName) => {
    const config = getTestCaseConfig(caseName);
    const summary = byCase.get(caseName);
    const latency = summary ? getCaseLatencySeconds(summary) : config.timeout;
    const penaltyRatio = clamp(
      (latency - config.latency_target) / Math.max(config.latency_bad - config.latency_target, 0.001),
      0,
      1
    );

    return sum + penaltyRatio * config.max_penalty;
  }, 0), 1);
  const latencyAdjustedScore = clamp(rawScore - latencyPenalty, 0, 100);
  const score = Math.round(latencyAdjustedScore * overallSuccessRate);

  if (evaluationComplete) {
    notes.push(`6 维能力均分 ${rawScore}`);
  } else {
    risks.push('评估不完整，已按缺失维度 0 分和超时口径处理');
  }

  if (latencyPenalty <= 3) {
    notes.push(`延迟惩罚较低（-${latencyPenalty}）`);
  } else if (latencyPenalty <= 8) {
    risks.push(`延迟惩罚中等（-${latencyPenalty}）`);
  } else {
    risks.push(`延迟惩罚偏高（-${latencyPenalty}）`);
  }

  if (overallSuccessRate >= 0.98) {
    notes.push(`整体调用成功率 ${(overallSuccessRate * 100).toFixed(1)}%，成功率惩罚很低`);
  } else {
    risks.push(`总分已乘整体调用成功率 ${(overallSuccessRate * 100).toFixed(1)}%`);
  }

  if (avgLatencyMs != null) {
    const avgLatencySeconds = roundTo(avgLatencyMs / 1000, 1);
    if (avgLatencySeconds <= 6) {
      notes.push(`6 维均值耗时 ${avgLatencySeconds}s`);
    } else if (avgLatencySeconds >= 15) {
      risks.push(`6 维均值耗时偏高（${avgLatencySeconds}s）`);
    }
  }
  if (overallSuccessRate < 0.9) {
    risks.push(`模型整体调用成功率不足 90%（当前 ${(overallSuccessRate * 100).toFixed(1)}%）`);
  }

  const conn = byCase.get('connectivity_check');
  const identity = byCase.get('identity_check');
  const jsonCase = byCase.get('json_check');
  const codeCase = byCase.get('code_check');
  const reasoning = byCase.get('reasoning_check');
  const consistency = byCase.get('consistency_check');

  if (conn && conn.score >= 85) {
    notes.push('基础连通性稳定');
  } else if (conn && conn.score >= 60) {
    risks.push('基础连通性一般');
  } else {
    risks.push('基础连通性较差');
  }

  if (identity) {
    if (identity.score >= 85) {
      notes.push('身份信息返回较稳定');
    } else if (identity.score < 60) {
      risks.push('身份一致性较弱');
    }

    if (identity.response_models.length === 1) {
      notes.push(`返回 model 字段固定：${identity.response_models[0]}`);
    } else {
      risks.push('返回 model 字段不稳定或缺失');
    }
  }

  if (jsonCase) {
    if (jsonCase.score >= 85) {
      notes.push('JSON 严格输出能力较好');
    } else if (jsonCase.score < 60) {
      risks.push('JSON 严格输出不稳定');
    }
  }

  if (codeCase) {
    if (codeCase.score >= 85) {
      notes.push('代码能力测试通过');
    } else if (codeCase.score < 60) {
      risks.push('代码结果验真偏弱');
    }
  }

  if (reasoning) {
    if (reasoning.score >= 85) {
      notes.push('长推理测试通过');
    } else if (reasoning.score < 60) {
      risks.push('长推理覆盖不足或不稳定');
    }

    if (typeof reasoning.avg_total_time_s === 'number' && reasoning.avg_total_time_s > 60) {
      notes.push('长推理耗时较高，像较重模型或较长网关链路');
    }
  }

  if (consistency) {
    if (consistency.score >= 85) {
      notes.push('同题稳定性较好');
    } else if (consistency.score >= 60) {
      risks.push('同题稳定性一般');
    } else {
      risks.push('同题稳定性较差');
    }
  }

  let level = '不太建议直接用于重要业务';
  if (score >= 80) level = '好模型 / 服务质量较好';
  else if (score >= 60) level = '中上，可用但还需要看稳定性';
  else if (score >= 40) level = '一般，能力可能还行但服务不稳';

  return {
    score,
    raw_score: rawScore,
    latency_penalty: latencyPenalty,
    evaluation_complete: evaluationComplete,
    avg_latency_ms: avgLatencyMs,
    level,
    notes,
    risks,
  };
}

export async function evaluateModel(
  platform: Platform,
  model: Model
): Promise<ModelEvaluationReport> {
  const startedAt = Date.now();
  const allSummaries: EvaluationCaseSummary[] = [];
  const rawLogs: Record<string, EvaluationRun[]> = {};

  console.log(
    `[evaluation] start platform="${platform.name}" model="${model.name}" model_id="${model.model_id}" endpoint="${resolveEvaluationUrl(platform, model)}"`
  );

  for (const testCase of TEST_CASES) {
    const runs: EvaluationRun[] = [];
    console.log(
      `[evaluation] case:start case="${testCase.name}" repeat=${testCase.repeat} timeout=${testCase.timeout}s`
    );
    for (let index = 0; index < testCase.repeat; index += 1) {
      const result = await callModel(
        platform,
        model,
        testCase.name,
        testCase.input,
        testCase.timeout,
        testCase.stream
      );
      runs.push(result);

      console.log(
        `[evaluation] case:run case="${testCase.name}" run=${index + 1}/${testCase.repeat} status=${result.http_status ?? 'n/a'} ok=${result.ok} timeout=${result.timed_out} elapsed=${result.elapsed_seconds ?? 'n/a'}s response_model="${result.response_model ?? ''}"`
      );

      if (result.content) {
        console.log(`[evaluation] case:preview case="${testCase.name}" text="${preview(result.content)}"`);
      }

      if (result.error || result.request_exception) {
        console.log(
          `[evaluation] case:error case="${testCase.name}" error="${result.error ?? ''}" exception="${result.request_exception ?? ''}"`
        );
      }

      if (index < testCase.repeat - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    rawLogs[testCase.name] = runs;
    const caseSummary = summarizeCase(testCase.name, runs);
    allSummaries.push(caseSummary);

    console.log(
      `[evaluation] case:summary case="${caseSummary.case}" success_rate=${caseSummary.success_rate} timeout_rate=${caseSummary.timeout_rate} avg_latency_s=${caseSummary.avg_latency_s ?? 'n/a'} avg_ttft_s=${caseSummary.avg_ttft_s ?? 'n/a'} avg_total_time_s=${caseSummary.avg_total_time_s ?? 'n/a'} consistency=${caseSummary.consistency_score}`
    );

    if (caseSummary.samples.length > 0) {
      console.log(
        `[evaluation] case:samples case="${caseSummary.case}" samples=${JSON.stringify(caseSummary.samples.map(item => preview(item, 120)))}`
      );
    }

    if (caseSummary.exceptions.length > 0) {
      console.log(
        `[evaluation] case:exceptions case="${caseSummary.case}" exceptions=${JSON.stringify(caseSummary.exceptions)}`
      );
    }
  }

  const finalScore = scoreModel(allSummaries);
  console.log(
    `[evaluation] done platform="${platform.name}" model="${model.name}" raw_score=${finalScore.raw_score} latency_penalty=${finalScore.latency_penalty} score=${finalScore.score} avg_latency_ms=${finalScore.avg_latency_ms ?? 'n/a'} level="${finalScore.level}" duration_ms=${Date.now() - startedAt}`
  );
  console.log(`[evaluation] notes ${JSON.stringify(finalScore.notes)}`);
  console.log(`[evaluation] risks ${JSON.stringify(finalScore.risks)}`);

  return {
    target: {
      url: resolveEvaluationUrl(platform, model),
      declared_model: model.model_id,
      generated_at_epoch: Math.floor(Date.now() / 1000),
    },
    summary: allSummaries,
    final_score: finalScore,
    raw_logs: rawLogs,
  };
}
