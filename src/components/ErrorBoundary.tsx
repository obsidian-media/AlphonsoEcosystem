import React from 'react';
import { AlertTriangle, RefreshCw, Copy } from 'lucide-react';
import { logError } from '../services/crashLogService.js';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface ErrorBoundaryProps {
  label?: string;
  fallback?: (error: Error | null, reset: () => void) => React.ReactNode;
  showDetails?: boolean;
  onReset?: () => void;
  children?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    console.error(`[ErrorBoundary: ${this.props.label || 'unknown'}]`, error, errorInfo);
    logError(error.message, { componentStack: errorInfo?.componentStack, source: 'ErrorBoundary' });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const text = `Error: ${error?.message || 'Unknown'}\nStack: ${error?.stack || 'N/A'}\nComponent: ${errorInfo?.componentStack || 'N/A'}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      const { label = 'Component', fallback, showDetails = true } = this.props;

      if (fallback) {
        return fallback(this.state.error, this.handleReset);
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 bg-zinc-950 border border-red-500/20 rounded-2xl">
          <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
          <div className="text-sm font-semibold text-red-300 mb-1">{label} crashed</div>
          <div className="text-xs text-zinc-500 mb-4 text-center max-w-sm">
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-lg text-xs text-zinc-300 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Try again
            </button>
            {showDetails && (
              <button
                onClick={this.handleCopyError}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-lg text-xs text-zinc-500 transition-colors"
                title="Copy error details"
              >
                <Copy className="w-3 h-3" />
                Copy error
              </button>
            )}
          </div>
          {showDetails && this.state.error && (
            <details className="mt-4 w-full max-w-lg">
              <summary className="text-[10px] text-zinc-600 cursor-pointer hover:text-zinc-400">Error details</summary>
              <pre className="mt-2 p-3 bg-zinc-900 border border-white/5 rounded-lg text-[10px] text-zinc-400 font-mono overflow-auto max-h-40 whitespace-pre-wrap">
                {this.state.error.stack || this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(Component: React.ComponentType<P>, label: string) {
  return function Wrapped(props: P) {
    return (
      <ErrorBoundary label={label || (Component as React.ComponentType).displayName || (Component as React.ComponentType).name}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
