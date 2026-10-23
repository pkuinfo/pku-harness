import { defineRegistry, useBoundProp, type Components } from '@json-render/react-native';
import { Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { DateTimeField } from '@/components/date-time-field';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { ProgressRing } from '@/components/progress-ring';
import { Sparkline } from '@/components/sparkline';
import { Stat } from '@/components/stat';
import { Surface } from '@/components/surface';
import { Text } from '@/components/text';
import { radius, spacing, useTheme } from '@/theme';

import { catalog } from './catalog';

const gapOf = (g: 'sm' | 'md' | 'lg' | null | undefined) => (g === 'sm' ? spacing.sm : g === 'lg' ? spacing.xl : spacing.md);
const sizeOf = { xl: 'numberXL', lg: 'numberL', md: 'numberM' } as const;

function ToggleRow({ label, value, binding }: { label: string; value: boolean | null; binding?: string }) {
  const c = useTheme();
  const [v, setV] = useBoundProp<boolean>(value ?? false, binding);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <Switch value={!!v} onValueChange={setV} trackColor={{ true: c.accent, false: c.surface3 }} />
    </View>
  );
}

function TextFieldBound({
  label,
  placeholder,
  value,
  keyboard,
  binding,
}: {
  label: string | null;
  placeholder: string | null;
  value: string | null;
  keyboard: 'default' | 'number' | 'email' | null;
  binding?: string;
}) {
  const [v, setV] = useBoundProp<string>(value ?? '', binding);
  return (
    <Field
      label={label ?? undefined}
      placeholder={placeholder ?? undefined}
      value={v ?? ''}
      onChangeText={setV}
      keyboardType={keyboard === 'number' ? 'decimal-pad' : keyboard === 'email' ? 'email-address' : 'default'}
    />
  );
}

type RawOption = string | { label?: string | null; value?: string | null; text?: string; title?: string; hint?: string | null };

/** Model-written options in any common shape → { label, value, hint }. */
function normalizeOptions(raw: RawOption[] | undefined) {
  return (raw ?? [])
    .map((o) => {
      if (typeof o === 'string' || typeof o === 'number') return { label: String(o), value: String(o), hint: null };
      const label = o.label ?? o.text ?? o.title ?? o.value ?? '';
      return { label: String(label), value: String(o.value ?? label), hint: o.hint ?? null };
    })
    .filter((o, i, all) => o.label && all.findIndex((x) => x.value === o.value) === i);
}

function ChoiceBound({
  label,
  options: rawOptions,
  value,
  binding,
}: {
  label: string | null;
  options: RawOption[];
  value: string | null;
  binding?: string;
}) {
  const c = useTheme();
  const [v, setV] = useBoundProp<string>(value ?? '', binding);
  const options = normalizeOptions(rawOptions);
  // Short labels without hints (times, numbers) read better as a chip grid than a tall list.
  const compact = options.length > 3 && options.every((o) => !o.hint && o.label.length <= 8);
  if (compact) {
    return (
      <View style={{ gap: spacing.sm }}>
        {label ? (
          <Text variant="callout" tone="muted">
            {label}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {options.map((o) => {
            const selected = v === o.value;
            return (
              <PressableScale
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={o.label}
                onPress={() => setV(o.value)}
                style={{
                  minWidth: 76,
                  alignItems: 'center',
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.md,
                  borderCurve: 'continuous',
                  borderWidth: 1,
                  borderColor: selected ? c.accent : c.border,
                  backgroundColor: selected ? c.accentMuted : c.surface2,
                }}>
                <Text variant="callout" tone={selected ? 'accent' : 'default'} style={{ fontVariant: ['tabular-nums'] }}>
                  {o.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {label ? (
        <Text variant="callout" tone="muted">
          {label}
        </Text>
      ) : null}
      {options.map((o) => {
        const selected = v === o.value;
        return (
          <PressableScale
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => setV(o.value)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              padding: spacing.md,
              borderRadius: radius.md,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: selected ? c.accent : c.border,
              backgroundColor: selected ? c.accentMuted : c.surface2,
            }}>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <Text variant="bodyStrong">{o.label}</Text>
              {o.hint ? (
                <Text variant="caption" tone="muted">
                  {o.hint}
                </Text>
              ) : null}
            </View>
            {selected ? <Icon name="check" size={18} color={c.accent} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

function ProgressBar({ label, value, tone }: { label: string | null; value: number; tone: string | null }) {
  const c = useTheme();
  const color = tone === 'down' ? c.down : tone === 'up' ? c.up : tone === 'warn' ? c.warn : c.accent;
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      ) : null}
      <View style={{ height: 6, borderRadius: radius.full, backgroundColor: c.surface3, overflow: 'hidden' }}>
        <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: 6, backgroundColor: color }} />
      </View>
    </View>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const fromLocal = (s: string | null | undefined) => {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(s) : null;
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
};

function DateTimeBound({ label, value, mode, binding }: { label: string; value: string | null; mode: 'date' | 'time' | 'datetime' | null; binding?: string }) {
  const [v, setV] = useBoundProp<string>(value ?? '', binding);
  return <DateTimeField label={label} value={fromLocal(v)} onChange={(d) => setV(toLocal(d))} mode={mode ?? 'datetime'} />;
}

const components: Components<typeof catalog> = {
  // Grows inside a Row (so sparklines etc. get the width); harmless in vertical parents.
  Column: ({ props, children }) => <View style={{ gap: gapOf(props.gap), flexGrow: 1, flexShrink: 1 }}>{children}</View>,
  Row: ({ props, children }) => (
    <View
      style={{
        flexDirection: 'row',
        gap: gapOf(props.gap),
        flexWrap: props.wrap ? 'wrap' : 'nowrap',
        alignItems: 'center',
        justifyContent:
          props.align === 'center' ? 'center' : props.align === 'end' ? 'flex-end' : props.align === 'between' ? 'space-between' : 'flex-start',
      }}>
      {children}
    </View>
  ),
  Card: ({ props, children }) => (
    <Surface level={2} style={{ gap: spacing.md }}>
      {props.title ? <Text variant="headline">{props.title}</Text> : null}
      {props.subtitle ? (
        <Text variant="caption" tone="muted">
          {props.subtitle}
        </Text>
      ) : null}
      {children}
    </Surface>
  ),
  Heading: ({ props }) => (
    <Text variant={props.size === 'lg' ? 'title' : props.size === 'sm' ? 'bodyStrong' : 'headline'}>{props.text}</Text>
  ),
  Text: ({ props }) => (
    <Text variant={props.size === 'small' ? 'caption' : 'body'} tone={props.tone ?? 'default'}>
      {props.text}
    </Text>
  ),
  Stat: ({ props }) => (
    <Stat
      label={props.label}
      value={typeof props.value === 'number' ? props.value : props.value == null ? null : Number(props.value)}
      prefix={props.prefix ?? ''}
      suffix={props.suffix ?? ''}
      decimals={props.decimals ?? undefined}
      delta={props.delta ?? undefined}
      deltaTone={props.deltaTone === 'neutral' ? 'neutral' : (props.deltaTone ?? undefined)}
      caption={props.caption ?? undefined}
      icon={props.icon ?? undefined}
      size={sizeOf[props.size ?? 'lg']}
    />
  ),
  Badge: ({ props }) => <Chip label={props.label} tone={props.tone ?? 'neutral'} />,
  ListItem: ({ props, emit }) => {
    const row = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs }}>
        {props.icon ? <Icon name={props.icon} size={18} /> : null}
        <View style={{ flex: 1, gap: spacing.xxs }}>
          <Text variant="body">{props.title}</Text>
          {props.subtitle ? (
            <Text variant="caption" tone="muted">
              {props.subtitle}
            </Text>
          ) : null}
        </View>
        {props.value ? (
          <Text variant="callout" tone="muted">
            {props.value}
          </Text>
        ) : null}
      </View>
    );
    return (
      <PressableScale accessibilityRole="button" accessibilityLabel={props.title} onPress={() => emit('press')} scaleTo={0.985} haptic={false}>
        {row}
      </PressableScale>
    );
  },
  Divider: () => <DividerLine />,
  Progress: ({ props }) => <ProgressBar label={props.label} value={props.value} tone={props.tone} />,
  TextField: ({ props, bindings }) => <TextFieldBound {...props} binding={bindings?.value} />,
  Toggle: ({ props, bindings }) => <ToggleRow label={props.label} value={props.value} binding={bindings?.value} />,
  Choice: ({ props, bindings }) => <ChoiceBound {...props} binding={bindings?.value} />,
  Sparkline: ({ props }) => <Sparkline values={Array.isArray(props.values) ? props.values : []} tone={props.tone ?? 'accent'} />,
  Ring: ({ props }) => (
    <ProgressRing
      value={typeof props.value === 'number' ? props.value : 0}
      label={props.label ?? undefined}
      caption={props.caption ?? undefined}
      tone={props.tone ?? 'accent'}
      size={props.size === 'sm' ? 64 : props.size === 'lg' ? 120 : 88}
    />
  ),
  DateTime: ({ props, bindings }) => <DateTimeBound label={props.label} value={props.value} mode={props.mode} binding={bindings?.value} />,
  Button: ({ props, emit, loading }) => (
    <Button title={props.label} variant={props.variant ?? 'primary'} loading={loading} onPress={() => emit('press')} />
  ),
};

function DividerLine() {
  const c = useTheme();
  return <View style={{ height: 1, backgroundColor: c.border }} />;
}

export const { registry } = defineRegistry(catalog, { components });
