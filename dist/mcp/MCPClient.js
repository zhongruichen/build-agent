"use strict";
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
/**
 * MCP (Model Context Protocol) Client implementation
 * Connects to MCP servers and provides access to their tools and resources
 */
class MCPClient extends EventEmitter {
    /**
     * @param {object} [options]
     * @param {string} [options.name]
     * @param {string} [options.version]
     */
    constructor(options = {}) {
        super();
        this.clientInfo = {
            name: options.name || 'multi-agent-helper-client',
            version: options.version || '1.0.0'
        };
        this.transport = null;
        this.serverInfo = null;
        this.isConnected = false;
        this.requestId = 0;
        this.pendingRequests = new Map();
        // Cache for server capabilities
        this.tools = new Map();
        this.resources = new Map();
        this.prompts = new Map();
    }
    /**
     * Connect to MCP server
     * @param {any} transport - Transport implementation
      */
    async connect(transport) {
        if (this.isConnected) {
            throw new Error('Client is already connected');
        }
        this.transport = transport;
        // Set up transport event handlers
        if (this.transport) {
            this.transport.on('message', this.handleMessage.bind(this));
            this.transport.on('error', this.handleError.bind(this));
            this.transport.on('close', this.handleClose.bind(this));
        }
        // Initialize connection
        const response = await this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {
                roots: {
                    listChanged: true
                },
                sampling: {}
            },
            clientInfo: this.clientInfo
        });
        this.serverInfo = response;
        this.isConnected = true;
        // Fetch available tools, resources, and prompts
        await this.refreshCapabilities();
        this.emit('connected', this.serverInfo);
        return this.serverInfo;
    }
    /**
     * Disconnect from MCP server
     */
    async disconnect() {
        if (!this.isConnected) {
            return;
        }
        this.isConnected = false;
        if (this.transport) {
            await this.transport.close();
            this.transport = null;
        }
        this.serverInfo = null;
        this.tools.clear();
        this.resources.clear();
        this.prompts.clear();
        this.pendingRequests.clear();
        this.emit('disconnected');
    }
    /**
     * Send a request to the server
     * @param {string} method - Request method
     * @param {object} [params] - Request parameters
     * @returns {Promise<any>} Response result
      */
    async sendRequest(method, params = {}) {
        if (!this.transport && method !== 'initialize') {
            throw new Error('Client is not connected');
        }
        const id = ++this.requestId;
        const request = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            if (this.transport) {
                this.transport.send(request);
            }
            // Set timeout for request
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timeout: ${method}`));
                }
            }, 30000); // 30 second timeout
        });
    }
    /**
     * Send a notification to the server
     * @param {string} method - Notification method
     * @param {object} [params] - Notification parameters
      */
    sendNotification(method, params = {}) {
        if (!this.transport) {
            throw new Error('Client is not connected');
        }
        const notification = {
            jsonrpc: '2.0',
            method,
            params
        };
        this.transport.send(notification);
    }
    /**
     * Handle incoming message from transport
     * @param {any} message - Incoming message
      */
    handleMessage(message) {
        if (message.id !== undefined) {
            // This is a response to a request
            const pending = this.pendingRequests.get(message.id);
            if (pending) {
                this.pendingRequests.delete(message.id);
                if (message.error) {
                    pending.reject(new Error(message.error.message));
                }
                else {
                    pending.resolve(message.result);
                }
            }
        }
        else if (message.method) {
            // This is a notification from the server
            this.handleNotification(message.method, message.params);
        }
    }
    /**
     * Handle notification from server
     * @param {string} method - Notification method
     * @param {any} params - Notification parameters
      */
    handleNotification(method, params) {
        switch (method) {
            case 'notifications/resources/updated':
                this.emit('resourceUpdated', params.uri);
                break;
            case 'notifications/tools/list/changed':
                this.refreshTools();
                break;
            case 'notifications/resources/list/changed':
                this.refreshResources();
                break;
            case 'notifications/prompts/list/changed':
                this.refreshPrompts();
                break;
            case 'notifications/message':
                this.emit('message', params);
                break;
            case 'notifications/progress':
                this.emit('progress', params);
                break;
            case 'notifications/cancelled':
                this.emit('cancelled', params);
                break;
            default:
                this.emit('notification', { method, params });
        }
    }
    /**
     * Handle transport error
     * @param {Error} error - Transport error
     */
    handleError(error) {
        this.emit('error', error);
    }
    /**
     * Handle transport close
     */
    handleClose() {
        this.isConnected = false;
        this.emit('disconnected');
    }
    /**
     * Refresh all capabilities from server
     */
    async refreshCapabilities() {
        await Promise.all([
            this.refreshTools(),
            this.refreshResources(),
            this.refreshPrompts()
        ]);
    }
    /**
     * Refresh tools list from server
     */
    async refreshTools() {
        try {
            const response = await this.sendRequest('tools/list');
            this.tools.clear();
            if (response.tools) {
                for (const tool of response.tools) {
                    this.tools.set(tool.name, tool);
                }
            }
            this.emit('toolsUpdated', Array.from(this.tools.values()));
        }
        catch (error) {
            console.error('Failed to refresh tools:', error);
        }
    }
    /**
     * Refresh resources list from server
     */
    async refreshResources() {
        try {
            const response = await this.sendRequest('resources/list');
            this.resources.clear();
            if (response.resources) {
                for (const resource of response.resources) {
                    this.resources.set(resource.uri, resource);
                }
            }
            this.emit('resourcesUpdated', Array.from(this.resources.values()));
        }
        catch (error) {
            console.error('Failed to refresh resources:', error);
        }
    }
    /**
     * Refresh prompts list from server
     */
    async refreshPrompts() {
        try {
            const response = await this.sendRequest('prompts/list');
            this.prompts.clear();
            if (response.prompts) {
                for (const prompt of response.prompts) {
                    this.prompts.set(prompt.name, prompt);
                }
            }
            this.emit('promptsUpdated', Array.from(this.prompts.values()));
        }
        catch (error) {
            console.error('Failed to refresh prompts:', error);
        }
    }
    /**
     * Call a tool on the server
     * @param {string} name - Tool name
     * @param {object} args - Tool arguments
     * @returns {Promise<object>} Tool result
      */
    async callTool(name, args = {}) {
        if (!this.tools.has(name)) {
            throw new Error(`Tool not found: ${name}`);
        }
        return this.sendRequest('tools/call', {
            name,
            arguments: args
        });
    }
    /**
     * Read a resource from the server
     * @param {string} uri - Resource URI
     * @returns {Promise<object>} Resource content
      */
    async readResource(uri) {
        if (!this.resources.has(uri)) {
            throw new Error(`Resource not found: ${uri}`);
        }
        return this.sendRequest('resources/read', { uri });
    }
    /**
     * Subscribe to resource updates
     * @param {string} uri - Resource URI
     * @returns {Promise<string>} Subscription ID
     */
    async subscribeToResource(uri) {
        const response = await this.sendRequest('resources/subscribe', { uri });
        return response.subscriptionId;
    }
    /**
     * Unsubscribe from resource updates
     * @param {string} uri - Resource URI
     */
    async unsubscribeFromResource(uri) {
        return this.sendRequest('resources/unsubscribe', { uri });
    }
    /**
     * Get a prompt from the server
     * @param {string} name - Prompt name
     * @param {object} args - Prompt arguments
     * @returns {Promise<object>} Prompt result
      */
    async getPrompt(name, args = {}) {
        if (!this.prompts.has(name)) {
            throw new Error(`Prompt not found: ${name}`);
        }
        return this.sendRequest('prompts/get', {
            name,
            arguments: args
        });
    }
    /**
     * Request completion from the server
     * @param {object} params - Completion parameters
     * @returns {Promise<object>} Completion result
      */
    async complete(params) {
        return this.sendRequest('completion/complete', params);
    }
    /**
     * Set logging level
     * @param {string} level - Log level
     */
    async setLogLevel(level) {
        return this.sendRequest('logging/setLevel', { level });
    }
    /**
     * Get available tools
     * @returns {any[]} List of tools
      */
    getTools() {
        return Array.from(this.tools.values());
    }
    /**
     * Get available resources
     * @returns {any[]} List of resources
      */
    getResources() {
        return Array.from(this.resources.values());
    }
    /**
     * Get available prompts
     * @returns {any[]} List of prompts
      */
    getPrompts() {
        return Array.from(this.prompts.values());
    }
    /**
     * Check if a tool is available
     * @param {string} name - Tool name
     * @returns {boolean} Whether the tool is available
     */
    hasTool(name) {
        return this.tools.has(name);
    }
    /**
     * Check if a resource is available
     * @param {string} uri - Resource URI
     * @returns {boolean} Whether the resource is available
     */
    hasResource(uri) {
        return this.resources.has(uri);
    }
    /**
     * Check if a prompt is available
     * @param {string} name - Prompt name
     * @returns {boolean} Whether the prompt is available
     */
    hasPrompt(name) {
        return this.prompts.has(name);
    }
}
module.exports = { MCPClient };
//# sourceMappingURL=MCPClient.js.map