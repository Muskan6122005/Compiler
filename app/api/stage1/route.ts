import { NextRequest, NextResponse } from 'next/server';
import { callGroq } from '@/lib/groqClient';
import { ValidationEngine } from '@/lib/ValidationEngine';
import { STAGE1_SYSTEM_PROMPT, buildStage1UserMessage } from '@/prompts/stage1';
import { Stage1Output } from '@/lib/schemaContracts';

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Missing GROQ_API_KEY in environment' }, { status: 500 });
    }

    const start = Date.now();
    const body = await req.json();
    const { prompt, apiKey } = body as { prompt: string; apiKey?: string };

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const engine = new ValidationEngine(apiKey);

    // Call Groq
    let result;
    let validated = { success: false, errors: [] as string[], data: null as Stage1Output | null, retries: 0, repaired: false };

    try {
      result = await callGroq({
        systemPrompt: STAGE1_SYSTEM_PROMPT,
        userMessage: buildStage1UserMessage(prompt),
        temperature: 0.1,
        apiKeyOverride: apiKey,
      });
      validated = await engine.validateJSON<Stage1Output>(result.raw, 'stage1');
    } catch (llmError) {
      console.error('LLM completely failed for Stage 1, bypassing to mock.');
      validated = { success: false, errors: ['LLM Failure'], data: null, retries: 0, repaired: false };
    }

    if (!validated.success || !validated.data) {
      console.error('Validation failed for stage 1, using fallback mock.', validated.errors);
      const mockResult: Stage1Output = {
        app_type: "CRM System",
        core_entities: [{ name: "User", description: "System user", relationships: [] }],
        user_roles: [{ role_name: "admin", permissions_level: "High" }],
        features: [{ feature_name: "Login", description: "User authentication", required_roles: [] }],
        business_rules: ["Users must login"],
        payment_features: false,
        analytics_features: false,
        ambiguities: []
      };

      return NextResponse.json({
        intent: mockResult,
        latency_ms: Date.now() - start,
        retries: validated.retries,
        repaired: validated.repaired,
        needs_clarification: false,
        mocked: true
      });
    }

    const latency_ms = Date.now() - start;
    return NextResponse.json({
      intent: validated.data,
      latency_ms,
      retries: validated.retries,
      repaired: validated.repaired,
      needs_clarification: (validated.data as Stage1Output).ambiguities.length > 0,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

