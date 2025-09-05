"use strict";
const { OpenAICompatibleProvider } = require('../llm/provider.js');
const { ULTIMATE_THINKING_CHAIN_PROMPT } = require('./prompts/ULTIMATE_THINKING_CHAIN_V3.js');
/**
 * @typedef {import('../config').ModelConfig} ModelConfig
 */
class ThinkingChainEngine {
    /**
     * @param {ModelConfig} modelConfig The configuration for the model to be used for thinking.
     */
    constructor(modelConfig) {
        if (!modelConfig) {
            throw new Error("Model configuration is required for the ThinkingChainEngine.");
        }
        this.provider = new OpenAICompatibleProvider(modelConfig);
        this.baseThinkingPrompt = ULTIMATE_THINKING_CHAIN_PROMPT;
    }
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
    /**
     * Builds the final system prompt by injecting user-defined meta-instructions.
     * @param {ThinkingConfig} thinkingConfig User-defined configuration for the thinking process.
     * @returns {string} The final system prompt.
     */
    buildDynamicPrompt(thinkingConfig = {}) {
        let finalPrompt = this.baseThinkingPrompt;
        const activeDirectives = [];
        if (thinkingConfig.depth)
            activeDirectives.push(`!depth(${thinkingConfig.depth})`);
        if (thinkingConfig.iterate)
            activeDirectives.push(`!iterate(${thinkingConfig.iterate})`);
        if (thinkingConfig.model)
            activeDirectives.push(`!model(${thinkingConfig.model})`);
        if (thinkingConfig.focus)
            activeDirectives.push(`!focus(${thinkingConfig.focus})`);
        // Functional directives
        if (thinkingConfig.visualize)
            activeDirectives.push(`!think`);
        if (thinkingConfig.suggest)
            activeDirectives.push(`!suggest`);
        if (thinkingConfig.parallel)
            activeDirectives.push(`!parallel`);
        if (thinkingConfig.trace)
            activeDirectives.push(`!trace`);
        if (thinkingConfig.confidence)
            activeDirectives.push(`!confidence`);
        if (thinkingConfig.critique)
            activeDirectives.push(`!critique`);
        if (activeDirectives.length > 0) {
            const directivesString = `
<user_meta_directives>
    ${activeDirectives.join('\n    ')}
</user_meta_directives>
`;
            // Inject directives right after the元指令控制系统 block
            finalPrompt = finalPrompt.replace(/(<\/元指令控制系统>)/, `$1${directivesString}`);
        }
        return finalPrompt;
    }
    /**
     * Executes the full thinking chain process.
     * @param {string} userInput The initial user request.
     * @param {object} context Additional context (e.g., file structure, previous task history).
     * @param {ThinkingConfig} thinkingConfig User-defined configuration for the thinking process.
     * @returns {Promise<string>} A structured string containing the results of the thinking process.
     */
    async execute(userInput, context = {}, thinkingConfig = {}) {
        const dynamicPrompt = this.buildDynamicPrompt(thinkingConfig);
        const enrichedUserInput = `
User Request: "${userInput}"

Additional Context:
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

Please initiate the thinking process based on this information.
`;
        /** @type {import('../llm/provider.js').ChatMessage[]} */
        const messages = [
            { role: 'system', content: dynamicPrompt },
            { role: 'user', content: enrichedUserInput }
        ];
        // For now, we assume the thinking process completes in one turn.
        // Later, this can be expanded into a multi-turn conversation to follow the 15 steps more rigorously.
        const thinkingResult = await this.provider.chatCompletion(messages, false);
        return this.parseThinkingResult(thinkingResult);
    }
    /**
     * Parses the raw output from the LLM to extract the structured thinking process.
     * @param {string} rawOutput The full string response from the LLM.
     * @returns {string} The parsed and cleaned-up thinking process.
     */
    parseThinkingResult(rawOutput) {
        const thinkMatch = rawOutput.match(/<think>([\s\S]*)<\/think>/);
        if (thinkMatch && thinkMatch[1]) {
            return thinkMatch[1].trim();
        }
        // Fallback if the <think> tags are missing
        return rawOutput.trim();
    }
}
module.exports = { ThinkingChainEngine };
//# sourceMappingURL=ThinkingChainEngine.js.map