import { ActivityIndicator, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import type { ChatPart } from '@/core/agent/chat-store';
import { registry } from '@/core/runtime/registry';
import { useTheme } from '@/theme';

/** Compact line showing a tool the agent is running / ran. */
export function ToolChip({ part }: { part: Extract<ChatPart, { type: 'tool' }> }) {
  const c = useTheme();
  const title = registry.tool(part.toolId)?.def.title ?? part.toolId;
  return (
    <View className="max-w-full flex-row items-center self-start gap-2 rounded-sm border-[0.5px] border-edge bg-surface-2 px-3 py-1.5">
      {part.status === 'running' ? (
        <ActivityIndicator size="small" color={c.accent} />
      ) : (
        <Icon name={part.status === 'error' ? 'warning' : 'check'} size={14} color={part.status === 'error' ? c.down : c.up} />
      )}
      <Text variant="caption" tone={part.status === 'error' ? 'down' : 'muted'} numberOfLines={2} className="shrink">
        {part.status === 'error' ? `${title}：${part.error}` : title}
      </Text>
    </View>
  );
}
