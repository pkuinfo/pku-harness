import { secrets } from '@/core/store/secrets';
import { t } from '@/i18n';

/** The stored IAAA credentials (harness only; never leaves the device or reaches plugins). */
export async function credentials() {
  const [username, password] = await Promise.all([secrets.get('campus.username'), secrets.get('campus.password')]);
  if (!username || !password) throw new Error(t('app.campus.errors.notSignedIn'));
  return { username, password };
}
