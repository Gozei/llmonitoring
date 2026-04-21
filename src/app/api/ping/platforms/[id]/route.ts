/**
 * 平台测试 API
 * POST /api/ping/platforms/[id] - 测试单个平台的所有模型
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPlatformById, getModelsByPlatformId, insertPingRecord } from '@/lib/monitoring/database';
import { llmMonitor } from '@/lib/monitoring/registry';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const platformId = parseInt(id, 10);

    if (isNaN(platformId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid platform ID' },
        { status: 400 }
      );
    }

    const platform = await getPlatformById(platformId);

    if (!platform) {
      return NextResponse.json(
        { success: false, error: 'Platform not found' },
        { status: 404 }
      );
    }

    const models = await getModelsByPlatformId(platformId, true);

    if (models.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No active models in this platform' },
        { status: 400 }
      );
    }

    // 执行测试
    const results = await llmMonitor.pingPlatform({
      id: platform.id,
      slug: platform.slug,
      api_endpoint: platform.api_endpoint,
      api_key: platform.api_key || undefined,
      models: models.map(m => ({
        id: m.id,
        model_id: m.model_id,
        name: m.name,
        config: m.config as Record<string, unknown> | undefined,
      })),
      config: platform.config as Record<string, unknown> | undefined,
    });

    // 存储结果
    const storedResults = await Promise.all(
      results.map(async (result) => {
        try {
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
          return {
            ...result,
            id: record.id,
            created_at: record.created_at,
          };
        } catch (error) {
          console.error('Failed to store ping result:', error);
          return result;
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: storedResults,
      platform,
      models,
      tested_count: storedResults.length,
    });
  } catch (error) {
    console.error('Error running ping for platform:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to run ping' },
      { status: 500 }
    );
  }
}
