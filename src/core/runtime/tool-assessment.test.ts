import { expect, test } from 'bun:test';
import { parseToolAssessment } from './tool-assessment';

test('observed target and effective permission remain together', () => {
  const assessment = { effect: 'public', target: { label: 'Send', context: 'org.example.chat' } } as const;
  expect(parseToolAssessment(assessment, 'write')).toEqual({ effect: 'public', assessment });
  expect(parseToolAssessment(undefined, 'write')).toEqual({ effect: 'write' });
  expect(parseToolAssessment('money', 'write')).toEqual({ effect: 'money' });
});

test('malformed classification cannot bypass permission lookup', () => {
  for (const invalid of ['auto', null, { effect: 'auto' }, { effect: 'public', target: { label: '' } }, { effect: 'write', authorized: true }]) {
    expect(() => parseToolAssessment(invalid, 'write')).toThrow();
  }
});
