"use strict";
const { OpenAICompatibleProvider } = require('../llm/provider.js');
const logger = require('../logger');
const { ThinkingChainEngine } = require('../thinking_chain/ThinkingChainEngine');
/**
 * @typedef {import('events').EventEmitter} EventEmitter
 * @typedef {import('../config').ModelConfig} ModelConfig
 * @typedef {import('../llm/provider').ChatMessage} ChatMessage
 */
/**
 * The base class for all agents, providing common functionality for interacting with an LLM.
 */
class BaseAgent {
    /**
     * @param {ModelConfig} modelConfig The configuration for the model to be used by this agent.
     * @param {string} systemPrompt The default system prompt for this agent.
     * @param {string} id The unique identifier for this agent instance.
     * @param {EventEmitter} messageBus The message bus for inter-agent communication.
     */
    constructor(modelConfig, systemPrompt, id, messageBus) {
        if (!modelConfig) {
            throw new Error("Model configuration is required to initialize an agent.");
        }
        this.modelConfig = modelConfig;
        this.provider = new OpenAICompatibleProvider(modelConfig);
        this.systemPrompt = systemPrompt;
        this.id = id;
        this.messageBus = messageBus;
        this.boundOnReceiveMessage = this.onReceiveMessage.bind(this);
        if (this.id && this.messageBus) {
            this.messageBus.on(this.id, this.boundOnReceiveMessage);
        }
    }
    /**
     * Initiates a deep thinking process using the ThinkingChainEngine.
     * This is for complex problem-solving where a simple LLM request is insufficient.
     * @param {string} problem The specific problem or question to think about.
     * @param {object} context Additional context for the thinking process.
     * @returns {Promise<string>} The structured result of the thinking process.
     */
    async think(problem, context = {}) {
        // Lazily initialize the thinking engine to avoid unnecessary overhead.
        if (!this.thinkingEngine) {
            // Each agent gets its own thinking engine instance based on its model config.
            this.thinkingEngine = new ThinkingChainEngine(this.modelConfig);
        }
        logger.log(`Agent "${this.id}" is starting a deep thinking process...`);
        return this.thinkingEngine.execute(problem, context);
    }
    /**
     * A helper method to make a chat completion request with a consistent system prompt.
     * @param {string} userPrompt The user-facing prompt for this specific task.
     * @param {boolean} [jsonMode=false] Whether to request a JSON response from the LLM.
     * @param {(chunk: string) => void} [onStreamChunk] Optional callback for streaming responses.
     * @returns {Promise<string>} The text content of the LLM's response.
     */
    async llmRequest(userPrompt, jsonMode = false, onStreamChunk = undefined) {
        /** @type {ChatMessage[]} */
        const messages = [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userPrompt }
        ];
        // In a real scenario, you might add more complex history management here.
        return this.provider.chatCompletion(messages, jsonMode, onStreamChunk);
    }
    /**
     * A placeholder for the main task execution logic, to be implemented by subclasses.
     * @abstract
     * @param {...any} args
     * @returns {Promise<any>}
     */
    async executeTask(...args) {
        throw new Error("The `executeTask` method must be implemented by subclasses.");
    }
    /**
     * Handles incoming messages from the message bus.
     * @param {{ content: any }} message The message object from another agent.
     */
    onReceiveMessage(message) {
        // Default implementation logs the message. Can be overridden by subclasses.
        const logMessage = `Agent "${this.id}" received a message: ${JSON.stringify(message.content)}`;
        logger.log(logMessage); // Use the central logger
    }
    dispose() {
        if (this.id && this.messageBus) {
            this.messageBus.removeListener(this.id, this.boundOnReceiveMessage);
        }
    }
}
module.exports = { BaseAgent };
//# sourceMappingURL=baseAgent.js.map