import { useLocalSearchParams } from 'expo-router';

import { PluginScreenHost } from '@/screens/plugins/screen-host';

/** Modal screens contributed by plugins (forms): /m/<plugin>/<screen>. */
export default function PluginModalRoute() {
  const { plugin, screen, ...params } = useLocalSearchParams<{ plugin: string; screen: string } & Record<string, string>>();
  return <PluginScreenHost pluginId={plugin} screen={screen} params={params} />;
}
