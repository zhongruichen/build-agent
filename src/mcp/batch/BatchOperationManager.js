const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * Batch Operation Manager for MCP
 * Handles batch processing, pipeline operations, and transactional execution
 */
class BatchOperationManager extends EventEmitter {
    /**
     * @param {object} [options]
     * @param {number} [options.maxBatchSize]
     * @param {number} [options.batchTimeout]
     * @param {boolean} [options.enableTransaction]
     * @param {number} [options.retryAttempts]
     * @param {number} [options.parallelLimit]
     */
    constructor(options = {}) {
        super();
        
        this.config = {
            maxBatchSize: options.maxBatchSize ?? 100,
            batchTimeout: options.batchTimeout ?? 5000,
            enableTransaction: options.enableTransaction !== false,
            retryAttempts: options.retryAttempts ?? 3,
            parallelLimit: options.parallelLimit ?? 10
        };
        
        this.pendingBatches = new Map();
        this.executingBatches = new Map();
        this.completedBatches = new Map();
        
        this.metrics = {
            totalBatches: 0,
            successfulBatches: 0,
            failedBatches: 0,
            totalOperations: 0,
            averageExecutionTime: 0
        };
    }
    
    /**
     * Execute a batch of operations
     * @param {any[]} operations - Array of operations to execute
     * @param {object} [options]
     * @param {boolean} [options.transactional]
     * @param {boolean} [options.parallel]
     * @param {boolean} [options.continueOnError]
     * @returns {Promise<object>} Batch execution result
      */
     async executeBatch(operations, options = {}) {
         const batchId = this.generateBatchId();
         const startTime = Date.now();
        
         /** @type {any} */
         const batch = {
             id: batchId,
             operations: operations.map((op, index) => ({
                 ...op,
                 id: `${batchId}_op_${index}`,
                 status: 'pending',
                 result: null,
                 error: null
             })),
             options: {
                 ...options,
                 transactional: options.transactional ?? this.config.enableTransaction,
                 parallel: options.parallel ?? false,
                 continueOnError: options.continueOnError ?? false
             },
             status: 'pending',
             startTime,
             endTime: null,
             results: []
         };
        
        this.pendingBatches.set(batchId, batch);
        this.metrics.totalBatches++;
        this.metrics.totalOperations += operations.length;
        
        try {
            // Move to executing
            this.pendingBatches.delete(batchId);
            this.executingBatches.set(batchId, batch);
            batch.status = 'executing';
            
            // Execute based on strategy
            let results;
            if (batch.options.parallel) {
                results = await this.executeParallel(batch);
            } else if (batch.options.transactional) {
                results = await this.executeTransactional(batch);
            } else {
                results = await this.executeSequential(batch);
            }
            
            // Update batch with results
            batch.endTime = Date.now();
            batch.status = 'completed';
            batch.results = results;
            
            // Move to completed
            this.executingBatches.delete(batchId);
            this.completedBatches.set(batchId, batch);
            
            // Update metrics
            this.metrics.successfulBatches++;
            this.updateAverageExecutionTime(batch.endTime - startTime);
            
            this.emit('batch:completed', {
                batchId,
                duration: batch.endTime - startTime,
                operationCount: operations.length,
                successCount: results.filter(r => r.status === 'success').length
            });
            
            return {
                batchId,
                status: 'success',
                results,
                duration: batch.endTime - startTime
            };
            
        } catch (error) {
            batch.endTime = Date.now();
            batch.status = 'failed';
            batch.error = error instanceof Error ? error.message : String(error);
            
            this.executingBatches.delete(batchId);
            this.completedBatches.set(batchId, batch);
            
            this.metrics.failedBatches++;
            
            this.emit('batch:failed', {
                batchId,
                error: error instanceof Error ? error.message : String(error),
                duration: batch.endTime - startTime
            });
            
            throw error;
        }
    }
    
    /**
     * Execute operations in parallel with concurrency limit
     * @param {any} batch
     * @private
     */
    async executeParallel(batch) {
        const { operations } = batch;
        const limit = Math.min(this.config.parallelLimit, operations.length);
        /** @type {any[]} */
        const results = [];
       
        // Create execution queue
        const queue = [...operations];
        /** @type {Promise<any>[]} */
        const executing = [];
       
        while (queue.length > 0 || executing.length > 0) {
            // Start new operations up to limit
            while (executing.length < limit && queue.length > 0) {
                const operation = queue.shift();
                const promise = this.executeOperation(operation)
                    .then(result => {
                        results.push(result);
                        return result;
                    })
                    .catch(error => {
                        const errorResult = {
                            id: operation.id,
                            status: 'failed',
                            error: error instanceof Error ? error.message : String(error)
                        };
                       
                        if (!batch.options.continueOnError) {
                            throw error;
                        }
                       
                        results.push(errorResult);
                        return errorResult;
                    })
                    .finally(() => {
                        const index = executing.indexOf(promise);
                        if (index > -1) {
                            executing.splice(index, 1);
                        }
                    });
               
                executing.push(promise);
            }
           
            // Wait for at least one to complete
            if (executing.length > 0) {
                await Promise.race(executing);
            }
        }
       
        return results;
    }
    
    /**
     * Execute operations sequentially
     * @param {any} batch
     * @private
     */
    async executeSequential(batch) {
        /** @type {any[]} */
        const results = [];
       
        for (const operation of batch.operations) {
            try {
                const result = await this.executeOperation(operation);
                results.push(result);
               
                // Update operation status
                operation.status = 'success';
                operation.result = result;
               
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const errorResult = {
                    id: operation.id,
                    status: 'failed',
                    error: errorMessage
                };
               
                operation.status = 'failed';
                operation.error = errorMessage;
               
                if (!batch.options.continueOnError) {
                    throw error;
                }
               
                results.push(errorResult);
            }
        }
       
        return results;
    }
    
    /**
     * Execute operations transactionally (all or nothing)
     * @param {any} batch
     * @private
     */
    async executeTransactional(batch) {
        /** @type {any[]} */
        const results = [];
        /** @type {any[]} */
        const rollbackOperations = [];
       
        try {
            for (const operation of batch.operations) {
                const result = await this.executeOperation(operation);
                results.push(result);
               
                // Store rollback operation if provided
                if (operation.rollback) {
                    rollbackOperations.unshift({
                        ...operation.rollback,
                        originalOperation: operation.id
                    });
                }
               
                operation.status = 'success';
                operation.result = result;
            }
           
            // All operations succeeded
            this.emit('transaction:committed', { batchId: batch.id });
            return results;
           
        } catch (error) {
            // Rollback all completed operations
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emit('transaction:rollback', {
                batchId: batch.id,
                error: errorMessage,
                completedOperations: results.length
            });
           
            for (const rollbackOp of rollbackOperations) {
                try {
                    await this.executeOperation(rollbackOp);
                    this.emit('rollback:success', {
                        operation: rollbackOp.originalOperation
                    });
                } catch (rollbackError) {
                    this.emit('rollback:failed', {
                        operation: rollbackOp.originalOperation,
                        error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
                    });
                }
            }
           
            throw error;
        }
    }
    
    /**
     * Execute a single operation
     * @param {any} operation
     * @private
     */
    async executeOperation(operation) {
        const startTime = Date.now();
       
        try {
            // Simulate operation execution
            // In real implementation, this would call the actual tool
            const result = await this.processOperation(operation);
           
            this.emit('operation:success', {
                id: operation.id,
                duration: Date.now() - startTime
            });
           
            return {
                id: operation.id,
                status: 'success',
                result,
                duration: Date.now() - startTime
            };
           
        } catch (error) {
            this.emit('operation:failed', {
                id: operation.id,
                error: error instanceof Error ? error.message : String(error),
                duration: Date.now() - startTime
            });
           
            throw error;
        }
    }
    
    /**
     * Process an individual operation
     * This should be overridden or injected with actual tool execution
     * @param {any} operation
     * @private
     */
    async processOperation(operation) {
        // This is a placeholder - in real implementation,
        // this would execute the actual MCP tool
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    tool: operation.tool,
                    params: operation.params,
                    timestamp: Date.now()
                });
            }, Math.random() * 100);
        });
    }
    
    /**
     * Create a pipeline of operations
     * @param {any[]} stages - Array of pipeline stages
     * @param {object} [options] - Pipeline options
     * @returns {Promise<object>} Pipeline execution result
      */
     async pipeline(stages, options = {}) {
         const pipelineId = this.generateBatchId();
         /** @type {any[]} */
         const results = [];
         let previousResult = null;
        
         this.emit('pipeline:start', { pipelineId, stages: stages.length });
        
         for (let i = 0; i < stages.length; i++) {
             const stage = stages[i];
            
             try {
                 // Transform stage if it's a function
                 const operations = typeof stage === 'function'
                     ? stage(previousResult)
                     : stage;
                
                 // Execute stage as batch
                 const stageResult = await this.executeBatch(operations, {
                     ...options,
                     parallel: stage.parallel || false
                 });
                
                 results.push({
                     stage: i,
                     result: stageResult
                 });
                
                 // @ts-ignore
                 previousResult = stageResult.results;
                
                 this.emit('pipeline:stage', {
                     pipelineId,
                     stage: i,
                     totalStages: stages.length
                 });
                
             } catch (error) {
                 this.emit('pipeline:failed', {
                     pipelineId,
                     stage: i,
                     error: error instanceof Error ? error.message : String(error)
                 });
                
                 throw error;
             }
         }
        
        this.emit('pipeline:complete', { 
            pipelineId, 
            stages: stages.length,
            results: results.length 
        });
        
        return {
            pipelineId,
            status: 'success',
            results
        };
    }
    
    /**
     * Merge similar operations for optimization
     * @param {any[]} operations - Operations to merge
     * @returns {any[]} Merged operations
      */
     mergeOperations(operations) {
         /** @type {Map<string, any>} */
         const merged = new Map();
        
         for (const op of operations) {
             const key = `${op.tool}_${JSON.stringify(op.params?.type || '')}`;
            
             if (!merged.has(key)) {
                 merged.set(key, {
                     tool: op.tool,
                     params: op.params,
                     count: 1,
                     original: [op]
                 });
             } else {
                 const existing = merged.get(key);
                 existing.count++;
                 existing.original.push(op);
                
                 // Merge parameters if possible
                 if (op.params?.items && existing.params?.items) {
                     existing.params.items = [
                         ...existing.params.items,
                         ...op.params.items
                     ];
                 }
             }
         }
        
         return Array.from(merged.values()).map(item => ({
             tool: item.tool,
             params: item.params,
             metadata: {
                 merged: true,
                 count: item.count,
                 originalIds: item.original.map(/** @param {any} o */ o => o.id)
             }
         }));
     }
    
    /**
     * Generate unique batch ID
     * @private
     */
    generateBatchId() {
        return `batch_${Date.now()}_${uuidv4().substr(0, 8)}`;
    }
    
    /**
     * Update average execution time metric
     * @param {number} duration
     * @private
     */
    updateAverageExecutionTime(duration) {
        const totalTime = this.metrics.averageExecutionTime * (this.metrics.successfulBatches - 1);
        this.metrics.averageExecutionTime = (totalTime + duration) / this.metrics.successfulBatches;
    }
    
    /**
     * Get batch status
     * @param {string} batchId - Batch ID
     * @returns {object | null} Batch status
      */
     getBatchStatus(batchId) {
         if (this.pendingBatches.has(batchId)) {
             return this.pendingBatches.get(batchId) || null;
         }
         if (this.executingBatches.has(batchId)) {
             return this.executingBatches.get(batchId) || null;
         }
         if (this.completedBatches.has(batchId)) {
             return this.completedBatches.get(batchId) || null;
         }
         return null;
     }
    
    /**
     * Get metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            pendingBatches: this.pendingBatches.size,
            executingBatches: this.executingBatches.size,
            completedBatches: this.completedBatches.size
        };
    }
    
    /**
     * Clear completed batches (cleanup)
     * @param {number} olderThan - Clear batches older than this many milliseconds
     */
    clearCompleted(olderThan = 3600000) {
        const now = Date.now();
        const toDelete = [];
        
        for (const [id, batch] of this.completedBatches) {
            if (now - batch.endTime > olderThan) {
                toDelete.push(id);
            }
        }
        
        toDelete.forEach(id => this.completedBatches.delete(id));
        
        return toDelete.length;
    }
}

module.exports = { BatchOperationManager };