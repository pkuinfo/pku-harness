import type { Token, Tokens } from 'marked';
import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { useT } from '@/i18n';
import { useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { lexMarkdown, streamLexer } from '@/utils/markdown-lex';

import { Icon } from './icon';
import { layoutColumns, numericColumn } from './table-layout';
import { Text, type TextTone } from './text';

/**
 * Markdown for agent replies, drawn with the design system (no WebView): GFM via `marked`'s
 * lexer, rendered as native Text/View. While streaming, only the unfinished tail is lexed again
 * (`streamLexer`), `remend` closes its unterminated syntax (`**bold`, an open code fence) so
 * half-written Markdown never flashes raw markers, and each finished block is memoized by its
 * source, so only the growing tail re-renders.
 */

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
const MONO = { fontFamily: 'monospace' } as const;

function openLink(href: string) {
  // Only web links; agent text is untrusted, so no intents or custom schemes.
  if (/^https?:\/\//i.test(href)) void Linking.openURL(href);
}

/** Inline tokens → nested Text spans. */
function Inline({ tokens }: { tokens: Token[] | undefined }): ReactNode {
  const c = useTheme();
  const tr = useT();
  return (tokens ?? []).map((t, i) => {
    switch (t.type) {
      case 'strong':
        return (
          // fontWeight as well: CJK glyphs fall back to the system font, which ignores the
          // per-weight Inter family.
          <Text key={i} variant="bodyStrong" style={{ fontWeight: '600' }}>
            <Inline tokens={(t as Tokens.Strong).tokens} />
          </Text>
        );
      case 'em':
        return (
          <Text key={i} style={{ fontStyle: 'italic' }}>
            <Inline tokens={(t as Tokens.Em).tokens} />
          </Text>
        );
      case 'del':
        return (
          <Text key={i} style={{ textDecorationLine: 'line-through' }} tone="muted">
            <Inline tokens={(t as Tokens.Del).tokens} />
          </Text>
        );
      case 'codespan':
        return (
          <Text key={i} className="bg-surface-3" style={[MONO, { fontSize: 14, color: c.accent }]}>
            {` ${decode((t as Tokens.Codespan).text)} `}
          </Text>
        );
      case 'link': {
        const l = t as Tokens.Link;
        return (
          <Text key={i} tone="accent" style={{ textDecorationLine: 'underline' }} onPress={() => openLink(l.href)}>
            <Inline tokens={l.tokens} />
          </Text>
        );
      }
      case 'image': {
        const img = t as Tokens.Image;
        return (
          <Text key={i} tone="accent" onPress={() => openLink(img.href)}>
            {img.text ? tr('app.ui.imageAlt', { alt: img.text }) : tr('app.ui.image')}
          </Text>
        );
      }
      case 'br':
        return <Text key={i}>{'\n'}</Text>;
      case 'text':
      case 'escape': {
        const tx = t as Tokens.Text;
        return tx.tokens ? <Inline key={i} tokens={tx.tokens} /> : <Text key={i}>{decode(tx.text)}</Text>;
      }
      default:
        return 'text' in t && typeof t.text === 'string' ? <Text key={i}>{decode(t.text)}</Text> : null;
    }
  });
}

function Paragraph({ tokens, tone = 'default' }: { tokens: Token[] | undefined; tone?: TextTone }) {
  return (
    <Text variant="body" tone={tone} selectable>
      <Inline tokens={tokens} />
    </Text>
  );
}

function List({ list, depth }: { list: Tokens.List; depth: number }) {
  const c = useTheme();
  const start = typeof list.start === 'number' ? list.start : 1;
  return (
    <View className="gap-1.5">
      {list.items.map((item, i) => (
        <View key={i} className="flex-row gap-2" style={{ paddingLeft: depth * 14 }}>
          <View className="min-w-4 items-end pt-[3px]">
            {item.task ? (
              <View className={cx('h-4 w-4 items-center justify-center rounded-[4px] border', item.checked ? 'border-up bg-up' : 'border-edge')}>
                {item.checked ? <Icon name="check" size={11} color={c.onAccent} /> : null}
              </View>
            ) : list.ordered ? (
              <Text variant="body" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{`${start + i}.`}</Text>
            ) : (
              <View className="mt-[7px] h-1.5 w-1.5 rounded-full bg-fg-muted" />
            )}
          </View>
          <View className="flex-1 gap-1.5">
            {item.tokens.map((b, j) =>
              b.type === 'list' ? <List key={j} list={b as Tokens.List} depth={0} /> : b.type === 'text' ? <Paragraph key={j} tokens={(b as Tokens.Text).tokens ?? [b]} /> : <Block key={j} token={b} />,
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function Table({ table }: { table: Tokens.Table }) {
  // One width per column for every row, fitted to the bubble when possible (table-layout.ts).
  const [available, setAvailable] = useState(0);
  const rows = [table.header, ...table.rows];
  const text = rows.map((row) => row.map((cell) => cell.text));
  const cols = Math.max(0, ...rows.map((r) => r.length));
  // Real font metrics: an invisible pass lays every cell out unconstrained; each column's widest
  // cell is its natural width. Re-measured whenever the content changes (streaming).
  const key = text.map((r) => r.join('\u0001')).join('\u0002');
  const [measure, setMeasure] = useState<{ key: string; widths: number[] } | null>(null);
  const got = useRef<{ key: string; widths: number[] }>({ key: '', widths: [] });
  const onColumn = (c: number, w: number) => {
    if (got.current.key !== key) got.current = { key, widths: [] };
    got.current.widths[c] = w;
    const done = Array.from({ length: cols }, (_, i) => got.current.widths[i]).every((x) => x != null);
    if (done) setMeasure({ key, widths: [...got.current.widths] });
  };
  const measured = measure?.key === key ? measure.widths : undefined;
  const { widths, scroll } = layoutColumns(text, available, { measured });
  const numeric = widths.map((_, c) => numericColumn(table.rows.map((row) => row[c]?.text ?? '')));
  const align = (a: Tokens.TableCell['align'], c: number) => (a === 'right' ? 'right' : a === 'center' ? 'center' : a === 'left' ? 'left' : numeric[c] ? 'right' : 'left');
  return (
    <View
      className="overflow-hidden rounded-lg border-[0.5px] border-edge bg-surface"
      style={{ borderCurve: 'continuous' }}
      onLayout={(e) => setAvailable(Math.floor(e.nativeEvent.layout.width))}>
      {measured ? null : (
        <ScrollView horizontal pointerEvents="none" style={{ height: 0, opacity: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View className="flex-row">
            {Array.from({ length: cols }, (_, ci) => (
              <View key={ci} className="items-start" onLayout={(e) => onColumn(ci, e.nativeEvent.layout.width)}>
                {rows.map((row, r) => (
                  <Text key={r} variant={r === 0 ? 'caption' : 'callout'} numberOfLines={1}>
                    {row[ci] ? <Inline tokens={row[ci].tokens} /> : ' '}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      <ScrollView horizontal scrollEnabled={scroll} showsHorizontalScrollIndicator={scroll}>
        <View>
          {rows.map((row, r) => (
            <View key={r} className={cx('flex-row', r === 0 ? 'bg-surface-2' : 'border-t-[0.5px] border-edge')}>
              {widths.map((w, ci) => {
                const cell = row[ci];
                return (
                  <View key={ci} className="px-2 py-2" style={{ width: w }}>
                    <Text
                      variant={r === 0 ? 'caption' : 'callout'}
                      tone={r === 0 ? 'muted' : 'default'}
                      align={align(cell?.align ?? null, ci)}
                      // Full cell width, so right/center alignment has room to work.
                      style={[{ width: '100%' }, numeric[ci] ? { fontVariant: ['tabular-nums'] } : null]}
                      selectable>
                      {cell ? <Inline tokens={cell.tokens} /> : null}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Code({ code }: { code: Tokens.Code }) {
  const c = useTheme();
  return (
    <View className="overflow-hidden rounded-md border-[0.5px] border-edge bg-surface-2" style={{ borderCurve: 'continuous' }}>
      {code.lang ? (
        <Text variant="micro" tone="faint" className="px-3 pt-2">
          {code.lang.toUpperCase()}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-3 py-2.5">
        <Text selectable style={[MONO, { fontSize: 13, lineHeight: 19, color: c.text }]}>
          {code.text}
        </Text>
      </ScrollView>
    </View>
  );
}

/** One block; memoized on its source so finished blocks don't re-render while streaming. */
const Block = memo(
  function Block({ token }: { token: Token }) {
    switch (token.type) {
      case 'heading': {
        const h = token as Tokens.Heading;
        return (
          <Text variant={h.depth <= 2 ? 'headline' : 'bodyStrong'} className={h.depth <= 2 ? 'mt-1' : undefined} selectable>
            <Inline tokens={h.tokens} />
          </Text>
        );
      }
      case 'paragraph':
        return <Paragraph tokens={(token as Tokens.Paragraph).tokens} />;
      case 'list':
        return <List list={token as Tokens.List} depth={0} />;
      case 'table':
        return <Table table={token as Tokens.Table} />;
      case 'code':
        return <Code code={token as Tokens.Code} />;
      case 'blockquote':
        return (
          <View className="gap-1.5 border-l-2 border-accent pl-3">
            {(token as Tokens.Blockquote).tokens.map((b, i) => (b.type === 'paragraph' ? <Paragraph key={i} tokens={(b as Tokens.Paragraph).tokens} tone="muted" /> : <Block key={i} token={b} />))}
          </View>
        );
      case 'hr':
        return <View className="my-1 h-[0.5px] bg-edge" />;
      case 'text': {
        const t = token as Tokens.Text;
        return <Paragraph tokens={t.tokens ?? [t]} />;
      }
      case 'space':
      case 'def':
        return null;
      case 'html':
        return <Paragraph tokens={[{ type: 'text', raw: token.raw, text: (token as Tokens.HTML).text }]} tone="muted" />;
      default:
        return null;
    }
  },
  (a, b) => a.token.raw === b.token.raw,
);

export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const [lexStream] = useState(streamLexer);
  const tokens = useMemo(() => (streaming ? lexStream(text) : lexMarkdown(text)), [text, streaming, lexStream]);
  return (
    <View className="gap-3">
      {tokens.map((t, i) => (
        <Block key={i} token={t} />
      ))}
    </View>
  );
}
