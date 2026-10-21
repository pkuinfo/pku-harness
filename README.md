# PKU Harness

[![CI](https://github.com/pkuinfo/pku-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/pkuinfo/pku-harness/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-8B0012.svg)](LICENSE)

**北大校园生活的 AI 原生 App。** 登录一次北大账号，课表、校园卡、网费、树洞、教学网、财务、空间预约……
都交给一个跑在你手机上的 AI 助手。App 本身只是一个 **harness**（智能体运行框架 + 设计系统 + 宿主服务），
所有能力都来自 **插件**——内置的和社区的一律平等。

An open-source, AI-native app for campus life at Peking University. The app is a **harness**:
an agent loop, a design system and host services. All content comes from **plugins**, and every
plugin is equal, whether it ships in the app or comes from the community.

## 特性 · Features

- **对话 Chat**：流式回答，调用插件工具，在对话里生成原生界面（表单、选择器、卡片）。
  多会话（自动标题、后台继续回复、编辑重发），`/` 命令（中文别名），附件与长文本，排队发送，
  会话内切换模型；上下文自动压缩，用量与上下文占用可视化。
- **看板 Dashboard**：AI 帮你搭、帮你维护的组件，数据实时更新。
- **日程 Schedule**：课表、待办、提醒，支持「每 3 天，共 16 次」这样的自由重复，系统闹钟精确送达。
- **设置 Settings**：AI 服务（默认 DeepSeek，任何 OpenAI 兼容接口）、插件与按效果授权（读 / 写 / 花钱 /
  公开）、插件市场、记忆、通知、外观、数据。

凭据和数据都留在手机上：自带模型 Key，我们没有任何服务器能看到它。
Credentials and data stay on the phone. Bring your own model key; no server of ours sees it.

## 仓库 · Repos

| Repo | |
|---|---|
| 本仓库 / this repo | App 本体（Expo SDK 58 / React Native 0.88，Android 优先） |
| [`pkuinfo/pku-harness-plugins`](https://github.com/pkuinfo/pku-harness-plugins)（子模块 `./plugins`） | SDK、全部插件、插件市场注册表——**想接入校园服务请从这里开始** |
| [`pkuinfo/pkucli`](https://github.com/pkuinfo/pkucli) | 北大各服务协议的参考实现（Rust CLI） |

## 文档 · Docs

[架构 Architecture](docs/ARCHITECTURE.md) · [Agent harness（会话 / 命令 / 输入框 / 上下文 / 用量）](docs/AGENT-HARNESS.md) ·
[设计 Design](docs/DESIGN.md) · [路线图 Plan](docs/PLAN.md) · [生态 Ecosystem](docs/ECOSYSTEM.md) ·
[代码约定 AGENTS.md](AGENTS.md) · [参与贡献 Contributing](CONTRIBUTING.md) · [安全 Security](SECURITY.md)

## 代码结构 · Layout

```
src/
  app/            路由（Expo Router）：tabs、sheets、modal screens
  screens/        页面主体：chat/（composer/、sessions、commands menu…）、usage/、settings/、welcome/
  components/     设计系统组件：Text、Button、Glass、AgentOrbit、charts/、context-ring…
  core/
    agent/        run.ts（Agent 循环）、tools.ts、provider.ts
      session/    会话存储、会话 API、自动标题
      context/    系统提示、每轮上下文、压缩、预算、token 估算
      attachments/
    commands/     / 命令注册、解析、内置命令
    usage/        用量记录与聚合
    campus/       IAAA 登录、校园 HTTP 会话、各服务适配器
    runtime/      插件注册表、权限、远程插件（MCP）
    scheduler/ dashboard/ timetable/ todo/ store/
  theme/          设计令牌（颜色、字体、间距、圆角、动效）
modules/          自有 Expo 原生模块（campus-http）
plugins/          子模块：SDK + 插件
docs/             设计与架构文档
```

## 开发 · Develop

```bash
git clone --recurse-submodules https://github.com/pkuinfo/pku-harness.git
cd pku-harness
bun install
bun run check          # typecheck + lint
bun test               # unit tests (scheduler, compaction, commands, usage, parsers…)
bun run android        # dev build on an emulator/device (JDK 17 + Android SDK)
bunx expo start --dev-client
```

插件在 `plugins/` 子模块里：先在那里提交并推到 `pku-harness-plugins`，再在这里提交子模块指针。
Plugins live in the `plugins/` submodule: change them there, push to `pku-harness-plugins`, then
commit the submodule bump here.

### 没有校园网或模型 Key 也能开发 · Testing without campus access or a model key

- Dev-only deep links run tools and chat turns on a device:
  `pkuharness://dev?tool=scheduler.preview&input=<json>` and `pkuharness://dev?chat=<text>`
  (`&actor=agent` exercises the ask-first prompts).
- Point **AI 服务 → OpenAI 兼容** at any OpenAI-compatible server (a local mock works) to
  exercise the agent loop end to end.
- `plugins/examples/demo-canteen` is a runnable remote (MCP) plugin.
- If your machine runs a system proxy (Clash etc.), start the Android emulator without
  inheriting `HTTP_PROXY`, or campus services can't be reached directly.

## 参与 · Contributing

欢迎 issue 和 PR。请先读 [CONTRIBUTING.md](CONTRIBUTING.md)；安全问题请按 [SECURITY.md](SECURITY.md) 私下报告；
参与即同意 [行为准则](CODE_OF_CONDUCT.md)。

## License

[MIT](LICENSE)
