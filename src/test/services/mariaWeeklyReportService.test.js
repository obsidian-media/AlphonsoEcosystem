import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateWeeklyReport, saveReport, getReports, getLatestReport, scheduleWeeklyGeneration } from '../../services/mariaWeeklyReportService';

vi.mock('../../services/agentAuditService', () => ({
  getAuditLog: vi.fn(() => [])
}));

describe('mariaWeeklyReportService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generateWeeklyReport returns report structure', () => {
    const report = generateWeeklyReport();
    expect(report.period).toBeDefined();
    expect(report.period.start).toBeLessThan(report.period.end);
    expect(typeof report.totalActions).toBe('number');
    expect(typeof report.approvedCount).toBe('number');
    expect(typeof report.rejectedCount).toBe('number');
    expect(report.riskBreakdown).toHaveProperty('low');
    expect(report.riskBreakdown).toHaveProperty('medium');
    expect(report.riskBreakdown).toHaveProperty('high');
    expect(Array.isArray(report.topAgents)).toBe(true);
    expect(Array.isArray(report.recommendations)).toBe(true);
  });

  it('generateWeeklyReport adds recommendation when no actions', () => {
    const report = generateWeeklyReport();
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('saveReport stores report', () => {
    const report = generateWeeklyReport();
    saveReport(report);
    const reports = getReports();
    expect(reports.length).toBe(1);
  });

  it('getReports respects limit', () => {
    saveReport(generateWeeklyReport());
    saveReport(generateWeeklyReport());
    saveReport(generateWeeklyReport());
    expect(getReports(2).length).toBe(2);
  });

  it('getReports returns newest first', () => {
    saveReport({ totalActions: 1 });
    saveReport({ totalActions: 2 });
    const reports = getReports();
    expect(reports[0].totalActions).toBe(2);
  });

  it('getLatestReport returns last saved', () => {
    saveReport({ totalActions: 1 });
    saveReport({ totalActions: 2 });
    expect(getLatestReport().totalActions).toBe(2);
  });

  it('getLatestReport returns null when empty', () => {
    expect(getLatestReport()).toBeNull();
  });

  it('scheduleWeeklyGeneration returns cleanup function', () => {
    const cleanup = scheduleWeeklyGeneration(() => {});
    expect(typeof cleanup).toBe('function');
    cleanup();
  });
});
