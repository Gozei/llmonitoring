/**
 * API 客户端钩子
 */

'use client';

import { useState, useCallback } from 'react';

const API_BASE = '/api';

async function fetchApi<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

/**
 * 初始化平台和模型
 */
export function useInitPlatforms() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const init = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ data: unknown[]; message: string }>('/init', {
        method: 'POST',
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { init, loading, error };
}

/**
 * 获取平台列表
 */
export function usePlatforms() {
  const [platforms, setPlatforms] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (includeModels = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ data: unknown[] }>(
        `/platforms?include_models=${includeModels}`
      );
      setPlatforms(result.data || []);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch platforms';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { platforms, fetch, loading, error };
}

/**
 * 创建平台
 */
export function useCreatePlatform() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (platform: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ data: unknown }>('/platforms', {
        method: 'POST',
        body: JSON.stringify(platform),
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create platform';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}

/**
 * 获取模型列表
 */
export function useModels() {
  const [models, setModels] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (platformId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const url = platformId ? `/models?platform_id=${platformId}` : '/models';
      const result = await fetchApi<{ data: unknown[] }>(url);
      setModels(result.data || []);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch models';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { models, fetch, loading, error };
}

/**
 * 创建模型
 */
export function useCreateModel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (model: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ data: unknown }>('/models', {
        method: 'POST',
        body: JSON.stringify(model),
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create model';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { create, loading, error };
}

/**
 * 更新平台
 */
export function useUpdatePlatform() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(async (id: number, platform: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ data: unknown }>(`/platforms/${id}`, {
        method: 'PUT',
        body: JSON.stringify(platform),
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update platform';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { update, loading, error };
}

/**
 * 删除平台
 */
export function useDeletePlatform() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ success: boolean }>(`/platforms/${id}`, {
        method: 'DELETE',
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete platform';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { remove, loading, error };
}

/**
 * 更新模型
 */
export function useUpdateModel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(async (id: number, model: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ data: unknown }>(`/models/${id}`, {
        method: 'PUT',
        body: JSON.stringify(model),
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update model';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { update, loading, error };
}

/**
 * 删除模型
 */
export function useDeleteModel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ success: boolean }>(`/models/${id}`, {
        method: 'DELETE',
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete model';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { remove, loading, error };
}

/**
 * 获取可用适配器列表
 */
export function useAdapters() {
  const [adapters, setAdapters] = useState<Array<{ slug: string; name: string; defaultEndpoint: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ adapters: Array<{ slug: string; name: string; defaultEndpoint: string }> }>('/adapters');
      setAdapters(result.adapters || []);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch adapters';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { adapters, fetch, loading, error };
}

/**
 * 执行延迟测试
 */
export function usePing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<unknown[]>([]);

  const ping = useCallback(async (options?: { platformId?: number; modelId?: number; modelIds?: number[] }) => {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (options?.platformId) body.platform_id = options.platformId;
      if (options?.modelId) body.model_id = options.modelId;
      if (options?.modelIds) body.model_ids = options.modelIds;

      const result = await fetchApi<{ data: unknown[] }>('/ping', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResults(result.data || []);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run ping';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const pingAll = useCallback(async () => {
    return ping();
  }, [ping]);

  const pingPlatform = useCallback(async (platformId: number) => {
    return ping({ platformId });
  }, [ping]);

  const pingModel = useCallback(async (modelId: number) => {
    return ping({ modelId });
  }, [ping]);

  return { ping, pingAll, pingPlatform, pingModel, results, loading, error };
}

/**
 * 获取监控状态
 */
export function useStatus() {
  const [statuses, setStatuses] = useState<unknown[]>([]);
  const [platforms, setPlatforms] = useState<unknown[]>([]);
  const [summary, setSummary] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async (hours = 24) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ data: { statuses: unknown[]; platforms: unknown[]; summary: unknown } }>(
        `/status?hours=${hours}`
      );
      setStatuses(result.data?.statuses || []);
      setPlatforms(result.data?.platforms || []);
      setSummary(result.data?.summary || null);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch status';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { statuses, platforms, summary, fetchStatus, loading, error };
}

/**
 * 获取历史记录
 */
export function useHistory() {
  const [records, setRecords] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (modelId: number, limit = 100, offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchApi<{ data: { records: unknown[] } }>(
        `/history/${modelId}?limit=${limit}&offset=${offset}`
      );
      setRecords(result.data?.records || []);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch history';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { records, fetchHistory, loading, error };
}
