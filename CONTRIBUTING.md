# 参与贡献 · Contributing

感谢你愿意为 PKU Harness 出力。这里是 App 本体（harness）的仓库；**校园服务的接入请优先写成插件**，
去 [`pkuinfo/pku-harness-plugins`](https://github.com/pkuinfo/pku-harness-plugins)（本仓库的子模块
`./plugins`）。

Thanks for contributing. This repo is the harness (app shell, agent loop, design system). New
campus services almost always belong in the plugins repo, not here.

## 先读这些

- [AGENTS.md](AGENTS.md)：代码约定（给人和 AI 编码助手共用）
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：分层、插件模型、Agent、存储
- [docs/AGENT-HARNESS.md](docs/AGENT-HARNESS.md)：会话、命令、输入框、上下文、用量
- [docs/DESIGN.md](docs/DESIGN.md)：设计规范（UI 改动必读，含自查清单）
- [docs/PLAN.md](docs/PLAN.md)：路线图与任务状态

## 开发环境

```bash
git clone --recurse-submodules https://github.com/pkuinfo/pku-harness.git
cd pku-harness
bun install            # 一律用 bun / bunx，不要用 npm / npx / yarn / pnpm
bun run check          # 类型检查 + lint
bun test               # 单元测试
bun run android        # 开发版安装到模拟器 / 真机（需要 JDK 17 + Android SDK）
```

- Expo SDK 58：动 Expo / React Native API 之前先读对应版本文档
  <https://docs.expo.dev/versions/v58.0.0/>，不要凭记忆。
- 安卓模拟器如果你开着系统代理（Clash 等），启动模拟器时不要继承 `HTTP_PROXY`，否则校园服务走不了直连。
- 没有校园网或模型 Key 也能开发：见 README 的「Testing without campus access」。

## 工作流程

1. 先开 issue 说明要做什么（小修小补可以直接 PR）。
2. 从 `master` 拉分支，小步提交，提交信息用约定式：`feat(chat): …`、`fix(campus): …`、`docs: …`。
3. 改插件：先在 `plugins/` 子模块里提交并推到 plugins 仓库，再在这里提交子模块指针的更新。
4. 提 PR 前：`bun run check` 和 `bun test` 通过；UI 改动在模拟器上看过**浅色和深色**两种主题，并附截图。
5. 更新 `docs/PLAN.md` 中对应任务的状态。

## 代码与结构

- 路由只放在 `src/app/`，页面主体在 `src/screens/`，基础组件在 `src/components/`，运行时与宿主服务在
  `src/core/`，设计令牌在 `src/theme/`。文件名 kebab-case，一个文件一个主要导出，测试与源码同目录
  （`*.test.ts`）。
- 样式优先 Uniwind className；颜色、字号、间距只用主题令牌，不写字面量。
- 纯逻辑（解析、递推、压缩、聚合）写成纯函数并配单元测试。
- 校园协议参考 [pkucli](https://github.com/pkuinfo/pkucli)，在注释里注明来源文件。

## 安全与隐私（硬性要求）

- 校园账号、密码、令牌密钥、AI Key 只存在手机的 SecureStore：不打日志、不上传、不交给远程插件或模型。
- 提交里不能出现任何真实凭据、学号、个人数据或截图里的隐私信息。
- 发现安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要公开开 issue。

## 行为准则

参与即表示同意遵守 [行为准则](CODE_OF_CONDUCT.md)。
