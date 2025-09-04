# 超强思维链集成实施方案

本文档详细描述了将十五步深度思考流程（代号：Ultimate Thinking Chain V3）集成到现有多智能体系统中的技术方案和实施步骤。

## 1. 架构设计

  <!-- 预留图表位置 -->

### 1.1. 核心模块

- **`ThinkingChainEngine`**: 负责执行15步思考流程，与LLM交互并生成结构化的思考结果。
- **`ThinkingChainOrchestrator`**: 在任务开始时调用`ThinkingChainEngine`，并将思考结果注入任务上下文。
- **`ThinkingModels`**: 实现六大思维模型，供`ThinkingChainEngine`在特定步骤调用。

### 1.2. 模块交互

1.  **User Request** -> **ThinkingChainOrchestrator**: 捕获用户请求。
2.  **ThinkingChainOrchestrator** -> **ThinkingChainEngine**: 启动深度思考。
3.  **ThinkingChainEngine** -> **LLM**: 执行15步思考流程。
4.  **ThinkingChainEngine** -> **ThinkingChainOrchestrator**: 返回结构化的思考结果。
5.  **ThinkingChainOrchestrator** -> **TaskContext**: 将核心结论注入上下文。
6.  **TaskContext** -> **OrchestratorAgent**: 启动常规任务规划。

## 2. 文件结构

```
src/
├── agents/
│   ├── baseAgent.js        # (修改) 增加 think() 方法
│   └── ...
├── thinking_chain/
│   ├── ThinkingChainEngine.js
│   ├── ThinkingChainOrchestrator.js
│   ├── ThinkingModels.js
│   └── prompts/
│       └── ULTIMATE_THINKING_CHAIN_V3.js
├── config.js               # (修改) 增加 useThinkingChain 配置
└── ui/
    └── mainPanel.js        # (修改) 增加UI控件
```

## 3. 实施步骤

详细步骤参见项目TODO list。我们将从创建`thinking_chain`目录和核心模块开始。

## 4. 配置

在 `settings.json` 中，用户可以进行如下配置：

```json
"multiAgent.roles": [
    {
        "name": "Orchestrator",
        "model": "gpt-4-turbo",
        "useThinkingChain": true, // 启用思维链
        "thinkingModel": "ULTIMATE_THINKING_CHAIN_V3" // 指定使用的思考模型
    },
    {
        "name": "Worker",
        "model": "gpt-4-turbo",
        "useThinkingChain": false // 禁用思维链
    }
]
```

## 5. 风险与缓解

- **性能**: 完整的15步思考会增加延迟。
  - **缓解**: 默认只在任务开始时进行一次全局思考。提供配置选项，允许简化思考流程（例如，只执行关键的5个步骤）。
- **成本**: 会增加Token消耗。
  - **缓解**: 通过UI让用户明确知晓成本变化，并提供开关。在内部思考循环中，尽量精简上下文。