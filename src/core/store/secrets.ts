import * as SecureStore from 'expo-secure-store';

/**
 * Secrets live only in the OS keystore (Android Keystore / iOS Keychain), never in SQLite,
 * logs, or network requests to servers we run. See AGENTS.md principle 6.
 */
export type SecretKey = 'campus.username' | 'campus.password' | 'campus.otpSecret' | 'ai.apiKey' | `ai.${string}.apiKey` | `remote.${string}.token` | `campus.${string}` | `cloud.${string}`;

// iOS: readable after the first unlock since boot, still device-only (never in backups or on
// another phone). Background checks usually run while the phone is locked; WHEN_UNLOCKED would
// make every one of them fail to read the campus session or the AI key. Android ignores this.
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const storeKey = (k: SecretKey) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export const secrets = {
  get(key: SecretKey) {
    return SecureStore.getItemAsync(storeKey(key), options);
  },
  set(key: SecretKey, value: string) {
    return SecureStore.setItemAsync(storeKey(key), value, options);
  },
  delete(key: SecretKey) {
    return SecureStore.deleteItemAsync(storeKey(key), options);
  },
};
