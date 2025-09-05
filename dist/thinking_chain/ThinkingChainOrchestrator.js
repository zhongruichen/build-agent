"use strict";
const { ThinkingChainEngine } = require('./ThinkingChainEngine.js');
const { getModelForRole } = require('../config.js');
const logger = require('../logger.js');
/**
 * @typedef {import('../agents/taskContext').TaskContext} TaskContext
 */
/**
 * @typedef {object} ThinkingConfig
 * @property {number} [depth]
 * @property {number} [iterate]
 * @property {string} [model]
 * @property {string} [focus]
 * @property {boolean} [visualize]
 * @property {boolean} [suggest]
 * @property {boolean} [parallel]
 * @property {boolean} [trace]
 * @property {boolean} [confidence]
 * @property {boolean} [critique]
 */
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
class ThinkingChainOrchestrator {
    constructor() {
        this.engine = null;
        this.isEnabled = false;
        this.cache = new Map();
        // Initialize the engine if a suitable model is configured.
        const orchestratorModelConfig = getModelForRole('Orchestrator');
        if (orchestratorModelConfig) {
            // We can enhance config later to specify a dedicated "thinking model"
            this.engine = new ThinkingChainEngine(orchestratorModelConfig);
            this.isEnabled = true;
            logger.log('ThinkingChainOrchestrator initialized successfully.');
        }
        else {
            logger.log('ThinkingChainOrchestrator is disabled due to missing model configuration for Orchestrator.');
        }
    }
    /**
     * Pre-processes the user's main goal using the thinking chain.
     * @param {TaskContext} taskContext The main context for the user's task.
     * @param {ThinkingConfig} thinkingConfig
     * @returns {Promise<TaskContext>} The task context, potentially enriched with thinking results.
     */
    async preprocess(taskContext, thinkingConfig = {}) {
        if (!this.isEnabled || !this.engine) {
            return taskContext;
        }
        const cacheKey = taskContext.mainGoal;
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            logger.log('Using cached thinking process result.');
            taskContext.addThinkingProcessResult(cached.result);
            return taskContext;
        }
        try {
            logger.log('Starting preprocessing with ThinkingChainEngine...');
            const thinkingResult = await this.engine.execute(taskContext.mainGoal, { workspaceFiles: taskContext.codebase.getWorkspaceFiles() }, thinkingConfig);
            this.cache.set(cacheKey, { result: thinkingResult, timestamp: Date.now() });
            // Add the thinking result to the task context to be used by other agents.
            taskContext.addThinkingProcessResult(thinkingResult);
            logger.log('ThinkingChainEngine preprocessing complete. Result added to context.');
        }
        catch (error) {
            logger.error(`Error during ThinkingChain preprocessing: ${error}`);
            // If thinking fails, we proceed without it.
        }
        return taskContext;
    }
}
// Export a singleton instance
module.exports = new ThinkingChainOrchestrator();
//# sourceMappingURL=ThinkingChainOrchestrator.js.map