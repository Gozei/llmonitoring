export type ProviderProtocol = 'openai' | 'anthropic';

export const DEFAULT_PROVIDER_PROTOCOL: ProviderProtocol = 'openai';

export const PROTOCOL_TEMPLATES: Array<{
  protocol: ProviderProtocol;
  title: string;
  description: string;
}> = [
  {
    protocol: 'openai',
    title: 'OpenAI 协议',
    description: '自动拼接到 /v1/chat/completions，适合绝大多数 OpenAI 兼容服务。',
  },
  {
    protocol: 'anthropic',
    title: 'Anthropic 协议',
    description: '自动拼接到 /v1/messages，适合 Anthropic Messages 兼容服务。',
  },
];

const KNOWN_SUFFIXES = [
  '/v1/chat/completions',
  '/chat/completions',
  '/v1/messages',
  '/messages',
  '/v1/responses',
  '/responses',
];

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function stripKnownSuffixes(endpoint: string): string {
  let normalized = trimTrailingSlash(endpoint);

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of KNOWN_SUFFIXES) {
      if (normalized.toLowerCase().endsWith(suffix)) {
        normalized = normalized.slice(0, -suffix.length);
        normalized = trimTrailingSlash(normalized);
        changed = true;
      }
    }
  }

  return normalized;
}

function hasVersionSegment(endpoint: string): boolean {
  return /\/v\d+$/i.test(endpoint);
}

export function resolveProviderProtocol(config?: Record<string, unknown> | null): ProviderProtocol {
  return config?.protocol === 'anthropic' ? 'anthropic' : DEFAULT_PROVIDER_PROTOCOL;
}

export function withProviderProtocol(
  existingConfig: Record<string, unknown> | null | undefined,
  protocol: ProviderProtocol
): Record<string, unknown> {
  return {
    ...(existingConfig || {}),
    protocol,
  };
}

export function resolveProtocolEndpoint(endpoint: string, protocol: ProviderProtocol): string {
  const root = stripKnownSuffixes(endpoint);
  if (!root) return '';

  const versionedRoot = hasVersionSegment(root) ? root : `${root}/v1`;
  return protocol === 'anthropic'
    ? `${versionedRoot}/messages`
    : `${versionedRoot}/chat/completions`;
}

export function buildProtocolHeaders(options: {
  protocol: ProviderProtocol;
  apiKey?: string | null;
  extraHeaders?: Record<string, unknown> | null;
  anthropicVersion?: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (options.protocol === 'anthropic') {
    if (options.apiKey) headers['x-api-key'] = options.apiKey;
    headers['anthropic-version'] = options.anthropicVersion || '2023-06-01';
  } else if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  if (options.extraHeaders) {
    for (const [key, value] of Object.entries(options.extraHeaders)) {
      if (typeof value === 'string' && value) {
        headers[key] = value;
      }
    }
  }

  return headers;
}

export function buildProtocolPayload(options: {
  protocol: ProviderProtocol;
  modelId: string;
  input: string;
  stream: boolean;
  extraParams?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const extraParams = options.extraParams || {};

  if (options.protocol === 'anthropic') {
    return {
      model: options.modelId,
      messages: [{ role: 'user', content: options.input }],
      max_tokens: typeof extraParams.max_tokens === 'number' ? extraParams.max_tokens : 1024,
      stream: options.stream,
      ...extraParams,
    };
  }

  return {
    model: options.modelId,
    messages: [{ role: 'user', content: options.input }],
    stream: options.stream,
    ...extraParams,
  };
}

export function extractProtocolModel(data: Record<string, unknown>): string | null {
  if (typeof data.model === 'string' && data.model.trim()) return data.model.trim();

  const message = data.message;
  if (message && typeof message === 'object') {
    const model = (message as Record<string, unknown>).model;
    if (typeof model === 'string' && model.trim()) return model.trim();
  }

  return null;
}

export function extractProtocolText(data: Record<string, unknown>): string {
  const content = data.content;
  if (Array.isArray(content)) {
    const texts = content
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const row = item as Record<string, unknown>;
        return typeof row.text === 'string' ? row.text : '';
      })
      .filter(Boolean);

    if (texts.length > 0) return texts.join('\n').trim();
  }

  const output = data.output;
  if (Array.isArray(output)) {
    const texts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const rowContent = row.content;
      if (Array.isArray(rowContent)) {
        for (const part of rowContent) {
          if (part && typeof part === 'object') {
            const text = (part as Record<string, unknown>).text;
            if (typeof text === 'string') texts.push(text);
          }
        }
      }
      if (typeof row.text === 'string') texts.push(row.text);
    }
    if (texts.length > 0) return texts.join('\n').trim();
  }

  if (typeof data.output_text === 'string') return data.output_text.trim();

  const choices = data.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const message = first.message;
    if (message && typeof message === 'object') {
      const messageContent = (message as Record<string, unknown>).content;
      if (typeof messageContent === 'string') return messageContent.trim();
    }
  }

  return '';
}

export function extractProtocolStreamText(data: Record<string, unknown>): string {
  const delta = data.delta;
  if (delta && typeof delta === 'object') {
    const deltaRow = delta as Record<string, unknown>;
    if (typeof deltaRow.content === 'string') return deltaRow.content;
    if (typeof deltaRow.text === 'string') return deltaRow.text;
  }

  if (data.type === 'content_block_delta') {
    const contentDelta = data.delta;
    if (contentDelta && typeof contentDelta === 'object') {
      const text = (contentDelta as Record<string, unknown>).text;
      if (typeof text === 'string') return text;
    }
  }

  const choices = data.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const choiceDelta = first.delta;
    if (choiceDelta && typeof choiceDelta === 'object') {
      const content = (choiceDelta as Record<string, unknown>).content;
      if (typeof content === 'string') return content;
    }
  }

  return '';
}
