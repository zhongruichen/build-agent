const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const yaml = require('js-yaml');
const { NODE_TYPE } = require('../mcp/orchestration/ToolOrchestrationEngine');

/**
 * 工作流可视化管理器
 * 管理工作流的可视化表示、编辑和转换
 */
class WorkflowVisualManager extends EventEmitter {
    constructor() {
        super();
        
        // 工作流存储
        this.workflows = new Map();
        
        // 当前编辑的工作流
        this.currentWorkflow = null;
        
        // 节点类型定义
        this.nodeTypes = {
            [NODE_TYPE.TOOL]: {
                label: '工具节点',
                icon: '🔧',
                color: '#4CAF50',
                inputs: 1,
                outputs: 1,
                properties: {
                    tool: { type: 'string', label: '工具名称', required: true },
                    params: { type: 'object', label: '参数' },
                    output: { type: 'string', label: '输出变量' }
                }
            },
            [NODE_TYPE.PARALLEL]: {
                label: '并行节点',
                icon: '⚡',
                color: '#2196F3',
                inputs: 1,
                outputs: -1, // 多输出
                properties: {
                    branches: { type: 'array', label: '分支' }
                }
            },
            [NODE_TYPE.SEQUENCE]: {
                label: '顺序节点',
                icon: '📝',
                color: '#9C27B0',
                inputs: 1,
                outputs: 1,
                properties: {
                    steps: { type: 'array', label: '步骤' }
                }
            },
            [NODE_TYPE.CONDITIONAL]: {
                label: '条件节点',
                icon: '❓',
                color: '#FF9800',
                inputs: 1,
                outputs: 2, // true/false分支
                properties: {
                    condition: { type: 'string', label: '条件表达式', required: true },
                    then: { type: 'array', label: '满足条件时' },
                    else: { type: 'array', label: '不满足条件时' }
                }
            },
            [NODE_TYPE.LOOP]: {
                label: '循环节点',
                icon: '🔄',
                color: '#00BCD4',
                inputs: 1,
                outputs: 1,
                properties: {
                    type: { type: 'select', label: '循环类型', options: ['forEach', 'while', 'count'] },
                    forEach: { type: 'string', label: '遍历数组' },
                    while: { type: 'string', label: '条件' },
                    count: { type: 'number', label: '次数' },
                    do: { type: 'array', label: '循环体', required: true }
                }
            },
            [NODE_TYPE.ERROR_HANDLER]: {
                label: '错误处理',
                icon: '⚠️',
                color: '#F44336',
                inputs: 1,
                outputs: 1,
                properties: {
                    try: { type: 'array', label: '尝试执行', required: true },
                    catch: { type: 'array', label: '捕获错误' },
                    finally: { type: 'array', label: '最终执行' }
                }
            },
            [NODE_TYPE.TRANSFORM]: {
                label: '数据转换',
                icon: '🔀',
                color: '#795548',
                inputs: 1,
                outputs: 1,
                properties: {
                    type: { type: 'select', label: '转换类型', options: ['map', 'filter', 'reduce', 'custom'] },
                    input: { type: 'string', label: '输入数据' },
                    expression: { type: 'string', label: '表达式' }
                }
            },
            [NODE_TYPE.MERGE]: {
                label: '合并节点',
                icon: '🔗',
                color: '#607D8B',
                inputs: -1, // 多输入
                outputs: 1,
                properties: {
                    type: { type: 'select', label: '合并类型', options: ['concat', 'object', 'custom'] },
                    inputs: { type: 'array', label: '输入列表' }
                }
            },
            [NODE_TYPE.SPLIT]: {
                label: '分割节点',
                icon: '✂️',
                color: '#E91E63',
                inputs: 1,
                outputs: -1, // 多输出
                properties: {
                    type: { type: 'select', label: '分割类型', options: ['chunk', 'condition'] },
                    size: { type: 'number', label: '块大小' },
                    condition: { type: 'string', label: '条件' }
                }
            }
        };
        
        // 节点连接规则
        this.connectionRules = {
            maxConnections: 100,
            allowCycles: false
        };
    }
    
    /**
     * 创建新工作流
     * @param {string} name - 工作流名称
     * @param {string} description - 工作流描述
     * @returns {Object} 工作流对象
     */
    createWorkflow(name, description = '') {
        const workflow = {
            id: uuidv4(),
            name,
            description,
            version: '1.0.0',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            nodes: [],
            connections: [],
            variables: {},
            settings: {
                autoSave: true,
                validateOnChange: true
            }
        };
        
        this.workflows.set(workflow.id, workflow);
        this.currentWorkflow = workflow;
        
        this.emit('workflow:created', workflow);
        return workflow;
    }
    
    /**
     * 添加节点到工作流
     * @param {string} nodeType - 节点类型
     * @param {Object} position - 节点位置 {x, y}
     * @param {Object} properties - 节点属性
     * @returns {Object} 节点对象
     */
    addNode(nodeType, position = { x: 0, y: 0 }, properties = {}) {
        if (!this.currentWorkflow) {
            throw new Error('没有当前编辑的工作流');
        }
        
        if (!this.nodeTypes[nodeType]) {
            throw new Error(`未知的节点类型: ${nodeType}`);
        }
        
        const node = {
            id: uuidv4(),
            type: nodeType,
            position,
            properties: this.initializeNodeProperties(nodeType, properties),
            inputs: [],
            outputs: []
        };
        
        this.currentWorkflow.nodes.push(node);
        this.currentWorkflow.updatedAt = Date.now();
        
        this.emit('node:added', { workflowId: this.currentWorkflow.id, node });
        return node;
    }
    
    /**
     * 初始化节点属性
     * @private
     */
    initializeNodeProperties(nodeType, providedProps) {
        const nodeTypeDef = this.nodeTypes[nodeType];
        const props = {};
        
        for (const [key, def] of Object.entries(nodeTypeDef.properties)) {
            if (providedProps[key] !== undefined) {
                props[key] = providedProps[key];
            } else if (def.default !== undefined) {
                props[key] = def.default;
            } else if (def.type === 'array') {
                props[key] = [];
            } else if (def.type === 'object') {
                props[key] = {};
            }
        }
        
        return props;
    }
    
    /**
     * 连接两个节点
     * @param {string} sourceNodeId - 源节点ID
     * @param {number} sourceOutput - 源节点输出端口索引
     * @param {string} targetNodeId - 目标节点ID
     * @param {number} targetInput - 目标节点输入端口索引
     * @returns {Object} 连接对象
     */
    connectNodes(sourceNodeId, sourceOutput = 0, targetNodeId, targetInput = 0) {
        if (!this.currentWorkflow) {
            throw new Error('没有当前编辑的工作流');
        }
        
        // 验证节点存在
        const sourceNode = this.currentWorkflow.nodes.find(n => n.id === sourceNodeId);
        const targetNode = this.currentWorkflow.nodes.find(n => n.id === targetNodeId);
        
        if (!sourceNode || !targetNode) {
            throw new Error('源节点或目标节点不存在');
        }
        
        // 检查是否会产生循环
        if (this.connectionRules.allowCycles === false && this.wouldCreateCycle(sourceNodeId, targetNodeId)) {
            throw new Error('连接会产生循环，不允许');
        }
        
        const connection = {
            id: uuidv4(),
            source: sourceNodeId,
            sourceOutput,
            target: targetNodeId,
            targetInput
        };
        
        this.currentWorkflow.connections.push(connection);
        this.currentWorkflow.updatedAt = Date.now();
        
        // 更新节点的输入输出信息
        sourceNode.outputs.push(connection.id);
        targetNode.inputs.push(connection.id);
        
        this.emit('connection:created', { workflowId: this.currentWorkflow.id, connection });
        return connection;
    }
    
    /**
     * 检查连接是否会产生循环
     * @private
     */
    wouldCreateCycle(sourceId, targetId) {
        const visited = new Set();
        const stack = [targetId];
        
        while (stack.length > 0) {
            const nodeId = stack.pop();
            
            if (nodeId === sourceId) {
                return true; // 发现循环
            }
            
            if (visited.has(nodeId)) {
                continue;
            }
            
            visited.add(nodeId);
            
            // 找到所有从当前节点出发的连接
            const outgoingConnections = this.currentWorkflow.connections
                .filter(c => c.source === nodeId)
                .map(c => c.target);
            
            stack.push(...outgoingConnections);
        }
        
        return false;
    }
    
    /**
     * 删除节点
     * @param {string} nodeId - 节点ID
     */
    removeNode(nodeId) {
        if (!this.currentWorkflow) {
            throw new Error('没有当前编辑的工作流');
        }
        
        // 删除与节点相关的所有连接
        this.currentWorkflow.connections = this.currentWorkflow.connections.filter(
            c => c.source !== nodeId && c.target !== nodeId
        );
        
        // 删除节点
        const nodeIndex = this.currentWorkflow.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex !== -1) {
            this.currentWorkflow.nodes.splice(nodeIndex, 1);
            this.currentWorkflow.updatedAt = Date.now();
            
            this.emit('node:removed', { workflowId: this.currentWorkflow.id, nodeId });
        }
    }
    
    /**
     * 更新节点属性
     * @param {string} nodeId - 节点ID
     * @param {Object} properties - 新属性值
     */
    updateNode(nodeId, properties) {
        if (!this.currentWorkflow) {
            throw new Error('没有当前编辑的工作流');
        }
        
        const node = this.currentWorkflow.nodes.find(n => n.id === nodeId);
        if (!node) {
            throw new Error('节点不存在');
        }
        
        // 验证属性
        const nodeTypeDef = this.nodeTypes[node.type];
        for (const [key, value] of Object.entries(properties)) {
            if (nodeTypeDef.properties[key]) {
                node.properties[key] = value;
            }
        }
        
        this.currentWorkflow.updatedAt = Date.now();
        
        this.emit('node:updated', { workflowId: this.currentWorkflow.id, nodeId, properties });
    }
    
    /**
     * 将可视化工作流转换为YAML格式
     * @param {Object} workflow - 工作流对象
     * @returns {string} YAML字符串
     */
    toYAML(workflow = null) {
        const wf = workflow || this.currentWorkflow;
        if (!wf) {
            throw new Error('没有要转换的工作流');
        }
        
        // 构建执行顺序
        const stages = this.buildExecutionStages(wf);
        
        const yamlObject = {
            name: wf.name,
            description: wf.description,
            version: wf.version,
            variables: wf.variables,
            stages
        };
        
        return yaml.dump(yamlObject, {
            indent: 2,
            lineWidth: 120,
            noRefs: true
        });
    }
    
    /**
     * 构建执行阶段
     * @private
     */
    buildExecutionStages(workflow) {
        const stages = [];
        const visited = new Set();
        
        // 找到所有起始节点（没有输入的节点）
        const startNodes = workflow.nodes.filter(node => {
            const hasInput = workflow.connections.some(c => c.target === node.id);
            return !hasInput;
        });
        
        // 从每个起始节点开始构建执行链
        for (const startNode of startNodes) {
            const stage = this.nodeToStage(startNode, workflow, visited);
            if (stage) {
                stages.push(stage);
            }
        }
        
        // 处理未访问的节点（可能是孤立节点）
        for (const node of workflow.nodes) {
            if (!visited.has(node.id)) {
                const stage = this.nodeToStage(node, workflow, visited);
                if (stage) {
                    stages.push(stage);
                }
            }
        }
        
        return stages;
    }
    
    /**
     * 将节点转换为执行阶段
     * @private
     */
    nodeToStage(node, workflow, visited) {
        if (visited.has(node.id)) {
            return null;
        }
        
        visited.add(node.id);
        
        let stage = {};
        
        switch (node.type) {
            case NODE_TYPE.TOOL:
                stage = {
                    tool: node.properties.tool,
                    params: node.properties.params || {},
                    output: node.properties.output
                };
                break;
                
            case NODE_TYPE.PARALLEL:
                const parallelBranches = this.getChildNodes(node.id, workflow)
                    .map(child => this.nodeToStage(child, workflow, visited))
                    .filter(s => s !== null);
                stage = { parallel: parallelBranches };
                break;
                
            case NODE_TYPE.SEQUENCE:
                const sequenceSteps = this.getChildNodes(node.id, workflow)
                    .map(child => this.nodeToStage(child, workflow, visited))
                    .filter(s => s !== null);
                stage = { sequence: sequenceSteps };
                break;
                
            case NODE_TYPE.CONDITIONAL:
                stage = {
                    conditional: {
                        if: node.properties.condition,
                        then: node.properties.then || [],
                        else: node.properties.else || []
                    }
                };
                break;
                
            case NODE_TYPE.LOOP:
                const loopConfig = {
                    do: node.properties.do || []
                };
                
                if (node.properties.type === 'forEach') {
                    loopConfig.forEach = node.properties.forEach;
                } else if (node.properties.type === 'while') {
                    loopConfig.while = node.properties.while;
                } else if (node.properties.type === 'count') {
                    loopConfig.count = node.properties.count;
                }
                
                stage = { loop: loopConfig };
                break;
                
            case NODE_TYPE.ERROR_HANDLER:
                stage = {
                    error_handler: {
                        try: node.properties.try || [],
                        catch: node.properties.catch || [],
                        finally: node.properties.finally || []
                    }
                };
                break;
                
            case NODE_TYPE.TRANSFORM:
                stage = {
                    transform: {
                        type: node.properties.type,
                        input: node.properties.input,
                        expression: node.properties.expression
                    }
                };
                break;
                
            case NODE_TYPE.MERGE:
                stage = {
                    merge: {
                        type: node.properties.type,
                        inputs: node.properties.inputs || []
                    }
                };
                break;
                
            case NODE_TYPE.SPLIT:
                stage = {
                    split: {
                        type: node.properties.type,
                        input: node.properties.input,
                        size: node.properties.size,
                        condition: node.properties.condition
                    }
                };
                break;
        }
        
        // 处理下游节点
        const nextNodes = this.getChildNodes(node.id, workflow);
        if (nextNodes.length === 1) {
            // 单个下游节点，继续链式处理
            const nextStage = this.nodeToStage(nextNodes[0], workflow, visited);
            if (nextStage) {
                return [stage, nextStage];
            }
        } else if (nextNodes.length > 1) {
            // 多个下游节点，作为并行处理
            const parallelStages = nextNodes
                .map(child => this.nodeToStage(child, workflow, visited))
                .filter(s => s !== null);
            if (parallelStages.length > 0) {
                return [stage, { parallel: parallelStages }];
            }
        }
        
        return stage;
    }
    
    /**
     * 获取节点的下游节点
     * @private
     */
    getChildNodes(nodeId, workflow) {
        const childConnections = workflow.connections.filter(c => c.source === nodeId);
        return childConnections.map(c => workflow.nodes.find(n => n.id === c.target)).filter(n => n);
    }
    
    /**
     * 从YAML加载工作流
     * @param {string} yamlContent - YAML内容
     * @returns {Object} 工作流对象
     */
    fromYAML(yamlContent) {
        try {
            const yamlObject = yaml.load(yamlContent);
            
            const workflow = this.createWorkflow(
                yamlObject.name || 'Imported Workflow',
                yamlObject.description || ''
            );
            
            workflow.version = yamlObject.version || '1.0.0';
            workflow.variables = yamlObject.variables || {};
            
            // 将stages转换为可视化节点
            this.stagesToNodes(yamlObject.stages || [], workflow);
            
            return workflow;
        } catch (error) {
            throw new Error(`解析YAML失败: ${error.message}`);
        }
    }
    
    /**
     * 将执行阶段转换为可视化节点
     * @private
     */
    stagesToNodes(stages, workflow, parentNodeId = null, position = { x: 100, y: 100 }) {
        let lastNodeId = parentNodeId;
        let currentY = position.y;
        
        for (const stage of stages) {
            const nodeInfo = this.stageToNode(stage, { x: position.x, y: currentY });
            
            if (nodeInfo) {
                const node = this.addNode(nodeInfo.type, nodeInfo.position, nodeInfo.properties);
                
                if (lastNodeId) {
                    this.connectNodes(lastNodeId, 0, node.id, 0);
                }
                
                lastNodeId = node.id;
                currentY += 100; // 垂直间距
                
                // 处理嵌套结构
                if (nodeInfo.children) {
                    this.stagesToNodes(nodeInfo.children, workflow, node.id, { x: position.x + 200, y: currentY });
                }
            }
        }
        
        return lastNodeId;
    }
    
    /**
     * 将单个阶段转换为节点信息
     * @private
     */
    stageToNode(stage, position) {
        // 工具节点
        if (stage.tool) {
            return {
                type: NODE_TYPE.TOOL,
                position,
                properties: {
                    tool: stage.tool,
                    params: stage.params,
                    output: stage.output
                }
            };
        }
        
        // 并行节点
        if (stage.parallel) {
            return {
                type: NODE_TYPE.PARALLEL,
                position,
                properties: {},
                children: stage.parallel
            };
        }
        
        // 顺序节点
        if (stage.sequence) {
            return {
                type: NODE_TYPE.SEQUENCE,
                position,
                properties: {},
                children: stage.sequence
            };
        }
        
        // 条件节点
        if (stage.conditional) {
            return {
                type: NODE_TYPE.CONDITIONAL,
                position,
                properties: {
                    condition: stage.conditional.if,
                    then: stage.conditional.then,
                    else: stage.conditional.else
                }
            };
        }
        
        // 循环节点
        if (stage.loop) {
            const props = { do: stage.loop.do };
            
            if (stage.loop.forEach) {
                props.type = 'forEach';
                props.forEach = stage.loop.forEach;
            } else if (stage.loop.while) {
                props.type = 'while';
                props.while = stage.loop.while;
            } else if (stage.loop.count) {
                props.type = 'count';
                props.count = stage.loop.count;
            }
            
            return {
                type: NODE_TYPE.LOOP,
                position,
                properties: props
            };
        }
        
        // 错误处理节点
        if (stage.error_handler) {
            return {
                type: NODE_TYPE.ERROR_HANDLER,
                position,
                properties: {
                    try: stage.error_handler.try,
                    catch: stage.error_handler.catch,
                    finally: stage.error_handler.finally
                }
            };
        }
        
        // 转换节点
        if (stage.transform) {
            return {
                type: NODE_TYPE.TRANSFORM,
                position,
                properties: stage.transform
            };
        }
        
        // 合并节点
        if (stage.merge) {
            return {
                type: NODE_TYPE.MERGE,
                position,
                properties: stage.merge
            };
        }
        
        // 分割节点
        if (stage.split) {
            return {
                type: NODE_TYPE.SPLIT,
                position,
                properties: stage.split
            };
        }
        
        return null;
    }
    
    /**
     * 验证工作流
     * @param {Object} workflow - 工作流对象
     * @returns {Object} 验证结果 {valid: boolean, errors: string[]}
     */
    validateWorkflow(workflow = null) {
        const wf = workflow || this.currentWorkflow;
        if (!wf) {
            return { valid: false, errors: ['没有工作流可验证'] };
        }
        
        const errors = [];
        
        // 检查工作流名称
        if (!wf.name || wf.name.trim() === '') {
            errors.push('工作流必须有名称');
        }
        
        // 检查是否有节点
        if (!wf.nodes || wf.nodes.length === 0) {
            errors.push('工作流至少需要一个节点');
        }
        
        // 检查必需属性
        for (const node of wf.nodes) {
            const nodeTypeDef = this.nodeTypes[node.type];
            if (nodeTypeDef) {
                for (const [key, def] of Object.entries(nodeTypeDef.properties)) {
                    if (def.required && !node.properties[key]) {
                        errors.push(`节点 ${node.id} 缺少必需属性: ${key}`);
                    }
                }
            }
        }
        
        // 检查孤立节点
        const connectedNodes = new Set();
        for (const conn of wf.connections) {
            connectedNodes.add(conn.source);
            connectedNodes.add(conn.target);
        }
        
        for (const node of wf.nodes) {
            if (!connectedNodes.has(node.id) && wf.nodes.length > 1) {
                errors.push(`节点 ${node.id} 是孤立的，没有连接`);
            }
        }
        
        // 检查循环（如果不允许）
        if (!this.connectionRules.allowCycles) {
            if (this.hasCycle(wf)) {
                errors.push('工作流中存在循环');
            }
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    /**
     * 检查工作流是否有循环
     * @private
     */
    hasCycle(workflow) {
        const visited = new Set();
        const recStack = new Set();
        
        const hasCycleDFS = (nodeId) => {
            visited.add(nodeId);
            recStack.add(nodeId);
            
            const neighbors = workflow.connections
                .filter(c => c.source === nodeId)
                .map(c => c.target);
            
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    if (hasCycleDFS(neighbor)) {
                        return true;
                    }
                } else if (recStack.has(neighbor)) {
                    return true;
                }
            }
            
            recStack.delete(nodeId);
            return false;
        };
        
        for (const node of workflow.nodes) {
            if (!visited.has(node.id)) {
                if (hasCycleDFS(node.id)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * 获取工作流摘要信息
     * @param {string} workflowId - 工作流ID
     * @returns {Object} 摘要信息
     */
    getWorkflowSummary(workflowId) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            return null;
        }
        
        const nodeTypeCounts = {};
        for (const node of workflow.nodes) {
            nodeTypeCounts[node.type] = (nodeTypeCounts[node.type] || 0) + 1;
        }
        
        return {
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            version: workflow.version,
            createdAt: workflow.createdAt,
            updatedAt: workflow.updatedAt,
            nodeCount: workflow.nodes.length,
            connectionCount: workflow.connections.length,
            variableCount: Object.keys(workflow.variables).length,
            nodeTypes: nodeTypeCounts
        };
    }
    
    /**
     * 克隆工作流
     * @param {string} workflowId - 要克隆的工作流ID
     * @param {string} newName - 新工作流名称
     * @returns {Object} 克隆的工作流
     */
    cloneWorkflow(workflowId, newName) {
        const original = this.workflows.get(workflowId);
        if (!original) {
            throw new Error('原工作流不存在');
        }
        
        const cloned = {
            ...original,
            id: uuidv4(),
            name: newName || `${original.name} (副本)`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            nodes: original.nodes.map(node => ({ ...node, id: uuidv4() })),
            connections: []
        };
        
        // 创建节点ID映射
        const idMap = {};
        for (let i = 0; i < original.nodes.length; i++) {
            idMap[original.nodes[i].id] = cloned.nodes[i].id;
        }
        
        // 重新映射连接
        cloned.connections = original.connections.map(conn => ({
            ...conn,
            id: uuidv4(),
            source: idMap[conn.source],
            target: idMap[conn.target]
        }));
        
        this.workflows.set(cloned.id, cloned);
        
        this.emit('workflow:cloned', { originalId: workflowId, clonedId: cloned.id });
        return cloned;
    }
}

module.exports = { WorkflowVisualManager };