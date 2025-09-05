"use strict";
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
/**
 * Priority levels for tasks
 */
const PRIORITY = {
    HIGH: 3,
    NORMAL: 2,
    LOW: 1,
    SCHEDULED: 0
};
/**
 * Task states
 */
const TASK_STATE = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    RETRY: 'retry',
    DEAD: 'dead'
};
/**
 * Advanced Async Task Queue with priority, scheduling, and dependency management
 */
class AsyncTaskQueue extends EventEmitter {
    /**
     * @param {object} [options]
     * @param {number} [options.concurrency]
     * @param {number} [options.retryAttempts]
     * @param {number} [options.retryDelay]
     * @param {number} [options.taskTimeout]
     * @param {boolean} [options.enablePersistence]
     * @param {boolean} [options.enableMetrics]
     */
    constructor(options = {}) {
        super();
        this.config = {
            concurrency: options.concurrency || 5,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000,
            taskTimeout: options.taskTimeout || 30000,
            enablePersistence: options.enablePersistence || false,
            enableMetrics: options.enableMetrics !== false
        };
        // Different priority queues
        this.queues = {
            high: [],
            normal: [],
            low: [],
            scheduled: new Map(), // Tasks scheduled for future execution
            delayed: new Map() // Tasks with dependencies
        };
        // Task management
        this.tasks = new Map();
        this.runningTasks = new Map();
        this.completedTasks = new Map();
        /** @type {any[]} */
        this.deadLetterQueue = [];
        // Dependencies graph
        this.dependencies = new Map();
        this.dependents = new Map();
        // Metrics
        this.metrics = {
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            retryCount: 0,
            averageExecutionTime: 0,
            queueDepth: 0
        };
        // Start processing
        this.processing = false;
        this.processInterval = null;
    }
    /**
     * Start queue processing
     */
    start() {
        if (this.processing)
            return;
        this.processing = true;
        this.processInterval = setInterval(() => this.processTasks(), 100);
        this.emit('queue:started');
    }
    /**
     * Stop queue processing
     */
    stop() {
        this.processing = false;
        if (this.processInterval) {
            clearInterval(this.processInterval);
            this.processInterval = null;
        }
        this.emit('queue:stopped');
    }
    /**
     * Add a task to the queue
     * @param {object} task - Task configuration
     * @param {string} [task.id]
     * @param {string} [task.name]
     * @param {Function} task.handler
     * @param {object} [task.params]
     * @param {number} [task.priority]
     * @param {number} [task.retryAttempts]
     * @param {number} [task.timeout]
     * @param {string[]} [task.dependencies]
     * @param {number} [task.scheduledTime]
     * @returns {Promise<string>} Task ID
      */
    async addTask(task) {
        const taskId = task.id || uuidv4();
        const taskInfo = {
            id: taskId,
            name: task.name || 'unnamed',
            handler: task.handler,
            params: task.params || {},
            priority: task.priority || PRIORITY.NORMAL,
            retryAttempts: task.retryAttempts ?? this.config.retryAttempts,
            timeout: task.timeout || this.config.taskTimeout,
            dependencies: task.dependencies || [],
            scheduledTime: task.scheduledTime || null,
            createdAt: Date.now(),
            startedAt: null,
            completedAt: null,
            state: TASK_STATE.PENDING,
            result: null,
            error: null,
            attempts: 0
        };
        this.tasks.set(taskId, taskInfo);
        this.metrics.totalTasks++;
        // Handle dependencies
        if (taskInfo.dependencies.length > 0) {
            await this.registerDependencies(taskId, taskInfo.dependencies);
            this.queues.delayed.set(taskId, taskInfo);
        }
        // Handle scheduled tasks
        else if (taskInfo.scheduledTime && taskInfo.scheduledTime > Date.now()) {
            this.queues.scheduled.set(taskId, taskInfo);
            this.scheduleTask(taskId, taskInfo.scheduledTime);
        }
        // Add to priority queue
        else {
            this.enqueueTask(taskInfo);
        }
        this.emit('task:added', { taskId, priority: taskInfo.priority });
        // Start processing if not already running
        if (!this.processing) {
            this.start();
        }
        return taskId;
    }
    /**
     * Enqueue task based on priority
     * @param {any} task
     * @private
      */
    enqueueTask(task) {
        switch (task.priority) {
            case PRIORITY.HIGH:
                // @ts-ignore
                this.queues.high.push(task);
                break;
            case PRIORITY.LOW:
                // @ts-ignore
                this.queues.low.push(task);
                break;
            default:
                // @ts-ignore
                this.queues.normal.push(task);
        }
        this.updateQueueDepth();
    }
    /**
     * Process tasks from queues
     * @private
     */
    async processTasks() {
        // Check if we can process more tasks
        if (this.runningTasks.size >= this.config.concurrency) {
            return;
        }
        // Check scheduled tasks
        this.processScheduledTasks();
        // Get next task based on priority
        const task = this.getNextTask();
        if (!task)
            return;
        // Execute task
        await this.executeTask(task);
    }
    /**
     * Get next task from priority queues
     * @private
     */
    getNextTask() {
        // Priority order: high > normal > low
        if (this.queues.high.length > 0) {
            return this.queues.high.shift();
        }
        if (this.queues.normal.length > 0) {
            return this.queues.normal.shift();
        }
        if (this.queues.low.length > 0) {
            return this.queues.low.shift();
        }
        return null;
    }
    /**
     * Execute a task
     * @param {any} task
     * @private
      */
    async executeTask(task) {
        task.state = TASK_STATE.RUNNING;
        task.startedAt = Date.now();
        task.attempts++;
        this.runningTasks.set(task.id, task);
        this.emit('task:started', { taskId: task.id, attempt: task.attempts });
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Task timeout')), task.timeout);
        });
        try {
            // Execute task with timeout
            const result = await Promise.race([
                this.runTaskHandler(task),
                timeoutPromise
            ]);
            // Task completed successfully
            task.state = TASK_STATE.COMPLETED;
            task.completedAt = Date.now();
            task.result = result;
            this.handleTaskCompletion(task);
        }
        catch (error) {
            // Task failed
            task.error = error instanceof Error ? error.message : String(error);
            if (task.attempts < task.retryAttempts) {
                // Retry task
                await this.retryTask(task);
            }
            else {
                // Move to dead letter queue
                task.state = TASK_STATE.DEAD;
                this.handleTaskFailure(task);
            }
        }
        finally {
            this.runningTasks.delete(task.id);
            this.updateQueueDepth();
        }
    }
    /**
     * Run task handler
     * @param {any} task
     * @private
      */
    async runTaskHandler(task) {
        if (typeof task.handler === 'function') {
            return await task.handler(task.params);
        }
        // If handler is a string, treat it as a tool name
        if (typeof task.handler === 'string') {
            // This would integrate with the tool system
            return { tool: task.handler, params: task.params };
        }
        throw new Error('Invalid task handler');
    }
    /**
     * Handle task completion
     * @param {any} task
     * @private
      */
    handleTaskCompletion(task) {
        // Update metrics
        this.metrics.completedTasks++;
        const duration = task.completedAt - task.startedAt;
        this.updateAverageExecutionTime(duration);
        // Move to completed
        this.completedTasks.set(task.id, task);
        this.tasks.delete(task.id);
        // Emit completion event
        this.emit('task:completed', {
            taskId: task.id,
            result: task.result,
            duration,
            attempts: task.attempts
        });
        // Process dependent tasks
        this.processDependentTasks(task.id);
    }
    /**
     * Handle task failure
     * @param {any} task
     * @private
      */
    handleTaskFailure(task) {
        // Update metrics
        this.metrics.failedTasks++;
        // Move to dead letter queue
        this.deadLetterQueue.push(task);
        this.tasks.delete(task.id);
        // Emit failure event
        this.emit('task:failed', {
            taskId: task.id,
            error: task.error,
            attempts: task.attempts
        });
        // Cancel dependent tasks
        this.cancelDependentTasks(task.id);
    }
    /**
     * Retry a failed task
     * @param {any} task
     * @private
      */
    async retryTask(task) {
        task.state = TASK_STATE.RETRY;
        this.metrics.retryCount++;
        // Exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, task.attempts - 1);
        this.emit('task:retry', {
            taskId: task.id,
            attempt: task.attempts,
            delay
        });
        // Schedule retry
        setTimeout(() => {
            task.state = TASK_STATE.PENDING;
            this.enqueueTask(task);
        }, delay);
    }
    /**
     * Register task dependencies
     * @param {string} taskId
     * @param {string[]} dependencies
     * @private
      */
    async registerDependencies(taskId, dependencies) {
        this.dependencies.set(taskId, new Set(dependencies));
        // Register this task as dependent on each dependency
        for (const depId of dependencies) {
            if (!this.dependents.has(depId)) {
                this.dependents.set(depId, new Set());
            }
            // @ts-ignore
            this.dependents.get(depId).add(taskId);
        }
    }
    /**
     * Process tasks dependent on completed task
     * @param {string} completedTaskId
     * @private
      */
    processDependentTasks(completedTaskId) {
        const dependentTasks = this.dependents.get(completedTaskId);
        if (!dependentTasks)
            return;
        for (const taskId of dependentTasks) {
            const deps = this.dependencies.get(taskId);
            if (deps) {
                deps.delete(completedTaskId);
                // If all dependencies are satisfied, enqueue the task
                if (deps.size === 0) {
                    const task = this.queues.delayed.get(taskId);
                    if (task) {
                        this.queues.delayed.delete(taskId);
                        this.dependencies.delete(taskId);
                        this.enqueueTask(task);
                        this.emit('task:unblocked', { taskId });
                    }
                }
            }
        }
        // Clean up
        this.dependents.delete(completedTaskId);
    }
    /**
     * Cancel tasks dependent on failed task
     * @param {string} failedTaskId
     * @private
      */
    cancelDependentTasks(failedTaskId) {
        const dependentTasks = this.dependents.get(failedTaskId);
        if (!dependentTasks)
            return;
        for (const taskId of dependentTasks) {
            const task = this.queues.delayed.get(taskId);
            if (task) {
                task.state = TASK_STATE.CANCELLED;
                task.error = `Dependency ${failedTaskId} failed`;
                this.queues.delayed.delete(taskId);
                this.dependencies.delete(taskId);
                this.deadLetterQueue.push(task);
                this.emit('task:cancelled', {
                    taskId,
                    reason: `Dependency ${failedTaskId} failed`
                });
                // Recursively cancel dependent tasks
                this.cancelDependentTasks(taskId);
            }
        }
        // Clean up
        this.dependents.delete(failedTaskId);
    }
    /**
     * Schedule a task for future execution
     * @param {string} taskId
     * @param {number} scheduledTime
     * @private
      */
    scheduleTask(taskId, scheduledTime) {
        const delay = scheduledTime - Date.now();
        setTimeout(() => {
            const task = this.queues.scheduled.get(taskId);
            if (task) {
                this.queues.scheduled.delete(taskId);
                this.enqueueTask(task);
                this.emit('task:scheduled', { taskId });
            }
        }, delay);
    }
    /**
     * Process scheduled tasks that are ready
     * @private
     */
    processScheduledTasks() {
        const now = Date.now();
        for (const [taskId, task] of this.queues.scheduled) {
            if (task.scheduledTime <= now) {
                this.queues.scheduled.delete(taskId);
                this.enqueueTask(task);
                this.emit('task:scheduled', { taskId });
            }
        }
    }
    /**
     * Cancel a task
     * @param {string} taskId - Task ID
     */
    async cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
        // Remove from queue
        for (const queue of Object.values(this.queues)) {
            if (Array.isArray(queue)) {
                // @ts-ignore
                const index = queue.findIndex(t => t.id === taskId);
                if (index !== -1) {
                    queue.splice(index, 1);
                }
            }
            else if (queue instanceof Map) {
                queue.delete(taskId);
            }
        }
        // Update task state
        task.state = TASK_STATE.CANCELLED;
        task.error = 'Cancelled by user';
        // Move to dead letter queue
        this.deadLetterQueue.push(task);
        this.tasks.delete(taskId);
        this.emit('task:cancelled', { taskId, reason: 'User cancellation' });
        // Cancel dependent tasks
        this.cancelDependentTasks(taskId);
        return true;
    }
    /**
     * Get task status
     * @param {string} taskId - Task ID
     */
    getTaskStatus(taskId) {
        // Check in various locations
        if (this.tasks.has(taskId)) {
            return this.tasks.get(taskId);
        }
        if (this.runningTasks.has(taskId)) {
            return this.runningTasks.get(taskId);
        }
        if (this.completedTasks.has(taskId)) {
            return this.completedTasks.get(taskId);
        }
        // Check dead letter queue
        // @ts-ignore
        const deadTask = this.deadLetterQueue.find(t => t.id === taskId);
        if (deadTask)
            return deadTask;
        return null;
    }
    /**
     * Retry tasks from dead letter queue
     * @param {number} limit - Maximum number of tasks to retry
     */
    retryDeadLetterQueue(limit = 10) {
        const tasksToRetry = this.deadLetterQueue.splice(0, limit);
        for (const task of tasksToRetry) {
            task.state = TASK_STATE.PENDING;
            task.attempts = 0;
            task.error = null;
            this.tasks.set(task.id, task);
            this.enqueueTask(task);
            this.emit('task:resurrected', { taskId: task.id });
        }
        return tasksToRetry.length;
    }
    /**
     * Update average execution time
     * @param {number} duration
     * @private
      */
    updateAverageExecutionTime(duration) {
        const totalTime = this.metrics.averageExecutionTime * (this.metrics.completedTasks - 1);
        this.metrics.averageExecutionTime = (totalTime + duration) / this.metrics.completedTasks;
    }
    /**
     * Update queue depth metric
     * @private
     */
    updateQueueDepth() {
        this.metrics.queueDepth =
            this.queues.high.length +
                this.queues.normal.length +
                this.queues.low.length +
                this.queues.scheduled.size +
                this.queues.delayed.size;
    }
    /**
     * Get queue metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            runningTasks: this.runningTasks.size,
            deadLetterQueueSize: this.deadLetterQueue.length,
            queueBreakdown: {
                high: this.queues.high.length,
                normal: this.queues.normal.length,
                low: this.queues.low.length,
                scheduled: this.queues.scheduled.size,
                delayed: this.queues.delayed.size
            }
        };
    }
    /**
     * Clear completed tasks
     * @param {number} olderThan - Clear tasks older than this many milliseconds
     */
    clearCompleted(olderThan = 3600000) {
        const now = Date.now();
        const toDelete = [];
        for (const [id, task] of this.completedTasks) {
            if (now - task.completedAt > olderThan) {
                toDelete.push(id);
            }
        }
        toDelete.forEach(id => this.completedTasks.delete(id));
        return toDelete.length;
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.stop();
        // Wait for running tasks to complete
        const timeout = 10000; // 10 seconds
        const startTime = Date.now();
        while (this.runningTasks.size > 0 && Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        // Cancel remaining running tasks
        for (const [taskId] of this.runningTasks) {
            await this.cancelTask(taskId);
        }
        this.emit('queue:shutdown');
    }
}
// Export priority constants
AsyncTaskQueue.PRIORITY = PRIORITY;
AsyncTaskQueue.TASK_STATE = TASK_STATE;
module.exports = { AsyncTaskQueue };
//# sourceMappingURL=AsyncTaskQueue.js.map