// Sources you saved from Hector's reports (agent phase 1): open, remove, export.
// Hector's skills read them with the read_bookmarks tool.
import React, { useState } from 'react';
import { openExternalUrl } from '../../services/browserAutomationService';
import { getBookmarks, deleteBookmark, exportBookmarks } from '../../services/hectorBookmarkService';

export function SavedSources(): React.JSX.Element {
  const [list, setList] = useState(() => getBookmarks());
  const download = () => {
    try {
      const blob = new Blob([exportBookmarks()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'hector-saved-sources.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* no download in this window */ }
  };
  return (
    <div className="card space-y-2" data-testid="saved-sources">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-(--text-3)">Saved sources ({list.length})</div>
        {list.length > 0 && <button type="button" onClick={download} className="text-[10px] text-(--text-3) underline">Export</button>}
      </div>
      {list.length === 0 && <p className="text-[12px] text-(--text-4)">Save a source from a report to keep it here.</p>}
      {list.map((b) => (
        <div key={b.id} className="flex items-start gap-2 rounded-lg bg-(--surface-1) px-3 py-2 text-[12px]">
          <button type="button" onClick={() => openExternalUrl(b.url)} className="flex-1 text-left text-(--agent-hector) underline break-all">{b.title || b.url}</button>
          <button type="button" onClick={() => { deleteBookmark(b.id); setList(getBookmarks()); }} className="text-[10px] text-(--error)">Remove</button>
        </div>
      ))}
    </div>
  );
}
