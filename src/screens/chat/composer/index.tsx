import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import { TextInput, View, type TextInputContentSizeChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion, withSpring, ZoomIn, ZoomOut, type LayoutAnimationFunction } from 'react-native-reanimated';

import { IconButton } from '@/components/button';
import { ContextRing } from '@/components/context-ring';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import {
  acceptsImages,
  discardAttachmentFile,
  limitNotice,
  MAX_ATTACHMENTS,
  pickFiles,
  pickImages,
  remainingSlots,
  takePhoto,
  textAttachment,
} from '@/core/agent/attachments/attachments';
import type { AttachmentPart } from '@/core/agent/session/chat-store';
import { sendMessage, stopGeneration } from '@/core/agent/run';
import { sessions, useDraftRevision, useQueue, type QueuedMessage } from '@/core/agent/session/sessions';
import { executeCommandLine, listCommands, menuQuery, parseCommand, rankCommands, type Command, type CommandContext } from '@/core/commands';
import { useT } from '@/i18n';
import { springs, typography, useTheme } from '@/theme';
import { cx } from '@/utils/cx';
import { haptics } from '@/utils/haptics';

import { CommandMenu } from '@/screens/chat/command-menu';
import { AttachSheet, type AttachAction } from './attach-sheet';
import { AttachmentTray, pasteName } from './attachment-tray';
import { composerDraft, useComposerRevision, useDraft } from './draft';
import { counterState, countChars, detectPaste, formatCount, MAX_LINES } from './logic';
import { imageModelSuggestion, modelLabel } from './models';
import { FullEditor, ImagePreview, TextPreview } from './previews';
import { QueueChips } from './queue-chips';
import { applyModel, useActiveSessionId, useSessionBusy, useSessionEmpty, useSessionModel } from './session';
import { ComposerToast, composerToast } from './toast';

const LINE = typography.body.lineHeight;
/** Grows to 6 lines, then scrolls (§4.3). */
const MAX_INPUT_HEIGHT = LINE * MAX_LINES;
const CURVE = { borderCurve: 'continuous' } as const;

/**
 * The composer (docs/AGENT-HARNESS.md §4): attachment tray, growing input with a full-screen
 * editor, `+` / model pill / context ring / counter / send-stop, queue chips and the command menu
 * above. Reads the active session itself; the draft is per session and survives restarts.
 */
export function Composer({ glass = false }: { glass?: boolean }) {
  const c = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const sessionId = useActiveSessionId();
  const busy = useSessionBusy();
  const empty = useSessionEmpty();
  const { providerId, model } = useSessionModel();
  const draft = useDraft();
  const revision = useComposerRevision();
  const { text, attachments } = draft;
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  // Keep the draft in line with the session (switch, late load, 编辑 from a message).
  const loaded = useSyncExternalStore(sessions.subscribe, () => !!sessions.data(sessionId));
  const draftRevision = useDraftRevision();
  useEffect(() => {
    composerDraft.sync(sessionId, loaded, draftRevision);
  }, [sessionId, loaded, draftRevision]);

  // An outside put (edit & resend, a command, pulling back a queued message) focuses the input.
  const seenRevision = useRef(revision);
  useEffect(() => {
    if (revision === seenRevision.current) return;
    seenRevision.current = revision;
    if (composerDraft.get().text) input.current?.focus();
  }, [revision]);

  const [pending, setPending] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [preview, setPreview] = useState<AttachmentPart | null>(null);
  const [editor, setEditor] = useState(false);
  const [tall, setTall] = useState(false);

  const chars = useMemo(() => countChars(text), [text]);
  const counter = counterState(chars);
  const hasContent = text.trim().length > 0 || attachments.length > 0;
  // A half-typed command the / menu is still matching ("/", "/co") must not go out as text:
  // the user picks from the menu or finishes the name. Unknown "/xyz" (no match) can be sent.
  const query = attachments.length === 0 ? menuQuery(text) : null;
  const partialCommand = query !== null && !parseCommand(text) && rankCommands(listCommands(), query).length > 0;
  const canSend = hasContent && !counter.over && pending === 0 && !partialCommand;
  const images = acceptsImages(providerId, model);

  // ---- queue (§4.4) -------------------------------------------------------------------------
  const { queue, paused } = useQueue(sessionId);

  // ---- attachments (§4.2) -------------------------------------------------------------------
  const addAttachments = useCallback((added: AttachmentPart[]) => {
    if (!added.length) return;
    const cur = composerDraft.get().attachments;
    const room = remainingSlots(cur.length);
    composerDraft.setAttachments([...cur, ...added.slice(0, room)]);
    if (added.length > room) composerToast.show(limitNotice(), 'warn');
  }, []);

  const removeAttachment = useCallback((a: AttachmentPart) => {
    haptics.tap();
    composerDraft.setAttachments(composerDraft.get().attachments.filter((x) => x.id !== a.id));
    // An image from a sent message (编辑) or a queued one still shows there; keep its file.
    const inUse =
      sessions.data(sessionId)?.messages.some((m) => m.parts.some((p) => p.type === 'attachment' && p.id === a.id)) ||
      sessions.queue(sessionId).some((q) => q.attachments.some((x) => x.id === a.id));
    if (!inUse) discardAttachmentFile(a);
    setPreview(null);
  }, [sessionId]);

  const runPick = useCallback(
    async (action: Exclude<AttachAction, 'command'>) => {
      const count = composerDraft.get().attachments.length;
      try {
        // Photos take a moment to resize; placeholder tiles hold their place in the tray.
        const outcome =
          action === 'camera' ? await takePhoto(count, setPending) : action === 'library' ? await pickImages(count, setPending) : await pickFiles(count);
        addAttachments(outcome.added);
        if (outcome.added.length) haptics.select();
        if (outcome.notice) {
          haptics.warning();
          composerToast.show(outcome.notice, 'warn');
        }
      } catch {
        haptics.warning();
        composerToast.show(t('chat.composer.attachFailed'), 'warn');
      } finally {
        setPending(0);
      }
    },
    [addAttachments, t],
  );

  const onAttach = useCallback(
    (action: AttachAction) => {
      setSheet(false);
      if (action === 'command') {
        // `/` at the start opens the command menu; keep whatever was typed after it.
        const cur = composerDraft.get().text;
        composerDraft.put({ text: cur.startsWith('/') ? cur : `/${cur}`, attachments: composerDraft.get().attachments });
        requestAnimationFrame(() => input.current?.focus());
        return;
      }
      void runPick(action);
    },
    [runPick],
  );

  const suggestion = useMemo(() => (images ? null : imageModelSuggestion()), [images]);

  // ---- text (§4.3) --------------------------------------------------------------------------
  // Android's controlled TextInput can report the same paste twice (the native field still holds
  // the text until the reset value lands, ~3 ms apart): turn one paste into one chip.
  const lastPaste = useRef<{ text: string; at: number } | null>(null);
  const onChangeText = useCallback(
    (next: string) => {
      const prev = composerDraft.get().text;
      const paste = detectPaste(prev, next);
      if (paste && lastPaste.current && lastPaste.current.text === paste.pasted && Date.now() - lastPaste.current.at < 500) {
        composerDraft.setText(paste.rest);
        return;
      }
      if (paste) {
        lastPaste.current = { text: paste.pasted, at: Date.now() };
        if (remainingSlots(composerDraft.get().attachments.length) === 0) {
          composerToast.show(t('chat.composer.pasteFull'), 'warn');
        } else {
          haptics.select();
          composerDraft.setText(paste.rest);
          addAttachments([textAttachment(paste.pasted, pasteName())]);
          return;
        }
      }
      composerDraft.setText(next);
    },
    [addAttachments, t],
  );

  // The full editor opens with the keyboard up and the cursor after the last character.
  const editorInput = useRef<ComponentRef<typeof TextInput>>(null);
  const focusEditor = useCallback(() => {
    const end = composerDraft.get().text.length;
    editorInput.current?.focus();
    editorInput.current?.setSelection(end, end);
  }, []);

  const onContentSize = useCallback((e: TextInputContentSizeChangeEvent) => {
    setTall(e.nativeEvent.contentSize.height > MAX_INPUT_HEIGHT + 1);
  }, []);

  const restoreText = useCallback((a: AttachmentPart) => {
    const { text: cur, attachments: atts } = composerDraft.get();
    const back = a.text ?? '';
    composerDraft.put({ text: cur ? `${cur}${cur.endsWith('\n') ? '' : '\n'}${back}` : back, attachments: atts.filter((x) => x.id !== a.id) });
    setPreview(null);
  }, []);

  const toAttachment = useCallback(() => {
    const { text: cur, attachments: atts } = composerDraft.get();
    if (remainingSlots(atts.length) === 0) {
      composerToast.show(limitNotice(), 'warn');
      return;
    }
    haptics.select();
    composerDraft.put({ text: '', attachments: [...atts, textAttachment(cur, pasteName())] });
  }, []);

  // ---- commands (§3) ------------------------------------------------------------------------
  const commandContext = useCallback(
    (): CommandContext => ({
      sessionId,
      navigate: (href) => router.push(href as Href),
      setDraft: (t) => composerDraft.put({ text: t, attachments: composerDraft.get().attachments }),
    }),
    [sessionId],
  );

  const runCommand = useCallback(
    (cmd: Command) => {
      haptics.tap();
      // The draft is only the command token; clear it before the command may set a new one.
      composerDraft.setText('');
      void executeCommandLine(`/${cmd.name}`, commandContext());
    },
    [commandContext],
  );

  const completeCommand = useCallback((next: string) => {
    haptics.tap();
    composerDraft.setText(next);
    input.current?.focus();
  }, []);

  // ---- send / stop / queue (§4.4) ------------------------------------------------------------
  const onSend = useCallback(async () => {
    if (!canSend) return;
    const { text: raw, attachments: atts } = composerDraft.get();
    const message = raw.trim();
    haptics.tap();
    if (message && parseCommand(message)) {
      // Clear first: a command may put a new draft back (applied after we return).
      composerDraft.setText('');
      if (await executeCommandLine(message, commandContext())) return;
    }
    composerDraft.clear();
    // Streaming → sendMessage queues it (§4.4); editing → it truncates and resends (§2).
    void sendMessage({ text: message, attachments: atts }, { sessionId });
  }, [canSend, commandContext, sessionId]);

  const onStop = useCallback(() => {
    haptics.tap();
    stopGeneration(sessionId);
  }, [sessionId]);

  const pullBack = useCallback((m: QueuedMessage) => {
    haptics.tap();
    sessions.dequeue(m.id);
    const { text: cur, attachments: atts } = composerDraft.get();
    const merged = [...m.attachments, ...atts];
    composerDraft.put({ text: cur.trim() ? `${m.text}\n${cur}` : m.text, attachments: merged.slice(0, MAX_ATTACHMENTS) });
    if (merged.length > MAX_ATTACHMENTS) composerToast.show(limitNotice(), 'warn');
  }, []);

  const removeQueued = useCallback((m: QueuedMessage) => {
    haptics.tap();
    sessions.dequeue(m.id);
  }, []);

  const onResume = useCallback(() => {
    haptics.tap();
    sessions.resumeQueue(sessionId);
  }, [sessionId]);

  // ---- model (§4.5) -------------------------------------------------------------------------
  const switchToSuggestion = useCallback(async () => {
    if (!suggestion) return;
    haptics.select();
    await applyModel(suggestion.providerId, suggestion.model);
    composerToast.show(t('chat.composer.switchedTo', { model: suggestion.label }));
  }, [suggestion, t]);

  // ---- command token styling (§3 Menu: chip + ghost argHint) --------------------------------
  const command = useMemo(() => (text.startsWith('/') && !text.includes('\n') ? parseCommand(text) : null), [text]);
  const token = command ? text.split(/\s/, 1)[0] : '';
  const ghost = command?.command.argHint && !command.input && text.endsWith(' ') ? command.command.argHint : '';

  const layout = reduced ? undefined : LinearTransition.springify().damping(springs.smooth.damping).stiffness(springs.smooth.stiffness);
  const pop = reduced ? FadeIn : ZoomIn.springify().damping(springs.snappy.damping).stiffness(springs.snappy.stiffness);
  const unpop = reduced ? FadeOut : ZoomOut.duration(120);

  const counterView = counter.show ? (
    <Text variant="caption" tone={counter.over ? 'down' : 'faint'} style={{ fontVariant: ['tabular-nums'] }} accessibilityLabel={t('chat.count.chars', { count: chars, n: chars })}>
      {t('chat.count.chars', { count: chars, n: formatCount(chars) })}
    </Text>
  ) : null;

  return (
    <View className="gap-2 px-3 py-2">
      <ComposerToast />
      <QueueChips queue={queue} paused={paused} onPull={pullBack} onRemove={removeQueued} onResume={onResume} />
      <CommandMenu draft={text} busy={busy} onRun={runCommand} onComplete={completeCommand} />
      <Animated.View
        layout={reduced ? undefined : growFromBottom}
        className={cx('overflow-hidden rounded-lg border-[0.5px] border-edge', glass ? 'bg-surface' : 'bg-surface-2')}
        style={CURVE}>
        {attachments.length || pending ? <AttachmentTray items={attachments} pending={pending} onOpen={setPreview} onRemove={removeAttachment} /> : null}

        <View className="pl-4 pr-2 pt-1.5">
          <TextInput
            ref={input}
            value={text}
            onChangeText={onChangeText}
            onContentSizeChange={onContentSize}
            placeholder={t('chat.composer.placeholder')}
            placeholderTextColor={c.textFaint}
            selectionColor={c.accent}
            cursorColor={c.accent}
            multiline
            scrollEnabled
            textAlignVertical="top"
            className={cx('px-0 py-2', tall ? 'pr-9' : 'pr-2')}
            style={[typography.body, { maxHeight: MAX_INPUT_HEIGHT, color: command ? 'transparent' : c.text }]}
            accessibilityLabel={t('chat.composer.inputA11y')}
          />
          {command ? (
            // Mirror of the input with the command token as a chip and the argument hint as
            // ghost text. Same font and padding, so it lines up with the (transparent) input.
            <View pointerEvents="none" importantForAccessibility="no-hide-descendants" className={cx('absolute left-4 top-1.5 py-2', tall ? 'right-11' : 'right-4')}>
              <Text numberOfLines={MAX_LINES}>
                <Text tone="accent" style={{ backgroundColor: c.accentMuted }}>
                  {token}
                </Text>
                {text.slice(token.length)}
                {ghost ? <Text tone="faint">{ghost}</Text> : null}
              </Text>
            </View>
          ) : null}
          {tall ? (
            <Animated.View entering={pop} exiting={unpop} className="absolute right-2 top-2">
              <IconButton icon="expand" label={t('chat.composer.fullEditor')} variant="ghost" size={32} onPress={() => setEditor(true)} />
            </Animated.View>
          ) : null}
        </View>

        {counter.over ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} className="mx-3 flex-row items-center gap-2 rounded-md bg-down-muted px-3 py-2" style={CURVE}>
            <Icon name="warning" size={14} color={c.down} />
            <Text variant="caption" tone="down" className="flex-1">
              {t('chat.composer.tooLong')}
            </Text>
            <PressableScale accessibilityRole="button" accessibilityLabel={t('chat.composer.toAttachment')} onPress={toAttachment} hitSlop={6}>
              <Text variant="caption" tone="down" style={typography.micro}>
                {t('chat.composer.toAttachment')}
              </Text>
            </PressableScale>
          </Animated.View>
        ) : null}

        <View className="flex-row items-center gap-1 px-2 pb-2 pt-1">
          <IconButton icon="plus" label={t('chat.composer.add')} variant="ghost" size={36} onPress={() => setSheet(true)} />
          <ModelPill label={modelLabel(providerId, model) || t('chat.composer.noModel')} />
          {empty ? null : <ContextRing sessionId={sessionId} />}
          <View className="flex-1" />
          {counterView}
          <Animated.View layout={layout} className="flex-row items-center gap-1.5">
            {busy ? (
              <Animated.View key="stop" entering={pop} exiting={unpop}>
                <IconButton icon="stop" label={t('chat.composer.stop')} variant={hasContent ? 'secondary' : 'primary'} size={36} onPress={onStop} />
              </Animated.View>
            ) : null}
            {!busy || hasContent ? (
              <Animated.View key={busy ? 'queue' : 'send'} entering={pop} exiting={unpop}>
                <IconButton
                  icon={busy ? 'queue' : 'send'}
                  label={t(busy ? 'chat.composer.queue' : 'chat.composer.send')}
                  variant="primary"
                  size={36}
                  disabled={!canSend}
                  onPress={() => void onSend()}
                />
              </Animated.View>
            ) : null}
          </Animated.View>
        </View>
      </Animated.View>

      <AttachSheet
        open={sheet}
        onClose={() => setSheet(false)}
        onPick={onAttach}
        count={attachments.length}
        images={images}
        suggestion={suggestion?.label ?? null}
        onSwitchModel={() => void switchToSuggestion()}
      />
      <ImagePreview image={preview?.kind === 'image' ? preview : null} onClose={() => setPreview(null)} onRemove={removeAttachment} />
      <TextPreview
        item={preview && preview.kind !== 'image' ? preview : null}
        onClose={() => setPreview(null)}
        onRemove={removeAttachment}
        onRestore={restoreText}
      />
      <FullEditor visible={editor} onClose={() => setEditor(false)} onShow={focusEditor} counter={counterView}>
        <TextInput
          ref={editorInput}
          value={text}
          onChangeText={composerDraft.setText}
          multiline
          textAlignVertical="top"
          placeholder={t('chat.composer.placeholder')}
          placeholderTextColor={c.textFaint}
          selectionColor={c.accent}
          cursorColor={c.accent}
          className="flex-1 px-0 py-2 text-fg"
          style={typography.body}
          accessibilityLabel={t('chat.composer.fullEditorA11y')}
        />
      </FullEditor>
    </View>
  );
}

/**
 * The composer box's layout transition. The composer is anchored to the bottom, so the box only
 * really moves when its own height changes: keep its bottom edge fixed and spring the top. A
 * LinearTransition would also animate position changes caused by siblings above it (the command
 * menu filtering down, queue chips), sliding the box over them for a few frames.
 */
const growFromBottom: LayoutAnimationFunction = (v) => {
  'worklet';
  const config = { damping: springs.smooth.damping, stiffness: springs.smooth.stiffness };
  // Same height: only a sibling changed. Land in place, nothing to animate.
  if (Math.abs(v.targetHeight - v.currentHeight) < 0.5) {
    return { initialValues: { originX: v.targetOriginX, originY: v.targetOriginY, width: v.targetWidth, height: v.targetHeight }, animations: {} };
  }
  return {
    initialValues: { originX: v.targetOriginX, width: v.targetWidth, originY: v.targetOriginY + v.targetHeight - v.currentHeight, height: v.currentHeight },
    animations: { originY: withSpring(v.targetOriginY, config), height: withSpring(v.targetHeight, config) },
  };
};

/** Short model name for the session (§4.5); tap → the model picker sheet. */
function ModelPill({ label }: { label: string }) {
  const c = useTheme();
  const t = useT();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('chat.composer.model', { model: label })}
      onPress={() => router.push('/model-picker' as Href)}
      className="h-8 flex-row items-center gap-1 rounded-md px-2"
      style={CURVE}>
      <Text variant="callout" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Icon name="chevronDown" size={14} color={c.textFaint} />
    </PressableScale>
  );
}
