import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { IconButton } from '@/components/button';
import { Text } from '@/components/text';
import type { ChatMessage } from '@/core/agent/chat-store';
import { haptics } from '@/utils/haptics';

/** The status line's glyph, at rest: the spinner settles here when a reply is done. */
const REST_GLYPH = '✻';

/**
 * Quiet row under a finished reply (Claude app style): copy on every reply; on the latest one
 * also the resting glyph and 重新生成. Muted icons only, no labels, so it never competes with
 * the answer.
 */
export function ReplyActions({ message, last, onRegenerate }: { message: ChatMessage; last: boolean; onRegenerate?: () => void }) {
  const text = message.parts
    .map((p) => (p.type === 'text' ? p.text.trim() : ''))
    .filter(Boolean)
    .join('\n\n');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  if (!text && !last) return null;
  return (
    <View className="-ml-2 flex-row items-center gap-1">
      {last ? (
        <Text variant="bodyStrong" tone="accent" className="w-8 text-center" accessibilityElementsHidden importantForAccessibility="no">
          {REST_GLYPH}
        </Text>
      ) : null}
      {text ? (
        <IconButton
          icon={copied ? 'check' : 'copy'}
          label={copied ? '已复制' : '复制回答'}
          variant="ghost"
          size={32}
          onPress={() => {
            void Clipboard.setStringAsync(text);
            haptics.success();
            setCopied(true);
          }}
        />
      ) : null}
      {last && onRegenerate ? <IconButton icon="refresh" label="重新生成" variant="ghost" size={32} onPress={onRegenerate} /> : null}
    </View>
  );
}
