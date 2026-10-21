import { SymbolView } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

/**
 * App icon set: one name → SF Symbol (iOS) + Material Symbol (Android/web).
 * Add icons here; never pass raw symbol names from screens.
 */
export const icons = {
  chat: { ios: 'bubble.left.and.text.bubble.right', android: 'forum' },
  dashboard: { ios: 'square.grid.2x2', android: 'dashboard' },
  schedule: { ios: 'calendar', android: 'calendar_month' },
  settings: { ios: 'gearshape', android: 'settings' },
  send: { ios: 'arrow.up', android: 'arrow_upward' },
  down: { ios: 'arrow.down', android: 'arrow_downward' },
  stop: { ios: 'stop.fill', android: 'stop' },
  plus: { ios: 'plus', android: 'add' },
  minus: { ios: 'minus', android: 'remove' },
  close: { ios: 'xmark', android: 'close' },
  check: { ios: 'checkmark', android: 'check' },
  eye: { ios: 'eye', android: 'visibility' },
  eyeOff: { ios: 'eye.slash', android: 'visibility_off' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more' },
  card: { ios: 'creditcard', android: 'credit_card' },
  wifi: { ios: 'wifi', android: 'wifi' },
  book: { ios: 'book', android: 'menu_book' },
  bell: { ios: 'bell', android: 'notifications' },
  clock: { ios: 'clock', android: 'schedule' },
  location: { ios: 'mappin.and.ellipse', android: 'location_on' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome' },
  key: { ios: 'key', android: 'key' },
  person: { ios: 'person.crop.circle', android: 'account_circle' },
  puzzle: { ios: 'puzzlepiece.extension', android: 'extension' },
  palette: { ios: 'paintpalette', android: 'palette' },
  trash: { ios: 'trash', android: 'delete' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
  copy: { ios: 'doc.on.doc', android: 'content_copy' },
  qr: { ios: 'qrcode', android: 'qr_code_2' },
  trendUp: { ios: 'arrow.up.right', android: 'trending_up' },
  trendDown: { ios: 'arrow.down.right', android: 'trending_down' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  wrench: { ios: 'wrench.and.screwdriver', android: 'build' },
  todo: { ios: 'checklist', android: 'checklist' },
  repeat: { ios: 'repeat', android: 'repeat' },
  edit: { ios: 'pencil', android: 'edit' },
  lock: { ios: 'lock', android: 'lock' },
  globe: { ios: 'globe', android: 'language' },
  back: { ios: 'chevron.left', android: 'arrow_back' },
  shield: { ios: 'checkmark.shield', android: 'verified_user' },
  alarm: { ios: 'alarm', android: 'alarm' },
  bolt: { ios: 'bolt', android: 'bolt' },
  send2: { ios: 'paperplane', android: 'send' },
  drag: { ios: 'line.3.horizontal', android: 'drag_handle' },
  calendarClock: { ios: 'calendar.badge.clock', android: 'event_upcoming' },
  calendar: { ios: 'calendar', android: 'calendar_today' },
  server: { ios: 'server.rack', android: 'dns' },
  search: { ios: 'magnifyingglass', android: 'search' },
  store: { ios: 'bag', android: 'storefront' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  compress: { ios: 'arrow.down.right.and.arrow.up.left', android: 'compress' },
  gauge: { ios: 'gauge.with.dots.needle.33percent', android: 'data_usage' },
  chart: { ios: 'chart.bar', android: 'bar_chart' },
  help: { ios: 'questionmark.circle', android: 'help' },
  // Composer (docs/AGENT-HARNESS.md §4).
  camera: { ios: 'camera', android: 'photo_camera' },
  photos: { ios: 'photo.on.rectangle', android: 'photo_library' },
  image: { ios: 'photo', android: 'image' },
  file: { ios: 'doc', android: 'description' },
  fileText: { ios: 'doc.plaintext', android: 'article' },
  command: { ios: 'command', android: 'terminal' },
  expand: { ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full' },
  queue: { ios: 'text.line.last.and.arrowtriangle.forward', android: 'queue' },
  pause: { ios: 'pause.circle', android: 'pause_circle' },
  play: { ios: 'play.fill', android: 'play_arrow' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo' },
  pin: { ios: 'pin', android: 'push_pin' },
} as const;

export type IconName = keyof typeof icons;

export function Icon({
  name,
  size = 22,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useTheme();
  // Plugins name icons by string; an unknown name falls back instead of crashing the screen.
  const def = icons[name] ?? icons.puzzle;
  return (
    <SymbolView
      name={{ ios: def.ios as never, android: def.android as never, web: def.android as never }}
      size={size}
      tintColor={color ?? colors.text}
      style={[{ width: size, height: size }, style]}
    />
  );
}
