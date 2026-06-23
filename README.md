# AI App Generator

一个 AI 驱动的应用生成平台，开发者通过对话描述需求，AI Agent 实时编写代码并预览运行结果。

![](./assets/demo.png)

## 核心架构：双流程引擎

### 1. 开发流程 — AI 代码生成

```
开发者 ──▶ Web Studio (Generator)
              │
              │  OpenCode SDK (fork 独立进程)
              ▼
         OpenCode 进程 ──▶ 沙箱内读写项目文件
              │
              │  实时流式返回
              ▼
         Web Studio UI ◀── 逐条展示生成日志
```

- 开发者在 Web Studio 对话框中用自然语言描述应用需求
- Generator 通过 **OpenCode SDK** 为每个对话独立 fork 一个 **OpenCode 进程**
- 用户消息转发给 OpenCode，OpenCode 实时返回生成/修改日志，逐条流式推送到前端界面
- Agent **沙箱隔离**：每个 OpenCode 进程仅被允许读写对应项目目录下的文件
- **多会话并行**：多个对话各自持有独立的 OpenCode 进程，互不干扰

### 2. 运行流程 — apiFlow 引擎

```
用户 ──浏览器 / API──▶ apiFlow Service ──▶ Engine 加载项目目录
                                              │
                                    ClassLoader 机制隔离运行
```

- 用户通过浏览器访问或 API 调用 **apiFlow 服务**
- apiFlow 引擎 **独立加载** 对应项目目录的产物
- 采用 **ClassLoader 机制** 实现多项目运行时隔离，各项目之间资源、依赖互不干扰

## 仓库结构

```text
apps/
  api/            # 后端 API 服务（项目编排、Agent 调度、apiFlow 引擎）
  web/            # 前端 Web Studio（对话、文件浏览、预览、工作流编辑）
packages/
  shared/         # 共享类型与工具
templates/
  react-vite/     # 内置 React 模板
  vue-vite/       # 内置 Vue 模板
docs/
  superpowers/    # 设计规范与实现计划
workspaces/       # 生成的应用运行时目录（gitignore）
```

## 本地开发

```powershell
# 安装依赖
pnpm install

# 启动 API 服务
pnpm --filter @ai-app-generator/api dev

# 启动前端
pnpm --filter @ai-app-generator/web dev
```

详见 [docs/local-development.md](docs/local-development.md)。

