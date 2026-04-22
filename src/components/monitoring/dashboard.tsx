/**
 * 模型综合评估仪表盘
 */

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  Clock,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PlatformManagementDialog } from './platform-management-dialog';
import { useEvaluation, useInitPlatforms, usePing, useStatus } from './use-api';
import type { EvaluationCaseSummary, ModelStatus, Platform, PlatformStatus, StatusSummary } from './types';

interface MonitoringDashboardProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const CASE_LABELS: Record<string, string> = {
  connectivity_check: '连通性',
  identity_check: '身份一致',
  json_check: 'JSON 严格输出',
  code_check: '代码能力',
  reasoning_check: '长推理',
  consistency_check: '同题稳定',
};

function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatLatency(value: number | null | undefined): string {
  if (!value) return '-';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function formatLatestPing(status: ModelStatus): string {
  const latest = status.latest;
  if (!latest) return '-';
  if (latest.status === 'success') {
    return formatLatency(latest.latency_ms);
  }
  if (latest.status === 'timeout') {
    return '超时';
  }
  return '失败';
}

function scoreTone(score: number | null | undefined): string {
  if (score == null) return 'bg-muted text-muted-foreground';
  if (score >= 80) return 'bg-emerald-600 text-white';
  if (score >= 60) return 'bg-cyan-600 text-white';
  if (score >= 40) return 'bg-amber-500 text-white';
  return 'bg-rose-600 text-white';
}

function formatSeconds(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${value.toFixed(1)}s`;
}

function formatPenalty(value: number | null | undefined): string {
  if (value == null) return '-';
  return `-${value.toFixed(1)}`;
}

function caseScoreTone(score: number): string {
  if (score >= 90) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (score >= 60) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function caseScoreProgressTone(score: number): string {
  if (score >= 90) {
    return 'bg-emerald-100 [&_[data-slot=progress-indicator]]:bg-emerald-500';
  }
  if (score >= 60) {
    return 'bg-amber-100 [&_[data-slot=progress-indicator]]:bg-amber-500';
  }
  return 'bg-rose-100 [&_[data-slot=progress-indicator]]:bg-rose-500';
}

function CaseMetric({ item }: { item: EvaluationCaseSummary }) {
  const isReasoning = item.case === 'reasoning_check';

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{CASE_LABELS[item.case] || item.case}</div>
          <div className="text-xs text-muted-foreground">{item.success_calls}/{item.calls} 成功</div>
        </div>
        <Badge variant="outline" className={caseScoreTone(item.score)}>
          {item.score}
        </Badge>
      </div>
      <Progress value={item.score} className={`mt-3 h-1.5 ${caseScoreProgressTone(item.score)}`} />
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <span>{isReasoning ? '总耗时' : '均值'} {formatSeconds(isReasoning ? item.avg_total_time_s : item.avg_latency_s)}</span>
        <span>超时 {formatPercent(item.timeout_rate)}</span>
      </div>
      {item.metrics.length > 0 && (
        <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
          {isReasoning && (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">TTFT</span>
              <span className="shrink-0 font-medium text-foreground/80">{formatSeconds(item.avg_ttft_s)}</span>
            </div>
          )}
          {item.metrics.slice(0, 3).map(metric => (
            <div key={metric.key} className="flex items-center justify-between gap-2">
              <span className="truncate">{metric.label}</span>
              <span className="shrink-0 font-medium text-foreground/80">{metric.display}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MonitoringDashboard({
  autoRefresh = false,
  refreshInterval = 60000,
}: MonitoringDashboardProps) {
  const [initialized, setInitialized] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [managementDialogOpen, setManagementDialogOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { statuses, platforms, summary, fetchStatus, loading: statusLoading, error: statusError } = useStatus();
  const { pingAll, pingModel, loading: pingLoading } = usePing();
  const { evaluateModel, evaluatingId, loading: evaluationLoading, error: evaluationError } = useEvaluation();
  const { init, loading: initLoading } = useInitPlatforms();

  const typedStatuses = statuses as ModelStatus[];
  const typedPlatforms = platforms as PlatformStatus[];
  const typedSummary = summary as StatusSummary | null;

  const loadStatus = useCallback(async () => {
    await fetchStatus(24);
  }, [fetchStatus]);

  useEffect(() => {
    loadStatus()
      .then(() => {
        setInitialized(true);
      })
      .catch((error) => {
        setInitialized(true);
        setLocalError(error instanceof Error ? error.message : '加载失败');
      });
  }, [loadStatus]);

  useEffect(() => {
    if (!autoRefresh || !initialized) return;
    const interval = setInterval(() => {
      loadStatus().catch(() => undefined);
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, initialized, loadStatus, refreshInterval]);

  const sortedModels = useMemo(() => {
    return [...typedStatuses].sort((a, b) => {
      const aScore = a.evaluation?.score ?? -1;
      const bScore = b.evaluation?.score ?? -1;
      if (aScore !== bScore) return bScore - aScore;
      return a.model.id - b.model.id;
    });
  }, [typedStatuses]);

  useEffect(() => {
    if (selectedModelId == null && sortedModels.length > 0) {
      setSelectedModelId(sortedModels[0].model.id);
    }
  }, [selectedModelId, sortedModels]);

  const selectedStatus = useMemo(() => {
    return sortedModels.find(item => item.model.id === selectedModelId) ?? sortedModels[0] ?? null;
  }, [selectedModelId, sortedModels]);

  const evaluatedModels = sortedModels.filter(item => item.evaluation).length;
  const avgScore = sortedModels.length > 0
    ? Math.round(sortedModels.reduce((sum, item) => sum + (item.evaluation?.score ?? 0), 0) / sortedModels.length)
    : 0;
  const bestModel = sortedModels.find(item => item.evaluation);

  const handleEvaluate = useCallback(async (modelId: number) => {
    setLocalError(null);
    try {
      await evaluateModel(modelId);
      await loadStatus();
      setSelectedModelId(modelId);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '综合评估失败');
    }
  }, [evaluateModel, loadStatus]);

  const handlePing = useCallback(async (modelId: number) => {
    setLocalError(null);
    try {
      await pingModel(modelId);
      await loadStatus();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '延迟测试失败');
    }
  }, [loadStatus, pingModel]);

  const handlePingAll = useCallback(async () => {
    setLocalError(null);
    try {
      await pingAll();
      await loadStatus();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '批量延迟测试失败');
    }
  }, [loadStatus, pingAll]);

  const openCreateDialog = useCallback(() => {
    setEditingPlatform(null);
    setManagementDialogOpen(true);
  }, []);

  const handleInitDefaults = useCallback(async () => {
    setLocalError(null);
    try {
      await init();
      await loadStatus();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '初始化失败');
    }
  }, [init, loadStatus]);

  const openEditDialog = useCallback((platform: Platform) => {
    setEditingPlatform(platform);
    setManagementDialogOpen(true);
  }, []);

  if (!initialized || (initLoading && !initialized)) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin" />
          <p className="text-sm text-muted-foreground">正在加载评估工作台...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">模型总数</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{typedSummary?.total_models ?? 0}</div>
            <p className="text-xs text-muted-foreground">{typedSummary?.active_models ?? 0} 个启用中</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已评估</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{evaluatedModels}</div>
            <p className="text-xs text-muted-foreground">综合评分报告</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均评分</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{evaluatedModels > 0 ? avgScore : '-'}</div>
            <p className="text-xs text-muted-foreground">满分 100</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">当前最佳</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="truncate text-xl font-semibold">{bestModel?.model.name ?? '-'}</div>
            <p className="truncate text-xs text-muted-foreground">
              {bestModel ? `${bestModel.platform.name} · ${bestModel.evaluation?.score} 分` : '暂无评估'}
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">三方模型综合评分</h2>
          <p className="text-sm text-muted-foreground">总分 = 6 维能力均分 - 延迟惩罚，均值耗时按统一严格口径计算。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusLoading && <Loader2 className="h-4 w-4 animate-spin self-center" />}
          <Button asChild variant="outline" size="sm">
            <Link href="/rankings">
              <ArrowUpDown className="mr-2 h-4 w-4" />
              查看评分榜
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={loadStatus} disabled={statusLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
          <Button variant="outline" size="sm" onClick={handlePingAll} disabled={pingLoading || evaluationLoading}>
            {pingLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
            一键获取实时延迟
          </Button>
          <Button variant="outline" size="sm" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            添加供应商
          </Button>
        </div>
      </div>

      {(statusError || evaluationError || localError) && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <ShieldAlert className="h-4 w-4" />
          {localError || evaluationError || statusError}
        </div>
      )}

      {sortedModels.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed">
          <Activity className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">还没有配置模型</p>
          <p className="mt-1 text-sm text-muted-foreground">
            你可以手动添加供应商，并为每个模型选择 OpenAI 或 Anthropic 协议。
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              手动添加
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleInitDefaults}
              disabled={initLoading}
            >
              {initLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              初始化默认平台
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">评分榜</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead>评分</TableHead>
                    <TableHead>成功率</TableHead>
                    <TableHead>均值耗时</TableHead>
                    <TableHead>实时耗时</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedModels.map((item) => {
                    const evaluation = item.evaluation;
                    const isSelected = selectedStatus?.model.id === item.model.id;
                    return (
                      <TableRow
                        key={item.model.id}
                        data-state={isSelected ? 'selected' : undefined}
                        className="cursor-pointer"
                        onClick={() => setSelectedModelId(item.model.id)}
                      >
                        <TableCell>
                          <div className="font-medium">{item.model.name}</div>
                          <div className="text-xs text-muted-foreground">{item.model.model_id}</div>
                        </TableCell>
                        <TableCell>{item.platform.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold ${scoreTone(evaluation?.score)}`}>
                              {evaluation?.score ?? '-'}
                            </span>
                            <span className="hidden max-w-[160px] truncate text-xs text-muted-foreground md:inline">
                              {evaluation?.level ?? '待评估'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{evaluation ? formatPercent(evaluation.success_rate, 1) : '-'}</TableCell>
                        <TableCell>{formatLatency(evaluation?.avg_latency_ms)}</TableCell>
                        <TableCell>{formatLatestPing(item)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                handlePing(item.model.id);
                              }}
                              disabled={pingLoading || evaluationLoading}
                            >
                              <Zap className="mr-1 h-4 w-4" />
                              延迟
                            </Button>
                            <Button
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleEvaluate(item.model.id);
                              }}
                              disabled={evaluationLoading}
                            >
                              {evaluatingId === item.model.id ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="mr-1 h-4 w-4" />
                              )}
                              评估
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{selectedStatus?.model.name ?? '模型详情'}</CardTitle>
                    <p className="truncate text-sm text-muted-foreground">
                      {selectedStatus ? `${selectedStatus.platform.name} · ${selectedStatus.model.model_id}` : '请选择模型'}
                    </p>
                  </div>
                  {selectedStatus && (
                    <Button size="icon" variant="outline" onClick={() => openEditDialog(selectedStatus.platform as Platform)}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex items-end gap-4">
                  <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-lg text-3xl font-semibold ${scoreTone(selectedStatus?.evaluation?.score)}`}>
                    {selectedStatus?.evaluation?.score ?? '-'}
                  </div>
                  <div className="min-w-0 pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{selectedStatus?.evaluation?.level ?? '暂无综合评估报告'}</div>
                      {selectedStatus?.evaluation && !selectedStatus.evaluation.evaluation_complete && (
                        <Badge variant="outline">评估不完整</Badge>
                      )}
                    </div>
                    {selectedStatus?.evaluation && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        原始能力分 {selectedStatus.evaluation.raw_score} · 延迟惩罚 {formatPenalty(selectedStatus.evaluation.latency_penalty)} · 成功率系数 x{selectedStatus.evaluation.success_rate.toFixed(2)}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {selectedStatus?.evaluation?.created_at
                        ? new Date(selectedStatus.evaluation.created_at).toLocaleString()
                        : '运行评估后生成'}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedStatus?.evaluation ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="rounded-lg bg-muted p-3">
                        <div className="font-semibold">{formatPercent(selectedStatus.evaluation.success_rate, 1)}</div>
                        <div className="text-xs text-muted-foreground">调用成功</div>
                      </div>
                      <div className="rounded-lg bg-muted p-3">
                        <div className="font-semibold">{formatLatency(selectedStatus.evaluation.avg_latency_ms)}</div>
                        <div className="text-xs text-muted-foreground">均值耗时</div>
                      </div>
                      <div className="rounded-lg bg-muted p-3">
                        <div className="font-semibold">{formatPercent(selectedStatus.evaluation.timeout_rate, 0)}</div>
                        <div className="text-xs text-muted-foreground">超时率</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center text-sm">
                      <div className="rounded-lg bg-muted p-3">
                        <div className="font-semibold">{formatLatestPing(selectedStatus)}</div>
                        <div className="text-xs text-muted-foreground">最近延迟探测</div>
                      </div>
                      <div className="rounded-lg bg-muted p-3">
                        <div className="font-semibold">
                          {selectedStatus.latest?.created_at
                            ? new Date(selectedStatus.latest.created_at).toLocaleTimeString()
                            : '-'}
                        </div>
                        <div className="text-xs text-muted-foreground">最近探测时间</div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {selectedStatus.evaluation.summary.map(item => (
                        <CaseMetric key={item.case} item={item} />
                      ))}
                    </div>

                    <div className="space-y-3">
                      {selectedStatus.evaluation.notes.length > 0 && (
                        <div>
                          <div className="mb-2 text-sm font-medium">通过项</div>
                          <div className="flex flex-wrap gap-2">
                            {selectedStatus.evaluation.notes.map(note => (
                              <Badge key={note} variant="secondary">{note}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedStatus.evaluation.risks.length > 0 && (
                        <div>
                          <div className="mb-2 text-sm font-medium">风险项</div>
                          <div className="flex flex-wrap gap-2">
                            {selectedStatus.evaluation.risks.map(risk => (
                              <Badge key={risk} variant="destructive">{risk}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed text-center">
                    <Sparkles className="mb-3 h-9 w-9 text-muted-foreground" />
                    <p className="font-medium">这个模型还没有综合评分</p>
                    <p className="mt-1 max-w-[300px] text-sm text-muted-foreground">
                      点击评估会执行多轮真实调用，耗时取决于平台响应速度。
                    </p>
                    {selectedStatus && (
                      <Button className="mt-4" onClick={() => handleEvaluate(selectedStatus.model.id)} disabled={evaluationLoading}>
                        {evaluatingId === selectedStatus.model.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        开始评估
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">供应商管理</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {typedPlatforms.map(item => (
                  <div key={item.platform.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{item.platform.name}</div>
                      <div className="text-xs text-muted-foreground">{item.models.length} 个模型</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openEditDialog(item.platform as Platform)}>
                      <Settings className="mr-1 h-4 w-4" />
                      配置
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <PlatformManagementDialog
        open={managementDialogOpen}
        onOpenChange={setManagementDialogOpen}
        platform={editingPlatform}
        onSuccess={loadStatus}
        mode={editingPlatform ? 'edit' : 'create'}
      />
    </div>
  );
}
