const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');

const CONFIG_DIR = path.join(os.homedir(), '.multi-agent-helper');
const CONFIG_FILE = path.join(CONFIG_DIR, 'api_services_config.json');

/**
 * @typedef {object} ModelParameters
 * @property {number} [temperature]
 * @property {number} [max_tokens]
 * @property {string} [system_prompt]
 */

/**
 * Represents a specific model.
 */
class Model {
    /**
     * @param {string} id The ID of the model.
     * @param {boolean} [isManual=false] Whether the model was added manually.
     * @param {ModelParameters} [parameters] Optional model-specific parameters.
     */
    constructor(id, isManual = false, parameters = {}) {
        this.id = id;
        this.isManual = isManual;
        this.parameters = parameters;
    }
}

/**
 * Represents an API service provider.
 */
class ServiceProvider {
    /**
     * @param {string} name The name of the service provider.
     * @param {string} baseUrl The base URL for the API.
     * @param {string} apiKey The API key.
     * @param {string} [id] The unique ID of the provider.
     * @param {Model[]} [models] The list of available models.
     */
    constructor(name, baseUrl, apiKey, id = uuidv4(), models = []) {
        this.id = id;
        this.name = name;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.models = models;
    }
}

/**
 * @typedef {object} ServiceManagerConfig
 * @property {ServiceProvider[]} serviceProviders
 * @property {string | null} defaultProviderId
 * @property {string | null} defaultModelId
 */

class ServiceManager {
    constructor() {
        /** @type {ServiceManagerConfig} */
        this.config = {
            serviceProviders: [],
            defaultProviderId: null,
            defaultModelId: null,
        };
    }

    async init() {
        try {
            await fs.mkdir(CONFIG_DIR, { recursive: true });
            const data = await fs.readFile(CONFIG_FILE, 'utf-8');
            this.config = JSON.parse(data);
            // Ensure old data structure is compatible
            this.config.serviceProviders.forEach(p => {
                p.models.forEach(m => {
                    if (!m.parameters) {
                        m.parameters = {};
                    }
                });
            });
        } catch (/** @type {any} */ error) {
            if (error.code === 'ENOENT') {
                this.addDefaultProviders();
                await this.saveConfig();
            } else {
                console.error('Error initializing ServiceManager:', error);
                throw error;
            }
        }
    }

    addDefaultProviders() {
        const defaultProviders = [
            new ServiceProvider('OpenAI', 'https://api.openai.com/v1', ''),
            new ServiceProvider('Anthropic', 'https://api.anthropic.com/v1', ''),
            new ServiceProvider('Google', 'https://generativelanguage.googleapis.com/v1beta', ''),
            new ServiceProvider('Groq', 'https://api.groq.com/openai/v1', '')
        ];
        this.config.serviceProviders.push(...defaultProviders);
    }

    async saveConfig() {
        try {
            await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
        } catch (error) {
            console.error('Error saving config:', error);
            throw error;
        }
    }

    /** @returns {ServiceProvider[]} */
    getAllProviders() {
        return this.config.serviceProviders;
    }

    /**
     * @param {string} id
     * @returns {ServiceProvider | undefined}
     */
    getProviderById(id) {
        return this.config.serviceProviders.find(p => p.id === id);
    }
    
    /**
     * @param {string} providerId
     * @param {string} modelId
     * @returns {Model | undefined}
     */
    _getModel(providerId, modelId) {
        const provider = this.getProviderById(providerId);
        return provider?.models.find(m => m.id === modelId);
    }

    /**
     * @param {string} name
     * @param {string} baseUrl
     * @param {string} apiKey
     * @returns {Promise<ServiceProvider>}
     */
    async addProvider(name, baseUrl, apiKey) {
        const newProvider = new ServiceProvider(name, baseUrl, apiKey);
        this.config.serviceProviders.push(newProvider);
        await this.saveConfig();
        return newProvider;
    }

    /**
     * @param {string} id
     * @param {Partial<ServiceProvider>} updates
     * @returns {Promise<ServiceProvider | undefined>}
     */
    async updateProvider(id, updates) {
        const provider = this.getProviderById(id);
        if (provider) {
            Object.assign(provider, updates);
            await this.saveConfig();
        }
        return provider;
    }

    /**
     * @param {string} id
     * @returns {Promise<void>}
     */
    async removeProvider(id) {
        this.config.serviceProviders = this.config.serviceProviders.filter(p => p.id !== id);
        if (this.config.defaultProviderId === id) {
            this.config.defaultProviderId = null;
            this.config.defaultModelId = null;
        }
        await this.saveConfig();
    }

    /**
     * @param {string} providerId
     * @param {string} modelId
     * @param {boolean} [isManual=true]
     * @returns {Promise<void>}
     */
    async addModel(providerId, modelId, isManual = true) {
        const provider = this.getProviderById(providerId);
        if (provider && !provider.models.some(m => m.id === modelId)) {
            provider.models.push(new Model(modelId, isManual));
            await this.saveConfig();
        }
    }

    /**
     * @param {string} providerId
     * @param {string} modelId
     * @returns {Promise<void>}
     */
    async removeModel(providerId, modelId) {
        const provider = this.getProviderById(providerId);
        if (provider) {
            provider.models = provider.models.filter(m => m.id !== modelId);
            if (this.config.defaultModelId === modelId) {
                this.config.defaultModelId = null;
            }
            await this.saveConfig();
        }
    }

    /**
     * @param {string} providerId
     * @returns {Promise<void>}
     */
    async fetchModels(providerId) {
        const provider = this.getProviderById(providerId);
        if (!provider) throw new Error('Provider not found');
        
        const url = new URL(provider.baseUrl);
        const modelsPath = url.pathname.endsWith('/v1') ? `${url.pathname}/models` : `${url.pathname.replace(/\/$/, '')}/v1/models`;
        
        const options = {
            hostname: url.hostname, port: url.port, path: modelsPath, method: 'GET',
            headers: { 'Authorization': `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' }
        };

        const client = url.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            const req = client.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', async () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsedData = JSON.parse(data);
                            /** @type {{id: string}[]} */
                            const modelData = parsedData.data || [];
                            const fetchedModels = modelData.map(m => new Model(m.id, false));
                            const manualModels = provider.models.filter(m => m.isManual);
                            provider.models = [...manualModels, ...fetchedModels];
                            await this.saveConfig();
                            resolve();
                        } catch (e) {
                            reject(new Error('Failed to parse models response.'));
                        }
                    } else {
                        reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`));
                    }
                });
            });
            req.on('error', (e) => reject(e));
            req.end();
        });
    }

    /**
     * @param {string} providerId
     * @param {string} modelId
     * @returns {Promise<void>}
     */
    async setDefault(providerId, modelId) {
        this.config.defaultProviderId = providerId;
        this.config.defaultModelId = modelId;
        await this.saveConfig();
    }

    /** @returns {{defaultProviderId: string | null, defaultModelId: string | null}} */
    getDefaults() {
        return {
            defaultProviderId: this.config.defaultProviderId,
            defaultModelId: this.config.defaultModelId,
        };
    }
    
    /**
     * @param {string} providerId
     * @param {string} modelId
     * @returns {Promise<ModelParameters | undefined>}
     */
    async getModelParameters(providerId, modelId) {
        const model = this._getModel(providerId, modelId);
        return model?.parameters;
    }

    /**
     * @param {string} providerId
     * @param {string} modelId
     * @param {ModelParameters} params
     * @returns {Promise<void>}
     */
    async saveModelParameters(providerId, modelId, params) {
        const model = this._getModel(providerId, modelId);
        if (model) {
            model.parameters = params;
            await this.saveConfig();
        }
    }

    /**
     * @param {string} providerId
     * @param {string} modelId
     * @returns {Promise<void>}
     */
    async resetModelParameters(providerId, modelId) {
        const model = this._getModel(providerId, modelId);
        if (model) {
            model.parameters = {};
            await this.saveConfig();
        }
    }
}

module.exports = {
    ServiceManager,
    ServiceProvider,
    Model
};