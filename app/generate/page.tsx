'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { saveEvalRun, createEvalRun, EvalRun, StageLog } from '@/lib/evalTracker';

type StageStatus = 'pending' | 'running' | 'done' | 'error';

interface StageState {
  status: StageStatus;
  latency_ms?: number;
  retries?: number;
  data?: unknown;
  error?: string;
  repaired?: boolean;
}

interface PipelineState {
  stage1: StageState;
  stage2: StageState;
  stage3a: StageState;
  stage3b: StageState;
  stage3c: StageState;
  stage3d: StageState;
  stage4: StageState;
}

const initialState: PipelineState = {
  stage1: { status: 'pending' },
  stage2: { status: 'pending' },
  stage3a: { status: 'pending' },
  stage3b: { status: 'pending' },
  stage3c: { status: 'pending' },
  stage3d: { status: 'pending' },
  stage4: { status: 'pending' },
};

function JSONCollapsible({ data, label }: { data: unknown; label: string }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;

  const colorize = (json: string) => {
    return json
      .replace(/"([^"]+)"(?=\s*:)/g, '<span class="json-key">"$1"</span>')
      .replace(/:\s*"([^"]*)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
  };

  return (
    <div style={{ marginTop: 10 }}>
      <button className="collapsible-trigger" onClick={() => setOpen(!open)}>
        <span className={`collapsible-icon ${open ? 'open' : ''}`}>▶</span>
        {open ? 'Hide' : 'Show'} {label}
      </button>
      {open && (
        <div className="json-viewer" style={{ marginTop: 8 }}>
          <pre dangerouslySetInnerHTML={{ __html: colorize(JSON.stringify(data, null, 2)) }} />
        </div>
      )}
    </div>
  );
}

function StageCard({
  id, title, subtitle, state, children
}: {
  id: string;
  title: string;
  subtitle: string;
  state: StageState;
  children?: React.ReactNode;
}) {
  const icons = { pending: '○', running: '◎', done: '✓', error: '✗' };
  const colors = {
    pending: 'var(--text-muted)',
    running: 'var(--accent-primary)',
    done: 'var(--success)',
    error: 'var(--error)',
  };

  return (
    <div id={id} className={`pipeline-stage ${state.status}`}>
      <div className="stage-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className={`stage-indicator ${state.status}`}>{icons[state.status]}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: colors[state.status] }}>{title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {state.status === 'running' && <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
          {state.latency_ms && (
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              {(state.latency_ms / 1000).toFixed(1)}s
            </span>
          )}
          {state.retries !== undefined && state.retries > 0 && (
            <span className="badge badge-warning">{state.retries} retry</span>
          )}
          {state.repaired && <span className="badge badge-info">repaired</span>}
          {state.status === 'done' && <span className="badge badge-success">✓ done</span>}
          {state.status === 'error' && <span className="badge badge-error">✗ failed</span>}
        </div>
      </div>
      {state.error && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          <span>⚠</span> {state.error}
        </div>
      )}
      {children}
      {state.data != null && <JSONCollapsible data={state.data as Record<string, unknown>} label="output JSON" />}
    </div>
  );
}

export default function GeneratePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [pipeline, setPipeline] = useState<PipelineState>(initialState);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [needsClarification, setNeedsClarification] = useState(false);
  const [ambiguities, setAmbiguities] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const p = sessionStorage.getItem('compiler_prompt') || '';
    setPrompt(p);
    if (p) startPipeline(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => setElapsed(Date.now() - startTime), 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running, startTime]);

  const updateStage = (stage: keyof PipelineState, update: Partial<StageState>) => {
    setPipeline((prev) => ({ ...prev, [stage]: { ...prev[stage], ...update } }));
  };

  async function apiCall(url: string, body: unknown): Promise<unknown> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function startPipeline(p: string) {
    if (!p) { router.push('/'); return; }
    setRunning(true);
    setStartTime(Date.now());
    setDone(false);
    setPipeline(initialState);

    const evalRun: EvalRun = createEvalRun(p);
    const errors: string[] = [];

    try {
      // ── Stage 1 ─────────────────────────────────────────────────────────────
      updateStage('stage1', { status: 'running' });
      const s1Timer = setTimeout(() => {
        updateStage('stage1', { status: 'running', error: 'Retrying with smaller output...' });
      }, 20000);
      const s1start = Date.now();
      let stage1Data: unknown;
      try {
        const s1res = await apiCall('/api/stage1', { prompt: p }) as {
          intent: { ambiguities?: string[] };
          latency_ms: number;
          retries: number;
          repaired: boolean;
          needs_clarification: boolean;
        };
        clearTimeout(s1Timer);
        stage1Data = s1res.intent;
        const s1log: StageLog = { success: true, latency_ms: s1res.latency_ms, retries: s1res.retries };
        evalRun.stages.stage1 = s1log;

        if (s1res.needs_clarification) {
          setNeedsClarification(true);
          const intent = s1res.intent as { ambiguities?: string[] };
          setAmbiguities(intent?.ambiguities || []);
        }

        updateStage('stage1', {
          status: 'done',
          latency_ms: s1res.latency_ms,
          retries: s1res.retries,
          repaired: s1res.repaired,
          data: stage1Data,
        });
      } catch (err) {
        clearTimeout(s1Timer);
        const msg = err instanceof Error ? err.message : String(err);
        updateStage('stage1', { status: 'error', error: msg, latency_ms: Date.now() - s1start });
        evalRun.stages.stage1 = { success: false, latency_ms: Date.now() - s1start, retries: 0, error: msg };
        errors.push(`Stage 1: ${msg}`);
        throw err;
      }

      // ── Stage 2 ─────────────────────────────────────────────────────────────
      updateStage('stage2', { status: 'running' });
      const s2Timer = setTimeout(() => {
        updateStage('stage2', { status: 'running', error: 'Retrying with smaller output...' });
      }, 20000);

      let stage2Data: unknown;
      try {
        const s2res = await apiCall('/api/stage2', { stage1_output: stage1Data }) as {
          design: unknown; latency_ms: number; retries: number; repaired: boolean;
        };
        clearTimeout(s2Timer);
        stage2Data = s2res.design;
        evalRun.stages.stage2 = { success: true, latency_ms: s2res.latency_ms, retries: s2res.retries };
        updateStage('stage2', { status: 'done', latency_ms: s2res.latency_ms, retries: s2res.retries, repaired: s2res.repaired, data: stage2Data });
      } catch (err) {
        clearTimeout(s2Timer);
        const msg = err instanceof Error ? err.message : String(err);
        updateStage('stage2', { status: 'error', error: msg });
        errors.push(`Stage 2: ${msg}`);
        throw err;
      }

      // ── Stage 3 (4 parallel) ─────────────────────────────────────────────────
      updateStage('stage3a', { status: 'running' });
      updateStage('stage3b', { status: 'running' });
      updateStage('stage3c', { status: 'running' });
      updateStage('stage3d', { status: 'running' });

      let stage3Data: { db_schema: unknown; api_schema: unknown; ui_schema: unknown; auth_schema: unknown; } | null = null;
      
      const s3Timer = setTimeout(() => {
        ['stage3a', 'stage3b', 'stage3c', 'stage3d'].forEach(s => {
          updateStage(s as any, { status: 'running', error: 'Retrying with smaller output...' });
        });
      }, 20000);

      try {
        const s3res = await apiCall('/api/stage3', { stage1_output: stage1Data, stage2_output: stage2Data }) as {
          db_schema: unknown; api_schema: unknown; ui_schema: unknown; auth_schema: unknown;
          latency_ms: number;
          sub_latencies: { db: number; api: number; ui: number; auth: number };
          retries: { db: number; api: number; ui: number; auth: number };
          is_mocked?: { db: boolean; api: boolean; ui: boolean; auth: boolean };
          partial_data?: { db: unknown; api: unknown; ui: unknown; auth: unknown };
        };
        clearTimeout(s3Timer);

        stage3Data = { db_schema: s3res.db_schema, api_schema: s3res.api_schema, ui_schema: s3res.ui_schema, auth_schema: s3res.auth_schema };

        evalRun.stages.stage3a = { success: !s3res.is_mocked?.db, latency_ms: s3res.sub_latencies.db, retries: s3res.retries.db };
        evalRun.stages.stage3b = { success: !s3res.is_mocked?.api, latency_ms: s3res.sub_latencies.api, retries: s3res.retries.api };
        evalRun.stages.stage3c = { success: !s3res.is_mocked?.ui, latency_ms: s3res.sub_latencies.ui, retries: s3res.retries.ui };
        evalRun.stages.stage3d = { success: !s3res.is_mocked?.auth, latency_ms: s3res.sub_latencies.auth, retries: s3res.retries.auth };

        updateStage('stage3a', { 
          status: s3res.is_mocked?.db ? 'error' : 'done', 
          latency_ms: s3res.sub_latencies.db, 
          retries: s3res.retries.db, 
          data: s3res.db_schema,
          error: s3res.is_mocked?.db ? "Sub-call terminal failure" : undefined 
        });
        updateStage('stage3b', { 
          status: s3res.is_mocked?.api ? 'error' : 'done', 
          latency_ms: s3res.sub_latencies.api, 
          retries: s3res.retries.api, 
          data: s3res.api_schema,
          error: s3res.is_mocked?.api ? "Sub-call terminal failure" : undefined 
        });
        updateStage('stage3c', { 
          status: s3res.is_mocked?.ui ? 'error' : 'done', 
          latency_ms: s3res.sub_latencies.ui, 
          retries: s3res.retries.ui, 
          data: s3res.ui_schema,
          error: s3res.is_mocked?.ui ? "Sub-call terminal failure" : undefined 
        });
        updateStage('stage3d', { 
          status: s3res.is_mocked?.auth ? 'error' : 'done', 
          latency_ms: s3res.sub_latencies.auth, 
          retries: s3res.retries.auth, 
          data: s3res.auth_schema,
          error: s3res.is_mocked?.auth ? "Sub-call terminal failure" : undefined 
        });
      } catch (err) {
        clearTimeout(s3Timer);
        const msg = err instanceof Error ? err.message : String(err);
        ['stage3a', 'stage3b', 'stage3c', 'stage3d'].forEach((s) => {
          updateStage(s as keyof PipelineState, { status: 'error', error: msg });
        });
        errors.push(`Stage 3: ${msg}`);
        throw err;
      }

      // ── Stage 4 ─────────────────────────────────────────────────────────────
      updateStage('stage4', { status: 'running' });
      const s4Timer = setTimeout(() => {
        updateStage('stage4', { status: 'running', error: 'Retrying with smaller output...' });
      }, 20000);

      try {
        const s4res = await apiCall('/api/stage4', {
          stage1_output: stage1Data,
          stage2_output: stage2Data,
          stage3_output: stage3Data,
        }) as {
          issues_found: number; fixes_applied: number; final_schemas: unknown;
          validation_results: unknown; latency_ms: number; retries: number; repaired: boolean;
        };
        clearTimeout(s4Timer);

        evalRun.stages.stage4 = { success: true, latency_ms: s4res.latency_ms, retries: s4res.retries };
        evalRun.validation = { issues_found: s4res.issues_found, issues_fixed: s4res.fixes_applied };

        updateStage('stage4', {
          status: 'done',
          latency_ms: s4res.latency_ms,
          retries: s4res.retries,
          repaired: s4res.repaired,
          data: { issues_found: s4res.issues_found, fixes_applied: s4res.fixes_applied, validation_results: s4res.validation_results },
        });

        // Store final output for output page
        sessionStorage.setItem('compiler_output', JSON.stringify(s4res.final_schemas));
        sessionStorage.setItem('compiler_validation', JSON.stringify(s4res.validation_results));
      } catch (err) {
        clearTimeout(s4Timer);
        const msg = err instanceof Error ? err.message : String(err);
        updateStage('stage4', { status: 'error', error: msg });
        errors.push(`Stage 4: ${msg}`);
      }

      evalRun.success = errors.length === 0;
      evalRun.errors = errors;
      evalRun.total_latency_ms = Date.now() - startTime;
      saveEvalRun(evalRun);
      setDone(true);
    } catch {
      evalRun.success = false;
      evalRun.errors = errors;
      evalRun.total_latency_ms = Date.now() - startTime;
      saveEvalRun(evalRun);
    } finally {
      setRunning(false);
    }
  }

  const totalProgress = (() => {
    const stages = Object.values(pipeline);
    const done = stages.filter((s) => s.status === 'done').length;
    return Math.round((done / stages.length) * 100);
  })();

  return (
    <div className="page-content" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, marginBottom: 8 }}>Pipeline Execution</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Prompt: &ldquo;{prompt.slice(0, 80)}{prompt.length > 80 ? '…' : ''}&rdquo;
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 700, color: running ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
              {(elapsed / 1000).toFixed(1)}s
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>elapsed</div>
          </div>
        </div>
        <div className="progress">
          <div className="progress-bar" style={{ width: `${totalProgress}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{totalProgress}% complete</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {Object.values(pipeline).filter((s) => s.status === 'done').length}/{Object.values(pipeline).length} stages
          </span>
        </div>
      </div>

      {/* Clarification Alert */}
      {needsClarification && (
        <div className="alert alert-warning" style={{ marginBottom: 24 }}>
          <span>⚠</span>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Ambiguities detected — pipeline continued with assumptions</div>
            <ul style={{ paddingLeft: 16, marginTop: 4 }}>
              {ambiguities.map((a, i) => <li key={i} style={{ fontSize: 13, marginTop: 2 }}>{a}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Stages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <StageCard
          id="stage-1"
          title="Stage 1 — Intent Extraction"
          subtitle="Parse natural language → structured requirements JSON"
          state={pipeline.stage1}
        />

        {/* Pipeline connector */}
        {pipeline.stage1.status === 'done' && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 1, height: 20, background: 'var(--border-accent)' }} />
          </div>
        )}

        <StageCard
          id="stage-2"
          title="Stage 2 — System Architecture"
          subtitle="Convert requirements → full app architecture (entities, workflows, access control)"
          state={pipeline.stage2}
        />

        {pipeline.stage2.status === 'done' && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 1, height: 20, background: 'var(--border-accent)' }} />
          </div>
        )}

        {/* Stage 3 — 4 parallel */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--warning)' }}>Stage 3 — Schema Generation</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>4 parallel LLM calls</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(['stage3a', 'stage3b', 'stage3c', 'stage3d'] as const).map((s) => (
                <span key={s} className={`badge badge-${pipeline[s].status === 'done' ? 'success' : pipeline[s].status === 'error' ? 'error' : pipeline[s].status === 'running' ? 'accent' : 'muted'}`}>
                  {s === 'stage3a' ? 'DB' : s === 'stage3b' ? 'API' : s === 'stage3c' ? 'UI' : 'Auth'}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {[
              { key: 'stage3a' as const, label: '3A · DB Schema', desc: 'PostgreSQL tables, columns, FKs, indexes' },
              { key: 'stage3b' as const, label: '3B · API Schema', desc: 'OpenAPI 3.0 endpoints + auth' },
              { key: 'stage3c' as const, label: '3C · UI Schema', desc: 'Pages, components, data sources' },
              { key: 'stage3d' as const, label: '3D · Auth Rules', desc: 'JWT config, roles, permissions' },
            ].map(({ key, label, desc }) => (
              <div key={key} id={key} className={`pipeline-stage ${pipeline[key].status}`} style={{ padding: 14 }}>
                <div className="stage-header">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {pipeline[key].status === 'running' && <div className="spinner" style={{ width: 14, height: 14 }} />}
                    {pipeline[key].latency_ms && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{(pipeline[key].latency_ms! / 1000).toFixed(1)}s</span>}
                    {pipeline[key].retries !== undefined && pipeline[key].retries! > 0 && <span className="badge badge-warning" style={{ fontSize: 9 }}>{pipeline[key].retries} retry</span>}
                  </div>
                </div>
                {pipeline[key].data != null && <JSONCollapsible data={pipeline[key].data as Record<string, unknown>} label="JSON" />}
              </div>
            ))}
          </div>
        </div>

        {(pipeline.stage3a.status === 'done' || pipeline.stage3b.status === 'done') && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 1, height: 20, background: 'var(--border-accent)' }} />
          </div>
        )}

        <StageCard
          id="stage-4"
          title="Stage 4 — Cross-Layer Validation + Repair"
          subtitle="5 consistency rules checked · Auto-repair if issues found"
          state={pipeline.stage4}
        />
      </div>

      {/* Done CTA */}
      {done && (
        <div className="card card-accent" style={{ marginTop: 32, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>Pipeline Complete!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
            All schemas generated and validated. View the output in the tabs below.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => router.push('/output')}>
              View Output Schemas →
            </button>
            <button className="btn btn-secondary" onClick={() => router.push('/')}>
              New Prompt
            </button>
            <button className="btn btn-ghost" onClick={() => router.push('/eval')}>
              Eval Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
