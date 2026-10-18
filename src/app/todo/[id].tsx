import { useLocalSearchParams } from 'expo-router';

import { TodoForm } from '@/screens/forms/todo-form';

export default function TodoRoute() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  return <TodoForm id={id} initialTitle={title} />;
}
