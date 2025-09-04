const vscode = require('vscode');

/** @type {vscode.OutputChannel | undefined} */
let outputChannel; // Singleton output channel

function createLogChannel() {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel("多智能体日志");
    }
}

/**
 * @param {any} message
 */
function log(message) {
    if (outputChannel) {
        outputChannel.append(String(message));
    }
}

/**
 * @param {any} message
 */
function logLine(message) {
    if (outputChannel) {
        outputChannel.appendLine(String(message));
    }
}

/**
 * @param {any} message
 */
function error(message) {
    if (outputChannel) {
        const timestamp = new Date().toISOString();
        outputChannel.appendLine(`[${timestamp}] [ERROR] ${String(message)}`);
    }
}

function show() {
    if (outputChannel) {
        outputChannel.show(true); // true to preserve focus
    }
}

function dispose() {
    if (outputChannel) {
        outputChannel.dispose();
        outputChannel = undefined;
    }
}

module.exports = {
    createLogChannel,
    log,
    logLine,
    error,
    logError: error, // Alias for compatibility
    show,
    dispose
};
