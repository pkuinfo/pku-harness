import { useLocalSearchParams } from 'expo-router';

import { AddRemotePlugin } from '@/screens/plugins/add-remote';

/** Add a plugin: `?link=` (PLUGIN.md, also from pkuharness://plugin deep links), `?draft=` (written with the AI) or `?url=` (MCP). */
export default function AddRemotePluginRoute() {
  const { url, name, link, draft } = useLocalSearchParams<{ url?: string; name?: string; link?: string; draft?: string }>();
  return <AddRemotePlugin initialUrl={link ?? url} initialName={name} draft={draft} />;
}
