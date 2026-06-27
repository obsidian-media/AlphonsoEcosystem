import React, { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { exportWorkspace, importWorkspace } from '../services/workspaceExportService';

interface Status {
  type: 'success' | 'error';
  message: string;
}

export function WorkspaceExportImportView() {
  const [status, setStatus] = useState<Status | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const json = exportWorkspace();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alphonso-workspace-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ type: 'success', message: 'Workspace exported.' });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = importWorkspace((ev.target as FileReader).result as string);
      if (result.errors.length) {
        setStatus({ type: 'error', message: `Imported ${result.imported} keys. Errors: ${result.errors.join('; ')}` });
      } else {
        setStatus({ type: 'success', message: `Imported ${result.imported} workspace keys.` });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Workspace</div>
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          <Upload className="h-3.5 w-3.5" /> Import
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>
      {status && (
        <div className={`text-[11px] ${status.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
          {status.message}
        </div>
      )}
    </div>
  );
}
