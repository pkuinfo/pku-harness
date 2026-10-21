/**
 * Intro pages, in order. The copy lives in the `welcome.intro.<page>` dictionary entries
 * (src/i18n/messages/<locale>/welcome.ts): kicker, title (with a deliberate line break), body.
 */
export const PAGES = ['home', 'agent', 'dashboard', 'reminders', 'plugins'] as const;
export type IntroPage = (typeof PAGES)[number];
