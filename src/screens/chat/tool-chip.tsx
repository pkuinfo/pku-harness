import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import type { ChatPart } from '@/core/agent/chat-store';
import { registry } from '@/core/runtime/registry';
import { radius, spacing, useTheme } from '@/theme';

/** Compact line showing a tool the agent is running / ran. */
export function ToolChip({ part }: { part: Extract<ChatPart, { type: 'tool' }> }) {
  const c = useTheme();
  const title = registry.tool(part.toolId)?.def.title ?? part.toolId;
  return (
    <View style={[styles.chip, { backgroundColor: c.surface2, borderColor: c.border }]}>
      {part.status === 'running' ? (
        <ActivityIndicator size="small" color={c.accent} />
      ) : (
        <Icon name={part.status === 'error' ? 'warning' : 'check'} size={14} color={part.status === 'error' ? c.down : c.up} />
      )}
      <Text variant="caption" tone={part.status === 'error' ? 'down' : 'muted'} numberOfLines={2} style={{ flexShrink: 1 }}>
        {part.status === 'error' ? `${title}：${part.error}` : title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
});
