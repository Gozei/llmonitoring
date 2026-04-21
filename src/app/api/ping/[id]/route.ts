/**
 * POST /api/ping/[id] - 测试单个模型
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPlatformById, getModelById, getModelsByPlatformId, insertPingRecord } from '@/lib/monitoring/database';
import { adapterRegistry } from '@/lib/monitoring/registry';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const modelId = parseInt(id, 10);

    if (isNaN(modelId)) {
      return NextResponse.json(
        { success: false, error: '无效的模型ID' },
        { status: 400 }
      );
    }

    // 获取模型信息
    const model = await getModelById(modelId);

    if (!model) {
      return NextResponse.json(
        { success: false, error: '模型不存在' },
        { status: 404 }
      );
    }

    if (!model.is_active) {
      return NextResponse.json(
        { success: false, error: '模型未启用' },
        { status: 400 }
      );
    }

    // 获取平台信息
    const platform = await getPlatformById(model.platform_id);

    if (!platform) {
      return NextResponse.json(
        { success: false, error: '平台不存在' },
        { status: 404 }
      );
    }

    // 获取适配器
    const adapter = adapterRegistry.get(platform.slug);

    if (!adapter) {
      return NextResponse.json(
        { success: false, error: `未找到适配器: ${platform.slug}` },
        { status: 400 }
      );
    }

    // 执行延迟测试
    const startTime = Date.now();
    let ttft: number | null = null;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (platform.api_key) {
        headers['Authorization'] = `Bearer ${platform.api_key}`;
      }

      const response = await fetch(platform.api_endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model.model_id,
          messages: [{ role: 'user', content: '请简单介绍一下你自己，只回答一句话。' }],
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const record = await insertPingRecord({
          model_id: model.id,
          platform_id: platform.id,
          latency_ms: Date.now() - startTime,
          ttft_ms: null,
          total_time_ms: Date.now() - startTime,
          status: 'error',
          error_message: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        });

        return NextResponse.json({
          success: false,
          data: { ...record, created_at: record.created_at },
          error: `请求失败: HTTP ${response.status}`,
        }, { status: 200 });
      }

      // 处理流式响应
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              if (!ttft && parsed.choices?.[0]?.delta?.content) {
                ttft = Date.now() - startTime;
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      const result = {
        model_id: model.id,
        platform_id: platform.id,
        latency_ms: ttft || Date.now() - startTime,
        ttft_ms: ttft,
        total_time_ms: Date.now() - startTime,
        status: 'success' as const,
      };

      const record = await insertPingRecord(result);

      return NextResponse.json({
        success: true,
        data: { ...result, id: record.id, created_at: record.created_at },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout');

      const record = await insertPingRecord({
        model_id: model.id,
        platform_id: platform.id,
        latency_ms: Date.now() - startTime,
        ttft_ms: null,
        total_time_ms: Date.now() - startTime,
        status: isTimeout ? 'timeout' : 'error',
        error_message: errorMessage,
      });

      return NextResponse.json({
        success: false,
        data: { ...record, created_at: record.created_at },
        error: errorMessage,
      });
    }
  } catch (error) {
    console.error('Error running ping for model:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '测试失败' },
      { status: 500 }
    );
  }
}
