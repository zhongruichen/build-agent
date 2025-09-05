"use strict";
const { BaseAgent } = require('./baseAgent.js');
const promptConfig = require('./promptConfig.js');
class OrchestratorAgent extends BaseAgent {
    /**
     * @param {import('../config').ModelConfig} modelConfig
     * @param {string} systemPrompt
     * @param {string} id
     * @param {import('events').EventEmitter} messageBus
     */
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = promptConfig.getPrompt('ORCHESTRATOR');
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }
    /**
     * Creates a plan to fulfill the user's request.
     * @param {import('./taskContext').TaskContext} taskContext The current task context.
     * @returns {Promise<import('./taskContext').PlanObject[]>} An array of sub-task objects.
     */
    async executeTask(taskContext) {
        let userPrompt = `这是现有项目代码库的摘要:\n${taskContext.projectContext}\n\n`;
        userPrompt += `原始用户请求: "${taskContext.originalUserRequest}"`;
        const latestIteration = taskContext.getLatestIteration();
        if (latestIteration) {
            userPrompt += `\n\n这是第 ${taskContext.currentIteration} 轮迭代。`;
            userPrompt += `\n这是上一轮迭代的产物:\n\`\`\`\n${latestIteration.artifact}\n\`\`\``;
            userPrompt += `\n评估者给出了 ${latestIteration.evaluation.score}/10 的评分，并提供了以下反馈: ${latestIteration.evaluation.suggestions.join(', ')}`;
            userPrompt += `\n请创建一个新计划来处理此反馈并改进项目。`;
        }
        else {
            userPrompt += `\n请创建完成此请求的初始计划。`;
        }
        const responseJson = await this.llmRequest(userPrompt, true);
        try {
            const responseObject = JSON.parse(responseJson);
            if (responseObject && Array.isArray(responseObject.plan) && responseObject.plan.every(/** @param {any} t */ /** @param {any} t */ t => t.id && t.description && Array.isArray(t.dependencies))) {
                return responseObject.plan;
            }
            else {
                throw new Error("来自规划者的响应不是一个有效的、带依赖关系的计划。");
            }
        }
        catch (e) {
            const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    if (parsed && Array.isArray(parsed.plan) && parsed.plan.every(/** @param {any} t */ /** @param {any} t */ t => t.id && t.description && Array.isArray(t.dependencies))) {
                        return parsed.plan;
                    }
                }
                catch (parseError) {
                    throw new Error(`无法从LLM响应中解析计划，即使在找到JSON块之后。错误: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                }
            }
            throw new Error(`无法从LLM响应中解析计划。错误: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
module.exports = { OrchestratorAgent };
//# sourceMappingURL=orchestratorAgent.js.map