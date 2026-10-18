import { TabSlotHost } from '@/screens/plugins/tab-slot';

/** Dashboard slot: content comes from the plugin that contributes it (dashboard plugin). */
export default function DashboardRoute() {
  return <TabSlotHost slot="dashboard" />;
}
