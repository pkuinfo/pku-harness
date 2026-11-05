import { createJob, deleteJob, updateJob } from '@/core/scheduler/engine';
import { jobStore } from '@/core/scheduler/store';
import { nextTodoInstance, type JobSource, type TodoPriority, type TodoRepeat, type Trigger } from '@pku-harness/sdk';

import { t } from '@/i18n';

import { todoStore, type Todo } from './store';

export * from './store';

/**
 * To-dos (docs/ARCHITECTURE.md §8): a reminder is an ordinary scheduler job linked by
 * `job.meta.todoId`, so it shows up in the reminders list and fires as an exact notification.
 */

export type TodoInput = {
  title: string;
  notes?: string | null;
  dueAt?: number | null;
  /** When to remind; null = no reminder. A trigger allows repeating reminders. */
  remind?: Trigger | null;
  priority?: TodoPriority;
  /** Repeating to-do (needs a due time); null stops repeating. */
  repeat?: TodoRepeat | null;
  source: JobSource;
};

async function attachReminder(todo: Todo, remind: Trigger | null | undefined, source: JobSource): Promise<string | null> {
  if (todo.jobId && jobStore.get(todo.jobId)) {
    if (!remind) {
      await deleteJob(todo.jobId);
      return null;
    }
    await updateJob(todo.jobId, { title: todo.title, trigger: remind, action: { type: 'notify', title: todo.title, body: todo.notes ?? t('app.schedule.todoBody'), url: '/schedule' } });
    return todo.jobId;
  }
  if (!remind) return null;
  const job = await createJob({
    title: todo.title,
    trigger: remind,
    action: { type: 'notify', title: todo.title, body: todo.notes ?? t('app.schedule.todoBody'), url: '/schedule' },
    source,
    meta: { todoId: todo.id },
  });
  return job.id;
}

export async function addTodo(input: TodoInput): Promise<Todo> {
  const base: Todo = {
    id: todoStore.newId(),
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    dueAt: input.dueAt ?? null,
    doneAt: null,
    jobId: null,
    createdAt: Date.now(),
    priority: input.priority ?? 'none',
    repeat: input.dueAt != null ? (input.repeat ?? null) : null,
    nextId: null,
  };
  const todo = { ...base, jobId: await attachReminder(base, input.remind, input.source) };
  await todoStore.put(todo);
  return todo;
}

export async function updateTodo(id: string, patch: Partial<Omit<TodoInput, 'source'>>, source: JobSource): Promise<Todo> {
  const cur = todoStore.get(id);
  if (!cur) throw new Error(t('app.schedule.noTodo', { id }));
  const next: Todo = {
    ...cur,
    title: patch.title?.trim() || cur.title,
    notes: patch.notes === undefined ? cur.notes : patch.notes?.trim() || null,
    dueAt: patch.dueAt === undefined ? cur.dueAt : patch.dueAt,
    priority: patch.priority ?? cur.priority ?? 'none',
    repeat: patch.repeat === undefined ? (cur.repeat ?? null) : patch.repeat,
  };
  // A repeat series runs on due times: without one, the to-do stops repeating.
  if (next.dueAt == null) next.repeat = null;
  const keepJob = patch.remind === undefined;
  const jobId = keepJob ? cur.jobId : await attachReminder(next, patch.remind, source);
  // Title changes should also rename an existing reminder.
  if (keepJob && cur.jobId && jobStore.get(cur.jobId) && next.title !== cur.title) {
    await updateJob(cur.jobId, { title: next.title, action: { type: 'notify', title: next.title, body: next.notes ?? t('app.schedule.todoBody'), url: '/schedule' } });
  }
  const todo = { ...next, jobId };
  await todoStore.put(todo);
  return todo;
}

/**
 * Mark done/undone. Done pauses the reminder; undone resumes it. Completing a repeating to-do
 * creates its next instance (same title, notes, priority, repeat and reminder lead, see
 * `nextTodoInstance`); undoing it removes that instance again while it is still open.
 */
export async function setTodoDone(id: string, done: boolean): Promise<Todo> {
  const cur = todoStore.get(id);
  if (!cur) throw new Error(t('app.schedule.noTodo', { id }));
  if (!!cur.doneAt === done) return cur;
  let nextId = cur.nextId ?? null;
  if (done && cur.repeat && !(nextId && todoStore.get(nextId))) {
    const job = cur.jobId ? jobStore.get(cur.jobId) : undefined;
    const n = nextTodoInstance(cur, job?.trigger, Date.now());
    if (n) {
      const next = await addTodo({ title: cur.title, notes: cur.notes, dueAt: n.dueAt, remind: n.remind, priority: cur.priority, repeat: cur.repeat, source: job?.source ?? 'user' });
      nextId = next.id;
    }
  }
  if (!done && nextId) {
    const next = todoStore.get(nextId);
    if (next && !next.doneAt) await deleteTodo(nextId);
    nextId = null;
  }
  const todo = { ...cur, doneAt: done ? Date.now() : null, nextId };
  await todoStore.put(todo);
  if (cur.jobId && jobStore.get(cur.jobId)) await updateJob(cur.jobId, { enabled: !done });
  return todo;
}

export async function deleteTodo(id: string) {
  const cur = todoStore.get(id);
  if (!cur) return;
  if (cur.jobId && jobStore.get(cur.jobId)) await deleteJob(cur.jobId);
  await todoStore.remove(id);
}
