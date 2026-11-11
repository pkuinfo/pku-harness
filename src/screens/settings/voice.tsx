import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Field, SecretField } from '@/components/field';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { dismiss, SheetScreen } from '@/components/sheet-screen';
import { Text } from '@/components/text';
import { usePlugins } from '@/core/runtime/hooks';
import { registry } from '@/core/runtime/registry';
import { DEFAULT_SPEECH_PROVIDER, speechConfig, useSpeechConfig } from '@/core/speech/config';
import { useLocale, useT } from '@/i18n';
import { useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

function Choice({ title, detail, selected, onPress }: { title: string; detail?: string; selected: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      className={cx('min-h-12 gap-0.5 rounded-md px-3 py-2.5', selected ? 'bg-surface-2' : 'bg-transparent')}
      style={{ borderCurve: 'continuous' }}>
      <View className="flex-row items-center gap-2">
        <Text variant="callout" className="flex-1">
          {title}
        </Text>
        {selected ? <Icon name="check" size={16} color={c.textMuted} /> : null}
      </View>
      {detail ? (
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/**
 * Settings → Voice input: the speech-to-text service behind the composer's mic, with the user's
 * own key. Recordings go from the phone straight to that service.
 */
export function VoiceSettings() {
  const t = useT();
  // Re-read on plugin and language changes: names and model blurbs come localized from the registry.
  useLocale();
  usePlugins();
  const { providerId, keys, loaded } = useSpeechConfig();
  // The default service first, a custom endpoint last.
  const services = registry
    .speechProviders()
    .sort((a, b) => Number(b.id === DEFAULT_SPEECH_PROVIDER) - Number(a.id === DEFAULT_SPEECH_PROVIDER) || Number(!!a.def.editableBaseURL) - Number(!!b.def.editableBaseURL));
  const [selectedId, setSelectedId] = useState(providerId);
  // A saved choice whose plugin is gone falls back to the default.
  const entry = services.find((s) => s.id === selectedId) ?? services.find((s) => s.id === DEFAULT_SPEECH_PROVIDER) ?? services[0];
  const initial = speechConfig.settingsFor(entry?.id ?? '');
  const [baseURL, setBaseURL] = useState(initial.baseURL);
  const [model, setModel] = useState(initial.model);
  const [credential, setCredential] = useState('');
  const [savedCredential, setSavedCredential] = useState('');
  // Load the saved key when the service changes (by id: the registry builds new entry objects
  // on every render, and reloading on those reset the field on each keystroke).
  const entryId = entry?.id;
  useEffect(() => {
    if (!entryId) return;
    let live = true;
    void speechConfig.credential(entryId).then((k) => {
      if (!live) return;
      setSavedCredential(k ?? '');
      setCredential(k ?? '');
    });
    return () => {
      live = false;
    };
  }, [entryId]);
  // Opened before the saved settings were read (right after launch): show them once they are.
  const [synced, setSynced] = useState(loaded);
  if (loaded && !synced) {
    setSynced(true);
    const saved = speechConfig.settingsFor(providerId);
    setSelectedId(providerId);
    setBaseURL(saved.baseURL);
    setModel(saved.model);
  }
  if (!entry) return null;

  const select = (id: string) => {
    const s = speechConfig.settingsFor(id);
    setSelectedId(id);
    setBaseURL(s.baseURL);
    setModel(s.model);
  };
  const hasKey = !!keys[entry.id];
  const canSave = !!model.trim() && (!!credential.trim() || !!entry.def.editableBaseURL);

  return (
    <SheetScreen
      title={t('app.voice.title')}
      primary={t('app.voice.save')}
      primaryDisabled={!canSave}
      onPrimary={async () => {
        const next = credential.trim();
        await speechConfig.save(entry.id, { baseURL: baseURL.trim(), model: model.trim() }, { credential: next !== savedCredential ? next : undefined });
        haptics.success();
        dismiss('/');
      }}>
      <Text variant="callout" tone="muted">
        {t('app.voice.intro')}
      </Text>

      <View className="gap-2">
        {services.map((s) => (
          <Choice key={s.id} title={s.def.name} detail={s.def.description} selected={s.id === entry.id} onPress={() => select(s.id)} />
        ))}
      </View>

      <Animated.View key={entry.id} entering={FadeIn} layout={LinearTransition} className="gap-4">
        {entry.def.models.length ? (
          <View className="gap-2">
            <Text variant="callout" tone="muted">
              {t('app.voice.model')}
            </Text>
            {entry.def.models.map((m) => (
              <Choice key={m.id} title={m.name} detail={m.description} selected={model === m.id} onPress={() => setModel(m.id)} />
            ))}
          </View>
        ) : (
          <Field label={t('app.voice.modelId')} value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} />
        )}
        {entry.def.editableBaseURL ? (
          <Field label="Base URL" value={baseURL} onChangeText={setBaseURL} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        ) : (
          <Text variant="caption" tone="faint">
            {t('app.ai.endpoint', { url: baseURL })}
          </Text>
        )}
        <View className="gap-2">
          <SecretField label="API Key" value={credential} onChangeText={setCredential} placeholder="sk-…" hint={entry.def.credentialHint} />
          {hasKey ? <Chip label={credential.trim() === savedCredential ? t('app.ai.keySaved') : t('app.ai.keyChanged')} tone={credential.trim() === savedCredential ? 'up' : 'warn'} icon="lock" /> : null}
          {entry.def.keyURL ? (
            <Button title={t('app.voice.getKey')} variant="ghost" icon="key" onPress={() => void WebBrowser.openBrowserAsync(entry.def.keyURL!, { createTask: false })} />
          ) : null}
        </View>
        <Text variant="caption" tone="faint">
          {t('app.voice.privacy', { name: entry.def.name })}
        </Text>
      </Animated.View>
    </SheetScreen>
  );
}
