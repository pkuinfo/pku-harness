import { router } from 'expo-router';
import { Alert, Share, View } from 'react-native';

import { FadeIn } from '@/components/fade-in';
import { ListGroup, ListRow } from '@/components/list-group';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { modelInfo } from '@/core/agent/attachments/attachments';
import { useAIConfig } from '@/core/agent/provider';
import { useCampusAccount } from '@/core/campus/account';
import { exportData, resetData } from '@/core/data';
import type { IconName } from '@/components/icon';
import { usePlugins } from '@/core/runtime/hooks';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { registry } from '@/core/runtime/registry';
import { settingsRowText } from '@/core/runtime/localize';
import { haptics } from '@/utils/haptics';
import { setLocalePreference, useLocale, useLocalePreference, useT, type LocalePreference } from '@/i18n';
import { setThemePreference, useTheme, useThemePreference, type ThemePreference } from '@/theme';


/** Settings tab: account, AI provider, plugins, preferences (docs/ARCHITECTURE.md §2). */
export function Settings() {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const pref = useThemePreference();
  const localePref = useLocalePreference();
  const themeOptions: { label: string; value: ThemePreference }[] = [
    { label: t('core.settings.themeSystem'), value: 'system' },
    { label: t('core.settings.themeDark'), value: 'dark' },
    { label: t('core.settings.themeLight'), value: 'light' },
  ];
  const localeOptions: { label: string; value: LocalePreference }[] = [
    { label: t('core.settings.languageSystem'), value: 'system' },
    { label: t('core.settings.languageZh'), value: 'zh-Hans' },
    { label: t('core.settings.languageEn'), value: 'en' },
  ];
  const ai = useAIConfig();
  const campus = useCampusAccount();
  const plugins = usePlugins();
  const pluginCount = plugins.length;
  // Settings rows contributed by enabled plugins (e.g. AI 记忆 from the memory plugin).
  const contributed = plugins
    .filter((p) => pluginSettings.get(p.id).enabled && !registry.unavailable(p.id))
    .flatMap((p) => (p.contributes?.settings ?? []).map((row) => ({ plugin: p, row })));
  return (
    <Screen title={t('app.settings.title')} subtitle={t('app.settings.eyebrow')}>
      <FadeIn index={0}>
        <ListGroup title={t('app.settings.account')}>
          <ListRow
            icon="person"
            title={t('app.settings.campus')}
            subtitle={campus.signedIn ? t('app.settings.campusSignedIn', { who: [campus.name, campus.username].filter(Boolean).join(' · ') }) : t('app.settings.campusSignedOut')}
            onPress={() => router.push('/campus')}
          />
          <ListRow
            icon="sparkles"
            iconTint={c.accent}
            title={t('app.settings.ai')}
            subtitle={ai.hasKey ? `${ai.config.name} · ${modelInfo(ai.config.providerId, ai.config.model)?.name ?? ai.config.model}` : t('app.settings.aiNotConnected')}
            onPress={() => router.push('/ai-settings')}
          />
          <ListRow icon="trendUp" title={t('app.settings.usage')} subtitle={t('app.settings.usageSubtitle')} onPress={() => router.push('/usage')} />
        </ListGroup>
      </FadeIn>
      {contributed.length ? (
        <FadeIn index={1}>
          <ListGroup title={t('app.settings.pluginSettings')}>
            {contributed.map(({ plugin, row }) => {
              const text = settingsRowText(plugin, row.screen, row, locale);
              return (
                <ListRow
                  key={`${plugin.id}/${row.screen}`}
                  icon={(row.icon as IconName | undefined) ?? (plugin.icon as IconName | undefined) ?? 'puzzle'}
                  title={text.title}
                  subtitle={text.subtitle}
                  onPress={() =>
                    router.push({
                      pathname: plugin.contributes?.screens?.[row.screen]?.presentation === 'modal' ? '/m/[plugin]/[screen]' : '/p/[plugin]/[screen]',
                      params: { plugin: plugin.id, screen: row.screen },
                    })
                  }
                />
              );
            })}
          </ListGroup>
        </FadeIn>
      ) : null}
      <FadeIn index={1}>
        <ListGroup title={t('app.settings.pluginsGroup')} footer={t('app.settings.pluginsFooter')}>
          <ListRow icon="puzzle" title={t('app.settings.plugins')} value={t('app.settings.pluginCount', { count: pluginCount })} onPress={() => router.push('/plugins')} />
        </ListGroup>
      </FadeIn>
      <FadeIn index={2}>
        <View className="gap-2">
          <Text variant="micro" tone="faint" className="px-4">
            {t('core.settings.appearance').toUpperCase()}
          </Text>
          <Segmented options={themeOptions} value={pref} onChange={setThemePreference} />
          <Text variant="micro" tone="faint" className="mt-3 px-4">
            {t('core.settings.language').toUpperCase()}
          </Text>
          <Segmented options={localeOptions} value={localePref} onChange={setLocalePreference} />
        </View>
      </FadeIn>
      <FadeIn index={3}>
        <ListGroup title={t('app.settings.notifications')}>
          <ListRow icon="bell" title={t('app.settings.reminders')} subtitle={t('app.settings.remindersSubtitle')} onPress={() => router.push('/notifications')} />
        </ListGroup>
      </FadeIn>
      <FadeIn index={4}>
        <ListGroup title={t('app.settings.data')} footer={t('app.settings.dataFooter')}>
          <ListRow
            icon="send2"
            title={t('app.settings.export')}
            subtitle={t('app.settings.exportSubtitle')}
            onPress={async () => {
              const data = await exportData();
              await Share.share({ title: t('app.settings.exportTitle'), message: JSON.stringify(data, null, 2) });
            }}
          />
          <ListRow
            icon="trash"
            iconTint={c.down}
            title={t('app.settings.reset')}
            subtitle={t('app.settings.resetSubtitle')}
            onPress={() =>
              Alert.alert(t('app.settings.resetTitle'), t('app.settings.resetMessage'), [
                { text: t('core.common.cancel'), style: 'cancel' },
                {
                  text: t('app.settings.resetConfirm'),
                  style: 'destructive',
                  onPress: async () => {
                    await resetData();
                    haptics.success();
                  },
                },
              ])
            }
          />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
