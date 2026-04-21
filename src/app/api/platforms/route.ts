/**
 * 平台管理 API
 * GET /api/platforms - 获取所有平台
 * POST /api/platforms - 创建新平台
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllPlatforms, createPlatform, getActivePlatforms, getPlatformBySlug, getModelsByPlatformId } from '@/lib/monitoring/database';
import { adapterRegistry } from '@/lib/monitoring/registry';
import { insertPlatformSchema } from '@/storage/database/shared/schema';
import { ZodError } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get('active') === 'true';
    const includeModels = searchParams.get('include_models') === 'true';

    let platforms = activeOnly ? await getActivePlatforms() : await getAllPlatforms();

    // 如果需要包含模型信息
    if (includeModels) {
      const platformsWithModels = await Promise.all(
        platforms.map(async (platform) => {
          const models = await getModelsByPlatformId(platform.id, activeOnly);
          return { ...platform, models };
        })
      );
      platforms = platformsWithModels as typeof platforms;
    }

    return NextResponse.json({
      success: true,
      data: platforms,
      adapters: adapterRegistry.getAllAdaptersInfo(),
    });
  } catch (error) {
    console.error('Error fetching platforms:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取平台列表失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = insertPlatformSchema.parse(body);

    let effectiveSlug = validatedData.slug;

    // 如果 slug 是 openai-compatible（自定义配置），检查是否已存在
    if (effectiveSlug === 'openai-compatible') {
      let counter = 1;
      let newSlug = `custom-${counter}`;
      // 查找一个不存在的 slug
      while (await getPlatformBySlug(newSlug)) {
        counter++;
        newSlug = `custom-${counter}`;
        if (counter > 100) break; // 防止无限循环
      }
      effectiveSlug = newSlug;
    } else {
      // 检查 slug 是否已存在
      const existing = await getPlatformBySlug(effectiveSlug);
      if (existing) {
        return NextResponse.json(
          { success: false, error: `标识符 "${effectiveSlug}" 已存在，请使用其他名称` },
          { status: 400 }
        );
      }
    }

    // 创建平台（slug 可以是任意值，会自动回退到 openai-compatible 适配器）
    const platform = await createPlatform(validatedData);

    return NextResponse.json({
      success: true,
      data: platform,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: '验证错误', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error creating platform:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '创建平台失败' },
      { status: 500 }
    );
  }
}
