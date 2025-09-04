const { MCPServer } = require('./MCPServer');
const { toolRegistry } = require('../tools/toolRegistry');
const logger = require('../logger');

/**
 * Adapter to expose existing tools via MCP protocol
 */
class MCPToolAdapter {
    constructor() {
        this.mcpServer = null;
        this.toolContext = null;
    }
    
    /**
     * Initialize the MCP tool adapter
     * @param {Object} toolContext - Context for tool execution
     */
    async initialize(toolContext) {
        this.toolContext = toolContext;
        
        // Create MCP server
        this.mcpServer = new MCPServer({
            name: 'multi-agent-helper-tools',
            version: '1.0.0'
        });
        
        // Register all tools from the tool registry
        this.registerTools();
        
        // Register workspace resources
        this.registerResources();
        
        // Register agent prompts
        this.registerPrompts();
        
        await this.mcpServer.initialize();
        
        return this.mcpServer;
    }
    
    /**
     * Register all tools from the tool registry
     */
    registerTools() {
        for (const [toolName, toolDef] of Object.entries(toolRegistry)) {
            // Convert tool name format (e.g., 'fileSystem.writeFile' to 'file_write')
            const mcpToolName = this.convertToolName(toolName);
            
            // Create input schema from tool definition
            const inputSchema = this.createInputSchema(toolName, toolDef);
            
            // Register the tool with MCP server
            this.mcpServer.registerTool({
                name: mcpToolName,
                description: this.getToolDescription(toolName),
                inputSchema: inputSchema,
                handler: async (args) => {
                    return this.executeToolWithMCP(toolName, args);
                }
            });
        }
    }
    
    /**
     * Register workspace resources
     */
    registerResources() {
        // Register project structure resource
        this.mcpServer.registerResource({
            uri: 'workspace://project-structure',
            name: 'Project Structure',
            description: 'Current project file structure',
            mimeType: 'application/json',
            handler: async () => {
                const vscode = require('vscode');
                const listFiles = require('../tools/fileSystem').listFiles;
                const structure = await listFiles('./');
                return structure;
            }
        });
        
        // Register task context resource
        this.mcpServer.registerResource({
            uri: 'workspace://task-context',
            name: 'Task Context',
            description: 'Current task execution context',
            mimeType: 'application/json',
            handler: async () => {
                if (this.toolContext && this.toolContext.taskContext) {
                    return JSON.stringify(this.toolContext.taskContext, null, 2);
                }
                return '{}';
            }
        });
        
        // Register agent status resource
        this.mcpServer.registerResource({
            uri: 'workspace://agent-status',
            name: 'Agent Status',
            description: 'Status of all active agents',
            mimeType: 'application/json',
            handler: async () => {
                const status = {
                    agents: [],
                    activeTasks: []
                };
                
                // Collect agent status information
                if (this.toolContext && this.toolContext.agents) {
                    for (const [name, agent] of Object.entries(this.toolContext.agents)) {
                        status.agents.push({
                            name: name,
                            id: agent.id,
                            isActive: true
                        });
                    }
                }
                
                return JSON.stringify(status, null, 2);
            }
        });
    }
    
    /**
     * Register agent prompts
     */
    registerPrompts() {
        const prompts = require('../agents/prompts');
        
        // Register orchestrator prompt
        this.mcpServer.registerPrompt({
            name: 'orchestrator',
            description: 'Orchestrator agent system prompt',
            arguments: [
                {
                    name: 'taskContext',
                    description: 'Current task context',
                    required: false
                }
            ],
            handler: async (args) => {
                let prompt = prompts.ORCHESTRATOR_PROMPT;
                if (args.taskContext) {
                    prompt += `\n\nCurrent Task Context:\n${JSON.stringify(args.taskContext, null, 2)}`;
                }
                return prompt;
            }
        });
        
        // Register worker prompt
        this.mcpServer.registerPrompt({
            name: 'worker',
            description: 'Worker agent system prompt',
            arguments: [
                {
                    name: 'subtask',
                    description: 'Specific subtask to execute',
                    required: false
                }
            ],
            handler: async (args) => {
                let prompt = prompts.WORKER_PROMPT;
                if (args.subtask) {
                    prompt += `\n\nCurrent Subtask:\n${JSON.stringify(args.subtask, null, 2)}`;
                }
                return prompt;
            }
        });
        
        // Register synthesizer prompt
        this.mcpServer.registerPrompt({
            name: 'synthesizer',
            description: 'Synthesizer agent system prompt',
            arguments: [],
            handler: async () => {
                return prompts.SYNTHESIZER_PROMPT;
            }
        });
    }
    
    /**
     * Convert tool name to MCP format
     * @param {string} toolName - Original tool name
     * @returns {string} MCP-formatted tool name
     */
    convertToolName(toolName) {
        // Convert 'fileSystem.writeFile' to 'file_write'
        const mapping = {
            'fileSystem.writeFile': 'file_write',
            'fileSystem.readFile': 'file_read',
            'fileSystem.listFiles': 'file_list',
            'fileSystem.summarizeFile': 'file_summarize',
            'terminal.executeCommand': 'terminal_execute',
            'webSearch.search': 'web_search',
            'git.getCurrentBranch': 'git_current_branch',
            'git.createBranch': 'git_create_branch',
            'git.stageFiles': 'git_stage',
            'git.commit': 'git_commit',
            'git.getStatus': 'git_status',
            'debugger.start': 'debug_start',
            'debugger.stop': 'debug_stop',
            'debugger.next': 'debug_next',
            'debugger.stepIn': 'debug_step_in',
            'debugger.stepOut': 'debug_step_out',
            'debugger.continue': 'debug_continue',
            'debugger.addBreakpoint': 'debug_add_breakpoint',
            'debugger.removeBreakpoint': 'debug_remove_breakpoint',
            'debugger.evaluate': 'debug_evaluate',
            'agent.sendMessage': 'agent_send_message',
            'agent.createSubTask': 'agent_create_subtask'
        };
        
        return mapping[toolName] || toolName.replace(/\./g, '_');
    }
    
    /**
     * Get tool description
     * @param {string} toolName - Tool name
     * @returns {string} Tool description
     */
    getToolDescription(toolName) {
        const descriptions = {
            'fileSystem.writeFile': 'Write content to a file in the workspace',
            'fileSystem.readFile': 'Read content from a file in the workspace',
            'fileSystem.listFiles': 'List files and directories in a given path',
            'fileSystem.summarizeFile': 'Read and summarize the content of a file',
            'terminal.executeCommand': 'Execute a command in the terminal',
            'webSearch.search': 'Search the web for information',
            'git.getCurrentBranch': 'Get the current Git branch',
            'git.createBranch': 'Create a new Git branch',
            'git.stageFiles': 'Stage files for Git commit',
            'git.commit': 'Create a Git commit',
            'git.getStatus': 'Get Git repository status',
            'debugger.start': 'Start a debugging session',
            'debugger.stop': 'Stop the debugging session',
            'debugger.next': 'Step to the next line in debugger',
            'debugger.stepIn': 'Step into function in debugger',
            'debugger.stepOut': 'Step out of function in debugger',
            'debugger.continue': 'Continue execution in debugger',
            'debugger.addBreakpoint': 'Add a breakpoint',
            'debugger.removeBreakpoint': 'Remove a breakpoint',
            'debugger.evaluate': 'Evaluate expression in debugger',
            'agent.sendMessage': 'Send a message to another agent',
            'agent.createSubTask': 'Create a new subtask'
        };
        
        return descriptions[toolName] || `Execute ${toolName}`;
    }
    
    /**
     * Create input schema for a tool
     * @param {string} toolName - Tool name
     * @param {Object} toolDef - Tool definition
     * @returns {Object} JSON Schema for tool parameters
     */
    createInputSchema(toolName, toolDef) {
        const schemas = {
            'fileSystem.writeFile': {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path relative to workspace' },
                    content: { type: 'string', description: 'Content to write to the file' }
                },
                required: ['path', 'content']
            },
            'fileSystem.readFile': {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path relative to workspace' }
                },
                required: ['path']
            },
            'fileSystem.listFiles': {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Directory path relative to workspace', default: './' }
                }
            },
            'fileSystem.summarizeFile': {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path to summarize' }
                },
                required: ['path']
            },
            'terminal.executeCommand': {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Command to execute in terminal' }
                },
                required: ['command']
            },
            'webSearch.search': {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Search query' }
                },
                required: ['query']
            },
            'git.createBranch': {
                type: 'object',
                properties: {
                    branchName: { type: 'string', description: 'Name of the new branch' }
                },
                required: ['branchName']
            },
            'git.stageFiles': {
                type: 'object',
                properties: {
                    files: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Files to stage'
                    }
                },
                required: ['files']
            },
            'git.commit': {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Commit message' }
                },
                required: ['message']
            },
            'debugger.start': {
                type: 'object',
                properties: {
                    configName: { type: 'string', description: 'Debug configuration name' }
                }
            },
            'debugger.addBreakpoint': {
                type: 'object',
                properties: {
                    file: { type: 'string', description: 'File path' },
                    line: { type: 'number', description: 'Line number' }
                },
                required: ['file', 'line']
            },
            'debugger.removeBreakpoint': {
                type: 'object',
                properties: {
                    file: { type: 'string', description: 'File path' },
                    line: { type: 'number', description: 'Line number' }
                },
                required: ['file', 'line']
            },
            'debugger.evaluate': {
                type: 'object',
                properties: {
                    expression: { type: 'string', description: 'Expression to evaluate' }
                },
                required: ['expression']
            },
            'agent.sendMessage': {
                type: 'object',
                properties: {
                    recipientId: { type: 'string', description: 'Recipient agent ID' },
                    messageContent: { type: 'string', description: 'Message content' }
                },
                required: ['recipientId', 'messageContent']
            },
            'agent.createSubTask': {
                type: 'object',
                properties: {
                    recipientRole: { type: 'string', description: 'Recipient agent role' },
                    taskDescription: { type: 'string', description: 'Task description' }
                },
                required: ['recipientRole', 'taskDescription']
            }
        };
        
        // Return default schema for tools without specific schemas
        return schemas[toolName] || {
            type: 'object',
            properties: {},
            additionalProperties: true
        };
    }
    
    /**
     * Execute a tool via MCP
     * @param {string} toolName - Original tool name
     * @param {Object} args - Tool arguments
     * @returns {Promise<any>} Tool execution result
     */
    async executeToolWithMCP(toolName, args) {
        if (!this.toolContext) {
            throw new Error('Tool context not initialized');
        }
        
        const toolDef = toolRegistry[toolName];
        if (!toolDef) {
            throw new Error(`Tool not found: ${toolName}`);
        }
        
        try {
            // Log the tool execution
            logger.logLine(`\n--- MCP Tool Call ---`);
            logger.logLine(`Tool: ${toolName}`);
            logger.logLine(`Arguments: ${JSON.stringify(args)}`);
            
            // Extract parameters using the tool's param extractor
            const params = toolDef.paramExtractor(args, this.toolContext);
            
            // Execute the tool
            const result = await toolDef.implementation(...params);
            
            logger.logLine(`--- MCP Tool Result ---`);
            logger.logLine(result);
            logger.logLine(`--- End MCP Tool ---`);
            
            return result;
        } catch (error) {
            const errorMsg = `Error executing tool "${toolName}": ${error instanceof Error ? error.message : String(error)}`;
            logger.logLine(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    /**
     * Get the MCP server instance
     * @returns {MCPServer} MCP server instance
     */
    getServer() {
        return this.mcpServer;
    }
    
    /**
     * Update tool context
     * @param {Object} context - New tool context
     */
    updateContext(context) {
        this.toolContext = context;
    }
}

module.exports = { MCPToolAdapter };