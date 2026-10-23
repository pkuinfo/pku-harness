import { useLocalSearchParams } from 'expo-router';

import { ShareLinkRoute } from '@/screens/cloud/share-link';

/** Opened share links (`pkuharness://share/<id>#k=…`, rewritten by +native-intent). */
export default function ShareRoute() {
  const { id, h } = useLocalSearchParams<{ id: string; h?: string }>();
  return <ShareLinkRoute channelId={id} handle={h} />;
}
