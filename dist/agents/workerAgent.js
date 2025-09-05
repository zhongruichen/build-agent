"use strict";
const { BaseAgent } = require('./baseAgent.js');
const promptConfig = require('./promptConfig.js');
class WorkerAgent extends BaseAgent {
    /**
     * @param {import('../config').ModelConfig} modelConfig
     * @param {string} systemPrompt
     * @param {string} id
     * @param {import('events').EventEmitter} messageBus
     */
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = promptConfig.getPrompt('WORKER');
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }
    /**
     * Executes a single sub-task.
     * @param {import('./taskContext').SubTask} subTask The sub-task to execute.
     * @param {import('./taskContext').TaskContext} taskContext The overall task context.
     * @param {string[]} [retryHistory=[]] A list of error messages and reflections from previous attempts.
     * @returns {Promise<{toolName: string, args: object}>} The tool call to be executed.
     */
    async executeTask(subTask, taskContext, retryHistory = []) {
        let userPrompt = `原始用户请求是: "${taskContext.originalUserRequest}"`;
        userPrompt += `\n\n这是到目前为止的总体进展:\n${taskContext.overallProgress}`;
        userPrompt += `\n\n你当前的任务是: "${subTask.description}"`;
        if (retryHistory.length > 0) {
            userPrompt += `\n\n--- 重试历史与反思 ---\n`;
            userPrompt += `此任务之前已尝试失败。请仔细分析以下历史记录以避免重复错误:\n`;
            retryHistory.forEach((entry, index) => {
                userPrompt += `${index + 1}. ${entry}\n`;
            });
            userPrompt += `--- 结束历史记录 ---\n`;
        }
        userPrompt += `\n请决定使用哪个工具来完成此任务，并提供相应的JSON输出。`;
        const responseJson = await this.llmRequest(userPrompt, true);
        try {
            const responseObject = JSON.parse(responseJson);
            if (responseObject && responseObject.toolName && responseObject.args) {
                return responseObject;
            }
            else {
                throw new Error("来自工人智能体的响应不是一个有效的工具调用。");
            }
        }
        catch (e) {
            const jsonMatch = responseJson.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                try {
                    const parsed = JSON.parse(jsonMatch[1]);
                    if (parsed && parsed.toolName && parsed.args) {
                        return parsed;
                    }
                }
                catch (parseError) {
                    throw new Error(`无法从LLM响应中解析工具调用，即使在找到JSON块之后。错误: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                }
            }
            throw new Error(`无法从LLM响应中解析工具调用。错误: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}
module.exports = { WorkerAgent };
//# sourceMappingURL=workerAgent.js.map