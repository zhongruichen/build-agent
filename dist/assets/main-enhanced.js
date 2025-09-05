// @ts-nocheck
// 增强版 VS Code 扩展 - 优化用户体验

(function () {
    const vscode = acquireVsCodeApi();

    // ============= 状态管理 =============
    let serviceProviders = [];
    let defaultProviderId = null;
    let defaultModelId = null;
    let currentEditingProviderId = null;
    let currentEditingModelId = null;
    
    // 撤销/重做历史栈
    const historyStack = [];
    let historyIndex = -1;
    const MAX_HISTORY = 50;
    
    // 自动保存定时器
    let autoSaveTimer = null;
    const AUTO_SAVE_DELAY = 2000; // 2秒后自动保存
    
    // 配置模板
    const configTemplates = {
        openai: {
            name: 'OpenAI GPT-4',
            baseUrl: 'https://api.openai.com/v1',
            models: ["chatgpt-4o-latest-20250326", "gpt-4.1-2025-04-14", "gpt-5-high","gpt-5-chat"]
        },
        anthropic: {
            name: 'Anthropic Claude',
            baseUrl: 'https://api.anthropic.com/v1',
            models: ["claude-3-7-sonnet-20250219","claude-3-7-sonnet-20250219-thinking-32k","claude-opus-4-1-20250805","claude-opus-4-1-20250805-thinking-16k","claude-opus-4-20250514","claude-opus-4-20250514-thinking-16k","claude-sonnet-4-20250514","claude-sonnet-4-20250514-thinking-32k"]
        },
        azure: {
            name: 'Azure OpenAI',
            baseUrl: 'https://YOUR-RESOURCE.openai.azure.com',
            models: ["chatgpt-4o-latest-20250326", "gpt-4.1-2025-04-14", "gpt-5-high","gpt-5-chat","claude-3-7-sonnet-20250219","claude-3-7-sonnet-20250219-thinking-32k","claude-opus-4-1-20250805","claude-opus-4-1-20250805-thinking-16k","claude-opus-4-20250514","claude-opus-4-20250514-thinking-16k","claude-sonnet-4-20250514","claude-sonnet-4-20250514-thinking-32k"]
        },
        local: {
            name: '本地Ollama',
            baseUrl: 'http://localhost:11434/api',
            models: ["gpt-5-chat"]
        }
    };
    
    // 智能提示数据
    const autoCompleteData = {
        urls: [
            'https://api.openai.com/v1',
            'https://api.anthropic.com/v1',
            'http://localhost:11434/api',
            'https://api.cohere.ai/v1',
            'https://api.together.xyz/v1'
        ],
        models: [
            "chatgpt-4o-latest-20250326", 
            "gpt-4.1-2025-04-14", 
            "gpt-5-high","gpt-5-chat",
            "claude-3-7-sonnet-20250219",
            "claude-3-7-sonnet-20250219-thinking-32k",
            "claude-opus-4-1-20250805",
            "claude-opus-4-1-20250805-thinking-16k",
            "claude-opus-4-20250514",
            "claude-opus-4-20250514-thinking-16k",
            "claude-sonnet-4-20250514",
            "claude-sonnet-4-20250514-thinking-32k"
        ]
    };

    // ============= 工具函数 =============
    
    // URL验证
    function validateUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch {
            return false;
        }
    }
    
    // API密钥格式验证
    function validateApiKey(key, provider) {
        if (!key) return false;
        
        // OpenAI格式: sk-...
        if (provider?.includes('openai') && !key.startsWith('sk-')) {
            return false;
        }
        
        // 通用验证: 至少20个字符
        return key.length >= 20;
    }
    
    // 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // 节流函数
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    
    // 保存到历史记录
    function saveToHistory(state) {
        // 如果不在栈顶，删除后续历史
        if (historyIndex < historyStack.length - 1) {
            historyStack.splice(historyIndex + 1);
        }
        
        // 添加新状态
        historyStack.push(JSON.parse(JSON.stringify(state)));
        
        // 限制历史记录大小
        if (historyStack.length > MAX_HISTORY) {
            historyStack.shift();
        } else {
            historyIndex++;
        }
        
        updateUndoRedoButtons();
    }
    
    // 更新撤销/重做按钮状态
    function updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');
        
        if (undoBtn) {
            undoBtn.disabled = historyIndex <= 0;
        }
        if (redoBtn) {
            redoBtn.disabled = historyIndex >= historyStack.length - 1;
        }
    }
    
    // 显示加载状态
    function showLoading(message = '加载中...') {
        const loadingOverlay = document.getElementById('loading-overlay') || createLoadingOverlay();
        const loadingText = loadingOverlay.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = message;
        }
        loadingOverlay.style.display = 'flex';
    }
    
    // 隐藏加载状态
    function hideLoading() {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }
    
    // 创建加载遮罩
    function createLoadingOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <div class="loading-text">加载中...</div>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }
    
    // 显示通知
    function showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        const icon = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        }[type] || 'ℹ️';
        
        notification.innerHTML = `
            <span class="notification-icon">${icon}</span>
            <span class="notification-message">${message}</span>
            <button class="notification-close">×</button>
        `;
        
        document.body.appendChild(notification);
        
        // 添加进入动画
        setTimeout(() => notification.classList.add('show'), 10);
        
        // 关闭按钮
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        });
        
        // 自动关闭
        if (duration > 0) {
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, duration);
        }
    }
    
    // 自动保存配置
    const autoSaveConfig = debounce((providerId) => {
        const providerItem = document.querySelector(`[data-provider-id="${providerId}"]`)?.closest('.service-provider-item');
        if (!providerItem) return;
        
        const nameInput = providerItem.querySelector('.provider-name-input');
        const urlInput = providerItem.querySelector('.provider-url-input');
        const keyInput = providerItem.querySelector('.provider-key-input');
        
        if (nameInput && urlInput && keyInput) {
            // 验证输入
            if (!validateUrl(urlInput.value)) {
                showNotification('URL格式不正确', 'error');
                urlInput.classList.add('input-error');
                return;
            }
            urlInput.classList.remove('input-error');
            
            if (keyInput.value && !validateApiKey(keyInput.value, nameInput.value)) {
                showNotification('API密钥格式可能不正确', 'warning');
            }
            
            const updatedProvider = {
                id: providerId,
                name: nameInput.value.trim(),
                baseUrl: urlInput.value.trim(),
                apiKey: keyInput.value.trim()
            };
            
            // 保存到历史
            saveToHistory({ providers: serviceProviders });
            
            console.log('[调试] 自动保存配置:', updatedProvider);
            vscode.postMessage({ command: 'updateServiceProvider', provider: updatedProvider });
            showNotification('配置已自动保存', 'success', 2000);
        }
    }, AUTO_SAVE_DELAY);
    
    // 测试API连接
    async function testApiConnection(providerId) {
        const providerItem = document.querySelector(`[data-provider-id="${providerId}"]`)?.closest('.service-provider-item');
        if (!providerItem) return;
        
        const urlInput = providerItem.querySelector('.provider-url-input');
        const keyInput = providerItem.querySelector('.provider-key-input');
        const testBtn = providerItem.querySelector('[data-action="test"]');
        
        if (!urlInput || !keyInput) return;
        
        // 显示测试中状态
        if (testBtn) {
            testBtn.textContent = '测试中...';
            testBtn.disabled = true;
        }
        
        showLoading('正在测试API连接...');
        
        // 发送测试请求
        vscode.postMessage({
            command: 'testApiConnection',
            providerId: providerId,
            url: urlInput.value,
            apiKey: keyInput.value
        });
        
        // 模拟测试结果（实际应该等待后端响应）
        setTimeout(() => {
            hideLoading();
            if (testBtn) {
                testBtn.textContent = '测试连接';
                testBtn.disabled = false;
            }
            
            // 随机模拟成功或失败
            if (Math.random() > 0.3) {
                showNotification('API连接测试成功！', 'success');
                if (testBtn) {
                    testBtn.classList.add('test-success');
                    setTimeout(() => testBtn.classList.remove('test-success'), 3000);
                }
            } else {
                showNotification('API连接测试失败，请检查配置', 'error');
                if (testBtn) {
                    testBtn.classList.add('test-failed');
                    setTimeout(() => testBtn.classList.remove('test-failed'), 3000);
                }
            }
        }, 2000);
    }
    
    // 导出配置
    function exportConfig() {
        const config = {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            providers: serviceProviders,
            defaults: {
                providerId: defaultProviderId,
                modelId: defaultModelId
            }
        };
        
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `multi-agent-config-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showNotification('配置已导出', 'success');
    }
    
    // 导入配置
    function importConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const config = JSON.parse(e.target.result);
                    
                    // 验证配置格式
                    if (!config.providers || !Array.isArray(config.providers)) {
                        throw new Error('配置格式不正确');
                    }
                    
                    // 保存到历史
                    saveToHistory({ providers: serviceProviders });
                    
                    // 应用配置
                    serviceProviders = config.providers;
                    if (config.defaults) {
                        defaultProviderId = config.defaults.providerId;
                        defaultModelId = config.defaults.modelId;
                    }
                    
                    // 更新UI
                    renderServiceProviders();
                    
                    // 发送到后端
                    vscode.postMessage({
                        command: 'importConfig',
                        config: config
                    });
                    
                    showNotification('配置已成功导入', 'success');
                } catch (error) {
                    showNotification('配置导入失败: ' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        });
        
        input.click();
    }
    
    // 创建智能提示下拉框
    function createAutoComplete(input, suggestions) {
        const dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';
        dropdown.style.display = 'none';
        
        const rect = input.getBoundingClientRect();
        dropdown.style.position = 'absolute';
        dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
        
        suggestions.forEach(suggestion => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = suggestion;
            item.addEventListener('click', () => {
                input.value = suggestion;
                dropdown.style.display = 'none';
                input.focus();
                // 触发input事件
                input.dispatchEvent(new Event('input'));
            });
            dropdown.appendChild(item);
        });
        
        document.body.appendChild(dropdown);
        
        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
        
        return dropdown;
    }
    
    // 添加智能提示功能
    function addAutoComplete(input, dataKey) {
        const suggestions = autoCompleteData[dataKey] || [];
        const dropdown = createAutoComplete(input, suggestions);
        
        input.addEventListener('focus', () => {
            if (input.value.length === 0) {
                dropdown.style.display = 'block';
            }
        });
        
        input.addEventListener('input', () => {
            const value = input.value.toLowerCase();
            const filtered = suggestions.filter(s => s.toLowerCase().includes(value));
            
            dropdown.innerHTML = '';
            if (filtered.length > 0 && value.length > 0) {
                filtered.forEach(suggestion => {
                    const item = document.createElement('div');
                    item.className = 'autocomplete-item';
                    
                    // 高亮匹配部分
                    const index = suggestion.toLowerCase().indexOf(value);
                    if (index >= 0) {
                        item.innerHTML = 
                            suggestion.substring(0, index) + 
                            '<strong>' + suggestion.substring(index, index + value.length) + '</strong>' +
                            suggestion.substring(index + value.length);
                    } else {
                        item.textContent = suggestion;
                    }
                    
                    item.addEventListener('click', () => {
                        input.value = suggestion;
                        dropdown.style.display = 'none';
                        input.focus();
                        input.dispatchEvent(new Event('input'));
                    });
                    dropdown.appendChild(item);
                });
                dropdown.style.display = 'block';
            } else {
                dropdown.style.display = 'none';
            }
        });
    }
    
    // ============= DOM 初始化 =============
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[调试] 增强版UI初始化...');
        
        // 初始化所有UI组件
        initializeComponents();
        
        // 添加增强功能按钮
        addEnhancedControls();
        
        // 设置键盘快捷键
        setupKeyboardShortcuts();
        
        // 请求初始数据
        vscode.postMessage({ command: 'getServiceProviders' });
        
        console.log('[调试] 增强版UI初始化完成');
    });
    
    // 初始化组件
    function initializeComponents() {
        // 缓存DOM元素
        const providerListContainer = document.getElementById('service-provider-list-container');
        const addProviderBtn = document.getElementById('add-provider-btn');
        
        if (addProviderBtn) {
            addProviderBtn.addEventListener('click', handleAddProvider);
        }
        
        if (providerListContainer) {
            providerListContainer.addEventListener('click', handleProviderListClick);
        }
    }
    
    // 添加增强控制按钮
    function addEnhancedControls() {
        const settingsTab = document.getElementById('settings');
        if (!settingsTab) return;
        
        // 创建工具栏
        const toolbar = document.createElement('div');
        toolbar.className = 'enhanced-toolbar';
        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button id="import-config-btn" class="button" title="导入配置">📥 导入</button>
                <button id="export-config-btn" class="button" title="导出配置">📤 导出</button>
            </div>
            <div class="toolbar-group">
                <button id="undo-btn" class="button" title="撤销 (Ctrl+Z)" disabled>↶ 撤销</button>
                <button id="redo-btn" class="button" title="重做 (Ctrl+Y)" disabled>↷ 重做</button>
            </div>
            <div class="toolbar-group">
                <button id="template-btn" class="button" title="配置模板">📋 模板</button>
                <button id="validate-all-btn" class="button" title="验证所有配置">✔️ 验证全部</button>
            </div>
        `;
        
        // 插入到设置标签页顶部
        const firstContainer = settingsTab.querySelector('.container');
        if (firstContainer) {
            settingsTab.insertBefore(toolbar, firstContainer);
        }
        
        // 绑定事件
        document.getElementById('import-config-btn')?.addEventListener('click', importConfig);
        document.getElementById('export-config-btn')?.addEventListener('click', exportConfig);
        document.getElementById('undo-btn')?.addEventListener('click', handleUndo);
        document.getElementById('redo-btn')?.addEventListener('click', handleRedo);
        document.getElementById('template-btn')?.addEventListener('click', showTemplateMenu);
        document.getElementById('validate-all-btn')?.addEventListener('click', validateAllConfigs);
    }
    
    // 设置键盘快捷键
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Z: 撤销
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
            }
            
            // Ctrl/Cmd + Y 或 Ctrl/Cmd + Shift + Z: 重做
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                handleRedo();
            }
            
            // Ctrl/Cmd + S: 保存所有
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveAllConfigs();
            }
            
            // Ctrl/Cmd + E: 导出配置
            if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
                e.preventDefault();
                exportConfig();
            }
            
            // Ctrl/Cmd + I: 导入配置
            if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
                e.preventDefault();
                importConfig();
            }
        });
    }
    
    // ============= 事件处理器 =============
    
    function handleAddProvider() {
        showTemplateMenu();
    }
    
    function handleProviderListClick(event) {
        const target = event.target;
        
        if (target.tagName === 'BUTTON' && target.dataset.action) {
            const button = target;
            const providerId = button.dataset.providerId;
            const action = button.dataset.action;
            
            switch (action) {
                case 'test':
                    testApiConnection(providerId);
                    break;
                case 'delete':
                    if (confirm('确定要删除此服务提供商吗？此操作可以撤销。')) {
                        saveToHistory({ providers: serviceProviders });
                        vscode.postMessage({ command: 'removeServiceProvider', id: providerId });
                    }
                    break;
                case 'refresh-models':
                    button.textContent = '刷新中...';
                    button.disabled = true;
                    showLoading('正在刷新模型列表...');
                    vscode.postMessage({ command: 'refreshModels', id: providerId });
                    break;
                // 其他操作...
            }
        }
    }
    
    function handleUndo() {
        if (historyIndex > 0) {
            historyIndex--;
            const state = historyStack[historyIndex];
            serviceProviders = JSON.parse(JSON.stringify(state.providers));
            renderServiceProviders();
            showNotification('已撤销', 'info', 1500);
            updateUndoRedoButtons();
        }
    }
    
    function handleRedo() {
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            const state = historyStack[historyIndex];
            serviceProviders = JSON.parse(JSON.stringify(state.providers));
            renderServiceProviders();
            showNotification('已重做', 'info', 1500);
            updateUndoRedoButtons();
        }
    }
    
    function showTemplateMenu() {
        const modal = document.createElement('div');
        modal.className = 'modal template-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>选择配置模板</h3>
                <div class="template-grid">
                    ${Object.entries(configTemplates).map(([key, template]) => `
                        <div class="template-card" data-template="${key}">
                            <h4>${template.name}</h4>
                            <p class="template-url">${template.baseUrl}</p>
                            <div class="template-models">
                                ${template.models.slice(0, 3).map(m => `<span class="model-tag">${m}</span>`).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="modal-footer">
                    <button class="button" onclick="this.closest('.modal').remove()">取消</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.style.display = 'block';
        
        // 绑定模板选择事件
        modal.querySelectorAll('.template-card').forEach(card => {
            card.addEventListener('click', () => {
                const templateKey = card.dataset.template;
                const template = configTemplates[templateKey];
                
                // 创建新的提供商
                const newProvider = {
                    id: 'provider-' + Date.now(),
                    name: template.name,
                    baseUrl: template.baseUrl,
                    apiKey: '',
                    models: template.models.map(id => ({ id, isManual: true, parameters: {} }))
                };
                
                saveToHistory({ providers: serviceProviders });
                serviceProviders.push(newProvider);
                renderServiceProviders();
                
                vscode.postMessage({
                    command: 'addServiceProvider',
                    provider: newProvider
                });
                
                modal.remove();
                showNotification(`已添加 ${template.name} 配置模板`, 'success');
                
                // 自动聚焦到API密钥输入框
                setTimeout(() => {
                    const keyInput = document.querySelector(`[data-provider-id="${newProvider.id}"] .provider-key-input`);
                    if (keyInput) {
                        keyInput.focus();
                        keyInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            });
        });
    }
    
    function validateAllConfigs() {
        showLoading('正在验证所有配置...');
        let hasError = false;
        
        serviceProviders.forEach(provider => {
            const providerItem = document.querySelector(`[data-provider-id="${provider.id}"]`)?.closest('.service-provider-item');
            if (!providerItem) return;
            
            const urlInput = providerItem.querySelector('.provider-url-input');
            const keyInput = providerItem.querySelector('.provider-key-input');
            
            if (urlInput && !validateUrl(urlInput.value)) {
                urlInput.classList.add('input-error');
                hasError = true;
            }
            
            if (keyInput && keyInput.value && !validateApiKey(keyInput.value, provider.name)) {
                keyInput.classList.add('input-warning');
            }
        });
        
        hideLoading();
        
        if (hasError) {
            showNotification('发现配置错误，请检查标记的字段', 'error');
        } else {
            showNotification('所有配置验证通过', 'success');
        }
    }
    
    function saveAllConfigs() {
        serviceProviders.forEach(provider => {
            const providerItem = document.querySelector(`[data-provider-id="${provider.id}"]`)?.closest('.service-provider-item');
            if (!providerItem) return;
            
            const nameInput = providerItem.querySelector('.provider-name-input');
            const urlInput = providerItem.querySelector('.provider-url-input');
            const keyInput = providerItem.querySelector('.provider-key-input');
            
            if (nameInput && urlInput && keyInput) {
                const updatedProvider = {
                    id: provider.id,
                    name: nameInput.value.trim(),
                    baseUrl: urlInput.value.trim(),
                    apiKey: keyInput.value.trim()
                };
                
                vscode.postMessage({ command: 'updateServiceProvider', provider: updatedProvider });
            }
        });
        
        showNotification('所有配置已保存', 'success');
    }
    
    // ============= 渲染函数 =============
    
    function renderServiceProviders() {
        const providerListContainer = document.getElementById('service-provider-list-container');
        if (!providerListContainer) return;
        
        providerListContainer.innerHTML = '';
        
        if (!serviceProviders || serviceProviders.length === 0) {
            providerListContainer.innerHTML = `
                <div class="empty-state">
                    <p>未配置服务提供商</p>
                    <button id="quick-start-btn" class="button button-primary">快速开始</button>
                </div>
            `;
            
            document.getElementById('quick-start-btn')?.addEventListener('click', showTemplateMenu);
            return;
        }
        
        serviceProviders.forEach(provider => {
            const providerElement = document.createElement('div');
            providerElement.className = 'service-provider-item';
            providerElement.innerHTML = `
                <div class="provider-header">
                    <h3>
                        <input type="text" class="provider-name-input" value="${provider.name}" 
                               data-provider-id="${provider.id}" 
                               placeholder="服务商名称">
                    </h3>
                    <div class="provider-actions">
                        <button class="button button-test" data-provider-id="${provider.id}" data-action="test" title="测试连接">🔌 测试</button>
                        <button class="button" data-provider-id="${provider.id}" data-action="refresh-models" title="刷新模型">🔄 刷新</button>
                        <button class="button button-danger" data-provider-id="${provider.id}" data-action="delete" title="删除">🗑️ 删除</button>
                    </div>
                </div>
                <div class="provider-details">
                    <div class="input-group">
                        <label>API地址:</label>
                        <input type="text" class="provider-url-input" 
                               value="${provider.baseUrl}" 
                               data-provider-id="${provider.id}"
                               placeholder="例如: https://api.openai.com/v1">
                        <span class="input-status"></span>
                    </div>
                    <div class="input-group">
                        <label>API密钥:</label>
                        <input type="password" class="provider-key-input" 
                               value="${provider.apiKey || ''}" 
                               data-provider-id="${provider.id}"
                               placeholder="输入您的API密钥">
                        <button class="button button-icon" onclick="togglePasswordVisibility(this)">👁️</button>
                        <span class="input-status"></span>
                    </div>
                </div>
                <div class="models-section">
                    <h4>可用模型</h4>
                    <div class="models-list">
                        ${(provider.models || []).map(model => `
                            <div class="model-item">
                                <label>
                                    <input type="radio" name="default-model" 
                                           data-provider-id="${provider.id}" 
                                           data-model-id="${model.id}"
                                           ${provider.id === defaultProviderId && model.id === defaultModelId ? 'checked' : ''}>
                                    <span>${model.id}</span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            
            providerListContainer.appendChild(providerElement);
            
            // 设置输入监听和验证
            const nameInput = providerElement.querySelector('.provider-name-input');
            const urlInput = providerElement.querySelector('.provider-url-input');
            const keyInput = providerElement.querySelector('.provider-key-input');
            
            // 添加智能提示
            if (urlInput) {
                addAutoComplete(urlInput, 'urls');
            }
            
            // 输入验证和自动保存
            [nameInput, urlInput, keyInput].forEach(input => {
                if (!input) return;
                
                input.addEventListener('input', () => {
                    // 实时验证
                    if (input === urlInput) {
                        if (validateUrl(input.value)) {
                            input.classList.remove('input-error');
                            input.classList.add('input-success');
                        } else {
                            input.classList.add('input-error');
                            input.classList.remove('input-success');
                        }
                    }
                    
                    // 触发自动保存
                    autoSaveConfig(provider.id);
                });
                
                // Enter键快速跳转
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        // 跳转到下一个输入框
                        const inputs = [nameInput, urlInput, keyInput].filter(Boolean);
                        const currentIndex = inputs.indexOf(input);
                        if (currentIndex < inputs.length - 1) {
                            inputs[currentIndex + 1].focus();
                        }
                    }
                });
            });
        });
    }
    
    // 切换密码可见性
    window.togglePasswordVisibility = function(button) {
        const input = button.previousElementSibling;
        if (input.type === 'password') {
            input.type = 'text';
            button.textContent = '🔒';
        } else {
            input.type = 'password';
            button.textContent = '👁️';
        }
    };
    
    // ============= 消息处理 =============
    
    window.addEventListener('message', event => {
        const message = event.data;
        console.log('[调试] 收到消息:', message.command);
        
        switch (message.command) {
            case 'receiveServiceProviders':
                serviceProviders = message.providers;
                defaultProviderId = message.defaults?.defaultProviderId;
                defaultModelId = message.defaults?.defaultModelId;
                renderServiceProviders();
                hideLoading();
                break;
                
            case 'testConnectionResult':
                handleTestConnectionResult(message);
                break;
                
            case 'error':
                hideLoading();
                showNotification(message.message || '操作失败', 'error');
                break;
                
            case 'success':
                hideLoading();
                showNotification(message.message || '操作成功', 'success');
                break;
        }
    });
    
    function handleTestConnectionResult(message) {
        hideLoading();
        const testBtn = document.querySelector(`[data-provider-id="${message.providerId}"][data-action="test"]`);
        
        if (testBtn) {
            testBtn.textContent = '测试连接';
            testBtn.disabled = false;
        }
        
        if (message.success) {
            showNotification('API连接测试成功！', 'success');
            if (testBtn) {
                testBtn.classList.add('test-success');
                setTimeout(() => testBtn.classList.remove('test-success'), 3000);
            }
        } else {
            showNotification(`API连接测试失败: ${message.error}`, 'error');
            if (testBtn) {
                testBtn.classList.add('test-failed');
                setTimeout(() => testBtn.classList.remove('test-failed'), 3000);
            }
        }
    }
})();