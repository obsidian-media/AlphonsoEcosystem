import { invoke } from '@tauri-apps/api/core';
import { timestampMs } from './trustModel';
import { persistScopeRows } from './runtimeLedgerService';

const STORE_KEY = 'alphonso_nova_scores_v1';
export const NOVA_SCORE_SCOPE = 'nova_scores_v1';
const MAX_SCORES = 500;

interface NovaScoreEntry {
  commandId: string;
  score: number;
  opportunityScore: number;
  riskScore: number;
  timestampMs: number;
}

function readAllScores(): NovaScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as NovaScoreEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAllScores(scores: NovaScoreEntry[]): void {
  const rows = scores.slice(-MAX_SCORES);
  try {
    invoke('kv_set', { key: STORE_KEY, value: JSON.stringify(rows) }).catch(() => {});
  } catch {
    // SQLite not available in browser
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(rows));
  } catch {
    // localStorage unavailable
  }
  void persistScopeRows(NOVA_SCORE_SCOPE, rows, (row: NovaScoreEntry) => ({
    id: row.commandId,
    data: row,
    status: 'recorded',
    confidence: 'inferred',
    verificationState: 'unverified',
    timestampMs: Number(row.timestampMs || timestampMs())
  }));
}

interface ScoreInput {
  opportunityScore?: number;
  riskScore?: number;
}

export function storeNovaScore(commandId: string, score: ScoreInput | number | null): NovaScoreEntry | null {
  if (!commandId || score == null) return null;
  const opportunityScore = Number((score && typeof score === 'object' ? score.opportunityScore : undefined) ?? (typeof score === 'number' ? score : (score as ScoreInput)?.opportunityScore) ?? score);
  const riskScore = Number((score && typeof score === 'object' ? (score as ScoreInput).riskScore : undefined) ?? 0);
  if (Number.isNaN(opportunityScore) || Number.isNaN(riskScore)) return null;
  const numericScore = Number.isNaN(opportunityScore) ? 0 : opportunityScore;
  const entry: NovaScoreEntry = {
    commandId,
    score: numericScore,
    opportunityScore: Number.isNaN(opportunityScore) ? 0 : opportunityScore,
    riskScore: Number.isNaN(riskScore) ? 0 : riskScore,
    timestampMs: timestampMs()
  };
  const allScores = readAllScores();
  const existingIndex = allScores.findIndex((s) => s.commandId === commandId);
  if (existingIndex >= 0) {
    allScores[existingIndex] = entry;
  } else {
    allScores.push(entry);
  }
  writeAllScores(allScores);
  return entry;
}

export function getNovaScore(commandId: string): NovaScoreEntry | null {
  if (!commandId) return null;
  const allScores = readAllScores();
  return allScores.find((s) => s.commandId === commandId) || null;
}

interface DecompositionHint {
  type: string;
  message: string;
}

export function getDecompositionHints(commandId: string): { hints: DecompositionHint[]; score: NovaScoreEntry | null } {
  const scoreEntry = getNovaScore(commandId);
  if (!scoreEntry) return { hints: [], score: null };

  const hints: DecompositionHint[] = [];
  const opportunityScore = Number(scoreEntry.opportunityScore ?? scoreEntry.score ?? 0);
  const riskScore = Number(scoreEntry.riskScore ?? 0);

  if (opportunityScore >= 70) {
    hints.push({ type: 'opportunity_high', message: 'High opportunity score — prioritize creative agents (Miya, Hector).' });
  } else if (opportunityScore <= 30) {
    hints.push({ type: 'opportunity_low', message: 'Low opportunity score — consider minimal agent delegation.' });
  }

  if (riskScore >= 70) {
    hints.push({ type: 'risk_high', message: 'High risk score — add Sentinel review before execution.' });
  } else if (riskScore >= 40) {
    hints.push({ type: 'risk_moderate', message: 'Moderate risk — include Maria governance check.' });
  }

  if (opportunityScore >= 60 && riskScore <= 20) {
    hints.push({ type: 'favorable_ratio', message: 'Favorable opportunity/risk ratio — safe to delegate broadly.' });
  }

  if (riskScore >= 60 && opportunityScore <= 30) {
    hints.push({ type: 'unfavorable_ratio', message: 'Unfavorable opportunity/risk ratio — recommend Sentinel and Maria pre-gates.' });
  }

  return { hints, score: scoreEntry };
}

export function listRecentScores(count: number = 10): NovaScoreEntry[] {
  const allScores = readAllScores();
  const limit = Math.max(1, Math.min(Number(count) || 10, MAX_SCORES));
  return allScores.slice(-limit);
}

interface ScoreTrend {
  trend: 'improving' | 'declining' | 'stable';
  delta?: number;
  dataPoints: number;
}

export function computeScoreTrend(scores: NovaScoreEntry[]): ScoreTrend {
  if (!Array.isArray(scores) || scores.length < 2) {
    return { trend: 'stable', dataPoints: scores?.length || 0 };
  }

  const numericScores = scores
    .map((s) => Number(s?.score ?? s?.opportunityScore ?? 0))
    .filter((n) => !Number.isNaN(n));

  if (numericScores.length < 2) {
    return { trend: 'stable', dataPoints: numericScores.length };
  }

  const firstHalf = numericScores.slice(0, Math.floor(numericScores.length / 2));
  const secondHalf = numericScores.slice(Math.floor(numericScores.length / 2));

  const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;
  const delta = secondAvg - firstAvg;

  if (delta > 5) return { trend: 'improving', delta, dataPoints: numericScores.length };
  if (delta < -5) return { trend: 'declining', delta, dataPoints: numericScores.length };
  return { trend: 'stable', delta, dataPoints: numericScores.length };
}

export function clearNovaScores(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // localStorage unavailable
  }
  writeAllScores([]);
}
