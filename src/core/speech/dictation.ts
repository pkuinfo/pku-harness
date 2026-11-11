import { File, Paths } from 'expo-file-system';

import { decodeBase64, PauseSplitter, wavFile } from './audio';
import { activeSpeech } from './config';

/** One dictation: audio goes in as it is captured; text comes out while the user talks. */
export type Dictation = {
  /** 100 ms of 16 kHz mono 16-bit PCM (base64) and its level 0…1. */
  push: (pcm: string, level: number) => void;
  /** No more audio: resolves with the whole transcript. */
  finish: () => Promise<string>;
  cancel: () => void;
};

let pieceSeq = 0;

/**
 * Start dictating with the active speech service. A realtime service (`stream`) gets the audio as
 * it arrives and reports text as it hears it. A file service (`transcribe`) gets the audio in
 * pieces cut at pauses, each transcribed while the user keeps talking, so only the last piece is
 * left when they stop. `onText` receives the whole transcript so far each time it changes.
 */
export async function startDictation(onText: (text: string) => void): Promise<Dictation> {
  const { provider, config } = await activeSpeech();
  const def = provider.def;

  if (def.stream) {
    const stream = await def.stream(config, { onText: (text) => text && onText(text) });
    return { push: (pcm) => stream.send(pcm), finish: () => stream.finish(), cancel: () => stream.cancel() };
  }

  const transcribe = def.transcribe;
  if (!transcribe) throw new Error(`${def.name} cannot transcribe`);
  const abort = new AbortController();
  const splitter = new PauseSplitter();
  const texts: string[] = [];
  const pending: Promise<void>[] = [];
  let failure: Error | null = null;

  const send = (pcm: Uint8Array) => {
    const index = texts.length;
    texts.push('');
    const file = new File(Paths.cache, `dictation-${Date.now()}-${pieceSeq++}.wav`);
    file.create({ overwrite: true });
    file.write(wavFile(pcm));
    pending.push(
      transcribe(config, { file: file as unknown as Blob, uri: file.uri, name: 'voice.wav', mimeType: 'audio/wav', durationMs: pcm.length / 32 }, abort.signal)
        .then((text) => {
          texts[index] = text;
          onText(texts.join(''));
        })
        .catch((e: unknown) => {
          if (!abort.signal.aborted) failure ??= e instanceof Error ? e : new Error(String(e));
        })
        .finally(() => {
          try {
            file.delete();
          } catch {
            // already gone
          }
        }),
    );
  };

  return {
    push: (pcm, level) => {
      const piece = splitter.push(decodeBase64(pcm), level);
      if (piece) send(piece);
    },
    finish: async () => {
      const rest = splitter.flush();
      if (rest) send(rest);
      await Promise.all(pending);
      const text = texts.join('');
      // A piece that failed while others worked still leaves the user something to edit.
      if (failure && !text) throw failure;
      return text;
    },
    cancel: () => abort.abort(),
  };
}
