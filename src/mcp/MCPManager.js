const { MCPServer } = require('./MCPServer');
const { MCPClient } = require('./MCPClient');
const { MCPToolAdapter } = require('./MCPToolAdapter');
const { StdioTransport } = require('./transports/StdioTransport');
const { spawn } = require('child_process');
const path = require('path');
const vscode = require('vscode');
const logger = require('../logger');

/**
 * MCP Manager - Manages MCP servers and clients
 */
class MCPManager {
    constructor() {
        this.servers = new Map();
        this.clients = new Map();
        this.toolAdapter = null;
        this.isInitialized = false;
    }
    
    /**
     * Initialize the MCP manager
     * @param {vscode.ExtensionContext} context - Extension context
      */
     async initialize(context) {
         if (this.isInitialized) {
             return;
         }
        
         logger.log('Initializing MCP Manager...');
        
         // Initialize tool adapter for exposing internal tools
         this.toolAdapter = new MCPToolAdapter();
        
         // Load MCP configuration
         const config = vscode.workspace.getConfiguration('multiAgent');
         /**
          * @typedef {object} MCPConfig
          * @property {any[]} servers
          * @property {any[]} clients
          */
         /** @type {MCPConfig} */
         const mcpConfig = config.get('mcp', { servers: [], clients: [] });
        
         // Start configured MCP servers
         if (mcpConfig.servers) {
             for (const serverConfig of mcpConfig.servers) {
                 try {
                     await this.startServer(serverConfig);
                 } catch (error) {
                     const errorMessage = error instanceof Error ? error.message : String(error);
                     logger.logError(`Failed to start MCP server ${serverConfig.name}: ${errorMessage}`);
                 }
             }
         }
        
         // Connect to configured MCP clients
         if (mcpConfig.clients) {
             for (const clientConfig of mcpConfig.clients) {
                 try {
                     await this.connectClient(clientConfig);
                 } catch (error) {
                     const errorMessage = error instanceof Error ? error.message : String(error);
                     logger.logError(`Failed to connect to MCP client ${clientConfig.name}: ${errorMessage}`);
                 }
             }
         }
        
        this.isInitialized = true;
        logger.log('MCP Manager initialized successfully');
    }
    
    /**
     * Start an MCP server
     * @param {object} config - Server configuration
     * @param {string} config.name
     * @param {string} config.command
     * @param {string[]} [config.args]
     * @param {object} [config.env]
      */
     async startServer(config) {
         const { name, command, args = [], env = {} } = config;
        
         if (this.servers.has(name)) {
             throw new Error(`Server ${name} is already running`);
         }
        
         logger.log(`Starting MCP server: ${name}`);
        
         // Spawn the server process
         const serverProcess = spawn(command, args, {
             env: { ...process.env, ...env },
             shell: true
         });
        
         // Create transport
         // @ts-ignore
         const transport = new StdioTransport(serverProcess);
         await transport.initialize();
        
        // Create and initialize server wrapper
        const server = {
            name,
            process: serverProcess,
            transport,
            config
        };
        
        this.servers.set(name, server);
        
        // Handle server process events
        serverProcess.on('exit', (code) => {
            logger.log(`MCP server ${name} exited with code ${code}`);
            this.servers.delete(name);
        });
        
        serverProcess.on('error', (error) => {
            logger.logError(`MCP server ${name} error: ${error.message}`);
        });
        
        logger.log(`MCP server ${name} started successfully`);
    }
    
    /**
     * Stop an MCP server
     * @param {string} name - Server name
     */
    async stopServer(name) {
        const server = this.servers.get(name);
        if (!server) {
            throw new Error(`Server ${name} not found`);
        }
        
        logger.log(`Stopping MCP server: ${name}`);
        
        // Close transport
        await server.transport.close();
        
        // Kill process if still running
        if (server.process && !server.process.killed) {
            server.process.kill();
        }
        
        this.servers.delete(name);
        logger.log(`MCP server ${name} stopped`);
    }
    
    /**
     * Connect to an MCP server as a client
     * @param {object} config - Client configuration
     * @param {string} config.name
     * @param {string} [config.command]
     * @param {string[]} [config.args]
     * @param {object} [config.env]
      */
     async connectClient(config) {
         const { name, command, args = [], env = {} } = config;
        
         if (this.clients.has(name)) {
             throw new Error(`Client ${name} is already connected`);
         }
        
         logger.log(`Connecting to MCP server: ${name}`);
        
         // Create client
         const client = new MCPClient({ name });
        
         // Spawn the server process if command is provided
         let transport;
         if (command) {
             const serverProcess = spawn(command, args, {
                 env: { ...process.env, ...env },
                 shell: true
             });
            
             // @ts-ignore
             transport = new StdioTransport(serverProcess);
             await transport.initialize();
         } else {
             // Connect to existing server
             throw new Error('Connecting to existing servers not yet implemented');
         }
        
        // Connect client
        await client.connect(transport);
        
        // Store client
        this.clients.set(name, {
            client,
            transport,
            config
        });
        
        // Register client tools with our tool registry
        this.registerClientTools(name, client);
        
        logger.log(`Connected to MCP server ${name} successfully`);
    }
    
    /**
     * Disconnect from an MCP server
     * @param {string} name - Client name
     */
    async disconnectClient(name) {
        const clientInfo = this.clients.get(name);
        if (!clientInfo) {
            throw new Error(`Client ${name} not found`);
        }
        
        logger.log(`Disconnecting from MCP server: ${name}`);
        
        await clientInfo.client.disconnect();
        this.clients.delete(name);
        
        logger.log(`Disconnected from MCP server ${name}`);
    }
    
    /**
     * Register tools from an MCP client with our tool registry
     * @param {string} clientName - Client name
     * @param {MCPClient} client - MCP client
     */
    registerClientTools(clientName, client) {
        const tools = client.getTools();
        const toolRegistry = require('../tools/toolRegistry');
        
        for (const tool of tools) {
            const toolName = `mcp.${clientName}.${tool.name}`;
            
            // Add to tool registry
            toolRegistry.toolRegistry[toolName] = {
                implementation: async (...args) => {
                    const result = await client.callTool(tool.name, args[0]);
                    // @ts-ignore
                    return result.content[0].text;
                },
                /** @param {any} args */
                paramExtractor: (args) => [args]
            };
            
            logger.log(`Registered MCP tool: ${toolName}`);
        }
    }
    
    /**
     * Get all available MCP tools
     * @returns {any[]} List of MCP tools
      */
     getAvailableTools() {
         /** @type {any[]} */
         const tools = [];
        
         // Get tools from all connected clients
         for (const [name, clientInfo] of this.clients) {
             const clientTools = clientInfo.client.getTools();
             for (const tool of clientTools) {
                 tools.push({
                     source: name,
                     ...tool
                 });
             }
         }
        
         return tools;
     }
    
    /**
     * Get all available MCP resources
     * @returns {any[]} List of MCP resources
      */
     getAvailableResources() {
         /** @type {any[]} */
         const resources = [];
        
         // Get resources from all connected clients
         for (const [name, clientInfo] of this.clients) {
             const clientResources = clientInfo.client.getResources();
             for (const resource of clientResources) {
                 resources.push({
                     source: name,
                     ...resource
                 });
             }
         }
        
         return resources;
     }
    
    /**
     * Get all available MCP prompts
     * @returns {any[]} List of MCP prompts
      */
     getAvailablePrompts() {
         /** @type {any[]} */
         const prompts = [];
        
         // Get prompts from all connected clients
         for (const [name, clientInfo] of this.clients) {
             const clientPrompts = clientInfo.client.getPrompts();
             for (const prompt of clientPrompts) {
                 prompts.push({
                     source: name,
                     ...prompt
                 });
             }
         }
        
         return prompts;
     }
    
    /**
     * Call a tool on a specific MCP server
     * @param {string} serverName - Server name
     * @param {string} toolName - Tool name
     * @param {Object} args - Tool arguments
     * @returns {Promise<any>} Tool result
     */
    async callTool(serverName, toolName, args) {
        const clientInfo = this.clients.get(serverName);
        if (!clientInfo) {
            throw new Error(`MCP server ${serverName} not found`);
        }
        
        return clientInfo.client.callTool(toolName, args);
    }
    
    /**
     * Read a resource from a specific MCP server
     * @param {string} serverName - Server name
     * @param {string} uri - Resource URI
     * @returns {Promise<any>} Resource content
     */
    async readResource(serverName, uri) {
        const clientInfo = this.clients.get(serverName);
        if (!clientInfo) {
            throw new Error(`MCP server ${serverName} not found`);
        }
        
        return clientInfo.client.readResource(uri);
    }
    
    /**
     * Get a prompt from a specific MCP server
     * @param {string} serverName - Server name
     * @param {string} promptName - Prompt name
     * @param {Object} args - Prompt arguments
     * @returns {Promise<any>} Prompt result
     */
    async getPrompt(serverName, promptName, args) {
        const clientInfo = this.clients.get(serverName);
        if (!clientInfo) {
            throw new Error(`MCP server ${serverName} not found`);
        }
        
        return clientInfo.client.getPrompt(promptName, args);
    }
    
    /**
     * Initialize the internal tool adapter
     * @param {Object} toolContext - Tool execution context
     */
    async initializeToolAdapter(toolContext) {
        if (!this.toolAdapter) {
            this.toolAdapter = new MCPToolAdapter();
        }
        
        return this.toolAdapter.initialize(toolContext);
    }
    
    /**
     * Update tool adapter context
     * @param {Object} context - New context
     */
    updateToolAdapterContext(context) {
        if (this.toolAdapter) {
            this.toolAdapter.updateContext(context);
        }
    }
    
    /**
     * Get server status
     * @returns {Object} Server status information
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            servers: Array.from(this.servers.keys()),
            clients: Array.from(this.clients.keys()),
            toolAdapterInitialized: this.toolAdapter !== null
        };
    }
    
    /**
     * Shutdown the MCP manager
     */
    async shutdown() {
        logger.log('Shutting down MCP Manager...');
        
        // Stop all servers
        for (const name of this.servers.keys()) {
            try {
                await this.stopServer(name);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.logError(`Error stopping server ${name}: ${errorMessage}`);
            }
        }
       
        // Disconnect all clients
        for (const name of this.clients.keys()) {
            try {
                await this.disconnectClient(name);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.logError(`Error disconnecting client ${name}: ${errorMessage}`);
            }
        }
        
        this.isInitialized = false;
        logger.log('MCP Manager shutdown complete');
    }
}

// Singleton instance
/** @type {MCPManager | null} */
let mcpManager = null;

/**
 * Get or create the MCP manager instance
 * @returns {MCPManager} The MCP manager instance
  */
function getMCPManager() {
    if (!mcpManager) {
        mcpManager = new MCPManager();
    }
    return mcpManager;
}

module.exports = { MCPManager, getMCPManager };