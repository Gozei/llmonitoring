/**
 * POST /api/init - 初始化默认平台和模型
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllPlatforms, createPlatform, createModels, getModelsByPlatformId } from '@/lib/monitoring/database';
import { adapterRegistry } from '@/lib/monitoring/registry';
import { insertPlatformSchema, insertModelSchema } from '@/storage/database/shared/schema';

const DEFAULT_PLATFORMS = [
  {
    name: '智谱AI',
    slug: 'zhipu',
    description: '智谱AI大模型服务平台',
    api_endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    is_active: true,
    config: { timeout: 60000 },
  },
  {
    name: '京东言犀',
    slug: 'jd',
    description: '京东言犀大模型服务平台',
    api_endpoint: 'https://agentrs.jd.com/api/saas/openai-u/v1/chat/completions',
    is_active: true,
    config: { timeout: 60000 },
  },
];

const DEFAULT_MODELS = {
  zhipu: [
    { name: 'GLM-4-Flash', model_id: 'glm-4-flash', description: '智谱GLM-4-Flash模型' },
    { name: 'GLM-4', model_id: 'glm-4', description: '智谱GLM-4模型' },
    { name: 'GLM-4-Plus', model_id: 'glm-4-plus', description: '智谱GLM-4-Plus模型' },
  ],
  jd: [
    { name: '京东Plus', model_id: 'jd-plus', description: '京东Plus模型' },
    { name: '京东Pro', model_id: 'jd-pro', description: '京东Pro模型' },
    { name: '京东Max', model_id: 'jd-max', description: '京东Max模型' },
  ],
};

export async function POST(request: NextRequest) {
  try {
    // 检查是否已存在平台
    const existingPlatforms = await getAllPlatforms();

    if (existingPlatforms.length > 0) {
      // 获取每个平台的模型
      const platformsWithModels = await Promise.all(
        existingPlatforms.map(async (platform) => {
          const models = await getModelsByPlatformId(platform.id);
          return { ...platform, models };
        })
      );

      return NextResponse.json({
        success: true,
        message: '平台已初始化',
        data: platformsWithModels,
        available_adapters: adapterRegistry.getAllAdaptersInfo(),
      });
    }

    // 创建默认平台
    const createdPlatforms = [];
    for (const platformData of DEFAULT_PLATFORMS) {
      try {
        const validatedPlatform = insertPlatformSchema.parse(platformData);
        const platform = await createPlatform(validatedPlatform);
        createdPlatforms.push(platform);

        // 创建该平台的默认模型
        const models = DEFAULT_MODELS[platform.slug as keyof typeof DEFAULT_MODELS];
        if (models) {
          const modelRecords = models.map(m => ({
            platform_id: platform.id,
            name: m.name,
            model_id: m.model_id,
            description: m.description,
            is_active: true,
          }));
          await createModels(modelRecords);
        }
      } catch (error) {
        console.error(`Failed to create platform ${platformData.name}:`, error);
      }
    }

    // 获取创建的平台及模型
    const finalPlatforms = await Promise.all(
      createdPlatforms.map(async (platform) => {
        const models = await getModelsByPlatformId(platform.id);
        return { ...platform, models };
      })
    );

    return NextResponse.json({
      success: true,
      message: '默认平台和模型已初始化',
      data: finalPlatforms,
      available_adapters: adapterRegistry.getAllAdaptersInfo(),
    }, { status: 201 });
  } catch (error) {
    console.error('Error initializing platforms:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to initialize platforms' },
      { status: 500 }
    );
  }
}
