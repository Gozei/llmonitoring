/**
 * 大模型平台适配器注册表
 * 统一管理所有大模型平台适配器
 */

import { IPlatformAdapter, PlatformConfig, PingResult } from './adapter';
import { ZhipuAdapter } from './zhipu-adapter';
import { JDAdapter } from './jd-adapter';
import { OpenAICompatibleAdapter } from './openai-compatible-adapter';

/**
 * 适配器注册表
 */
class AdapterRegistry {
  private adapters: Map<string, IPlatformAdapter> = new Map();

  constructor() {
    // 注册内置适配器
    this.register(new ZhipuAdapter());
    this.register(new JDAdapter());
    this.register(new OpenAICompatibleAdapter());
  }

  /**
   * 注册适配器
   */
  register(adapter: IPlatformAdapter): void {
    this.adapters.set(adapter.slug, adapter);
  }

  /**
   * 获取适配器（自动回退到通用适配器）
   * 优先精确匹配 > 回退到 openai-compatible
   * 这样可以在界面上配置任意 OpenAI 兼容格式的 API
   */
  get(slug: string): IPlatformAdapter {
    const adapter = this.adapters.get(slug);
    if (adapter) return adapter;
    // 回退到 openai-compatible 通用适配器
    return this.adapters.get('openai-compatible')!;
  }

  /**
   * 获取所有适配器
   */
  getAll(): IPlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * 获取所有已注册的适配器信息
   */
  getAllAdaptersInfo(): Array<{ slug: string; name: string; defaultEndpoint: string }> {
    return this.getAll().map(adapter => ({
      slug: adapter.slug,
      name: adapter.name,
      defaultEndpoint: adapter.defaultEndpoint,
    }));
  }
}

// 单例
export const adapterRegistry = new AdapterRegistry();

/**
 * 通用大模型平台监控执行器
 */
export class LLMMonitor {
  private registry: AdapterRegistry;

  constructor(registry: AdapterRegistry = adapterRegistry) {
    this.registry = registry;
  }

  /**
   * 执行单个平台的延迟测试（测试平台下所有模型）
   */
  async pingPlatform(platform: {
    id: number;
    slug: string;
    api_endpoint: string;
    api_key?: string;
    models: Array<{
      id: number;
      model_id: string;
      name: string;
      config?: Record<string, unknown>;
    }>;
    config?: Record<string, unknown>;
  }): Promise<PingResult[]> {
    // 自动选择适配器：精确匹配 > 别名 > openai-compatible
    const adapter = this.registry.get(platform.slug);

    const platformConfig: PlatformConfig = {
      api_endpoint: platform.api_endpoint,
      api_key: platform.api_key,
      models: platform.models.map(m => ({
        model_id: m.model_id,
        name: m.name,
        config: m.config,
      })),
      config: platform.config,
    };

    const results = await adapter.ping(platformConfig);
    
    // 设置正确的 model_id 和 platform_id
    return results.map((result, index) => ({
      ...result,
      model_id: platform.models[index]?.id || 0,
      platform_id: platform.id,
    }));
  }

  /**
   * 批量执行多个平台的延迟测试
   */
  async pingAllPlatforms(platforms: Array<{
    id: number;
    slug: string;
    api_endpoint: string;
    api_key?: string;
    models: Array<{
      id: number;
      model_id: string;
      name: string;
      config?: Record<string, unknown>;
    }>;
    config?: Record<string, unknown>;
  }>): Promise<PingResult[]> {
    const allResults: PingResult[] = [];

    for (const platform of platforms) {
      const results = await this.pingPlatform(platform);
      allResults.push(...results);
    }

    return allResults;
  }

  /**
   * 测试单个模型
   */
  async pingModel(model: {
    id: number;
    platform_id: number;
    platform_slug: string;
    platform_endpoint: string;
    platform_api_key?: string;
    model_id: string;
    name: string;
    config?: Record<string, unknown>;
    platform_config?: Record<string, unknown>;
  }): Promise<PingResult> {
    // 自动选择适配器：精确匹配 > 别名 > openai-compatible
    const adapter = this.registry.get(model.platform_slug);

    const platformConfig: PlatformConfig = {
      api_endpoint: model.platform_endpoint,
      api_key: model.platform_api_key,
      models: [{
        model_id: model.model_id,
        name: model.name,
        config: model.config,
      }],
      config: model.platform_config,
    };

    const results = await adapter.ping(platformConfig);
    return {
      ...results[0],
      model_id: model.id,
      platform_id: model.platform_id,
    };
  }
}

export const llmMonitor = new LLMMonitor();
