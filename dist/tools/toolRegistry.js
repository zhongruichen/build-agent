"use strict";
const { writeFile, readFile, listFiles, summarizeFile } = require('./fileSystem.js');
const { executeCommand } = require('./terminal.js');
const { search } = require('./webSearch.js');
const git = require('./git.js');
const dbg = require('./debugger.js');
const agent = require('./agent.js');
/**
 * @typedef {object} ToolContext
 * @property {import('../agents/codebaseScannerAgent').CodebaseScannerAgent} scannerAgent
 * @property {import('../config').RoleProfile} workerProfile
 * @property {import('events').EventEmitter} agentMessageBus
 * @property {string} [senderId]
 * @property {number} [subTaskId]
 */
/**
 * @typedef {object} ToolDefinition
 * @property {(...args: any[]) => Promise<any>} implementation The function that implements the tool.
 * @property {(args: object, context: ToolContext) => any[]} paramExtractor A function to extract and order parameters from the args object.
 */
/**
 * The registry maps tool names to their definitions.
 * @type {Object.<string, ToolDefinition>}
 */
const toolRegistry = {
    'fileSystem.writeFile': {
        implementation: writeFile,
        paramExtractor: (/** @type {any} */ args) => [args.path, args.content]
    },
    'fileSystem.readFile': {
        implementation: readFile,
        paramExtractor: (/** @type {any} */ args) => [args.path]
    },
    'fileSystem.listFiles': {
        implementation: listFiles,
        paramExtractor: (/** @type {any} */ args) => [args.path || './']
    },
    'fileSystem.summarizeFile': {
        implementation: summarizeFile,
        paramExtractor: (/** @type {any} */ args, context) => [args.path, context.scannerAgent]
    },
    'terminal.executeCommand': {
        implementation: executeCommand,
        paramExtractor: (/** @type {any} */ args) => [args.command]
    },
    'webSearch.search': {
        implementation: search,
        paramExtractor: (/** @type {any} */ args) => [args.query]
    },
    'git.getCurrentBranch': {
        implementation: git.getCurrentBranch,
        paramExtractor: () => []
    },
    'git.createBranch': {
        implementation: git.createBranch,
        paramExtractor: (/** @type {any} */ args) => [args.branchName]
    },
    'git.stageFiles': {
        implementation: git.stageFiles,
        paramExtractor: (/** @type {any} */ args) => [args.files]
    },
    'git.commit': {
        implementation: git.commit,
        paramExtractor: (/** @type {any} */ args) => [args.message]
    },
    'git.getStatus': {
        implementation: git.getStatus,
        paramExtractor: () => []
    },
    'debugger.start': {
        implementation: dbg.tools.start,
        paramExtractor: (/** @type {any} */ args) => [args.configName]
    },
    'debugger.stop': { implementation: dbg.tools.stop, paramExtractor: () => [] },
    'debugger.next': { implementation: dbg.tools.next, paramExtractor: () => [] },
    'debugger.stepIn': { implementation: dbg.tools.stepIn, paramExtractor: () => [] },
    'debugger.stepOut': { implementation: dbg.tools.stepOut, paramExtractor: () => [] },
    'debugger.continue': { implementation: dbg.tools.continue, paramExtractor: () => [] },
    'debugger.addBreakpoint': {
        implementation: dbg.tools.addBreakpoint,
        paramExtractor: (/** @type {any} */ args) => [args.file, args.line]
    },
    'debugger.removeBreakpoint': {
        implementation: dbg.tools.removeBreakpoint,
        paramExtractor: (/** @type {any} */ args) => [args.file, args.line]
    },
    'debugger.evaluate': {
        implementation: dbg.tools.evaluate,
        paramExtractor: (/** @type {any} */ args) => [args.expression]
    },
    'agent.sendMessage': {
        implementation: agent.sendMessage,
        paramExtractor: (args, context) => [args, context]
    },
    'agent.createSubTask': {
        implementation: agent.createSubTask,
        paramExtractor: (/** @type {any} */ args, context) => [args, context]
    },
};
/**
 * Executes a tool based on its name and arguments.
 * @param {string} toolName The name of the tool to execute.
 * @param {object} args The arguments for the tool.
 * @param {import('../logger')} logger A logger object with a logLine method.
 * @param {ToolContext} toolContext An object containing contextual tools and instances.
 * @returns {Promise<any>} The result of the tool execution.
 */
async function executeTool(toolName, args, logger, toolContext) {
    logger.logLine(`\n--- Tool Call ---`);
    logger.logLine(`Tool: ${toolName}`);
    logger.logLine(`Arguments: ${JSON.stringify(args)}`);
    // Security Check: Verify the agent has permission to use the tool.
    if (!toolContext.workerProfile.allowedTools.includes(toolName)) {
        const errorMsg = `Error: Agent role "Worker" is not authorized to use tool "${toolName}".`;
        logger.logLine(errorMsg);
        throw new Error(errorMsg);
    }
    const toolDefinition = toolRegistry[toolName];
    if (!toolDefinition) {
        const errorMsg = `Error: Tool "${toolName}" not found.`;
        logger.logLine(errorMsg);
        throw new Error(errorMsg);
    }
    try {
        const params = toolDefinition.paramExtractor(args, toolContext);
        const result = await toolDefinition.implementation(...params);
        logger.logLine(`--- Tool Result ---`);
        logger.logLine(result);
        logger.logLine(`--- End Tool ---`);
        return result;
    }
    catch (error) {
        const errorMsg = `Error executing tool "${toolName}": ${error instanceof Error ? error.message : String(error)}`;
        logger.logLine(errorMsg);
        throw new Error(errorMsg);
    }
}
module.exports = { executeTool, toolRegistry };
//# sourceMappingURL=toolRegistry.js.map