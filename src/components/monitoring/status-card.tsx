/**
 * 模型状态卡片组件
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2
} from 'lucide-react';
import type { ModelStatus } from './types';

interface StatusCardProps {
  status: ModelStatus;
  onPing: (id: number) => void;
  onViewHistory: (id: number) => void;
  isPinging?: boolean;
}

export function StatusCard({ status, onPing, onViewHistory, isPinging }: StatusCardProps) {
  const { model, latest, stats } = status;

  const getStatusIcon = () => {
    if (isPinging) return <Loader2 className="h-4 w-4 animate-spin" />;
    switch (latest?.status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'timeout':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (latest?.status) {
      case 'success':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'timeout':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-400';
    }
  };

  const formatLatency = (ms: number | null) => {
    if (ms === null || ms === undefined) return '-';
    return `${ms}ms`;
  };

  const formatTime = (isoString: string | undefined) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleTimeString();
  };

  const latencyPercent = Math.min((stats.avg_latency_ms / 25000) * 100, 100);

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
            <CardTitle className="text-base">{model.name}</CardTitle>
            {getStatusIcon()}
          </div>
          <Badge variant={model.is_active ? 'default' : 'secondary'}>
            {model.is_active ? '启用' : '停用'}
          </Badge>
        </div>
        <CardDescription>
          {model.model_id} • {model.platform?.name}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 延迟信息 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>平均延迟</span>
            </div>
            <div className="text-2xl font-bold">{formatLatency(stats.avg_latency_ms)}</div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Activity className="h-3 w-3" />
              <span>成功率</span>
            </div>
            <div className="text-2xl font-bold">{stats.success_rate.toFixed(1)}%</div>
          </div>
        </div>

        {/* 延迟进度条 */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">延迟 (最大 25s)</span>
            <span className="font-medium">{latencyPercent.toFixed(0)}%</span>
          </div>
          <Progress value={latencyPercent} className="h-2" />
        </div>

        {/* 统计数据 */}
        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <div className="space-y-0.5">
            <div className="flex items-center justify-center gap-1 text-green-600">
              <TrendingDown className="h-3 w-3" />
            </div>
            <div className="font-medium">{formatLatency(stats.min_latency_ms)}</div>
            <div className="text-xs text-muted-foreground">最小</div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-center gap-1 text-blue-600">
              <Activity className="h-3 w-3" />
            </div>
            <div className="font-medium">{formatLatency(stats.avg_latency_ms)}</div>
            <div className="text-xs text-muted-foreground">平均</div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-center gap-1 text-red-600">
              <TrendingUp className="h-3 w-3" />
            </div>
            <div className="font-medium">{formatLatency(stats.max_latency_ms)}</div>
            <div className="text-xs text-muted-foreground">最大</div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-center gap-1">
              <RefreshCw className="h-3 w-3" />
            </div>
            <div className="font-medium">{stats.total_count}</div>
            <div className="text-xs text-muted-foreground">测试</div>
          </div>
        </div>

        {/* 最新状态 */}
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            上次测试: {formatTime(latest?.created_at)}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewHistory(model.id)}
              disabled={isPinging}
            >
              历史
            </Button>
            <Button
              size="sm"
              onClick={() => onPing(model.id)}
              disabled={isPinging || !model.is_active}
            >
              {isPinging ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  测试中...
                </>
              ) : (
                '测试'
              )}
            </Button>
          </div>
        </div>

        {/* 错误信息 */}
        {latest?.error_message && (
          <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            <AlertCircle className="inline h-3 w-3 mr-1" />
            {latest.error_message.slice(0, 100)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
