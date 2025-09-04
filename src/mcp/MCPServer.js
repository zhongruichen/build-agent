const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * MCP (Model Context Protocol) Server implementation
 * Provides a standardized interface for exposing tools and resources to LLM applications
 */
class MCPServer extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.serverInfo = {
            name: options.name || 'multi-agent-helper-mcp',
            version: options.version || '1.0.0',
            protocolVersion: '2024-11-05',
            capabilities: {
                tools: {},
                resources: {},
                prompts: {},
                logging: {}
            }
        };
        
        this.tools = new Map();
        this.resources = new Map();
        this.prompts = new Map();
        this.subscriptions = new Map();
        this.sessions = new Map();
        
        this.transport = null;
        this.isInitialized = false;
    }
    
    /**
     * Initialize the MCP server
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        
        this.isInitialized = true;
        this.emit('initialized', this.serverInfo);
    }
    
    /**
     * Register a tool with the MCP server
     * @param {Object} tool - Tool definition
     * @param {string} tool.name - Tool name
     * @param {string} tool.description - Tool description
     * @param {Object} tool.inputSchema - JSON Schema for tool parameters
     * @param {Function} tool.handler - Tool execution handler
     */
    registerTool(tool) {
        if (!tool.name || !tool.handler) {
            throw new Error('Tool must have a name and handler');
        }
        
        const toolDefinition = {
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema || {
                type: 'object',
                properties: {},
                required: []
            }
        };
        
        this.tools.set(tool.name, {
            definition: toolDefinition,
            handler: tool.handler
        });
        
        this.emit('toolRegistered', tool.name);
    }
    
    /**
     * Register a resource with the MCP server
     * @param {Object} resource - Resource definition
     * @param {string} resource.uri - Resource URI
     * @param {string} resource.name - Resource name
     * @param {string} resource.description - Resource description
     * @param {string} resource.mimeType - Resource MIME type
     * @param {Function} resource.handler - Resource fetch handler
     */
    registerResource(resource) {
        if (!resource.uri || !resource.handler) {
            throw new Error('Resource must have a URI and handler');
        }
        
        const resourceDefinition = {
            uri: resource.uri,
            name: resource.name || resource.uri,
            description: resource.description || '',
            mimeType: resource.mimeType || 'text/plain'
        };
        
        this.resources.set(resource.uri, {
            definition: resourceDefinition,
            handler: resource.handler
        });
        
        this.emit('resourceRegistered', resource.uri);
    }
    
    /**
     * Register a prompt template with the MCP server
     * @param {Object} prompt - Prompt definition
     * @param {string} prompt.name - Prompt name
     * @param {string} prompt.description - Prompt description
     * @param {Array} prompt.arguments - Prompt arguments
     * @param {Function} prompt.handler - Prompt generation handler
     */
    registerPrompt(prompt) {
        if (!prompt.name || !prompt.handler) {
            throw new Error('Prompt must have a name and handler');
        }
        
        const promptDefinition = {
            name: prompt.name,
            description: prompt.description || '',
            arguments: prompt.arguments || []
        };
        
        this.prompts.set(prompt.name, {
            definition: promptDefinition,
            handler: prompt.handler
        });
        
        this.emit('promptRegistered', prompt.name);
    }
    
    /**
     * Handle incoming MCP request
     * @param {Object} request - MCP request object
     * @returns {Promise<Object>} MCP response object
     */
    async handleRequest(request) {
        const { method, params, id } = request;
        
        try {
            let result;
            
            switch (method) {
                case 'initialize':
                    await this.initialize();
                    result = this.serverInfo;
                    break;
                    
                case 'tools/list':
                    result = await this.listTools();
                    break;
                    
                case 'tools/call':
                    result = await this.callTool(params.name, params.arguments);
                    break;
                    
                case 'resources/list':
                    result = await this.listResources();
                    break;
                    
                case 'resources/read':
                    result = await this.readResource(params.uri);
                    break;
                    
                case 'resources/subscribe':
                    result = await this.subscribeToResource(params.uri);
                    break;
                    
                case 'resources/unsubscribe':
                    result = await this.unsubscribeFromResource(params.uri);
                    break;
                    
                case 'prompts/list':
                    result = await this.listPrompts();
                    break;
                    
                case 'prompts/get':
                    result = await this.getPrompt(params.name, params.arguments);
                    break;
                    
                case 'completion/complete':
                    result = await this.handleCompletion(params);
                    break;
                    
                case 'logging/setLevel':
                    result = await this.setLogLevel(params.level);
                    break;
                    
                default:
                    throw new Error(`Unknown method: ${method}`);
            }
            
            return {
                jsonrpc: '2.0',
                id,
                result
            };
        } catch (error) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: error.message,
                    data: error.stack
                }
            };
        }
    }
    
    /**
     * List available tools
     */
    async listTools() {
        const tools = [];
        for (const [name, tool] of this.tools) {
            tools.push(tool.definition);
        }
        return { tools };
    }
    
    /**
     * Call a tool
     * @param {string} name - Tool name
     * @param {Object} args - Tool arguments
     */
    async callTool(name, args) {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool not found: ${name}`);
        }
        
        try {
            const result = await tool.handler(args);
            return {
                content: [
                    {
                        type: 'text',
                        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                    }
                ],
                isError: false
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${error.message}`
                    }
                ],
                isError: true
            };
        }
    }
    
    /**
     * List available resources
     */
    async listResources() {
        const resources = [];
        for (const [uri, resource] of this.resources) {
            resources.push(resource.definition);
        }
        return { resources };
    }
    
    /**
     * Read a resource
     * @param {string} uri - Resource URI
     */
    async readResource(uri) {
        const resource = this.resources.get(uri);
        if (!resource) {
            throw new Error(`Resource not found: ${uri}`);
        }
        
        const content = await resource.handler();
        return {
            contents: [
                {
                    uri,
                    mimeType: resource.definition.mimeType,
                    text: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
                }
            ]
        };
    }
    
    /**
     * Subscribe to resource updates
     * @param {string} uri - Resource URI
     */
    async subscribeToResource(uri) {
        const resource = this.resources.get(uri);
        if (!resource) {
            throw new Error(`Resource not found: ${uri}`);
        }
        
        const subscriptionId = uuidv4();
        this.subscriptions.set(subscriptionId, {
            uri,
            createdAt: new Date()
        });
        
        return { subscriptionId };
    }
    
    /**
     * Unsubscribe from resource updates
     * @param {string} uri - Resource URI
     */
    async unsubscribeFromResource(uri) {
        for (const [id, subscription] of this.subscriptions) {
            if (subscription.uri === uri) {
                this.subscriptions.delete(id);
            }
        }
        return { success: true };
    }
    
    /**
     * List available prompts
     */
    async listPrompts() {
        const prompts = [];
        for (const [name, prompt] of this.prompts) {
            prompts.push(prompt.definition);
        }
        return { prompts };
    }
    
    /**
     * Get a prompt with arguments
     * @param {string} name - Prompt name
     * @param {Object} args - Prompt arguments
     */
    async getPrompt(name, args) {
        const prompt = this.prompts.get(name);
        if (!prompt) {
            throw new Error(`Prompt not found: ${name}`);
        }
        
        const result = await prompt.handler(args);
        return {
            description: prompt.definition.description,
            messages: Array.isArray(result) ? result : [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: result
                    }
                }
            ]
        };
    }
    
    /**
     * Handle completion request
     * @param {Object} params - Completion parameters
     */
    async handleCompletion(params) {
        // This would integrate with the existing LLM provider
        // For now, return a placeholder
        return {
            completion: {
                values: [],
                total: 0,
                hasMore: false
            }
        };
    }
    
    /**
     * Set logging level
     * @param {string} level - Log level
     */
    async setLogLevel(level) {
        this.emit('logLevelChanged', level);
        return { level };
    }
    
    /**
     * Send notification to client
     * @param {string} method - Notification method
     * @param {Object} params - Notification parameters
     */
    sendNotification(method, params) {
        if (this.transport) {
            this.transport.send({
                jsonrpc: '2.0',
                method,
                params
            });
        }
    }
    
    /**
     * Notify resource updated
     * @param {string} uri - Resource URI
     */
    notifyResourceUpdated(uri) {
        this.sendNotification('notifications/resources/updated', { uri });
    }
    
    /**
     * Set transport for the server
     * @param {Object} transport - Transport implementation
     */
    setTransport(transport) {
        this.transport = transport;
    }
}

module.exports = { MCPServer };