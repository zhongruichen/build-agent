"use strict";
const { BaseAgent } = require('./baseAgent.js');
const promptConfig = require('./promptConfig.js');
class KnowledgeExtractorAgent extends BaseAgent {
    /**
     * @param {import('../config').ModelConfig} modelConfig The configuration for the model.
     * @param {string | null} systemPrompt The system prompt.
     * @param {string} id The agent's ID.
     * @param {import('events').EventEmitter} messageBus The message bus.
     */
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = promptConfig.getPrompt('KNOWLEDGE_EXTRACTOR');
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }
    /**
     * Analyzes a completed task context and extracts generalizable knowledge.
     * @param {import('./taskContext').TaskContext} taskContext The completed task context.
     * @returns {Promise<string[]>} A list of knowledge strings.
     */
    async executeTask(taskContext) {
        const fullHistory = this.formatContextForExtraction(taskContext);
        const prompt = `${this.systemPrompt}\n\n[任务历史]\n${fullHistory}\n\n请根据以上历史，提取出3-5条最有价值、最可能被未来任务复用的经验或知识点。`;
        try {
            const response = await this.llmRequest(prompt);
            // The LLM is expected to return a list of lessons, one per line.
            return response.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        }
        catch (error) {
            console.error("Error extracting knowledge:", error);
            // In case of an error, return an empty array to not block the process.
            return [];
        }
    }
    /**
     * @param {import('./taskContext').TaskContext} taskContext
     * @returns {string}
     */
    formatContextForExtraction(taskContext) {
        let history = `原始用户请求: ${taskContext.originalUserRequest}\n\n`;
        taskContext.history.forEach(iter => {
            history += `--- 第 ${iter.iteration} 轮 ---\n`;
            history += "计划:\n";
            iter.subTasks.forEach(task => {
                history += `- [${task.status}] ${task.description.split('\n\n')[0]}\n`;
                if (task.result)
                    history += `  结果: ${JSON.stringify(task.result)}\n`;
                if (task.error)
                    history += `  错误: ${task.error}\n`;
            });
            history += `\n评估: ${iter.evaluation.score}/10 - ${iter.evaluation.summary}\n`;
            history += `产物:\n\`\`\`\n${iter.artifact}\n\`\`\`\n\n`;
        });
        return history;
    }
}
module.exports = { KnowledgeExtractorAgent };
//# sourceMappingURL=knowledgeExtractorAgent.js.map