<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/brand/lockup-white.svg">
  <img src="assets/brand/lockup-red.svg" alt="PKU harness" width="360">
</picture>

**A pluggable, keyless, unified agent harness on your phone.**

开源、AI 原生的北京大学校园生活应用。

[![CI](https://github.com/pkuinfo/pku-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/pkuinfo/pku-harness/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/pkuinfo/pku-harness?color=8B0012)](https://github.com/pkuinfo/pku-harness/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Discussions](https://img.shields.io/github/discussions/pkuinfo/pku-harness)](https://github.com/pkuinfo/pku-harness/discussions)

[官网](https://pkuharness.com) · [下载](https://pkuharness.com/download) · [文档](https://pkuharness.com/docs) · [插件市场](https://pkuharness.com/marketplace) · [插件仓库](https://github.com/pkuinfo/pku-harness-plugins) · [讨论区](https://github.com/pkuinfo/pku-harness/discussions)

[English](README.md) · 简体中文

</div>

<p align="center">
  <img src="https://pkuharness.com/showcase/chat-dark.zh.png" width="19%" alt="对话" />
  <img src="https://pkuharness.com/showcase/dashboard-widgets-dark.zh.png" width="19%" alt="仪表盘" />
  <img src="https://pkuharness.com/showcase/schedule-dark.zh.png" width="19%" alt="日程" />
  <img src="https://pkuharness.com/showcase/plugins-dark.zh.png" width="19%" alt="插件" />
  <img src="https://pkuharness.com/showcase/settings-dark.zh.png" width="19%" alt="设置" />
</p>

---

用北大账号登录一次，就能把课表、校园卡、网费、树洞、课程、财务和房间预约交给手机上的 AI 助手。

应用本身只是一个 **harness**：智能体循环、设计系统和一组宿主服务。所有能力都来自**插件**，内置插件和社区插件地位相同。

## 为什么做它

北大的校园服务分散在十几个网站上，各有各的登录方式和怪癖。PKU harness 用一个智能体统一接入它们：

- **可插拔**：每个校园服务都是一个插件，即一份可读的 `PLUGIN.md` 文档，可以通过链接安装、分享、审阅，也可以自己写。新增服务无需发布新版应用。
- **无钥匙**：校园密码、验证器密钥和模型 API Key 只保存在手机的安全存储里。没有我们的账号体系，我们的服务器也看不到你的对话。
- **统一**：对话、仪表盘、日程和设置是同一个系统。你能点按完成的事，智能体都能作为工具调用完成，反之亦然。

## 功能

- **对话与智能体**：流式回答，调用插件工具，并在对话中渲染原生界面（表单、选择器、卡片、结账）。多会话、`/` 命令、消息排队、按会话选模型、自动压缩上下文、用量与缓存命中统计。自带模型 Key（默认 DeepSeek，也支持硅基流动、阿里云百炼或任意 OpenAI 兼容服务）。可读取图片、PDF、Word、Excel、PowerPoint 和音频附件。语音输入使用你自己的语音转写 Key，录音转写后即删除。所有设置组成一个**设置注册表**，设置页面和智能体读写的是同一份数据，密钥类设置只能由你在界面中修改。
- **仪表盘**：在对话里让助手搭建和维护小组件，实时显示校园卡余额、网费、食堂人流、截止日期等。
- **日程**：从教务同步课表，加上待办和提醒。支持自由的重复规则（“两天后”“每 3 天一次，共 16 次”），由系统闹钟准点送达；助手还能在对话中为你创建定时检查，例如“每天早上检查校园卡，余额低于 ¥100 就提醒我”。
- **Copilot（手机操控）**：可选插件，让智能体逐步操作你允许的其他 Android 应用，悬浮面板随时可暂停或接管。点按和按键通过 shell 输入完成，无障碍服务只用于观察屏幕和核验结果。支付等敏感步骤交还给你。见 [docs/COPILOT.md](docs/COPILOT.md)。
- **插件与插件市场**：插件是带 `PLUGIN.md` 的文件夹，由应用解释执行的 YAML 步骤和安全表达式构成，不运行任意代码；通过链接（`pkuharness://plugin?src=…`）安装，更新即数据。另支持 MCP 远程插件。[插件市场](https://pkuharness.com/marketplace)会索引 GitHub 上的插件仓库，安装前展示其可访问的全部范围。
- **隐私与安全**：每个工具都声明其效果（读取、修改、付款、公开发布），你可以按插件选择助手直接执行、先询问或禁止。插件只拿到限定范围的校园会话，拿不到密码。**PKU harness Cloud** 为可选服务，提供端到端加密的中继与存储，例如把校园卡付款码借给朋友（带消费上限和 PIN）。JavaScript 更新经签名后空中下发，原生版本以签名 APK 发布。

## 快速开始

**使用**：Android 7.0 及以上（arm64），从 [pkuharness.com/download](https://pkuharness.com/download) 或 [GitHub Releases](https://github.com/pkuinfo/pku-harness/releases/latest) 下载。需要北大账号和一个模型服务的 API Key。

**开发**：需要 [Bun](https://bun.sh)、JDK 17、Android SDK 以及模拟器或真机。一律使用 bun / bunx，不要用 npm、npx、yarn 或 pnpm。

```bash
git clone --recurse-submodules https://github.com/pkuinfo/pku-harness.git
cd pku-harness
bun install
bun run verify     # 类型检查 + lint + 测试，与 CI 完全一致
bun run android    # 在模拟器或真机上构建开发版
```

**写插件**：接入新的校园服务一般不需要改动本仓库。在[插件仓库](https://github.com/pkuinfo/pku-harness-plugins)写一份 `PLUGIN.md`，用 `bun run plugin validate|run|test <目录>` 在电脑上检查，然后在应用里通过链接安装。参见[开发者文档](https://pkuharness.com/docs)和[插件语言规范](docs/PLUGIN-LANGUAGE.md)。

## 参与贡献

欢迎提交 issue 和 pull request，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)（英文）。提问和交流请到 [Discussions](https://github.com/pkuinfo/pku-harness/discussions)，求助渠道见 [SUPPORT.md](SUPPORT.md)，安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。参与者须遵守[行为准则](CODE_OF_CONDUCT.md)。

## 许可与致谢

[MIT](LICENSE)，第三方组件以其自带的许可声明为准。PKU harness 是学生项目，与北京大学无隶属关系，也未获其背书。

致谢 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)、[pkucli](https://github.com/pkuinfo/pkucli)、[Mobile Next](https://github.com/mobile-next/mobile-mcp)、[Mika](https://github.com/wangzan101/Mika) 和 [DSH Go](https://github.com/ccch1mneyyy/dsh-go)。完整致谢与第三方代码许可说明见[英文 README](README.md#acknowledgments)。
