import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, Copy, Wifi, Shield, QrCode, CheckCircle2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';

interface CompanionStatus {
  running: boolean;
  port?: number;
  connected_clients: number;
}

export function CompanionPairingPanel() {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [localIps, setLocalIps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [discoveryStarted, setDiscoveryStarted] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const refreshStatus = async () => {
    try {
      const result = await invoke<CompanionStatus>('companion_get_status');
      setStatus(result);
    } catch {
      setStatus(null);
    }
  };

  const generatePin = async () => {
    setLoading(true);
    try {
      const result = await invoke<string>('companion_get_pin');
      setPin(result);
    } catch {
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const startDiscovery = async () => {
    setDiscoveryError(null);
    try {
      await invoke('companion_start_discovery', { port: status?.port || 8765 });
      setDiscoveryStarted(true);
    } catch (err) {
      setDiscoveryStarted(false);
      setDiscoveryError(String((err as Error)?.message || err || 'Discovery failed to start.'));
    }
  };

  const copyPin = async () => {
    if (!pin) return;
    await navigator.clipboard.writeText(pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    invoke<string[]>('companion_get_local_ip').then(ips => setLocalIps(ips)).catch(() => {});
    return () => clearInterval(interval);
  }, []);

  if (!status?.running) {
    return (
      <div className="p-4 bg-[var(--surface-2)] rounded-2xl">
        <div className="flex items-center gap-2 text-[var(--text-3)]">
          <Shield className="w-4 h-4" />
          <span className="text-xs">Companion server not running</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-[var(--surface-2)] rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text-1)]">Remote Access PIN</div>
            <div className="text-xs text-[var(--text-3)] mt-0.5">Connect iOS companion to this desktop</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startDiscovery}
              disabled={discoveryStarted}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--surface-3)] hover:bg-[var(--surface-3)] disabled:bg-[var(--success-dim)] text-[var(--text-1)] text-xs font-medium transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              {discoveryStarted ? 'Discovering' : 'Start Discovery'}
            </button>
            <button
              onClick={generatePin}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-[var(--surface-3)] text-white text-xs font-medium transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              {loading ? 'Generating...' : 'Generate PIN'}
            </button>
          </div>
        </div>

        {discoveryError && (
          <div className="text-[11px] text-[var(--error)] bg-[var(--error-dim)] border border-[var(--error-border)] rounded-lg px-3 py-2">
            Discovery failed to start: {discoveryError}
          </div>
        )}

        {pin && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-[var(--surface-0)] rounded-xl">
              <div className="text-3xl font-mono font-bold tracking-wider text-[var(--success)]">{pin}</div>
              <button
                onClick={copyPin}
                className="p-2 rounded-lg bg-[var(--surface-3)] hover:bg-[var(--surface-3)] transition-colors"
                aria-label="Copy PIN"
                title="Copy PIN"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-[var(--success)]" /> : <Copy className="w-4 h-4 text-[var(--text-3)]" />}
              </button>
            </div>
            <div className="flex justify-center p-4 bg-[var(--surface-2)] rounded-xl">
              <QRCodeCanvas value={pin} size={128} bgColor="#18181b" fgColor="#34d399" />
            </div>
          </div>
        )}

        {localIps.length > 0 && (
          <div className="p-3 bg-[var(--surface-0)] rounded-xl">
            <div className="text-[11px] text-[var(--text-3)] mb-1 font-medium">Desktop IP (for manual entry)</div>
            {localIps.map(ip => (
              <div key={ip} className="font-mono text-sm text-[var(--success)]">{ip}:{status?.port ?? 8765}</div>
            ))}
          </div>
        )}
        <div className="text-[11px] text-[var(--text-3)]">
          Enter this 6-digit PIN in the iOS app to pair. The PIN expires in 5 minutes.
          {localIps.length === 0 ? '' : ' On a different network, use the IP above for manual entry.'}
        </div>
      </div>

      <div className="p-4 bg-[var(--surface-2)] rounded-2xl">
        <div className="flex items-center gap-2 text-xs">
          <Wifi className="w-3.5 h-3.5" />
          <span className="text-[var(--text-3)]">
            Connected clients: <span className="text-[var(--text-1)] font-medium">{status.connected_clients}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
