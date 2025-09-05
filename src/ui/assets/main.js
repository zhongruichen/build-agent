// @ts-nocheck

(function () {
    /** @type {import('vscode-webview').VsCodeApi} */
    const vscode = acquireVsCodeApi();

    // --- STATE ---
    let serviceProviders = [];
    let defaultProviderId = null;
    let defaultModelId = null;
    let currentEditingProviderId = null;
    let currentEditingModelId = null;

    // --- DOM ELEMENTS ---
    let addProviderBtn, providerListContainer, modelParamsModal, modelParamsTitle;
    let tempInput, maxTokensInput, systemPromptInput;
    let saveParamsBtn, resetParamsBtn, cancelParamsBtn;
    
    // Thinking Config DOM Elements
    let thinkingPreset, thinkingCustomSettings, thinkingDepth, thinkingIterate, thinkingModel, thinkingFocus;
    let thinkingVisualize, thinkingSuggest, thinkingParallel, thinkingTrace, thinkingConfidence, thinkingCritique;

    /**
     * @typedef {object} ThinkingConfig
     * @property {string} [preset]
     * @property {number} [depth]
     * @property {number} [iterate]
     * @property {string} [model]
     * @property {string} [focus]
     * @property {boolean} [visualize]
     * @property {boolean} [suggest]
     * @property {boolean} [parallel]
     * @property {boolean} [trace]
     * @property {boolean} [confidence]
     * @property {boolean} [critique]
     */

    /**
     * @typedef {object} ModelParameters
     * @property {number} [temperature]
     * @property {number} [max_tokens]
     * @property {string} [system_prompt]
     * @property {ThinkingConfig} [thinkingConfig]
     */
    
    /**
     * @typedef {object} Model
     * @property {string} id
     * @property {boolean} isManual
     * @property {ModelParameters} parameters
     */

    /**
     * @typedef {object} ServiceProvider
     * @property {string} id
     * @property {string} name
     * @property {string} baseUrl
     * @property {string} apiKey
     * @property {Model[]} models
     */
    
    const thinkingPresets = {
        'default': { visualize: true },
        'deep': { depth: 20, iterate: 5, visualize: true, suggest: true, confidence: true, critique: true },
        'top': { depth: 30, iterate: 10, model: 'all', focus: 'all', visualize: true, suggest: true, parallel: true, trace: true, confidence: true, critique: true }
    };

    // --- INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[调试] DOM加载完成，正在初始化UI组件...');
        
        // 缓存DOM元素
        providerListContainer = document.getElementById('service-provider-list-container');
        addProviderBtn = document.getElementById('add-provider-btn');
        modelParamsModal = document.getElementById('model-params-modal');
        modelParamsTitle = document.getElementById('model-params-title');
        tempInput = document.getElementById('param-temperature');
        maxTokensInput = document.getElementById('param-max-tokens');
        systemPromptInput = document.getElementById('param-system-prompt');
        saveParamsBtn = document.getElementById('save-model-params-btn');
        resetParamsBtn = document.getElementById('reset-model-params-btn');
        cancelParamsBtn = document.getElementById('cancel-model-params-btn');

        // Thinking Config DOM Elements
        thinkingPreset = document.getElementById('thinking-preset');
        thinkingCustomSettings = document.getElementById('thinking-custom-settings');
        thinkingDepth = document.getElementById('thinking-depth');
        thinkingIterate = document.getElementById('thinking-iterate');
        thinkingModel = document.getElementById('thinking-model');
        thinkingFocus = document.getElementById('thinking-focus');
        thinkingVisualize = document.getElementById('thinking-visualize');
        thinkingSuggest = document.getElementById('thinking-suggest');
        thinkingParallel = document.getElementById('thinking-parallel');
        thinkingTrace = document.getElementById('thinking-trace');
        thinkingConfidence = document.getElementById('thinking-confidence');
        thinkingCritique = document.getElementById('thinking-critique');

        // 初始数据请求
        vscode.postMessage({ command: 'getServiceProviders' });
        
        // 设置事件监听器并添加调试日志
        console.log('[调试] 正在设置事件监听器...');
        
        // Tab切换功能
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                console.log('[调试] 点击标签页:', this.dataset.tab);
                const targetTab = this.dataset.tab;
                
                // 移除所有标签和内容的active类
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // 为点击的标签和对应内容添加active类
                this.classList.add('active');
                const targetContent = document.getElementById(targetTab);
                if (targetContent) {
                    targetContent.classList.add('active');
                    console.log('[调试] 已切换到标签页:', targetTab);
                } else {
                    console.error('[调试] 未找到标签页内容:', targetTab);
                }
            });
        });
        
        // 状态标签页事件监听器
        const sendChatBtn = document.getElementById('send-chat-btn');
        const stopTaskBtn = document.getElementById('stop-task-btn');
        const chatInput = document.getElementById('chat-input');
        const toggleThinkingBtn = document.getElementById('toggle-thinking-btn');
        const copyArtifactBtn = document.getElementById('copy-artifact-btn');
        const approvePlanBtn = document.getElementById('approve-plan-btn');
        const cancelPlanBtn = document.getElementById('cancel-plan-btn');
        const addTaskBtn = document.getElementById('add-task-btn');
        
        // 发送任务函数
        function sendTask() {
            const text = chatInput?.value.trim();
            if (text) {
                console.log('[调试] 发送任务:', text);
                vscode.postMessage({ command: 'startTask', text });
                chatInput.value = '';
                if (sendChatBtn) sendChatBtn.style.display = 'none';
                if (stopTaskBtn) stopTaskBtn.style.display = 'inline-block';
            }
        }
        
        if (sendChatBtn) {
            sendChatBtn.addEventListener('click', sendTask);
        } else {
            console.error('[调试] 未找到发送聊天按钮！');
        }
        
        // 为聊天输入框添加Enter键支持
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    console.log('[调试] 在聊天输入框中按下Enter键');
                    sendTask();
                }
            });
            console.log('[调试] 聊天输入框键盘监听器已附加');
        }
        
        if (stopTaskBtn) {
            stopTaskBtn.addEventListener('click', () => {
                console.log('[调试] 点击停止任务按钮');
                vscode.postMessage({ command: 'stopTask' });
                stopTaskBtn.style.display = 'none';
                sendChatBtn.style.display = 'inline-block';
            });
        }
        
        if (toggleThinkingBtn) {
            toggleThinkingBtn.addEventListener('click', () => {
                console.log('[调试] 点击切换思考过程按钮');
                const content = document.getElementById('thinking-process-content');
                if (content) {
                    content.style.display = content.style.display === 'none' ? 'block' : 'none';
                }
            });
        }
        
        if (copyArtifactBtn) {
            copyArtifactBtn.addEventListener('click', () => {
                console.log('[调试] 点击复制产物按钮');
                const artifact = document.getElementById('final-artifact');
                if (artifact) {
                    navigator.clipboard.writeText(artifact.textContent);
                    copyArtifactBtn.textContent = '已复制';
                    setTimeout(() => {
                        copyArtifactBtn.textContent = '复制';
                    }, 2000);
                }
            });
        }
        
        if (approvePlanBtn) {
            approvePlanBtn.addEventListener('click', () => {
                console.log('[调试] 点击批准计划按钮');
                const tasks = document.querySelectorAll('.editable-task-input');
                const plan = Array.from(tasks).map(input => input.value);
                vscode.postMessage({ command: 'planApproved', plan });
            });
        }
        
        if (cancelPlanBtn) {
            cancelPlanBtn.addEventListener('click', () => {
                console.log('[调试] 点击取消计划按钮');
                vscode.postMessage({ command: 'cancelTask' });
            });
        }
        
        // 工作区标签页事件监听器
        const refreshStatusBtn = document.getElementById('refresh-status-btn');
        if (refreshStatusBtn) {
            refreshStatusBtn.addEventListener('click', () => {
                console.log('[调试] 点击刷新状态按钮');
                vscode.postMessage({ command: 'getWorkspaceStatus' });
            });
        }
        
        // 设置标签页事件监听器
        const healthCheckBtn = document.getElementById('health-check-btn');
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        
        if (healthCheckBtn) {
            healthCheckBtn.addEventListener('click', () => {
                console.log('[调试] 点击健康检查按钮');
                vscode.postMessage({ command: 'runHealthCheck' });
            });
        }
        
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => {
                console.log('[调试] 点击保存设置按钮');
                // 收集所有设置
                const settings = {
                    enableSmartScan: document.getElementById('setting-smart-scan')?.checked,
                    enableParallelExec: document.getElementById('setting-parallel-exec')?.checked,
                    enableAutoMode: document.getElementById('setting-auto-mode')?.checked,
                    enablePersistence: document.getElementById('setting-persistence')?.checked,
                    enableThinkingChain: document.getElementById('setting-thinking-chain')?.checked
                };
                console.log('[调试] 保存设置:', settings);
                vscode.postMessage({ command: 'saveSettings', settings });
            });
        }
        
        // 欢迎引导事件监听器
        const startGuideBtn = document.getElementById('start-guide-btn');
        const skipGuideBtn = document.getElementById('skip-guide-btn');
        const welcomeGuide = document.getElementById('welcome-guide');
        
        if (startGuideBtn) {
            startGuideBtn.addEventListener('click', () => {
                console.log('[调试] 点击开始引导按钮');
                if (welcomeGuide) {
                    welcomeGuide.style.display = 'none';
                }
                // 切换到设置标签页进行配置
                document.querySelector('[data-tab="settings"]')?.click();
            });
        }
        
        if (skipGuideBtn) {
            skipGuideBtn.addEventListener('click', () => {
                console.log('[调试] 点击跳过引导按钮');
                if (welcomeGuide) {
                    welcomeGuide.style.display = 'none';
                }
            });
        }
        
        // 角色配置事件监听器
        const addRoleBtn = document.getElementById('add-role-btn');
        if (addRoleBtn) {
            addRoleBtn.addEventListener('click', () => {
                console.log('[调试] 点击添加角色按钮');
                // TODO: 实现角色添加功能
                vscode.postMessage({ command: 'addRole' });
            });
        }
        
        // 编辑器模态框事件监听器
        const saveEditorBtn = document.getElementById('save-editor-btn');
        const cancelEditorBtn = document.getElementById('cancel-editor-btn');
        const editorModal = document.getElementById('editor-modal');
        
        if (saveEditorBtn) {
            saveEditorBtn.addEventListener('click', () => {
                console.log('[调试] 点击保存编辑器按钮');
                // TODO: 根据编辑内容实现保存逻辑
                if (editorModal) {
                    editorModal.style.display = 'none';
                }
            });
        }
        
        if (cancelEditorBtn) {
            cancelEditorBtn.addEventListener('click', () => {
                console.log('[调试] 点击取消编辑器按钮');
                if (editorModal) {
                    editorModal.style.display = 'none';
                }
            });
        }
        
        // 模板模态框事件监听器
        const applyTemplateBtn = document.getElementById('apply-template-btn');
        const cancelTemplateBtn = document.getElementById('cancel-template-btn');
        const templateModal = document.getElementById('template-modal');
        const templateItems = document.querySelectorAll('.template-item');
        let selectedTemplate = null;
        
        templateItems.forEach(item => {
            item.addEventListener('click', function() {
                console.log('[调试] 选择模板:', this.dataset.template);
                templateItems.forEach(t => t.classList.remove('selected'));
                this.classList.add('selected');
                selectedTemplate = this.dataset.template;
            });
        });
        
        if (applyTemplateBtn) {
            applyTemplateBtn.addEventListener('click', () => {
                console.log('[调试] 点击应用模板按钮，模板:', selectedTemplate);
                if (selectedTemplate) {
                    vscode.postMessage({ command: 'applyTemplate', template: selectedTemplate });
                    if (templateModal) {
                        templateModal.style.display = 'none';
                    }
                }
            });
        }
        
        if (cancelTemplateBtn) {
            cancelTemplateBtn.addEventListener('click', () => {
                console.log('[调试] 点击取消模板按钮');
                if (templateModal) {
                    templateModal.style.display = 'none';
                }
            });
        }
        
        // 计划审查中的添加任务按钮
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', () => {
                console.log('[调试] 点击添加任务按钮');
                const planList = document.getElementById('editable-plan-list');
                if (planList) {
                    const newTask = document.createElement('div');
                    newTask.className = 'editable-task-item';
                    newTask.innerHTML = `
                        <input type="text" class="editable-task-input" placeholder="输入新任务..." value="">
                        <button class="remove-task-btn">删除</button>
                    `;
                    planList.appendChild(newTask);
                    
                    // 为新的删除按钮添加事件监听器
                    const removeBtn = newTask.querySelector('.remove-task-btn');
                    if (removeBtn) {
                        removeBtn.addEventListener('click', function() {
                            newTask.remove();
                        });
                    }
                }
            });
        }
        
        // 服务提供商事件监听器
        if (addProviderBtn) {
            addProviderBtn.addEventListener('click', handleAddProvider);
            console.log('[调试] 添加提供商按钮监听器已附加');
        } else {
            console.error('[调试] 未找到添加提供商按钮！');
        }
        
        if (providerListContainer) {
            providerListContainer.addEventListener('click', handleProviderListClick);
            console.log('[调试] 提供商列表容器监听器已附加');
        }
        
        if (saveParamsBtn) {
            saveParamsBtn.addEventListener('click', handleSaveParams);
        }
        
        if (resetParamsBtn) {
            resetParamsBtn.addEventListener('click', handleResetParams);
        }
        
        if (cancelParamsBtn) {
            cancelParamsBtn.addEventListener('click', closeModelParametersModal);
        }
        
        if (thinkingPreset) {
            thinkingPreset.addEventListener('change', handleThinkingPresetChange);
        }
        
        // 检查是否应该显示欢迎引导（首次用户）
        const hasSeenGuide = localStorage.getItem('hasSeenWelcomeGuide');
        if (!hasSeenGuide && welcomeGuide) {
            console.log('[调试] 为首次用户显示欢迎引导');
            welcomeGuide.style.display = 'block';
            localStorage.setItem('hasSeenWelcomeGuide', 'true');
        }
        
        // 添加键盘快捷键
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter 发送任务
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                const chatInput = document.getElementById('chat-input');
                if (chatInput && document.activeElement === chatInput) {
                    console.log('[调试] 按下Ctrl+Enter，发送任务');
                    e.preventDefault();
                    document.getElementById('send-chat-btn')?.click();
                }
            }
            
            // Ctrl/Cmd + 1,2,3 切换标签页
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '1') {
                    console.log('[调试] 按下Ctrl+1，切换到状态标签页');
                    document.querySelector('[data-tab="status"]')?.click();
                } else if (e.key === '2') {
                    console.log('[调试] 按下Ctrl+2，切换到工作区标签页');
                    document.querySelector('[data-tab="workspace"]')?.click();
                } else if (e.key === '3') {
                    console.log('[调试] 按下Ctrl+3，切换到设置标签页');
                    document.querySelector('[data-tab="settings"]')?.click();
                }
            }
            
            // Escape 关闭模态框
            if (e.key === 'Escape') {
                console.log('[调试] 按下Escape，关闭模态框');
                const modals = document.querySelectorAll('.modal');
                modals.forEach(modal => {
                    if (modal.style.display !== 'none') {
                        modal.style.display = 'none';
                    }
                });
            }
        });
        
        // 添加错误边界以更好地处理错误
        window.addEventListener('error', (event) => {
            console.error('[调试] JavaScript错误:', event.error);
            addEventToStream(`⚠️ UI错误: ${event.error?.message || '未知错误'}`, 'error');
        });
        
        // 添加未处理的Promise拒绝处理器
        window.addEventListener('unhandledrejection', (event) => {
            console.error('[调试] 未处理的Promise拒绝:', event.reason);
            addEventToStream(`⚠️ 异步错误: ${event.reason?.message || event.reason}`, 'error');
        });
        
        // 如果需要，初始化工具提示
        document.querySelectorAll('[title]').forEach(element => {
            element.addEventListener('mouseenter', () => {
                console.log('[调试] 显示工具提示:', element.title);
            });
        });
        
        // 请求初始数据
        setTimeout(() => {
            console.log('[调试] 请求初始设置和思考配置');
            vscode.postMessage({ command: 'getSettings' });
            vscode.postMessage({ command: 'getThinkingConfig' });
        }, 100);
        
        console.log('[调试] 所有事件监听器初始化成功');
    });

    window.addEventListener('message', event => {
        const message = event.data;
        console.log('[调试] 收到消息:', message.command);
        
        switch (message.command) {
            case 'receiveServiceProviders':
                serviceProviders = message.providers;
                defaultProviderId = message.defaults.defaultProviderId;
                defaultModelId = message.defaults.defaultModelId;
                renderServiceProviders();
                const refreshingButtons = document.querySelectorAll('button[data-action="refresh-models"]:disabled');
                refreshingButtons.forEach(btn => {
                    btn.textContent = '刷新模型';
                    btn.disabled = false;
                });
                break;
                
            case 'receiveModelParameters':
                populateAndShowModal(message.params);
                break;
                
            case 'receiveSettings':
                console.log('[调试] 收到设置:', message.settings);
                if (message.settings) {
                    // 使用接收到的设置更新UI
                    const smartScan = document.getElementById('setting-smart-scan');
                    const parallelExec = document.getElementById('setting-parallel-exec');
                    const autoMode = document.getElementById('setting-auto-mode');
                    const persistence = document.getElementById('setting-persistence');
                    const thinkingChain = document.getElementById('setting-thinking-chain');
                    
                    if (smartScan) smartScan.checked = message.settings.enableSmartScan || false;
                    if (parallelExec) parallelExec.checked = message.settings.enableParallelExec || false;
                    if (autoMode) autoMode.checked = message.settings.enableAutoMode || false;
                    if (persistence) persistence.checked = message.settings.enablePersistence || false;
                    if (thinkingChain) thinkingChain.checked = message.settings.enableThinkingChain || false;
                }
                break;
                
            case 'receiveThinkingConfig':
                console.log('[调试] 收到思考配置:', message.config);
                if (message.config) {
                    renderThinkingConfig(message.config);
                }
                break;
                
            case 'updateTask':
                console.log('[调试] 任务更新:', message);
                updateTaskUI(message);
                break;
                
            case 'showPlanReview':
                console.log('[调试] 显示计划审查:', message.plan);
                showPlanReview(message.plan);
                break;
                
            case 'updateProgress':
                console.log('[调试] 进度更新:', message.progress);
                updateProgressBar(message.progress);
                break;
                
            case 'addEventLog':
                console.log('[调试] 添加事件日志:', message.text);
                addEventToStream(message.text, message.type);
                break;
                
            case 'updateArtifact':
                console.log('[调试] 更新产物:', message.artifact?.substring(0, 100) + '...');
                updateFinalArtifact(message.artifact);
                break;
                
            case 'showThinkingProcess':
                console.log('[调试] 显示思考过程');
                const container = document.getElementById('thinking-process-container');
                const content = document.getElementById('thinking-process-content');
                if (container && content) {
                    container.style.display = 'block';
                    content.innerHTML = message.content || '';
                }
                break;
                
            case 'healthCheckResult':
                console.log('[调试] 健康检查结果:', message.result);
                showHealthCheckResult(message.result);
                break;
                
            case 'workspaceStatus':
                console.log('[调试] 工作区状态:', message.status);
                updateWorkspaceStatus(message.status);
                break;
                
            default:
                console.warn('[调试] 未知的消息命令:', message.command);
        }
    });
    
    // UI更新辅助函数
    function updateTaskUI(message) {
        const goalElement = document.getElementById('overall-goal');
        if (goalElement && message.goal) {
            goalElement.textContent = message.goal;
        }
        
        const planList = document.getElementById('plan-list');
        if (planList && message.plan) {
            planList.innerHTML = '';
            message.plan.forEach(task => {
                const li = document.createElement('li');
                li.textContent = task;
                planList.appendChild(li);
            });
        }
    }
    
    function showPlanReview(plan) {
        const container = document.getElementById('plan-review-container');
        const editableList = document.getElementById('editable-plan-list');
        
        if (container && editableList) {
            editableList.innerHTML = '';
            plan.forEach(task => {
                const taskItem = document.createElement('div');
                taskItem.className = 'editable-task-item';
                taskItem.innerHTML = `
                    <input type="text" class="editable-task-input" value="${task}">
                    <button class="remove-task-btn">删除</button>
                `;
                editableList.appendChild(taskItem);
                
                // 添加删除功能
                const removeBtn = taskItem.querySelector('.remove-task-btn');
                if (removeBtn) {
                    removeBtn.addEventListener('click', function() {
                        taskItem.remove();
                    });
                }
            });
            container.style.display = 'block';
        }
    }
    
    function updateProgressBar(progress) {
        const progressBar = document.getElementById('plan-progress');
        const progressFill = document.getElementById('plan-progress-bar');
        const progressText = document.getElementById('plan-progress-text');
        
        if (progressBar && progressFill && progressText) {
            progressBar.style.display = 'block';
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${progress}%`;
        }
    }
    
    function addEventToStream(text, type = 'info') {
        const eventStream = document.getElementById('event-stream');
        if (eventStream) {
            const eventDiv = document.createElement('div');
            eventDiv.className = `event-item event-${type}`;
            
            // Add appropriate icon based on type
            let icon = '';
            switch (type) {
                case 'error': icon = '❌ '; break;
                case 'warning': icon = '⚠️ '; break;
                case 'success': icon = '✅ '; break;
                case 'info': default: icon = 'ℹ️ '; break;
            }
            
            eventDiv.innerHTML = `<span class="timestamp">[${new Date().toLocaleTimeString()}]</span> ${icon}${text}`;
            eventStream.appendChild(eventDiv);
            eventStream.scrollTop = eventStream.scrollHeight;
            
            // Limit event stream to last 100 items for performance
            const items = eventStream.querySelectorAll('.event-item');
            if (items.length > 100) {
                items[0].remove();
            }
        }
    }
    
    function updateFinalArtifact(artifact) {
        const artifactElement = document.getElementById('final-artifact');
        if (artifactElement) {
            const codeElement = artifactElement.querySelector('code');
            if (codeElement) {
                codeElement.textContent = artifact;
                // Apply syntax highlighting if highlight.js is available
                if (typeof hljs !== 'undefined') {
                    hljs.highlightElement(codeElement);
                }
            }
        }
    }
    
    function showHealthCheckResult(result) {
        const spinner = document.getElementById('health-check-spinner');
        const results = document.getElementById('health-check-results');
        const healthCheckBtn = document.getElementById('health-check-btn');
        
        if (spinner) spinner.style.display = 'none';
        if (healthCheckBtn) healthCheckBtn.disabled = false;
        
        if (results) {
            results.style.display = 'block';
            results.textContent = result;
            
            // Add syntax highlighting if it's JSON
            try {
                const jsonResult = JSON.parse(result);
                results.innerHTML = `<pre>${JSON.stringify(jsonResult, null, 2)}</pre>`;
            } catch {
                // Not JSON, keep as text
                results.textContent = result;
            }
        }
    }
    
    // Start health check with loading state
    function startHealthCheck() {
        const spinner = document.getElementById('health-check-spinner');
        const results = document.getElementById('health-check-results');
        const healthCheckBtn = document.getElementById('health-check-btn');
        
        if (spinner) spinner.style.display = 'inline-block';
        if (results) results.style.display = 'none';
        if (healthCheckBtn) healthCheckBtn.disabled = true;
        
        vscode.postMessage({ command: 'runHealthCheck' });
    }
    
    function updateWorkspaceStatus(status) {
        const fsStatus = document.getElementById('fs-status');
        const debuggerStatus = document.getElementById('debugger-status');
        const gitStatus = document.getElementById('git-status');
        
        if (fsStatus && status.fileSystem) {
            fsStatus.innerHTML = status.fileSystem;
        }
        if (debuggerStatus && status.debugger) {
            debuggerStatus.innerHTML = status.debugger;
        }
        if (gitStatus && status.git) {
            gitStatus.innerHTML = status.git;
        }
    }

    // --- EVENT HANDLERS ---
    function handleAddProvider() {
        vscode.postMessage({
            command: 'addServiceProvider',
            provider: { name: '新自定义提供商', baseUrl: 'http://localhost:8080/v1', apiKey: '' }
        });
    }

    function handleProviderListClick(event) {
        const target = event.target;
        
        if (target.tagName === 'BUTTON' && target.dataset.action) {
            const button = target;
            const providerId = button.dataset.providerId;
            const modelId = button.dataset.modelId;
            const action = button.dataset.action;

            switch (action) {
                case 'save':
                    // 收集所有更改的数据
                    const providerItem = button.closest('.service-provider-item');
                    const nameInput = providerItem.querySelector('.provider-name-input');
                    const urlInput = providerItem.querySelector('.provider-url-input');
                    const keyInput = providerItem.querySelector('.provider-key-input');
                    
                    if (nameInput && urlInput && keyInput) {
                        const updatedProvider = {
                            id: providerId,
                            name: nameInput.value.trim(),
                            baseUrl: urlInput.value.trim(),
                            apiKey: keyInput.value.trim()
                        };
                        
                        console.log('[调试] 保存提供商配置:', updatedProvider);
                        vscode.postMessage({ command: 'updateServiceProvider', provider: updatedProvider });
                        
                        // 显示保存成功提示
                        button.textContent = '已保存';
                        button.disabled = true;
                        setTimeout(() => {
                            button.textContent = '保存';
                            button.style.display = 'none';
                            button.disabled = false;
                        }, 2000);
                    }
                    break;
                case 'delete':
                    if (confirm('确定要删除此服务提供商吗？')) {
                        vscode.postMessage({ command: 'removeServiceProvider', id: providerId });
                    }
                    break;
                case 'refresh-models':
                    button.textContent = '刷新中...';
                    button.disabled = true;
                    vscode.postMessage({ command: 'refreshModels', id: providerId });
                    break;
                case 'add-model':
                    const input = button.previousElementSibling;
                    if (input && input.value) {
                        vscode.postMessage({ command: 'addModel', providerId, modelId: input.value });
                        input.value = '';
                    }
                    break;
                case 'configure':
                    openModelParametersModal(providerId, modelId);
                    break;
            }
        }
        
        if (target.tagName === 'INPUT' && target.type === 'radio' && target.name === 'default-model') {
            const radio = target;
            vscode.postMessage({ command: 'setDefault', providerId: radio.dataset.providerId, modelId: radio.dataset.modelId });
        }
    }

    function handleSaveParams() {
        const params = {
            temperature: parseFloat(tempInput.value) || undefined,
            max_tokens: parseInt(maxTokensInput.value, 10) || undefined,
            system_prompt: systemPromptInput.value || undefined,
            thinkingConfig: getThinkingConfigFromUI(),
        };
        Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

        vscode.postMessage({
            command: 'saveModelParameters',
            providerId: currentEditingProviderId,
            modelId: currentEditingModelId,
            params: params,
        });
        
        closeModelParametersModal();
    }

    function handleResetParams() {
        vscode.postMessage({
            command: 'resetModelParameters',
            providerId: currentEditingProviderId,
            modelId: currentEditingModelId,
        });
        closeModelParametersModal();
    }

    // --- MODAL LOGIC ---
    function openModelParametersModal(providerId, modelId) {
        currentEditingProviderId = providerId;
        currentEditingModelId = modelId;
        modelParamsTitle.textContent = `配置模型: ${modelId}`;
        vscode.postMessage({ command: 'getModelParameters', providerId, modelId });
    }
    
    function populateAndShowModal(params) {
        tempInput.value = params.temperature ?? '';
        maxTokensInput.value = params.max_tokens ?? '';
        systemPromptInput.value = params.system_prompt ?? '';
        renderThinkingConfig(params.thinkingConfig || {});
        modelParamsModal.style.display = 'block';
    }

    function closeModelParametersModal() {
        modelParamsModal.style.display = 'none';
        currentEditingProviderId = null;
        currentEditingModelId = null;
    }

    // --- RENDER FUNCTION ---
    function renderServiceProviders() {
        if (!providerListContainer) return;
        providerListContainer.innerHTML = '';
        if (!serviceProviders || serviceProviders.length === 0) {
            providerListContainer.innerHTML = '<p>未配置服务提供商。点击"添加服务商"开始配置。</p>';
            return;
        }

        serviceProviders.forEach(provider => {
            const providerElement = document.createElement('div');
            providerElement.className = 'service-provider-item';
            
            const modelsHtml = provider.models.map(model => {
                const isChecked = provider.id === defaultProviderId && model.id === defaultModelId;
                const isConfigured = model.parameters && Object.keys(model.parameters).length > 0;
                
                return `
                    <li class="model-item">
                        <div class="model-item-left">
                            <input type="radio" name="default-model" id="model-${provider.id}-${model.id}"
                                   data-provider-id="${provider.id}" data-model-id="${model.id}" ${isChecked ? 'checked' : ''}>
                            <label for="model-${provider.id}-${model.id}">
                                ${model.id} ${model.isManual ? ' (手动)' : ''}
                            </label>
                        </div>
                        <button class="button ${isConfigured ? 'configured' : ''}"
                                data-provider-id="${provider.id}" data-model-id="${model.id}" data-action="configure">配置</button>
                    </li>
                `;
            }).join('');

            providerElement.innerHTML = `
                <div class="provider-header">
                    <h3>
                        <input type="text" class="provider-name-input" value="${provider.name}"
                               data-provider-id="${provider.id}" data-field="name"
                               style="background: transparent; border: 1px solid transparent; font-size: inherit; font-weight: bold; padding: 2px 5px;">
                    </h3>
                    <div class="provider-actions">
                        <button class="button button-save" data-provider-id="${provider.id}" data-action="save" style="display: none;">保存</button>
                        <button class="button" data-provider-id="${provider.id}" data-action="delete">删除</button>
                        <button class="button" data-provider-id="${provider.id}" data-action="refresh-models">刷新模型</button>
                    </div>
                </div>
                <div class="provider-details" style="display: flex; flex-direction: column; gap: 10px; padding: 10px; background: #f5f5f5; border-radius: 5px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="min-width: 80px; font-weight: bold;">基础URL:</label>
                        <input type="text" class="provider-url-input" value="${provider.baseUrl}"
                               data-provider-id="${provider.id}" data-field="baseUrl"
                               placeholder="例如: https://api.openai.com/v1"
                               style="flex: 1; padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="min-width: 80px; font-weight: bold;">API密钥:</label>
                        <input type="password" class="provider-key-input" value="${provider.apiKey || ''}"
                               data-provider-id="${provider.id}" data-field="apiKey"
                               placeholder="输入API密钥"
                               style="flex: 1; padding: 5px; border: 1px solid #ccc; border-radius: 3px;">
                        <button class="button button-small" onclick="this.previousElementSibling.type = this.previousElementSibling.type === 'password' ? 'text' : 'password'; this.textContent = this.previousElementSibling.type === 'password' ? '👁️' : '🔒';" style="padding: 5px 10px;">
                            👁️
                        </button>
                    </div>
                </div>
                <div class="models-section">
                    <h4>模型（选择默认）</h4>
                    <ul class="models-list">${modelsHtml}</ul>
                     <div class="add-model-form">
                        <input type="text" placeholder="手动添加模型ID" class="model-input">
                        <button class="button" data-provider-id="${provider.id}" data-action="add-model">添加</button>
                    </div>
                </div>
            `;
            providerListContainer.appendChild(providerElement);
            
            // 添加输入框变化事件监听器
            const nameInput = providerElement.querySelector('.provider-name-input');
            const urlInput = providerElement.querySelector('.provider-url-input');
            const keyInput = providerElement.querySelector('.provider-key-input');
            const saveBtn = providerElement.querySelector('[data-action="save"]');
            
            // 监听输入变化，显示保存按钮
            [nameInput, urlInput, keyInput].forEach(input => {
                if (input) {
                    // 鼠标悬停时显示边框
                    input.addEventListener('mouseenter', () => {
                        if (input === nameInput) {
                            input.style.border = '1px solid #ccc';
                        }
                    });
                    
                    input.addEventListener('mouseleave', () => {
                        if (input === nameInput && document.activeElement !== input) {
                            input.style.border = '1px solid transparent';
                        }
                    });
                    
                    input.addEventListener('focus', () => {
                        if (input === nameInput) {
                            input.style.border = '1px solid #007acc';
                        }
                    });
                    
                    input.addEventListener('blur', () => {
                        if (input === nameInput) {
                            input.style.border = '1px solid transparent';
                        }
                    });
                    
                    input.addEventListener('input', () => {
                        if (saveBtn) saveBtn.style.display = 'inline-block';
                    });
                    
                    // 支持回车保存
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            saveBtn?.click();
                        }
                    });
                }
            });
        });
    }
    
    // --- THINKING CONFIG FUNCTIONS ---
    function renderThinkingConfig(config) {
        if (!thinkingPreset) return;
        const cfg = config;
        thinkingPreset.value = cfg.preset || 'default';
        thinkingDepth.value = cfg.depth || '';
        thinkingIterate.value = cfg.iterate || '';
        thinkingModel.value = cfg.model || '';
        thinkingFocus.value = cfg.focus || '';
        thinkingVisualize.checked = cfg.visualize ?? true;
        thinkingSuggest.checked = cfg.suggest ?? false;
        thinkingParallel.checked = cfg.parallel ?? false;
        thinkingTrace.checked = cfg.trace ?? false;
        thinkingConfidence.checked = cfg.confidence ?? false;
        thinkingCritique.checked = cfg.critique ?? false;
        handleThinkingPresetChange();
    }

    function handleThinkingPresetChange() {
        const preset = thinkingPreset.value;
        if (preset === 'custom') {
            thinkingCustomSettings.style.display = 'block';
        } else {
            thinkingCustomSettings.style.display = 'none';
            const presetConfig = thinkingPresets[preset] || {};
            renderThinkingConfig(presetConfig);
        }
    }

    function getThinkingConfigFromUI() {
        const preset = thinkingPreset.value;
        if (preset !== 'custom') {
            return { preset, ...(thinkingPresets[preset] || {}) };
        }
        return {
            preset: 'custom',
            depth: parseInt(thinkingDepth.value, 10) || undefined,
            iterate: parseInt(thinkingIterate.value, 10) || undefined,
            model: thinkingModel.value || undefined,
            focus: thinkingFocus.value || undefined,
            visualize: thinkingVisualize.checked,
            suggest: thinkingSuggest.checked,
            parallel: thinkingParallel.checked,
            trace: thinkingTrace.checked,
            confidence: thinkingConfidence.checked,
            critique: thinkingCritique.checked,
        };
    }
}());
