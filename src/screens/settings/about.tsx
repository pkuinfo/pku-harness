import * as Application from 'expo-application';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { FadeIn } from '@/components/fade-in';
import { Icon, type IconName } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-group';
import { Logo } from '@/components/logo';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { installedVersion } from '@/core/update/app-update';
import { useLocale, useT } from '@/i18n';
import { useTheme } from '@/theme';

const WEBSITE = 'https://pkuharness.com';
const SOURCE = 'https://github.com/pkuinfo/pku-harness';
const CONTRIBUTORS = `${SOURCE}/graphs/contributors`;
const CONTRIBUTORS_API = 'https://api.github.com/repos/pkuinfo/pku-harness/contributors?per_page=24';
const AVATAR = 32;

const open = (url: string) => void WebBrowser.openBrowserAsync(url, { showTitle: true, enableBarCollapsing: true, createTask: false });

function Pledge({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const c = useTheme();
  return (
    <View className="flex-row gap-3">
      <Icon name={icon} size={20} color={c.accent} style={{ marginTop: 1 }} />
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong">
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          {body}
        </Text>
      </View>
    </View>
  );
}

type Contributor = { login: string; avatar: string };

/** GitHub's contributors (avatars), newest list each visit; nothing shows when offline. */
function useContributors() {
  const [list, setList] = useState<Contributor[]>([]);
  useEffect(() => {
    const ac = new AbortController();
    fetch(CONTRIBUTORS_API, { signal: ac.signal, headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { login?: unknown; avatar_url?: unknown; type?: unknown }[]) =>
        setList(rows.filter((r) => r.type !== 'Bot' && typeof r.login === 'string' && typeof r.avatar_url === 'string').map((r) => ({ login: r.login as string, avatar: `${r.avatar_url as string}&s=${AVATAR * 3}` }))),
      )
      .catch(() => {});
    return () => ac.abort();
  }, []);
  return list;
}

function Contributors() {
  const t = useT();
  const people = useContributors();
  return (
    <Pressable onPress={() => open(CONTRIBUTORS)} accessibilityRole="link" accessibilityLabel={t('app.settings.aboutContributors')} className="gap-3 px-4 py-3">
      {people.length ? (
        <View className="flex-row flex-wrap gap-2">
          {people.map((p) => (
            <Image key={p.login} source={{ uri: p.avatar }} accessibilityLabel={p.login} transition={160} style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }} />
          ))}
        </View>
      ) : null}
      <Text variant="callout" tone="muted">
        {t('app.settings.aboutStartedBy')}
      </Text>
    </Pressable>
  );
}

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
          <Text variant="title">PKU harness</Text>
          <Text variant="callout" tone="muted" align="center">
            {t('app.settings.aboutTagline')}
          </Text>
        </View>
      </FadeIn>
      <FadeIn index={1}>
        <View className="gap-4 rounded-lg bg-surface-2 px-4 py-4" style={{ borderCurve: 'continuous' }}>
          <Text variant="micro" tone="faint">
            {t('app.settings.aboutPromise')}
          </Text>
          <Pledge icon="catalog" title={t('app.settings.aboutPromiseOpen')} body={t('app.settings.aboutPromiseOpenBody')} />
          <Pledge icon="gift" title={t('app.settings.aboutPromiseFree')} body={t('app.settings.aboutPromiseFreeBody')} />
        </View>
      </FadeIn>
      <FadeIn index={2}>
        <ListGroup title={t('app.settings.aboutVersionGroup')}>
          <ListRow icon="phone" title={t('app.settings.aboutVersion')} value={build ? `${installedVersion()} (${build})` : installedVersion()} />
          <ListRow icon="sync" title={t('app.settings.aboutUpdate')} value={update ?? t('app.settings.aboutUpdateNone')} />
        </ListGroup>
      </FadeIn>
      <FadeIn index={3}>
        <ListGroup title={t('app.settings.aboutContributors')}>
          <Contributors />
        </ListGroup>
      </FadeIn>
      <FadeIn index={4}>
        <ListGroup title={t('app.settings.aboutProject')}>
          <ListRow icon="globe" title={t('app.settings.aboutWebsite')} subtitle={website.replace('https://', '')} onPress={() => open(website)} />
          <ListRow icon="catalog" title={t('app.settings.aboutSource')} subtitle={SOURCE.replace('https://', '')} onPress={() => open(SOURCE)} />
        </ListGroup>
      </FadeIn>
      <FadeIn index={5}>
        <ListGroup title={t('app.settings.aboutLegal')} footer={t('app.settings.aboutLicense')}>
          <ListRow icon="fileText" title={t('app.settings.terms')} onPress={() => router.push('/legal/terms')} />
          <ListRow icon="shield" title={t('app.settings.privacy')} onPress={() => router.push('/legal/privacy')} />
        </ListGroup>
      </FadeIn>
    </Screen>
  );
}
