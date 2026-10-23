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
import { haptics } from '@/utils/haptics';
import { setLocalePreference, useLocalePreference, useT, type LocalePreference } from '@/i18n';
import { setThemePreference, useTheme, useThemePreference, type ThemePreference } from '@/theme';

import { PluginsEntry } from './plugins-entry';


/**
 * Settings tab, kept minimal (docs/ARCHITECTURE.md §2): account, one entry into plugins (their
 * own settings live on each plugin's page), reminders, appearance and language, data.
 */
export function Settings() {
  const c = useTheme();
  const t = useT();
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
      <FadeIn index={1}>
        <PluginsEntry />
      </FadeIn>
      <FadeIn index={2}>
        <ListGroup title={t('app.settings.notifications')}>
          <ListRow icon="bell" title={t('app.settings.reminders')} subtitle={t('app.settings.remindersSubtitle')} onPress={() => router.push('/notifications')} />
        </ListGroup>
      </FadeIn>
      <FadeIn index={3}>
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
