import { Component, type ReactNode } from 'react';

/** Contains a render error to its subtree (a plugin widget must never take the screen down). */
export class ErrorBoundary extends Component<{ fallback: (error: Error) => ReactNode; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}
