import { View } from 'react-native';

import { Markdown } from '@/components/markdown';
import { Screen } from '@/components/screen';
import { legalDocument, type LegalDoc } from '@/core/legal';
import { useLocale } from '@/i18n';

/** The Terms of Service or Privacy Policy, bundled with the app so it reads offline. */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  const { title, body } = legalDocument(doc, useLocale());
  return (
    <Screen title={title} back>
      <View className="pb-6">
        <Markdown text={body} />
      </View>
    </Screen>
  );
}
