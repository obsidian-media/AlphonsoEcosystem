import React from 'react';
import { Component } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export class ViewErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Alphonso] View crashed:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      const { label = 'View', onReset } = this.props;
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-400" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-semibold text-zinc-200">{label} crashed</div>
            <div className="text-xs text-zinc-500 max-w-xs leading-relaxed font-mono">
              {String(this.state.error?.message || this.state.error)}
            </div>
          </div>
          <button
            onClick={() => {
              this.setState({ error: null });
              onReset?.();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-white/10 rounded-xl text-xs font-bold text-zinc-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reload view
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
