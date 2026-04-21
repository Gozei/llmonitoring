/**
 * 通用 OpenAI 兼容 API 适配器
 * 支持所有使用 OpenAI Chat Completions API 格式的平台
 */

import {
  IPlatformAdapter,
  PlatformConfig,
  PingResult,
  DEFAULT_TEST_MESSAGE,
  DEFAULT_TIMEOUT_MS,
} from './adapter';

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
      const result = await this.pingModel(platformConfig, model.model_id, model.name, signal);
      results.push(result);
    }

    return results;
  }

  private async pingModel(
    platformConfig: PlatformConfig,
    modelId: string,
    modelName: string,
    signal?: AbortSignal
  ): Promise<PingResult> {
    const startTime = Date.now();
    let ttft: number | null = null;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // 支持多种认证方式
      if (platformConfig.api_key) {
        // Bearer Token
        headers['Authorization'] = `Bearer ${platformConfig.api_key}`;
      } else if (platformConfig.config?.api_key) {
        headers['Authorization'] = `Bearer ${platformConfig.config.api_key}`;
      }

      // 支持自定义认证头
      const authHeader = platformConfig.config?.auth_header as string;
      if (authHeader && platformConfig.api_key) {
        headers[authHeader] = platformConfig.api_key;
      }

      const requestBody: Record<string, unknown> = {
        model: modelId,
        messages: [{ role: 'user', content: DEFAULT_TEST_MESSAGE }],
        stream: true,
      };

      // 支持额外的请求参数
      if (platformConfig.config?.extra_params) {
        Object.assign(requestBody, platformConfig.config.extra_params);
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        (platformConfig.config?.timeout as number) || DEFAULT_TIMEOUT_MS
      );

      const fetchSignal = signal || controller.signal;

      const response = await fetch(platformConfig.api_endpoint, {
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
          request_params: { url: platformConfig.api_endpoint, model: modelId },
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
          request_params: { url: platformConfig.api_endpoint, model: modelId },
        };
      }

      const decoder = new TextDecoder();
      let firstTokenReceived = false;
      let content = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          content += chunk;

          // 解析 SSE 流
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                break;
              }
              try {
                const parsed = JSON.parse(data);
                // 捕获首 token 时间
                if (!firstTokenReceived && parsed.choices?.[0]?.delta?.content) {
                  ttft = Date.now() - startTime;
                  firstTokenReceived = true;
                }
              } catch {
                // 忽略解析错误
              }
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
        request_params: { url: platformConfig.api_endpoint, model: modelId },
        response_data: {
          content_length: content.length,
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
          request_params: { url: platformConfig.api_endpoint, model: modelId },
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
        request_params: { url: platformConfig.api_endpoint, model: modelId },
      };
    }
  }
}
