/**
 * The `/` command menu (docs/AGENT-HARNESS.md §3). The composer mounts it directly above itself,
 * in the layout flow (a view drawn outside its parent's bounds gets no touches on Android).
 * Shows while the draft is a leading `/` token being typed; filters by ordered-subsequence
 * match over names and aliases; tap completes (commands with an argHint) or runs.
 */
import { useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion, withSpring, withTiming, type EntryAnimationsValues, type LayoutAnimation } from 'react-native-reanimated';

import { Chip } from '@/components/chip';
import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { COMMAND_GROUPS, isAsciiAlias, menuQuery, rankCommands, useCommands, type Command } from '@/core/commands';
import { useLocale, useT } from '@/i18n';
import { duration, shadows, spacing, springs, typography, useTheme } from '@/theme';
import { cx } from '@/utils/cx';

export type CommandMenuProps = {
  /** The composer's current draft; the menu shows only while it is a `/` token being typed. */
  draft: string;
  /** A reply is streaming (idleOnly commands disabled). */
  busy: boolean;
  /** User picked a command that needs no input: run it now. */
  onRun: (command: Command) => void;
  /** User picked a command with an argHint: replace the draft with this text (`/name `). */
  onComplete: (draft: string) => void;
};

/** Row: py-2 + name line + description line. Measured size, derived from tokens. */
const ROW_HEIGHT = spacing.sm * 2 + typography.bodyStrong.lineHeight + typography.caption.lineHeight;
/** 5.5 rows: the half row says "there is more, scroll". */
const MAX_HEIGHT = ROW_HEIGHT * 5.5;
const RISE = spacing.sm;

/** Fade + 8 px rise; opacity on a short ease, the rise on the `smooth` spring. */
function riseIn(_values: EntryAnimationsValues): LayoutAnimation {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: RISE }] },
    animations: {
      opacity: withTiming(1, { duration: duration.fast }),
      transform: [{ translateY: withSpring(0, springs.smooth) }],
    },
  };
}

type Item = { kind: 'header'; title: string } | { kind: 'command'; command: Command };

export function CommandMenu({ draft, busy, onRun, onComplete }: CommandMenuProps) {
  const commands = useCommands();
  const t = useT();
  const reduced = useReducedMotion();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const query = menuQuery(draft);

  const items = useMemo<Item[]>(() => {
    if (query === null) return [];
    if (query === '') {
      return COMMAND_GROUPS.flatMap((g) => {
        const inGroup = commands.filter((c) => c.group === g);
        return inGroup.length ? [{ kind: 'header' as const, title: t(`chat.commands.groups.${g}`) }, ...inGroup.map((command) => ({ kind: 'command' as const, command }))] : [];
      });
    }
    return rankCommands(commands, query).map((command) => ({ kind: 'command' as const, command }));
    // `t` changes with the language, like `commands`.
  }, [commands, query, t]);

  // A new query shows its best match first.
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [query]);

  if (!items.length) return null;

  const pick = (command: Command) => {
    if (command.argHint) onComplete(`/${command.name} `);
    else onRun(command);
  };

  return (
    <Animated.View
      entering={reduced ? FadeIn.duration(duration.fast) : riseIn}
      exiting={FadeOut.duration(duration.fast)}
      className="mb-2 overflow-hidden rounded-lg border-edge bg-elevated"
      style={{ maxHeight: MAX_HEIGHT, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, boxShadow: shadows.float }}
      accessibilityRole="menu"
      accessibilityLabel={t('chat.commands.menu')}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false} contentContainerClassName="py-1">
        {items.map((item) =>
          item.kind === 'header' ? (
            <Text key={`h:${item.title}`} variant="micro" tone="faint" className="px-3 pb-1 pt-2">
              {item.title}
            </Text>
          ) : (
            <CommandRow key={item.command.name} command={item.command} disabled={busy && !!item.command.idleOnly} onPress={pick} />
          ),
        )}
      </ScrollView>
    </Animated.View>
  );
}

function CommandRow({ command, disabled, onPress }: { command: Command; disabled: boolean; onPress: (c: Command) => void }) {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  // The chip shows an alias in the app language: English ones in English (none if there is none).
  const alias = locale === 'en' ? command.aliases.find(isAsciiAlias) : command.aliases[0];
  const description = disabled ? t('chat.commands.afterReply') : command.description;
  return (
    <PressableScale
      scaleTo={0.98}
      disabled={disabled}
      onPress={() => onPress(command)}
      accessibilityRole="menuitem"
      accessibilityLabel={[`/${command.name}`, alias, description].filter(Boolean).join(t('chat.model.a11ySep'))}
      accessibilityState={{ disabled }}
      className={cx('mx-1 flex-row items-center gap-3 rounded-md px-2', disabled && 'opacity-50')}
      style={{ height: ROW_HEIGHT, borderCurve: 'continuous' }}>
      <Icon name={(command.icon ?? 'puzzle') as IconName} size={20} color={c.textMuted} />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text variant="bodyStrong" numberOfLines={1} className="shrink">
            /{command.name}
          </Text>
          {alias ? <Chip label={alias} /> : null}
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {description}
        </Text>
      </View>
    </PressableScale>
  );
}
