"use strict";
const { BaseAgent } = require('./baseAgent.js');
const promptConfig = require('./promptConfig.js');
class CritiqueAggregationAgent extends BaseAgent {
    /**
     * @param {import('../config').ModelConfig} modelConfig The configuration for the model.
     * @param {string | null} systemPrompt The system prompt.
     * @param {string} id The agent's ID.
     * @param {import('events').EventEmitter} messageBus The message bus.
     */
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = promptConfig.getPrompt('CRITIQUE_AGGREGATION');
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }
    /**
     * Aggregates multiple evaluations into a single critique.
     * @param {Array<{score: number, suggestions: string[]}>} evaluations An array of evaluation objects.
     * @param {import('./taskContext').TaskContext} taskContext The current task context.
     * @returns {Promise<{score: number, suggestions: string[], summary: string}>} The aggregated critique.
     */
    async executeTask(evaluations, taskContext) {
        let userPrompt = `原始用户请求是: "${taskContext.originalUserRequest}"`;
        userPrompt += `\n\n这是来自团队的评估结果:\n${JSON.stringify(evaluations, null, 2)}`;
        userPrompt += `\n\n请将这些评估整合成一个单一的、最终的评审，并以指定的JSON格式输出。`;
        const responseJson = await this.llmRequest(userPrompt, true);
        try {
            const responseObject = JSON.parse(responseJson);
            if (responseObject && typeof responseObject.score === 'number' && Array.isArray(responseObject.suggestions) && typeof responseObject.summary === 'string') {
                return responseObject;
            }
            else {
                throw new Error("来自评审聚合者的响应不是一个有效的评审结果。");
            }
        }
        catch ( /** @type {any} */e) {
            const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    if (parsed && typeof parsed.score === 'number' && Array.isArray(parsed.suggestions) && typeof parsed.summary === 'string') {
                        return parsed;
                    }
                }
                catch ( /** @type {any} */parseError) {
                    throw new Error(`无法从LLM响应中解析评审结果，即使在找到JSON块之后。错误: ${parseError.message}`);
                }
            }
            throw new Error(`无法从LLM响应中解析评审结果。错误: ${e.message}`);
        }
    }
}
module.exports = { CritiqueAggregationAgent };
//# sourceMappingURL=critiqueAggregationAgent.js.map