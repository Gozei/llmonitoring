/**
 * 延迟记录历史表格组件
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { useHistory } from './use-api';
import type { PingRecord } from './types';

interface HistoryTableProps {
  modelId: number;
  modelName?: string;
  platformName?: string;
  onBack?: () => void;
}

export function HistoryTable({ modelId, modelName, platformName, onBack }: HistoryTableProps) {
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { records, fetchHistory, loading, error } = useHistory();

  const loadData = useCallback(async () => {
    await fetchHistory(modelId, pageSize, page * pageSize);
  }, [modelId, page, fetchHistory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getStatusBadge = (status: PingRecord['status']) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>;
      case 'error':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Error</Badge>;
      case 'timeout':
        return <Badge className="bg-yellow-500"><AlertCircle className="h-3 w-3 mr-1" />Timeout</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const formatLatency = (ms: number | null) => {
    if (ms === null || ms === undefined) return '-';
    return `${ms}ms`;
  };

  const typedRecords = records as PingRecord[];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            <CardTitle>
              {modelName || `Model #${modelId}`}
              {platformName && <span className="text-muted-foreground ml-2"> - {platformName}</span>}
            </CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive mb-4">
            {error}
          </div>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Latency</TableHead>
                <TableHead className="text-right">TTFT</TableHead>
                <TableHead className="text-right">Total Time</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && typedRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : typedRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                typedRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-sm">
                      {formatTime(record.created_at)}
                    </TableCell>
                    <TableCell>{getStatusBadge(record.status)}</TableCell>
                    <TableCell className="text-right font-mono">
                      <div className="flex items-center justify-end gap-1">
                        {record.status === 'success' && <Clock className="h-3 w-3 text-muted-foreground" />}
                        {formatLatency(record.latency_ms)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatLatency(record.ttft_ms)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatLatency(record.total_time_ms)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {record.error_message || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* 分页 */}
        {typedRecords.length > 0 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {page * pageSize + 1} - {page * pageSize + typedRecords.length} records
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={typedRecords.length < pageSize || loading}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
