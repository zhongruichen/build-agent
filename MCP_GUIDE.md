# MCP (Model Context Protocol) 集成指南

## 概述

多智能体助手现已支持 **MCP (Model Context Protocol)**，这是一个标准化协议，用于在 LLM 应用程序和外部系统之间进行通信。通过 MCP 支持，您可以：

- 将外部工具和服务暴露给智能体使用
- 连接到其他 MCP 兼容的服务器
- 通过标准化协议扩展智能体的能力

## MCP 架构

```
┌─────────────────────────────────────┐
│     多智能体助手 (VS Code 扩展)        │
├─────────────────────────────────────┤
│         MCP Manager                 │
│  ┌──────────────┬────────────────┐  │
│  │  MCP Server  │   MCP Client   │  │
│  │  (内部工具)   │   (外部连接)    │  │
│  └──────────────┴────────────────┘  │
└─────────────────────────────────────┘
          ↕                ↕
    [内部工具暴露]    [外部服务连接]
```

## 快速开始

### 1. 启用 MCP 支持

在 VS Code 设置中启用 MCP：

```json
{
  "multiAgent.mcp": {
    "enabled": true
  }
}
```

### 2. 配置 MCP 服务器

#### 示例：连接到文件系统 MCP 服务器

```json
{
  "multiAgent.mcp": {
    "enabled": true,
    "clients": [
      {
        "name": "filesystem",
        "command": "npx",
        "args": ["@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"]
      }
    ]
  }
}
```

#### 示例：连接到 GitHub MCP 服务器

```json
{
  "multiAgent.mcp": {
    "enabled": true,
    "clients": [
      {
        "name": "github",
        "command": "npx",
        "args": ["@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_TOKEN": "your-github-token"
        }
      }
    ]
  }
}
```

### 3. 启动本地 MCP 服务器

您也可以启动本地 MCP 服务器来暴露自定义工具：

```json
{
  "multiAgent.mcp": {
    "enabled": true,
    "servers": [
      {
        "name": "custom-tools",
        "command": "node",
        "args": ["./my-mcp-server.js"]
      }
    ]
  }
}
```

## 内置工具通过 MCP 暴露

扩展自动将以下内置工具通过 MCP 协议暴露：

### 文件系统工具
- `file_write` - 写入文件
- `file_read` - 读取文件
- `file_list` - 列出文件
- `file_summarize` - 文件摘要

### 终端工具
- `terminal_execute` - 执行终端命令

### Git 工具
- `git_current_branch` - 获取当前分支
- `git_create_branch` - 创建新分支
- `git_stage` - 暂存文件
- `git_commit` - 提交更改
- `git_status` - 获取状态

### 调试器工具
- `debug_start` - 启动调试
- `debug_stop` - 停止调试
- `debug_add_breakpoint` - 添加断点
- `debug_remove_breakpoint` - 移除断点
- `debug_evaluate` - 评估表达式

### 智能体协作工具
- `agent_send_message` - 发送消息给其他智能体
- `agent_create_subtask` - 创建子任务

## 开发自定义 MCP 服务器

### 基本示例

创建一个简单的 MCP 服务器 `my-mcp-server.js`：

```javascript
const { MCPServer } = require('./src/mcp/MCPServer');
const { StdioTransport } = require('./src/mcp/transports/StdioTransport');

async function main() {
    // 创建 MCP 服务器
    const server = new MCPServer({
        name: 'my-custom-server',
        version: '1.0.0'
    });
    
    // 注册自定义工具
    server.registerTool({
        name: 'get_weather',
        description: 'Get weather information',
        inputSchema: {
            type: 'object',
            properties: {
                location: { type: 'string' }
            },
            required: ['location']
        },
        handler: async (args) => {
            // 实现您的工具逻辑
            return `Weather in ${args.location}: Sunny, 25°C`;
        }
    });
    
    // 注册资源
    server.registerResource({
        uri: 'weather://current',
        name: 'Current Weather',
        description: 'Current weather data',
        mimeType: 'application/json',
        handler: async () => {
            return JSON.stringify({
                temperature: 25,
                condition: 'sunny'
            });
        }
    });
    
    // 设置传输层
    const transport = new StdioTransport();
    await transport.initialize();
    server.setTransport(transport);
    
    // 初始化服务器
    await server.initialize();
    
    // 监听请求
    transport.on('message', async (message) => {
        const response = await server.handleRequest(message);
        transport.send(response);
    });
}

main().catch(console.error);
```

## MCP 客户端使用

### 连接到 MCP 服务器

```javascript
const { MCPClient } = require('./src/mcp/MCPClient');
const { StdioTransport } = require('./src/mcp/transports/StdioTransport');
const { spawn } = require('child_process');

async function connectToMCPServer() {
    // 启动 MCP 服务器进程
    const serverProcess = spawn('node', ['./my-mcp-server.js']);
    
    // 创建传输层
    const transport = new StdioTransport(serverProcess);
    await transport.initialize();
    
    // 创建并连接客户端
    const client = new MCPClient({ name: 'my-client' });
    await client.connect(transport);
    
    // 列出可用工具
    const tools = client.getTools();
    console.log('Available tools:', tools);
    
    // 调用工具
    const result = await client.callTool('get_weather', {
        location: 'Beijing'
    });
    console.log('Tool result:', result);
    
    // 读取资源
    const resource = await client.readResource('weather://current');
    console.log('Resource:', resource);
}
```

## 高级配置

### 多个 MCP 服务器配置

```json
{
  "multiAgent.mcp": {
    "enabled": true,
    "clients": [
      {
        "name": "filesystem",
        "command": "npx",
        "args": ["@modelcontextprotocol/server-filesystem", "/home/user/documents"]
      },
      {
        "name": "github",
        "command": "npx",
        "args": ["@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_TOKEN": "${env:GITHUB_TOKEN}"
        }
      },
      {
        "name": "slack",
        "command": "python",
        "args": ["-m", "mcp_server_slack"],
        "env": {
          "SLACK_TOKEN": "${env:SLACK_TOKEN}"
        }
      }
    ]
  }
}
```

### 使用环境变量

MCP 配置支持环境变量替换：

```json
{
  "multiAgent.mcp": {
    "clients": [
      {
        "name": "api-server",
        "command": "node",
        "args": ["./api-server.js"],
        "env": {
          "API_KEY": "${env:MY_API_KEY}",
          "API_URL": "${env:API_ENDPOINT}"
        }
      }
    ]
  }
}
```

## 故障排除

### 1. MCP 服务器无法启动

检查日志输出：
- 打开 VS Code 输出面板
- 选择 "多智能体日志" 频道
- 查看 MCP 相关错误信息

### 2. 工具调用失败

确保：
- MCP 服务器正在运行
- 工具名称正确
- 参数格式符合工具的输入模式

### 3. 连接超时

检查：
- 防火墙设置
- 服务器进程是否正常启动
- 命令路径是否正确

## MCP 协议规范

MCP 遵循标准的 JSON-RPC 2.0 协议，支持以下核心方法：

### 初始化
- `initialize` - 初始化连接

### 工具操作
- `tools/list` - 列出可用工具
- `tools/call` - 调用工具

### 资源操作
- `resources/list` - 列出可用资源
- `resources/read` - 读取资源
- `resources/subscribe` - 订阅资源更新
- `resources/unsubscribe` - 取消订阅

### 提示操作
- `prompts/list` - 列出可用提示
- `prompts/get` - 获取提示

### 日志操作
- `logging/setLevel` - 设置日志级别

## 最佳实践

1. **安全性**：仅连接到可信的 MCP 服务器
2. **权限控制**：限制文件系统访问路径
3. **错误处理**：实现健壮的错误处理机制
4. **性能优化**：避免在工具处理中执行长时间操作
5. **日志记录**：记录所有 MCP 交互以便调试

## 示例项目

查看以下示例项目了解更多 MCP 使用方式：

- [基本 MCP 服务器](https://github.com/modelcontextprotocol/servers)
- [文件系统服务器](https://github.com/modelcontextprotocol/server-filesystem)
- [GitHub 集成](https://github.com/modelcontextprotocol/server-github)

## 相关资源

- [MCP 协议规范](https://modelcontextprotocol.io/specification)
- [MCP SDK 文档](https://modelcontextprotocol.io/sdks)
- [MCP 服务器列表](https://github.com/modelcontextprotocol/servers)

## 贡献

欢迎贡献新的 MCP 服务器实现或改进现有集成。请查看项目的贡献指南。

## 许可证

MCP 集成遵循主项目的许可证。