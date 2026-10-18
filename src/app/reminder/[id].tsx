import { useLocalSearchParams } from 'expo-router';

import { ReminderForm } from '@/screens/forms/reminder-form';

export default function ReminderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ReminderForm id={id} />;
}
