import { DevTools } from '@/screens/dev';

/** Development only: run a tool from a deep link, e.g. `adb shell am start -d 'pkuharness://dev?tool=…&input=…'`. */
export default function DevRoute() {
  return <DevTools />;
}
