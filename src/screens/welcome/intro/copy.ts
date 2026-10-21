export type IntroPage = { kicker: string; title: string; body: string };

/** Intro copy: Chinese, short, no exclamation marks. */
export const PAGES: IntroPage[] = [
  { kicker: 'PKU HARNESS', title: '整个燕园，\n一个入口', body: '登录一次，课表、校园卡、网费、树洞，都交给一个懂你的助手。' },
  { kicker: '对话即操作', title: '说一句，\n它就去做', body: 'AI 直接调用校园服务；需要你确认时，它会生成原生表单。' },
  { kicker: '看板', title: '关心的数字，\n一眼看到', body: '告诉 AI 想盯住什么，它会搭好看板并保持更新。' },
  { kicker: '提醒', title: '准时，\n精确到分钟', body: '「每 3 天，共 16 次」也能听懂，由本机的系统闹钟准时送达。' },
  { kicker: '一切皆插件', title: '我们做框架，\n内容来自社区', body: '每个能力都是插件，内置与社区平等。凭据只留在你的手机上。' },
];
