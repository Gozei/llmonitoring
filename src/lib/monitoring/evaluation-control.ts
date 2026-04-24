type EvaluationTask = {
  taskId: string;
  modelId: number;
  controller: AbortController;
  canceled: boolean;
};

const tasksById = new Map<string, EvaluationTask>();
const taskIdsByModel = new Map<number, string>();

export function startEvaluationTask(taskId: string, modelId: number): {
  ok: boolean;
  signal?: AbortSignal;
  activeTaskId?: string;
} {
  const activeTaskId = taskIdsByModel.get(modelId);
  if (activeTaskId && tasksById.has(activeTaskId)) {
    return {
      ok: false,
      activeTaskId,
    };
  }

  const task: EvaluationTask = {
    taskId,
    modelId,
    controller: new AbortController(),
    canceled: false,
  };

  tasksById.set(taskId, task);
  taskIdsByModel.set(modelId, taskId);

  return {
    ok: true,
    signal: task.controller.signal,
  };
}

export function cancelEvaluationTask(taskId: string): boolean {
  const task = tasksById.get(taskId);
  if (!task) return false;

  task.canceled = true;
  task.controller.abort();
  return true;
}

export function isEvaluationTaskCanceled(taskId: string): boolean {
  return tasksById.get(taskId)?.canceled ?? false;
}

export function listActiveEvaluationTasks(): Array<{ taskId: string; modelId: number }> {
  return Array.from(tasksById.values()).map(task => ({
    taskId: task.taskId,
    modelId: task.modelId,
  }));
}

export function finishEvaluationTask(taskId: string): void {
  const task = tasksById.get(taskId);
  if (!task) return;

  tasksById.delete(taskId);
  if (taskIdsByModel.get(task.modelId) === taskId) {
    taskIdsByModel.delete(task.modelId);
  }
}
