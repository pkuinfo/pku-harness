# Agent harness: sessions, commands, composer, context, usage

Design spec (2026-10-20) for the conversation core. References: DeepSeek Harness
(`../deepseek-harness`: session log, `/` commands, compaction, token meter) and the Claude
mobile app (composer, model picker, attachments, reply actions). Everything here is phone-first:
one hand, thumb reach, flaky network, app killed at any moment, battery and data cost.

Rules that apply everywhere:

- **Nothing is silently lost.** Drafts, queued messages, partial replies, sessions survive an
  app kill. Anything cut short says so ("已停止", "已中断") and offers a retry.
- **The model never sees UI-only things** (notices, compaction markers, command lines), and the
  user always sees everything the model did (tool calls, compaction).
- **Never block the JS thread** with per-token work; never move the list under a finger.
- **Copy is Chinese, short, no exclamation marks.** Numbers use thin formatting: `12.4k`,
  `1,234 字`, `86%`.
- **Expo APIs**: read the versioned docs first (https://docs.expo.dev/versions/v58.0.0/, LLM
  index https://docs.expo.dev/llms.txt). Add packages with `bunx expo install`.

Shared types/contracts already in the code: `src/core/agent/chat-store.ts` (parts incl.
`attachment`, `notice`, `compaction`; `role: 'event'`; `TurnMeta`), `src/core/agent/sessions.ts`,
`src/core/agent/compaction.ts`, `src/core/agent/tokens.ts`, `src/core/usage/index.ts`,
`src/core/commands/types.ts`, SDK `ProviderModel.contextWindow/inputModalities` and
`Contributions.commands`. Signatures there are fixed; implementations replace the stubs.

---

## 1. What the harness is

The app is a harness: an agent loop plus a plugin runtime. A **session** is one conversation
with its own model-visible history; plugins give the agent tools; the harness manages the
context window, records usage, and renders everything natively. Compared with DeepSeek Harness
we keep its ideas (append-only "model-visible means logged", local commands, cache-friendly
compaction, token meter) and drop desktop-only ones (cwd, sandbox, shell jobs, fork trees).

## 2. Sessions

**Model** (`SessionMeta` in `sessions.ts`): id, title (+ source fallback/auto/user), created/
updated, pinned, preview, providerId/model (per session), messageCount, status, unread.

**Storage**: migration **2** extends the existing (unused) `sessions` table with
`pinned INTEGER, title_source TEXT, preview TEXT, provider_id TEXT, model TEXT,
message_count INTEGER, unread INTEGER`. Messages + model history per session as one JSON
record in `kv('session')` key `<id>` (`{ messages, history, draft? }`), saved debounced
(400 ms) and flushed on app background. On first launch after upgrade, `kv('chat')/current`
becomes the first session (title fallback from its first message), then is deleted.

**Lifecycle**

- App start opens the most recently updated session. 新对话 creates a session, but reuses the
  active one if it is still empty (no duplicates of empty sessions).
- **Auto title**: after the first assistant reply completes, one cheap request (same provider,
  `purpose: 'title'`, no tools, ≤ 64 output tokens): "用不超过 12 个汉字概括这段对话的主题，只输出
  标题，不要标点和引号". Until then the fallback is the first 16 chars of the first user message.
  A user rename (`titleSource: 'user'`) is never overwritten.
- **Background replies**: a reply keeps streaming into *its* session when the user switches
  away. The run loop writes by session id, never "the active session". When it finishes in a
  non-active session: `unread = true`; if the app is backgrounded, a local notification
  "<title> · 回复好了" that opens that session. One reply streams at a time per session; replies
  in different sessions may overlap.
- **Interrupted turns on load**: any tool part still `running` and any assistant message still
  streaming when loaded becomes `error: '已中断'` / `meta.ended = 'interrupted'`, with the
  existing 重试 row. (Today these spin forever.)
- **Delete**: swipe left on a row → 删除; no confirm dialog, instead a 5 s snackbar
  "已删除「标题」 撤销". Deleting the active session opens the next most recent one (or a new
  empty one). Deleting a streaming session stops its reply first.
- **Edit & resend** (Claude app): long-press a user message → 编辑 / 复制. 编辑 puts its text
  (and attachments) back in the composer with a banner "编辑消息 ✕"; sending truncates the
  session from that message (UI and model history) and sends the edited one. Forking is out
  of scope.

**Sessions sheet** (header left button; `/sessions`):

- Search field at top (filters title + preview, instant).
- Sections: 置顶, 今天, 昨天, 7 天内, 更早. Rows: title (1 line), preview (1 line, muted),
  relative time right; streaming → small `AgentOrbit` in place of the time; unread → accent dot.
- Tap opens (sheet closes, list lands at the end). Long-press → menu 重命名 / 置顶 / 删除.
  Swipe left → 删除. Rename is an inline text field in the row, 完成 on the keyboard saves.
- Header of the chat shows the session title (tap = rename), not the app name; the subtitle
  stays `provider · model`.
- The header button shows a badge orbit while any *other* session is streaming and a dot when
  one is unread.

## 3. Slash commands

**Registry** (`src/core/commands/`): built-ins + plugin contributions (`contributes.commands`).
Commands run locally and never reach the model, except prompt commands, which send their
expanded text as a normal user message. Plugin name collisions become `plugin:name`.

**Parsing**: a draft whose first line starts with `/name` or `/alias` (case-insensitive,
followed by whitespace or end) is a command; the rest is `input` (trimmed). Unknown `/xyz` is
sent as plain text. Commands are not added to the model history; local ones leave a notice.

**Built-ins** (name · aliases · behaviour):

| Command | Aliases | Behaviour |
|---|---|---|
| `/new` | 新对话 | New session (reuses an empty active one). |
| `/sessions` | 会话 历史 | Open the sessions sheet. |
| `/rename <标题>` | 重命名 | Rename active session; no input → start inline rename in the header. |
| `/compact` | 压缩 | `compactNow()`; notice "已压缩 32 条消息 · 18.2k → 2.1k tokens" or "还没有可以压缩的内容". idleOnly. |
| `/context` | 上下文 | Open the context sheet (§6.3). |
| `/usage` | 用量 统计 | Open the usage screen (§6.4). |
| `/model` | 模型 | Open the model picker sheet (§4.5). |
| `/retry` | 重新生成 | Regenerate the last reply. idleOnly. |
| `/copy` | 复制 | Copy the last reply's text; notice "已复制". |
| `/export` | 导出 | Share the session as Markdown (system share sheet). |
| `/tasks` | 任务 提醒 | Open the scheduled tasks list (schedule tab). |
| `/memory` | 记忆 | Open the memory plugin screen. |
| `/plugins` | 插件 | Open Settings → 插件. |
| `/help` | 帮助 | Notice listing commands. |

Plugin examples: campus-card `/balance` (余额, prompt "校园卡还剩多少钱？"), timetable `/today`
(今天 课表, prompt "今天有什么课？"), treehole `/treehole <关键词>` (树洞, prompt
"在树洞搜索「{{input}}」并总结").

**Menu** (opens when the draft starts with `/` and the cursor is still in the command token):

- A card floating directly above the composer, same width, max 5.5 rows visible (scrolls),
  rounded `lg`, solid elevated surface + hairline + float shadow; enters with fade + 8 px rise.
- Rows: 20 px icon, `/name` (bodyStrong), first alias as a muted chip, description (caption,
  1 line). Group headers (micro, muted): 会话 / 上下文 / 应用 / 插件.
- Filtering: ordered-subsequence match over name and aliases (pinyin not required); prefix
  matches first, then by score; empty query = all, grouped. No match → menu hides.
- Tap: command with `argHint` → draft becomes `/name ` with the token styled as a chip and
  `argHint` as ghost text; otherwise run immediately and clear the draft. Light haptic.
- During a reply, idleOnly commands show disabled with "回复结束后可用".
- Results: notice rows (`role: 'event'`) — centered, caption, muted, leading icon by tone.

## 4. Composer

### 4.1 Layout

One rounded box above the tab bar (rides the keyboard as today):

```
┌───────────────────────────────────────────┐
│ [attachment tray: 56 px thumbnails / chips ✕]│   (only when there are attachments)
│ 问点什么，或让我帮你做点什么…              ⤢ │   (text, 1–6 lines, expand when > 6)
│ (+)  Flash ▾   ◔                 1,234 字 (➤) │
└───────────────────────────────────────────┘
```

`+` attach menu · model pill · context ring (§6.2) · char counter (only > 1,000 chars) ·
send/stop. Queue chips (§4.4) sit above the box. Return inserts a newline (mobile
convention); sending is the button only.

### 4.2 Attachments

- `+` opens a sheet: 拍照, 相册 (multi-select, up to 4), 文件, and 输入命令 (inserts `/`).
  Images are offered only if the session's model lists `image` in `inputModalities`; otherwise
  the rows are disabled with "当前模型不支持图片（可切换到 Flash）".
- Images: resize to ≤ 1568 px long side, JPEG 0.8, copied into
  `documentDirectory/attachments/<id>.jpg`. Tray thumbnail 56 px, radius `md`, ✕ badge; tap
  opens a full-screen preview. Sent to the model as an image part (base64).
- Files: document picker. Text-like (`txt md csv json log`, ≤ 200 KB) become `text`
  attachments (content inline); anything else → toast "暂不支持这种文件" and not attached.
- Max 8 attachments per message; over that the pickers say so.
- Text attachments reach the model as `<attachment name="…">…</attachment>` appended to the
  user content; the chat shows only the chip. In sent bubbles, attachments render above the
  text (images as a 2-column grid, chips for text/files).

### 4.3 Long input

- **Paste**: a single change inserting > 2,000 chars or > 40 lines becomes a text attachment
  chip "粘贴的文本 · 3,214 字 · 86 行" (first line as preview) instead of flooding the input.
  Tap the chip → full-screen preview with 移回输入框 / 删除.
- **Typing long**: input grows to 6 lines, then scrolls; an expand button ⤢ appears top-right →
  full-screen editor sheet (large input, counter, 完成 returns the text).
- Counter shows from 1,000 chars. Hard limit 100,000 chars per message: counter turns `down`,
  send disabled, hint "内容太长，可以作为附件发送".

### 4.4 Send, stop, queue

- Idle: send (accent) enabled when there is text or an attachment. Light haptic on send.
- Streaming, empty draft: the button is **stop** (square). Stopping keeps the partial reply,
  marks it `meta.ended = 'stopped'` with footer "已停止" and 重新生成.
- Streaming, non-empty draft: **stop** (secondary) and **send** (primary, queue icon) side by
  side. Sending queues the message: it appears as a chip above the composer
  "排队中 · 帮我查一下明天的课" (1 line, ✕ to remove, tap to pull back into the composer).
  Several queue in order. When the reply ends normally, the next queued message is sent
  automatically. If the user stopped the reply or it errored, the queue **pauses**: chips show
  "已暂停" and a 继续发送 button.
- Queue and draft are per session and persist across app restarts.

### 4.5 Model / provider switcher

- The pill shows the short model name (`Flash`, `Pro`, or the id truncated) for the session.
- Tap → bottom sheet: ready providers first, each with its models (name, description, context
  window "1M", `图片` badge if multimodal, check on the current). Not-ready providers show
  "去设置" and navigate to AI settings. Selecting applies to this session from the next request
  and becomes the default for new sessions. Mid-reply: notice "下一条消息起使用 Pro".
- `/model` opens the same sheet.

### 4.6 Drafts

Per-session draft (text + attachments) saved on change (debounced) and restored when the
session opens; cleared on send.

## 5. Context management

### 5.1 Cache-friendly prompt

DeepSeek caches by prefix. The system prompt must be **static**: move "当前时间" and other
per-turn facts out of it into the turn's `<context>` block (first line
`当前时间：2026-10-20 周二 21:40（北京时间）`). Tools are sorted by id so the tool block is stable.
Plugin instructions stay in the system prompt (they change only when plugins change).

### 5.2 Token estimate

`estimateTokens`: CJK characters × 0.6 + other characters ÷ 4, + 4 per message/part. Session
size = last provider-reported `inputTokens` for that session (if no compaction since) + the
estimate of what was appended after it; otherwise the full estimate.

### 5.3 Budget

Auto-compaction threshold = min(0.8 × model window, user budget). User budget (Settings → AI
服务 → 上下文预算): 32k / **64k (default)** / 128k / 256k / 不限. Rationale: a 1M window is
slow and costly on a phone; a campus assistant rarely needs it. Keep tail = 25 % of the budget.

### 5.4 Compaction

1. **Prune** (no model call): tool results outside the tail longer than 6,000 chars → first
   3,000 + `\n…（中间省略）…\n` + last 1,000. If now under threshold, stop.
2. **Summarise** with the session's model (`purpose: 'compaction'`). Cache-friendly: same
   system prompt + tools + the history being replaced, then one user message with the
   instruction (below). Reject the result if it is empty or not smaller than what it replaces.
3. **Commit**: model history = `[checkpoint user message, ...tail]`, where the checkpoint is
   `以下是之前对话的摘要（自动生成），请直接接着对话，不要提及摘要本身。\n<compacted-summary>…</compacted-summary>`.
   The cut never splits an assistant tool call from its result and keeps the last user turn
   whole. The UI keeps every old message and inserts a `compaction` event at the cut:
   "已压缩 32 条消息 · 18.2k → 2.1k tokens", tap to expand the summary.
4. **Overflow**: a provider "context too long" error → compact with no tail kept beyond the
   last turn, retry once.

Summary instruction (Chinese, structured; keep exact numbers, names, ids, dates):
`## 用户的目标与偏好`, `## 已确认的事实与数据`, `## 已完成的操作（工具与结果）`,
`## 未完成的事项`, `## 当前进展`, `## 其他重要上下文`. If an earlier
`<compacted-summary>` exists, merge it (keep what is still true, drop stale facts).

`/compact` runs even below the threshold, keeps the last 2 turns.

### 5.5 Tool output capping

When a tool result enters the model history: > 12,000 chars → first 8,000 + last 2,000 +
`（结果过长已截断；完整结果在界面中。需要更多请缩小查询范围再调用）`. The UI tool part keeps the
full output.

### 5.6 Steps

`stopWhen` stays at 10 steps; hitting it adds a notice "已达到单次回复的步骤上限" with 继续.

## 6. Usage and context visualization

### 6.1 Recording

Every model request (each step, plus title/compaction requests) → `recordStep(UsageStep)` into
a `usage` table (migration **3**): `id, at, session_id, provider_id, model, purpose, input,
cached_input, output, reasoning, duration_ms, tools TEXT(JSON)`. The turn's totals go into the
assistant message's `meta`. `recordStep` never throws.

### 6.2 Context ring (composer)

18 px ring next to the model pill: fill = session tokens / budget; colour `textFaint` < 60 %,
`warn` 60–85 %, `down` ≥ 85 %. Hidden in an empty session. Tap → context sheet.

### 6.3 Context sheet (`/context`)

- Big number `38.2k / 64k`, caption "模型上下文 1M · 超过预算会自动压缩较早的对话".
- One stacked horizontal bar + legend with values: 系统提示, 工具定义, 插件上下文, 对话,
  工具结果. Below: "已压缩 2 次".
- Actions: 压缩上下文 (secondary), 新对话 (ghost).

### 6.4 Usage screen (`/usage`, Settings → 用量)

Top to bottom:

1. **KPIs** (2×2 tiles): 今天 tokens, 本月 tokens, 缓存命中率 (cached ÷ input, last 30 days),
   本月对话轮数.
2. **Activity heat map**: last 20 weeks × 7 days, GitHub-style, cell = chat turns that day,
   5 levels of the accent (alpha ramp, level 0 = `surface2`), month labels on top, 一 三 五 on
   the left, scrolled to today. Tap a cell → tooltip "10月19日 周一 · 23 轮 · 41.2k tokens".
3. **Hour of day**: 24 thin bars of turns per hour (last 30 days) — when the user leans on it.
4. **Tokens, last 14 days**: stacked bars: 缓存命中输入 / 未缓存输入 / 输出.
5. **Plugins and tools**: ranked list (calls, success %, mini bar), range segmented 7 天 / 30 天 / 全部.
6. **Models**: share of tokens per model.

No money shown (no reliable pricing yet); tokens only. Empty state: "还没有用量数据".

### 6.5 Reply stats

Tap the resting orbit in a reply footer → a caption line toggles under it:
`Flash · 9.2s · 输入 12.4k（缓存 86%）· 输出 860`.

## 7. Build plan and ownership

Stage 1 runs in parallel; agents edit only the files they own, run `bun run check` scoped to
their files (others may be mid-edit), do not commit, do not use the emulator.

| Agent | Owns |
|---|---|
| Sessions | `src/core/agent/sessions.ts`, `chat-store.ts`, `run.ts`, new `title.ts`, migration 2, `src/screens/chat/sessions-sheet.tsx`, `src/screens/chat/index.tsx` (header + mounting), `message.tsx` (notice/compaction/attachment rendering, edit & resend menu, reply stats) |
| Composer | `src/screens/chat/composer.tsx` + new `src/screens/chat/composer/*`, `src/core/agent/attachments.ts`, model picker sheet, package installs |
| Commands | `src/core/commands/*` (registry, built-ins, parser), `src/screens/chat/command-menu.tsx`, plugin command registration in `src/core/runtime/registry.ts`, plugin commands in the plugins repo |
| Usage | `src/core/usage/*`, `src/core/agent/tokens.ts`, migration 3, `src/screens/usage/*`, `src/app/usage.tsx`, `src/app/context.tsx`, `src/components/context-ring.tsx`, Settings row |
| Context | `src/core/agent/compaction.ts`, `system-prompt.ts`, `context.ts`, budget setting in `src/screens/settings/ai.tsx` |

Stage 2 (lead): wire everything in `run.ts`/`index.tsx`, native rebuild for new packages,
device verification in both themes, docs/PLAN.md.
