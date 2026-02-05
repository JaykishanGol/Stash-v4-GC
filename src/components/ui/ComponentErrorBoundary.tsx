import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { captureException } from '../../lib/errorHandler';

interface Props {
  children: ReactNode;
  /** Display name for the errored section (e.g. "Notes", "Sidebar") */
  name?: string;
  /** Optional compact mode — renders inline instead of card */
  compact?: boolean;
  /** Optional custom fallback */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Lightweight error boundary for wrapping individual components/views.
 * Unlike AppErrorBoundary (which catches app-level crashes), this allows
 * the rest of the app to keep working when one section fails.
 *
 * Usage:
 *   <ComponentErrorBoundary name="Sidebar">
 *     <Sidebar />
 *   </ComponentErrorBoundary>
 */
export class ComponentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureException(error, {
      component: this.props.name ?? 'Unknown',
      componentStack: errorInfo.componentStack,
      source: 'ComponentErrorBoundary',
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const { name = 'This section', compact } = this.props;

    if (compact) {
      return (
        <div className="component-error-compact">
          <AlertTriangle size={14} />
          <span>{name} failed to load</span>
          <button onClick={this.handleRetry} className="component-error-retry-sm">
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="component-error-card">
        <AlertTriangle size={24} color="#DC2626" />
        <p className="component-error-title">{name} couldn't load</p>
        <p className="component-error-detail">{this.state.error?.message}</p>
        <button onClick={this.handleRetry} className="component-error-retry">
          <RefreshCw size={14} />
          Try Again
        </button>
      </div>
    );
  }
}
