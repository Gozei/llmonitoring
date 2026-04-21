/**
 * 监控仪表盘组件
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { StatusCard } from './status-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Activity, CheckCircle2, XCircle, Clock, ChevronDown, ChevronRight, Plus, Settings } from 'lucide-react';
import { useInitPlatforms, useStatus, usePing } from './use-api';
import { PlatformManagementDialog } from './platform-management-dialog';
import type { ModelStatus, PlatformStatus, StatusSummary, Platform } from './types';

interface MonitoringDashboardProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function MonitoringDashboard({
  autoRefresh = false,
  refreshInterval = 30000
}: MonitoringDashboardProps) {
  const [initialized, setInitialized] = useState(false);
  const [pingingIds, setPingingIds] = useState<Set<number>>(new Set());
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<number>>(new Set());
  const [managementDialogOpen, setManagementDialogOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null);

  const { statuses, platforms, summary, fetchStatus, loading: statusLoading, error: statusError } = useStatus();
  const { ping, pingModel, pingAll, loading: pingLoading } = usePing();
  const { init, loading: initLoading } = useInitPlatforms();

  // 初始化
  const handleInit = useCallback(async () => {
    try {
      await init();
      setInitialized(true);
    } catch (error) {
      console.error('Failed to initialize:', error);
    }
  }, [init]);

  // 加载状态
  const loadStatus = useCallback(async () => {
    try {
      await fetchStatus(24);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  }, [fetchStatus]);

  // 初始化
  useEffect(() => {
    handleInit();
  }, [handleInit]);

  // 初始加载
  useEffect(() => {
    if (initialized) {
      loadStatus();
    }
  }, [initialized, loadStatus]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadStatus();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, loadStatus]);

  // 打开添加对话框
  const handleAddPlatform = useCallback(() => {
    setEditingPlatform(null);
    setManagementDialogOpen(true);
  }, []);

  // 打开编辑对话框（支持平台和模型配置）
  const handleEditPlatform = useCallback((platform: Platform) => {
    setEditingPlatform(platform);
    setManagementDialogOpen(true);
  }, []);

  // 管理成功回调
  const handleManagementSuccess = useCallback(() => {
    loadStatus();
  }, [loadStatus]);

  // Ping 单个模型
  const handlePing = useCallback(async (modelId: number) => {
    setPingingIds(prev => new Set([...prev, modelId]));
    try {
      await pingModel(modelId);
      await loadStatus();
    } catch (error) {
      console.error('Ping failed:', error);
    } finally {
      setPingingIds(prev => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
    }
  }, [pingModel, loadStatus]);

  // Ping 所有模型
  const handlePingAll = useCallback(async () => {
    try {
      await pingAll();
      await loadStatus();
    } catch (error) {
      console.error('Ping all failed:', error);
    }
  }, [pingAll, loadStatus]);

  // Ping 特定平台的模型
  const handlePingPlatform = useCallback(async (platformId: number, modelIds: number[]) => {
    try {
      await ping({ modelIds });
      await loadStatus();
    } catch (error) {
      console.error('Ping platform failed:', error);
    }
  }, [ping, loadStatus]);

  // 展开/收起平台
  const togglePlatform = useCallback((platformId: number) => {
    setExpandedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platformId)) {
        next.delete(platformId);
      } else {
        next.add(platformId);
      }
      return next;
    });
  }, []);

  // 查看历史
  const handleViewHistory = useCallback((modelId: number) => {
    window.open(`/history/${modelId}`, '_blank');
  }, []);

  const typedStatuses = statuses as ModelStatus[];
  const typedPlatforms = platforms as PlatformStatus[];
  const typedSummary = summary as StatusSummary | null;

  if (!initialized || (initLoading && !initialized)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">正在初始化平台...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 概览卡片 */}
      {typedSummary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">监控模型数</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{typedSummary.total_models}</div>
              <p className="text-xs text-muted-foreground">
                {typedSummary.active_models} 个启用中
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">平均延迟</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {typedSummary.avg_latency > 0 ? `${Math.round(typedSummary.avg_latency)}ms` : '-'}
              </div>
              <p className="text-xs text-muted-foreground">过去 24 小时</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">测试次数</CardTitle>
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{typedSummary.total_tests}</div>
              <p className="text-xs text-muted-foreground">过去 24 小时</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">成功率</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {typedSummary.overall_success_rate.toFixed(1)}%
              </div>
              <div className="flex items-center gap-1">
                {typedSummary.overall_success_rate >= 90 ? (
                  <Badge variant="default" className="bg-green-500">正常</Badge>
                ) : typedSummary.overall_success_rate >= 70 ? (
                  <Badge variant="default" className="bg-yellow-500">警告</Badge>
                ) : (
                  <Badge variant="destructive">异常</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">平台状态</h2>
        <div className="flex items-center gap-2">
          {statusLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          <Button
            variant="outline"
            size="sm"
            onClick={loadStatus}
            disabled={statusLoading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={handlePingAll}
            disabled={pingLoading || typedStatuses.length === 0}
          >
            {pingLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                测试中...
              </>
            ) : (
              <>
                <Activity className="mr-2 h-4 w-4" />
                测试所有
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddPlatform}
          >
            <Plus className="h-4 w-4 mr-2" />
            添加提供商
          </Button>
        </div>
      </div>

      {/* 错误提示 */}
      {statusError && (
        <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
          <XCircle className="h-4 w-4" />
          {statusError}
        </div>
      )}

      {/* 平台分组 */}
      {typedPlatforms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">暂无配置的提供商</p>
            <p className="text-sm text-muted-foreground mt-1">
            点击&quot;添加提供商&quot;开始监控
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {typedPlatforms.map((platformStatus) => (
            <Card key={platformStatus.platform.id}>
              <CardHeader
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => togglePlatform(platformStatus.platform.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {expandedPlatforms.has(platformStatus.platform.id) ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                    <div>
                      <CardTitle className="text-lg">{platformStatus.platform.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {platformStatus.platform.description || '暂无描述'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {platformStatus.stats.avg_latency > 0
                          ? `${Math.round(platformStatus.stats.avg_latency)}ms`
                          : '-'}
                      </div>
                      <div className="text-xs text-muted-foreground">平均</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {platformStatus.stats.success_rate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">成功率</div>
                    </div>
                  </div>
                </div>
              </CardHeader>

              {expandedPlatforms.has(platformStatus.platform.id) && (
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {platformStatus.models.length} 个模型
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditPlatform(platformStatus.platform as Platform);
                        }}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        配置
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePingPlatform(
                          (platformStatus.platform as Platform).id,
                          platformStatus.models.map((m) => m.model.id)
                        );
                      }}
                      disabled={pingLoading}
                    >
                      {pingLoading ? (
                        <>
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          测试中...
                        </>
                      ) : (
                        <>
                          <Activity className="mr-1 h-4 w-4" />
                          测试所有
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {platformStatus.models.map((modelStatus) => (
                      <StatusCard
                        key={modelStatus.model.id}
                        status={modelStatus}
                        onPing={handlePing}
                        onViewHistory={handleViewHistory}
                        isPinging={pingingIds.has(modelStatus.model.id)}
                      />
                    ))}
                    {platformStatus.models.length === 0 && (
                      <Card className="border-dashed col-span-full">
                        <CardContent className="flex flex-col items-center justify-center py-8">
                          <p className="text-muted-foreground mb-4">暂未配置模型</p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditPlatform(platformStatus.platform as Platform);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            添加模型
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* 管理对话框 */}
      <PlatformManagementDialog
        open={managementDialogOpen}
        onOpenChange={setManagementDialogOpen}
        platform={editingPlatform}
        onSuccess={handleManagementSuccess}
        mode="edit"
      />
    </div>
  );
}
