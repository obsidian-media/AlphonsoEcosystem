import React from 'react';
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle, Clock, FileText, Zap } from 'lucide-react';
import { getAgentMetrics } from '../services/agentMetricsService';

interface AgentMetricsFilters {
  agent?: string;
  since?: number;
  until?: number;
}

interface Props {
  filters?: AgentMetricsFilters;
}

interface TopCommand {
  command: string;
  count: number;
}

interface ErrorPattern {
  error: string;
  count: number;
}

interface TrendDay {
  date: string;
  executions: number;
}

interface ByAgentData {
  total: number;
  successRate: number;
  avgConfidence: number;
}

interface Metrics {
  totalExecutions: number;
  successRate: number;
  avgConfidence: number;
  avgFilesPerExecution: number;
  avgIterations: number;
  avgDurationMs: number;
  validationPassRate: number;
  topCommands: TopCommand[];
  errorPatterns: ErrorPattern[];
  byAgent: Record<string, ByAgentData>;
  trend: TrendDay[];
}

export function AgentMetricsPanel({ filters = {} }: Props) {
  const metrics = getAgentMetrics(filters) as unknown as Metrics;

  if (metrics.totalExecutions === 0) {
    return (
      <div className="p-6 text-center text-[var(--text-3)]">
        <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No execution data yet. Run some commands to see metrics.</p>
      </div>
    );
  }

  const statCards = [
    { icon: Zap, label: 'Success Rate', value: `${metrics.successRate}%`, color: metrics.successRate >= 70 ? 'text-[var(--success)]' : metrics.successRate >= 50 ? 'text-[var(--warning)]' : 'text-[var(--error)]' },
    { icon: CheckCircle, label: 'Validation Pass', value: `${metrics.validationPassRate}%`, color: 'text-[var(--success)]' },
    { icon: FileText, label: 'Avg Files', value: metrics.avgFilesPerExecution, color: 'text-[var(--accent)]' },
    { icon: Clock, label: 'Avg Duration', value: `${Math.round(metrics.avgDurationMs / 1000)}s`, color: 'text-[var(--text-3)]' },
    { icon: TrendingUp, label: 'Avg Confidence', value: `${metrics.avgConfidence}%`, color: metrics.avgConfidence >= 70 ? 'text-[var(--success)]' : 'text-[var(--warning)]' },
    { icon: AlertTriangle, label: 'Avg Iterations', value: metrics.avgIterations, color: metrics.avgIterations <= 1.5 ? 'text-[var(--success)]' : 'text-[var(--warning)]' }
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((stat) => (
          <div key={stat.label} className="p-3 bg-[var(--surface-2)] rounded-xl">
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-3)] mb-1">
              <stat.icon className="w-3 h-3" />
              {stat.label}
            </div>
            <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {metrics.topCommands.length > 0 && (
        <div className="p-4 bg-[var(--surface-2)] rounded-xl">
          <div className="text-xs font-semibold text-[var(--text-3)] mb-2">Top Commands</div>
          <div className="space-y-1">
            {metrics.topCommands.slice(0, 5).map((cmd, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-2)] font-mono truncate max-w-[70%]">{cmd.command}</span>
                <span className="text-[var(--text-3)]">{cmd.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics.errorPatterns.length > 0 && (
        <div className="p-4 bg-[var(--surface-2)] rounded-xl">
          <div className="text-xs font-semibold text-[var(--text-3)] mb-2">Common Errors</div>
          <div className="space-y-1">
            {metrics.errorPatterns.map((err, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--error)] font-mono truncate max-w-[70%]">{err.error}</span>
                <span className="text-[var(--text-3)]">{err.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics.trend.length > 0 && (
        <div className="p-4 bg-[var(--surface-2)] rounded-xl">
          <div className="text-xs font-semibold text-[var(--text-3)] mb-2">7-Day Trend</div>
          <div className="flex items-end gap-1 h-16">
            {metrics.trend.map((day, i) => {
              const maxExec = Math.max(...metrics.trend.map((d) => d.executions), 1);
              const height = Math.max(4, (day.executions / maxExec) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end h-12">
                    <div
                      className="w-full bg-[var(--accent-dim)] rounded-t-sm transition-all"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-[var(--text-4)]">{day.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(metrics.byAgent).length > 0 && (
        <div className="p-4 bg-[var(--surface-2)] rounded-xl">
          <div className="text-xs font-semibold text-[var(--text-3)] mb-2">By Agent</div>
          <div className="space-y-2">
            {Object.entries(metrics.byAgent).map(([agent, data]) => (
              <div key={agent} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-2)] capitalize">{agent}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[var(--text-3)]">{data.total} executions</span>
                  <span className={data.successRate >= 70 ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>{data.successRate}% success</span>
                  <span className="text-[var(--text-3)]">{data.avgConfidence}% confidence</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
