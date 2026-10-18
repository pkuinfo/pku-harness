import { useLocalSearchParams } from 'expo-router';

import { AddRemotePlugin } from '@/screens/plugins/add-remote';

export default function AddRemotePluginRoute() {
  const { url, name } = useLocalSearchParams<{ url?: string; name?: string }>();
  return <AddRemotePlugin initialUrl={url} initialName={name} />;
}
