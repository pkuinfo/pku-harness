import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { installVerificationPrompt, useVerificationRequest, verification, type VerificationRequest } from '@/core/campus/verify';
import { shadows, spacing, springs, useTheme } from '@/theme';
import { haptics } from '@/utils/haptics';

import { Button } from './button';
import { Field } from './field';
import { Icon } from './icon';
import { Text } from './text';

const TITLE: Record<VerificationRequest['mode'], string> = { sms: '短信验证码', email: '邮件验证码', otp: '手机令牌验证码' };

/**
 * Asks for the second-factor code IAAA wants (any campus login, including background session
 * refreshes). The code goes straight to IAAA and is never stored.
 */
export function VerificationPrompt() {
  const req = useVerificationRequest();
  useEffect(() => installVerificationPrompt(), []);
  return req ? <Card key={req.id} req={req} /> : null;
}

function Card({ req }: { req: VerificationRequest }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState(req.sentTo);
  const [wait, setWait] = useState(req.resend ? 60 : 0);
  const [error, setError] = useState<string | null>(null);
  // Ride the keyboard so the code field stays visible.
  const keyboard = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: Math.min(0, keyboard.height.get()) }] }));

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const resend = async () => {
    if (!req.resend) return;
    setError(null);
    try {
      setSentTo((await req.resend()) ?? sentTo);
      setWait(60);
      haptics.tap();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const valid = /^\d{4,8}$/.test(code.trim());
  return (
    <View className="absolute inset-0" pointerEvents="box-none">
      <Animated.View entering={FadeIn} exiting={FadeOut} className="absolute inset-0" style={{ backgroundColor: c.scrim }} />
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0 }, lift]} pointerEvents="box-none">
      <Animated.View
        entering={SlideInDown.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness)}
        exiting={SlideOutDown}
        accessibilityViewIsModal
        className="absolute bottom-2 left-2 right-2 gap-3 rounded-xl bg-elevated p-4"
        style={{ borderCurve: 'continuous', paddingBottom: Math.max(insets.bottom, spacing.lg), boxShadow: shadows.overlay }}>
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-md bg-accent-muted" style={{ borderCurve: 'continuous' }}>
            <Icon name="shield" size={20} color={c.accent} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="micro" tone="faint">
              {`${req.service} · 统一身份认证`}
            </Text>
            <Text variant="headline">{`需要${TITLE[req.mode]}`}</Text>
          </View>
        </View>
        <Text variant="callout" tone="muted">
          {req.mode === 'otp' ? '打开手机令牌 App，输入当前显示的 6 位数字。' : sentTo ? `验证码已发送至 ${sentTo}。` : '验证码已发送到账号绑定的手机。'}
        </Text>
        <Field value={code} onChangeText={setCode} keyboardType="number-pad" placeholder={req.mode === 'otp' ? '6 位数字' : '验证码'} autoFocus textContentType="oneTimeCode" autoComplete="sms-otp" error={error ?? undefined} />
        {req.resend ? (
          <Button title={wait > 0 ? `${wait} 秒后可重新发送` : '重新发送验证码'} size="sm" variant="ghost" disabled={wait > 0} onPress={() => void resend()} className="self-start" />
        ) : null}
        <View className="flex-row gap-2">
          <Button title="取消" variant="secondary" onPress={() => verification.answer(req.id, null)} className="flex-1" />
          <Button
            title="验证"
            disabled={!valid}
            onPress={() => {
              haptics.success();
              verification.answer(req.id, code.trim());
            }}
            className="flex-2"
          />
        </View>
      </Animated.View>
      </Animated.View>
    </View>
  );
}
