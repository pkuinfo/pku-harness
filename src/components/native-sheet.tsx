import { BottomSheet } from '@expo/ui';
import { Column, Host, ModalBottomSheet, type ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

/**
 * A native modal bottom sheet that opens fully, at its content's height. On Android the universal
 * `BottomSheet` either stops half-way (hiding a tall sheet's buttons) or, with `snapPoints:
 * ['full']`, stretches to the whole screen; Material's own sheet with `skipPartiallyExpanded`
 * does neither. Content goes in an `RNHostView matchContents` with an explicit width.
 */
export function NativeSheet({ open, onDismiss, color, children }: { open: boolean; onDismiss: () => void; color: string; children: ReactNode }) {
  const ref = useRef<ModalBottomSheetRef>(null);
  // Stay mounted while the sheet animates away.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    let live = true;
    void (ref.current?.hide() ?? Promise.resolve()).then(() => live && setMounted(false));
    return () => {
      live = false;
    };
  }, [open, mounted]);

  if (Platform.OS !== 'android') {
    return (
      <BottomSheet isPresented={open} onDismiss={onDismiss} containerColor={color} contentPadding={{ left: 0, right: 0, top: 0, bottom: 0 }}>
        {children}
      </BottomSheet>
    );
  }
  if (!mounted) return null;
  return (
    <Host style={{ position: 'absolute' }} pointerEvents="none">
      <ModalBottomSheet ref={ref} onDismissRequest={onDismiss} skipPartiallyExpanded containerColor={color}>
        <Column>{children}</Column>
      </ModalBottomSheet>
    </Host>
  );
}
