import { zoneOffset } from '@pku-harness/sdk';

import type { Locale } from '@/i18n';

/**
 * Time zones offered in Settings › 时区. Hermes has no `Intl.supportedValuesOf('timeZone')`, so
 * the list is curated: one well-known city per zone people actually live in, named in both app
 * languages. `keywords` widens search (country names, other cities on the same clock). Any IANA
 * id the runtime resolves still works if it is already saved; the list is only what we offer.
 */
export type ZoneEntry = { id: string; zh: string; en: string; keywords?: string };

export const ZONES: ZoneEntry[] = [
  { id: 'Pacific/Honolulu', zh: '檀香山', en: 'Honolulu', keywords: '夏威夷 Hawaii' },
  { id: 'America/Anchorage', zh: '安克雷奇', en: 'Anchorage', keywords: '阿拉斯加 Alaska' },
  { id: 'America/Los_Angeles', zh: '洛杉矶', en: 'Los Angeles', keywords: '旧金山 西雅图 San Francisco Seattle 美国 USA Pacific' },
  { id: 'America/Vancouver', zh: '温哥华', en: 'Vancouver', keywords: '加拿大 Canada' },
  { id: 'America/Phoenix', zh: '菲尼克斯', en: 'Phoenix', keywords: '亚利桑那 Arizona' },
  { id: 'America/Denver', zh: '丹佛', en: 'Denver', keywords: 'Mountain' },
  { id: 'America/Chicago', zh: '芝加哥', en: 'Chicago', keywords: '休斯顿 达拉斯 Houston Dallas Central' },
  { id: 'America/Mexico_City', zh: '墨西哥城', en: 'Mexico City', keywords: '墨西哥 Mexico' },
  { id: 'America/Bogota', zh: '波哥大', en: 'Bogotá', keywords: '哥伦比亚 Colombia' },
  { id: 'America/Lima', zh: '利马', en: 'Lima', keywords: '秘鲁 Peru' },
  { id: 'America/New_York', zh: '纽约', en: 'New York', keywords: '波士顿 华盛顿 Boston Washington 美国 USA Eastern' },
  { id: 'America/Toronto', zh: '多伦多', en: 'Toronto', keywords: '蒙特利尔 Montreal 加拿大 Canada' },
  { id: 'America/Halifax', zh: '哈利法克斯', en: 'Halifax', keywords: 'Atlantic' },
  { id: 'America/Santiago', zh: '圣地亚哥', en: 'Santiago', keywords: '智利 Chile' },
  { id: 'America/St_Johns', zh: '圣约翰斯', en: "St. John's", keywords: '纽芬兰 Newfoundland' },
  { id: 'America/Sao_Paulo', zh: '圣保罗', en: 'São Paulo', keywords: '巴西 Brazil 里约 Rio' },
  { id: 'America/Argentina/Buenos_Aires', zh: '布宜诺斯艾利斯', en: 'Buenos Aires', keywords: '阿根廷 Argentina' },
  { id: 'Atlantic/Reykjavik', zh: '雷克雅未克', en: 'Reykjavík', keywords: '冰岛 Iceland' },
  { id: 'UTC', zh: '协调世界时', en: 'Coordinated Universal Time', keywords: 'UTC GMT' },
  { id: 'Europe/London', zh: '伦敦', en: 'London', keywords: '英国 UK Britain 牛津 剑桥 Oxford Cambridge' },
  { id: 'Europe/Dublin', zh: '都柏林', en: 'Dublin', keywords: '爱尔兰 Ireland' },
  { id: 'Europe/Lisbon', zh: '里斯本', en: 'Lisbon', keywords: '葡萄牙 Portugal' },
  { id: 'Africa/Lagos', zh: '拉各斯', en: 'Lagos', keywords: '尼日利亚 Nigeria' },
  { id: 'Europe/Paris', zh: '巴黎', en: 'Paris', keywords: '法国 France' },
  { id: 'Europe/Berlin', zh: '柏林', en: 'Berlin', keywords: '德国 Germany 慕尼黑 Munich' },
  { id: 'Europe/Amsterdam', zh: '阿姆斯特丹', en: 'Amsterdam', keywords: '荷兰 Netherlands' },
  { id: 'Europe/Zurich', zh: '苏黎世', en: 'Zurich', keywords: '瑞士 Switzerland 日内瓦 Geneva' },
  { id: 'Europe/Madrid', zh: '马德里', en: 'Madrid', keywords: '西班牙 Spain 巴塞罗那 Barcelona' },
  { id: 'Europe/Rome', zh: '罗马', en: 'Rome', keywords: '意大利 Italy 米兰 Milan' },
  { id: 'Europe/Stockholm', zh: '斯德哥尔摩', en: 'Stockholm', keywords: '瑞典 Sweden' },
  { id: 'Europe/Warsaw', zh: '华沙', en: 'Warsaw', keywords: '波兰 Poland' },
  { id: 'Africa/Johannesburg', zh: '约翰内斯堡', en: 'Johannesburg', keywords: '南非 South Africa' },
  { id: 'Africa/Cairo', zh: '开罗', en: 'Cairo', keywords: '埃及 Egypt' },
  { id: 'Europe/Athens', zh: '雅典', en: 'Athens', keywords: '希腊 Greece' },
  { id: 'Europe/Helsinki', zh: '赫尔辛基', en: 'Helsinki', keywords: '芬兰 Finland' },
  { id: 'Asia/Jerusalem', zh: '耶路撒冷', en: 'Jerusalem', keywords: '以色列 Israel 特拉维夫 Tel Aviv' },
  { id: 'Europe/Istanbul', zh: '伊斯坦布尔', en: 'Istanbul', keywords: '土耳其 Turkey' },
  { id: 'Europe/Moscow', zh: '莫斯科', en: 'Moscow', keywords: '俄罗斯 Russia' },
  { id: 'Asia/Riyadh', zh: '利雅得', en: 'Riyadh', keywords: '沙特 Saudi Arabia' },
  { id: 'Africa/Nairobi', zh: '内罗毕', en: 'Nairobi', keywords: '肯尼亚 Kenya' },
  { id: 'Asia/Tehran', zh: '德黑兰', en: 'Tehran', keywords: '伊朗 Iran' },
  { id: 'Asia/Dubai', zh: '迪拜', en: 'Dubai', keywords: '阿联酋 UAE 阿布扎比 Abu Dhabi' },
  { id: 'Asia/Karachi', zh: '卡拉奇', en: 'Karachi', keywords: '巴基斯坦 Pakistan' },
  { id: 'Asia/Kolkata', zh: '印度', en: 'India', keywords: '新德里 孟买 加尔各答 New Delhi Mumbai Kolkata' },
  { id: 'Asia/Kathmandu', zh: '加德满都', en: 'Kathmandu', keywords: '尼泊尔 Nepal' },
  { id: 'Asia/Almaty', zh: '阿拉木图', en: 'Almaty', keywords: '哈萨克斯坦 Kazakhstan' },
  { id: 'Asia/Dhaka', zh: '达卡', en: 'Dhaka', keywords: '孟加拉 Bangladesh' },
  { id: 'Asia/Bangkok', zh: '曼谷', en: 'Bangkok', keywords: '泰国 Thailand' },
  { id: 'Asia/Ho_Chi_Minh', zh: '胡志明市', en: 'Ho Chi Minh City', keywords: '越南 Vietnam 河内 Hanoi' },
  { id: 'Asia/Jakarta', zh: '雅加达', en: 'Jakarta', keywords: '印度尼西亚 Indonesia' },
  { id: 'Asia/Shanghai', zh: '北京', en: 'Beijing', keywords: '中国 China 上海 Shanghai 北京时间' },
  { id: 'Asia/Hong_Kong', zh: '香港', en: 'Hong Kong' },
  { id: 'Asia/Macau', zh: '澳门', en: 'Macau' },
  { id: 'Asia/Taipei', zh: '台北', en: 'Taipei' },
  { id: 'Asia/Singapore', zh: '新加坡', en: 'Singapore' },
  { id: 'Asia/Kuala_Lumpur', zh: '吉隆坡', en: 'Kuala Lumpur', keywords: '马来西亚 Malaysia' },
  { id: 'Asia/Manila', zh: '马尼拉', en: 'Manila', keywords: '菲律宾 Philippines' },
  { id: 'Australia/Perth', zh: '珀斯', en: 'Perth' },
  { id: 'Asia/Seoul', zh: '首尔', en: 'Seoul', keywords: '韩国 Korea' },
  { id: 'Asia/Tokyo', zh: '东京', en: 'Tokyo', keywords: '日本 Japan 大阪 京都 Osaka Kyoto' },
  { id: 'Australia/Darwin', zh: '达尔文', en: 'Darwin' },
  { id: 'Australia/Adelaide', zh: '阿德莱德', en: 'Adelaide' },
  { id: 'Australia/Brisbane', zh: '布里斯班', en: 'Brisbane', keywords: '昆士兰 Queensland' },
  { id: 'Australia/Sydney', zh: '悉尼', en: 'Sydney', keywords: '澳大利亚 Australia 堪培拉 Canberra' },
  { id: 'Australia/Melbourne', zh: '墨尔本', en: 'Melbourne' },
  { id: 'Pacific/Auckland', zh: '奥克兰', en: 'Auckland', keywords: '新西兰 New Zealand 惠灵顿 Wellington' },
  { id: 'Pacific/Fiji', zh: '斐济', en: 'Fiji' },
];

const byId = new Map(ZONES.map((z) => [z.id, z]));

/** Display name of a zone: the city in the app language, or the IANA id when it isn't listed. */
export function zoneName(id: string, locale: Locale): string {
  const z = byId.get(id);
  return z ? (locale === 'en' ? z.en : z.zh) : id;
}

/** "UTC+8", "UTC−4", "UTC+5:45", "UTC" (true minus sign, minutes only when non-zero). */
export function formatUtcOffset(minutes: number): string {
  if (minutes === 0) return 'UTC';
  const a = Math.abs(minutes);
  const mm = a % 60;
  return `UTC${minutes < 0 ? '−' : '+'}${Math.floor(a / 60)}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`;
}

/** Offset in minutes of a zone id right now (DST included). */
export const offsetNow = (id: string, now = Date.now()) => zoneOffset({ id }, now);

/**
 * Listed zones matching `query` (city in either language, IANA id or keywords; case-insensitive),
 * west to east by their offset right now, then by name.
 */
export function searchZones(query: string, locale: Locale, now = Date.now()): ZoneEntry[] {
  const q = query.trim().toLowerCase();
  const hit = (z: ZoneEntry) => !q || `${z.zh} ${z.en} ${z.id} ${z.keywords ?? ''}`.toLowerCase().includes(q);
  return ZONES.filter(hit)
    .map((z) => ({ z, off: offsetNow(z.id, now) }))
    .sort((a, b) => a.off - b.off || zoneName(a.z.id, locale).localeCompare(zoneName(b.z.id, locale)))
    .map((x) => x.z);
}
