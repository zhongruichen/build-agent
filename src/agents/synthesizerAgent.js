const { BaseAgent } = require('./baseAgent.js');
const promptConfig = require('./promptConfig.js');

class SynthesizerAgent extends BaseAgent {
    /**
     * @param {import('../config').ModelConfig} modelConfig
     * @param {string} systemPrompt
     * @param {string} id
     * @param {import('events').EventEmitter} messageBus
     */
    constructor(modelConfig, systemPrompt, id, messageBus) {
        const defaultPrompt = promptConfig.getPrompt('SYNTHESIZER');
        super(modelConfig, systemPrompt || defaultPrompt, id, messageBus);
    }

    /**
     * Generates the final artifact based on the completed tasks.
     * @param {import('./taskContext').TaskContext} taskContext The current task context.
     * @returns {Promise<string>} The final artifact.
     */
    async executeTask(taskContext) {
        const { MainPanel } = require('../ui/mainPanel.js');
        let userPrompt = `原始用户请求是: "${taskContext.originalUserRequest}"`;
        userPrompt += `\n\n这是已完成子任务及其结果的摘要:\n${taskContext.getCompletedTasksSummary()}`;
        userPrompt += `\n\n请基于已完成的工作，生成满足原始请求的最终、完整产物。`;

        // Clear the artifact view first
        MainPanel.update({ command: 'showArtifact', artifact: '' });

        /** @param {string} chunk */
        const onStreamChunk = (chunk) => {
            MainPanel.update({ command: 'artifactStreamChunk', chunk: chunk });
        };

        const artifact = await this.llmRequest(userPrompt, false, onStreamChunk);
        return artifact;
    }
}

module.exports = { SynthesizerAgent };
