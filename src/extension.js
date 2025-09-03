const vscode = require('vscode');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { getModelForRole, getRoleProfile } = require('./config');
const logger = require('./logger');
const { TaskContext } = require('./agents/taskContext');
const { CodebaseScannerAgent } = require('./agents/codebaseScannerAgent');
const knowledgeBase = require('./memory/knowledgeBase.js');
const EventEmitter = require('events');
const { MainPanel } = require('./ui/mainPanel');
const { runHealthCheck } = require('./healthCheck');
const { listFiles } = require('./tools/fileSystem');
const gitTools = require('./tools/git');
const { runTaskExecution } = require('./taskExecutor');
const { OpenAICompatibleProvider } = require('./llm/provider');

const agentMessageBus = new EventEmitter();
/** @type {AbortController | null} */
let activeTaskController = null; // To control the currently running task

// --- Debug State Manager ---
/** @type {vscode.DebugSession | null} */
let activeDebugSession = null;

function setupDebugListeners() {
    const disposables = [];
    console.log('[诊断] 设置调试监听器...');
    
    disposables.push(vscode.debug.onDidStartDebugSession(session => {
        console.log('[诊断] 调试会话开始:', session.name);
        activeDebugSession = session;
        // 安全检查MainPanel是否存在
        if (MainPanel && MainPanel.update) {
            MainPanel.update({ command: 'log', text: `调试会话已开始: ${session.name} (类型: ${session.type})` });
            MainPanel.update({ command: 'updateDebuggerState', state: { isActive: true, sessionName: session.name } });
        } else {
            console.warn('[诊断] MainPanel未初始化，无法更新调试状态');
        }
    }));

    disposables.push(vscode.debug.onDidTerminateDebugSession(session => {
        console.log('[诊断] 调试会话终止:', session.name);
        activeDebugSession = null;
        // 安全检查MainPanel是否存在
        if (MainPanel && MainPanel.update) {
            MainPanel.update({ command: 'log', text: `调试会话已终止: ${session.name}` });
            MainPanel.update({ command: 'updateDebuggerState', state: { isActive: false, sessionName: null } });
        } else {
            console.warn('[诊断] MainPanel未初始化，无法更新调试状态');
        }
    }));

    if (vscode.debug.activeDebugSession) {
        activeDebugSession = vscode.debug.activeDebugSession;
        console.log('[诊断] 检测到已存在的调试会话:', activeDebugSession.name);
        if (MainPanel && MainPanel.update) {
            MainPanel.update({ command: 'log', text: `检测到已激活的调试会话: ${activeDebugSession.name}` });
            MainPanel.update({ command: 'updateDebuggerState', state: { isActive: true, sessionName: activeDebugSession.name } });
        }
    }
    return disposables;
}
// --- End Debug State Manager ---


/**
 * @param {import('./agents/codebaseScannerAgent').CodebaseScannerAgent} scannerAgent
 * @param {boolean} enableSmartScan
 */
async function scanProject(scannerAgent, enableSmartScan) {
    const message = enableSmartScan ? '正在快速扫描项目结构...' : '正在深度扫描项目代码库...';
    MainPanel.update({ command: 'log', text: message });

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return "没有打开的工作区。";
    }
    const rootPath = workspaceFolders[0].uri.fsPath;
    let projectContext = "项目结构:\n";
    const ignoreDirs = new Set(['.git', 'node_modules', 'dist', 'out', '.vscode']);
    const ignoreExtensions = new Set(['.lock', '.svg', '.png', '.jpg', '.jpeg', '.gif']);

    /**
     * @param {string} dir
     * @param {string} [indent='']
     */
    async function walk(dir, indent = '') {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (ignoreDirs.has(entry.name)) continue;

            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                projectContext += `${indent}- ${entry.name}/\n`;
                await walk(fullPath, indent + '  ');
            } else {
                if (ignoreExtensions.has(path.extname(entry.name))) continue;

                if (enableSmartScan) {
                    projectContext += `${indent}- ${entry.name}\n`;
                } else {
                    try {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const summary = await scannerAgent.executeTask(content);
                        projectContext += `${indent}- ${entry.name}: ${summary}\n`;
                    } catch (_) {
                        projectContext += `${indent}- ${entry.name}: (无法读取或总结文件)\n`;
                    }
                }
            }
        }
    }

    await walk(rootPath);
    MainPanel.update({ command: 'log', text: '项目扫描完成。' });
    return projectContext;
}


/**
 * @param {vscode.WorkspaceConfiguration} config
 */
async function migrateSettings(config) {
    const oldAssignments = config.get('roleAssignments');
    if (oldAssignments && typeof oldAssignments === 'object' && Object.keys(oldAssignments).length > 0) {
        MainPanel.update({ command: 'log', text: '检测到旧版角色配置，正在迁移...' });
        /** @type {any[]} */
        const defaultRoles = config.inspect('roles')?.defaultValue || [];
        const newRoles = defaultRoles.map(role => {
            const oldRoleName = role.name.charAt(0).toLowerCase() + role.name.slice(1);
            const assignedModel = oldAssignments[oldRoleName];
            if (assignedModel) {
                return { ...role, model: assignedModel };
            }
            // @ts-ignore
            if (role.name === 'Evaluator' && Array.isArray(oldAssignments.evaluationTeam) && oldAssignments.evaluationTeam.length > 0) {
                 // @ts-ignore
                 return { ...role, model: oldAssignments.evaluationTeam[0] };
            }
            return role;
        });

        await config.update('roles', newRoles, vscode.ConfigurationTarget.Global);
        await config.update('roleAssignments', undefined, vscode.ConfigurationTarget.Global);
        MainPanel.update({ command: 'log', text: '配置迁移完成。' });
    }
}


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const debugListeners = setupDebugListeners();
    context.subscriptions.push(...debugListeners);

    knowledgeBase.initialize(context);
    migrateSettings(vscode.workspace.getConfiguration('multiAgent'));

    const stateFilePath = path.join(context.globalStoragePath, 'activeTaskState.json');

    /**
     * @param {TaskContext} taskContext
     */
    async function saveTaskState(taskContext) {
        try {
            const stateJson = JSON.stringify(taskContext, null, 2);
            await fs.mkdir(context.globalStoragePath, { recursive: true });
            await fs.writeFile(stateFilePath, stateJson, 'utf8');
        } catch (error) {
            console.error('Failed to save task state:', error);
            vscode.window.showErrorMessage('无法保存任务状态。');
        }
    }

    async function clearTaskState() {
        try {
            if (fsSync.existsSync(stateFilePath)) {
                await fs.unlink(stateFilePath);
            }
        } catch (error) {
            console.error('Failed to clear task state:', error);
        }
    }

    const taskEventEmitter = new EventEmitter();

    taskEventEmitter.on('runHealthCheck', () => {
        const config = vscode.workspace.getConfiguration('multiAgent');
        const results = runHealthCheck(config);
        MainPanel.update({ command: 'healthCheckResult', results: results });
    });

    taskEventEmitter.on('getWorkspaceStatus', async () => {
        const status = await getWorkspaceStatus();
        MainPanel.update({ command: 'updateWorkspaceStatus', status: status });
    });

    taskEventEmitter.on('startTask', async (/** @type {string} */ userRequest) => {
        if (activeTaskController) {
            vscode.window.showWarningMessage('已有任务正在进行中。请等待当前任务完成或停止它。');
            return;
        }
        activeTaskController = new AbortController();
        const signal = activeTaskController.signal;

        try {
            logger.createLogChannel();
            MainPanel.update({ command: 'setTaskStatus', isRunning: true });
            const config = vscode.workspace.getConfiguration('multiAgent');
            MainPanel.update({ command: 'updateGoal', text: userRequest });
            const taskContext = new TaskContext(userRequest);

            if (config.get('enableLongTermMemory', false)) {
                MainPanel.update({ command: 'log', text: '长期记忆已启用，正在查询知识库...' });
                const modelConfig = getModelForRole('KnowledgeExtractor');
                if (!modelConfig) {
                    throw new Error("知识提取器(KnowledgeExtractor)角色或其模型未配置。");
                }
                const llmProvider = new OpenAICompatibleProvider(modelConfig);
                const relevantKnowledge = await knowledgeBase.queryKnowledge(userRequest, llmProvider);
                taskContext.addRelevantKnowledge(relevantKnowledge);
                MainPanel.update({ command: 'log', text: `知识库查询完毕。` });
            }

            const scannerProfile = getRoleProfile('CodebaseScanner');
            if (!scannerProfile || !scannerProfile.model) {
                 throw new Error("代码库扫描员(CodebaseScanner)角色或其模型未配置。");
            }
            const scannerModelConfig = getModelForRole('CodebaseScanner');
            if (!scannerModelConfig) {
                throw new Error("代码库扫描员(CodebaseScanner)角色或其模型未配置。");
            }
            const scannerAgent = new CodebaseScannerAgent(scannerModelConfig, scannerProfile.systemPrompt, 'CodebaseScanner', agentMessageBus);
            taskContext.projectContext = await scanProject(scannerAgent, config.get('enableSmartScan', false));

            await runTaskExecution(taskContext, config, agentMessageBus, taskEventEmitter, { saveTaskState, clearTaskState }, signal);
            MainPanel.update({ command: 'setTaskStatus', isRunning: false, message: '任务已完成。' });

        } catch (error) {
            console.error('[诊断] 任务执行错误:', error);
            if (error instanceof Error && error.name === 'AbortError') {
                MainPanel.update({ command: 'setTaskStatus', isRunning: false, message: '任务已被用户停止。' });
            } else {
                const errorMessage = `发生严重错误: ${error instanceof Error ? error.message : String(error)}`;
                const errorStack = error instanceof Error ? error.stack : String(error);
                
                console.error('[诊断] 错误详情:', {
                    message: errorMessage,
                    stack: errorStack,
                    type: error instanceof Error ? error.constructor.name : typeof error
                });
                
                vscode.window.showErrorMessage(errorMessage);
                logger.logLine(`\n--- 发生严重错误 ---\n${errorStack}`);
                MainPanel.update({ command: 'logError', text: errorMessage });
                MainPanel.update({ command: 'setTaskStatus', isRunning: false, message: '任务因错误而终止。' });
            }
        } finally {
            activeTaskController = null;
        }
    });

    taskEventEmitter.on('stopTask', () => {
        if (activeTaskController) {
            activeTaskController.abort();
        }
    });

    async function getWorkspaceStatus() {
        try {
            const fileList = await listFiles('.');
            const breakpoints = vscode.debug.breakpoints.map(bp => {
                if (bp instanceof vscode.SourceBreakpoint) {
                    return `${path.basename(bp.location.uri.fsPath)}:${bp.location.range.start.line + 1}`;
                }
                return 'Function Breakpoint';
            });
            const branch = await gitTools.getCurrentBranch();
            const gitStatus = await gitTools.getStatus();

            return {
                fileSystem: fileList,
                breakpoints: breakpoints,
                git: {
                    branch: branch.replace('Current branch is: ', ''),
                    files: gitStatus,
                }
            };
        } catch (error) {
            console.error('Error getting workspace status:', error);
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }

    let disposable = vscode.commands.registerCommand('multi-agent-helper.startTask', () => {
        MainPanel.createOrShow(context, taskEventEmitter);
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
