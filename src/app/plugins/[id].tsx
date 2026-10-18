import { useLocalSearchParams } from 'expo-router';

import { PluginDetail } from '@/screens/plugins/detail';

export default function PluginDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PluginDetail id={id} />;
}
