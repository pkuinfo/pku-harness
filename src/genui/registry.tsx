import { defineRegistry, useBoundProp, type Components } from '@json-render/react-native';
import { Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Field } from '@/components/field';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
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

function ChoiceBound({
  label,
  options,
  value,
  binding,
}: {
  label: string | null;
  options: { label: string; value: string; hint: string | null }[];
  value: string | null;
  binding?: string;
}) {
  const c = useTheme();
  const [v, setV] = useBoundProp<string>(value ?? '', binding);
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

const components: Components<typeof catalog> = {
  Column: ({ props, children }) => <View style={{ gap: gapOf(props.gap) }}>{children}</View>,
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
      decimals={props.decimals ?? 2}
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
  Button: ({ props, emit, loading }) => (
    <Button title={props.label} variant={props.variant ?? 'primary'} loading={loading} onPress={() => emit('press')} />
  ),
};

function DividerLine() {
  const c = useTheme();
  return <View style={{ height: 1, backgroundColor: c.border }} />;
}

export const { registry } = defineRegistry(catalog, { components });
