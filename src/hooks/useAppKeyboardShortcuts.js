import { useEffect } from 'react';

export function useAppKeyboardShortcuts({ approvalPending, setApprovalPending, setApprovalRequiredNotice, approvalResolveRef, switchTab }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        switchTab('settings');
      }
      if (event.key === 'Escape' && approvalPending) {
        setApprovalPending(null);
        setApprovalRequiredNotice(true);
        approvalResolveRef.current?.(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [approvalPending, setApprovalPending, setApprovalRequiredNotice, approvalResolveRef, switchTab]);
}
