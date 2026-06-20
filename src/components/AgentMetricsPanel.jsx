import React from 'react';
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle, Clock, FileText, Zap } from 'lucide-react';
import { getAgentMetrics } from '../services/agentMetricsService';

export function AgentMetricsPanel({ filters = {} }) {
  const metrics = getAgentMetrics(filters);

  if (metrics.totalExecutions === 0) {
    return (
      <div className="p-6 text-center text-zinc-500">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No execution data yet. Run some commands to see metrics.</p>
      </div>
    );
  }

  const statCards = [
    { icon: Zap, label: 'Success Rate', value: `${metrics.successRate}%`, color: metrics.successRate >= 70 ? 'text-emerald-400' : metrics.successRate >= 50 ? 'text-amber-400' : 'text-red-400' },
    { icon: CheckCircle, label: 'Validation Pass', value: `${metrics.validationPassRate}%`, color: 'text-emerald-400' },
    { icon: FileText, label: 'Avg Files', value: metrics.avgFilesPerExecution, color: 'text-indigo-400' },
    { icon: Clock, label: 'Avg Duration', value: `${Math.round(metrics.avgDurationMs / 1000)}s`, color: 'text-zinc-400' },
    { icon: TrendingUp, label: 'Avg Confidence', value: `${metrics.avgConfidence}%`, color: metrics.avgConfidence >= 70 ? 'text-emerald-400' : 'text-amber-400' },
    { icon: AlertTriangle, label: 'Avg Iterations', value: metrics.avgIterations, color: metrics.avgIterations <= 1.5 ? 'text-emerald-400' : 'text-amber-400' }
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((stat) => (
          <div key={stat.label} className="p-3 bg-zinc-900/50 rounded-xl border border-white/5">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
              <stat.icon className="w-3 h-3" />
              {stat.label}
            </div>
            <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {metrics.topCommands.length > 0 && (
        <div className="p-4 bg-zinc-900/50 rounded-xl border border-white/5">
          <div className="text-xs font-semibold text-zinc-400 mb-2">Top Commands</div>
          <div className="space-y-1">
            {metrics.topCommands.slice(0, 5).map((cmd, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-300 font-mono truncate max-w-[70%]">{cmd.command}</span>
                <span className="text-zinc-500">{cmd.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics.errorPatterns.length > 0 && (
        <div className="p-4 bg-zinc-900/50 rounded-xl border border-white/5">
          <div className="text-xs font-semibold text-zinc-400 mb-2">Common Errors</div>
          <div className="space-y-1">
            {metrics.errorPatterns.map((err, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-red-300 font-mono truncate max-w-[70%]">{err.error}</span>
                <span className="text-zinc-500">{err.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics.trend.length > 0 && (
        <div className="p-4 bg-zinc-900/50 rounded-xl border border-white/5">
          <div className="text-xs font-semibold text-zinc-400 mb-2">7-Day Trend</div>
          <div className="flex items-end gap-1 h-16">
            {metrics.trend.map((day, i) => {
              const maxExec = Math.max(...metrics.trend.map((d) => d.executions), 1);
              const height = Math.max(4, (day.executions / maxExec) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end h-12">
                    <div
                      className="w-full bg-indigo-500/30 rounded-t-sm transition-all"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-zinc-600">{day.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(metrics.byAgent).length > 0 && (
        <div className="p-4 bg-zinc-900/50 rounded-xl border border-white/5">
          <div className="text-xs font-semibold text-zinc-400 mb-2">By Agent</div>
          <div className="space-y-2">
            {Object.entries(metrics.byAgent).map(([agent, data]) => (
              <div key={agent} className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-300 capitalize">{agent}</span>
                <div className="flex items-center gap-3">
                  <span className="text-zinc-500">{data.total} executions</span>
                  <span className={data.successRate >= 70 ? 'text-emerald-400' : 'text-amber-400'}>{data.successRate}% success</span>
                  <span className="text-zinc-500">{data.avgConfidence}% confidence</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
