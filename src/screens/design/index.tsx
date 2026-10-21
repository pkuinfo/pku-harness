import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentOrbit } from '@/components/agent-orbit';
import { Aurora } from '@/components/aurora';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icon';
import { Logo } from '@/components/logo';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { useT } from '@/i18n';
import { pkuBrand, radius, setThemePreference, spacing, useTheme, useThemePreference, type ThemePreference } from '@/theme';

const SWATCHES = ['red', 'gold', 'sand', 'stone', 'pine', 'navy', 'slate', 'amber'] as const satisfies readonly (keyof typeof pkuBrand)[];

/** The proposed Glass + Light system, laid out as real app pieces over the aurora. */
export function DesignBoard() {
  const insets = useSafeAreaInsets();
  const pref = useThemePreference();
  const c = useTheme();
  const t = useT();
  return (
    <View className="flex-1">
      <Aurora />
      <ScrollView
        contentContainerClassName="gap-6 px-4"
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxxl }}>
        <View className="gap-1">
          <Text variant="micro" tone="faint">
            DESIGN · GLASS + LIGHT
          </Text>
          <Text variant="title">{t('app.design.tagline')}</Text>
        </View>
        <Segmented<ThemePreference>
          options={[
            { label: t('core.settings.themeSystem'), value: 'system' },
            { label: t('core.settings.themeDark'), value: 'dark' },
            { label: t('core.settings.themeLight'), value: 'light' },
          ]}
          value={pref}
          onChange={setThemePreference}
        />

        {/* The agent orbit in each state, large and at status-line size. */}
        <Glass style={{ padding: spacing.lg, gap: spacing.md }} radius={radius.xl}>
          <Text variant="micro" tone="faint">
            AGENT ORBIT
          </Text>
          <View className="flex-row justify-between">
            {(['thinking', 'tool', 'writing', 'rest'] as const).map((state) => (
              <View key={state} className="items-center gap-2">
                <AgentOrbit state={state} size={56} />
                <AgentOrbit state={state} size={20} />
                <Text variant="caption" tone="muted">
                  {t(`app.design.${state}`)}
                </Text>
              </View>
            ))}
          </View>
        </Glass>

        <Glass style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.lg }} radius={radius.xl}>
          <Logo size={84} intro orbiting />
          <Text variant="headline" align="center">
            {t('app.design.greeting')}
          </Text>
          <View className="flex-row flex-wrap justify-center gap-2">
            {[t('app.design.suggestBalance'), t('app.design.suggestClass'), t('app.design.suggestRemind')].map((s) => (
              <Glass key={s} radius={radius.md} onPress={() => {}} accessibilityLabel={s} style={styles.chip}>
                <Text variant="callout">{s}</Text>
              </Glass>
            ))}
          </View>
        </Glass>

        <View className="flex-row gap-3">
          <Glass style={[styles.tile, { flex: 1.4 }]} onPress={() => {}} accessibilityLabel={t('app.design.card')}>
            <Text variant="micro" tone="faint">
              {t('app.design.card')}
            </Text>
            <Text variant="numberL">¥86.50</Text>
            <Text variant="caption" tone="muted">
              {t('app.design.spentToday')}
            </Text>
          </Glass>
          <View className="flex-1 gap-3">
            <Glass style={styles.tile} onPress={() => {}} accessibilityLabel={t('app.design.netFee')}>
              <Text variant="micro" tone="faint">
                {t('app.design.netFee')}
              </Text>
              <Text variant="numberM">¥12.30</Text>
            </Glass>
            <Glass style={styles.tile} onPress={() => {}} accessibilityLabel={t('app.design.week')}>
              <Text variant="micro" tone="faint">
                {t('app.design.week')}
              </Text>
              <Text variant="numberM">{t('app.design.weekValue')}</Text>
            </Glass>
          </View>
        </View>

        <Glass tone="strong" style={{ padding: spacing.lg, gap: spacing.md }}>
          <View className="flex-row items-center justify-between">
            <Text variant="bodyStrong">{t('app.design.nextClass')}</Text>
            <Text variant="caption" tone="accent">
              {t('app.design.inMinutes')}
            </Text>
          </View>
          <View className="flex-row gap-3">
            <View className="w-1 rounded-[2px] bg-pku-slate" />
            <View className="gap-0.5">
              <Text variant="headline">{t('app.design.course')}</Text>
              <Text variant="caption" tone="muted">
                {t('app.design.room')}
              </Text>
            </View>
          </View>
        </Glass>

        <View className="flex-row gap-3">
          <Glass tone="brand" radius={radius.md} onPress={() => {}} accessibilityLabel={t('app.design.connectAI')} style={[styles.button, { flex: 1 }]}>
            <Icon name="key" size={18} color={c.onBrand} />
            <Text variant="bodyStrong" tone="onAccent">
              {t('app.design.connectAI')}
            </Text>
          </Glass>
          <Glass radius={radius.md} onPress={() => {}} accessibilityLabel={t('app.design.later')} style={styles.button}>
            <Text variant="bodyStrong">{t('app.design.later')}</Text>
          </Glass>
        </View>

        <Glass tone="strong" radius={radius.md} style={[styles.between, { paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingVertical: spacing.xs }]}>
          <Text variant="body" tone="faint">
            {t('app.design.composer')}
          </Text>
          <Glass tone="brand" radius={radius.md} onPress={() => {}} accessibilityLabel={t('app.design.send')} style={styles.send}>
            <Icon name="send" size={18} color={c.onBrand} />
          </Glass>
        </Glass>

        <Glass style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text variant="micro" tone="faint">
            {t('app.design.palette')}
          </Text>
          <View className="flex-row flex-wrap justify-center gap-2">
            {SWATCHES.map((k) => (
              <View key={k} className="w-16 items-center gap-0.5">
                <View className="h-11 w-11 rounded-md" style={{ borderCurve: 'continuous', backgroundColor: pkuBrand[k] }} />
                <Text variant="micro" tone="muted">
                  {t(`app.design.${k}`)}
                </Text>
              </View>
            ))}
          </View>
        </Glass>
      </ScrollView>
    </View>
  );
}

// Glass takes no className, so its layout stays in style.
const styles = StyleSheet.create({
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tile: { padding: spacing.lg, gap: spacing.xs },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
