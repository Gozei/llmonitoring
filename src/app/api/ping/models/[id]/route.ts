/**
 * 单个模型测试 API
 * POST /api/ping/models/[id] - 测试单个模型
 */

import { NextRequest, NextResponse } from 'next/server';
import { getModelById, getPlatformById, insertPingRecord } from '@/lib/monitoring/database';
import { llmMonitor } from '@/lib/monitoring/registry';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const modelId = parseInt(id, 10);

    if (isNaN(modelId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid model ID' },
        { status: 400 }
      );
    }

    const model = await getModelById(modelId);

    if (!model) {
      return NextResponse.json(
        { success: false, error: 'Model not found' },
        { status: 404 }
      );
    }

    if (!model.is_active) {
      return NextResponse.json(
        { success: false, error: 'Model is not active' },
        { status: 400 }
      );
    }

    const platform = await getPlatformById(model.platform_id);

    if (!platform) {
      return NextResponse.json(
        { success: false, error: 'Platform not found' },
        { status: 404 }
      );
    }

    // 执行测试
    const result = await llmMonitor.pingModel({
      id: model.id,
      platform_id: model.platform_id,
      platform_slug: platform.slug,
      platform_endpoint: platform.api_endpoint,
      platform_api_key: platform.api_key || undefined,
      model_id: model.model_id,
      name: model.name,
      config: model.config as Record<string, unknown> | undefined,
      platform_config: platform.config as Record<string, unknown> | undefined,
    });

    // 存储结果
    const record = await insertPingRecord({
      model_id: result.model_id,
      platform_id: result.platform_id,
      latency_ms: result.latency_ms,
      ttft_ms: result.ttft_ms,
      total_time_ms: result.total_time_ms,
      status: result.status,
      error_message: result.error_message,
      request_params: result.request_params,
      response_data: result.response_data,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        id: record.id,
        created_at: record.created_at,
        model,
        platform,
      },
    });
  } catch (error) {
    console.error('Error running ping for model:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to run ping' },
      { status: 500 }
    );
  }
}
