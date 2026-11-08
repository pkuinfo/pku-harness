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
import { displayHost } from '@/core/cloud/config';
import { useCloudProvider } from '@/core/cloud/provider';
import { exportData, resetData } from '@/core/data';
import { haptics } from '@/utils/haptics';
import { systemZoneId, useTimezonePreference } from '@/core/clock/preference';
import { formatUtcOffset, offsetNow, zoneName } from '@/core/clock/zones';
import { setLocalePreference, useLocale, useLocalePreference, useT, type LocalePreference } from '@/i18n';
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
  const timezonePref = useTimezonePreference();
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
  const locale = useLocale();
  // 跟随系统 · 洛杉矶 UTC−8, or the chosen zone with the offset in force now.
  const zoneId = timezonePref === 'auto' ? systemZoneId() : timezonePref;
  const zoneText = zoneId ? `${zoneName(zoneId, locale)} · ${formatUtcOffset(offsetNow(zoneId))}` : '';
  const timezoneSubtitle = timezonePref === 'auto' ? [t('core.settings.timezoneAuto'), zoneText].filter(Boolean).join(' · ') : zoneText;
  const ai = useAIConfig();
  const campus = useCampusAccount();
  const cloud = useCloudProvider();
  const cloudHost = displayHost(cloud.baseURL);
  return (
    <Screen title={t('app.settings.title')}>
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
          <ListRow
            icon="cloud"
            title={t('app.settings.cloud')}
            subtitle={cloud.config.mode === 'off' || !cloudHost ? t('app.settings.cloudOff') : t(cloud.config.mode === 'official' ? 'app.settings.cloudOfficial' : 'app.settings.cloudCustom', { host: cloudHost })}
            onPress={() => router.push('/cloud-settings')}
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
          <Text variant="caption" tone="muted" className="px-1">
            {t('core.settings.appearance')}
          </Text>
          <Segmented options={themeOptions} value={pref} onChange={setThemePreference} />
          <Text variant="caption" tone="muted" className="mt-2 px-1">
            {t('core.settings.language')}
          </Text>
          <Segmented options={localeOptions} value={localePref} onChange={setLocalePreference} />
        </View>
      </FadeIn>
      <FadeIn index={4}>
        <ListGroup>
          <ListRow icon="globe" title={t('app.settings.timezone')} subtitle={timezoneSubtitle} onPress={() => router.push('/timezone')} />
        </ListGroup>
      </FadeIn>
      <FadeIn index={5}>
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
