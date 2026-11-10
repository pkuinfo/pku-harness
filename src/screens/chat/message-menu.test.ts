import { afterEach, describe, expect, test } from 'bun:test';

import { messageMenu } from './message-menu';

afterEach(() => messageMenu.close());

describe('messageMenu', () => {
  test('one row open at a time', () => {
    messageMenu.open('a');
    messageMenu.open('b');
    expect(messageMenu.get()).toBe('b');
  });

  test('a touch elsewhere closes it', () => {
    messageMenu.open('a');
    messageMenu.dismiss();
    expect(messageMenu.get()).toBeNull();
  });

  test('a touch inside the row keeps it open, once', () => {
    messageMenu.open('a');
    messageMenu.keep();
    messageMenu.dismiss();
    expect(messageMenu.get()).toBe('a');
    messageMenu.dismiss();
    expect(messageMenu.get()).toBeNull();
  });

  test('notifies only on change', () => {
    let calls = 0;
    const off = messageMenu.subscribe(() => calls++);
    messageMenu.open('a');
    messageMenu.open('a');
    messageMenu.close();
    messageMenu.close();
    off();
    expect(calls).toBe(2);
  });
});
