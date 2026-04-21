'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, ArrowLeft, Clock3, Loader2, RefreshCw, Timer, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useStatus } from './use-api';
import type { ModelStatus } from './types';

type SortKey = 'score' | 'success_rate' | 'avg_latency' | 'latest_latency';
type SortOrder = 'asc' | 'desc';

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatLatency(value: number | null | undefined): string {
  if (!value) return '-';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

function getLatestLatencyValue(item: ModelStatus): number | null {
  if (item.latest?.status === 'success' && item.latest.latency_ms) {
    return item.latest.latency_ms;
  }
  return null;
}

function getAvgLatencyValue(item: ModelStatus): number | null {
  return item.evaluation?.avg_latency_ms ?? null;
}

function getSuccessRateValue(item: ModelStatus): number | null {
  return item.evaluation?.success_rate ?? null;
}

function getScoreValue(item: ModelStatus): number | null {
  return item.evaluation?.score ?? null;
}

function sortValue(item: ModelStatus, key: SortKey): number | null {
  switch (key) {
    case 'score':
      return getScoreValue(item);
    case 'success_rate':
      return getSuccessRateValue(item);
    case 'avg_latency':
      return getAvgLatencyValue(item);
    case 'latest_latency':
      return getLatestLatencyValue(item);
    default:
      return null;
  }
}

function compareNumbers(a: number | null, b: number | null, order: SortOrder, lowerIsBetter = false): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const direction = order === 'asc' ? 1 : -1;
  const baseline = (a - b) * direction;
  return lowerIsBetter ? -baseline : baseline;
}

function scoreTone(score: number | null | undefined): string {
  if (score == null) return 'bg-muted text-muted-foreground';
  if (score >= 80) return 'bg-emerald-600 text-white';
  if (score >= 60) return 'bg-cyan-600 text-white';
  if (score >= 40) return 'bg-amber-500 text-white';
  return 'bg-rose-600 text-white';
}

const SORT_META: Record<SortKey, { label: string; lowerIsBetter?: boolean }> = {
  score: { label: '评分' },
  success_rate: { label: '成功率' },
  avg_latency: { label: '均值耗时', lowerIsBetter: true },
  latest_latency: { label: '实时耗时', lowerIsBetter: true },
};

export function RankingsBoard() {
  const { statuses, fetchStatus, loading, error } = useStatus();
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const typedStatuses = statuses as ModelStatus[];

  const loadStatus = useCallback(async () => {
    await fetchStatus(24);
  }, [fetchStatus]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const sortedRows = useMemo(() => {
    const lowerIsBetter = SORT_META[sortKey].lowerIsBetter ?? false;
    return [...typedStatuses].sort((left, right) => {
      const primary = compareNumbers(
        sortValue(left, sortKey),
        sortValue(right, sortKey),
        sortOrder,
        lowerIsBetter
      );
      if (primary !== 0) return primary;

      const secondary = compareNumbers(getScoreValue(left), getScoreValue(right), 'desc');
      if (secondary !== 0) return secondary;

      return left.model.id - right.model.id;
    });
  }, [sortKey, sortOrder, typedStatuses]);

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-8 md:px-6 md:py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            返回评测台
          </Link>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">评分榜</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            按最终评分、成功率、均值耗时、实时耗时切换排序，专门用来横向比较模型表现。
          </p>
        </div>
        <Button variant="outline" onClick={loadStatus} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-base">模型排行</CardTitle>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Tabs value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
                <TabsList>
                  <TabsTrigger value="score"><TrendingUp className="h-4 w-4" />评分</TabsTrigger>
                  <TabsTrigger value="success_rate">成功率</TabsTrigger>
                  <TabsTrigger value="avg_latency"><Clock3 className="h-4 w-4" />均值耗时</TabsTrigger>
                  <TabsTrigger value="latest_latency"><Timer className="h-4 w-4" />实时耗时</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder((prev) => prev === 'desc' ? 'asc' : 'desc')}
              >
                <ArrowDownUp className="mr-2 h-4 w-4" />
                {sortOrder === 'desc' ? '当前降序' : '当前升序'}
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            当前按「{SORT_META[sortKey].label}」{sortOrder === 'desc' ? '降序' : '升序'}排列
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名次</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>平台</TableHead>
                <TableHead>评分</TableHead>
                <TableHead>成功率</TableHead>
                <TableHead>均值耗时</TableHead>
                <TableHead>实时耗时</TableHead>
                <TableHead>最近评估</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((item, index) => (
                <TableRow key={item.model.id}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{item.model.name}</div>
                    <div className="text-xs text-muted-foreground">{item.model.model_id}</div>
                  </TableCell>
                  <TableCell>{item.platform.name}</TableCell>
                  <TableCell>
                    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold ${scoreTone(item.evaluation?.score)}`}>
                      {item.evaluation?.score ?? '-'}
                    </span>
                  </TableCell>
                  <TableCell>{item.evaluation ? formatPercent(item.evaluation.success_rate) : '-'}</TableCell>
                  <TableCell>{formatLatency(item.evaluation?.avg_latency_ms)}</TableCell>
                  <TableCell>
                    {item.latest?.status === 'success'
                      ? formatLatency(item.latest.latency_ms)
                      : item.latest?.status === 'timeout'
                        ? '超时'
                        : item.latest?.status === 'error'
                          ? '失败'
                          : '-'}
                  </TableCell>
                  <TableCell>
                    {item.evaluation?.created_at
                      ? new Date(item.evaluation.created_at).toLocaleString()
                      : <Badge variant="secondary">待评估</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
