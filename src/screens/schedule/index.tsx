import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';

/** Schedule tab: timetable, to-dos, reminders (docs/ARCHITECTURE.md §8). Placeholder until M7. */
export function Schedule() {
  return (
    <Screen title="日程" subtitle="Schedule">
      <EmptyState icon="schedule" title="课表还没同步" message="登录校园账号后，课程、提醒和待办会出现在这里。" />
    </Screen>
  );
}
