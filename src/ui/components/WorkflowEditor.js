/**
 * 工作流可视化编辑器组件
 * 提供拖拽式的工作流构建界面
 */
class WorkflowEditor {
    /**
     * @param {HTMLElement} container
     * @param {any} workflowManager
     */
    constructor(container, workflowManager) {
        this.container = container;
        this.workflowManager = workflowManager;
        
        // 画布设置
        this.canvas = null;
        this.ctx = null;
        this.scale = 1;
        this.offset = { x: 0, y: 0 };
        
        // 交互状态
        this.selectedNode = null;
        this.selectedConnection = null;
        this.draggedNode = null;
        this.connectionStart = null;
        this.mousePos = { x: 0, y: 0 };
        
        // 编辑模式
        this.mode = 'select'; // select, connect, pan
        
        // 节点模板
        this.nodeTemplates = this.workflowManager.nodeTypes;
        
        // 初始化
        this.init();
    }
    
    /**
     * 初始化编辑器
     */
    init() {
        // 创建HTML结构
        this.createLayout();
        
        // 设置画布
        this.setupCanvas();
        
        // 绑定事件
        this.bindEvents();
        
        // 初始渲染
        this.render();
    }
    
    /**
     * 创建编辑器布局
     */
    createLayout() {
        this.container.innerHTML = `
            <div class="workflow-editor">
                <!-- 工具栏 -->
                <div class="workflow-toolbar">
                    <div class="toolbar-group">
                        <button class="toolbar-btn" data-action="new" title="新建工作流">
                            <span class="icon">📄</span> 新建
                        </button>
                        <button class="toolbar-btn" data-action="save" title="保存工作流">
                            <span class="icon">💾</span> 保存
                        </button>
                        <button class="toolbar-btn" data-action="load" title="加载工作流">
                            <span class="icon">📁</span> 加载
                        </button>
                        <button class="toolbar-btn" data-action="export" title="导出为YAML">
                            <span class="icon">📤</span> 导出
                        </button>
                    </div>
                    
                    <div class="toolbar-group">
                        <button class="toolbar-btn active" data-mode="select" title="选择模式">
                            <span class="icon">🖱️</span>
                        </button>
                        <button class="toolbar-btn" data-mode="connect" title="连接模式">
                            <span class="icon">🔗</span>
                        </button>
                        <button class="toolbar-btn" data-mode="pan" title="平移模式">
                            <span class="icon">✋</span>
                        </button>
                    </div>
                    
                    <div class="toolbar-group">
                        <button class="toolbar-btn" data-action="validate" title="验证工作流">
                            <span class="icon">✅</span> 验证
                        </button>
                        <button class="toolbar-btn" data-action="run" title="运行工作流">
                            <span class="icon">▶️</span> 运行
                        </button>
                    </div>
                    
                    <div class="toolbar-group">
                        <button class="toolbar-btn" data-action="zoom-in" title="放大">
                            <span class="icon">🔍+</span>
                        </button>
                        <button class="toolbar-btn" data-action="zoom-out" title="缩小">
                            <span class="icon">🔍-</span>
                        </button>
                        <button class="toolbar-btn" data-action="zoom-fit" title="适应屏幕">
                            <span class="icon">⬜</span>
                        </button>
                    </div>
                </div>
                
                <!-- 主要内容区 -->
                <div class="workflow-main">
                    <!-- 节点面板 -->
                    <div class="node-palette">
                        <h3>节点库</h3>
                        <div class="node-categories"></div>
                    </div>
                    
                    <!-- 画布 -->
                    <div class="canvas-container">
                        <canvas id="workflow-canvas"></canvas>
                        <div class="canvas-overlay"></div>
                    </div>
                    
                    <!-- 属性面板 -->
                    <div class="properties-panel">
                        <h3>属性</h3>
                        <div class="properties-content">
                            <p class="placeholder">选择一个节点查看属性</p>
                        </div>
                    </div>
                </div>
                
                <!-- 状态栏 -->
                <div class="workflow-statusbar">
                    <span class="status-item">缩放: <span id="zoom-level">100%</span></span>
                    <span class="status-item">节点: <span id="node-count">0</span></span>
                    <span class="status-item">连接: <span id="connection-count">0</span></span>
                    <span class="status-item status-message"></span>
                </div>
            </div>
        `;
        
        // 添加样式
        this.addStyles();
        
        // 创建节点模板
        this.createNodeTemplates();
    }
    
    /**
     * 添加样式
     */
    addStyles() {
        const styleId = 'workflow-editor-styles';
        if (document.getElementById(styleId)) return;
        
        const styles = `
            .workflow-editor {
                height: 100%;
                display: flex;
                flex-direction: column;
                background: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
            }
            
            .workflow-toolbar {
                display: flex;
                gap: 20px;
                padding: 10px;
                background: var(--vscode-editorWidget-background);
                border-bottom: 1px solid var(--vscode-widget-border);
            }
            
            .toolbar-group {
                display: flex;
                gap: 5px;
            }
            
            .toolbar-btn {
                background: transparent;
                border: 1px solid transparent;
                color: var(--vscode-foreground);
                padding: 5px 10px;
                cursor: pointer;
                border-radius: 3px;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .toolbar-btn:hover {
                background: var(--vscode-toolbar-hoverBackground);
            }
            
            .toolbar-btn.active {
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
            }
            
            .workflow-main {
                flex: 1;
                display: flex;
                overflow: hidden;
            }
            
            .node-palette {
                width: 200px;
                background: var(--vscode-sideBar-background);
                border-right: 1px solid var(--vscode-widget-border);
                padding: 10px;
                overflow-y: auto;
            }
            
            .node-palette h3 {
                margin: 0 0 10px 0;
                font-size: 14px;
            }
            
            .node-template {
                background: var(--vscode-editor-background);
                border: 1px solid var(--vscode-widget-border);
                border-radius: 5px;
                padding: 8px;
                margin-bottom: 8px;
                cursor: move;
                transition: transform 0.2s;
            }
            
            .node-template:hover {
                transform: translateX(5px);
                border-color: var(--vscode-focusBorder);
            }
            
            .node-template-icon {
                display: inline-block;
                margin-right: 5px;
            }
            
            .canvas-container {
                flex: 1;
                position: relative;
                overflow: hidden;
            }
            
            #workflow-canvas {
                position: absolute;
                top: 0;
                left: 0;
                cursor: crosshair;
            }
            
            .canvas-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
            }
            
            .properties-panel {
                width: 250px;
                background: var(--vscode-sideBar-background);
                border-left: 1px solid var(--vscode-widget-border);
                padding: 10px;
                overflow-y: auto;
            }
            
            .properties-panel h3 {
                margin: 0 0 10px 0;
                font-size: 14px;
            }
            
            .property-group {
                margin-bottom: 15px;
            }
            
            .property-label {
                display: block;
                margin-bottom: 5px;
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
            }
            
            .property-input {
                width: 100%;
                padding: 5px;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 3px;
            }
            
            .property-input:focus {
                outline: none;
                border-color: var(--vscode-focusBorder);
            }
            
            .workflow-statusbar {
                display: flex;
                gap: 20px;
                padding: 5px 10px;
                background: var(--vscode-statusBar-background);
                color: var(--vscode-statusBar-foreground);
                font-size: 12px;
                border-top: 1px solid var(--vscode-widget-border);
            }
            
            .status-message {
                margin-left: auto;
            }
            
            .placeholder {
                color: var(--vscode-descriptionForeground);
                font-style: italic;
            }
            
            /* 上下文菜单 */
            .context-menu {
                position: absolute;
                background: var(--vscode-menu-background);
                border: 1px solid var(--vscode-menu-border);
                border-radius: 5px;
                padding: 5px 0;
                z-index: 1000;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            }
            
            .context-menu-item {
                padding: 5px 20px;
                cursor: pointer;
                font-size: 13px;
            }
            
            .context-menu-item:hover {
                background: var(--vscode-menu-selectionBackground);
                color: var(--vscode-menu-selectionForeground);
            }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }
    
    /**
     * 创建节点模板
     */
    createNodeTemplates() {
        const categoriesContainer = this.container.querySelector('.node-categories');
        if (!categoriesContainer) return;
        
        for (const [type, config] of Object.entries(this.nodeTemplates)) {
            const template = document.createElement('div');
            template.className = 'node-template';
            template.draggable = true;
            template.dataset.nodeType = type;
            template.innerHTML = `
                <span class="node-template-icon">${config.icon}</span>
                <span class="node-template-label">${config.label}</span>
            `;
            
            // 拖拽事件
            template.addEventListener('dragstart', (e) => {
                if (e.dataTransfer) {
                    e.dataTransfer.setData('nodeType', type);
                    e.dataTransfer.effectAllowed = 'copy';
                }
            });
            
            categoriesContainer.appendChild(template);
        }
    }
    
    /**
     * 设置画布
     */
    setupCanvas() {
        this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('workflow-canvas'));
        this.ctx = this.canvas.getContext('2d');
        
        // 设置画布大小
        this.resizeCanvas();
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    /**
     * 调整画布大小
     */
    resizeCanvas() {
        if (!this.canvas) return;
        const container = this.canvas.parentElement;
        if (container) {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        }
        this.render();
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 工具栏按钮
        this.container.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleToolbarClick(/** @type {MouseEvent} */ (e)));
        });
        
        if (!this.canvas) return;
        // 画布事件
        this.canvas.addEventListener('mousedown', (e) => this.handleCanvasMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleCanvasMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleCanvasWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => this.handleCanvasContextMenu(e));
        
        // 画布拖放
        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
            }
        });
        
        this.canvas.addEventListener('drop', (e) => this.handleCanvasDrop(/** @type {DragEvent} */ (e)));
        
        // 键盘事件
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }
    
    /**
     * 处理工具栏点击
     */
    /**
     * @param {MouseEvent} e
     */
    handleToolbarClick(e) {
        const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
        const action = btn.dataset.action;
        const mode = btn.dataset.mode;
        
        if (mode) {
            // 切换模式
            this.setMode(mode);
            
            // 更新按钮状态
            this.container.querySelectorAll('[data-mode]').forEach(b => {
                b.classList.toggle('active', b === btn);
            });
        } else if (action) {
            // 执行动作
            this.executeAction(action);
        }
    }
    
    /**
     * 设置编辑模式
     */
    /**
     * @param {string} mode
     */
    setMode(mode) {
        this.mode = mode;
        
        // 更新鼠标样式
        if (this.canvas) {
            switch (mode) {
                case 'select':
                    this.canvas.style.cursor = 'default';
                    break;
                case 'connect':
                    this.canvas.style.cursor = 'crosshair';
                    break;
                case 'pan':
                    this.canvas.style.cursor = 'grab';
                    break;
            }
        }
        
        this.showStatus(`切换到${mode === 'select' ? '选择' : mode === 'connect' ? '连接' : '平移'}模式`);
    }
    
    /**
     * @param {string | null} action
      */
     executeAction(action) {
         switch (action) {
             case 'new':
                 this.createNewWorkflow();
                 break;
             case 'save':
                 this.saveWorkflow();
                 break;
             case 'load':
                 this.loadWorkflow();
                 break;
             case 'export':
                 this.exportWorkflow();
                 break;
             case 'validate':
                 this.validateWorkflow();
                 break;
             case 'run':
                 this.runWorkflow();
                 break;
             case 'zoom-in':
                 this.zoom(1.2);
                 break;
             case 'zoom-out':
                 this.zoom(0.8);
                 break;
             case 'zoom-fit':
                 this.zoomToFit();
                 break;
         }
     }
    
    /**
     * @param {MouseEvent} e
      */
     handleCanvasMouseDown(e) {
        if (!this.canvas) return;
         const rect = this.canvas.getBoundingClientRect();
         const x = (e.clientX - rect.left - this.offset.x) / this.scale;
         const y = (e.clientY - rect.top - this.offset.y) / this.scale;
        
        this.mousePos = { x, y };
        
        if (this.mode === 'select') {
            // 检查是否点击了节点
            const node = this.getNodeAt(x, y);
            if (node) {
                this.selectNode(node);
                this.draggedNode = node;
            } else {
                // 检查是否点击了连接
                const connection = this.getConnectionAt(x, y);
                if (connection) {
                    this.selectConnection(connection);
                } else {
                    // 取消选择
                    this.clearSelection();
                }
            }
        } else if (this.mode === 'connect') {
            // 开始连接
            const node = this.getNodeAt(x, y);
            if (node) {
                this.connectionStart = { node, x, y };
            }
        } else if (this.mode === 'pan') {
            this.canvas.style.cursor = 'grabbing';
        }
    }
    
    /**
     * @param {MouseEvent} e
      */
     handleCanvasMouseMove(e) {
        if (!this.canvas) return;
         const rect = this.canvas.getBoundingClientRect();
         const x = (e.clientX - rect.left - this.offset.x) / this.scale;
         const y = (e.clientY - rect.top - this.offset.y) / this.scale;
        
        if (this.draggedNode) {
            // 拖动节点
            const dx = x - this.mousePos.x;
            const dy = y - this.mousePos.y;
            
            this.draggedNode.position.x += dx;
            this.draggedNode.position.y += dy;
            
            this.workflowManager.updateNode(this.draggedNode.id, {
                position: this.draggedNode.position
            });
            
            this.render();
        } else if (this.connectionStart) {
            // 绘制连接预览
            this.render();
            this.drawConnectionPreview(this.connectionStart.x, this.connectionStart.y, x, y);
        } else if (this.mode === 'pan' && e.buttons === 1) {
            // 平移画布
            const dx = e.clientX - rect.left - this.mousePos.x * this.scale;
            const dy = e.clientY - rect.top - this.mousePos.y * this.scale;
            
            this.offset.x = dx;
            this.offset.y = dy;
            
            this.render();
        }
        
        this.mousePos = { x, y };
    }
    
    /**
     * @param {MouseEvent} e
      */
     handleCanvasMouseUp(e) {
        if (!this.canvas) return;
         const rect = this.canvas.getBoundingClientRect();
         const x = (e.clientX - rect.left - this.offset.x) / this.scale;
         const y = (e.clientY - rect.top - this.offset.y) / this.scale;
        
        if (this.connectionStart) {
            // 完成连接
            const targetNode = this.getNodeAt(x, y);
            if (targetNode && targetNode !== this.connectionStart.node) {
                try {
                    this.workflowManager.connectNodes(
                        this.connectionStart.node.id,
                        0,
                        targetNode.id,
                        0
                    );
                    this.showStatus('连接创建成功');
                } catch (error) {
                   const errorMessage = error instanceof Error ? error.message : String(error);
                   this.showStatus(errorMessage, 'error');
                }
            }
            this.connectionStart = null;
            this.render();
        }
       
        this.draggedNode = null;
       
        if (this.mode === 'pan') {
           if (this.canvas) {
               this.canvas.style.cursor = 'grab';
           }
        }
    }
    
    /**
     * @param {WheelEvent} e
      */
     handleCanvasWheel(e) {
         e.preventDefault();
        
         const delta = e.deltaY > 0 ? 0.9 : 1.1;
         this.zoom(delta, e.clientX, e.clientY);
     }
    
    /**
     * @param {MouseEvent} e
      */
     handleCanvasContextMenu(e) {
         e.preventDefault();
        
        if (!this.canvas) return;
         const rect = this.canvas.getBoundingClientRect();
         const x = (e.clientX - rect.left - this.offset.x) / this.scale;
         const y = (e.clientY - rect.top - this.offset.y) / this.scale;
        
        const node = this.getNodeAt(x, y);
        if (node) {
            this.showNodeContextMenu(node, e.clientX, e.clientY);
        } else {
            const connection = this.getConnectionAt(x, y);
            if (connection) {
                this.showConnectionContextMenu(connection, e.clientX, e.clientY);
            }
        }
    }
    
    /**
     * @param {DragEvent} e
      */
     handleCanvasDrop(e) {
         e.preventDefault();
        
        if (!e.dataTransfer) return;
         const nodeType = e.dataTransfer.getData('nodeType');
         if (!nodeType) return;
        
        if (!this.canvas) return;
         const rect = this.canvas.getBoundingClientRect();
         const x = (e.clientX - rect.left - this.offset.x) / this.scale;
         const y = (e.clientY - rect.top - this.offset.y) / this.scale;
        
        try {
            const node = this.workflowManager.addNode(nodeType, { x, y });
            this.selectNode(node);
            this.render();
            this.showStatus(`添加了 ${this.nodeTemplates[nodeType].label}`);
        } catch (error) {
           const errorMessage = error instanceof Error ? error.message : String(error);
           this.showStatus(errorMessage, 'error');
        }
    }
    
    /**
     * @param {KeyboardEvent} e
      */
     handleKeyDown(e) {
         if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
             return;
         }
        
         if (e.key === 'Delete' || e.key === 'Backspace') {
             if (this.selectedNode) {
                 this.workflowManager.removeNode(this.selectedNode.id);
                 this.clearSelection();
                 this.render();
                 this.showStatus('节点已删除');
             } else if (this.selectedConnection) {
                 // TODO: 实现删除连接
                 this.showStatus('连接删除功能待实现');
             }
         }
     }
    
    /**
     * 渲染画布
      */
     render() {
        if (!this.canvas || !this.ctx) return;
         const workflow = this.workflowManager.currentWorkflow;
         if (!workflow) return;
        
         // 清空画布
         this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
         // 保存状态
         this.ctx.save();
        
         // 应用变换
         this.ctx.translate(this.offset.x, this.offset.y);
         this.ctx.scale(this.scale, this.scale);
        
         // 绘制网格
         this.drawGrid();
        
         // 绘制连接
         workflow.connections.forEach((/** @type {any} */ conn) => {
             this.drawConnection(conn);
         });
        
         // 绘制节点
         workflow.nodes.forEach((/** @type {any} */ node) => {
             this.drawNode(node);
         });
        
         // 恢复状态
         this.ctx.restore();
        
         // 更新状态栏
         this.updateStatusBar();
     }
    
    /**
     * 绘制网格
      */
     drawGrid() {
        if (!this.canvas || !this.ctx) return;
         const gridSize = 20;
         const width = this.canvas.width / this.scale;
         const height = this.canvas.height / this.scale;
         const offsetX = -this.offset.x / this.scale;
         const offsetY = -this.offset.y / this.scale;
        
        this.ctx.strokeStyle = 'rgba(128, 128, 128, 0.1)';
        this.ctx.lineWidth = 1;
        
        // 垂直线
        for (let x = offsetX % gridSize; x < width + offsetX; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, offsetY);
            this.ctx.lineTo(x, height + offsetY);
            this.ctx.stroke();
        }
        
        // 水平线
        for (let y = offsetY % gridSize; y < height + offsetY; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(offsetX, y);
            this.ctx.lineTo(width + offsetX, y);
            this.ctx.stroke();
        }
    }
    
    /**
     * @param {any} node
      */
     drawNode(node) {
        if (!this.ctx) return;
         const config = this.nodeTemplates[node.type];
         const x = node.position.x;
         const y = node.position.y;
         const width = 150;
         const height = 60;
        
        // 节点背景
        this.ctx.fillStyle = this.selectedNode === node ? 
            config.color : 
            this.adjustColor(config.color, -20);
        this.ctx.strokeStyle = this.selectedNode === node ? 
            '#fff' : 
            config.color;
        this.ctx.lineWidth = this.selectedNode === node ? 2 : 1;
        
        this.roundRect(x - width/2, y - height/2, width, height, 10);
        this.ctx.fill();
        this.ctx.stroke();
        
        // 节点图标和标签
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '20px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(config.icon, x, y - 10);
        
        this.ctx.font = '12px sans-serif';
        this.ctx.fillText(config.label, x, y + 15);
        
        // 绘制端口
        this.drawPorts(node, x, y, width, height);
    }
    
    /**
     * @param {any} node
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
      */
     drawPorts(node, x, y, width, height) {
        if (!this.ctx) return;
         const config = this.nodeTemplates[node.type];
        
         // 输入端口
         if (config.inputs !== 0) {
             this.ctx.fillStyle = '#4CAF50';
             this.ctx.beginPath();
             this.ctx.arc(x - width/2, y, 5, 0, 2 * Math.PI);
             this.ctx.fill();
         }
        
         // 输出端口
         if (config.outputs !== 0) {
             this.ctx.fillStyle = '#2196F3';
             this.ctx.beginPath();
             this.ctx.arc(x + width/2, y, 5, 0, 2 * Math.PI);
             this.ctx.fill();
         }
     }
    
    /**
     * @param {any} connection
      */
     drawConnection(connection) {
        if (!this.ctx) return;
         const workflow = this.workflowManager.currentWorkflow;
         const sourceNode = workflow.nodes.find((/** @type {{ id: any; }} */ n) => n.id === connection.source);
         const targetNode = workflow.nodes.find((/** @type {{ id: any; }} */ n) => n.id === connection.target);
        
        if (!sourceNode || !targetNode) return;
        
        const x1 = sourceNode.position.x + 75; // 右侧端口
        const y1 = sourceNode.position.y;
        const x2 = targetNode.position.x - 75; // 左侧端口
        const y2 = targetNode.position.y;
        
        // 贝塞尔曲线
        const cp1x = x1 + (x2 - x1) * 0.5;
        const cp1y = y1;
        const cp2x = x2 - (x2 - x1) * 0.5;
        const cp2y = y2;
        
        this.ctx.strokeStyle = this.selectedConnection === connection ? 
            '#fff' : 
            'rgba(150, 150, 150, 0.8)';
        this.ctx.lineWidth = this.selectedConnection === connection ? 3 : 2;
        
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
        this.ctx.stroke();
        
        // 绘制箭头
        this.drawArrow(cp2x, cp2y, x2, y2);
    }
    
    /**
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
      */
     drawConnectionPreview(x1, y1, x2, y2) {
        if (!this.ctx) return;
         this.ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
         this.ctx.lineWidth = 2;
         this.ctx.setLineDash([5, 5]);
        
         this.ctx.beginPath();
         this.ctx.moveTo(x1, y1);
         this.ctx.lineTo(x2, y2);
         this.ctx.stroke();
        
         this.ctx.setLineDash([]);
     }
    
    /**
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
      */
     drawArrow(x1, y1, x2, y2) {
        if (!this.ctx) return;
         const angle = Math.atan2(y2 - y1, x2 - x1);
         const arrowLength = 10;
         const arrowAngle = Math.PI / 6;
        
        this.ctx.beginPath();
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(
            x2 - arrowLength * Math.cos(angle - arrowAngle),
            y2 - arrowLength * Math.sin(angle - arrowAngle)
        );
        this.ctx.moveTo(x2, y2);
        this.ctx.lineTo(
            x2 - arrowLength * Math.cos(angle + arrowAngle),
            y2 - arrowLength * Math.sin(angle + arrowAngle)
        );
        this.ctx.stroke();
    }
    
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {number} radius
      */
     roundRect(x, y, width, height, radius) {
        if (!this.ctx) return;
         this.ctx.beginPath();
         this.ctx.moveTo(x + radius, y);
         this.ctx.lineTo(x + width - radius, y);
         this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
         this.ctx.lineTo(x + width, y + height - radius);
         this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
         this.ctx.lineTo(x + radius, y + height);
         this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
         this.ctx.lineTo(x, y + radius);
         this.ctx.quadraticCurveTo(x, y, x + radius, y);
         this.ctx.closePath();
     }
    
    /**
     * @param {number} x
     * @param {number} y
      */
     getNodeAt(x, y) {
         const workflow = this.workflowManager.currentWorkflow;
         if (!workflow) return null;
        
        // 从后向前遍历（上层节点优先）
        for (let i = workflow.nodes.length - 1; i >= 0; i--) {
            const node = workflow.nodes[i];
            const width = 150;
            const height = 60;
            
            if (x >= node.position.x - width/2 &&
                x <= node.position.x + width/2 &&
                y >= node.position.y - height/2 &&
                y <= node.position.y + height/2) {
                return node;
            }
        }
        
        return null;
    }
    
    /**
     * @param {number} x
     * @param {number} y
      */
     getConnectionAt(x, y) {
         const workflow = this.workflowManager.currentWorkflow;
         if (!workflow) return null;
        
        // TODO: 实现连接点击检测（需要计算贝塞尔曲线距离）
        return null;
    }
    
    /**
     * @param {any} node
      */
     selectNode(node) {
         this.selectedNode = node;
         this.selectedConnection = null;
         this.updatePropertiesPanel(node);
         this.render();
     }
    
    /**
     * @param {any} connection
      */
     selectConnection(connection) {
         this.selectedNode = null;
         this.selectedConnection = connection;
         this.render();
     }
    
    /**
     * 清除选择
     */
    clearSelection() {
        this.selectedNode = null;
        this.selectedConnection = null;
        this.updatePropertiesPanel(null);
        this.render();
    }
    
    /**
     * @param {any} node
      */
     updatePropertiesPanel(node) {
         const content = this.container.querySelector('.properties-content');
        if (!content) return;

         if (!node) {
             content.innerHTML = '<p class="placeholder">选择一个节点查看属性</p>';
             return;
         }
        
        const config = this.nodeTemplates[node.type];
        let html = `<h4>${config.label}</h4>`;
        
        for (const [key, def] of Object.entries(config.properties)) {
            const value = node.properties[key] || '';
            
            html += `
                <div class="property-group">
                    <label class="property-label">${def.label}${def.required ? ' *' : ''}</label>
            `;
            
            if (def.type === 'select') {
                html += `<select class="property-input" data-property="${key}">`;
                for (const option of def.options) {
                    html += `<option value="${option}" ${value === option ? 'selected' : ''}>${option}</option>`;
                }
                html += `</select>`;
            } else if (def.type === 'number') {
                html += `<input type="number" class="property-input" data-property="${key}" value="${value}">`;
            } else if (def.type === 'array' || def.type === 'object') {
                html += `<textarea class="property-input" data-property="${key}" rows="3">${JSON.stringify(value, null, 2)}</textarea>`;
            } else {
                html += `<input type="text" class="property-input" data-property="${key}" value="${value}">`;
            }
            
            html += `</div>`;
        }
        
        content.innerHTML = html;
       
        // 绑定属性更改事件
        content.querySelectorAll('.property-input').forEach(input => {
            input.addEventListener('change', (e) => {
               const target = /** @type {HTMLInputElement} */ (e.target);
                const property = target.dataset.property;
                let value = target.value;
               
                // 解析特殊类型
                if (property) {
                    const def = config.properties[property];
                    if (def.type === 'number') {
                        // @ts-ignore
                        value = parseFloat(value) || 0;
                    } else if (def.type === 'array' || def.type === 'object') {
                        try {
                            value = JSON.parse(value);
                        } catch {
                            this.showStatus('无效的JSON格式', 'error');
                            return;
                        }
                    }
                }
               
                if (property) {
                   this.workflowManager.updateNode(node.id, {
                       [property]: value
                   });
                }
               
                this.showStatus('属性已更新');
            });
        });
    }
    
    /**
     * @param {any} node
     * @param {number} x
     * @param {number} y
      */
     showNodeContextMenu(node, x, y) {
         const menu = document.createElement('div');
         menu.className = 'context-menu';
         menu.style.left = x + 'px';
         menu.style.top = y + 'px';
        
        const items = [
            { label: '复制', action: () => this.copyNode(node) },
            { label: '删除', action: () => this.deleteNode(node) },
            { label: '属性', action: () => this.selectNode(node) }
        ];
        
        items.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.className = 'context-menu-item';
            menuItem.textContent = item.label;
            menuItem.addEventListener('click', () => {
                item.action();
                menu.remove();
            });
            menu.appendChild(menuItem);
        });
        
        document.body.appendChild(menu);
        
        // 点击其他地方关闭菜单
        setTimeout(() => {
            document.addEventListener('click', () => menu.remove(), { once: true });
        }, 0);
    }
    
    /**
     * @param {any} connection
     * @param {number} x
     * @param {number} y
      */
     showConnectionContextMenu(connection, x, y) {
         // TODO: 实现连接上下文菜单
     }
    
    /**
     * @param {number} factor
     * @param {number | null} [centerX]
     * @param {number | null} [centerY]
      */
     zoom(factor, centerX = null, centerY = null) {
         const newScale = Math.max(0.1, Math.min(5, this.scale * factor));
        
         if (centerX && centerY && this.canvas) {
             // 以鼠标位置为中心缩放
             const rect = this.canvas.getBoundingClientRect();
             const x = centerX - rect.left;
             const y = centerY - rect.top;
            
            this.offset.x = x - (x - this.offset.x) * (newScale / this.scale);
            this.offset.y = y - (y - this.offset.y) * (newScale / this.scale);
        }
        
        this.scale = newScale;
        this.render();
    }
    
    /**
     * 适应屏幕
     */
    zoomToFit() {
        const workflow = this.workflowManager.currentWorkflow;
        if (!workflow || workflow.nodes.length === 0 || !this.canvas) return;
        
        // 计算边界
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        
        workflow.nodes.forEach((/** @type {{ position: { x: number; y: number; }; }} */ node) => {
            minX = Math.min(minX, node.position.x - 75);
            minY = Math.min(minY, node.position.y - 30);
            maxX = Math.max(maxX, node.position.x + 75);
            maxY = Math.max(maxY, node.position.y + 30);
        });
        
        const width = maxX - minX;
        const height = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        // 计算缩放
        const padding = 50;
        const scaleX = (this.canvas.width - padding * 2) / width;
        const scaleY = (this.canvas.height - padding * 2) / height;
        this.scale = Math.min(scaleX, scaleY, 1);
        
        // 计算偏移
        this.offset.x = this.canvas.width / 2 - centerX * this.scale;
        this.offset.y = this.canvas.height / 2 - centerY * this.scale;
        
        this.render();
    }
    
    /**
     * 创建新工作流
     */
    createNewWorkflow() {
        const name = prompt('请输入工作流名称:', 'New Workflow');
        if (name) {
            this.workflowManager.createWorkflow(name);
            this.clearSelection();
            this.render();
            this.showStatus('新工作流已创建');
        }
    }
    
    /**
     * 保存工作流
     */
    saveWorkflow() {
        const workflow = this.workflowManager.currentWorkflow;
        if (!workflow) {
            this.showStatus('没有工作流可保存', 'error');
            return;
        }
        
        // 保存到本地存储
        const key = `workflow_${workflow.id}`;
        localStorage.setItem(key, JSON.stringify(workflow));
        
        this.showStatus('工作流已保存');
    }
    
    /**
     * 加载工作流
     */
    loadWorkflow() {
        // TODO: 实现工作流选择对话框
        this.showStatus('加载功能待实现');
    }
    
    /**
     * 导出工作流
     */
    exportWorkflow() {
        try {
            const yaml = this.workflowManager.toYAML();
            
            // 创建下载链接
            const blob = new Blob([yaml], { type: 'text/yaml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.workflowManager.currentWorkflow.name}.yaml`;
            a.click();
            URL.revokeObjectURL(url);
            
            this.showStatus('工作流已导出');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.showStatus(errorMessage, 'error');
        }
    }
    
    /**
     * 验证工作流
     */
    validateWorkflow() {
        const result = this.workflowManager.validateWorkflow();
        
        if (result.valid) {
            this.showStatus('工作流验证通过', 'success');
        } else {
            this.showStatus(`验证失败: ${result.errors[0]}`, 'error');
            console.error('工作流验证错误:', result.errors);
        }
    }
    
    /**
     * 运行工作流
      */
     runWorkflow() {
         // 发送消息给扩展运行工作流
        // @ts-ignore
         if (window.vscode) {
             // @ts-ignore
             const vscode = window.vscode;
             vscode.postMessage({
                 command: 'runWorkflow',
                 workflow: this.workflowManager.currentWorkflow
             });
         } else {
             this.showStatus('运行功能需要在VSCode中使用');
         }
     }
    
    /**
     * @param {any} node
      */
     copyNode(node) {
         // TODO: 实现节点复制
         this.showStatus('复制功能待实现');
     }
    
    /**
     * @param {any} node
      */
     deleteNode(node) {
         this.workflowManager.removeNode(node.id);
         this.clearSelection();
         this.render();
         this.showStatus('节点已删除');
     }
    
    /**
     * @param {string} message
     * @param {string} [type]
      */
     showStatus(message, type = 'info') {
         const statusMessage = /** @type {HTMLElement} */ (this.container.querySelector('.status-message'));
        if (!statusMessage) return;
         statusMessage.textContent = message;
         statusMessage.style.color = type === 'error' ? '#f44336' :
                                    type === 'success' ? '#4caf50' :
                                    'inherit';
        
         // 3秒后清除消息
         setTimeout(() => {
             if (statusMessage.textContent === message) {
                 statusMessage.textContent = '';
             }
         }, 3000);
     }
    
    /**
     * 更新状态栏
      */
     updateStatusBar() {
         const workflow = this.workflowManager.currentWorkflow;
         if (!workflow) return;
        
         const zoomLevel = document.getElementById('zoom-level');
         if (zoomLevel) zoomLevel.textContent = Math.round(this.scale * 100) + '%';
        
         const nodeCount = document.getElementById('node-count');
         if (nodeCount) nodeCount.textContent = workflow.nodes.length.toString();

         const connectionCount = document.getElementById('connection-count');
         if (connectionCount) connectionCount.textContent = workflow.connections.length.toString();
     }
    
    /**
     * @param {string} color
     * @param {number} amount
      */
     adjustColor(color, amount) {
         const num = parseInt(color.replace('#', ''), 16);
         const r = Math.max(0, Math.min(255, (num >> 16) + amount));
         const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount));
         const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
         return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
     }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WorkflowEditor };
}