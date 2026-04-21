/**
 * 平台单个操作 API
 * GET /api/platforms/[id] - 获取单个平台
 * PUT /api/platforms/[id] - 更新平台
 * DELETE /api/platforms/[id] - 删除平台
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPlatformById, updatePlatform, deletePlatform, getModelsByPlatformId } from '@/lib/monitoring/database';
import { insertPlatformSchema } from '@/storage/database/shared/schema';
import { ZodError } from 'zod';

export async function GET(
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

    // 获取该平台的模型
    const models = await getModelsByPlatformId(platformId);

    return NextResponse.json({
      success: true,
      data: { ...platform, models },
    });
  } catch (error) {
    console.error('Error fetching platform:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch platform' },
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
    const platformId = parseInt(id, 10);

    if (isNaN(platformId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid platform ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validatedData = insertPlatformSchema.partial().parse(body);

    // 获取当前平台信息
    const currentPlatform = await getPlatformById(platformId);
    if (!currentPlatform) {
      return NextResponse.json(
        { success: false, error: 'Platform not found' },
        { status: 404 }
      );
    }

    // 更新平台（slug 可以是任意值，会自动回退到 openai-compatible 适配器）
    const platform = await updatePlatform(platformId, validatedData);

    return NextResponse.json({
      success: true,
      data: platform,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating platform:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update platform' },
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

    await deletePlatform(platformId);

    return NextResponse.json({
      success: true,
      message: 'Platform deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting platform:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete platform' },
      { status: 500 }
    );
  }
}
