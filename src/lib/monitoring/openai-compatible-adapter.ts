/**
 * 通用 OpenAI 兼容 API 适配器
 * 支持所有使用 OpenAI Chat Completions API 格式的平台
 */

import {
  IPlatformAdapter,
  ModelConfig,
  PlatformConfig,
  PingResult,
  DEFAULT_TEST_MESSAGE,
  DEFAULT_TIMEOUT_MS,
} from './adapter';
import {
  buildProtocolHeaders,
  buildProtocolPayload,
  extractProtocolModel,
  extractProtocolStreamText,
  resolveProtocolEndpoint,
  resolveProviderProtocol,
} from './protocols';

export class OpenAICompatibleAdapter implements IPlatformAdapter {
  readonly slug = 'openai-compatible';
  readonly name = '通用 OpenAI 兼容接口';
  readonly defaultEndpoint = '';

  /**
   * 执行延迟测试
   */
  async ping(platformConfig: PlatformConfig, signal?: AbortSignal): Promise<PingResult[]> {
    const results: PingResult[] = [];

    for (const model of platformConfig.models) {
      const result = await this.pingModel(platformConfig, model, signal);
      results.push(result);
    }

    return results;
  }

  private async pingModel(
    platformConfig: PlatformConfig,
    model: ModelConfig,
    signal?: AbortSignal
  ): Promise<PingResult> {
    const startTime = Date.now();
    let ttft: number | null = null;
    const protocol = resolveProviderProtocol(model.config);
    const endpoint = resolveProtocolEndpoint(platformConfig.api_endpoint, protocol);

    try {
      const headers = buildProtocolHeaders({
        protocol,
        apiKey: platformConfig.api_key || (platformConfig.config?.api_key as string | undefined),
        extraHeaders: platformConfig.config?.extra_headers as Record<string, unknown> | undefined,
        anthropicVersion: platformConfig.config?.anthropic_version as string | undefined,
      });

      const requestBody = buildProtocolPayload({
        protocol,
        modelId: model.model_id,
        input: DEFAULT_TEST_MESSAGE,
        stream: true,
        extraParams: model.config?.extra_params as Record<string, unknown> | undefined,
      });

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        (platformConfig.config?.timeout as number) || DEFAULT_TIMEOUT_MS
      );

      const fetchSignal = signal || controller.signal;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: fetchSignal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          model_id: 0,
          platform_id: 0,
          latency_ms: Date.now() - startTime,
          ttft_ms: null,
          total_time_ms: Date.now() - startTime,
          status: 'error',
          error_message: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
          request_params: { url: endpoint, model: model.model_id, protocol },
        };
      }

      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        return {
          model_id: 0,
          platform_id: 0,
          latency_ms: Date.now() - startTime,
          ttft_ms: null,
          total_time_ms: Date.now() - startTime,
          status: 'error',
          error_message: 'Response body is not readable',
          request_params: { url: endpoint, model: model.model_id, protocol },
        };
      }

      const decoder = new TextDecoder();
      let firstTokenReceived = false;
      let content = '';
      let responseModel: string | null = null;
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          content += chunk;
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
              const chunkText = extractProtocolStreamText(parsed);
              if (!firstTokenReceived && chunkText) {
                ttft = Date.now() - startTime;
                firstTokenReceived = true;
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      } catch (streamError) {
        // 流处理中断，继续返回结果
      }

      return {
        model_id: 0,
        platform_id: 0,
        latency_ms: ttft || Date.now() - startTime,
        ttft_ms: ttft,
        total_time_ms: Date.now() - startTime,
        status: 'success',
        request_params: { url: endpoint, model: model.model_id, protocol },
        response_data: {
          content_length: content.length,
          response_model: responseModel,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // 判断是否为超时
      if (errorMessage.includes('abort')) {
        return {
          model_id: 0,
          platform_id: 0,
          latency_ms: Date.now() - startTime,
          ttft_ms: null,
          total_time_ms: Date.now() - startTime,
          status: 'timeout',
          error_message: 'Request timeout',
          request_params: { url: endpoint, model: model.model_id, protocol },
        };
      }

      return {
        model_id: 0,
        platform_id: 0,
        latency_ms: Date.now() - startTime,
        ttft_ms: null,
        total_time_ms: Date.now() - startTime,
        status: 'error',
        error_message: errorMessage,
        request_params: { url: endpoint, model: model.model_id, protocol },
      };
    }
  }
}
