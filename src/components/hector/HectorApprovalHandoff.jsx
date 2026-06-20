import React from 'react';

export function HectorApprovalHandoff({ report, onCreateHandoff }) {
  return (
    <section className="rounded-2xl border border-teal-300/15 bg-zinc-950/72 p-4">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/75">Jose Approval Handoff</div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Hector cannot execute, post, download executables, access accounts, or bypass Jose. Research reports become supervised handoff packets.
      </p>
      <button
        onClick={() => report && onCreateHandoff(report.id)}
        disabled={!report}
        className="mt-3 rounded-xl bg-teal-300 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-950 hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send Report To Jose
      </button>
    </section>
  );
}
