const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { ServiceManager } = require('../services/serviceManager');

/**
 * Manages the lifecycle of the Multi-Agent Helper webview panel.
 */
class MainPanel {
    /** @type {MainPanel | undefined} */
    static currentPanel = undefined;
    static viewType = 'multiAgentStatus';

    /**
     * @param {import('vscode').ExtensionContext} context
     * @param {import('events').EventEmitter} eventEmitter
     */
    static createOrShow(context, eventEmitter) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (MainPanel.currentPanel) {
            MainPanel.currentPanel.panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            MainPanel.viewType,
            'Multi-Agent Status',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'dist', 'assets'))]
            }
        );

        // Add the panel to the extension's subscriptions for automatic disposal
        context.subscriptions.push(panel);

        MainPanel.currentPanel = new MainPanel(panel, context.extensionPath, eventEmitter);
    }

    /**
     * @param {any} message
     */
    static update(message) {
        if (MainPanel.currentPanel) {
            MainPanel.currentPanel.panel.webview.postMessage(message);
        }
    }

    /**
     * @param {vscode.WebviewPanel} panel
     * @param {string} extensionPath
     * @param {import('events').EventEmitter} eventEmitter
     */
    constructor(panel, extensionPath, eventEmitter) {
        this.panel = panel;
        this.extensionPath = extensionPath;
        this.eventEmitter = eventEmitter;
        /** @type {vscode.Disposable[]} */
        this.disposables = [];
        /** @type {ServiceManager} */
        this.serviceManager = new ServiceManager();
        this.serviceManager.init().catch(error => {
            console.error('Failed to initialize ServiceManager:', error);
            vscode.window.showErrorMessage('Failed to load API service configuration.');
        });

        this.panel.webview.html = this._getHtmlForWebview();

        this.disposables.push(this.panel.webview.onDidReceiveMessage(
            async (/** @type {any} */ message) => {
                switch (message.command) {
                    // Service Provider Management
                    case 'getServiceProviders':
                        this.sendServiceProviders();
                        return;
                    case 'addServiceProvider':
                        await this.addServiceProvider(message.provider);
                        return;
                    case 'updateServiceProvider':
                        await this.updateServiceProvider(message.provider);
                        return;
                    case 'removeServiceProvider':
                        await this.removeServiceProvider(message.id);
                        return;
                    
                    // Model Management
                    case 'refreshModels':
                        await this.refreshModels(message.id);
                        return;
                    case 'addModel':
                        await this.serviceManager.addModel(message.providerId, message.modelId, true);
                        this.sendServiceProviders();
                        return;
                    case 'setDefault':
                        await this.serviceManager.setDefault(message.providerId, message.modelId);
                        return;

                    // Model Parameter Management
                    case 'getModelParameters':
                        const params = await this.serviceManager.getModelParameters(message.providerId, message.modelId);
                        this.panel.webview.postMessage({ command: 'receiveModelParameters', params: params || {} });
                        return;
                    case 'saveModelParameters':
                        await this.serviceManager.saveModelParameters(message.providerId, message.modelId, message.params);
                        this.sendServiceProviders();
                        return;
                    case 'resetModelParameters':
                        await this.serviceManager.resetModelParameters(message.providerId, message.modelId);
                        this.sendServiceProviders();
                        return;

                    // Thinking Config
                    case 'getThinkingConfig':
                        this.sendThinkingConfigToWebview();
                        return;
                    case 'saveThinkingConfig':
                        await this.saveThinkingConfig(message.config);
                        return;

                    // Legacy & Task Management
                    case 'getSettings':
                        this.sendSettingsToWebview();
                        return;
                    case 'saveSettings':
                        await this.saveSettings(message.settings);
                        return;
                    case 'startTask':
                        this.eventEmitter.emit('startTask', message.text);
                        return;
                    case 'stopTask':
                        this.eventEmitter.emit('stopTask');
                        return;
                    case 'planApproved':
                        this.eventEmitter.emit('planApproved', message.plan);
                        return;
                    case 'cancelTask':
                        this.eventEmitter.emit('planCancelled');
                        return;
                    case 'showThinkingProcess':
                        this.eventEmitter.emit('showThinkingProcess');
                        return;
                    case 'runHealthCheck':
                        this.eventEmitter.emit('runHealthCheck');
                        return;
                    case 'getWorkspaceStatus':
                        this.eventEmitter.emit('getWorkspaceStatus');
                        return;
                }
            },
            null
        ));

        this.disposables.push(this.panel.onDidDispose(() => this.dispose(), null));
    }

    sendSettingsToWebview() {
        const { toolRegistry } = require('../tools/toolRegistry.js');
        const config = vscode.workspace.getConfiguration('multiAgent');
        this.panel.webview.postMessage({
            command: 'receiveSettings',
            settings: {
                models: config.get('models', []),
                roles: config.get('roles', []),
                enableSmartScan: config.get('enableSmartScan', false),
                enableParallelExec: config.get('enableParallelExec', false),
                enableAutoMode: config.get('enableAutoMode', false),
                enablePersistence: config.get('enablePersistence', false),
                enableThinkingChain: config.get('enableThinkingChain', true)
            },
            allTools: Object.keys(toolRegistry)
        });
    }

    /** @param {any} settings */
    async saveSettings(settings) {
        const config = vscode.workspace.getConfiguration('multiAgent');
        await config.update('models', settings.models, vscode.ConfigurationTarget.Workspace);
        await config.update('roleAssignments', settings.roleAssignments, vscode.ConfigurationTarget.Workspace);
        await config.update('enableSmartScan', settings.enableSmartScan, vscode.ConfigurationTarget.Workspace);
        await config.update('enableParallelExec', settings.enableParallelExec, vscode.ConfigurationTarget.Workspace);
        await config.update('enableAutoMode', settings.enableAutoMode, vscode.ConfigurationTarget.Workspace);
        await config.update('enablePersistence', settings.enablePersistence, vscode.ConfigurationTarget.Workspace);
        await config.update('enableThinkingChain', settings.enableThinkingChain, vscode.ConfigurationTarget.Workspace);
    }

    dispose() {
        this.eventEmitter.emit('planCancelled');
        MainPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) x.dispose();
        }
    }

    _getHtmlForWebview() {
        const assetsPath = path.join(this.extensionPath, 'dist', 'assets');
        const htmlPath = path.join(assetsPath, 'index.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        htmlContent = htmlContent.replace(/(href|src)="([^"]+)"/g, (match, p1, p2) => {
            const assetUri = vscode.Uri.file(path.join(assetsPath, p2));
            const webviewUri = this.panel.webview.asWebviewUri(assetUri);
            return `${p1}="${webviewUri}"`;
        });
        return htmlContent;
    }

    // Service Provider Methods
    sendServiceProviders() {
        const providers = this.serviceManager.getAllProviders();
        const defaults = this.serviceManager.getDefaults();
        this.panel.webview.postMessage({
            command: 'receiveServiceProviders',
            providers: providers,
            defaults: defaults
        });
    }

    /** @param {{ name: string; baseUrl: string; apiKey: string; }} provider */
    async addServiceProvider(provider) {
        await this.serviceManager.addProvider(provider.name, provider.baseUrl, provider.apiKey);
        this.sendServiceProviders();
    }

    /** @param {{ id: string; name: string; baseUrl: string; apiKey: string; }} provider */
    async updateServiceProvider(provider) {
        const { id, ...updates } = provider;
        await this.serviceManager.updateProvider(id, updates);
        this.sendServiceProviders();
    }

    /** @param {string} id */
    async removeServiceProvider(id) {
        await this.serviceManager.removeProvider(id);
        this.sendServiceProviders();
    }

    /** @param {string} id */
    async refreshModels(id) {
        try {
            await this.serviceManager.fetchModels(id);
            vscode.window.showInformationMessage('Successfully refreshed model list.');
        } catch (/** @type {any} */ error) {
            console.error('Failed to fetch models:', error);
            vscode.window.showErrorMessage(`Failed to refresh models: ${error.message}`);
        } finally {
            this.sendServiceProviders();
        }
    }

    // Thinking Config Methods
    sendThinkingConfigToWebview() {
        const config = vscode.workspace.getConfiguration('multiAgent.thinking');
        this.panel.webview.postMessage({
            command: 'receiveThinkingConfig',
            config: {
                preset: config.get('preset', 'default'),
                depth: config.get('depth'),
                iterate: config.get('iterate'),
                model: config.get('model'),
                focus: config.get('focus'),
                visualize: config.get('visualize', true),
                suggest: config.get('suggest', false),
                parallel: config.get('parallel', false),
                trace: config.get('trace', false),
                confidence: config.get('confidence', false),
                critique: config.get('critique', false),
            }
        });
    }

    /** @param {any} thinkingConfig */
    async saveThinkingConfig(thinkingConfig) {
        const config = vscode.workspace.getConfiguration('multiAgent.thinking');
        for (const key in thinkingConfig) {
            if (Object.hasOwnProperty.call(thinkingConfig, key)) {
                await config.update(key, thinkingConfig[key], vscode.ConfigurationTarget.Workspace);
            }
        }
        vscode.window.showInformationMessage('深度思考配置已保存。');
    }
}

module.exports = {
    MainPanel
};
