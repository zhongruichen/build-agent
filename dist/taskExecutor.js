"use strict";
const vscode = require('vscode');
const { getModelForRole, getModelsForTeam, getRoleProfile } = require('./config');
const logger = require('./logger');
const { executeTool } = require('./tools/toolRegistry');
const { EvaluatorAgent } = require('./agents/evaluatorAgent');
const { ReflectorAgent } = require('./agents/reflectorAgent.js');
const { ReviewerAgent } = require('./agents/reviewerAgent.js');
const { KnowledgeExtractorAgent } = require('./agents/knowledgeExtractorAgent.js');
const { MainPanel } = require('./ui/mainPanel');
const knowledgeBase = require('./memory/knowledgeBase.js');
const thinkingChainOrchestrator = require('./thinking_chain/ThinkingChainOrchestrator.js');
/**
 * @typedef {import('events').EventEmitter} EventEmitter
 * @typedef {import('./agents/workerAgent.js').WorkerAgent} WorkerAgent
 * @typedef {import('./agents/orchestratorAgent.js').OrchestratorAgent} OrchestratorAgent
 * @typedef {import('./agents/synthesizerAgent.js').SynthesizerAgent} SynthesizerAgent
 * @typedef {import('./agents/critiqueAggregationAgent.js').CritiqueAggregationAgent} CritiqueAggregationAgent
 * @typedef {import('./config').ModelConfig} ModelConfig
 * @typedef {import('./config').RoleProfile} RoleProfile
 * @typedef {import('./agents/taskContext').TaskContext} TaskContext
 * @typedef {import('./agents/taskContext').SubTask} SubTask
 * @typedef {import('./agents/taskContext').PlanObject} PlanObject
 */
/**
 * @typedef {Object.<string, import('./agents/baseAgent').BaseAgent>} AgentsMap
 */
/**
 * @typedef {object} State
 * @property {(taskContext: TaskContext) => Promise<void>} saveTaskState
 * @property {() => Promise<void>} clearTaskState
 */
// --- Helper Functions for Refactoring ---
/**
 * @param {vscode.WorkspaceConfiguration} config
 * @param {EventEmitter} agentMessageBus
 * @returns {AgentsMap & {evaluationTeamConfigs: ModelConfig[], evaluatorProfile: RoleProfile | undefined}}
 */
function initializeAgents(config, agentMessageBus) {
    /** @type {any} */
    const agents = {};
    const workerProfile = getRoleProfile('Worker');
    if (!workerProfile)
        throw new Error("Worker role profile not found.");
    if (config.get('enableAgentCollaboration', false)) {
        workerProfile.systemPrompt += "\n- 'agent.sendMessage': 向另一个智能体发送消息。\n  - args: { \"recipientId\": \"<接收方智能体的ID>\", \"messageContent\": \"<消息内容>\" }";
    }
    const requiredRoles = ['Orchestrator', 'Worker', 'Synthesizer', 'CritiqueAggregator', 'CodebaseScanner'];
    for (const roleName of requiredRoles) {
        const profile = getRoleProfile(roleName);
        if (!profile)
            throw new Error(`${roleName} role profile not found.`);
        const modelConfig = getModelForRole(roleName);
        if (!modelConfig)
            throw new Error(`Model for ${roleName} not found.`);
        const agentKey = roleName.charAt(0).toLowerCase() + roleName.slice(1);
        const AgentClass = require(`./agents/${agentKey}Agent.js`)[`${roleName}Agent`];
        agents[agentKey] = new AgentClass(modelConfig, profile.systemPrompt, roleName, agentMessageBus);
    }
    const reflectorProfile = getRoleProfile('Reflector');
    if (reflectorProfile) {
        const modelConfig = getModelForRole('Reflector');
        if (modelConfig) {
            agents.reflectorAgent = new ReflectorAgent(modelConfig, reflectorProfile.systemPrompt, 'Reflector', agentMessageBus);
        }
    }
    const reviewerProfile = getRoleProfile('Reviewer');
    if (reviewerProfile) {
        const modelConfig = getModelForRole('Reviewer');
        if (modelConfig) {
            agents.reviewerAgent = new ReviewerAgent(modelConfig, reviewerProfile.systemPrompt, 'Reviewer', agentMessageBus);
        }
    }
    agents.evaluationTeamConfigs = getModelsForTeam('Evaluator');
    agents.evaluatorProfile = getRoleProfile('Evaluator');
    return agents;
}
/**
 * @param {EventEmitter} agentMessageBus
 * @param {AgentsMap} agents
 * @param {TaskContext} taskContext
 */
function setupMessageBusListeners(agentMessageBus, agents, taskContext) {
    console.log('[诊断] 设置任务消息监听器...');
    agentMessageBus.on('createSubTask', (/** @type {{ recipientRole: string; taskDescription: string; }} */ task) => {
        if (!taskContext)
            return;
        const newTaskId = taskContext.subTasks.length > 0 ? Math.max(...taskContext.subTasks.map(t => t.id)) + 1 : 1;
        const currentTask = taskContext.subTasks.find(t => t.status === 'in_progress');
        const dependencies = currentTask ? [currentTask.id] : [];
        const newSubTask = {
            id: newTaskId,
            description: `(委派自 ${task.recipientRole}): ${task.taskDescription}`,
            dependencies,
            status: /** @type {'pending'} */ ('pending'),
            result: null,
            error: null,
        };
        taskContext.subTasks.push(newSubTask);
        MainPanel.update({ command: 'log', text: `动态创建新任务 #${newTaskId} 并已添加到计划中。` });
        MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
    });
    agentMessageBus.on('message', async (/** @type {{ recipientId: string; senderId: string; messageContent: string; subTaskId: number; isReview: boolean; review: { approved: boolean; feedback: string; }; originalSubTaskId: number; }} */ message) => {
        if (!taskContext || !message.recipientId)
            return;
        if (message.recipientId === 'Reviewer' && agents.reviewerAgent) {
            MainPanel.update({ command: 'log', text: `Reviewer 正在审查来自 ${message.senderId} 的操作...` });
            try {
                const review = await /** @type {ReviewerAgent} */ (agents.reviewerAgent).executeTask(message.messageContent);
                agentMessageBus.emit('message', {
                    senderId: 'Reviewer',
                    recipientId: message.senderId,
                    isReview: true,
                    review: review,
                    originalSubTaskId: message.subTaskId,
                });
            }
            catch (e) {
                MainPanel.update({ command: 'logError', text: `Reviewer Agent 失败: ${e instanceof Error ? e.message : String(e)}` });
            }
        }
        if (message.senderId === 'Reviewer' && message.isReview) {
            const taskToUpdate = taskContext.subTasks.find(t => t.id === message.originalSubTaskId);
            if (taskToUpdate && taskToUpdate.status === 'waiting_for_review') {
                MainPanel.update({ command: 'log', text: `收到对任务 #${taskToUpdate.id} 的审查反馈。` });
                const { approved, feedback } = message.review;
                taskToUpdate.description += `\n\n--- 审查反馈 ---\n状态: ${approved ? '已批准' : '需要修改'}\n反馈: ${feedback}`;
                taskToUpdate.status = 'pending';
                MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
            }
        }
    });
}
/**
 * @param {TaskContext} taskContext
 * @param {AgentsMap} agents
 * @param {vscode.WorkspaceConfiguration} config
 * @param {EventEmitter} agentMessageBus
 * @param {(taskContext: TaskContext) => Promise<void>} saveTaskState
 * @param {AbortSignal} signal
 */
async function executePlan(taskContext, agents, config, agentMessageBus, saveTaskState, signal) {
    const enableParallelExec = config.get('enableParallelExec', false);
    const executionPromise = (async () => {
        while (!taskContext.areAllTasksDone()) {
            if (signal.aborted)
                throw new Error('AbortError');
            const runnableTasks = taskContext.getRunnableTasks();
            if (runnableTasks.length === 0) {
                const isWaitingForReview = taskContext.subTasks.some(t => t.status === 'waiting_for_review');
                if (isWaitingForReview) {
                    MainPanel.update({ command: 'log', text: '正在等待审查反馈...' });
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 等待审查
                    continue;
                }
                const pendingTasks = taskContext.subTasks
                    .filter(t => t.status === 'pending')
                    .map(t => `任务 #${t.id} (依赖: [${t.dependencies.join(', ')}])`);
                const errorMessage = `错误：检测到任务依赖死锁。以下待处理任务的依赖项未满足: ${pendingTasks.join(', ')}`;
                MainPanel.update({ command: 'logError', text: errorMessage });
                throw new Error(errorMessage);
            }
            if (enableParallelExec) {
                await Promise.all(runnableTasks.map(subTask => executeSingleTask(subTask, taskContext, agents, config, agentMessageBus, saveTaskState, signal)));
            }
            else {
                await executeSingleTask(runnableTasks[0], taskContext, agents, config, agentMessageBus, saveTaskState, signal);
            }
        }
    })();
    await executionPromise;
    MainPanel.update({ command: 'log', text: '本轮所有任务已执行完毕。' });
}
/**
 * @param {SubTask & {retryHistory?: string[]}} subTask
 * @param {TaskContext} taskContext
 * @param {AgentsMap} agents
 * @param {vscode.WorkspaceConfiguration} config
 * @param {EventEmitter} agentMessageBus
 * @param {(taskContext: TaskContext) => Promise<void>} saveTaskState
 * @param {AbortSignal} signal
 */
async function executeSingleTask(subTask, taskContext, agents, config, agentMessageBus, saveTaskState, signal) {
    if (signal.aborted)
        throw new Error('AbortError');
    taskContext.updateTaskStatus(subTask.id, 'in_progress');
    MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
    MainPanel.update({ command: 'log', text: `[Worker] 正在执行任务 ${subTask.id}: ${subTask.description.split('\n\n')[0]}` });
    let attempts = 0;
    const MAX_ATTEMPTS_PER_TASK = 3;
    let lastError = '';
    if (!subTask.retryHistory) {
        subTask.retryHistory = [];
    }
    while (attempts < MAX_ATTEMPTS_PER_TASK) {
        if (signal.aborted)
            throw new Error('AbortError');
        let workerResult;
        try {
            workerResult = await /** @type {WorkerAgent} */ (agents.worker).executeTask(subTask, taskContext, subTask.retryHistory);
        }
        catch (workerError) {
            console.error('[诊断] Worker执行失败:', {
                subTaskId: subTask.id,
                error: workerError instanceof Error ? workerError.message : String(workerError),
                stack: workerError instanceof Error ? workerError.stack : undefined
            });
            throw workerError;
        }
        try {
            if (workerResult.toolName === 'terminal.executeCommand' && !config.get('enableAutoMode', false)) {
                const userApproval = await vscode.window.showWarningMessage(`智能体想要执行以下命令: \n\n${( /** @type {any} */(workerResult.args)).command}\n\n您是否批准?`, { modal: true }, "批准");
                if (userApproval !== "批准")
                    throw new Error("用户拒绝了终端命令的执行。");
            }
            const workerProfile = getRoleProfile('Worker');
            if (!workerProfile)
                throw new Error("Worker role profile not found.");
            const toolContext = { scannerAgent: agents.scannerAgent, workerProfile: workerProfile, agentMessageBus, senderId: agents.worker.id, subTaskId: subTask.id };
            const toolResult = await executeTool(workerResult.toolName, workerResult.args, logger, toolContext);
            if (workerResult.toolName === 'agent.sendMessage' && ( /** @type {any} */(workerResult.args)).recipientId === 'Reviewer') {
                taskContext.updateTaskStatus(subTask.id, 'waiting_for_review');
                MainPanel.update({ command: 'log', text: `任务 ${subTask.id} 已发送审查，正在等待反馈...` });
                MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
                return;
            }
            taskContext.updateTaskStatus(subTask.id, 'completed', toolResult);
            MainPanel.update({ command: 'log', text: `[Worker] 任务 ${subTask.id} 成功完成。` });
            lastError = '';
            break;
        }
        catch (e) {
            attempts++;
            lastError = e instanceof Error ? e.message : String(e);
            subTask.error = lastError;
            MainPanel.update({ command: 'logError', text: `[Worker] 任务 ${subTask.id} 第 ${attempts} 次尝试失败: ${lastError}` });
            if (attempts < MAX_ATTEMPTS_PER_TASK) {
                let reflectionText = `(前一次尝试失败，错误信息: ${lastError}). 请分析此错误并尝试不同的方法。`;
                if (agents.reflectorAgent) {
                    MainPanel.update({ command: 'log', text: '[Reflector] 正在调用反思者智能体分析失败原因...' });
                    try {
                        const reflection = await /** @type {ReflectorAgent} */ (agents.reflectorAgent).executeTask(subTask);
                        MainPanel.update({ command: 'log', text: `[Reflector] 分析原因: ${reflection.cause}` });
                        reflectionText = `前一次尝试失败，错误信息: ${lastError}\n反思者智能体建议: ${reflection.nextStep}`;
                    }
                    catch (reflectionError) {
                        MainPanel.update({ command: 'logError', text: `[Reflector] 反思者智能体失败: ${reflectionError instanceof Error ? reflectionError.message : String(reflectionError)}` });
                    }
                }
                subTask.retryHistory.push(reflectionText);
                MainPanel.update({ command: 'log', text: `[Worker] 正在重试任务 ${subTask.id}...` });
            }
        }
    }
    if (lastError) {
        taskContext.updateTaskStatus(subTask.id, 'failed', `尝试 ${MAX_ATTEMPTS_PER_TASK} 次后任务失败。最后错误: ${lastError}`);
    }
    MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
    if (config.get('enablePersistence', false))
        await saveTaskState(taskContext);
}
/**
 * @param {EventEmitter} taskEventEmitter
 * @param {PlanObject[]} initialPlan
 * @param {AbortSignal} signal
 * @returns {Promise<PlanObject[]>}
 */
async function awaitPlanApproval(taskEventEmitter, initialPlan, signal) {
    if (signal.aborted)
        throw new Error('AbortError');
    if (vscode.workspace.getConfiguration('multiAgent').get('enableAutoMode', false)) {
        MainPanel.update({ command: 'log', text: '自动模式已启用，自动批准计划。' });
        return initialPlan;
    }
    MainPanel.update({ command: 'showPlanForReview', plan: initialPlan });
    return new Promise((resolve, reject) => {
        /** @param {PlanObject[]} newPlan */
        const onPlanApproved = (newPlan) => {
            signal.removeEventListener('abort', onAbort);
            resolve(newPlan);
        };
        const onPlanCancelled = () => {
            signal.removeEventListener('abort', onAbort);
            reject(new Error("任务被用户取消。"));
        };
        const onAbort = () => {
            taskEventEmitter.removeListener('planApproved', onPlanApproved);
            taskEventEmitter.removeListener('planCancelled', onPlanCancelled);
            reject(new Error('AbortError'));
        };
        taskEventEmitter.once('planApproved', onPlanApproved);
        taskEventEmitter.once('planCancelled', onPlanCancelled);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
/**
 * @param {TaskContext} taskContext
 * @returns {string}
 */
function generateFinalReport(taskContext) {
    let report = `# 多智能体任务报告\n\n`;
    report += `**原始需求:** ${taskContext.originalUserRequest}\n\n`;
    const finalIteration = taskContext.getLatestIteration();
    if (finalIteration) {
        report += `**最终得分:** ${finalIteration.evaluation.score}/10\n`;
        if (finalIteration.evaluation.summary) {
            report += `**最终总结:** ${finalIteration.evaluation.summary}\n\n`;
        }
        report += `## 最终产物\n\n\`\`\`\n${finalIteration.artifact}\n\`\`\`\n\n`;
    }
    report += `## 迭代历史\n\n`;
    for (const iter of taskContext.history) {
        report += `### 第 ${iter.iteration} 轮 (得分: ${iter.evaluation.score}/10)\n`;
        if (iter.evaluation.summary) {
            report += `**总结:** ${iter.evaluation.summary}\n`;
        }
        if (iter.evaluation.suggestions && iter.evaluation.suggestions.length > 0) {
            report += `**建议:**\n` + iter.evaluation.suggestions.map(s => `- ${s}`).join('\n') + '\n';
        }
        report += `\n`;
    }
    return report;
}
/**
 * @param {string} artifact
 * @returns {string}
 */
function detectLanguage(artifact) {
    if (!artifact || typeof artifact !== 'string')
        return 'plaintext';
    const trimmedArtifact = artifact.trim();
    if (trimmedArtifact.startsWith('{') || trimmedArtifact.startsWith('['))
        return 'json';
    if (trimmedArtifact.startsWith('<!DOCTYPE html>') || trimmedArtifact.startsWith('<html'))
        return 'html';
    if (trimmedArtifact.includes('import React') || trimmedArtifact.includes('className='))
        return 'javascriptreact';
    if (trimmedArtifact.includes('function') || trimmedArtifact.includes('const') || trimmedArtifact.includes('let') || trimmedArtifact.includes('=>'))
        return 'javascript';
    if (trimmedArtifact.includes('def ') && trimmedArtifact.includes(':'))
        return 'python';
    if (trimmedArtifact.includes('public class') || trimmedArtifact.includes('import java.'))
        return 'java';
    if (trimmedArtifact.includes('#include'))
        return 'cpp';
    if (trimmedArtifact.includes('<?php'))
        return 'php';
    return 'plaintext';
}
/**
 * @param {TaskContext} taskContext
 * @param {AgentsMap & {evaluationTeamConfigs: ModelConfig[], evaluatorProfile: RoleProfile | undefined}} agents
 * @param {vscode.WorkspaceConfiguration} config
 * @param {EventEmitter} agentMessageBus
 * @param {EventEmitter} taskEventEmitter
 * @param {State} state
 * @param {AbortSignal} signal
 */
async function runIterationLoop(taskContext, agents, config, agentMessageBus, taskEventEmitter, state, signal) {
    const { saveTaskState, clearTaskState } = state;
    const enablePersistence = config.get('enablePersistence', false);
    const MAX_ITERATIONS = 10;
    for (let i = taskContext.currentIteration - 1; i < MAX_ITERATIONS; i++) {
        if (signal.aborted)
            throw new Error('AbortError');
        MainPanel.update({ command: 'log', text: `--- 第 ${taskContext.currentIteration} 轮迭代 ---` });
        if (taskContext.subTasks.every(t => t.status !== 'pending' && t.status !== 'in_progress')) {
            // Initiate thinking process at the beginning of an iteration
            const orchestratorProfile = getRoleProfile('Orchestrator');
            if (orchestratorProfile?.useThinkingChain) {
                const modelConfig = getModelForRole('Orchestrator');
                // The thinkingConfig is now part of the model's parameters
                const thinkingConfig = modelConfig?.parameters?.thinkingConfig || {};
                await thinkingChainOrchestrator.preprocess(taskContext, thinkingConfig);
                if (taskContext.thinkingProcessResult) {
                    MainPanel.update({ command: 'showThinkingProcess', text: taskContext.thinkingProcessResult });
                }
            }
            MainPanel.update({ command: 'log', text: '[Orchestrator] 正在制定计划...' });
            const initialPlan = await /** @type {OrchestratorAgent} */ (agents.orchestrator).executeTask(taskContext);
            const approvedPlan = await awaitPlanApproval(taskEventEmitter, initialPlan, signal);
            taskContext.setNewPlanForIteration(approvedPlan);
            MainPanel.update({ command: 'updatePlan', plan: taskContext.subTasks });
            if (enablePersistence)
                await saveTaskState(taskContext);
        }
        await executePlan(taskContext, agents, config, agentMessageBus, saveTaskState, signal);
        MainPanel.update({ command: 'log', text: '[Synthesizer] 正在生成最终产物...' });
        const artifact = await /** @type {SynthesizerAgent} */ (agents.synthesizer).executeTask(taskContext);
        MainPanel.update({ command: 'showArtifact', artifact: artifact });
        MainPanel.update({ command: 'highlightArtifact' });
        MainPanel.update({ command: 'log', text: '[Evaluator] 评估团队正在评估产物...' });
        const evaluatorProfile = agents.evaluatorProfile;
        if (!evaluatorProfile)
            throw new Error("Evaluator role profile not found.");
        const evaluationPromises = agents.evaluationTeamConfigs.map((modelConfig, index) => {
            const evaluatorId = `Evaluator_${index + 1}`;
            const evaluator = new EvaluatorAgent(modelConfig, evaluatorProfile.systemPrompt, evaluatorId, agentMessageBus);
            return evaluator.executeTask(artifact, taskContext);
        });
        const evaluations = await Promise.all(evaluationPromises);
        MainPanel.update({ command: 'log', text: '[CritiqueAggregator] 正在整合评估意见...' });
        const finalCritique = await /** @type {CritiqueAggregationAgent} */ (agents.critiqueAggregator).executeTask(evaluations, taskContext);
        MainPanel.update({ command: 'log', text: `最终得分: ${finalCritique.score}/10. 总结: ${finalCritique.summary}` });
        taskContext.archiveCurrentIteration(artifact, finalCritique);
        if (enablePersistence)
            await saveTaskState(taskContext);
        if (finalCritique.score === 10) {
            vscode.window.showInformationMessage("任务已完成，评分为10/10！");
            if (enablePersistence)
                await clearTaskState();
            break;
        }
        if (i === MAX_ITERATIONS - 1) {
            vscode.window.showWarningMessage("已达到最大迭代次数，任务终止。");
            if (enablePersistence)
                await clearTaskState();
            break;
        }
        if (config.get('enableAutoMode', false)) {
            MainPanel.update({ command: 'log', text: '自动模式已启用，自动进入下一轮优化...' });
        }
        else {
            const choice = await vscode.window.showInformationMessage(`第 ${taskContext.currentIteration - 1} 轮完成，得分 ${finalCritique.score}/10。\n总结: ${finalCritique.summary}\n\n是否继续优化?`, { modal: true }, "继续", "终止");
            if (choice !== "继续") {
                if (enablePersistence)
                    await clearTaskState();
                break;
            }
        }
    }
}
/**
 * @param {TaskContext} taskContext
 * @param {vscode.WorkspaceConfiguration} config
 * @param {EventEmitter} agentMessageBus
 * @param {EventEmitter} taskEventEmitter
 * @param {State} state
 * @param {AbortSignal} signal
 */
async function runTaskExecution(taskContext, config, agentMessageBus, taskEventEmitter, state, signal) {
    // [诊断] 记录当前监听器数量
    console.log('[诊断] 事件监听器状态（执行前）:', {
        agentMessageBus: agentMessageBus.eventNames().map(name => ({
            event: name,
            listeners: agentMessageBus.listenerCount(name)
        }))
    });
    // 移除之前的任务相关监听器，但保留系统级监听器
    const taskRelatedEvents = ['createSubTask', 'message'];
    taskRelatedEvents.forEach(eventName => {
        agentMessageBus.removeAllListeners(eventName);
    });
    const agents = initializeAgents(config, agentMessageBus);
    setupMessageBusListeners(agentMessageBus, agents, taskContext);
    await runIterationLoop(taskContext, agents, config, agentMessageBus, taskEventEmitter, state, signal);
    if (signal.aborted)
        throw new Error('AbortError');
    const report = generateFinalReport(taskContext);
    MainPanel.update({ command: 'log', text: '正在生成最终报告...' });
    const reportDocument = await vscode.workspace.openTextDocument({ content: report, language: 'markdown' });
    await vscode.window.showTextDocument(reportDocument);
    const finalIteration = taskContext.getLatestIteration();
    if (finalIteration && finalIteration.artifact) {
        MainPanel.update({ command: 'log', text: '正在新标签页中打开最终产物...' });
        try {
            const language = detectLanguage(finalIteration.artifact);
            const artifactDocument = await vscode.workspace.openTextDocument({ content: finalIteration.artifact, language });
            await vscode.window.showTextDocument(artifactDocument, { preview: false });
        }
        catch (e) {
            console.error('Failed to open final artifact in new tab:', e);
            MainPanel.update({ command: 'logError', text: `在新标签页中打开最终产物失败: ${e instanceof Error ? e.message : String(e)}` });
        }
    }
    if (config.get('enableLongTermMemory', false)) {
        MainPanel.update({ command: 'log', text: '[KnowledgeExtractor] 任务完成，开始提取知识...' });
        try {
            const extractorProfile = getRoleProfile('KnowledgeExtractor');
            if (!extractorProfile)
                throw new Error("KnowledgeExtractor role profile not found.");
            const modelConfig = getModelForRole('KnowledgeExtractor');
            if (!modelConfig)
                throw new Error("Model for KnowledgeExtractor not found.");
            const knowledgeExtractor = new KnowledgeExtractorAgent(modelConfig, extractorProfile.systemPrompt, 'KnowledgeExtractor', agentMessageBus);
            const newKnowledge = await knowledgeExtractor.executeTask(taskContext);
            if (newKnowledge && newKnowledge.length > 0) {
                for (const entry of newKnowledge) {
                    await knowledgeBase.addKnowledge(entry);
                }
                MainPanel.update({ command: 'log', text: `已成功提取并保存 ${newKnowledge.length} 条新知识。` });
            }
            else {
                MainPanel.update({ command: 'log', text: '未提取到新的可泛化知识。' });
            }
        }
        catch (e) {
            console.error('Failed to extract or save knowledge:', e);
            MainPanel.update({ command: 'logError', text: `知识提取失败: ${e instanceof Error ? e.message : String(e)}` });
        }
    }
}
module.exports = { runTaskExecution };
//# sourceMappingURL=taskExecutor.js.map