import { Switch } from '@expo/ui';

import { NativeHost } from './native-host';

/** Native switch (Compose / SwiftUI) for use inside React Native layouts. */
export function NativeSwitch({
  value,
  onValueChange,
  disabled,
  label,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <NativeHost>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} testID={label} />
    </NativeHost>
  );
}
