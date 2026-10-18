// Custom entry: background tasks must be defined at module scope before any UI, because a
// headless launch (WorkManager) evaluates only the entry, never the route tree.
import '@/polyfills';
import '@/core/scheduler/background';
import 'expo-router/entry';
