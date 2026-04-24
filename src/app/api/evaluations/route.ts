/**
 * 模型综合评估 API
 * GET /api/evaluations - 获取最新评估记录
 * POST /api/evaluations - 评估单个模型
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAllModelsStatus,
  getLatestEvaluationByModel,
  getModelWithPlatformById,
  insertEvaluationRecord,
} from '@/lib/monitoring/database';
import {
  cancelEvaluationTask,
  finishEvaluationTask,
  isEvaluationTaskCanceled,
  listActiveEvaluationTasks,
  startEvaluationTask,
} from '@/lib/monitoring/evaluation-control';
import { EvaluationCancelledError, evaluateModel } from '@/lib/monitoring/evaluator';
import { z, ZodError } from 'zod';

const evaluationRequestSchema = z.object({
  model_id: z.number().int().positive(),
  task_id: z.string().min(1),
});

const cancelEvaluationSchema = z.object({
  task_id: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const modelId = request.nextUrl.searchParams.get('model_id');
    const activeOnly = request.nextUrl.searchParams.get('active');

    if (activeOnly === '1') {
      return NextResponse.json({
        success: true,
        data: {
          active_tasks: listActiveEvaluationTasks(),
        },
      });
    }

    if (modelId) {
      const evaluation = await getLatestEvaluationByModel(Number(modelId));
      return NextResponse.json({
        success: true,
        data: evaluation,
      });
    }

    const statuses = await getAllModelsStatus(24);
    return NextResponse.json({
      success: true,
      data: statuses.map(status => ({
        model: status.model,
        platform: status.platform,
        evaluation: status.evaluation,
      })),
    });
  } catch (error) {
    console.error('Error fetching evaluations:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '获取评估记录失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model_id, task_id } = evaluationRequestSchema.parse(body);
    console.log(`[api/evaluations] request received model_id=${model_id} task_id=${task_id}`);
    const modelWithPlatform = await getModelWithPlatformById(model_id);

    if (!modelWithPlatform) {
      console.log(`[api/evaluations] model not found model_id=${model_id}`);
      return NextResponse.json(
        { success: false, error: '模型不存在' },
        { status: 404 }
      );
    }

    if (!modelWithPlatform.platform.api_key) {
      console.log(
        `[api/evaluations] missing api_key platform="${modelWithPlatform.platform.name}" model="${modelWithPlatform.name}"`
      );
      return NextResponse.json(
        { success: false, error: '该平台未配置 API Key，无法执行综合评估' },
        { status: 400 }
      );
    }

    const task = startEvaluationTask(task_id, model_id);
    if (!task.ok) {
      return NextResponse.json(
        { success: false, error: '该模型已有评估任务进行中', active_task_id: task.activeTaskId },
        { status: 409 }
      );
    }

    try {
      const report = await evaluateModel(modelWithPlatform.platform, modelWithPlatform, {
        cancelSignal: task.signal,
        isCancelled: () => isEvaluationTaskCanceled(task_id),
      });

      if (isEvaluationTaskCanceled(task_id)) {
        throw new EvaluationCancelledError();
      }

      const record = await insertEvaluationRecord({
        model_id: modelWithPlatform.id,
        platform_id: modelWithPlatform.platform_id,
        final_score: report.final_score,
        summary: report.summary,
        raw_logs: report.raw_logs,
      });

      console.log(
        `[api/evaluations] persisted record_id=${record.id} model_id=${record.model_id} score=${record.score} success_rate=${record.success_rate} timeout_rate=${record.timeout_rate}`
      );

      return NextResponse.json({
        success: true,
        data: {
          record,
          report,
        },
      });
    } catch (error) {
      if (error instanceof EvaluationCancelledError) {
        console.log(`[api/evaluations] cancelled model_id=${model_id} task_id=${task_id}`);
        return NextResponse.json(
          { success: false, canceled: true, error: '评估已取消' },
          { status: 499 }
        );
      }

      throw error;
    } finally {
      finishEvaluationTask(task_id);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      console.log('[api/evaluations] validation error', error.issues);
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error running evaluation:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '执行综合评估失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { task_id } = cancelEvaluationSchema.parse(body);
    const cancelled = cancelEvaluationTask(task_id);

    return NextResponse.json({
      success: true,
      data: {
        task_id,
        cancelled,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '取消评估失败' },
      { status: 500 }
    );
  }
}
