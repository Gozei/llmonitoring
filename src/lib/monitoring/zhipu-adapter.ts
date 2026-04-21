/**
 * 智谱AI (Zhipu AI) 平台适配器
 * 官方文档: https://open.bigmodel.cn/dev/api
 * 支持平台下的所有模型
 */

import { IPlatformAdapter, PlatformConfig, PingResult, DEFAULT_TEST_MESSAGE, DEFAULT_TIMEOUT_MS } from './adapter';

export class ZhipuAdapter implements IPlatformAdapter {
  readonly slug = 'zhipu';
  readonly name = '智谱AI';
  readonly defaultEndpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

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
        'Authorization': `Bearer ${platformConfig.api_key || ''}`,
      };

      const requestBody = {
        model: modelId,
        messages: [
          { role: 'user', content: DEFAULT_TEST_MESSAGE }
        ],
        stream: true,
      };

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        (platformConfig.config?.timeout as number) || DEFAULT_TIMEOUT_MS
      );

      const fetchSignal = signal || controller.signal;

      const response = await fetch(platformConfig.api_endpoint || this.defaultEndpoint, {
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
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;

              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content;

                if (!firstTokenReceived && delta) {
                  ttft = Date.now() - startTime;
                  firstTokenReceived = true;
                }

                if (delta) {
                  content += delta;
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const totalTime = Date.now() - startTime;

      return {
        model_id: 0,
        platform_id: 0,
        latency_ms: ttft || totalTime,
        ttft_ms: ttft,
        total_time_ms: totalTime,
        status: 'success',
        request_params: { url: platformConfig.api_endpoint, model: modelId },
        response_data: {
          content_length: content.length,
          preview: content.slice(0, 100)
        },
      };

    } catch (error) {
      const totalTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout');

      return {
        model_id: 0,
        platform_id: 0,
        latency_ms: totalTime,
        ttft_ms: ttft,
        total_time_ms: totalTime,
        status: isTimeout ? 'timeout' : 'error',
        error_message: errorMessage.slice(0, 500),
        request_params: { url: platformConfig.api_endpoint, model: modelId },
      };
    }
  }
}
