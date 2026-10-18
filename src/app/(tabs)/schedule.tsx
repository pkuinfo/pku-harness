import { TabSlotHost } from '@/screens/plugins/tab-slot';

/** Schedule slot: content comes from the plugin that contributes it (schedule plugin). */
export default function ScheduleRoute() {
  return <TabSlotHost slot="schedule" />;
}
