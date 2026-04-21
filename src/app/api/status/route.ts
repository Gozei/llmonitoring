/**
 * 状态查询 API
 * GET /api/status - 获取监控状态概览
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllModelsStatus } from '@/lib/monitoring/database';

interface ModelStats {
  avg_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  success_count: number;
  error_count: number;
  total_count: number;
  success_rate: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const hours = parseInt(searchParams.get('hours') || '24', 10);

    const statuses = await getAllModelsStatus(hours);

    // 计算总体统计
    const totalStats = {
      total_models: statuses.length,
      active_models: statuses.filter(s => s.model.is_active).length,
      avg_latency: statuses
        .filter(s => s.latest?.status === 'success' && s.latest?.latency_ms)
        .reduce((sum, s, _, arr) => sum + (s.latest!.latency_ms! / arr.length), 0),
      total_tests: statuses.reduce((sum, s) => sum + (s.stats as ModelStats).total_count, 0),
      overall_success_rate: statuses.length > 0
        ? (statuses.reduce((sum, s) => sum + (s.stats as ModelStats).success_count, 0) /
           Math.max(statuses.reduce((sum, s) => sum + (s.stats as ModelStats).total_count, 0), 1)) * 100
        : 0,
    };

    // 按平台分组
    const byPlatform = new Map<number, typeof statuses>();
    for (const status of statuses) {
      if (!byPlatform.has(status.platform.id)) {
        byPlatform.set(status.platform.id, []);
      }
      byPlatform.get(status.platform.id)!.push(status);
    }

    const platforms = Array.from(byPlatform.entries()).map(([platformId, modelStatuses]) => ({
      platform: modelStatuses[0].platform,
      models: modelStatuses,
      stats: {
        avg_latency: modelStatuses
          .filter(s => s.latest?.status === 'success' && s.latest?.latency_ms)
          .reduce((sum, s, _, arr) => sum + (s.latest!.latency_ms! / arr.length), 0),
        total_tests: modelStatuses.reduce((sum, s) => sum + (s.stats as ModelStats).total_count, 0),
        success_rate: modelStatuses.length > 0
          ? (modelStatuses.reduce((sum, s) => sum + (s.stats as ModelStats).success_count, 0) /
             Math.max(modelStatuses.reduce((sum, s) => sum + (s.stats as ModelStats).total_count, 0), 1)) * 100
          : 0,
      },
    }));

    return NextResponse.json({
      success: true,
      data: {
        statuses,
        platforms,
        summary: totalStats,
      },
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取状态失败' },
      { status: 500 }
    );
  }
}
