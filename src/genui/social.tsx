import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, StatusBar, useWindowDimensions, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { invokeTool } from '@/core/runtime/invoke';
import { courseColors, palette, radius, spacing, useTheme, useThemeName } from '@/theme';

// ---------- images through a plugin tool ----------

/** Loaded image URIs by tool + input (thumbnails are small; a long feed stays within this). */
const loaded = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();
const LOADED_MAX = 300;
/** At most this many image tools run at once, so a fast scroll doesn't queue a hundred requests ahead of the text. */
const PARALLEL = 4;
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= PARALLEL) await new Promise<void>((go) => waiting.push(go));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** A tool's image: `{ uri }` with a data: image or https URL. Failures read as no image (null). */
export function loadImage(tool: string, input: Record<string, unknown>): Promise<string | null> {
  const key = `${tool} ${JSON.stringify(input)}`;
  if (loaded.has(key)) return Promise.resolve(loaded.get(key)!);
  let p = inflight.get(key);
  if (!p) {
    p = slot(() => invokeTool(tool, input, { actor: 'user' }))
      .then((r) => {
        const uri = (r as { uri?: unknown } | null)?.uri;
        return typeof uri === 'string' && /^(data:image\/|https:\/\/)/.test(uri) ? uri : null;
      })
      .catch(() => null)
      .then((uri) => {
        inflight.delete(key);
        if (loaded.size >= LOADED_MAX) loaded.delete(loaded.keys().next().value!);
        loaded.set(key, uri);
        return uri;
      });
    inflight.set(key, p);
  }
  return p;
}

function useImage(tool: string, input: Record<string, unknown>) {
  const key = `${tool} ${JSON.stringify(input)}`;
  // What a load answered, by key: an item that scrolls back in reads the cache during render.
  const [got, setGot] = useState<{ key: string; uri: string | null } | null>(null);
  useEffect(() => {
    if (loaded.has(key)) return;
    let live = true;
    loadImage(tool, input).then((uri) => live && setGot({ key, uri }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (loaded.has(key)) return loaded.get(key);
  return got?.key === key ? got.uri : undefined;
}

type Items = Record<string, unknown>[];

function Thumb({ tool, input, size, onPress }: { tool: string; input: Record<string, unknown>; size: { width: number; height: number }; onPress: () => void }) {
  const c = useTheme();
  const uri = useImage(tool, input);
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" style={{ ...size, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.surface2 }}>
      {uri ? (
        <Image source={{ uri }} style={size} contentFit="cover" transition={150} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{uri === null ? <Icon name="image" size={20} color={c.textFaint} /> : null}</View>
      )}
    </Pressable>
  );
}

/**
 * Pictures of a post or comment, laid out like a phone's photo grid: one picture large, two or
 * more in a 3-up grid (at most 9, "+N" on the last). Tap opens the full-screen viewer, which asks
 * the same tool for `{ ...item, full: true }`.
 */
export function Gallery({ tool, items, compact }: { tool: string; items: Items; compact: boolean }) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<number | null>(null);
  const list = items.slice(0, 9);
  if (!list.length) return null;
  // Content width: screen minus the feed's side padding, the card's padding and (compact) the avatar column.
  const avail = Math.min(width, 720) - spacing.lg * 4 - (compact ? 40 : 0);
  const cell = Math.floor((avail - spacing.xs * 2) / 3);
  const single = list.length === 1 ? { width: Math.min(avail, cell * 2 + spacing.xs), height: Math.min(avail, cell * 2 + spacing.xs) * 0.75 } : null;
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {list.map((input, i) => (
          <View key={i}>
            <Thumb tool={tool} input={input} size={single ?? { width: cell, height: cell }} onPress={() => setOpen(i)} />
            {i === 8 && items.length > 9 ? (
              <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.scrim, borderRadius: radius.sm }}>
                <Text variant="bodyStrong" tone="onAccent">
                  +{items.length - 9}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      {open != null ? <Viewer tool={tool} items={items} start={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function FullImage({ tool, input, width, height }: { tool: string; input: Record<string, unknown>; width: number; height: number }) {
  const thumb = useImage(tool, input);
  const full = useImage(tool, { ...input, full: true });
  const uri = full ?? thumb;
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} style={{ width, height }} contentFit="contain" transition={120} /> : <Icon name="image" size={28} color={palette.white} />}
    </View>
  );
}

/** Full-screen pictures, swiped sideways; tap anywhere or back to close. */
function Viewer({ tool, items, start, onClose }: { tool: string; items: Items; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <Pressable style={{ flex: 1, backgroundColor: palette.black }} onPress={onClose} accessibilityLabel="Close">
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => <FullImage tool={tool} input={item} width={width} height={height} />}
        />
        {items.length > 1 ? (
          <Text variant="caption" tone="onAccent" style={{ position: 'absolute', bottom: spacing.xxxl, alignSelf: 'center' }}>
            {index + 1} / {items.length}
          </Text>
        ) : null}
      </Pressable>
    </Modal>
  );
}

// ---------- posts and comments ----------

/** The same anonymous name always gets the same colour (as on the Treehole site). */
export function authorHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 8;
}

function useAuthorColor(name: string, op: boolean) {
  const c = useTheme();
  const theme = useThemeName();
  if (op) return { fill: c.accentMuted, ink: c.accent };
  return courseColors[theme][authorHue(name)]!;
}

function Avatar({ name, op }: { name: string; op: boolean }) {
  const color = useAuthorColor(name, op);
  const initial = [...name.trim()][0] ?? '?';
  return (
    <View style={{ width: 32, height: 32, borderRadius: radius.full, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="bodyStrong" style={{ color: color.ink }}>
        {initial.toUpperCase()}
      </Text>
    </View>
  );
}

function Stat({ icon, value }: { icon: 'chat' | 'heart' | 'star'; value: number | string }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <Icon name={icon} size={15} color={c.textMuted} />
      <Text variant="caption" tone="muted">
        {value}
      </Text>
    </View>
  );
}

/** A reply shown under a post in a feed (tool shapes use `name`, the catalog `author`). */
export type PreviewReply = { name?: string; author?: string; text: string; op?: boolean };

export type PostProps = {
  text: string;
  preview: PreviewReply[] | null;
  meta: string | null;
  replies: number | null;
  likes: number | null;
  tags: string[] | null;
  lines: number | null;
  pinned: boolean | null;
  followed: boolean | null;
};

/** A forum post: header line, text (clamped in a feed), its pictures and preview replies (children), counts. */
export function Post({ props, children, onPress }: { props: PostProps; children?: ReactNode; onPress?: () => void }) {
  const c = useTheme();
  const body = (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: c.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {props.pinned ? <Icon name="pin" size={14} color={c.accent} /> : null}
        <Text variant="caption" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
          {props.meta ?? ''}
        </Text>
        {props.followed ? <Icon name="star" size={14} color={c.warn} /> : null}
      </View>
      {props.text ? (
        <Text variant="body" numberOfLines={props.lines ?? undefined} selectable={!props.lines}>
          {props.text}
        </Text>
      ) : null}
      {props.tags?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {props.tags.map((tag) => (
            <View key={tag} style={{ backgroundColor: c.surface2, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs }}>
              <Text variant="caption" tone="muted">
                {tag}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {children}
      {props.preview?.length ? (
        <View style={{ backgroundColor: c.surface2, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs }}>
          {props.preview.slice(0, 3).map((r, i) => (
            <Comment key={i} props={{ author: r.author ?? r.name ?? '', text: r.text, time: null, op: !!r.op, quote: null, compact: true }} />
          ))}
        </View>
      ) : null}
      {props.replies != null || props.likes != null ? (
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          {props.replies != null ? <Stat icon="chat" value={props.replies} /> : null}
          {props.likes != null ? <Stat icon="heart" value={props.likes} /> : null}
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale accessibilityRole="button" onPress={onPress} haptic={false}>
      {body}
    </PressableScale>
  );
}

export type CommentProps = {
  author: string;
  text: string;
  time: string | null;
  op: boolean | null;
  quote: { author: string; text: string } | null;
  compact: boolean | null;
};

/**
 * A reply: the anonymous author's avatar and name in their own colour (the original poster in the
 * accent colour), the comment it answers quoted above, then the text and pictures. `compact` is the
 * one-line preview under a post in a feed.
 */
export function Comment({ props, children, onPress }: { props: CommentProps; children?: ReactNode; onPress?: () => void }) {
  const c = useTheme();
  const op = !!props.op;
  const color = useAuthorColor(props.author, op);
  const quoteColor = useAuthorColor(props.quote?.author ?? '', false);
  if (props.compact) {
    return (
      <Text variant="caption" tone="muted" numberOfLines={2}>
        <Text variant="caption" style={{ color: color.ink, fontWeight: '600' }}>
          {props.author}
        </Text>
        {props.quote ? ` → ${props.quote.author}` : ''}：{props.text}
      </Text>
    );
  }
  const row = (
    <View style={{ flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm }}>
      <Avatar name={props.author} op={op} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="bodyStrong" style={{ color: color.ink }} numberOfLines={1}>
            {props.author}
          </Text>
          <View style={{ flex: 1 }} />
          {props.time ? (
            <Text variant="caption" tone="faint">
              {props.time}
            </Text>
          ) : null}
        </View>
        {props.quote ? (
          <View style={{ borderLeftWidth: 3, borderLeftColor: quoteColor.ink, backgroundColor: c.surface2, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xxs }}>
            {props.quote.author ? (
              <Text variant="caption" style={{ color: quoteColor.ink, fontWeight: '600' }}>
                {props.quote.author}
              </Text>
            ) : null}
            <Text variant="caption" tone="muted" numberOfLines={3}>
              {props.quote.text}
            </Text>
          </View>
        ) : null}
        {props.text ? (
          <Text variant="body" selectable>
            {props.text}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
  if (!onPress) return row;
  return (
    <PressableScale accessibilityRole="button" accessibilityHint="Reply" onPress={onPress} haptic={false}>
      {row}
    </PressableScale>
  );
}
