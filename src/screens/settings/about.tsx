import * as Application from 'expo-application';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';

import { FadeIn } from '@/components/fade-in';
import { ListGroup, ListRow } from '@/components/list-group';
import { Logo } from '@/components/logo';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { installedVersion } from '@/core/update/app-update';
import { useLocale, useT } from '@/i18n';

const WEBSITE = 'https://harness.novadiffusion.com';
const SOURCE = 'https://github.com/pkuinfo/pku-harness';
const AUTHOR = { handle: '@wjsoj', url: 'https://github.com/wjsoj' } as const;

const open = (url: string) => void WebBrowser.openBrowserAsync(url, { showTitle: true, enableBarCollapsing: true, createTask: false });

/**
 * Settings › About: what is installed (the APK version and build, and the over-the-air update
 * running on top of it, if any), where the project lives, who made it, and the legal documents.
 */
export function AboutSettings() {
  const t = useT();
  const locale = useLocale();
  const build = Application.nativeBuildVersion;
  // An OTA update runs on top of the installed APK; the embedded bundle has no separate date.
  const update = Updates.isEnabled && !Updates.isEmbeddedLaunch && Updates.createdAt
    ? Updates.createdAt.toLocaleDateString(locale === 'en' ? 'en' : 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;
  const website = locale === 'en' ? `${WEBSITE}/en` : WEBSITE;

  return (
    <Screen title={t('app.settings.aboutTitle')} back>
      <FadeIn index={0}>
        <View className="items-center gap-2 py-4">
          <Logo size={72} />
          <Text variant="title">PKU Harness</Text>
          <Text variant="callout" tone="muted" align="center">
            {t('app.settings.aboutTagline')}
          </Text>
        </View>
      </FadeIn>
      <FadeIn index={1}>
        <ListGroup title={t('app.settings.aboutVersionGroup')}>
          <ListRow icon="phone" title={t('app.settings.aboutVersion')} value={build ? `${installedVersion()} (${build})` : installedVersion()} />
          <ListRow icon="sync" title={t('app.settings.aboutUpdate')} value={update ?? t('app.settings.aboutUpdateNone')} />
        </ListGroup>
      </FadeIn>
      <FadeIn index={2}>
        <ListGroup title={t('app.settings.aboutProject')}>
          <ListRow icon="globe" title={t('app.settings.aboutWebsite')} subtitle={website.replace('https://', '')} onPress={() => open(website)} />
          <ListRow icon="catalog" title={t('app.settings.aboutSource')} subtitle={SOURCE.replace('https://', '')} onPress={() => open(SOURCE)} />
          <ListRow icon="person" title={t('app.settings.aboutAuthor')} subtitle={AUTHOR.handle} onPress={() => open(AUTHOR.url)} />
        </ListGroup>
      </FadeIn>
      <FadeIn index={3}>
        <ListGroup title={t('app.settings.aboutLegal')} footer={t('app.settings.aboutLicense')}>
          <ListRow icon="fileText" title={t('app.settings.terms')} onPress={() => router.push('/legal/terms')} />
          <ListRow icon="shield" title={t('app.settings.privacy')} onPress={() => router.push('/legal/privacy')} />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
