import { describe, expect, test } from 'bun:test';

import {
  classifyFile,
  extensionOf,
  fitWithin,
  libraryPickLimit,
  MAX_AUDIO_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_TEXT_FILE_BYTES,
  remainingSlots,
} from './attachment-rules';

describe('limits', () => {
  test('8 per message; one library pick can fill every free slot', () => {
    expect(remainingSlots(0)).toBe(8);
    expect(remainingSlots(7)).toBe(1);
    expect(remainingSlots(9)).toBe(0);
    expect(libraryPickLimit(0)).toBe(8);
    expect(libraryPickLimit(6)).toBe(2);
    expect(libraryPickLimit(8)).toBe(0);
  });
});

describe('fitWithin', () => {
  test('already small enough → null', () => {
    expect(fitWithin(1568, 1000)).toBeNull();
    expect(fitWithin(800, 600)).toBeNull();
  });
  test('landscape and portrait keep the aspect ratio', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1568, height: 1176 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1176, height: 1568 });
    expect(fitWithin(3000, 3000)).toEqual({ width: 1568, height: 1568 });
  });
  test('extreme panoramas never collapse to 0', () => {
    expect(fitWithin(100000, 10)).toEqual({ width: 1568, height: 1 });
  });
  test('unknown size → null', () => {
    expect(fitWithin(0, 0)).toBeNull();
  });
});

describe('classifyFile', () => {
  test('text-like files', () => {
    expect(extensionOf('Notes.MD')).toBe('md');
    expect(extensionOf('.env')).toBe('');
    expect(classifyFile('a.txt', 10)).toEqual({ kind: 'text', mime: 'text/plain' });
    expect(classifyFile('data.csv', 10, 'text/comma-separated-values')).toEqual({ kind: 'text', mime: 'text/comma-separated-values' });
    expect(classifyFile('x.json', 10, 'application/octet-stream')).toEqual({ kind: 'text', mime: 'application/json' });
  });
  test('size limit 200 KB', () => {
    expect(classifyFile('a.log', MAX_TEXT_FILE_BYTES).kind).toBe('text');
    expect(classifyFile('a.log', MAX_TEXT_FILE_BYTES + 1).kind).toBe('too-large');
  });
  test('documents and audio are read into text', () => {
    expect(classifyFile('Report.PDF', 10)).toEqual({ kind: 'document', ext: 'pdf' });
    expect(classifyFile('课表.xlsx', 10)).toEqual({ kind: 'document', ext: 'xlsx' });
    expect(classifyFile('lecture.m4a', 10)).toEqual({ kind: 'document', ext: 'm4a' });
    expect(classifyFile('a.docx', MAX_DOCUMENT_BYTES + 1)).toEqual({ kind: 'too-large', limit: 'document' });
    expect(classifyFile('a.mp3', MAX_DOCUMENT_BYTES + 1).kind).toBe('document');
    expect(classifyFile('a.mp3', MAX_AUDIO_BYTES + 1)).toEqual({ kind: 'too-large', limit: 'audio' });
  });
  test('everything else is unsupported', () => {
    expect(classifyFile('slides.key', 10).kind).toBe('unsupported');
    expect(classifyFile('old.doc', 10).kind).toBe('unsupported');
    expect(classifyFile('noext', 10).kind).toBe('unsupported');
  });
});
