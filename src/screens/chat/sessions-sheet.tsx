import { router } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionList, TextInput, View } from "react-native";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AgentOrbit } from "@/components/agent-orbit";
import { Button, IconButton } from "@/components/button";
import { Icon } from "@/components/icon";
import { PressableScale } from "@/components/pressable-scale";
import { Text } from "@/components/text";
import {
  groupSessions,
  relativeTime,
} from "@/core/agent/session/session-utils";
import {
  sessions,
  useActiveSessionId,
  useSessions,
  type SessionMeta,
} from "@/core/agent/session/sessions";
import { shadows, spacing, typography, useTheme } from "@/theme";
import { cx } from "@/utils/cx";
import { haptics } from "@/utils/haptics";

const UNDO_MS = 5000;

const titleOf = (s: SessionMeta) => s.title || s.preview || "新对话";

function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/**
 * Sessions sheet (docs/AGENT-HARNESS.md §2): search, sections 置顶/今天/昨天/7 天内/更早, tap to
 * open, long-press for 重命名/置顶/删除, swipe left to delete with a 5 s undo.
 */
export function SessionsSheet() {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const list = useSessions();
  const activeId = useActiveSessionId();
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Deletes wait out the undo window (and commit when the sheet closes).
  const [pending, setPending] = useState<{ id: string; title: string }[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const commit = useCallback((id: string) => {
    timers.current.delete(id);
    setPending((p) => p.filter((x) => x.id !== id));
    void sessions.remove(id);
  }, []);

  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const [id, t] of live) {
        clearTimeout(t);
        void sessions.remove(id);
      }
      live.clear();
    };
  }, []);

  const remove = useCallback(
    (s: SessionMeta) => {
      haptics.warning();
      setMenuFor(null);
      setPending((p) => [
        ...p.filter((x) => x.id !== s.id),
        { id: s.id, title: titleOf(s) },
      ]);
      timers.current.set(
        s.id,
        setTimeout(() => commit(s.id), UNDO_MS),
      );
    },
    [commit],
  );

  const undo = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setPending((p) => p.filter((x) => x.id !== id));
    haptics.tap();
  }, []);

  const hidden = useMemo(() => new Set(pending.map((p) => p.id)), [pending]);
  const sections = useMemo(
    () =>
      groupSessions(
        list.filter((s) => !hidden.has(s.id)),
        query,
      ).map((g) => ({ title: g.section, data: g.items })),
    [list, hidden, query],
  );

  const open = useCallback(async (id: string) => {
    await sessions.open(id);
    close();
  }, []);

  const newChat = useCallback(async () => {
    await sessions.create();
    close();
  }, []);

  const lastPending = pending.at(-1);

  return (
    <View className="flex-1 bg-elevated">
      <View className="flex-row items-center gap-2 px-4 pt-4 pb-2">
        <Text variant="headline" className="flex-1">
          对话
        </Text>
        <IconButton
          icon="plus"
          label="新对话"
          variant="secondary"
          size={36}
          onPress={() => void newChat()}
        />
        <IconButton
          icon="close"
          label="关闭"
          variant="ghost"
          size={36}
          onPress={close}
        />
      </View>
      <View
        className="mx-4 mb-2 flex-row items-center gap-2 rounded-md border-[0.5px] border-edge bg-surface-2 px-3"
        style={{ borderCurve: "continuous" }}
      >
        <Icon name="search" size={18} color={c.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索对话"
          placeholderTextColor={c.textFaint}
          selectionColor={c.accent}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="搜索对话"
          className="flex-1 py-2"
          style={[typography.body, { color: c.text }]}
        />
        {query ? (
          <IconButton
            icon="close"
            label="清除搜索"
            variant="ghost"
            size={28}
            onPress={() => setQuery("")}
          />
        ) : null}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.sm,
          paddingBottom: insets.bottom + spacing.xxxl,
        }}
        renderSectionHeader={({ section }) => (
          <Text variant="micro" tone="faint" className="px-3 pt-4 pb-1">
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            active={item.id === activeId}
            menuOpen={menuFor === item.id}
            renaming={renaming === item.id}
            onOpen={open}
            onMenu={(id) => {
              haptics.select();
              setMenuFor((m) => (m === id ? null : id));
            }}
            onRename={(id) => {
              setMenuFor(null);
              setRenaming(id);
            }}
            onRenameEnd={() => setRenaming(null)}
            onRemove={remove}
          />
        )}
        ListEmptyComponent={
          <View className="items-center gap-2 px-6 py-12">
            <Icon
              name={query ? "search" : "chat"}
              size={28}
              color={c.textFaint}
            />
            <Text variant="callout" tone="muted" align="center">
              {query ? "没有找到相关对话" : "还没有对话"}
            </Text>
          </View>
        }
      />

      {lastPending ? (
        <Animated.View
          key={lastPending.id}
          entering={FadeInDown.springify()}
          exiting={FadeOut}
          className="absolute right-4 left-4 flex-row items-center gap-3 rounded-lg border-[0.5px] border-edge bg-elevated py-2 pr-2 pl-4"
          style={{
            bottom: insets.bottom + spacing.lg,
            borderCurve: "continuous",
            boxShadow: shadows.float,
          }}
        >
          <Text variant="callout" numberOfLines={1} className="flex-1">
            已删除「{lastPending.title}」
          </Text>
          <Button
            title="撤销"
            size="sm"
            variant="secondary"
            onPress={() => undo(lastPending.id)}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const SessionRow = memo(function SessionRow({
  session: s,
  active,
  menuOpen,
  renaming,
  onOpen,
  onMenu,
  onRename,
  onRenameEnd,
  onRemove,
}: {
  session: SessionMeta;
  active: boolean;
  menuOpen: boolean;
  renaming: boolean;
  onOpen: (id: string) => void;
  onMenu: (id: string) => void;
  onRename: (id: string) => void;
  onRenameEnd: () => void;
  onRemove: (s: SessionMeta) => void;
}) {
  const reduced = useReducedMotion();
  const swipe = useRef<SwipeableMethods>(null);

  return (
    <Animated.View
      layout={reduced ? undefined : LinearTransition.springify()}
      className="mb-0.5"
    >
      <Swipeable
        ref={swipe}
        friction={1.6}
        rightThreshold={48}
        overshootRight={false}
        enabled={!renaming}
        renderRightActions={() => (
          <View className="justify-center pl-2">
            <Button
              title="删除"
              icon="trash"
              size="sm"
              variant="danger"
              onPress={() => {
                swipe.current?.close();
                onRemove(s);
              }}
            />
          </View>
        )}
      >
        <PressableScale
          haptic={false}
          scaleTo={0.985}
          onPress={() => (renaming ? undefined : onOpen(s.id))}
          onLongPress={() => onMenu(s.id)}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={`${titleOf(s)}${s.unread ? "，有新回复" : ""}`}
          accessibilityHint="长按显示更多操作"
        >
          {/* Opaque base: the swipe's delete action sits behind the row and must not show through
              (surface-2 is translucent); the active tint is layered on top of it. */}
          <View
            className="rounded-md bg-elevated"
            style={{ borderCurve: "continuous" }}
          >
            <View
              className={cx(
                "flex-row items-center gap-3 rounded-md px-3 py-2.5",
                active && "bg-surface-2",
              )}
              style={{ borderCurve: "continuous" }}
            >
              <View className="flex-1 gap-0.5">
                {renaming ? (
                  <RenameInput session={s} onEnd={onRenameEnd} />
                ) : (
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {titleOf(s)}
                  </Text>
                )}
                {s.preview && s.preview !== titleOf(s) ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {s.preview}
                  </Text>
                ) : null}
              </View>
              <View className="items-end gap-1">
                {s.status === "streaming" ? (
                  <AgentOrbit state="writing" size={16} />
                ) : (
                  <Text variant="caption" tone="faint">
                    {relativeTime(s.updatedAt)}
                  </Text>
                )}
                {s.unread ? (
                  <View
                    className="size-2 rounded-full bg-accent"
                    accessibilityElementsHidden
                  />
                ) : null}
              </View>
            </View>
          </View>
        </PressableScale>
      </Swipeable>
      {menuOpen ? (
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(100)}
          className="flex-row gap-2 px-3 pt-1 pb-2"
        >
          <Button
            title="重命名"
            icon="edit"
            size="sm"
            variant="secondary"
            onPress={() => onRename(s.id)}
          />
          <Button
            title={s.pinned ? "取消置顶" : "置顶"}
            size="sm"
            variant="secondary"
            onPress={() => {
              haptics.tap();
              void sessions.pin(s.id, !s.pinned);
              onMenu(s.id);
            }}
          />
          <Button
            title="删除"
            icon="trash"
            size="sm"
            variant="danger"
            onPress={() => onRemove(s)}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

/** Inline rename: 完成 on the keyboard saves, leaving the field cancels. */
function RenameInput({
  session: s,
  onEnd,
}: {
  session: SessionMeta;
  onEnd: () => void;
}) {
  const c = useTheme();
  const [draft, setDraft] = useState(s.title ?? "");
  const save = () => {
    const t = draft.trim();
    if (t && t !== s.title) void sessions.rename(s.id, t);
    onEnd();
  };
  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      autoFocus
      selectTextOnFocus
      returnKeyType="done"
      onSubmitEditing={save}
      onBlur={onEnd}
      placeholder="对话标题"
      placeholderTextColor={c.textFaint}
      selectionColor={c.accent}
      accessibilityLabel="重命名对话"
      className="border-b-[0.5px] border-accent p-0"
      style={[typography.bodyStrong, { color: c.text }]}
    />
  );
}
