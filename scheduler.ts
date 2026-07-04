/**
 * ============================================================
 *  Scheduler - 高鲁棒性并发调度器
 * ============================================================
 *
 * 特性：
 *  1. 限制最大并发数（默认 3），动态 addTask，严格推断返回值类型 T
 *  2. 支持全局取消：
 *     - 可在构造时传入外部 AbortSignal，也可随时调用 cancelAll()
 *     - 已发出（运行中）的任务：调用 xhr.abort()
 *     - 未发出（排队中）的任务：直接丢弃（reject），不会创建 xhr
 *  3. 每个任务自带超时（Timeout）：
 *     - 超时后 abort 当前请求，重试 1 次
 *     - 重试依然要重新排队，占用并发槽位（不绕过并发限制）
 *  4. 防内存泄漏：
 *     - 任务 settle 后立即清空 resolve/reject/executor/xhr 引用
 *     - 清除所有定时器
 *     - 从内部任务集合中移除
 *     - cancelAll 后移除外部 AbortSignal 的监听器
 *
 * 使用方式：
 *
 *   const scheduler = new Scheduler(3);
 *
 *   const p = scheduler.addTask<{ id: number }>((registerXhr) => {
 *     return new Promise((resolve, reject) => {
 *       const xhr = new XMLHttpRequest();
 *       registerXhr(xhr); // 关键：把 xhr 交给调度器托管
 *       xhr.open('GET', '/api/item/1');
 *       xhr.onload = () => resolve(JSON.parse(xhr.responseText));
 *       xhr.onerror = () => reject(new Error('network error'));
 *       xhr.onabort = () => reject(new SchedulerAbortError('aborted'));
 *       xhr.send();
 *     });
 *   }, { timeout: 5000 });
 *
 *   // 全局取消（比如路由跳转 / 组件卸载）
 *   scheduler.cancelAll();
 *
 * ============================================================
 */

/** 供业务代码把创建出来的 XMLHttpRequest 实例托管给调度器 */
export type RegisterXhr = (xhr: XMLHttpRequest) => void;

/**
 * 任务执行器：
 *  - 入参 registerXhr 用于把本次请求实际使用的 xhr 实例注册给调度器，
 *    这样调度器在超时/取消时才能够真正调用 xhr.abort()。
 *  - 返回 Promise<T>，T 由调用处上下文严格推断。
 */
export type TaskExecutor<T> = (registerXhr: RegisterXhr) => Promise<T>;

export interface TaskOptions {
  /** 单个任务的超时时间（毫秒），默认 10000ms */
  timeout?: number;
}

/** 任务被全局取消 / 排队中被丢弃 时抛出 */
export class SchedulerAbortError extends Error {
  constructor(message = "Task aborted") {
    super(message);
    this.name = "SchedulerAbortError";
  }
}

/** 任务超时且重试后仍失败时抛出 */
export class SchedulerTimeoutError extends Error {
  constructor(message = "Task timeout") {
    super(message);
    this.name = "SchedulerTimeoutError";
  }
}

type TaskStatus = "pending" | "running" | "settled";

interface InternalTask<T> {
  readonly id: number;
  executor: TaskExecutor<T> | null;
  readonly timeout: number;
  resolve: ((value: T) => void) | null;
  reject: ((reason?: unknown) => void) | null;
  retried: boolean;
  status: TaskStatus;
  currentXhr: XMLHttpRequest | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_TIMEOUT = 10_000;

export class Scheduler {
  private readonly concurrency: number;
  private running = 0;
  private idCounter = 0;
  private aborted = false;

  /** 等待被调度执行的任务（尚未占用并发槽位） */
  private readonly queue: InternalTask<any>[] = [];
  /** 当前存活（排队中 + 运行中）的全部任务，便于统一取消 */
  private readonly liveTasks = new Set<InternalTask<any>>();

  private readonly externalSignal?: AbortSignal;
  private readonly handleExternalAbort = (): void => this.cancelAll();

  /**
   * @param concurrency 最大并发数，默认 3
   * @param signal 外部 AbortSignal，abort 时等价于调用 cancelAll()
   */
  constructor(concurrency = 3, signal?: AbortSignal) {
    if (concurrency < 1) {
      throw new RangeError("concurrency must be >= 1");
    }
    this.concurrency = concurrency;

    if (signal) {
      this.externalSignal = signal;
      if (signal.aborted) {
        this.aborted = true;
      } else {
        signal.addEventListener("abort", this.handleExternalAbort);
      }
    }
  }

  /**
   * 动态添加一个任务。
   * T 通过 executor 的返回类型 Promise<T> 严格推断，无需手动指定泛型
   * （当然也可以显式 addTask<Foo>(...) 来强约束）。
   */
  addTask<T>(executor: TaskExecutor<T>, options: TaskOptions = {}): Promise<T> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    if (this.aborted) {
      return Promise.reject(
        new SchedulerAbortError("Scheduler has already been cancelled")
      );
    }

    return new Promise<T>((resolve, reject) => {
      const task: InternalTask<T> = {
        id: ++this.idCounter,
        executor,
        timeout,
        resolve,
        reject,
        retried: false,
        status: "pending",
        currentXhr: null,
        timeoutTimer: null,
      };
      this.liveTasks.add(task);
      this.enqueue(task);
    });
  }

  /** 全局取消：排队中的任务直接丢弃；运行中的任务 abort 底层请求 */
  cancelAll(): void {
    if (this.aborted) return;
    this.aborted = true;

    // 1. 丢弃所有尚未发出请求的排队任务
    const queued = this.queue.splice(0, this.queue.length);
    for (const task of queued) {
      this.settleTask(
        task,
        undefined,
        new SchedulerAbortError(`Task ${task.id} discarded before dispatch`)
      );
    }

    // 2. 中断所有正在运行（已发出请求）的任务
    for (const task of Array.from(this.liveTasks)) {
      if (task.status === "running") {
        if (task.timeoutTimer) {
          clearTimeout(task.timeoutTimer);
          task.timeoutTimer = null;
        }
        if (task.currentXhr) {
          try {
            task.currentXhr.abort();
          } catch {
            /* 忽略 abort 过程中的异常 */
          }
        }
        this.running--;
        this.settleTask(
          task,
          undefined,
          new SchedulerAbortError(`Task ${task.id} aborted`)
        );
      }
    }

    this.liveTasks.clear();

    if (this.externalSignal) {
      this.externalSignal.removeEventListener("abort", this.handleExternalAbort);
    }
  }

  /** 当前排队中的任务数 */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** 当前运行中的任务数 */
  get runningCount(): number {
    return this.running;
  }

  /** 便捷别名：销毁调度器（等价于 cancelAll） */
  destroy(): void {
    this.cancelAll();
  }

  // ------------------------------------------------------------------
  // 内部实现
  // ------------------------------------------------------------------

  private enqueue(task: InternalTask<any>): void {
    this.queue.push(task);
    this.drain();
  }

  private drain(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;
      this.dispatch(task);
    }
  }

  /** 真正把一个任务从排队态推进到运行态，占用一个并发槽位 */
  private dispatch<T>(task: InternalTask<T>): void {
    if (task.status === "settled") return;

    task.status = "running";
    this.running++;

    // settledLocally 用于避免本次 run() 闭包内的重复处理，
    // 而 task.status === 'settled' 用于避免与外部 cancelAll() 的竞态。
    let settledLocally = false;

    const releaseSlot = (): void => {
      if (task.timeoutTimer) {
        clearTimeout(task.timeoutTimer);
        task.timeoutTimer = null;
      }
      task.currentXhr = null;
      this.running--;
      this.drain();
    };

    // 超时定时器
    task.timeoutTimer = setTimeout(() => {
      if (settledLocally || task.status === "settled") return;
      settledLocally = true;

      if (task.currentXhr) {
        try {
          task.currentXhr.abort();
        } catch {
          /* 忽略 */
        }
      }

      releaseSlot();

      if (!task.retried) {
        // 超时重试 1 次：重新排队，重新竞争并发槽位
        task.retried = true;
        task.status = "pending";
        if (!this.aborted) {
          this.enqueue(task);
        } else {
          this.settleTask(
            task,
            undefined,
            new SchedulerAbortError(`Task ${task.id} discarded before retry`)
          );
        }
      } else {
        this.settleTask(
          task,
          undefined,
          new SchedulerTimeoutError(
            `Task ${task.id} timed out after 1 retry (limit ${task.timeout}ms)`
          )
        );
      }
    }, task.timeout);

    const registerXhr: RegisterXhr = (xhr) => {
      task.currentXhr = xhr;
    };

    const executor = task.executor;
    if (!executor) {
      // 理论上不会发生：executor 只有 settle 后才会被置空
      releaseSlot();
      this.settleTask(task, undefined, new SchedulerAbortError("Task executor missing"));
      return;
    }

    Promise.resolve()
      .then(() => executor(registerXhr))
      .then((result) => {
        if (settledLocally || task.status === "settled") return;
        settledLocally = true;
        releaseSlot();
        this.settleTask(task, result, undefined);
      })
      .catch((err: unknown) => {
        if (settledLocally || task.status === "settled") return;
        settledLocally = true;
        releaseSlot();
        this.settleTask(task, undefined, err);
      });
  }

  /**
   * 唯一的任务终结入口：无论成功/失败/超时/取消，都必须经过这里，
   * 从而保证引用清理逻辑只写一份、不会遗漏。
   */
  private settleTask<T>(
    task: InternalTask<T>,
    value: T | undefined,
    error: unknown
  ): void {
    if (task.status === "settled") return;
    task.status = "settled";

    this.liveTasks.delete(task);

    const resolve = task.resolve;
    const reject = task.reject;

    // 主动断开所有引用，防止闭包/定时器长期持有大对象造成泄漏
    task.resolve = null;
    task.reject = null;
    task.executor = null;
    task.currentXhr = null;
    if (task.timeoutTimer) {
      clearTimeout(task.timeoutTimer);
      task.timeoutTimer = null;
    }

    if (error !== undefined) {
      reject?.(error);
    } else {
      resolve?.(value as T);
    }
  }
}
