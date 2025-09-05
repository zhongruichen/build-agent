"use strict";
const vscode = require('vscode');
/**
 * Visual Mode Indicator for VS Code
 * Provides visual feedback for active interaction mode and capabilities
 */
class ModeIndicator {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {import('../../modes/InteractionModeManager').InteractionModeManager} modeManager
     */
    constructor(context, modeManager) {
        this.context = context;
        this.modeManager = modeManager;
        // Status bar items
        this.modeStatusBarItem = null;
        this.personaStatusBarItem = null;
        this.capabilityStatusBarItem = null;
        // Decoration types for editor
        this.decorationTypes = new Map();
        // Colors for different modes
        this.modeColors = {
            direct: '#4CAF50', // Green
            agent: '#2196F3', // Blue  
            hybrid: '#FF9800' // Orange
        };
        // Icons for different modes
        this.modeIcons = {
            direct: '$(comment-discussion)',
            agent: '$(organization)',
            hybrid: '$(layers)'
        };
        this.initialize();
    }
    /**
     * Initialize visual components
     */
    initialize() {
        // Create status bar items
        this.createStatusBarItems();
        // Create decoration types
        this.createDecorationTypes();
        // Register event listeners
        this.registerEventListeners();
        // Initial update
        this.updateIndicators();
    }
    /**
     * Create status bar items
     */
    createStatusBarItems() {
        // Mode indicator
        this.modeStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.modeStatusBarItem.command = 'multiAgent.showModeMenu';
        this.modeStatusBarItem.tooltip = 'Click to change interaction mode';
        this.modeStatusBarItem.show();
        // Persona indicator
        this.personaStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.personaStatusBarItem.command = 'multiAgent.showPersonaMenu';
        this.personaStatusBarItem.tooltip = 'Click to change persona';
        this.personaStatusBarItem.show();
        // Capability indicator
        this.capabilityStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
        this.capabilityStatusBarItem.command = 'multiAgent.showCapabilities';
        this.capabilityStatusBarItem.tooltip = 'View current capabilities';
        this.capabilityStatusBarItem.show();
        // Add to context subscriptions
        this.context.subscriptions.push(this.modeStatusBarItem, this.personaStatusBarItem, this.capabilityStatusBarItem);
    }
    /**
     * Create decoration types for editor
     */
    createDecorationTypes() {
        // Direct mode decoration
        this.decorationTypes.set('direct', vscode.window.createTextEditorDecorationType({
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: this.modeColors.direct,
            borderRadius: '3px',
            backgroundColor: `${this.modeColors.direct}20`
        }));
        // Agent mode decoration
        this.decorationTypes.set('agent', vscode.window.createTextEditorDecorationType({
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: this.modeColors.agent,
            borderRadius: '3px',
            backgroundColor: `${this.modeColors.agent}20`
        }));
        // Hybrid mode decoration
        this.decorationTypes.set('hybrid', vscode.window.createTextEditorDecorationType({
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: this.modeColors.hybrid,
            borderRadius: '3px',
            backgroundColor: `${this.modeColors.hybrid}20`
        }));
    }
    /**
     * Register event listeners
     */
    registerEventListeners() {
        // Mode change events
        this.modeManager.on('mode:transition:start', (/** @type {any} */ data) => {
            this.showTransitionAnimation(data);
        });
        this.modeManager.on('mode:transition:complete', (/** @type {any} */ data) => {
            this.updateIndicators();
            this.showModeChangeNotification(data);
        });
        this.modeManager.on('mode:suggestion', (/** @type {any} */ data) => {
            this.showModeSuggestion(data);
        });
        // Persona events
        this.modeManager.on('persona:activated', (/** @type {any} */ data) => {
            this.updatePersonaIndicator(data);
        });
        // Register commands
        this.registerCommands();
    }
    /**
     * Register VS Code commands
     */
    registerCommands() {
        // Show mode menu
        this.context.subscriptions.push(vscode.commands.registerCommand('multiAgent.showModeMenu', async () => {
            const modes = [
                {
                    label: '$(comment-discussion) Direct Conversation',
                    description: 'Streamlined model interaction',
                    mode: 'direct'
                },
                {
                    label: '$(organization) Agent-Enabled',
                    description: 'Full multi-agent framework',
                    mode: 'agent'
                },
                {
                    label: '$(layers) Hybrid Mode',
                    description: 'Intelligent mode selection',
                    mode: 'hybrid'
                }
            ];
            const selected = await vscode.window.showQuickPick(modes, {
                placeHolder: 'Select interaction mode'
            });
            if (selected) {
                await this.modeManager.switchMode(selected.mode);
            }
        }));
        // Show persona menu
        this.context.subscriptions.push(vscode.commands.registerCommand('multiAgent.showPersonaMenu', async () => {
            const personas = Array.from(this.modeManager.personas.entries()).map(([name, persona]) => ({
                label: `$(person) ${name}`,
                description: persona.description,
                name
            }));
            // Add create new option
            personas.push({
                label: '$(add) Create New Persona',
                description: 'Create a custom persona',
                name: '__create_new__'
            });
            const selected = await vscode.window.showQuickPick(personas, {
                placeHolder: 'Select or create persona'
            });
            if (selected) {
                if (selected.name === '__create_new__') {
                    await this.createNewPersona();
                }
                else {
                    await this.modeManager.activatePersona(selected.name);
                }
            }
        }));
        // Show capabilities
        this.context.subscriptions.push(vscode.commands.registerCommand('multiAgent.showCapabilities', () => {
            this.showCapabilitiesPanel();
        }));
        // Quick mode switch commands
        this.context.subscriptions.push(vscode.commands.registerCommand('multiAgent.switchToDirect', () => {
            this.modeManager.switchMode('direct');
        }), vscode.commands.registerCommand('multiAgent.switchToAgent', () => {
            this.modeManager.switchMode('agent');
        }), vscode.commands.registerCommand('multiAgent.switchToHybrid', () => {
            this.modeManager.switchMode('hybrid');
        }));
    }
    /**
     * Update all indicators
     */
    updateIndicators() {
        const currentMode = this.modeManager.currentMode;
        const capabilities = this.modeManager.getCurrentCapabilities();
        const activePersona = this.modeManager.activePersona;
        // Update mode indicator
        const modeConfig = this.modeManager.modeConfigurations.get(currentMode);
        // @ts-ignore
        const modeIcon = this.modeIcons[currentMode] || '$(question)';
        const modeName = modeConfig?.name || currentMode;
        if (this.modeStatusBarItem) {
            this.modeStatusBarItem.text = `${modeIcon} ${modeName}`;
            this.modeStatusBarItem.backgroundColor = new vscode.ThemeColor(this.getStatusBarColor(currentMode));
        }
        // Update persona indicator
        if (activePersona) {
            const persona = this.modeManager.personas.get(activePersona);
            if (this.personaStatusBarItem) {
                this.personaStatusBarItem.text = `$(person) ${activePersona}`;
                this.personaStatusBarItem.show();
            }
        }
        else {
            if (this.personaStatusBarItem) {
                this.personaStatusBarItem.hide();
            }
        }
        // Update capability indicator
        const capabilityIcons = [];
        if (capabilities.tools)
            capabilityIcons.push('$(tools)');
        if (capabilities.agents)
            capabilityIcons.push('$(organization)');
        if (capabilities.workflows)
            capabilityIcons.push('$(git-merge)');
        if (capabilities.streaming)
            capabilityIcons.push('$(broadcast)');
        if (this.capabilityStatusBarItem) {
            this.capabilityStatusBarItem.text = capabilityIcons.join(' ');
        }
        // Update editor decorations
        this.updateEditorDecorations(currentMode);
    }
    /**
     * Update editor decorations
     */
    /**
     * @param {string} mode
     */
    updateEditorDecorations(mode) {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor)
            return;
        // Clear all decorations
        for (const [, decoration] of this.decorationTypes) {
            activeEditor.setDecorations(decoration, []);
        }
        // Apply current mode decoration (optional - can be used for specific highlights)
        // const decoration = this.decorationTypes.get(mode);
        // if (decoration) {
        //     activeEditor.setDecorations(decoration, [/* ranges to highlight */]);
        // }
    }
    /**
     * Show transition animation
     */
    /**
     * @param {{ to: any; }} data
     */
    showTransitionAnimation(data) {
        // Update status bar with transition state
        if (this.modeStatusBarItem) {
            this.modeStatusBarItem.text = `$(sync~spin) Switching to ${data.to}...`;
        }
    }
    /**
     * Show mode change notification
     */
    /**
     * @param {{ to: any; }} data
     */
    showModeChangeNotification(data) {
        const modeConfig = this.modeManager.modeConfigurations.get(data.to);
        const modeName = modeConfig?.name || data.to;
        vscode.window.showInformationMessage(`Switched to ${modeName} mode`, { modal: false });
    }
    /**
     * Show mode suggestion
     */
    /**
     * @param {{ suggested: string; reason: string; }} data
     */
    async showModeSuggestion(data) {
        const modeConfig = this.modeManager.modeConfigurations.get(data.suggested);
        const modeName = modeConfig?.name || data.suggested;
        const action = await vscode.window.showInformationMessage(`${data.reason}. Switch to ${modeName} mode?`, 'Yes', 'No', 'Always Auto-Switch');
        if (action === 'Yes') {
            await this.modeManager.switchMode(data.suggested);
        }
        else if (action === 'Always Auto-Switch') {
            // Enable auto-switch in settings
            const config = vscode.workspace.getConfiguration('multiAgent');
            await config.update('autoSwitchMode', true, true);
            await this.modeManager.switchMode(data.suggested);
        }
    }
    /**
     * Update persona indicator
     */
    /**
     * @param {{ current: string; }} data
     */
    updatePersonaIndicator(data) {
        if (this.personaStatusBarItem) {
            if (data.current) {
                const persona = this.modeManager.personas.get(data.current);
                this.personaStatusBarItem.text = `$(person) ${data.current}`;
                this.personaStatusBarItem.tooltip = persona?.description || 'Active persona';
                this.personaStatusBarItem.show();
                vscode.window.showInformationMessage(`Activated persona: ${data.current}`, { modal: false });
            }
            else {
                this.personaStatusBarItem.hide();
            }
        }
    }
    /**
     * Create new persona
     */
    async createNewPersona() {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter persona name',
            placeHolder: 'e.g., Technical Expert'
        });
        if (!name)
            return;
        const description = await vscode.window.showInputBox({
            prompt: 'Enter persona description',
            placeHolder: 'e.g., Specialized in technical documentation'
        });
        const responseStyle = await vscode.window.showQuickPick([
            'Professional',
            'Casual',
            'Technical',
            'Educational',
            'Creative'
        ], {
            placeHolder: 'Select response style'
        });
        const systemInstructions = await vscode.window.showInputBox({
            prompt: 'Enter system instructions (optional)',
            placeHolder: 'Custom instructions for this persona'
        });
        await this.modeManager.createPersona(name, {
            description,
            responseStyle: responseStyle?.toLowerCase(),
            systemInstructions
        });
        await this.modeManager.activatePersona(name);
        vscode.window.showInformationMessage(`Created and activated persona: ${name}`, { modal: false });
    }
    /**
     * Show capabilities panel
     */
    showCapabilitiesPanel() {
        const panel = vscode.window.createWebviewPanel('capabilities', 'Current Capabilities', vscode.ViewColumn.Two, {
            enableScripts: true
        });
        const capabilities = this.modeManager.getCurrentCapabilities();
        const mode = this.modeManager.currentMode;
        const persona = this.modeManager.activePersona;
        const metrics = this.modeManager.getMetrics();
        panel.webview.html = this.getCapabilitiesHtml(mode, capabilities, persona, metrics);
    }
    /**
     * Get capabilities HTML
     */
    /**
     * @param {string} mode
     * @param {any} capabilities
     * @param {any} persona
     * @param {any} metrics
     */
    getCapabilitiesHtml(mode, capabilities, persona, metrics) {
        // @ts-ignore
        const modeColor = this.modeColors[mode] || '#666';
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        padding: 20px;
                        color: var(--vscode-foreground);
                        background: var(--vscode-editor-background);
                    }
                    h1 {
                        color: var(--vscode-foreground);
                        border-bottom: 2px solid var(--vscode-panel-border);
                        padding-bottom: 10px;
                    }
                    .section {
                        margin: 20px 0;
                        padding: 15px;
                        background: var(--vscode-input-background);
                        border-radius: 5px;
                    }
                    .capability {
                        display: flex;
                        align-items: center;
                        margin: 10px 0;
                    }
                    .capability-icon {
                        width: 20px;
                        height: 20px;
                        margin-right: 10px;
                        border-radius: 50%;
                    }
                    .enabled {
                        background: #4CAF50;
                    }
                    .disabled {
                        background: #666;
                    }
                    .selective {
                        background: #FF9800;
                    }
                    .metric {
                        display: flex;
                        justify-content: space-between;
                        margin: 5px 0;
                    }
                    .mode-badge {
                        display: inline-block;
                        padding: 5px 10px;
                        border-radius: 3px;
                        background: ${modeColor};
                        color: white;
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <h1>Multi-Agent Assistant Status</h1>
                
                <div class="section">
                    <h2>Current Mode</h2>
                    <span class="mode-badge">${mode.toUpperCase()}</span>
                    ${persona ? `<p>Active Persona: <strong>${persona}</strong></p>` : ''}
                </div>
                
                <div class="section">
                    <h2>Capabilities</h2>
                    <div class="capability">
                        <div class="capability-icon ${capabilities.tools ? 'enabled' : 'disabled'}"></div>
                        <span>Tools: ${capabilities.tools ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <div class="capability">
                        <div class="capability-icon ${capabilities.agents === true ? 'enabled' :
            capabilities.agents === 'selective' ? 'selective' :
                'disabled'}"></div>
                        <span>Agents: ${capabilities.agents === true ? 'Fully Enabled' :
            capabilities.agents === 'selective' ? 'Selective' :
                'Disabled'}</span>
                    </div>
                    <div class="capability">
                        <div class="capability-icon ${capabilities.workflows ? 'enabled' : 'disabled'}"></div>
                        <span>Workflows: ${capabilities.workflows ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <div class="capability">
                        <div class="capability-icon ${capabilities.streaming ? 'enabled' : 'disabled'}"></div>
                        <span>Streaming: ${capabilities.streaming ? 'Enabled' : 'Disabled'}</span>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Usage Metrics</h2>
                    <div class="metric">
                        <span>Total Interactions:</span>
                        <strong>${metrics.totalInteractions}</strong>
                    </div>
                    <div class="metric">
                        <span>Mode Changes:</span>
                        <strong>${metrics.modeChanges}</strong>
                    </div>
                    <div class="metric">
                        <span>Average Response Time:</span>
                        <strong>${metrics.averageResponseTime.toFixed(2)}ms</strong>
                    </div>
                    <div class="metric">
                        <span>Context Size:</span>
                        <strong>${metrics.contextSize} items</strong>
                    </div>
                </div>
                
                <div class="section">
                    <h2>Mode Usage</h2>
                    <div class="metric">
                        <span>Direct:</span>
                        <strong>${metrics.modeUsage.direct || 0}</strong>
                    </div>
                    <div class="metric">
                        <span>Agent-Enabled:</span>
                        <strong>${metrics.modeUsage.agent || 0}</strong>
                    </div>
                    <div class="metric">
                        <span>Hybrid:</span>
                        <strong>${metrics.modeUsage.hybrid || 0}</strong>
                    </div>
                </div>
            </body>
            </html>
        `;
    }
    /**
     * Get status bar color for mode
     */
    /**
     * @param {string} mode
     */
    getStatusBarColor(mode) {
        const colors = {
            direct: 'statusBarItem.prominentBackground',
            agent: 'statusBarItem.warningBackground',
            hybrid: 'statusBarItem.errorBackground'
        };
        // @ts-ignore
        return colors[mode] || 'statusBarItem.background';
    }
    /**
     * Dispose resources
     */
    dispose() {
        // Dispose status bar items
        this.modeStatusBarItem?.dispose();
        this.personaStatusBarItem?.dispose();
        this.capabilityStatusBarItem?.dispose();
        // Dispose decoration types
        for (const [, decoration] of this.decorationTypes) {
            decoration.dispose();
        }
    }
}
module.exports = { ModeIndicator };
//# sourceMappingURL=ModeIndicator.js.map