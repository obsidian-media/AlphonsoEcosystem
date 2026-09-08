import React from 'react';
import { Component } from 'react';
import { AlertCircle, RefreshCw, Copy, ChevronDown } from 'lucide-react';
import { logError } from '../services/crashLogService.js';

interface Props {
  label?: string;
  onReset?: () => void;
  children?: React.ReactNode;
}

interface State {
  error: Error | null;
  showDetails: boolean;
}

export class ViewErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[Alphonso] ${this.props.label || 'View'} crashed:`, error, info?.componentStack);
    logError(error.message, { componentStack: info?.componentStack, source: 'ErrorBoundary' });
  }

  handleReset = () => {
    this.setState({ error: null, showDetails: false });
    this.props.onReset?.();
  };

  handleCopyError = () => {
    const { error } = this.state;
    const text = `Error: ${error?.message || 'Unknown'}\n${error?.stack || ''}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    if (this.state.error) {
      const { label = 'View' } = this.props;
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[var(--error-dim)] border border-[var(--error-border)] flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-[var(--error)]" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-semibold text-[var(--text-2)]">{label} crashed</div>
            <div className="text-xs text-[var(--text-3)] max-w-xs leading-relaxed font-mono">
              {String(this.state.error?.message || this.state.error)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-3)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text-2)] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload view
            </button>
            <button
              onClick={this.handleCopyError}
              className="flex items-center gap-1.5 px-3 py-2 bg-[var(--surface-3)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-3)] transition-colors"
              aria-label="Copy error details"
              title="Copy error details"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <button
            onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
            className="flex items-center gap-1 text-[10px] text-[var(--text-4)] hover:text-[var(--text-3)] transition-colors"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${this.state.showDetails ? 'rotate-180' : ''}`} />
            {this.state.showDetails ? 'Hide' : 'Show'} stack trace
          </button>
          {this.state.showDetails && this.state.error && (
            <pre className="mt-2 p-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-lg text-[10px] text-[var(--text-3)] font-mono overflow-auto max-h-40 w-full max-w-lg whitespace-pre-wrap">
              {this.state.error.stack || this.state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
