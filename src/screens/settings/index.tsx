import { useState } from 'react';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Alert, View } from 'react-native';

import { FadeIn } from '@/components/fade-in';
import { ListGroup, ListRow } from '@/components/list-group';
import { NativeSwitch } from '@/components/native-switch';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { modelInfo } from '@/core/agent/attachments/attachments';
import { useSpeechConfig } from '@/core/speech/config';
import { useAIConfig } from '@/core/agent/provider';
import { useCampusAccount } from '@/core/campus/account';
import { displayHost } from '@/core/cloud/config';
import { useCloudProvider } from '@/core/cloud/provider';
import { exportData, resetData } from '@/core/data';
import { fetchAppUpdate, installedVersion, setAutoDownload, useAppUpdate, useAutoDownload } from '@/core/update/app-update';
import { useInstallState } from '@/core/update/install';
import { promptAppUpdate } from '@/components/update-prompt';
import { haptics, setHapticsEnabled, useHapticsEnabled } from '@/utils/haptics';
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
  const hapticsOn = useHapticsEnabled();
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
  const voice = useSpeechConfig();
  const campus = useCampusAccount();
  const cloud = useCloudProvider();
  const cloudHost = displayHost(cloud.baseURL);
  const update = useAppUpdate();
  const install = useInstallState();
  const autoUpdate = useAutoDownload();
  const [checking, setChecking] = useState<string | null>(null);
  const checkNow = async () => {
    setChecking(t('app.settings.checking'));
    try {
      const u = await fetchAppUpdate();
      if (u) promptAppUpdate(u);
      setChecking(u ? null : t('app.settings.upToDate'));
    } catch (e) {
      setChecking(t('app.settings.checkFailed', { reason: e instanceof Error ? e.message : String(e) }));
    }
  };
  return (
    <Screen title={t('app.settings.title')}>
      {update ? (
        <FadeIn index={0}>
          <ListGroup>
            <ListRow
              icon="download"
              iconTint={c.accent}
              title={t(install.phase === 'ready' ? 'app.settings.updateRowReady' : install.phase === 'downloading' ? 'app.settings.updateRowDownloading' : 'app.settings.updateRow', { version: update.version })}
              subtitle={
                install.phase === 'ready'
                  ? t('app.settings.updateRowReadySubtitle')
                  : install.phase === 'downloading'
                    ? install.waitingForNetwork
                      ? t('app.settings.updateWaitingWifi')
                      : install.total > 0
                        ? `${Math.round((install.written / install.total) * 100)}%`
                        : t('app.settings.updateBackground')
                    : t('app.settings.updateRowSubtitle')
              }
              onPress={() => promptAppUpdate(update)}
            />
          </ListGroup>
        </FadeIn>
      ) : null}
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
            icon="mic"
            title={t('app.settings.voice')}
            subtitle={voice.ready && voice.provider ? `${voice.provider.def.name} · ${voice.provider.def.models.find((m) => m.id === voice.settings.model)?.name ?? voice.settings.model}` : t('app.settings.voiceOff')}
            onPress={() => router.push('/voice-settings')}
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
          <Text variant="micro" tone="faint" className="px-4">
            {t('core.settings.appearance').toUpperCase()}
          </Text>
          <Segmented options={themeOptions} value={pref} onChange={setThemePreference} />
          <Text variant="micro" tone="faint" className="mt-2 px-4">
            {t('core.settings.language').toUpperCase()}
          </Text>
          <Segmented options={localeOptions} value={localePref} onChange={setLocalePreference} />
        </View>
      </FadeIn>
      <FadeIn index={4}>
        <ListGroup>
          <ListRow icon="globe" title={t('app.settings.timezone')} subtitle={timezoneSubtitle} onPress={() => router.push('/timezone')} />
          <ListRow
            icon="bolt"
            title={t('app.settings.haptics')}
            subtitle={t('app.settings.hapticsSubtitle')}
            accessory={<NativeSwitch value={hapticsOn} onValueChange={setHapticsEnabled} label={t('app.settings.haptics')} />}
          />
        </ListGroup>
      </FadeIn>
      <FadeIn index={5}>
        <ListGroup title={t('app.settings.data')} footer={t('app.settings.dataFooter')}>
          <ListRow
            icon="send2"
            title={t('app.settings.export')}
            subtitle={t('app.settings.exportSubtitle')}
            onPress={async () => {
              try {
                // A file, not message text: a large export would exceed Android's share size limit.
                const file = new File(Paths.cache, `pku-harness-export-${new Date().toISOString().slice(0, 10)}.json`);
                file.write(JSON.stringify(await exportData(), null, 2));
                await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: t('app.settings.exportTitle') });
              } catch (e) {
                haptics.warning();
                Alert.alert(t('app.settings.exportTitle'), e instanceof Error ? e.message : String(e));
              }
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
                    try {
                      await resetData();
                      haptics.success();
                      // A fresh app starts at the welcome, not inside an emptied one.
                      router.replace('/welcome');
                    } catch (e) {
                      haptics.warning();
                      Alert.alert(t('app.settings.resetTitle'), e instanceof Error ? e.message : String(e));
                    }
                  },
                },
              ])
            }
          />
        </ListGroup>
      </FadeIn>
      <FadeIn index={6}>
        <ListGroup title={t('app.settings.about')}>
          <ListRow
            icon="download"
            title={t('app.settings.autoUpdate')}
            subtitle={t('app.settings.autoUpdateSubtitle')}
            accessory={<NativeSwitch value={autoUpdate} onValueChange={(v) => void setAutoDownload(v)} label={t('app.settings.autoUpdate')} />}
          />
          <ListRow icon="refresh" title={t('app.settings.checkUpdates')} subtitle={checking ?? t('app.settings.version', { version: installedVersion() })} onPress={() => void checkNow()} />
          <ListRow icon="help" title={t('app.settings.aboutRow')} subtitle={t('app.settings.aboutRowSubtitle')} onPress={() => router.push('/about')} />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
