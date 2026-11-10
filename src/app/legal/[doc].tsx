import { Redirect, useLocalSearchParams } from 'expo-router';

import { isLegalDoc } from '@/core/legal';
import { LegalDocument } from '@/screens/legal/legal-document';

export default function LegalRoute() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  return isLegalDoc(doc) ? <LegalDocument doc={doc} /> : <Redirect href="/" />;
}
