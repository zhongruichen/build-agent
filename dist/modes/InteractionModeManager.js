"use strict";
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
/**
 * Interaction modes
 */
const INTERACTION_MODE = {
    DIRECT: 'direct', // Direct conversation with model
    AGENT_ENABLED: 'agent', // Full multi-agent framework
    HYBRID: 'hybrid' // Selective agent activation
};
/**
 * Mode transition states
 */
const TRANSITION_STATE = {
    IDLE: 'idle',
    TRANSITIONING: 'transitioning',
    READY: 'ready'
};
/**
 * Comprehensive Interaction Mode Manager
 * Handles dynamic mode switching, context preservation, and intelligent routing
 */
class InteractionModeManager extends EventEmitter {
    /**
     * @param {object} [options]
     * @param {string} [options.defaultMode]
     * @param {boolean} [options.contextRetention]
     * @param {number} [options.maxContextSize]
     * @param {boolean} [options.autoModeDetection]
     * @param {boolean} [options.persistenceEnabled]
     * @param {number} [options.transitionDelay]
     */
    constructor(options = {}) {
        super();
        this.config = {
            defaultMode: options.defaultMode || INTERACTION_MODE.HYBRID,
            contextRetention: options.contextRetention !== false,
            maxContextSize: options.maxContextSize || 10000,
            autoModeDetection: options.autoModeDetection !== false,
            persistenceEnabled: options.persistenceEnabled || false,
            transitionDelay: options.transitionDelay || 500
        };
        // Current state
        this.currentMode = this.config.defaultMode;
        this.transitionState = TRANSITION_STATE.READY;
        this.sessionId = uuidv4();
        // Context management
        this.conversationContext = new Map();
        /** @type {any[]} */
        this.contextHistory = [];
        this.contextRelevanceScores = new Map();
        // Mode configurations
        this.modeConfigurations = new Map();
        this.initializeDefaultModes();
        // Preset personas
        this.personas = new Map();
        this.activePersona = null;
        // System prompts
        this.systemPrompts = new Map();
        this.templateVariables = new Map();
        // Metrics
        this.metrics = {
            modeChanges: 0,
            totalInteractions: 0,
            averageResponseTime: 0,
            modeUsage: {
                [INTERACTION_MODE.DIRECT]: 0,
                [INTERACTION_MODE.AGENT_ENABLED]: 0,
                [INTERACTION_MODE.HYBRID]: 0
            }
        };
        // Intent detection patterns
        this.intentPatterns = this.initializeIntentPatterns();
    }
    /**
     * Initialize default mode configurations
     * @private
     */
    initializeDefaultModes() {
        // Direct conversation mode
        this.modeConfigurations.set(INTERACTION_MODE.DIRECT, {
            name: 'Direct Conversation',
            description: 'Streamlined model interaction without agents',
            capabilities: {
                tools: false,
                agents: false,
                workflows: false,
                streaming: true,
                contextRetention: true
            },
            systemPrompt: 'You are a helpful AI assistant. Respond directly to user queries without invoking external tools or agents.',
            maxTokens: 4096,
            temperature: 0.7
        });
        // Agent-enabled mode
        this.modeConfigurations.set(INTERACTION_MODE.AGENT_ENABLED, {
            name: 'Full Agent Mode',
            description: 'Complete multi-agent framework with all capabilities',
            capabilities: {
                tools: true,
                agents: true,
                workflows: true,
                streaming: true,
                contextRetention: true
            },
            systemPrompt: 'You are an orchestrator managing multiple specialized agents. Analyze tasks and delegate to appropriate agents.',
            maxTokens: 8192,
            temperature: 0.5
        });
        // Hybrid mode
        this.modeConfigurations.set(INTERACTION_MODE.HYBRID, {
            name: 'Hybrid Mode',
            description: 'Intelligent selection between direct and agent modes',
            capabilities: {
                tools: true,
                agents: 'selective',
                workflows: 'on-demand',
                streaming: true,
                contextRetention: true
            },
            systemPrompt: 'You are an adaptive AI assistant. Use direct responses for simple queries and invoke agents for complex tasks.',
            maxTokens: 6144,
            temperature: 0.6
        });
    }
    /**
     * Initialize intent detection patterns
     * @private
     */
    initializeIntentPatterns() {
        return {
            simpleQuery: [
                /^(what|who|when|where|why|how) (is|are|was|were)/i,
                /^(explain|describe|define)/i,
                /^(tell me about|what do you know about)/i
            ],
            complexTask: [
                /^(create|build|develop|implement)/i,
                /^(analyze|evaluate|compare)/i,
                /^(debug|fix|troubleshoot)/i,
                /^(refactor|optimize|improve)/i
            ],
            agentRequired: [
                /\b(file|folder|directory)\b.*\b(create|read|write|delete)\b/i,
                /\b(execute|run|command)\b/i,
                /\b(git|commit|branch|merge)\b/i,
                /\b(deploy|test|build)\b/i
            ]
        };
    }
    /**
     * Switch to a different interaction mode
     * @param {string} mode - Target mode
     * @param {Object} options - Transition options
     * @returns {Promise<Object>} Transition result
     */
    async switchMode(mode, options = {}) {
        if (!Object.values(INTERACTION_MODE).includes(mode)) {
            throw new Error(`Invalid mode: ${mode}`);
        }
        // @ts-ignore
        if (this.currentMode === mode && !options.force) {
            return {
                success: true,
                message: 'Already in requested mode',
                mode: this.currentMode
            };
        }
        // Start transition
        const previousMode = this.currentMode;
        this.transitionState = TRANSITION_STATE.TRANSITIONING;
        this.emit('mode:transition:start', {
            from: previousMode,
            to: mode,
            sessionId: this.sessionId
        });
        try {
            // Save current context if retention is enabled
            if (this.config.contextRetention) {
                await this.saveCurrentContext(previousMode);
            }
            // Perform mode-specific cleanup
            await this.cleanupMode(previousMode);
            // Apply transition delay for smooth UX
            if (this.config.transitionDelay > 0) {
                await new Promise(resolve => setTimeout(resolve, this.config.transitionDelay));
            }
            // Initialize new mode
            await this.initializeMode(mode, options);
            // Load relevant context for new mode
            if (this.config.contextRetention) {
                await this.loadRelevantContext(mode);
            }
            // Update state
            this.currentMode = mode;
            this.transitionState = TRANSITION_STATE.READY;
            this.metrics.modeChanges++;
            this.metrics.modeUsage[mode]++;
            this.emit('mode:transition:complete', {
                from: previousMode,
                to: mode,
                sessionId: this.sessionId,
                capabilities: this.getCurrentCapabilities()
            });
            return {
                success: true,
                mode: this.currentMode,
                capabilities: this.getCurrentCapabilities(),
                context: this.getActiveContext()
            };
        }
        catch (error) {
            // Rollback on error
            this.currentMode = previousMode;
            this.transitionState = TRANSITION_STATE.READY;
            this.emit('mode:transition:failed', {
                from: previousMode,
                to: mode,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    /**
     * Save current context before mode switch
     * @private
     */
    /**
     * @param {string} mode
     */
    async saveCurrentContext(mode) {
        const context = {
            mode,
            timestamp: Date.now(),
            conversation: Array.from(this.conversationContext.entries()),
            persona: this.activePersona,
            systemPrompt: this.systemPrompts.get(mode),
            variables: Array.from(this.templateVariables.entries())
        };
        this.contextHistory.push(context);
        // Prune old context if size exceeds limit
        if (this.contextHistory.length > 100) {
            this.contextHistory = this.contextHistory.slice(-50);
        }
        // Persist if enabled
        if (this.config.persistenceEnabled) {
            await this.persistContext(context);
        }
    }
    /**
     * Load relevant context for new mode
     * @private
     */
    /**
     * @param {string} mode
     */
    async loadRelevantContext(mode) {
        // Score historical contexts for relevance
        const scoredContexts = this.contextHistory.map(ctx => ({
            ...ctx,
            relevance: this.calculateContextRelevance(ctx, mode)
        }));
        // Sort by relevance and recency
        scoredContexts.sort((a, b) => {
            const relevanceDiff = b.relevance - a.relevance;
            if (Math.abs(relevanceDiff) > 0.1) {
                return relevanceDiff;
            }
            return b.timestamp - a.timestamp;
        });
        // Load top relevant contexts
        const topContexts = scoredContexts.slice(0, 5);
        for (const ctx of topContexts) {
            this.mergeContext(ctx);
        }
    }
    /**
     * Calculate context relevance score
     * @private
     */
    /**
     * @param {any} context
     * @param {string} targetMode
     */
    calculateContextRelevance(context, targetMode) {
        let score = 0;
        // Mode similarity
        if (context.mode === targetMode) {
            score += 0.5;
        }
        else if ((context.mode === INTERACTION_MODE.HYBRID || targetMode === INTERACTION_MODE.HYBRID)) {
            score += 0.3;
        }
        // Temporal relevance (decay over time)
        const age = Date.now() - context.timestamp;
        const hoursSinceContext = age / (1000 * 60 * 60);
        score += Math.max(0, 1 - (hoursSinceContext / 24)) * 0.3;
        // Persona match
        if (context.persona && context.persona === this.activePersona) {
            score += 0.2;
        }
        return Math.min(1, score);
    }
    /**
     * Merge context into current session
     * @private
     */
    /**
     * @param {any} context
     */
    mergeContext(context) {
        if (context.conversation) {
            for (const [key, value] of context.conversation) {
                if (!this.conversationContext.has(key)) {
                    this.conversationContext.set(key, value);
                }
            }
        }
        if (context.variables) {
            for (const [key, value] of context.variables) {
                this.templateVariables.set(key, value);
            }
        }
    }
    /**
     * Cleanup mode-specific resources
     * @param {string} mode
     * @private
      */
    async cleanupMode(mode) {
        switch (mode) {
            case INTERACTION_MODE.AGENT_ENABLED:
                // Shutdown active agents
                this.emit('agents:shutdown');
                break;
            case INTERACTION_MODE.HYBRID:
                // Clear selective agent cache
                this.emit('agents:clear:selective');
                break;
            case INTERACTION_MODE.DIRECT:
                // Clear direct mode cache
                this.conversationContext.clear();
                break;
        }
    }
    /**
     * Initialize mode-specific resources
     * @param {string} mode
     * @param {object} [options]
     * @param {string} [options.systemPrompt]
     * @param {string} [options.persona]
     * @private
      */
    async initializeMode(mode, options = {}) {
        const config = this.modeConfigurations.get(mode);
        switch (mode) {
            case INTERACTION_MODE.AGENT_ENABLED:
                // Initialize all agents
                this.emit('agents:initialize', {
                    full: true,
                    config: config
                });
                break;
            case INTERACTION_MODE.HYBRID:
                // Initialize selective agent system
                this.emit('agents:initialize', {
                    selective: true,
                    config: config
                });
                break;
            case INTERACTION_MODE.DIRECT:
                // Setup direct conversation
                this.emit('direct:initialize', {
                    config: config
                });
                break;
        }
        // Apply custom configuration if provided
        if (options.systemPrompt) {
            this.updateSystemPrompt(mode, options.systemPrompt);
        }
        if (options.persona) {
            await this.activatePersona(options.persona);
        }
    }
    /**
     * Create or update a persona
     * @param {string} name - Persona name
     * @param {any} config - Persona configuration
      */
    async createPersona(name, config) {
        const persona = {
            id: uuidv4(),
            name,
            description: config.description || '',
            systemInstructions: config.systemInstructions || '',
            knowledgeDomains: config.knowledgeDomains || [],
            responseStyle: config.responseStyle || 'professional',
            constraints: config.constraints || [],
            temperature: config.temperature || 0.7,
            maxTokens: config.maxTokens || 4096,
            preferredMode: config.preferredMode || INTERACTION_MODE.HYBRID,
            customVariables: config.customVariables || {},
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.personas.set(name, persona);
        this.emit('persona:created', {
            name,
            persona
        });
        // Persist if enabled
        if (this.config.persistenceEnabled) {
            await this.persistPersona(persona);
        }
        return persona;
    }
    /**
     * Activate a persona
     * @param {string} name - Persona name
     */
    async activatePersona(name) {
        const persona = this.personas.get(name);
        if (!persona) {
            throw new Error(`Persona not found: ${name}`);
        }
        const previousPersona = this.activePersona;
        this.activePersona = name;
        // Apply persona configuration
        if (persona.systemInstructions) {
            this.updateSystemPrompt(this.currentMode, persona.systemInstructions);
        }
        // Apply custom variables
        for (const [key, value] of Object.entries(persona.customVariables)) {
            this.templateVariables.set(key, value);
        }
        // Switch to preferred mode if different
        if (persona.preferredMode && persona.preferredMode !== this.currentMode) {
            await this.switchMode(persona.preferredMode);
        }
        this.emit('persona:activated', {
            previous: previousPersona,
            current: name,
            persona
        });
        return persona;
    }
    /**
     * Detect optimal mode based on user input
     * @param {string} input - User input
     * @returns {string} Recommended mode
     */
    detectOptimalMode(input) {
        // Check for agent-required patterns
        for (const pattern of this.intentPatterns.agentRequired) {
            if (pattern.test(input)) {
                return INTERACTION_MODE.AGENT_ENABLED;
            }
        }
        // Check for complex task patterns
        let complexityScore = 0;
        for (const pattern of this.intentPatterns.complexTask) {
            if (pattern.test(input)) {
                complexityScore++;
            }
        }
        if (complexityScore >= 2) {
            return INTERACTION_MODE.AGENT_ENABLED;
        }
        else if (complexityScore === 1) {
            return INTERACTION_MODE.HYBRID;
        }
        // Check for simple query patterns
        for (const pattern of this.intentPatterns.simpleQuery) {
            if (pattern.test(input)) {
                return INTERACTION_MODE.DIRECT;
            }
        }
        // Default to hybrid for uncertain cases
        return INTERACTION_MODE.HYBRID;
    }
    /**
     * Process user input with mode-aware routing
     * @param {string} input - User input
     * @param {string} input
     * @param {object} [options]
     * @param {boolean} [options.forceMode]
     * @param {boolean} [options.autoSwitch]
      */
    async processInput(input, options = {}) {
        this.metrics.totalInteractions++;
        // Auto-detect and suggest mode if enabled
        if (this.config.autoModeDetection && !options.forceMode) {
            const suggestedMode = this.detectOptimalMode(input);
            if (suggestedMode !== this.currentMode) {
                this.emit('mode:suggestion', {
                    current: this.currentMode,
                    suggested: suggestedMode,
                    reason: this.getModeChangeReason(input, suggestedMode)
                });
                // Auto-switch if configured
                if (options.autoSwitch) {
                    await this.switchMode(suggestedMode);
                }
            }
        }
        // Process based on current mode
        const startTime = Date.now();
        let result;
        switch (this.currentMode) {
            case INTERACTION_MODE.DIRECT:
                result = await this.processDirectMode(input, options);
                break;
            case INTERACTION_MODE.AGENT_ENABLED:
                result = await this.processAgentMode(input, options);
                break;
            case INTERACTION_MODE.HYBRID:
                result = await this.processHybridMode(input, options);
                break;
            default:
                throw new Error(`Unknown mode: ${this.currentMode}`);
        }
        // Update metrics
        const duration = Date.now() - startTime;
        this.updateAverageResponseTime(duration);
        // Store in context
        this.addToContext('lastInput', input);
        this.addToContext('lastResponse', result);
        this.addToContext('lastDuration', duration);
        return {
            mode: this.currentMode,
            result,
            duration,
            context: this.getActiveContext(),
            capabilities: this.getCurrentCapabilities()
        };
    }
    /**
     * Process in direct mode
     * @param {string} input
     * @param {any} options
     * @private
      */
    async processDirectMode(input, options) {
        const systemPrompt = this.getActiveSystemPrompt();
        return {
            type: 'direct',
            response: `[Direct Mode] Processing: ${input}`,
            systemPrompt,
            persona: this.activePersona
        };
    }
    /**
     * Process in agent mode
     * @param {string} input
     * @param {any} options
     * @private
      */
    async processAgentMode(input, options) {
        this.emit('agents:process', {
            input,
            options,
            context: this.conversationContext
        });
        return {
            type: 'agent',
            response: `[Agent Mode] Delegating to agents: ${input}`,
            activeAgents: ['orchestrator', 'worker', 'synthesizer']
        };
    }
    /**
     * Process in hybrid mode
     * @param {string} input
     * @param {any} options
     * @private
      */
    async processHybridMode(input, options) {
        // Determine if agents are needed
        const complexity = this.assessComplexity(input);
        if (complexity > 0.7) {
            // Use agents for complex tasks
            return this.processAgentMode(input, options);
        }
        else {
            // Use direct mode for simple queries
            return this.processDirectMode(input, options);
        }
    }
    /**
     * Assess input complexity
     * @param {string} input
     * @private
      */
    assessComplexity(input) {
        let score = 0;
        // Length factor
        const words = input.split(/\s+/).length;
        score += Math.min(words / 100, 0.3);
        // Technical terms
        const technicalTerms = /\b(api|database|function|class|module|deploy|debug)\b/gi;
        const matches = input.match(technicalTerms);
        score += matches ? Math.min(matches.length * 0.1, 0.3) : 0;
        // Action verbs
        const actionVerbs = /\b(create|implement|analyze|refactor|optimize)\b/gi;
        const actions = input.match(actionVerbs);
        score += actions ? Math.min(actions.length * 0.15, 0.4) : 0;
        return Math.min(score, 1);
    }
    /**
     * Update system prompt dynamically
     * @param {string} mode - Mode to update
     * @param {string} prompt - New system prompt
     */
    updateSystemPrompt(mode, prompt) {
        const processedPrompt = this.processTemplateVariables(prompt);
        this.systemPrompts.set(mode, processedPrompt);
        // Update mode configuration
        const config = this.modeConfigurations.get(mode);
        if (config) {
            config.systemPrompt = processedPrompt;
        }
        this.emit('prompt:updated', {
            mode,
            prompt: processedPrompt
        });
    }
    /**
     * Process template variables in prompt
     * @param {string} prompt
     * @private
      */
    processTemplateVariables(prompt) {
        let processed = prompt;
        for (const [key, value] of this.templateVariables) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            processed = processed.replace(regex, String(value));
        }
        // Process conditional instructions
        processed = this.processConditionalInstructions(processed);
        return processed;
    }
    /**
     * Process conditional instructions
     * @param {string} prompt
     * @private
      */
    processConditionalInstructions(prompt) {
        // Process IF blocks
        const ifRegex = /\{\{IF\s+(.+?)\}\}(.*?)\{\{ENDIF\}\}/gs;
        return prompt.replace(ifRegex, (/** @type {any} */ match, /** @type {any} */ condition, /** @type {any} */ content) => {
            if (this.evaluateCondition(condition)) {
                return content;
            }
            return '';
        });
    }
    /**
     * Evaluate condition
     * @param {any} condition
     * @private
      */
    evaluateCondition(condition) {
        // Simple condition evaluation
        // In production, use a proper expression parser
        try {
            const context = Object.fromEntries(this.templateVariables);
            const fn = new Function(...Object.keys(context), `return ${condition}`);
            return fn(...Object.values(context));
        }
        catch {
            return false;
        }
    }
    /**
     * Add to conversation context
     * @param {string} key - Context key
     * @param {any} value - Context value
     */
    addToContext(key, value) {
        this.conversationContext.set(key, value);
        // Prune if size exceeds limit
        if (this.conversationContext.size > 1000) {
            const entries = Array.from(this.conversationContext.entries());
            this.conversationContext = new Map(entries.slice(-500));
        }
    }
    /**
     * Get active context
     */
    getActiveContext() {
        return {
            mode: this.currentMode,
            persona: this.activePersona,
            conversation: Object.fromEntries(this.conversationContext),
            variables: Object.fromEntries(this.templateVariables),
            sessionId: this.sessionId
        };
    }
    /**
     * Get current capabilities
     */
    getCurrentCapabilities() {
        const config = this.modeConfigurations.get(this.currentMode);
        return config ? config.capabilities : {};
    }
    /**
     * Get active system prompt
     */
    getActiveSystemPrompt() {
        return this.systemPrompts.get(this.currentMode) ||
            this.modeConfigurations.get(this.currentMode)?.systemPrompt ||
            'You are a helpful AI assistant.';
    }
    /**
     * Get mode change reason
     * @param {string} input
     * @param {string} suggestedMode
     * @private
      */
    getModeChangeReason(input, suggestedMode) {
        if (suggestedMode === INTERACTION_MODE.AGENT_ENABLED) {
            return 'Complex task detected requiring agent capabilities';
        }
        else if (suggestedMode === INTERACTION_MODE.DIRECT) {
            return 'Simple query detected, direct response is sufficient';
        }
        else {
            return 'Mixed complexity detected, hybrid approach recommended';
        }
    }
    /**
     * Update average response time
     * @param {number} duration
     * @private
      */
    updateAverageResponseTime(duration) {
        const total = this.metrics.averageResponseTime * (this.metrics.totalInteractions - 1);
        this.metrics.averageResponseTime = (total + duration) / this.metrics.totalInteractions;
    }
    /**
     * Persist context (placeholder)
     * @param {any} context
     * @private
      */
    async persistContext(context) {
        // In production, save to database or file system
        this.emit('context:persist', context);
    }
    /**
     * Persist persona (placeholder)
     * @param {any} persona
     * @private
      */
    async persistPersona(persona) {
        // In production, save to database or file system
        this.emit('persona:persist', persona);
    }
    /**
     * Get metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            currentMode: this.currentMode,
            activePersona: this.activePersona,
            contextSize: this.conversationContext.size,
            personaCount: this.personas.size
        };
    }
    /**
     * Export configuration
     */
    exportConfiguration() {
        return {
            modes: Array.from(this.modeConfigurations.entries()),
            personas: Array.from(this.personas.entries()),
            systemPrompts: Array.from(this.systemPrompts.entries()),
            variables: Array.from(this.templateVariables.entries()),
            metrics: this.getMetrics()
        };
    }
    /**
     * @param {any} config
      */
    importConfiguration(config) {
        if (config.modes) {
            this.modeConfigurations = new Map(config.modes);
        }
        if (config.personas) {
            this.personas = new Map(config.personas);
        }
        if (config.systemPrompts) {
            this.systemPrompts = new Map(config.systemPrompts);
        }
        if (config.variables) {
            this.templateVariables = new Map(config.variables);
        }
        this.emit('configuration:imported', config);
    }
}
// Export constants
InteractionModeManager.MODES = INTERACTION_MODE;
InteractionModeManager.STATES = TRANSITION_STATE;
module.exports = { InteractionModeManager, INTERACTION_MODE, TRANSITION_STATE };
//# sourceMappingURL=InteractionModeManager.js.map