const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const yaml = require('js-yaml');

/**
 * Workflow node types
 */
const NODE_TYPE = {
    TOOL: 'tool',
    PARALLEL: 'parallel',
    SEQUENCE: 'sequence',
    CONDITIONAL: 'conditional',
    LOOP: 'loop',
    ERROR_HANDLER: 'error_handler',
    TRANSFORM: 'transform',
    MERGE: 'merge',
    SPLIT: 'split'
};

/**
 * Workflow execution states
 */
const EXECUTION_STATE = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    PAUSED: 'paused',
    CANCELLED: 'cancelled',
    ROLLED_BACK: 'rolled_back'
};

/**
 * Tool Orchestration Engine for complex workflow execution
 */
class ToolOrchestrationEngine extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            maxParallelExecution: options.maxParallelExecution || 10,
            defaultTimeout: options.defaultTimeout || 30000,
            enableRollback: options.enableRollback !== false,
            enableRetry: options.enableRetry !== false,
            retryAttempts: options.retryAttempts || 3,
            enableCaching: options.enableCaching || false
        };
        
        // Workflow storage
        this.workflows = new Map();
        this.executions = new Map();
        this.templates = new Map();
        
        // Tool registry (would integrate with actual tool system)
        this.toolRegistry = options.toolRegistry || new Map();
        
        // Execution context
        this.globalContext = new Map();
        
        // Metrics
        this.metrics = {
            totalWorkflows: 0,
            executedWorkflows: 0,
            successfulWorkflows: 0,
            failedWorkflows: 0,
            averageExecutionTime: 0
        };
    }
    
    /**
     * Register a workflow template
     * @param {string} name - Template name
     * @param {Object} definition - Workflow definition
     */
    registerTemplate(name, definition) {
        this.templates.set(name, {
            name,
            definition,
            createdAt: Date.now(),
            version: definition.version || '1.0.0'
        });
        
        this.emit('template:registered', { name });
    }
    
    /**
     * Parse workflow from YAML
     * @param {string} yamlContent - YAML workflow definition
     * @returns {Object} Parsed workflow
     */
    parseWorkflow(yamlContent) {
        try {
            const workflow = yaml.load(yamlContent);
            return this.validateWorkflow(workflow);
        } catch (error) {
            throw new Error(`Failed to parse workflow: ${error.message}`);
        }
    }
    
    /**
     * Validate workflow definition
     * @private
     */
    validateWorkflow(workflow) {
        if (!workflow.name) {
            throw new Error('Workflow must have a name');
        }
        
        if (!workflow.stages || !Array.isArray(workflow.stages)) {
            throw new Error('Workflow must have stages array');
        }
        
        // Validate each stage
        for (const stage of workflow.stages) {
            this.validateStage(stage);
        }
        
        return workflow;
    }
    
    /**
     * Validate workflow stage
     * @private
     */
    validateStage(stage) {
        const validTypes = Object.values(NODE_TYPE);
        const stageType = Object.keys(stage)[0];
        
        if (!validTypes.includes(stageType)) {
            // Check if it's a tool call
            if (!stage.tool) {
                throw new Error(`Invalid stage type: ${stageType}`);
            }
        }
        
        return true;
    }
    
    /**
     * Execute a workflow
     * @param {Object|string} workflow - Workflow definition or template name
     * @param {Object} context - Initial context
     * @returns {Promise<Object>} Execution result
     */
    async executeWorkflow(workflow, context = {}) {
        // Resolve workflow definition
        let workflowDef;
        if (typeof workflow === 'string') {
            const template = this.templates.get(workflow);
            if (!template) {
                throw new Error(`Template not found: ${workflow}`);
            }
            workflowDef = template.definition;
        } else {
            workflowDef = this.validateWorkflow(workflow);
        }
        
        // Create execution instance
        const executionId = uuidv4();
        const execution = {
            id: executionId,
            workflow: workflowDef,
            state: EXECUTION_STATE.PENDING,
            context: new Map(Object.entries(context)),
            results: [],
            startTime: null,
            endTime: null,
            currentStage: 0,
            error: null,
            rollbackStack: []
        };
        
        this.executions.set(executionId, execution);
        this.metrics.totalWorkflows++;
        
        try {
            // Start execution
            execution.state = EXECUTION_STATE.RUNNING;
            execution.startTime = Date.now();
            
            this.emit('workflow:started', {
                executionId,
                workflow: workflowDef.name
            });
            
            // Execute stages
            const result = await this.executeStages(
                workflowDef.stages,
                execution
            );
            
            // Complete execution
            execution.state = EXECUTION_STATE.COMPLETED;
            execution.endTime = Date.now();
            execution.results = result;
            
            this.metrics.executedWorkflows++;
            this.metrics.successfulWorkflows++;
            this.updateAverageExecutionTime(execution.endTime - execution.startTime);
            
            this.emit('workflow:completed', {
                executionId,
                duration: execution.endTime - execution.startTime,
                results: result
            });
            
            return {
                executionId,
                status: 'success',
                results: result,
                duration: execution.endTime - execution.startTime
            };
            
        } catch (error) {
            // Handle failure
            execution.state = EXECUTION_STATE.FAILED;
            execution.endTime = Date.now();
            execution.error = error.message;
            
            this.metrics.failedWorkflows++;
            
            this.emit('workflow:failed', {
                executionId,
                error: error.message
            });
            
            // Attempt rollback if enabled
            if (this.config.enableRollback && execution.rollbackStack.length > 0) {
                await this.rollbackExecution(execution);
            }
            
            throw error;
        }
    }
    
    /**
     * Execute workflow stages
     * @private
     */
    async executeStages(stages, execution) {
        const results = [];
        
        for (let i = 0; i < stages.length; i++) {
            const stage = stages[i];
            execution.currentStage = i;
            
            this.emit('stage:started', {
                executionId: execution.id,
                stage: i,
                type: this.getStageType(stage)
            });
            
            try {
                const result = await this.executeStage(stage, execution);
                results.push(result);
                
                // Update context with result
                if (stage.output) {
                    execution.context.set(stage.output, result);
                }
                
                this.emit('stage:completed', {
                    executionId: execution.id,
                    stage: i,
                    result
                });
                
            } catch (error) {
                this.emit('stage:failed', {
                    executionId: execution.id,
                    stage: i,
                    error: error.message
                });
                
                // Handle error based on stage configuration
                if (stage.onError === 'continue') {
                    results.push({ error: error.message });
                    continue;
                } else if (stage.onError === 'retry' && this.config.enableRetry) {
                    const retryResult = await this.retryStage(stage, execution);
                    results.push(retryResult);
                } else {
                    throw error;
                }
            }
        }
        
        return results;
    }
    
    /**
     * Execute a single stage
     * @private
     */
    async executeStage(stage, execution) {
        const stageType = this.getStageType(stage);
        
        switch (stageType) {
            case NODE_TYPE.TOOL:
                return this.executeTool(stage, execution);
                
            case NODE_TYPE.PARALLEL:
                return this.executeParallel(stage.parallel, execution);
                
            case NODE_TYPE.SEQUENCE:
                return this.executeStages(stage.sequence, execution);
                
            case NODE_TYPE.CONDITIONAL:
                return this.executeConditional(stage.conditional, execution);
                
            case NODE_TYPE.LOOP:
                return this.executeLoop(stage.loop, execution);
                
            case NODE_TYPE.ERROR_HANDLER:
                return this.executeErrorHandler(stage.error_handler, execution);
                
            case NODE_TYPE.TRANSFORM:
                return this.executeTransform(stage.transform, execution);
                
            case NODE_TYPE.MERGE:
                return this.executeMerge(stage.merge, execution);
                
            case NODE_TYPE.SPLIT:
                return this.executeSplit(stage.split, execution);
                
            default:
                throw new Error(`Unknown stage type: ${stageType}`);
        }
    }
    
    /**
     * Execute a tool
     * @private
     */
    async executeTool(stage, execution) {
        const toolName = stage.tool;
        const params = this.resolveParams(stage.params || {}, execution.context);
        
        // Store for potential rollback
        if (stage.rollback) {
            execution.rollbackStack.push({
                tool: stage.rollback.tool,
                params: stage.rollback.params,
                originalTool: toolName
            });
        }
        
        // Execute tool (would integrate with actual tool system)
        const tool = this.toolRegistry.get(toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }
        
        return await this.executeToolHandler(tool, params);
    }
    
    /**
     * Execute tools in parallel
     * @private
     */
    async executeParallel(stages, execution) {
        const promises = stages.map(stage => 
            this.executeStage(stage, execution).catch(error => ({
                error: error.message,
                stage
            }))
        );
        
        const results = await Promise.all(promises);
        
        // Check for errors if not continuing on error
        const errors = results.filter(r => r.error);
        if (errors.length > 0 && !stages.some(s => s.onError === 'continue')) {
            throw new Error(`Parallel execution failed: ${errors.map(e => e.error).join(', ')}`);
        }
        
        return results;
    }
    
    /**
     * Execute conditional logic
     * @private
     */
    async executeConditional(conditional, execution) {
        const condition = this.evaluateCondition(conditional.if, execution.context);
        
        if (condition) {
            if (conditional.then) {
                return await this.executeStages(
                    Array.isArray(conditional.then) ? conditional.then : [conditional.then],
                    execution
                );
            }
        } else {
            if (conditional.else) {
                return await this.executeStages(
                    Array.isArray(conditional.else) ? conditional.else : [conditional.else],
                    execution
                );
            }
        }
        
        return null;
    }
    
    /**
     * Execute loop
     * @private
     */
    async executeLoop(loop, execution) {
        const results = [];
        const maxIterations = loop.maxIterations || 100;
        let iteration = 0;
        
        // For-each loop
        if (loop.forEach) {
            const items = this.resolveValue(loop.forEach, execution.context);
            if (!Array.isArray(items)) {
                throw new Error('forEach requires an array');
            }
            
            for (const item of items) {
                execution.context.set(loop.itemVar || 'item', item);
                execution.context.set('index', iteration);
                
                const result = await this.executeStages(loop.do, execution);
                results.push(result);
                
                iteration++;
                if (iteration >= maxIterations) break;
            }
        }
        // While loop
        else if (loop.while) {
            while (this.evaluateCondition(loop.while, execution.context)) {
                const result = await this.executeStages(loop.do, execution);
                results.push(result);
                
                iteration++;
                if (iteration >= maxIterations) {
                    throw new Error(`Loop exceeded maximum iterations (${maxIterations})`);
                }
            }
        }
        // Count loop
        else if (loop.count) {
            const count = this.resolveValue(loop.count, execution.context);
            for (let i = 0; i < count && i < maxIterations; i++) {
                execution.context.set('index', i);
                
                const result = await this.executeStages(loop.do, execution);
                results.push(result);
            }
        }
        
        return results;
    }
    
    /**
     * Execute error handler
     * @private
     */
    async executeErrorHandler(errorHandler, execution) {
        try {
            return await this.executeStages(errorHandler.try, execution);
        } catch (error) {
            execution.context.set('error', error.message);
            
            if (errorHandler.catch) {
                return await this.executeStages(errorHandler.catch, execution);
            }
            
            throw error;
        } finally {
            if (errorHandler.finally) {
                await this.executeStages(errorHandler.finally, execution);
            }
        }
    }
    
    /**
     * Execute data transformation
     * @private
     */
    async executeTransform(transform, execution) {
        const input = this.resolveValue(transform.input, execution.context);
        
        // Apply transformation based on type
        if (transform.type === 'map') {
            if (!Array.isArray(input)) {
                throw new Error('Map transform requires array input');
            }
            return input.map(item => this.applyExpression(transform.expression, { item }));
        }
        
        if (transform.type === 'filter') {
            if (!Array.isArray(input)) {
                throw new Error('Filter transform requires array input');
            }
            return input.filter(item => this.evaluateCondition(transform.condition, { item }));
        }
        
        if (transform.type === 'reduce') {
            if (!Array.isArray(input)) {
                throw new Error('Reduce transform requires array input');
            }
            return input.reduce((acc, item) => 
                this.applyExpression(transform.expression, { acc, item }),
                transform.initial || null
            );
        }
        
        if (transform.type === 'custom' && transform.function) {
            // Execute custom transformation function
            const fn = new Function('input', 'context', transform.function);
            return fn(input, Object.fromEntries(execution.context));
        }
        
        return input;
    }
    
    /**
     * Execute merge operation
     * @private
     */
    async executeMerge(merge, execution) {
        const inputs = merge.inputs.map(input => 
            this.resolveValue(input, execution.context)
        );
        
        if (merge.type === 'concat') {
            return inputs.flat();
        }
        
        if (merge.type === 'object') {
            return Object.assign({}, ...inputs);
        }
        
        if (merge.type === 'custom' && merge.function) {
            const fn = new Function('inputs', merge.function);
            return fn(inputs);
        }
        
        return inputs;
    }
    
    /**
     * Execute split operation
     * @private
     */
    async executeSplit(split, execution) {
        const input = this.resolveValue(split.input, execution.context);
        
        if (split.type === 'chunk') {
            const chunkSize = split.size || 10;
            const chunks = [];
            
            for (let i = 0; i < input.length; i += chunkSize) {
                chunks.push(input.slice(i, i + chunkSize));
            }
            
            return chunks;
        }
        
        if (split.type === 'condition') {
            const matching = [];
            const nonMatching = [];
            
            for (const item of input) {
                if (this.evaluateCondition(split.condition, { item })) {
                    matching.push(item);
                } else {
                    nonMatching.push(item);
                }
            }
            
            return { matching, nonMatching };
        }
        
        return [input];
    }
    
    /**
     * Retry a failed stage
     * @private
     */
    async retryStage(stage, execution) {
        const maxAttempts = stage.retry || this.config.retryAttempts;
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                this.emit('stage:retry', {
                    executionId: execution.id,
                    attempt,
                    maxAttempts
                });
                
                return await this.executeStage(stage, execution);
            } catch (error) {
                lastError = error;
                
                if (attempt < maxAttempts) {
                    // Exponential backoff
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw lastError;
    }
    
    /**
     * Rollback execution
     * @private
     */
    async rollbackExecution(execution) {
        execution.state = EXECUTION_STATE.ROLLED_BACK;
        
        this.emit('workflow:rollback', {
            executionId: execution.id,
            steps: execution.rollbackStack.length
        });
        
        while (execution.rollbackStack.length > 0) {
            const rollback = execution.rollbackStack.pop();
            
            try {
                await this.executeToolHandler(
                    this.toolRegistry.get(rollback.tool),
                    this.resolveParams(rollback.params, execution.context)
                );
                
                this.emit('rollback:success', {
                    executionId: execution.id,
                    tool: rollback.tool
                });
            } catch (error) {
                this.emit('rollback:failed', {
                    executionId: execution.id,
                    tool: rollback.tool,
                    error: error.message
                });
            }
        }
    }
    
    /**
     * Execute tool handler (placeholder)
     * @private
     */
    async executeToolHandler(tool, params) {
        // This would integrate with the actual tool system
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    tool: tool?.name || 'unknown',
                    params,
                    result: 'simulated result',
                    timestamp: Date.now()
                });
            }, Math.random() * 100);
        });
    }
    
    /**
     * Get stage type
     * @private
     */
    getStageType(stage) {
        const keys = Object.keys(stage);
        
        for (const key of keys) {
            if (Object.values(NODE_TYPE).includes(key)) {
                return key;
            }
        }
        
        // Default to tool if has tool property
        if (stage.tool) {
            return NODE_TYPE.TOOL;
        }
        
        return null;
    }
    
    /**
     * Resolve parameters with context values
     * @private
     */
    resolveParams(params, context) {
        const resolved = {};
        
        for (const [key, value] of Object.entries(params)) {
            resolved[key] = this.resolveValue(value, context);
        }
        
        return resolved;
    }
    
    /**
     * Resolve a value from context
     * @private
     */
    resolveValue(value, context) {
        if (typeof value === 'string' && value.startsWith('$')) {
            const path = value.substring(1).split('.');
            let current = context.get(path[0]);
            
            for (let i = 1; i < path.length; i++) {
                if (current && typeof current === 'object') {
                    current = current[path[i]];
                } else {
                    return undefined;
                }
            }
            
            return current;
        }
        
        return value;
    }
    
    /**
     * Evaluate a condition
     * @private
     */
    evaluateCondition(condition, context) {
        if (typeof condition === 'string') {
            // Simple variable check
            if (condition.startsWith('$')) {
                return !!this.resolveValue(condition, context);
            }
            
            // Expression evaluation (simplified)
            try {
                const fn = new Function('context', `return ${condition}`);
                return fn(Object.fromEntries(context));
            } catch {
                return false;
            }
        }
        
        return !!condition;
    }
    
    /**
     * Apply an expression
     * @private
     */
    applyExpression(expression, vars) {
        try {
            const fn = new Function(...Object.keys(vars), `return ${expression}`);
            return fn(...Object.values(vars));
        } catch {
            return null;
        }
    }
    
    /**
     * Update average execution time
     * @private
     */
    updateAverageExecutionTime(duration) {
        const total = this.metrics.averageExecutionTime * (this.metrics.successfulWorkflows - 1);
        this.metrics.averageExecutionTime = (total + duration) / this.metrics.successfulWorkflows;
    }
    
    /**
     * Get execution status
     * @param {string} executionId - Execution ID
     */
    getExecutionStatus(executionId) {
        return this.executions.get(executionId);
    }
    
    /**
     * Get metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            activeExecutions: Array.from(this.executions.values())
                .filter(e => e.state === EXECUTION_STATE.RUNNING).length,
            templatesCount: this.templates.size
        };
    }
}

module.exports = { ToolOrchestrationEngine, NODE_TYPE, EXECUTION_STATE };