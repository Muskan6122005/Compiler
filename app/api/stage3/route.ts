import { NextRequest, NextResponse } from 'next/server';
import { callGroq } from '@/lib/groqClient';
import { ValidationEngine } from '@/lib/ValidationEngine';
import {
  STAGE3A_SYSTEM_PROMPT, buildStage3AUserMessage,
  STAGE3B_SYSTEM_PROMPT, buildStage3BUserMessage,
  STAGE3C_SYSTEM_PROMPT, buildStage3CUserMessage,
  STAGE3D_SYSTEM_PROMPT, buildStage3DUserMessage,
} from '@/prompts/stage3';
import { Stage3AOutput, Stage3BOutput, Stage3COutput, Stage3DOutput } from '@/lib/schemaContracts';

export async function POST(req: NextRequest) {
  console.log('stage3 called');
  const start = Date.now();

  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Missing GROQ_API_KEY in environment' }, { status: 500 });
    }

    const body = await req.json();
    const { stage1_output, stage2_output, apiKey } = body as {
      stage1_output: any;
      stage2_output: any;
      apiKey?: string;
    };

    const engine = new ValidationEngine(apiKey);

    // Initial simple results objects
    let db_schema: any = null;
    let api_schema: any = null;
    let ui_schema: any = null;
    let auth_schema: any = null;

    let db_retries = 0;
    let api_retries = 0;
    let ui_retries = 0;
    let auth_retries = 0;

    // ─── 3A: DB ─────────────────────────────────────────────────────────────
    try {
      const raw = await callGroq({ 
        systemPrompt: STAGE3A_SYSTEM_PROMPT, 
        userMessage: buildStage3AUserMessage(stage2_output), 
        temperature: 0.1, 
        apiKeyOverride: apiKey 
      });
      const v = await engine.validateJSON<Stage3AOutput>(raw.raw, 'stage3a');
      db_schema = v.data;
      db_retries = v.retries;
    } catch (e) {
      console.error('Stage 3A failed:', e);
      db_schema = { tables: [{ table_name: 'users', columns: [{ name: 'id', type: 'uuid' }] }] };
    }

    // ─── 3B: API Schema ────────────────────────────────────────────────────────────
    try {
      const raw = await callGroq({ 
        systemPrompt: STAGE3B_SYSTEM_PROMPT, 
        userMessage: buildStage3BUserMessage(stage2_output, db_schema), 
        temperature: 0.1, 
        apiKeyOverride: apiKey,
        maxTokens: 2000
      });
      const v = await engine.validateJSON<Stage3BOutput>(raw.raw, 'stage3b');
      api_schema = v.data;
      api_retries = v.retries;
    } catch (e) {
      console.error('Stage 3B failed:', e);
      api_schema = { endpoints: [{ method: 'GET', path: '/api/health', auth_required: false, response_schema: { status: 'string' } }] };
    }

    // ─── 3C: UI ─────────────────────────────────────────────────────────────
    try {
      const raw = await callGroq({ 
        systemPrompt: STAGE3C_SYSTEM_PROMPT, 
        userMessage: buildStage3CUserMessage(stage2_output, api_schema), 
        temperature: 0.1, 
        apiKeyOverride: apiKey 
      });
      const v = await engine.validateJSON<Stage3COutput>(raw.raw, 'stage3c');
      ui_schema = v.data;
      ui_retries = v.retries;
    } catch (e) {
      console.error('Stage 3C failed:', e);
      ui_schema = { pages: [{ page_name: 'Dashboard', route: '/', components: [{ type: 'Text', props: { text: 'Welcome' } }] }] };
    }

    // ─── 3D: Auth ───────────────────────────────────────────────────────────
    try {
      const raw = await callGroq({ 
        systemPrompt: STAGE3D_SYSTEM_PROMPT, 
        userMessage: buildStage3DUserMessage(stage2_output, stage1_output), 
        temperature: 0.1, 
        apiKeyOverride: apiKey 
      });
      const v = await engine.validateJSON<Stage3DOutput>(raw.raw, 'stage3d');
      auth_schema = v.data;
      auth_retries = v.retries;
    } catch (e) {
      console.error('Stage 3D failed:', e);
      auth_schema = { auth_strategy: 'JWT', roles: [{ role_name: 'admin', permissions: ['manage'] }], permission_model: [{ resource: 'all', action: 'manage', allowed_roles: ['admin'] }], rate_limits: {} };
    }

    return NextResponse.json({
      db_schema,
      api_schema,
      ui_schema,
      auth_schema,
      latency_ms: Date.now() - start,
      sub_latencies: { db: 0, api: 0, ui: 0, auth: 0 },
      retries: {
        db: db_retries,
        api: api_retries,
        ui: ui_retries,
        auth: auth_retries,
      }
    });

  } catch (err) {
    console.error('Fatal error in /api/stage3:', err);
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : String(err) 
    }, { status: 500 });
  }
}
