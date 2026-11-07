import { router } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Field } from '@/components/field';
import { FadeIn } from '@/components/fade-in';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-group';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { setTimezonePreference, systemZoneId, useTimezonePreference, type TimezonePreference } from '@/core/clock/preference';
import { formatUtcOffset, offsetNow, searchZones, zoneName } from '@/core/clock/zones';
import { useLocale, useT } from '@/i18n';
import { useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

/**
 * Settings › 时区: follow the system (default) or any listed zone. One choice moves every layer
 * (core/clock/preference.ts); daylight saving comes from the zone itself, so offsets shown here
 * are the ones in force right now.
 */
export function TimezoneSettings() {
  const c = useTheme();
  const t = useT();
  const locale = useLocale();
  const pref = useTimezonePreference();
  // The input is uncontrolled and the list filters from a deferred copy, so typing never waits
  // on re-rendering ~70 rows.
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const zones = useMemo(() => searchZones(deferred, locale), [deferred, locale]);
  const system = systemZoneId();

  const pick = (next: TimezonePreference) => {
    haptics.select();
    setTimezonePreference(next);
    router.back();
  };
  const check = (on: boolean) => (on ? <Icon name="check" size={20} color={c.accent} /> : null);
  const label = (id: string) => `${zoneName(id, locale)} · ${formatUtcOffset(offsetNow(id))}`;

  return (
    <Screen title={t('app.settings.timezone')} back keyboardShouldPersistTaps="handled">
      <FadeIn index={0}>
        <ListGroup footer={t('app.settings.timezoneFooter')}>
          <ListRow
            icon="globe"
            title={t('app.settings.timezoneSystem')}
            subtitle={system ? t('app.settings.timezoneSystemNow', { zone: label(system) }) : undefined}
            accessory={check(pref === 'auto')}
            chevron={false}
            onPress={() => pick('auto')}
          />
        </ListGroup>
      </FadeIn>
      <FadeIn index={1}>
        <View className="gap-3">
          <Field
            onChangeText={setQuery}
            placeholder={t('app.settings.timezoneSearch')}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={t('app.settings.timezoneSearch')}
          />
          {zones.length ? (
            <ListGroup>
              {zones.map((z) => (
                <ListRow
                  key={z.id}
                  title={zoneName(z.id, locale)}
                  subtitle={`${formatUtcOffset(offsetNow(z.id))} · ${z.id}`}
                  accessory={check(pref === z.id)}
                  chevron={false}
                  onPress={() => pick(z.id)}
                />
              ))}
            </ListGroup>
          ) : (
            <Text variant="callout" tone="muted" className="px-4 py-6 text-center">
              {t('app.settings.timezoneNoMatch', { query: deferred.trim() })}
            </Text>
          )}
        </View>
      </FadeIn>
    </Screen>
  );
}
