/**
 * 模型单个操作 API
 * GET /api/models/[id] - 获取单个模型
 * PUT /api/models/[id] - 更新模型
 * DELETE /api/models/[id] - 删除模型
 */

import { NextRequest, NextResponse } from 'next/server';
import { getModelById, updateModel, deleteModel, getPlatformById } from '@/lib/monitoring/database';
import { insertModelSchema } from '@/storage/database/shared/schema';
import { ZodError } from 'zod';

export async function GET(
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

    // 获取所属平台信息
    const platform = await getPlatformById(model.platform_id);

    return NextResponse.json({
      success: true,
      data: { ...model, platform },
    });
  } catch (error) {
    console.error('Error fetching model:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch model' },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const body = await request.json();
    const validatedData = insertModelSchema.partial().parse(body);

    const model = await updateModel(modelId, validatedData);

    return NextResponse.json({
      success: true,
      data: model,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating model:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update model' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    await deleteModel(modelId);

    return NextResponse.json({
      success: true,
      message: 'Model deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting model:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete model' },
      { status: 500 }
    );
  }
}
