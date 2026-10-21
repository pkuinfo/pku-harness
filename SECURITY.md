# 安全策略 · Security Policy

PKU Harness 在用户手机上保存校园账号凭据、IAAA 手机令牌密钥和 AI 服务 Key，并让 AI 代用户操作校园服务。
我们非常重视安全问题。

## 报告漏洞 · Reporting

**请不要公开提交 issue。** 使用 GitHub 的私密漏洞报告：仓库 → Security → *Report a vulnerability*
（<https://github.com/pkuinfo/pku-harness/security/advisories/new>）。插件相关问题请在
[pku-harness-plugins](https://github.com/pkuinfo/pku-harness-plugins/security/advisories/new) 报告。

请包含：影响范围、复现步骤、版本 / 提交号、你认为的严重程度。**不要附上任何真实的账号、密码、令牌或个人数据**，
用测试数据或打码。

我们会在 7 天内确认收到，修复后在发布说明中致谢（如你愿意）。

## 重点关注 · In scope

- 凭据泄露：SecureStore 之外出现密码 / 令牌密钥 / Cookie / API Key（日志、导出数据、崩溃信息、网络请求）。
- 插件越权：插件拿到不属于它的会话、凭据，或绕过按效果（读 / 写 / 花钱 / 公开）的授权设置。
- 提示注入：校园内容（树洞帖子、公告等）诱导 Agent 执行用户未授权的操作。
- 付款与公开发布类操作在未确认的情况下被执行。
- 远程插件（MCP）与市场注册表的供应链问题。

## 不在范围 · Out of scope

- 学校服务本身的漏洞（请联系学校相关部门）。
- 需要已越狱 / 已 root 设备或物理接触已解锁手机的攻击。
