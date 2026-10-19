import { secrets } from '@/core/store/secrets';

/** The stored IAAA credentials (harness only; never leaves the device or reaches plugins). */
export async function credentials() {
  const [username, password] = await Promise.all([secrets.get('campus.username'), secrets.get('campus.password')]);
  if (!username || !password) throw new Error('还没有登录校园账号（设置 → 校园账号）');
  return { username, password };
}
