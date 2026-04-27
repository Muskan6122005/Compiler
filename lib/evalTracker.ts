import { v4 as uuidv4 } from 'uuid';

export interface StageLog {
  success: boolean;
  latency_ms: number;
  retries: number;
  error?: string;
}

export interface EvalRun {
  run_id: string;
  prompt: string;
  timestamp: string;
  stages: {
    stage1?: StageLog;
    stage2?: StageLog;
    stage3a?: StageLog;
    stage3b?: StageLog;
    stage3c?: StageLog;
    stage3d?: StageLog;
    stage4?: StageLog;
  };
  validation: {
    issues_found: number;
    issues_fixed: number;
  };
  total_latency_ms: number;
  success: boolean;
  errors: string[];
}

export interface EvalAggregate {
  total_runs: number;
  success_count: number;
  success_rate: number;
  avg_latency_ms: number;
  total_retries: number;
  top_errors: { error: string; count: number }[];
}

const STORAGE_KEY = 'compiler_eval_runs';
const MAX_STORED = 100;

// Pre-loaded eval prompts (10 real + 10 edge cases)
export const PRESET_PROMPTS = {
  real: [
    'Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments. Admins can see analytics.',
    'E-commerce platform with product catalog, cart, checkout, Stripe integration, and seller dashboard.',
    'Project management tool like Jira with sprints, tickets, team members, and time tracking.',
    'Healthcare patient portal with appointment booking, medical records, doctor profiles, and insurance billing.',
    'Social media platform with posts, stories, DMs, follow system, and ad-based monetization.',
    'EdTech platform with courses, video lessons, quizzes, certificates, and instructor dashboard.',
    'Food delivery app with restaurant listings, ordering, driver tracking, and loyalty points.',
    'HR management system with employee profiles, leave management, payroll, and org chart.',
    'Real estate marketplace with property listings, virtual tours, agent profiles, and mortgage calculator.',
    'Fitness app with workout plans, progress tracking, nutrition log, and premium coaching subscription.',
  ],
  edge: [
    'Build me something cool',
    'Make an app with login but also no login required',
    'Social network',
    'App with users',
    'CRM with both free and premium, but all features free for premium users',
    'Build Uber but also Airbnb in one app',
    'Todo app',
    'Platform that uses blockchain and AI and VR simultaneously',
    'E-commerce with no products',
    'Dashboard',
  ],
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function createEvalRun(prompt: string): EvalRun {
  return {
    run_id: uuidv4(),
    prompt,
    timestamp: new Date().toISOString(),
    stages: {},
    validation: { issues_found: 0, issues_fixed: 0 },
    total_latency_ms: 0,
    success: false,
    errors: [],
  };
}

export function saveEvalRun(run: EvalRun): void {
  if (!isBrowser()) return;
  const existing = getEvalRuns();
  const updated = [run, ...existing].slice(0, MAX_STORED);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Storage full — remove oldest
    const trimmed = updated.slice(0, Math.floor(MAX_STORED / 2));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }
}

export function getEvalRuns(): EvalRun[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EvalRun[]) : [];
  } catch {
    return [];
  }
}

export function clearEvalRuns(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getAggregate(runs: EvalRun[]): EvalAggregate {
  if (runs.length === 0) {
    return { total_runs: 0, success_count: 0, success_rate: 0, avg_latency_ms: 0, total_retries: 0, top_errors: [] };
  }

  const success_count = runs.filter((r) => r.success).length;
  const avg_latency_ms = Math.round(runs.reduce((s, r) => s + r.total_latency_ms, 0) / runs.length);

  const total_retries = runs.reduce((sum, r) => {
    return sum + Object.values(r.stages).reduce((s, stage) => s + (stage?.retries ?? 0), 0);
  }, 0);

  const errorCounts: Record<string, number> = {};
  for (const run of runs) {
    for (const err of run.errors) {
      const key = err.slice(0, 60);
      errorCounts[key] = (errorCounts[key] ?? 0) + 1;
    }
  }
  const top_errors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([error, count]) => ({ error, count }));

  return {
    total_runs: runs.length,
    success_count,
    success_rate: Math.round((success_count / runs.length) * 100),
    avg_latency_ms,
    total_retries,
    top_errors,
  };
}

// Export eval runs as CSV
export function exportAsCSV(runs: EvalRun[]): string {
  const headers = ['Run ID', 'Prompt', 'Success', 'Total Latency (ms)', 'Stage1 Retries', 'Stage2 Retries', 'Stage3 Retries', 'Stage4 Retries', 'Issues Found', 'Issues Fixed', 'Errors', 'Timestamp'];
  const rows = runs.map((r) => [
    r.run_id,
    `"${r.prompt.replace(/"/g, '""')}"`,
    r.success ? 'true' : 'false',
    r.total_latency_ms,
    r.stages.stage1?.retries ?? 0,
    r.stages.stage2?.retries ?? 0,
    (r.stages.stage3a?.retries ?? 0) + (r.stages.stage3b?.retries ?? 0) + (r.stages.stage3c?.retries ?? 0) + (r.stages.stage3d?.retries ?? 0),
    r.stages.stage4?.retries ?? 0,
    r.validation.issues_found,
    r.validation.issues_fixed,
    `"${r.errors.join(' | ').replace(/"/g, '""')}"`,
    r.timestamp,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
