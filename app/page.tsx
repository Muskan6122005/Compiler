'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const EXAMPLE_PROMPTS = [
  'Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.',
  'E-commerce platform with product catalog, cart, checkout, Stripe integration, and seller dashboard.',
  'Project management tool like Jira with sprints, tickets, team members, and time tracking.',
  'Healthcare patient portal with appointment booking, medical records, and doctor profiles.',
  'EdTech platform with courses, video lessons, quizzes, certificates, and instructor dashboard.',
  'Food delivery app with restaurant listings, ordering, driver tracking, and loyalty points.',
];

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [charCount, setCharCount] = useState(0);

  const handlePromptChange = (val: string) => {
    setPrompt(val);
    setCharCount(val.length);
  };

  const handleRun = () => {
    if (!prompt.trim()) return;
    // Store prompt in sessionStorage for the generate page
    sessionStorage.setItem('compiler_prompt', prompt.trim());
    router.push('/generate');
  };

  return (
    <div className="page-content" style={{ maxWidth: 800, paddingTop: 80 }}>
      {/* Hero */}
      <div style={{ marginBottom: 48, textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          background: 'var(--accent-primary-dim)',
          border: '1px solid var(--border-accent)',
          borderRadius: 100,
          marginBottom: 24,
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent-primary)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          ⚙ 4-Stage AI Pipeline
        </div>
        <h1 style={{ fontSize: 52, marginBottom: 16, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          Natural Language →<br />
          <span style={{ color: 'var(--accent-primary)' }}>Executable Config</span>
        </h1>
        <p style={{ fontSize: 17, color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
          COMPILER parses your product idea through 4 AI stages — intent extraction, system design, 
          schema generation, and cross-layer validation — producing production-ready app configurations.
        </p>
      </div>

      {/* Input Card */}
      <div className="card" style={{ marginBottom: 24, padding: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Product Description
          </label>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {charCount} chars
          </span>
        </div>
        <textarea
          id="prompt-input"
          className="textarea"
          style={{ minHeight: 180, fontSize: 15 }}
          placeholder="Describe your product in detail. Include features, user roles, payment needs, admin capabilities..."
          value={prompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun();
          }}
        />

        {/* Examples */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Examples — click to use
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <button
                key={i}
                id={`example-${i}`}
                className="example-pill"
                onClick={() => handlePromptChange(ex)}
                title={ex}
              >
                {ex.slice(0, 42)}...
              </button>
            ))}
          </div>
        </div>
      </div>



      {/* CTA */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          id="run-pipeline-btn"
          className="btn btn-primary btn-lg"
          onClick={handleRun}
          disabled={!prompt.trim()}
          style={{ flex: 1, fontSize: 15, padding: '14px 24px' }}
        >
          ⚙ Compile Application Config
        </button>
        <button
          className="btn btn-secondary"
          style={{ padding: '14px 18px' }}
          onClick={() => router.push('/eval')}
          title="View Evaluation Dashboard"
        >
          📊 Eval
        </button>
      </div>
      <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        Press <kbd style={{ padding: '2px 6px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}>⌘ Enter</kbd> to run
      </p>

      {/* Pipeline Overview */}
      <div style={{ marginTop: 56 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 20, textAlign: 'center' }}>
          Pipeline Architecture
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { n: '01', label: 'Intent', desc: 'Parse natural language into structured requirements', color: 'var(--accent-primary)' },
            { n: '02', label: 'Design', desc: 'Convert requirements into full system architecture', color: 'var(--info)' },
            { n: '03', label: 'Generate', desc: '4 parallel schemas: DB · API · UI · Auth', color: 'var(--warning)' },
            { n: '04', label: 'Validate', desc: 'Cross-layer consistency checks + auto-repair', color: 'var(--success)' },
          ].map((s) => (
            <div key={s.n} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderTopColor: s.color,
              borderTopWidth: 2,
              borderRadius: 'var(--radius-lg)',
              padding: '16px',
              position: 'relative',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{s.n}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: s.color }}>{s.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
