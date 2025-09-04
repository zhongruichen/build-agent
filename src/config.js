const vscode = require('vscode');
const prompts = require('./agents/prompts');
const { ServiceManager } = require('./services/serviceManager');

/**
 * @typedef {object} ThinkingConfig
 * @property {string} [preset]
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
 * @typedef {object} ModelParameters
 * @property {number} [temperature]
 * @property {number} [max_tokens]
 * @property {string} [system_prompt]
 * @property {ThinkingConfig} [thinkingConfig]
 */

/**
 * @typedef {object} ModelConfig
 * @property {string} name
 * @property {string} provider
 * @property {string} modelName
 * @property {string} [apiKey]
 * @property {string} [baseUrl]
 * @property {ModelParameters} [parameters]
 */

/**
 * @typedef {object} RoleProfile
 * @property {string} name
 * @property {string} model
 * @property {string} systemPrompt
 * @property {string[]} allowedTools
 * @property {boolean} [useThinkingChain]
 * @property {string} [thinkingConfigPreset] // e.g., 'default', 'deep', 'top'
 */
 
const DEFAULT_ROLES = [
    { name: 'Orchestrator', model: '', systemPrompt: prompts.ORCHESTRATOR_PROMPT, allowedTools: [], useThinkingChain: true, thinkingConfigPreset: 'top' },
    { name: 'Worker', model: '', systemPrompt: prompts.WORKER_PROMPT, allowedTools: ["fileSystem.writeFile", "fileSystem.readFile", "fileSystem.listFiles", "fileSystem.summarizeFile", "terminal.executeCommand", "webSearch.search", "git.getCurrentBranch", "git.createBranch", "git.stageFiles", "git.commit", "debugger.start", "debugger.stop", "debugger.addBreakpoint", "debugger.removeBreakpoint", "debugger.next", "debugger.stepIn", "debugger.stepOut", "debugger.continue", "debugger.evaluate", "agent.sendMessage", "agent.createSubTask"], useThinkingChain: false, thinkingConfigPreset: 'default' },
    { name: 'Synthesizer', model: '', systemPrompt: prompts.SYNTHESIZER_PROMPT, allowedTools: [], useThinkingChain: false, thinkingConfigPreset: 'default' },
    { name: 'Evaluator', model: '', systemPrompt: prompts.EVALUATOR_PROMPT, allowedTools: [], useThinkingChain: false, thinkingConfigPreset: 'default' },
    { name: 'CritiqueAggregator', model: '', systemPrompt: prompts.CRITIQUE_AGGREGATION_PROMPT, allowedTools: [], useThinkingChain: false, thinkingConfigPreset: 'default' },
    { name: 'CodebaseScanner', model: '', systemPrompt: '', allowedTools: [], useThinkingChain: false, thinkingConfigPreset: 'default' }, // Prompt is provided dynamically
    { name: 'Reflector', model: '', systemPrompt: '', allowedTools: [], useThinkingChain: true, thinkingConfigPreset: 'deep' }, // Reflector benefits from deep thinking
    { name: 'Reviewer', model: '', systemPrompt: '', allowedTools: [], useThinkingChain: false, thinkingConfigPreset: 'default' }, // Prompt is provided dynamically
    { name: 'KnowledgeExtractor', model: '', systemPrompt: '', allowedTools: [], useThinkingChain: true, thinkingConfigPreset: 'deep' } // Extractor benefits from deep thinking
];


/**
 * @returns {Array<ModelConfig>}
 */
function getModelConfigs() {
    return vscode.workspace.getConfiguration('multiAgent').get('models', []);
}

/**
 * Merges default role profiles with user-defined settings.
 * @returns {Array<RoleProfile>}
 */
function getRoleProfiles() {
    /** @type {Partial<RoleProfile>[]} */
    const userRoles = vscode.workspace.getConfiguration('multiAgent').get('roles', []);
    const userRolesMap = new Map(userRoles.map(role => [role.name, role]));

    return DEFAULT_ROLES.map(defaultRole => {
        const userRole = userRolesMap.get(defaultRole.name);
        if (userRole) {
            // User settings override defaults. An empty prompt from user is respected.
            return {
                ...defaultRole,
                ...userRole,
                systemPrompt: userRole.systemPrompt !== undefined ? userRole.systemPrompt : defaultRole.systemPrompt,
            };
        }
        return defaultRole;
    });
}

/**
 * Gets a specific role profile by name.
 * @param {string} roleName The name of the role to find (case-insensitive).
 * @returns {RoleProfile | undefined} The role profile object.
 */
function getRoleProfile(roleName) {
    const roles = getRoleProfiles();
    return roles.find(r => r.name.toLowerCase() === roleName.toLowerCase());
}

/**
 * Gets the full model configuration for a given role name.
 * @param {string} roleName The role name (e.g., 'Orchestrator').
 * @returns {ModelConfig | null} The model configuration object, or null if not found.
 */
function getModelForRole(roleName) {
    const allModels = getModelConfigs();
    if (allModels.length === 0) {
        return null;
    }

    const roleProfile = getRoleProfile(roleName);
    if (!roleProfile || !roleProfile.model) {
        // Fallback to the first model if role or model assignment is missing
        return JSON.parse(JSON.stringify(allModels[0]));
    }

    const model = allModels.find(m => m.name === roleProfile.model);
    if (model) {
        return JSON.parse(JSON.stringify(model));
    }

    // Fallback if the assigned model is not found
    return JSON.parse(JSON.stringify(allModels[0]));
}

/**
 * Gets the model configurations for a team role (which can have multiple models).
 * @param {string} [teamName='Evaluator']
 * @returns {Array<ModelConfig>} An array of model configuration objects.
 */
function getModelsForTeam(teamName = 'Evaluator') {
    // This can be expanded later to support multiple models for one role.
    const model = getModelForRole(teamName);
    return model ? [model] : [];
}


module.exports = {
    getModelForRole,
    getModelsForTeam,
    getRoleProfile
};
