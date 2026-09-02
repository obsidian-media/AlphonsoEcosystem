import React, { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Shield, Info, Plug, Clock, ChevronDown } from 'lucide-react';

export interface DigestItem {
  id: string;
  type: 'approval' | 'activity' | 'system' | 'coach' | 'connector' | 'schedule';
  priority: 'urgent' | 'normal' | 'low';
  title: string;
  detail?: string;
  timestamp: number;
  read: boolean;
  agentId?: string;
  actionLabel?: string;
  action?: () => void;
  navigateTo?: string;
}

interface DigestPanelProps {
  isOpen: boolean;
  onClose: () => void;
  items: DigestItem[];
  onMarkAllRead: () => void;
  onItemClick: (item: DigestItem) => void;
}

type FilterType = 'all' | 'approvals' | 'activity' | 'system';

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  approval: { icon: Shield, color: 'text-[var(--warning)]' },
  activity: { icon: CheckCircle, color: 'text-[var(--success)]' },
  system: { icon: Info, color: 'text-[var(--text-3)]' },
  coach: { icon: Shield, color: 'text-[var(--error)]' },
  connector: { icon: Plug, color: 'text-[var(--accent)]' },
  schedule: { icon: Clock, color: 'text-[var(--text-2)]' },
};

export function DigestPanel({ isOpen, onClose, items, onMarkAllRead, onItemClick }: DigestPanelProps) {
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredItems = filter === 'all' ? items : items.filter(item => {
    if (filter === 'approvals') return item.type === 'approval';
    if (filter === 'activity') return item.type === 'activity';
    if (filter === 'system') return item.type === 'system';
    return true;
  });

  const urgentItems = filteredItems.filter(item => item.priority === 'urgent');
  const normalItems = filteredItems.filter(item => item.priority !== 'urgent');

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[900] flex justify-end" role="dialog" aria-modal="true" aria-label="Digest panel">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      
      <div
        className="relative w-[400px] h-full bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl flex flex-col"
        style={{ animation: 'slideInRight 250ms ease-out' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-1)]">Digest</h2>
            <p className="text-xs text-[var(--text-3)]">{items.length} items</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors"
            aria-label="Close digest"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
          <button
            onClick={onMarkAllRead}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            Mark all read
          </button>
          <div className="relative ml-auto">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
              className="appearance-none bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 pr-6 text-xs text-[var(--text-2)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="all">All</option>
              <option value="approvals">Approvals</option>
              <option value="activity">Activity</option>
              <option value="system">System</option>
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-3)] pointer-events-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {urgentItems.length > 0 && (
            <div className="px-4 py-2">
              <div className="text-xs font-semibold text-[var(--warning)] uppercase tracking-wider mb-2">
                Needs your attention
              </div>
              {urgentItems.map(item => (
                <DigestItemRow key={item.id} item={item} onClick={() => onItemClick(item)} formatTime={formatTime} />
              ))}
            </div>
          )}

          <div className="px-4 py-2">
            {normalItems.length === 0 && urgentItems.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-3)]">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-[var(--success)]" />
                <p className="text-sm">All caught up ✓</p>
              </div>
            ) : (
              normalItems.map(item => (
                <DigestItemRow key={item.id} item={item} onClick={() => onItemClick(item)} formatTime={formatTime} />
              ))
            )}
          </div>
        </div>

        <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--surface-2)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-3)]">
            <span>Local AI 🟢</span>
            <span>Coach 🟢</span>
            <span>Memory 🟢</span>
            <span>Connectors 🟡</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DigestItemRow({ item, onClick, formatTime }: { item: DigestItem; onClick: () => void; formatTime: (ts: number) => string }) {
  const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.system;
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--surface-3)] transition-colors mb-1"
    >
      <div className="flex items-start gap-2.5">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${config.color}`} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-[var(--text-1)] truncate">{item.title}</div>
          {item.detail && (
            <div className="text-xs text-[var(--text-3)] truncate">{item.detail}</div>
          )}
          <div className="text-[10px] text-[var(--text-3)] mt-0.5">{formatTime(item.timestamp)}</div>
        </div>
      </div>
    </button>
  );
}
