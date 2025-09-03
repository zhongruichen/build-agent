const { BaseAgent } = require('./baseAgent.js');
const promptConfig = require('./promptConfig.js');

class EvaluatorAgent extends BaseAgent {
    /**
     * @param {import('../config').ModelConfig} modelConfig The configuration for the model.
     * @param {string | null} systemPrompt The system prompt.
     * @param {string} id The agent's ID.
     * @param {import('events').EventEmitter} messageBus The message bus.
     */
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = promptConfig.getPrompt('EVALUATOR');
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }

    /**
     * Evaluates the given artifact.
     * @param {string} artifact The artifact to evaluate.
     * @param {import('./taskContext').TaskContext} taskContext The current task context.
     * @returns {Promise<{score: number, suggestions: string[]}>} The evaluation result.
     */
    async executeTask(artifact, taskContext) {
        let userPrompt = `原始用户请求是: "${taskContext.originalUserRequest}"`;
        userPrompt += `\n\n这是已生成的产物:\n\`\`\`\n${artifact}\n\`\`\``;
        userPrompt += `\n\n请对其进行评估，并以指定的JSON格式提供您的分数和建议。`;

        const responseJson = await this.llmRequest(userPrompt, true);
        try {
            const responseObject = JSON.parse(responseJson);
            if (responseObject && typeof responseObject.score === 'number' && Array.isArray(responseObject.suggestions)) {
                return responseObject;
            } else {
                throw new Error("来自评估者的响应不是一个有效的评估结果。");
            }
        } catch (/** @type {any} */ e) {
            // If parsing fails, try to recover by looking for a JSON block in the response
            const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    if (parsed && typeof parsed.score === 'number' && Array.isArray(parsed.suggestions)) {
                        return parsed;
                    }
                } catch (/** @type {any} */ parseError) {
                    throw new Error(`无法从LLM响应中解析评估结果，即使在找到JSON块之后。错误: ${parseError.message}`);
                }
            }
            throw new Error(`无法从LLM响应中解析评估结果。错误: ${e.message}`);
        }
    }
}

module.exports = { EvaluatorAgent };
