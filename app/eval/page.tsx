'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getEvalRuns, getAggregate, clearEvalRuns, exportAsCSV,
  EvalRun, PRESET_PROMPTS,
} from '@/lib/evalTracker';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function SuccessDot({ success }: { success: boolean }) {
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: success ? 'var(--success)' : 'var(--error)',
      display: 'inline-block',
      boxShadow: success ? '0 0 6px var(--success-glow)' : '0 0 6px rgba(239,68,68,0.4)',
    }} />
  );
}

export default function EvalPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => {
    setRuns(getEvalRuns());
  }, []);

  const aggregate = getAggregate(runs);

  const filteredRuns = runs.filter((r) => {
    if (filter === 'success') return r.success;
    if (filter === 'failed') return !r.success;
    return true;
  });

  const handleClear = () => {
    if (confirm('Clear all eval logs?')) {
      clearEvalRuns();
      setRuns([]);
    }
  };

  const handleExport = () => {
    const csv = exportAsCSV(runs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compiler-eval-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunPreset = (prompt: string) => {
    sessionStorage.setItem('compiler_prompt', prompt);
    router.push('/generate');
  };

  const totalRetries = runs.reduce((sum, r) =>
    sum + Object.values(r.stages).reduce((s, st) => s + (st?.retries ?? 0), 0), 0
  );

  return (
    <div className="page-content" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>Evaluation Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Track pipeline runs, success rates, and failure patterns</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => router.push('/')}>← New Run</button>
          {runs.length > 0 && (
            <>
              <button id="export-csv-btn" className="btn btn-secondary btn-sm" onClick={handleExport}>⬇ CSV</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={handleClear}>🗑 Clear</button>
            </>
          )}
        </div>
      </div>

      {/* Aggregate Stats */}
      <div className="grid-4" style={{ marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent-primary)' }}>{aggregate.total_runs}</div>
          <div className="stat-label">Total Runs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: aggregate.success_rate >= 70 ? 'var(--success)' : 'var(--error)' }}>
            {aggregate.success_rate}%
          </div>
          <div className="stat-label">Success Rate</div>
          <div style={{ marginTop: 8 }}>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${aggregate.success_rate}%`, background: aggregate.success_rate >= 70 ? 'var(--success)' : 'var(--error)' }} />
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--info)' }}>
            {aggregate.avg_latency_ms > 0 ? formatDuration(aggregate.avg_latency_ms) : '—'}
          </div>
          <div className="stat-label">Avg Latency</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{totalRetries}</div>
          <div className="stat-label">Total Retries</div>
        </div>
      </div>

      {/* Top Errors */}
      {aggregate.top_errors.length > 0 && (
        <div className="card" style={{ marginBottom: 24, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Top Error Patterns
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aggregate.top_errors.map(({ error, count }, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--error-dim)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-error)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{error}</span>
                <span className="badge badge-error">{count}×</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preset Prompts */}
      <div className="card" style={{ marginBottom: 24, padding: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Preset Evaluation Prompts
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--success)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              10 Real Product Prompts
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PRESET_PROMPTS.real.map((p, i) => (
                <button
                  key={i}
                  id={`preset-real-${i}`}
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', fontFamily: 'var(--font-ui)', padding: '8px 10px', height: 'auto', whiteSpace: 'normal', lineHeight: 1.4 }}
                  onClick={() => handleRunPreset(p)}
                  title={p}
                >
                  <span style={{ color: 'var(--success)', marginRight: 6 }}>▶</span>
                  {p.slice(0, 65)}...
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--warning)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              10 Edge Cases
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PRESET_PROMPTS.edge.map((p, i) => (
                <button
                  key={i}
                  id={`preset-edge-${i}`}
                  className="btn btn-ghost btn-sm"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', fontFamily: 'var(--font-ui)', padding: '8px 10px', color: 'var(--warning)' }}
                  onClick={() => handleRunPreset(p)}
                  title={p}
                >
                  <span style={{ marginRight: 6 }}>⚠</span>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Run History */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Run History</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'success', 'failed'] as const).map((f) => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `All (${runs.length})` : f === 'success' ? `✓ ${runs.filter(r => r.success).length}` : `✗ ${runs.filter(r => !r.success).length}`}
            </button>
          ))}
        </div>
      </div>

      {filteredRuns.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>No runs yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            {runs.length === 0
              ? 'Run the pipeline to start tracking metrics.'
              : `No ${filter} runs found.`}
          </p>
          {runs.length === 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => router.push('/')}>
              Start First Run
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Prompt</th>
                <th>Latency</th>
                <th>Retries</th>
                <th>Issues</th>
                <th>Timestamp</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => {
                const totalRetries = Object.values(run.stages).reduce((s, st) => s + (st?.retries ?? 0), 0);
                const isExpanded = expandedRun === run.run_id;
                return [
                  <tr key={run.run_id} style={{ cursor: 'pointer' }} onClick={() => setExpandedRun(isExpanded ? null : run.run_id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <SuccessDot success={run.success} />
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: run.success ? 'var(--success)' : 'var(--error)' }}>
                          {run.success ? 'OK' : 'ERR'}
                        </span>
                      </div>
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <div style={{ fontSize: 12, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                        {run.prompt.slice(0, 70)}{run.prompt.length > 70 ? '…' : ''}
                      </div>
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 2 }}>{run.run_id.slice(0, 8)}</div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {run.total_latency_ms > 0 ? formatDuration(run.total_latency_ms) : '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${totalRetries > 0 ? 'badge-warning' : 'badge-muted'}`}>
                        {totalRetries}
                      </span>
                    </td>
                    <td>
                      {run.validation.issues_found > 0 ? (
                        <span className="badge badge-warning">
                          {run.validation.issues_found} found / {run.validation.issues_fixed} fixed
                        </span>
                      ) : (
                        <span className="badge badge-success">clean</span>
                      )}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(run.timestamp)}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '3px 8px' }}>
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${run.run_id}-details`}>
                      <td colSpan={7} style={{ padding: '12px 16px', background: 'var(--bg-elevated)' }}>
                        {/* Stage breakdown */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                          {Object.entries(run.stages).map(([stage, log]) => (
                            log && (
                              <div key={stage} style={{
                                padding: '8px 10px',
                                background: log.success ? 'var(--success-dim)' : 'var(--error-dim)',
                                border: `1px solid ${log.success ? 'var(--border-success)' : 'var(--border-error)'}`,
                                borderRadius: 'var(--radius-sm)',
                              }}>
                                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 4 }}>{stage}</div>
                                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: log.success ? 'var(--success)' : 'var(--error)' }}>
                                  {log.success ? '✓' : '✗'} {formatDuration(log.latency_ms)}
                                  {log.retries > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({log.retries}r)</span>}
                                </div>
                              </div>
                            )
                          ))}
                        </div>
                        {run.errors.length > 0 && (
                          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--error)', marginTop: 4 }}>
                            {run.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                ].filter(Boolean);
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
