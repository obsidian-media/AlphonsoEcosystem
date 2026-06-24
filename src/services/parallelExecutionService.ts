export interface ParallelTask<T> {
  id: string;
  execute: () => Promise<T>;
  priority?: number;
  timeout?: number;
}

export interface ParallelResult<T> {
  id: string;
  success: boolean;
  result?: T;
  error?: Error;
  durationMs: number;
}

export interface ParallelExecutionOptions {
  maxConcurrency?: number;
  failFast?: boolean;
  timeout?: number;
}

export async function executeParallel<T>(
  tasks: ParallelTask<T>[],
  options: ParallelExecutionOptions = {}
): Promise<ParallelResult<T>[]> {
  const { maxConcurrency = 5, failFast = false, timeout = 30000 } = options;

  const results: ParallelResult<T>[] = [];
  const sortedTasks = [...tasks].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  let currentIndex = 0;
  let hasFailed = false;

  async function executeNext(): Promise<void> {
    if (hasFailed && failFast) return;
    if (currentIndex >= sortedTasks.length) return;

    const task = sortedTasks[currentIndex++];
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        task.execute(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Task timeout')), task.timeout || timeout)
        ),
      ]);

      results.push({
        id: task.id,
        success: true,
        result,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      results.push({
        id: task.id,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        durationMs: Date.now() - startTime,
      });

      if (failFast) {
        hasFailed = true;
      }
    }

    await executeNext();
  }

  const workers = Array(Math.min(maxConcurrency, sortedTasks.length))
    .fill(null)
    .map(() => executeNext());

  await Promise.all(workers);

  return results;
}

export async function executeBatch<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<any>,
  maxConcurrency: number = 5
): Promise<any[]> {
  const tasks: ParallelTask<any>[] = items.map((item, index) => ({
    id: `batch-${index}`,
    execute: () => processor(item, index),
  }));

  const results = await executeParallel(tasks, { maxConcurrency });
  return results.map((r) => (r.success ? r.result : null));
}

export async function executeWithRetry<T>(
  task: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error('Task failed after retries');
}

export function createTaskQueue<T>(maxConcurrency: number = 5) {
  const queue: ParallelTask<T>[] = [];
  let currentRun: Promise<void> | null = null;

  function processQueue(): Promise<void> {
    if (currentRun) return currentRun;
    if (queue.length === 0) return Promise.resolve();

    currentRun = (async () => {
      while (queue.length > 0) {
        const batch = queue.splice(0, maxConcurrency);
        await executeParallel(batch, { maxConcurrency });
      }
      currentRun = null;
    })();

    return currentRun;
  }

  return {
    add(task: ParallelTask<T>): void {
      queue.push(task);
      processQueue();
    },

    addMany(tasks: ParallelTask<T>[]): void {
      queue.push(...tasks);
      processQueue();
    },

    async flush(): Promise<void> {
      await processQueue();
      if (currentRun) await currentRun;
    },

    get size(): number {
      return queue.length;
    },
  };
}
