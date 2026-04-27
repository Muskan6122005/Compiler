'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import JSZip from 'jszip';

type TabKey = 'db_schema' | 'api_schema' | 'ui_schema' | 'auth_schema';

const TABS: { key: TabKey; label: string; icon: string; color: string }[] = [
  { key: 'db_schema', label: 'DB Schema', icon: '🗄', color: 'var(--info)' },
  { key: 'api_schema', label: 'API Schema', icon: '⚡', color: 'var(--warning)' },
  { key: 'ui_schema', label: 'UI Schema', icon: '🖥', color: 'var(--accent-primary)' },
  { key: 'auth_schema', label: 'Auth Rules', icon: '🔐', color: 'var(--success)' },
];

function colorizeJSON(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"([^"]+)"(?=\s*:)/g, '<span class="json-key">"$1"</span>')
    .replace(/:\s*"([^"]*)"/g, ': <span class="json-string">"$1"</span>')
    .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
}

// Safe helper: get a count from the first array-valued key in an object
function getTopLevelCount(data: unknown): string {
  if (!data || typeof data !== 'object') return '—';
  const obj = data as Record<string, unknown>;
  const firstArrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
  if (!firstArrayKey) return '—';
  return String((obj[firstArrayKey] as unknown[]).length);
}

function getTopLevelKey(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const obj = data as Record<string, unknown>;
  return Object.keys(obj).find((k) => Array.isArray(obj[k])) ?? '';
}

export default function OutputPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('db_schema');
  const [schemas, setSchemas] = useState<Record<string, any> | null>(null);
  const [validation, setValidation] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('compiler_output');
      const val = sessionStorage.getItem('compiler_validation');

      if (raw && raw.trim().length > 0) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setSchemas({
            db_schema: parsed.db_schema ?? null,
            api_schema: parsed.api_schema ?? null,
            ui_schema: parsed.ui_schema ?? null,
            auth_schema: parsed.auth_schema ?? null,
          });
        }
      }

      if (val && val.trim().length > 0) {
        setValidation(JSON.parse(val));
      }
    } catch {
      // noop — failed parse handled by null state below
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCopy = async () => {
    if (!schemas) return;
    const text = JSON.stringify(schemas[activeTab], null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadAll = async () => {
    if (!schemas) return;
    const zip = new JSZip();
    const folder = zip.folder('compiler-output')!;
    folder.file('db_schema.json', JSON.stringify(schemas.db_schema ?? {}, null, 2));
    folder.file('api_schema.json', JSON.stringify(schemas.api_schema ?? {}, null, 2));
    folder.file('ui_schema.json', JSON.stringify(schemas.ui_schema ?? {}, null, 2));
    folder.file('auth_schema.json', JSON.stringify(schemas.auth_schema ?? {}, null, 2));
    folder.file('all_schemas.json', JSON.stringify(schemas, null, 2));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'compiler-output.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-content" style={{ textAlign: 'center', paddingTop: 100 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
        <p style={{ color: 'var(--text-muted)' }}>Loading output...</p>
      </div>
    );
  }

  // ── Empty / No data state ─────────────────────────────────────────────────
  if (!schemas || !schemas.db_schema) {
    return (
      <div className="page-content" style={{ textAlign: 'center', paddingTop: 100 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
        <h2 style={{ fontSize: 22, marginBottom: 8 }}>No output yet</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
          Run the pipeline first to see output schemas.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => router.push('/')}>
            Start Pipeline
          </button>
        </div>
      </div>
    );
  }

  const currentData = schemas[activeTab];
  const jsonStr = JSON.stringify(currentData ?? {}, null, 2);

  // ── Validation summary — handles both LLM and fallback shapes ────────────
  type ValError = { layer?: string; issue?: string; severity?: string; suggested_fix?: string; rule?: string };
  const valFull = validation as Record<string, unknown> | null;
  const rawIssues: ValError[] = (
    (valFull?.validation_results as Record<string, unknown>)?.raw_issues ??
    valFull?.errors ??
    []
  ) as ValError[];
  const consistencyChecks: Record<string, boolean> = (
    (valFull?.validation_results as Record<string, unknown>)?.consistency_checks ??
    valFull?.consistency_checks ??
    {}
  ) as Record<string, boolean>;
  const safeIssues = Array.isArray(rawIssues) ? rawIssues : [];
  const errorCount = safeIssues.filter((e) => e?.severity === 'error').length;
  const isValid = errorCount === 0;

  return (
    <div className="page-content" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>Output Schemas</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={`badge ${isValid ? 'badge-success' : 'badge-error'}`}>
              {isValid ? '✓ All checks passed' : `⚠ ${errorCount} issue${errorCount !== 1 ? 's' : ''} flagged`}
            </span>
            <span className="badge badge-muted">4 schemas</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => router.push('/')}>← New Prompt</button>
          <button className="btn btn-secondary btn-sm" onClick={() => router.push('/eval')}>📊 Eval</button>
          <button
            id="download-zip-btn"
            className="btn btn-primary btn-sm"
            onClick={handleDownloadAll}
          >
            ⬇ Download ZIP
          </button>
        </div>
      </div>

      {/* Schema size overview */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {TABS.map((tab): React.ReactNode => {
          const data = schemas[tab.key];
          const sizeKb = (JSON.stringify(data ?? {}).length / 1024).toFixed(1);
          const count = getTopLevelCount(data);
          const topKey = getTopLevelKey(data);

          return (
            <div
              key={tab.key}
              className="stat-card"
              style={{
                cursor: 'pointer',
                borderTopColor: tab.color,
                borderTopWidth: 2,
                transition: 'all 0.2s',
                borderColor: activeTab === tab.key ? tab.color : undefined,
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              <div style={{ marginBottom: 6, fontSize: 18 }}>{tab.icon}</div>
              <div className="stat-value" style={{ fontSize: 22, color: tab.color }}>{String(count)}</div>
              <div className="stat-label">{String(tab.label.split(' ')[0])} {String(topKey)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {sizeKb} KB
              </div>
            </div>
          );
        })}
      </div>

      {/* Main content */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              className={`tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              style={{ gap: 6, display: 'flex', alignItems: 'center' }}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <button id="copy-btn" className="btn btn-ghost btn-sm" onClick={handleCopy}>
              {copied ? '✓ Copied!' : '📋 Copy'}
            </button>
          </div>
        </div>

        {/* JSON content */}
        <div style={{ position: 'relative' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 20px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
          }}>
            <span>{(jsonStr ?? '').split('\n').length} lines · {((jsonStr ?? '').length / 1024).toFixed(1)} KB</span>
            <span style={{ color: TABS.find(t => t.key === activeTab)?.color }}>
              {TABS.find(t => t.key === activeTab)?.label}
            </span>
          </div>
          <div className="json-viewer" style={{ maxHeight: '60vh', borderRadius: 0, border: 'none', padding: '20px 24px' }}>
            <pre
              dangerouslySetInnerHTML={{ __html: colorizeJSON(jsonStr ?? '{}') }}
              style={{ whiteSpace: 'pre', fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      {/* Validation Results */}
      {validation && (
        <div className="card" style={{ marginTop: 16, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            Validation Results
          </h3>
          {Object.keys(consistencyChecks).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
              {Object.entries(consistencyChecks).map(([check, passed]) => (
                <div key={check} style={{
                  padding: '8px 10px',
                  background: passed ? 'var(--success-dim)' : 'var(--error-dim)',
                  border: `1px solid ${passed ? 'var(--border-success)' : 'var(--border-error)'}`,
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: passed ? 'var(--success)' : 'var(--error)',
                  textAlign: 'center',
                }}>
                  {passed ? '✓' : '✗'} {check.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          )}
          {safeIssues.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {safeIssues.slice(0, 5).map((err, i) => (
                <div key={i} className={`alert alert-${err?.severity === 'error' ? 'error' : 'warning'}`}>
                  <span>{err?.severity === 'error' ? '✗' : '⚠'}</span>
                  <div>
                    {err?.layer && <strong>[{err.layer}]</strong>} {err?.issue ?? 'Unknown issue'}
                    {err?.suggested_fix && (
                      <div style={{ fontSize: 12, marginTop: 2, opacity: 0.8 }}>Fix: {err.suggested_fix}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
