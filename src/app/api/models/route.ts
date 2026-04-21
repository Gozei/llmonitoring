/**
 * 模型管理 API
 * GET /api/models - 获取所有模型
 * POST /api/models - 创建新模型
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllModelsWithPlatforms, createModel, createModels, getModelsByPlatformId } from '@/lib/monitoring/database';
import { insertModelSchema } from '@/storage/database/shared/schema';
import { ZodError } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const platformId = searchParams.get('platform_id');

    let models;
    if (platformId) {
      const id = parseInt(platformId, 10);
      if (isNaN(id)) {
        return NextResponse.json(
          { success: false, error: 'Invalid platform ID' },
          { status: 400 }
        );
      }
      models = await getModelsByPlatformId(id);
    } else {
      models = await getAllModelsWithPlatforms();
    }

    return NextResponse.json({
      success: true,
      data: models,
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch models' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 支持批量创建
    if (body.models && Array.isArray(body.models)) {
      const platformId = body.platform_id;
      if (!platformId) {
        return NextResponse.json(
          { success: false, error: '缺少 platform_id' },
          { status: 400 }
        );
      }

      const models = body.models.map((m: Record<string, unknown>) =>
        insertModelSchema.parse({
          ...m,
          platform_id: platformId,
        })
      );

      const created = await createModels(models);

      return NextResponse.json({
        success: true,
        data: created,
      }, { status: 201 });
    }

    // 单个创建
    const validatedData = insertModelSchema.parse(body);
    const model = await createModel(validatedData);

    return NextResponse.json({
      success: true,
      data: model,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: '验证错误', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating model:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '创建模型失败' },
      { status: 500 }
    );
  }
}
