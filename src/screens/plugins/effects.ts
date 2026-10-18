import type { ChipTone } from '@/components/chip';
import type { IconName } from '@/components/icon';
import type { EffectMode } from '@/core/runtime/plugin-settings';
import type { PluginDef, ToolEffect } from '@/core/runtime/types';

export const EFFECTS: Record<ToolEffect, { label: string; hint: string; tone: ChipTone }> = {
  read: { label: '读取', hint: '查询余额、课表、公告等', tone: 'info' },
  write: { label: '修改', hint: '创建提醒、改设置、提交表单', tone: 'warn' },
  money: { label: '资金', hint: '充值、缴费、付款码', tone: 'down' },
  public: { label: '公开', hint: '发帖、评论等他人可见的操作', tone: 'accent' },
};

export const EFFECT_ORDER: ToolEffect[] = ['read', 'write', 'money', 'public'];

export const MODE_OPTIONS: { label: string; value: EffectMode }[] = [
  { label: '直接执行', value: 'auto' },
  { label: '每次询问', value: 'ask' },
  { label: '禁止', value: 'off' },
];

/** Effects a plugin actually uses, in display order. */
export function effectsOf(plugin: PluginDef): ToolEffect[] {
  const used = new Set(Object.values(plugin.tools).map((t) => t.effect));
  return EFFECT_ORDER.filter((e) => used.has(e));
}

export const pluginIcon = (plugin: PluginDef): IconName => (plugin.icon as IconName | undefined) ?? 'puzzle';
