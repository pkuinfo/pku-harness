/**
 * The verification code inside an SMS (pure, unit-tested). Prefers digits right after a code
 * keyword (验证码 / 校验码 / 动态码 / code / OTP); otherwise the only standalone 4–8 digit group,
 * ignoring phone numbers, dates, times and amounts. Null when it can't tell.
 */
const KEYWORD = /(验证码|校验码|动态码|动态密码|确认码|verification code|code|otp)\D{0,8}?(\d{4,8})(?!\d)/i;

export function extractCode(text: string): string | null {
  const keyed = KEYWORD.exec(text);
  if (keyed) return keyed[2];
  const cleaned = text
    .replace(/1[3-9]\d{9}/g, ' ') // mobile numbers
    .replace(/\d{4}[-/年.]\d{1,2}([-/月.]\d{1,2})?/g, ' ') // dates
    .replace(/\d{1,2}:\d{2}/g, ' ') // times
    .replace(/[¥$]\s*\d+(\.\d+)?/g, ' '); // amounts
  const groups = [...cleaned.matchAll(/(?<!\d)(\d{4,8})(?!\d)/g)].map((m) => m[1]);
  return groups.length === 1 ? groups[0] : null;
}
