import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentOrbit } from '@/components/agent-orbit';
import { Aurora } from '@/components/aurora';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icon';
import { Logo } from '@/components/logo';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { pkuBrand, radius, setThemePreference, spacing, useTheme, useThemePreference, type ThemePreference } from '@/theme';

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
  const c = useTheme();
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

        {/* The agent orbit in each state, large and at status-line size. */}
        <Glass style={{ padding: spacing.lg, gap: spacing.md }} radius={radius.xl}>
          <Text variant="micro" tone="faint">
            AGENT ORBIT
          </Text>
          <View className="flex-row justify-between">
            {(
              [
                ['thinking', '思考中'],
                ['tool', '正在调用'],
                ['writing', '输出中'],
                ['rest', '完成'],
              ] as const
            ).map(([state, label]) => (
              <View key={state} className="items-center gap-2">
                <AgentOrbit state={state} size={56} />
                <AgentOrbit state={state} size={20} />
                <Text variant="caption" tone="muted">
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </Glass>

        <Glass style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.lg }} radius={radius.xl}>
          <Logo size={84} intro orbiting />
          <Text variant="headline" align="center">
            今天想让我做什么？
          </Text>
          <View className="flex-row flex-wrap justify-center gap-2">
            {['校园卡余额还剩多少', '明天几点有课', '每晚 10 点提醒我交作业'].map((s) => (
              <Glass key={s} radius={radius.md} onPress={() => {}} accessibilityLabel={s} style={styles.chip}>
                <Text variant="callout">{s}</Text>
              </Glass>
            ))}
          </View>
        </Glass>

        <View className="flex-row gap-3">
          <Glass style={[styles.tile, { flex: 1.4 }]} onPress={() => {}} accessibilityLabel="校园卡">
            <Text variant="micro" tone="faint">
              校园卡
            </Text>
            <Text variant="numberL">¥86.50</Text>
            <Text variant="caption" tone="muted">
              今日消费 ¥23.00
            </Text>
          </Glass>
          <View className="flex-1 gap-3">
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
          <View className="flex-row items-center justify-between">
            <Text variant="bodyStrong">下一节课</Text>
            <Text variant="caption" tone="accent">
              18 分钟后
            </Text>
          </View>
          <View className="flex-row gap-3">
            <View className="w-1 rounded-[2px] bg-pku-slate" />
            <View className="gap-0.5">
              <Text variant="headline">数据结构与算法</Text>
              <Text variant="caption" tone="muted">
                10:10–12:00 · 理教 107
              </Text>
            </View>
          </View>
        </Glass>

        <View className="flex-row gap-3">
          <Glass tone="brand" radius={radius.md} onPress={() => {}} accessibilityLabel="连接 AI 服务" style={[styles.button, { flex: 1 }]}>
            <Icon name="key" size={18} color={c.onBrand} />
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
            <Icon name="send" size={18} color={c.onBrand} />
          </Glass>
        </Glass>

        <Glass style={{ padding: spacing.lg, gap: spacing.md }}>
          <Text variant="micro" tone="faint">
            北京大学视觉形象识别系统 · 标准色与辅助色
          </Text>
          <View className="flex-row flex-wrap justify-center gap-2">
            {SWATCHES.map(([k, label]) => (
              <View key={k} className="w-16 items-center gap-0.5">
                <View className="h-11 w-11 rounded-md" style={{ borderCurve: 'continuous', backgroundColor: pkuBrand[k] }} />
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

// Glass takes no className, so its layout stays in style.
const styles = StyleSheet.create({
  chip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tile: { padding: spacing.lg, gap: spacing.xs },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
