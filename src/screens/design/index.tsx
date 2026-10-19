import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Aurora } from '@/components/aurora';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icon';
import { Logo } from '@/components/logo';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { pkuBrand, radius, setThemePreference, spacing, useThemePreference, type ThemePreference } from '@/theme';

const SWATCHES: [keyof typeof pkuBrand, string][] = [
  ['red', '北大红'],
  ['gold', '专色金'],
  ['sand', '沙'],
  ['stone', '石'],
  ['pine', '松'],
  ['navy', '藏青'],
  ['slate', '岩蓝'],
  ['amber', '琥珀'],
];

/** The proposed Glass + Light system, laid out as real app pieces over the aurora. */
export function DesignBoard() {
  const insets = useSafeAreaInsets();
  const pref = useThemePreference();
  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxxl, paddingHorizontal: spacing.lg, gap: spacing.xl }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="micro" tone="faint">
            DESIGN · GLASS + LIGHT
          </Text>
          <Text variant="title">燕园的光，透过玻璃</Text>
        </View>
        <Segmented<ThemePreference>
          options={[
            { label: '跟随系统', value: 'system' },
            { label: '深色', value: 'dark' },
            { label: '浅色', value: 'light' },
          ]}
          value={pref}
          onChange={setThemePreference}
        />

        <Glass style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.lg }} radius={radius.xl}>
          <Logo size={84} intro orbiting />
          <Text variant="headline" align="center">
            今天想让我做什么？
          </Text>
          <View style={styles.wrap}>
            {['校园卡余额还剩多少', '明天几点有课', '每晚 10 点提醒我交作业'].map((s) => (
              <Glass key={s} radius={radius.md} onPress={() => {}} accessibilityLabel={s} style={styles.chip}>
                <Text variant="callout">{s}</Text>
              </Glass>
            ))}
          </View>
        </Glass>

        <View style={styles.row}>
          <Glass style={[styles.tile, { flex: 1.4 }]} onPress={() => {}} accessibilityLabel="校园卡">
            <Text variant="micro" tone="faint">
              校园卡
            </Text>
            <Text variant="numberL">¥86.50</Text>
            <Text variant="caption" tone="muted">
              今日消费 ¥23.00
            </Text>
          </Glass>
          <View style={{ flex: 1, gap: spacing.md }}>
            <Glass style={styles.tile} onPress={() => {}} accessibilityLabel="网费">
              <Text variant="micro" tone="faint">
                网费
              </Text>
              <Text variant="numberM">¥12.30</Text>
            </Glass>
            <Glass style={styles.tile} onPress={() => {}} accessibilityLabel="教学周">
              <Text variant="micro" tone="faint">
                教学周
              </Text>
              <Text variant="numberM">第 6 周</Text>
            </Glass>
          </View>
        </View>

        <Glass tone="strong" style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={styles.between}>
            <Text variant="bodyStrong">下一节课</Text>
            <Text variant="caption" tone="accent">
              18 分钟后
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ width: 4, borderRadius: 2, backgroundColor: pkuBrand.slate }} />
            <View style={{ gap: spacing.xxs }}>
              <Text variant="headline">数据结构与算法</Text>
              <Text variant="caption" tone="muted">
                10:10–12:00 · 理教 107
              </Text>
            </View>
          </View>
        </Glass>

        <View style={styles.row}>
          <Glass tone="brand" radius={radius.md} onPress={() => {}} accessibilityLabel="连接 AI 服务" style={[styles.button, { flex: 1 }]}>
            <Icon name="key" size={18} color="#FFFFFF" />
            <Text variant="bodyStrong" tone="onAccent">
              连接 AI 服务
            </Text>
          </Glass>
          <Glass radius={radius.md} onPress={() => {}} accessibilityLabel="稍后" style={styles.button}>
            <Text variant="bodyStrong">稍后</Text>
          </Glass>
        </View>

        <Glass tone="strong" radius={radius.md} style={[styles.between, { paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingVertical: spacing.xs }]}>
          <Text variant="body" tone="faint">
            问点什么，或让我帮你做点什么…
          </Text>
          <Glass tone="brand" radius={radius.md} onPress={() => {}} accessibilityLabel="发送" style={styles.send}>
            <Icon name="send" size={18} color="#FFFFFF" />
          </Glass>
        </Glass>

        <Glass style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text variant="micro" tone="faint">
            北京大学视觉形象识别系统 · 标准色与辅助色
          </Text>
          <View style={styles.wrap}>
            {SWATCHES.map(([k, label]) => (
              <View key={k} style={{ alignItems: 'center', gap: spacing.xxs, width: 64 }}>
                <View style={[styles.swatch, { backgroundColor: pkuBrand[k] }]} />
                <Text variant="micro" tone="muted">
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </Glass>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  tile: { padding: spacing.lg, gap: spacing.xs },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 44, height: 44, borderRadius: radius.md, borderCurve: 'continuous' },
});
