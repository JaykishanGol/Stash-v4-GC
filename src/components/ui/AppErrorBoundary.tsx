import type React from 'react';
import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Caught error:', error);
    console.error('[AppErrorBoundary] Component stack:', errorInfo.componentStack);

    this.setState({ errorInfo });

    // Future: Send to error reporting service
    // errorReportingService.captureException(error, { extra: errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary-fallback">
          <div className="error-content">
            <AlertTriangle size={48} color="#DC2626" />
            <h2>Something went wrong</h2>
            <p>We're sorry, but something unexpected happened. Please try refreshing the page.</p>

            {this.state.error && (
              <details className="error-details">
                <summary>Technical Details</summary>
                <pre>{this.state.error.message}</pre>
                {this.state.errorInfo && (
                  <pre className="stack-trace">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            <div className="error-actions">
              <button onClick={this.handleReset} className="btn-secondary">
                Try Again
              </button>
              <button onClick={this.handleReload} className="btn-primary">
                <RefreshCw size={16} />
                Reload Page
              </button>
            </div>
          </div>

          <style>{`
            .error-boundary-fallback {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              padding: 24px;
              background: #F9FAFB;
            }

            .error-content {
              max-width: 480px;
              text-align: center;
              background: white;
              padding: 48px;
              border-radius: 16px;
              box-shadow: 0 4px 24px rgba(0,0,0,0.1);
            }

            .error-content h2 {
              margin: 16px 0 8px;
              font-size: 24px;
              font-weight: 600;
              color: #111827;
            }

            .error-content p {
              color: #6B7280;
              margin-bottom: 24px;
            }

            .error-details {
              text-align: left;
              background: #F3F4F6;
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 24px;
            }

            .error-details summary {
              cursor: pointer;
              font-weight: 500;
              color: #374151;
            }

            .error-details pre {
              font-size: 12px;
              color: #DC2626;
              white-space: pre-wrap;
              word-break: break-word;
              margin-top: 8px;
            }

            .stack-trace {
              font-size: 10px;
              color: #6B7280;
              max-height: 200px;
              overflow: auto;
            }

            .error-actions {
              display: flex;
              gap: 12px;
              justify-content: center;
            }

            .error-actions button {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 12px 24px;
              border-radius: 8px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
            }

            .btn-secondary {
              background: white;
              border: 1px solid #D1D5DB;
              color: #374151;
            }
            .btn-secondary:hover {
              background: #F9FAFB;
            }

            .btn-primary {
              background: #2563EB;
              border: none;
              color: white;
            }
            .btn-primary:hover {
              background: #1D4ED8;
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}
