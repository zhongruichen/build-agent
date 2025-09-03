// @ts-nocheck
(function () {
    const vscode = acquireVsCodeApi();

    // --- STATE ---
    let state = {
        models: [],
        roles: [],
        allTools: [],
        plan: [],
        isTaskRunning: false,
        // Advanced settings
        enableSmartScan: false,
        enableParallelExec: false,
        enableAutoMode: false,
        enablePersistence: false,
        enableLongTermMemory: false,
        enableAgentCollaboration: false,
        // UI state
        editingType: null, // 'model' or 'role'
        editingIndex: -1,
        isFirstTime: false, // 新增：是否首次使用
        selectedTemplate: null, // 新增：选中的模板
    };

    // --- 配置模板定义 ---
    const configTemplates = {
        'openai-gpt4': {
            name: 'OpenAI GPT-4 配置',
            models: [{
                name: 'gpt-4-turbo',
                provider: 'OpenAI',
                modelName: 'gpt-4-turbo',
                apiKey: '',
                baseUrl: ''
            }],
            roleAssignments: {
                'Orchestrator': 'gpt-4-turbo',
                'Worker': 'gpt-4-turbo',
                'Synthesizer': 'gpt-4-turbo',
                'Evaluator': 'gpt-4-turbo',
                'CritiqueAggregator': 'gpt-4-turbo',
                'CodebaseScanner': 'gpt-4-turbo',
                'Reflector': 'gpt-4-turbo',
                'Reviewer': 'gpt-4-turbo',
                'KnowledgeExtractor': 'gpt-4-turbo'
            }
        },
        'claude-3': {
            name: 'Anthropic Claude 3 配置',
            models: [{
                name: 'claude-3-opus',
                provider: 'Anthropic',
                modelName: 'claude-3-opus-20240229',
                apiKey: '',
                baseUrl: ''
            }],
            roleAssignments: {
                'Orchestrator': 'claude-3-opus',
                'Worker': 'claude-3-opus',
                'Synthesizer': 'claude-3-opus',
                'Evaluator': 'claude-3-opus',
                'CritiqueAggregator': 'claude-3-opus',
                'CodebaseScanner': 'claude-3-opus',
                'Reflector': 'claude-3-opus',
                'Reviewer': 'claude-3-opus',
                'KnowledgeExtractor': 'claude-3-opus'
            }
        },
        'local-ollama': {
            name: '本地Ollama配置',
            models: [{
                name: 'llama3',
                provider: 'Custom',
                modelName: 'llama3:latest',
                apiKey: 'not-needed',
                baseUrl: 'http://localhost:11434/v1'
            }],
            roleAssignments: {
                'Orchestrator': 'llama3',
                'Worker': 'llama3',
                'Synthesizer': 'llama3',
                'Evaluator': 'llama3',
                'CritiqueAggregator': 'llama3',
                'CodebaseScanner': 'llama3',
                'Reflector': 'llama3',
                'Reviewer': 'llama3',
                'KnowledgeExtractor': 'llama3'
            }
        },
        'mixed': {
            name: '混合优化配置',
            models: [
                {
                    name: 'gpt-4-main',
                    provider: 'OpenAI',
                    modelName: 'gpt-4-turbo',
                    apiKey: '',
                    baseUrl: ''
                },
                {
                    name: 'gpt-3.5-helper',
                    provider: 'OpenAI',
                    modelName: 'gpt-3.5-turbo',
                    apiKey: '',
                    baseUrl: ''
                }
            ],
            roleAssignments: {
                'Orchestrator': 'gpt-4-main',
                'Worker': 'gpt-4-main',
                'Synthesizer': 'gpt-4-main',
                'Evaluator': 'gpt-4-main',
                'CritiqueAggregator': 'gpt-3.5-helper',
                'CodebaseScanner': 'gpt-3.5-helper',
                'Reflector': 'gpt-3.5-helper',
                'Reviewer': 'gpt-3.5-helper',
                'KnowledgeExtractor': 'gpt-3.5-helper'
            }
        }
    };

    // --- DOM CACHE ---
    const dom = {
        overallGoal: document.getElementById('overall-goal'),
        planList: document.getElementById('plan-list'),
        planProgress: document.getElementById('plan-progress'),
        planProgressBar: document.getElementById('plan-progress-bar'),
        planProgressText: document.getElementById('plan-progress-text'),
        eventStream: document.getElementById('event-stream'),
        finalArtifact: document.getElementById('final-artifact').querySelector('code'),
        copyArtifactBtn: document.getElementById('copy-artifact-btn'),
        planReviewContainer: document.getElementById('plan-review-container'),
        editablePlanList: document.getElementById('editable-plan-list'),
        approvePlanBtn: document.getElementById('approve-plan-btn'),
        cancelPlanBtn: document.getElementById('cancel-plan-btn'),
        addTaskBtn: document.getElementById('add-task-btn'),
        // 新增DOM元素
        welcomeGuide: document.getElementById('welcome-guide'),
        startGuideBtn: document.getElementById('start-guide-btn'),
        skipGuideBtn: document.getElementById('skip-guide-btn'),
        useTemplateBtn: document.getElementById('use-template-btn'),
        importConfigBtn: document.getElementById('import-config-btn'),
        exportConfigBtn: document.getElementById('export-config-btn'),
        templateModal: document.getElementById('template-modal'),
        applyTemplateBtn: document.getElementById('apply-template-btn'),
        cancelTemplateBtn: document.getElementById('cancel-template-btn'),
        // Chat
        chatInputContainer: document.getElementById('chat-input-container'),
        chatInput: document.getElementById('chat-input'),
        sendChatBtn: document.getElementById('send-chat-btn'),
        stopTaskBtn: document.getElementById('stop-task-btn'),
        // Settings
        modelsList: document.getElementById('models-list'),
        rolesList: document.getElementById('roles-list'),
        addModelBtn: document.getElementById('add-model-btn'),
        addRoleBtn: document.getElementById('add-role-btn'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        // Advanced Settings
        smartScanCheckbox: document.getElementById('setting-smart-scan'),
        parallelExecCheckbox: document.getElementById('setting-parallel-exec'),
        autoModeCheckbox: document.getElementById('setting-auto-mode'),
        persistenceCheckbox: document.getElementById('setting-persistence'),
        longTermMemoryCheckbox: document.getElementById('setting-long-term-memory'),
        agentCollaborationCheckbox: document.getElementById('setting-agent-collaboration'),
        // Modal
        editorModal: document.getElementById('editor-modal'),
        editorTitle: document.getElementById('editor-title'),
        modelEditorFields: document.getElementById('model-editor-fields'),
        roleEditorFields: document.getElementById('role-editor-fields'),
        saveEditorBtn: document.getElementById('save-editor-btn'),
        cancelEditorBtn: document.getElementById('cancel-editor-btn'),
        // Health Check
        healthCheckBtn: document.getElementById('health-check-btn'),
        healthCheckSpinner: document.getElementById('health-check-spinner'),
        healthCheckResults: document.getElementById('health-check-results'),
        // Workspace Status
        refreshStatusBtn: document.getElementById('refresh-status-btn'),
        fsStatus: document.getElementById('fs-status'),
        debuggerStatus: document.getElementById('debugger-status'),
        gitStatus: document.getElementById('git-status'),
    };

    // --- EVENT LISTENERS ---
    function bindEventListeners() {
        document.querySelector('.tabs').addEventListener('click', handleTabClick);
        dom.approvePlanBtn.addEventListener('click', approvePlan);
        dom.cancelPlanBtn.addEventListener('click', () => vscode.postMessage({ command: 'cancelTask' }));
        dom.addTaskBtn.addEventListener('click', addNewTaskToReview);
        dom.editablePlanList.addEventListener('click', handleEditablePlanClick);
        dom.sendChatBtn.addEventListener('click', sendChatMessage);
        dom.stopTaskBtn.addEventListener('click', () => vscode.postMessage({ command: 'stopTask' }));
        dom.copyArtifactBtn.addEventListener('click', copyArtifact);
        dom.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        // Settings
        dom.addModelBtn.addEventListener('click', () => openEditor('model'));
        dom.addRoleBtn.addEventListener('click', () => openEditor('role'));
        dom.modelsList.addEventListener('click', (e) => handleListClick(e, 'model'));
        dom.rolesList.addEventListener('click', (e) => handleListClick(e, 'role'));
        dom.saveSettingsBtn.addEventListener('click', saveAllSettings);
        dom.healthCheckBtn.addEventListener('click', runHealthCheck);
        dom.refreshStatusBtn.addEventListener('click', requestWorkspaceStatus);
        // Modal
        dom.saveEditorBtn.addEventListener('click', handleSaveEditor);
        dom.cancelEditorBtn.addEventListener('click', closeEditor);
        
        // 新增事件监听
        if (dom.startGuideBtn) dom.startGuideBtn.addEventListener('click', startConfigWizard);
        if (dom.skipGuideBtn) dom.skipGuideBtn.addEventListener('click', () => hideWelcomeGuide());
        if (dom.useTemplateBtn) dom.useTemplateBtn.addEventListener('click', showTemplateModal);
        if (dom.importConfigBtn) dom.importConfigBtn.addEventListener('click', importConfig);
        if (dom.exportConfigBtn) dom.exportConfigBtn.addEventListener('click', exportConfig);
        if (dom.applyTemplateBtn) dom.applyTemplateBtn.addEventListener('click', applySelectedTemplate);
        if (dom.cancelTemplateBtn) dom.cancelTemplateBtn.addEventListener('click', () => dom.templateModal.style.display = 'none');
        
        // 模板选择事件
        document.querySelectorAll('.template-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.template-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                state.selectedTemplate = item.dataset.template;
            });
        });
    }

    // --- MESSAGE HANDLER ---
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
            case 'setTaskStatus':
                setTaskRunning(message.isRunning);
                if (message.message) {
                    addMessageToEventStream('system', message.message);
                }
                break;
            case 'updateGoal':
                dom.overallGoal.textContent = message.text;
                addMessageToEventStream('user', message.text);
                break;
            case 'updatePlan':
                state.plan = message.plan;
                renderPlan();
                updateProgressBar();
                break;
            case 'showPlanForReview':
                state.plan = message.plan;
                showPlanForReview(message.plan);
                break;
            case 'log':
                addMessageToEventStream('ai', message.text);
                break;
            case 'logError':
                addMessageToEventStream('error', message.text);
                break;
            case 'showArtifact':
                dom.finalArtifact.textContent = message.artifact;
                break;
            case 'artifactStreamChunk':
                dom.finalArtifact.textContent += message.chunk;
                break;
            case 'highlightArtifact':
                 if (typeof hljs !== 'undefined') {
                     hljs.highlightElement(dom.finalArtifact);
                 } else {
                     console.warn('[诊断] highlight.js库未加载，无法高亮代码');
                 }
                 break;
            case 'receiveSettings':
                state.models = message.settings.models || [];
                state.roles = message.settings.roles || [];
                state.allTools = message.allTools || [];
                state.enableSmartScan = message.settings.enableSmartScan || false;
                state.enableParallelExec = message.settings.enableParallelExec || false;
                state.enableAutoMode = message.settings.enableAutoMode || false;
                state.enablePersistence = message.settings.enablePersistence || false;
                state.enableLongTermMemory = message.settings.enableLongTermMemory || false;
                state.enableAgentCollaboration = message.settings.enableAgentCollaboration || false;
                renderAllSettings();
                checkFirstTimeUser();
                break;
            case 'healthCheckResult':
                dom.healthCheckSpinner.style.display = 'none';
                dom.healthCheckResults.style.display = 'block';
                renderHealthCheckResults(message.results);
                break;
            case 'updateDebuggerState':
                state.debuggerState = message.state;
                if (document.getElementById('workspace').classList.contains('active')) {
                    renderWorkspaceStatus(state.workspaceState || {});
                }
                break;
            case 'updateWorkspaceStatus':
                state.workspaceState = message.status;
                renderWorkspaceStatus(message.status);
                break;
        }
    });

    // --- UI & TASK LIFECYCLE ---
    function setTaskRunning(isRunning) {
        state.isTaskRunning = isRunning;
        dom.chatInput.disabled = isRunning;
        dom.sendChatBtn.style.display = isRunning ? 'none' : 'block';
        dom.stopTaskBtn.style.display = isRunning ? 'block' : 'none';
        if (!isRunning) {
            dom.chatInput.placeholder = "请输入您的任务目标...";
        } else {
            dom.chatInput.placeholder = "任务正在进行中...";
        }
    }

    function sendChatMessage() {
        if (state.isTaskRunning) return;
        const messageText = dom.chatInput.value.trim();
        if (messageText) {
            // Clear previous task state from UI
            dom.planList.innerHTML = '';
            dom.finalArtifact.textContent = '';
            dom.eventStream.innerHTML = '';
            dom.overallGoal.textContent = '...';

            vscode.postMessage({ command: 'startTask', text: messageText });
            dom.chatInput.value = '';
        }
    }

    function addMessageToEventStream(type, text) {
        const messageEl = document.createElement('div');
        messageEl.className = `event-message ${type}`;
        messageEl.textContent = text;
        dom.eventStream.appendChild(messageEl);
        dom.eventStream.scrollTop = dom.eventStream.scrollHeight;
    }

    function copyArtifact() {
        const artifactText = dom.finalArtifact.textContent;
        navigator.clipboard.writeText(artifactText).then(() => {
            const originalText = dom.copyArtifactBtn.textContent;
            dom.copyArtifactBtn.textContent = '已复制!';
            setTimeout(() => {
                dom.copyArtifactBtn.textContent = originalText;
            }, 2000);
        }, (err) => {
            console.error('无法复制文本: ', err);
            addMessageToEventStream('error', '无法复制产物到剪贴板。');
        });
    }

    // --- PLAN RENDERING & HANDLING ---
    const statusIcons = {
        pending: '○',
        in_progress: '◌',
        completed: '●',
        failed: '✕',
        waiting_for_review: '?',
    };

    function renderPlan() {
        dom.planList.innerHTML = '';
        dom.planReviewContainer.style.display = 'none';
        state.plan.forEach(task => {
            const item = document.createElement('li');
            item.className = 'plan-item';
            const statusText = getStatusText(task.status);
            item.innerHTML = `
                <span class="status-icon status-${task.status}" title="${statusText}">${statusIcons[task.status]}</span>
                <span class="task-description">${task.description}</span>
            `;
            dom.planList.appendChild(item);
        });
        updateProgressBar();
    }

    function getStatusText(status) {
        const statusTexts = {
            pending: '待执行',
            in_progress: '执行中',
            completed: '已完成',
            failed: '执行失败',
            waiting_for_review: '等待审查'
        };
        return statusTexts[status] || status;
    }

    function updateProgressBar() {
        if (state.plan.length === 0) {
            dom.planProgress.style.display = 'none';
            return;
        }
        
        dom.planProgress.style.display = 'block';
        const completed = state.plan.filter(t => t.status === 'completed').length;
        const total = state.plan.length;
        const percentage = Math.round((completed / total) * 100);
        
        dom.planProgressBar.style.width = `${percentage}%`;
        dom.planProgressText.textContent = `${percentage}% (${completed}/${total})`;
    }

    function showPlanForReview(plan) {
        dom.planList.innerHTML = '';
        dom.editablePlanList.innerHTML = '';
        plan.forEach(task => dom.editablePlanList.appendChild(createEditableTaskElement(task)));
        dom.planReviewContainer.style.display = 'block';
    }

    function createEditableTaskElement(task) {
        const taskEl = document.createElement('div');
        taskEl.className = 'editable-task';
        taskEl.dataset.taskId = task.id;
        taskEl.innerHTML = `
            <label>任务 #${task.id} 描述:</label>
            <textarea class="task-description-input">${task.description}</textarea>
            <label>依赖项 (以逗号分隔):</label>
            <input type="text" class="task-dependencies-input" value="${task.dependencies.join(', ')}">
            <div class="task-toolbar">
                <button class="button delete-task-btn">删除任务</button>
            </div>
        `;
        return taskEl;
    }

    function handleEditablePlanClick(e) {
        if (e.target.classList.contains('delete-task-btn')) {
            e.target.closest('.editable-task').remove();
        }
    }

    function addNewTaskToReview() {
        const newTask = {
            id: Math.max(0, ...Array.from(dom.editablePlanList.children).map(el => parseInt(el.dataset.taskId, 10))) + 1,
            description: '新任务...',
            dependencies: [],
        };
        dom.editablePlanList.appendChild(createEditableTaskElement(newTask));
    }

    function approvePlan() {
        const updatedPlan = Array.from(dom.editablePlanList.children).map(el => {
            const id = parseInt(el.dataset.taskId, 10);
            const description = el.querySelector('.task-description-input').value;
            const dependenciesStr = el.querySelector('.task-dependencies-input').value;
            const dependencies = dependenciesStr.split(',').map(d => parseInt(d.trim(), 10)).filter(d => !isNaN(d));
            return { id, description, dependencies };
        });

        // Re-ID tasks to ensure they are sequential
        const finalPlan = updatedPlan.map((task, index) => ({ ...task, id: index + 1 }));

        vscode.postMessage({ command: 'planApproved', plan: finalPlan });
        dom.planReviewContainer.style.display = 'none';
    }

    // --- SETTINGS & OTHER UI ---
    function renderAllSettings() {
        renderModelsList();
        renderRolesList();
        renderAdvancedSettings();
    }

    function renderModelsList() {
        dom.modelsList.innerHTML = '';
        state.models.forEach((model, index) => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <span><strong>${model.name}</strong> (${model.modelName})</span>
                <div class="item-buttons">
                    <button data-action="edit" data-index="${index}" class="button">编辑</button>
                    <button data-action="delete" data-index="${index}" class="button">删除</button>
                </div>`;
            dom.modelsList.appendChild(item);
        });
    }

    function renderRolesList() {
        dom.rolesList.innerHTML = '';
        state.roles.forEach((role, index) => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <span><strong>${role.name}</strong> (Model: ${role.model || '未分配'})</span>
                <div class="item-buttons">
                    <button data-action="edit" data-index="${index}" class="button">编辑</button>
                    <button data-action="delete" data-index="${index}" class="button">删除</button>
                </div>`;
            dom.rolesList.appendChild(item);
        });
    }

    function renderAdvancedSettings() {
        dom.smartScanCheckbox.checked = state.enableSmartScan;
        dom.parallelExecCheckbox.checked = state.enableParallelExec;
        dom.autoModeCheckbox.checked = state.enableAutoMode;
        dom.persistenceCheckbox.checked = state.enablePersistence;
        dom.longTermMemoryCheckbox.checked = state.enableLongTermMemory;
        dom.agentCollaborationCheckbox.checked = state.enableAgentCollaboration;
    }

    function openEditor(type, index = -1) {
        state.editingType = type;
        state.editingIndex = index;
        dom.editorModal.style.display = 'flex';

        if (type === 'model') {
            dom.roleEditorFields.style.display = 'none';
            dom.modelEditorFields.style.display = 'block';
            dom.editorTitle.textContent = index > -1 ? '编辑模型' : '添加新模型';
            const model = index > -1 ? state.models[index] : {};
            dom.modelEditorFields.innerHTML = `
                <label>名称: <input type="text" id="edit-model-name" value="${model.name || ''}" required></label>
                <label>供应商:
                    <select id="edit-model-provider">
                        <option ${model.provider === 'OpenAI' ? 'selected' : ''}>OpenAI</option>
                        <option ${model.provider === 'Anthropic' ? 'selected' : ''}>Anthropic</option>
                        <option ${model.provider === 'Google' ? 'selected' : ''}>Google</option>
                        <option ${model.provider === 'Custom' ? 'selected' : ''}>Custom</option>
                    </select>
                </label>
                <label>模型名称 (e.g., gpt-4-turbo): <input type="text" id="edit-model-modelName" value="${model.modelName || ''}" required></label>
                <label>API Key: <input type="password" id="edit-model-apiKey" value="${model.apiKey || ''}" required></label>
                <label>Base URL (可选): <input type="text" id="edit-model-baseUrl" value="${model.baseUrl || ''}"></label>
            `;
        } else if (type === 'role') {
            dom.modelEditorFields.style.display = 'none';
            dom.roleEditorFields.style.display = 'block';
            dom.editorTitle.textContent = index > -1 ? '编辑角色' : '添加新角色';
            const role = index > -1 ? state.roles[index] : { allowedTools: [] };
            const modelOptions = state.models.map(m => `<option value="${m.name}" ${role.model === m.name ? 'selected' : ''}>${m.name}</option>`).join('');
            const toolCheckboxes = state.allTools.map(tool => `
                <label><input type="checkbox" value="${tool}" ${role.allowedTools.includes(tool) ? 'checked' : ''}> ${tool}</label>
            `).join('');

            dom.roleEditorFields.innerHTML = `
                <label>角色名称: <input type="text" id="edit-role-name" value="${role.name || ''}" required></label>
                <label>分配模型: <select id="edit-role-model"><option value="">-- 选择模型 --</option>${modelOptions}</select></label>
                <label>系统提示: <textarea id="edit-role-systemPrompt" rows="8">${role.systemPrompt || ''}</textarea></label>
                <fieldset>
                    <legend>可用工具</legend>
                    <div class="checkbox-group">${toolCheckboxes}</div>
                </fieldset>
            `;
        }
    }

    function closeEditor() {
        dom.editorModal.style.display = 'none';
        state.editingType = null;
        state.editingIndex = -1;
    }

    function handleSaveEditor() {
        if (state.editingType === 'model') {
            const newModel = {
                name: document.getElementById('edit-model-name').value,
                provider: document.getElementById('edit-model-provider').value,
                modelName: document.getElementById('edit-model-modelName').value,
                apiKey: document.getElementById('edit-model-apiKey').value,
                baseUrl: document.getElementById('edit-model-baseUrl').value,
            };
            if (state.editingIndex > -1) {
                state.models[state.editingIndex] = newModel;
            } else {
                state.models.push(newModel);
            }
        } else if (state.editingType === 'role') {
            const allowedTools = Array.from(dom.roleEditorFields.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
            const newRole = {
                name: document.getElementById('edit-role-name').value,
                model: document.getElementById('edit-role-model').value,
                systemPrompt: document.getElementById('edit-role-systemPrompt').value,
                allowedTools: allowedTools,
            };
            if (state.editingIndex > -1) {
                state.roles[state.editingIndex] = newRole;
            } else {
                state.roles.push(newRole);
            }
        }
        renderAllSettings();
        closeEditor();
    }

    function handleListClick(e, type) {
        const action = e.target.dataset.action;
        const index = parseInt(e.target.dataset.index, 10);
        if (action === 'edit') {
            openEditor(type, index);
        } else if (action === 'delete') {
            if (confirm(`确定要删除这个${type === 'model' ? '模型' : '角色'}吗?`)) {
                if (type === 'model') {
                    state.models.splice(index, 1);
                } else {
                    state.roles.splice(index, 1);
                }
                renderAllSettings();
            }
        }
    }

    function saveAllSettings() {
        state.enableSmartScan = dom.smartScanCheckbox.checked;
        state.enableParallelExec = dom.parallelExecCheckbox.checked;
        state.enableAutoMode = dom.autoModeCheckbox.checked;
        state.enablePersistence = dom.persistenceCheckbox.checked;
        state.enableLongTermMemory = dom.longTermMemoryCheckbox.checked;
        state.enableAgentCollaboration = dom.agentCollaborationCheckbox.checked;

        vscode.postMessage({
            command: 'saveSettings',
            settings: {
                models: state.models,
                roles: state.roles,
                enableSmartScan: state.enableSmartScan,
                enableParallelExec: state.enableParallelExec,
                enableAutoMode: state.enableAutoMode,
                enablePersistence: state.enablePersistence,
                enableLongTermMemory: state.enableLongTermMemory,
                enableAgentCollaboration: state.enableAgentCollaboration,
            }
        });

        const btn = dom.saveSettingsBtn;
        const originalText = btn.textContent;
        btn.textContent = '已保存!';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    }

    function runHealthCheck() {
        dom.healthCheckSpinner.style.display = 'block';
        dom.healthCheckResults.style.display = 'none';
        dom.healthCheckResults.textContent = '';
        vscode.postMessage({ command: 'runHealthCheck' });
    }

    function renderHealthCheckResults(results) {
        const resultsContainer = dom.healthCheckResults;
        resultsContainer.innerHTML = ''; // Clear previous results

        const header = document.createElement('p');
        header.textContent = '配置健康检查报告:';
        resultsContainer.appendChild(header);

        results.errors.forEach(e => {
            const span = document.createElement('span');
            span.className = 'health-error';
            span.textContent = `[错误] ${e}`;
            resultsContainer.appendChild(span);
        });
        results.warnings.forEach(w => {
            const span = document.createElement('span');
            span.className = 'health-warning';
            span.textContent = `[警告] ${w}`;
            resultsContainer.appendChild(span);
        });
        results.success.forEach(s => {
            const span = document.createElement('span');
            span.className = 'health-success';
            span.textContent = `[成功] ${s}`;
            resultsContainer.appendChild(span);
        });

        if (results.errors.length === 0 && results.warnings.length === 0) {
            const allGood = document.createElement('span');
            allGood.className = 'health-success';
            allGood.style.marginTop = '1em';
            allGood.textContent = '所有检查通过，配置看起来很棒！';
            resultsContainer.appendChild(allGood);
        }
    }

    function handleTabClick(e) {
        if (e.target.matches('.tab-button')) {
            const tabName = e.target.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(tabName).classList.add('active');

            if (tabName === 'workspace') {
                requestWorkspaceStatus();
            }
        }
    }

    function requestWorkspaceStatus() {
        dom.fsStatus.textContent = '正在刷新...';
        dom.debuggerStatus.textContent = '正在刷新...';
        dom.gitStatus.textContent = '正在刷新...';
        vscode.postMessage({ command: 'getWorkspaceStatus' });
    }

    function renderWorkspaceStatus(status) {
        dom.fsStatus.textContent = status.fileSystem ? status.fileSystem.join('\n') : '未能加载文件列表。';

        let debugContent = '';
        if (state.debuggerState?.isActive) {
            debugContent += `<p><strong>状态:</strong> <span class="health-success">激活</span></p>`;
            debugContent += `<p><strong>会话:</strong> ${state.debuggerState.sessionName}</p>`;
        } else {
            debugContent += `<p><strong>状态:</strong> <span class="health-error">未激活</span></p>`;
        }
        debugContent += `<strong>断点:</strong>`;
        if (status.breakpoints && status.breakpoints.length > 0) {
            debugContent += `<ul>${status.breakpoints.map(bp => `<li>${bp}</li>`).join('')}</ul>`;
        } else {
            debugContent += `<p>无</p>`;
        }
        dom.debuggerStatus.innerHTML = debugContent;

        let gitContent = '';
        if (status.git) {
            gitContent += `<p><strong>当前分支:</strong> ${status.git.branch}</p>`;
            gitContent += `<strong>文件状态:</strong>`;
            if (status.git.files && status.git.files.length > 0) {
                 gitContent += `<pre class="log-box">${status.git.files.join('\n')}</pre>`;
            } else {
                gitContent += `<p>工作区纯净</p>`;
            }
        } else {
            gitContent = '<p>未能加载Git状态。</p>';
        }
        dom.gitStatus.innerHTML = gitContent;
    }

    // --- 新增功能函数 ---
    function checkFirstTimeUser() {
        // 检查是否有配置的模型
        if (state.models.length === 0) {
            state.isFirstTime = true;
            showWelcomeGuide();
        }
    }

    function showWelcomeGuide() {
        if (dom.welcomeGuide) {
            dom.welcomeGuide.style.display = 'flex';
        }
    }

    function hideWelcomeGuide() {
        if (dom.welcomeGuide) {
            dom.welcomeGuide.style.display = 'none';
        }
    }

    function startConfigWizard() {
        hideWelcomeGuide();
        // 切换到设置页
        document.querySelector('[data-tab="settings"]').click();
        // 显示模板选择器
        showTemplateModal();
    }

    function showTemplateModal() {
        if (dom.templateModal) {
            dom.templateModal.style.display = 'flex';
        }
    }

    function applySelectedTemplate() {
        if (!state.selectedTemplate) {
            addMessageToEventStream('error', '请先选择一个配置模板');
            return;
        }
        
        const template = configTemplates[state.selectedTemplate];
        if (!template) return;
        
        // 应用模板配置
        state.models = template.models;
        
        // 设置角色分配
        if (template.roleAssignments) {
            state.roles = state.roles.map(role => {
                const modelName = template.roleAssignments[role.name];
                if (modelName) {
                    return { ...role, model: modelName };
                }
                return role;
            });
        }
        
        renderAllSettings();
        dom.templateModal.style.display = 'none';
        
        // 提示用户填写API密钥
        addMessageToEventStream('system', `已应用 ${template.name}，请记得填写您的API密钥`);
        
        // 自动打开第一个模型的编辑器
        if (state.models.length > 0) {
            openEditor('model', 0);
        }
    }

    function exportConfig() {
        const config = {
            version: '2.2.0',
            models: state.models,
            roles: state.roles,
            settings: {
                enableSmartScan: state.enableSmartScan,
                enableParallelExec: state.enableParallelExec,
                enableAutoMode: state.enableAutoMode,
                enablePersistence: state.enablePersistence,
                enableLongTermMemory: state.enableLongTermMemory,
                enableAgentCollaboration: state.enableAgentCollaboration
            },
            exportTime: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `multi-agent-config-${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        addMessageToEventStream('system', '配置已导出');
    }

    function importConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const config = JSON.parse(event.target.result);
                    
                    // 验证配置格式
                    if (!config.models || !config.roles) {
                        throw new Error('无效的配置文件格式');
                    }
                    
                    // 应用配置
                    state.models = config.models;
                    state.roles = config.roles;
                    
                    if (config.settings) {
                        state.enableSmartScan = config.settings.enableSmartScan || false;
                        state.enableParallelExec = config.settings.enableParallelExec || false;
                        state.enableAutoMode = config.settings.enableAutoMode || false;
                        state.enablePersistence = config.settings.enablePersistence || false;
                        state.enableLongTermMemory = config.settings.enableLongTermMemory || false;
                        state.enableAgentCollaboration = config.settings.enableAgentCollaboration || false;
                    }
                    
                    renderAllSettings();
                    addMessageToEventStream('system', '配置已成功导入');
                } catch (error) {
                    addMessageToEventStream('error', `导入配置失败: ${error.message}`);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // --- STARTUP ---
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[系统] 界面初始化中...');
        
        // 检查依赖库
        if (typeof hljs === 'undefined') {
            console.warn('[系统] 代码高亮库未加载');
        }
        
        // 检查vscode API
        if (typeof vscode === 'undefined' || !vscode) {
            console.error('[系统] VS Code API未能获取');
        }
        
        bindEventListeners();
        vscode.postMessage({ command: 'getSettings' });
    });
}());
