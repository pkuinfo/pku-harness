import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';

import { createJob, deleteJob, updateJob } from '@/core/scheduler/engine';
import { jobStore } from '@/core/scheduler/store';
import { kv } from '@/core/store/kv';
import { t } from '@/i18n';

import { courseReminderTrigger, type Course, type Semester } from './model';

/**
 * Courses + class-reminder setting, persisted in KV. Class reminders are ordinary scheduler
 * jobs (one weekly series per course, `meta.courseId`), re-derived whenever courses, the
 * reminder lead time or the semester change.
 */

type State = { courses: Course[]; reminderMinutes: number | null; semester: Semester | null };

const store = kv('timetable');
// The semester lives with the calendar plugin (plugin KV namespace), shared by both.
const calendarKv = kv('plugin:calendar');
let state: State = { courses: [], reminderMinutes: null, semester: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function save() {
  await store.set('courses', state.courses);
  await store.set('reminderMinutes', state.reminderMinutes);
}

export const timetable = {
  async load() {
    state = {
      courses: (await store.get<Course[]>('courses')) ?? [],
      reminderMinutes: (await store.get<number | null>('reminderMinutes')) ?? null,
      semester: (await calendarKv.get<Semester>('semester')) ?? null,
    };
    emit();
  },
  get: () => state,
  newId: () => Crypto.randomUUID().slice(0, 8),
  async upsert(course: Course) {
    const exists = state.courses.some((c) => c.id === course.id);
    state = { ...state, courses: exists ? state.courses.map((c) => (c.id === course.id ? course : c)) : [...state.courses, course] };
    emit();
    await save();
    await syncClassReminders();
  },
  async remove(id: string) {
    state = { ...state, courses: state.courses.filter((c) => c.id !== id) };
    emit();
    await save();
    await syncClassReminders();
  },
  async setReminderMinutes(minutes: number | null) {
    state = { ...state, reminderMinutes: minutes };
    emit();
    await save();
    await syncClassReminders();
  },
  /** Called by the calendar plugin after the semester changes. */
  async reloadSemester() {
    state = { ...state, semester: (await calendarKv.get<Semester>('semester')) ?? null };
    emit();
    await syncClassReminders();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useTimetable(): State {
  return useSyncExternalStore(timetable.subscribe, timetable.get);
}

/** Without a semester the series starts "now", so startAt alone must not cause a re-arm. */
function sameTrigger(a: unknown, b: unknown, ignoreStart: boolean) {
  const norm = (t: unknown) => JSON.stringify(ignoreStart ? { ...(t as object), startAt: 0 } : t);
  return norm(a) === norm(b);
}

/** Make class-reminder jobs match courses × lead time. */
export async function syncClassReminders() {
  const { courses, reminderMinutes, semester } = state;
  const existing = jobStore.list().filter((j) => typeof j.meta?.courseId === 'string');
  const wanted = reminderMinutes == null ? [] : courses;
  for (const job of existing) {
    if (!wanted.some((c) => c.id === job.meta!.courseId)) await deleteJob(job.id);
  }
  for (const c of wanted) {
    const trigger = courseReminderTrigger(c, reminderMinutes!, semester);
    const action = {
      type: 'notify' as const,
      title: t('app.schedule.classTitle', { name: c.name, start: c.start }),
      body: [c.location, c.teacher].filter(Boolean).join(' · ') || undefined,
      url: '/schedule',
    };
    const job = existing.find((j) => j.meta!.courseId === c.id);
    const title = t('app.schedule.classJob', { name: c.name });
    if (!job) await createJob({ title, trigger, action, source: 'plugin', meta: { courseId: c.id } });
    else if (!sameTrigger(job.trigger, trigger, !semester) || JSON.stringify(job.action) !== JSON.stringify(action)) {
      await updateJob(job.id, { title, trigger, action });
    }
  }
}
