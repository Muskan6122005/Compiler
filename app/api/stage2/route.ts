import { NextRequest, NextResponse } from 'next/server';
import { callGroq } from '@/lib/groqClient';
import { ValidationEngine, ValidationResult } from '@/lib/ValidationEngine';
import { STAGE2_SYSTEM_PROMPT, buildStage2UserMessage } from '@/prompts/stage2';
import { Stage2Output } from '@/lib/schemaContracts';

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Missing GROQ_API_KEY in environment' }, { status: 500 });
    }

    const start = Date.now();
    const body = await req.json();
    const { stage1_output, apiKey } = body as { stage1_output: unknown; apiKey?: string };

    if (!stage1_output) {
      return NextResponse.json({ error: 'stage1_output is required' }, { status: 400 });
    }

    const engine = new ValidationEngine(apiKey);

    let result;
    let validated: ValidationResult<Stage2Output> = { 
      success: false, 
      errors: [] as string[], 
      data: null as any, 
      retries: 0, 
      repaired: false 
    };

    try {
      result = await callGroq({
        systemPrompt: STAGE2_SYSTEM_PROMPT,
        userMessage: buildStage2UserMessage(stage1_output),
        temperature: 0.1,
        apiKeyOverride: apiKey,
      });
      validated = await engine.validateJSON<Stage2Output>(result.raw, 'stage2');
    } catch (llmError) {
      console.error('LLM completely failed for Stage 2, bypassing to mock.');
      validated = { success: false, errors: ['LLM Failure'], data: null, retries: 0, repaired: false };
    }

    if (!validated.success || !validated.data) {
      console.error('Validation failed for stage 2, using fallback mock.', validated.errors);
      const mockResult: Stage2Output = {
        architecture_pattern: "Monolithic Next.js",
        entities: [{ entity_name: "Account", attributes: ["id", "balance"], relationships: [] }],
        workflows: [{ workflow_name: "Login Flow", steps: ["Login", "Verify JWT"], actors: ["User"] }],
        access_control_model: "RBAC"
      };

      return NextResponse.json({
        design: mockResult,
        latency_ms: Date.now() - start,
        retries: validated.retries,
        repaired: validated.repaired,
        mocked: true
      });
    }

    return NextResponse.json({
      design: validated.data,
      latency_ms: Date.now() - start,
      retries: validated.retries,
      repaired: validated.repaired,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
