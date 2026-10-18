import { Checkbox } from '@expo/ui';

import { NativeHost } from './native-host';

/** Native checkbox (Compose / SwiftUI) themed from our accent. */
export function NativeCheckbox({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label: string }) {
  return (
    <NativeHost accessible accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: value }}>
      <Checkbox value={value} onValueChange={onValueChange} testID={label} />
    </NativeHost>
  );
}
