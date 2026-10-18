import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { spacing, useTheme } from '@/theme';

/** Chat tab: the agent conversation (docs/ARCHITECTURE.md §5–6). Placeholder until M2. */
export function Chat() {
  const c = useTheme();
  return (
    <Screen title="PKU Harness" subtitle="对话" scroll={false}>
      <View style={styles.body}>
        <EmptyState icon="sparkles" title="今天想让我做什么？" message="查余额、看课表、设提醒，或者让我帮你搭一个看板。" />
      </View>
      <View style={[styles.composer, { borderTopColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <Field placeholder="问点什么…" />
        </View>
        <IconButton icon="send" label="发送" variant="primary" size={44} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
