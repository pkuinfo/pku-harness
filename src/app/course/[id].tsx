import { useLocalSearchParams } from 'expo-router';

import { CourseForm } from '@/screens/forms/course-form';

export default function CourseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CourseForm id={id} />;
}
