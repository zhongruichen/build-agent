const fs = require('fs').promises;
const path = require('path');
const vscode = require('vscode');
const { WorkflowVisualManager } = require('./WorkflowVisualManager');
const { ToolOrchestrationEngine } = require('../mcp/orchestration/ToolOrchestrationEngine');

/**
 * 工作流服务
 * 管理工作流的存储、加载和执行
 */
class WorkflowService {
    constructor(context) {
        this.context = context;
        this.visualManager = new WorkflowVisualManager();
        this.orchestrationEngine = new ToolOrchestrationEngine();
        
        // 工作流存储路径
        this.workflowPath = path.join(context.globalStorageUri.fsPath, 'workflows');
        this.templatesPath = path.join(context.extensionPath, 'workflows', 'templates');
        
        // 初始化
        this.initialize();
    }
    
    /**
     * 初始化服务
     */
    async initialize() {
        // 确保工作流目录存在
        try {
            await fs.mkdir(this.workflowPath, { recursive: true });
        } catch (error) {
            console.error('Failed to create workflow directory:', error);
        }
        
        // 注册默认模板
        this.registerDefaultTemplates();
        
        // 注册工具到编排引擎
        this.registerTools();
    }
    
    /**
     * 注册默认工作流模板
     */
    registerDefaultTemplates() {
        // 文件处理工作流模板
        this.visualManager.registerTemplate('file-processor', {
            name: '文件处理工作流',
            description: '批量处理文件的工作流模板',
            version: '1.0.0',
            stages: [
                {
                    tool: 'list_files',
                    params: { path: '.', pattern: '*.txt' },
                    output: 'fileList'
                },
                {
                    loop: {
                        forEach: '$fileList',
                        itemVar: 'file',
                        do: [
                            {
                                tool: 'read_file',
                                params: { path: '$file' },
                                output: 'content'
                            },
                            {
                                transform: {
                                    type: 'custom',
                                    input: '$content',
                                    function: 'return input.toUpperCase();'
                                }
                            },
                            {
                                tool: 'write_file',
                                params: { 
                                    path: '$file.replace(".txt", "_processed.txt")',
                                    content: '$content'
                                }
                            }
                        ]
                    }
                }
            ]
        });
        
        // Git工作流模板
        this.visualManager.registerTemplate('git-workflow', {
            name: 'Git操作工作流',
            description: '自动化Git操作的工作流模板',
            version: '1.0.0',
            stages: [
                {
                    tool: 'git_status',
                    output: 'status'
                },
                {
                    conditional: {
                        if: '$status.modified.length > 0',
                        then: [
                            {
                                tool: 'git_add',
                                params: { files: '$status.modified' }
                            },
                            {
                                tool: 'git_commit',
                                params: { message: 'Auto commit: Updated files' }
                            }
                        ]
                    }
                },
                {
                    tool: 'git_push',
                    params: { branch: 'main' }
                }
            ]
        });
        
        // 代码分析工作流模板
        this.visualManager.registerTemplate('code-analysis', {
            name: '代码分析工作流',
            description: '分析代码库的工作流模板',
            version: '1.0.0',
            stages: [
                {
                    parallel: [
                        {
                            tool: 'analyze_complexity',
                            params: { path: 'src' },
                            output: 'complexity'
                        },
                        {
                            tool: 'find_todos',
                            params: { path: 'src' },
                            output: 'todos'
                        },
                        {
                            tool: 'check_dependencies',
                            params: { file: 'package.json' },
                            output: 'dependencies'
                        }
                    ]
                },
                {
                    merge: {
                        type: 'object',
                        inputs: ['$complexity', '$todos', '$dependencies']
                    }
                },
                {
                    tool: 'generate_report',
                    params: { 
                        data: '$merged',
                        format: 'markdown'
                    }
                }
            ]
        });
        
        // 测试工作流模板
        this.visualManager.registerTemplate('test-runner', {
            name: '测试运行工作流',
            description: '运行测试并生成报告的工作流模板',
            version: '1.0.0',
            stages: [
                {
                    error_handler: {
                        try: [
                            {
                                tool: 'run_tests',
                                params: { suite: 'unit' },
                                output: 'unitResults'
                            },
                            {
                                tool: 'run_tests',
                                params: { suite: 'integration' },
                                output: 'integrationResults'
                            }
                        ],
                        catch: [
                            {
                                tool: 'notify',
                                params: { 
                                    message: 'Tests failed: $error',
                                    type: 'error'
                                }
                            }
                        ],
                        finally: [
                            {
                                tool: 'generate_test_report',
                                params: { 
                                    results: ['$unitResults', '$integrationResults']
                                }
                            }
                        ]
                    }
                }
            ]
        });
        
        // 部署工作流模板
        this.visualManager.registerTemplate('deployment', {
            name: '部署工作流',
            description: '自动化部署流程的工作流模板',
            version: '1.0.0',
            stages: [
                {
                    sequence: [
                        {
                            tool: 'build_project',
                            params: { env: 'production' },
                            output: 'buildArtifact'
                        },
                        {
                            tool: 'run_tests',
                            params: { suite: 'smoke' },
                            output: 'testResults'
                        },
                        {
                            conditional: {
                                if: '$testResults.passed === true',
                                then: [
                                    {
                                        tool: 'deploy',
                                        params: { 
                                            artifact: '$buildArtifact',
                                            target: 'production'
                                        }
                                    },
                                    {
                                        tool: 'notify',
                                        params: { 
                                            message: 'Deployment successful',
                                            type: 'success'
                                        }
                                    }
                                ],
                                else: [
                                    {
                                        tool: 'notify',
                                        params: { 
                                            message: 'Deployment cancelled: Tests failed',
                                            type: 'warning'
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        });
    }
    
    /**
     * 注册工具到编排引擎
     */
    registerTools() {
        const { toolRegistry } = require('../tools/toolRegistry');
        
        // 将工具注册到编排引擎
        for (const [name, tool] of Object.entries(toolRegistry)) {
            this.orchestrationEngine.toolRegistry.set(name, tool);
        }
    }
    
    /**
     * 保存工作流
     * @param {Object} workflow - 工作流对象
     * @returns {Promise<string>} 保存的文件路径
     */
    async saveWorkflow(workflow) {
        const fileName = `${workflow.name.replace(/[^a-z0-9]/gi, '_')}_${workflow.id}.json`;
        const filePath = path.join(this.workflowPath, fileName);
        
        try {
            await fs.writeFile(filePath, JSON.stringify(workflow, null, 2));
            return filePath;
        } catch (error) {
            throw new Error(`Failed to save workflow: ${error.message}`);
        }
    }
    
    /**
     * 加载工作流
     * @param {string} workflowId - 工作流ID
     * @returns {Promise<Object>} 工作流对象
     */
    async loadWorkflow(workflowId) {
        const files = await fs.readdir(this.workflowPath);
        const workflowFile = files.find(f => f.includes(workflowId));
        
        if (!workflowFile) {
            throw new Error(`Workflow not found: ${workflowId}`);
        }
        
        const filePath = path.join(this.workflowPath, workflowFile);
        const content = await fs.readFile(filePath, 'utf8');
        
        return JSON.parse(content);
    }
    
    /**
     * 列出所有工作流
     * @returns {Promise<Array>} 工作流列表
     */
    async listWorkflows() {
        try {
            const files = await fs.readdir(this.workflowPath);
            const workflows = [];
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.workflowPath, file);
                    const content = await fs.readFile(filePath, 'utf8');
                    const workflow = JSON.parse(content);
                    
                    workflows.push({
                        id: workflow.id,
                        name: workflow.name,
                        description: workflow.description,
                        createdAt: workflow.createdAt,
                        updatedAt: workflow.updatedAt
                    });
                }
            }
            
            return workflows;
        } catch (error) {
            console.error('Failed to list workflows:', error);
            return [];
        }
    }
    
    /**
     * 删除工作流
     * @param {string} workflowId - 工作流ID
     */
    async deleteWorkflow(workflowId) {
        const files = await fs.readdir(this.workflowPath);
        const workflowFile = files.find(f => f.includes(workflowId));
        
        if (workflowFile) {
            const filePath = path.join(this.workflowPath, workflowFile);
            await fs.unlink(filePath);
        }
    }
    
    /**
     * 导出工作流为YAML
     * @param {string} workflowId - 工作流ID
     * @returns {Promise<string>} YAML内容
     */
    async exportToYAML(workflowId) {
        const workflow = await this.loadWorkflow(workflowId);
        return this.visualManager.toYAML(workflow);
    }
    
    /**
     * 从YAML导入工作流
     * @param {string} yamlContent - YAML内容
     * @returns {Promise<Object>} 导入的工作流
     */
    async importFromYAML(yamlContent) {
        const workflow = this.visualManager.fromYAML(yamlContent);
        await this.saveWorkflow(workflow);
        return workflow;
    }
    
    /**
     * 执行工作流
     * @param {string} workflowId - 工作流ID
     * @param {Object} context - 执行上下文
     * @returns {Promise<Object>} 执行结果
     */
    async executeWorkflow(workflowId, context = {}) {
        const workflow = await this.loadWorkflow(workflowId);
        
        // 转换为YAML格式（编排引擎需要）
        const yamlContent = this.visualManager.toYAML(workflow);
        const parsedWorkflow = this.orchestrationEngine.parseWorkflow(yamlContent);
        
        // 执行工作流
        return await this.orchestrationEngine.executeWorkflow(parsedWorkflow, context);
    }
    
    /**
     * 验证工作流
     * @param {string} workflowId - 工作流ID
     * @returns {Promise<Object>} 验证结果
     */
    async validateWorkflow(workflowId) {
        const workflow = await this.loadWorkflow(workflowId);
        return this.visualManager.validateWorkflow(workflow);
    }
    
    /**
     * 获取工作流执行状态
     * @param {string} executionId - 执行ID
     * @returns {Object} 执行状态
     */
    getExecutionStatus(executionId) {
        return this.orchestrationEngine.getExecutionStatus(executionId);
    }
    
    /**
     * 获取工作流执行指标
     * @returns {Object} 执行指标
     */
    getMetrics() {
        return this.orchestrationEngine.getMetrics();
    }
    
    /**
     * 创建工作流编辑器面板
     * @returns {vscode.WebviewPanel} Webview面板
     */
    createEditorPanel() {
        const panel = vscode.window.createWebviewPanel(
            'workflowEditor',
            '工作流编辑器',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'ui'))
                ]
            }
        );
        
        // 设置HTML内容
        panel.webview.html = this.getEditorHtml(panel.webview);
        
        // 处理消息
        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'saveWorkflow':
                        try {
                            const path = await this.saveWorkflow(message.workflow);
                            panel.webview.postMessage({
                                command: 'workflowSaved',
                                path
                            });
                        } catch (error) {
                            panel.webview.postMessage({
                                command: 'error',
                                message: error.message
                            });
                        }
                        break;
                        
                    case 'loadWorkflow':
                        try {
                            const workflow = await this.loadWorkflow(message.id);
                            panel.webview.postMessage({
                                command: 'workflowLoaded',
                                workflow
                            });
                        } catch (error) {
                            panel.webview.postMessage({
                                command: 'error',
                                message: error.message
                            });
                        }
                        break;
                        
                    case 'listWorkflows':
                        try {
                            const workflows = await this.listWorkflows();
                            panel.webview.postMessage({
                                command: 'workflowsList',
                                workflows
                            });
                        } catch (error) {
                            panel.webview.postMessage({
                                command: 'error',
                                message: error.message
                            });
                        }
                        break;
                        
                    case 'runWorkflow':
                        try {
                            const result = await this.executeWorkflow(
                                message.workflow.id,
                                message.context || {}
                            );
                            panel.webview.postMessage({
                                command: 'executionResult',
                                result
                            });
                        } catch (error) {
                            panel.webview.postMessage({
                                command: 'error',
                                message: error.message
                            });
                        }
                        break;
                        
                    case 'validateWorkflow':
                        try {
                            const result = this.visualManager.validateWorkflow(message.workflow);
                            panel.webview.postMessage({
                                command: 'validationResult',
                                result
                            });
                        } catch (error) {
                            panel.webview.postMessage({
                                command: 'error',
                                message: error.message
                            });
                        }
                        break;
                        
                    case 'getTemplates':
                        const templates = Array.from(this.visualManager.templates.entries()).map(([name, template]) => ({
                            name,
                            ...template
                        }));
                        panel.webview.postMessage({
                            command: 'templates',
                            templates
                        });
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
        
        return panel;
    }
    
    /**
     * 获取编辑器HTML
     * @private
     */
    getEditorHtml(webview) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'ui', 'components', 'WorkflowEditor.js'))
        );
        
        const managerUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'workflow', 'WorkflowVisualManager.js'))
        );
        
        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>工作流编辑器</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    height: 100vh;
                    overflow: hidden;
                }
                #editor-container {
                    width: 100%;
                    height: 100%;
                }
            </style>
        </head>
        <body>
            <div id="editor-container"></div>
            
            <script>
                // VSCode API
                const vscode = acquireVsCodeApi();
                
                // 加载脚本
                const loadScript = (src) => {
                    return new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = src;
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                };
                
                // 初始化编辑器
                async function initEditor() {
                    try {
                        // 加载依赖
                        await loadScript('${managerUri}');
                        await loadScript('${scriptUri}');
                        
                        // 创建管理器和编辑器
                        const manager = new WorkflowVisualManager();
                        const editor = new WorkflowEditor(
                            document.getElementById('editor-container'),
                            manager
                        );
                        
                        // 监听VSCode消息
                        window.addEventListener('message', event => {
                            const message = event.data;
                            
                            switch (message.command) {
                                case 'workflowLoaded':
                                    manager.currentWorkflow = message.workflow;
                                    editor.render();
                                    break;
                                    
                                case 'workflowsList':
                                    // TODO: 显示工作流列表对话框
                                    console.log('Workflows:', message.workflows);
                                    break;
                                    
                                case 'templates':
                                    // TODO: 显示模板列表
                                    console.log('Templates:', message.templates);
                                    break;
                                    
                                case 'error':
                                    editor.showStatus(message.message, 'error');
                                    break;
                            }
                        });
                        
                        // 请求模板列表
                        vscode.postMessage({ command: 'getTemplates' });
                        
                        // 创建默认工作流
                        manager.createWorkflow('新工作流', '使用可视化编辑器创建的工作流');
                        editor.render();
                        
                    } catch (error) {
                        console.error('Failed to initialize editor:', error);
                    }
                }
                
                // 启动
                initEditor();
            </script>
        </body>
        </html>`;
    }
}

module.exports = { WorkflowService };