/**
 * 延迟测试 API
 * POST /api/ping - 测试所有模型
 * POST /api/ping/all - 测试所有平台的所有模型
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getActiveModelsWithPlatforms, 
  insertPingRecord 
} from '@/lib/monitoring/database';
import { llmMonitor } from '@/lib/monitoring/registry';
import { z } from 'zod';
import { ZodError } from 'zod';

const pingRequestSchema = z.object({
  platform_id: z.number().optional(),
  model_id: z.number().optional(),
  model_ids: z.array(z.number()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform_id, model_id, model_ids } = pingRequestSchema.parse(body);

    // 获取要测试的模型列表
    const modelsWithPlatforms = await getActiveModelsWithPlatforms();

    let modelsToTest = modelsWithPlatforms;

    // 如果指定了平台，只测试该平台的模型
    if (platform_id) {
      modelsToTest = modelsToTest.filter(m => m.platform_id === platform_id);
    }

    // 如果指定了模型，只测试这些模型
    if (model_id) {
      modelsToTest = modelsToTest.filter(m => m.id === model_id);
    }

    if (model_ids && model_ids.length > 0) {
      modelsToTest = modelsToTest.filter(m => model_ids.includes(m.id));
    }

    if (modelsToTest.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No active models to test' },
        { status: 400 }
      );
    }

    // 按平台分组测试
    const platformGroups = new Map<number, typeof modelsToTest>();
    for (const model of modelsToTest) {
      if (!platformGroups.has(model.platform_id)) {
        platformGroups.set(model.platform_id, []);
      }
      platformGroups.get(model.platform_id)!.push(model);
    }

    const allResults = [];

    // 逐个平台测试
    for (const [platformId, models] of platformGroups) {
      const platform = models[0].platform;

      const pingResults = await llmMonitor.pingPlatform({
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
      for (const result of pingResults) {
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
          allResults.push({
            ...result,
            id: record.id,
            created_at: record.created_at,
          });
        } catch (error) {
          console.error('Failed to store ping result:', error);
          allResults.push(result);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: allResults,
      tested_count: allResults.length,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error running ping:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to run ping' },
      { status: 500 }
    );
  }
}
