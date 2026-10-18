import { useLocalSearchParams } from 'expo-router';

import { PluginScreenHost } from '@/screens/plugins/screen-host';

/** Screens contributed by plugins: /p/<plugin>/<screen>. */
export default function PluginScreenRoute() {
  const { plugin, screen, ...params } = useLocalSearchParams<{ plugin: string; screen: string } & Record<string, string>>();
  return <PluginScreenHost pluginId={plugin} screen={screen} params={params} />;
}
