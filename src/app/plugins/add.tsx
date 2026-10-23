import { useLocalSearchParams } from 'expo-router';

import { AddRemotePlugin } from '@/screens/plugins/add-remote';

/** Add a plugin by link: `?link=` (PLUGIN.md, from pkuharness://plugin deep links) or `?url=` (MCP). */
export default function AddRemotePluginRoute() {
  const { url, name, link } = useLocalSearchParams<{ url?: string; name?: string; link?: string }>();
  return <AddRemotePlugin initialUrl={link ?? url} initialName={name} />;
}
