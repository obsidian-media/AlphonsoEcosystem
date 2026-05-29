import { Shield } from 'lucide-react';

export function ApprovalModal({ label, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-amber-500/30 bg-zinc-900 shadow-2xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-1">Approval Required</div>
            <div className="text-sm text-zinc-200 leading-snug">{label}</div>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500 mb-5">Jose requires explicit approval before this action executes.</div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-zinc-400 bg-zinc-800 border border-white/10 hover:bg-zinc-700 transition-colors"
          >
            Deny
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-white bg-amber-600 hover:bg-amber-500 transition-colors shadow-lg"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
