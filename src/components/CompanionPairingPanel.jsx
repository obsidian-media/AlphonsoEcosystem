// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Key, Copy, Wifi, Shield, QrCode, CheckCircle2 } from 'lucide-react';
import QRCode from 'qrcode.react';

export function CompanionPairingPanel() {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [discoveryStarted, setDiscoveryStarted] = useState(false);

  const refreshStatus = async () => {
    try {
      const result = await invoke('companion_get_status');
      setStatus(result);
    } catch {
      setStatus(null);
    }
  };

  const generatePin = async () => {
    setLoading(true);
    try {
      const result = await invoke('companion_get_pin');
      setPin(result);
    } catch {
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const startDiscovery = async () => {
    try {
      await invoke('companion_start_discovery', { port: status?.port || 8765 });
      setDiscoveryStarted(true);
    } catch {
      setDiscoveryStarted(false);
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
    return () => clearInterval(interval);
  }, []);

  if (!status?.running) {
    return (
      <div className="p-4 bg-zinc-900/50 rounded-2xl border border-white/5">
        <div className="flex items-center gap-2 text-zinc-400">
          <Shield className="w-4 h-4" />
          <span className="text-xs">Companion server not running</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-zinc-900/50 rounded-2xl border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Remote Access PIN</div>
            <div className="text-xs text-zinc-500 mt-0.5">Connect iOS companion to this desktop</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startDiscovery}
              disabled={discoveryStarted}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:bg-emerald-600/20 text-white text-xs font-medium transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              {discoveryStarted ? 'Discovering' : 'Start Discovery'}
            </button>
            <button
              onClick={generatePin}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 text-white text-xs font-medium transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              {loading ? 'Generating...' : 'Generate PIN'}
            </button>
          </div>
        </div>

        {pin && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-black/30 rounded-xl">
              <div className="text-3xl font-mono font-bold tracking-wider text-emerald-400">{pin}</div>
              <button
                onClick={copyPin}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                title="Copy PIN"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
              </button>
            </div>
            <div className="flex justify-center p-4 bg-zinc-900/70 rounded-xl">
              <QRCode value={pin} size={128} bgColor="#18181b" fgColor="#34d399" />
            </div>
          </div>
        )}

        <div className="text-[11px] text-zinc-500">
          Enter this 6-digit PIN in the iOS app to pair. The PIN expires in 5 minutes.
        </div>
      </div>

      <div className="p-4 bg-zinc-900/50 rounded-2xl border border-white/5">
        <div className="flex items-center gap-2 text-xs">
          <Wifi className="w-3.5 h-3.5" />
          <span className="text-zinc-400">
            Connected clients: <span className="text-white font-medium">{status.connected_clients}</span>
          </span>
        </div>
      </div>
    </div>
  );
}