import { NextRequest, NextResponse } from 'next/server';
import { callGroq } from '@/lib/groqClient';
import { ValidationEngine, ValidationResult } from '@/lib/ValidationEngine';
import { STAGE4_SYSTEM_PROMPT, buildStage4UserMessage } from '@/prompts/stage4';
import { Stage4Output, Stage3AOutput, Stage3BOutput, Stage3COutput, Stage3DOutput } from '@/lib/schemaContracts';

export async function POST(req: NextRequest) {
  try {
    // 1. Env Guard
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Missing GROQ_API_KEY in environment' }, { status: 500 });
    }

    const start = Date.now();
    const body = await req.json();
    const { stage1_output, stage2_output, stage3_output, apiKey } = body as {
      stage1_output: unknown;
      stage2_output: unknown;
      stage3_output: {
        db_schema: Stage3AOutput;
        api_schema: Stage3BOutput;
        ui_schema: Stage3COutput;
        auth_schema: Stage3DOutput;
      };
      apiKey?: string;
    };

    const engine = new ValidationEngine(apiKey);

    // 2. Perform Cross-Layer pre-check to identify consistency issues
    const preCheckIssues = engine.crossLayerCheck(stage3_output);
    const knownIssues = preCheckIssues.map(
      (i) => `[${i.severity.toUpperCase()}] ${i.rule}: ${i.issue}`
    );

    // 3. Call Stage 4 LLM to perform global validation and final schema polish
    let result;
    let validated: ValidationResult<Stage4Output> = { 
      success: false, 
      errors: [] as string[], 
      data: null as any, 
      retries: 0, 
      repaired: false 
    };

    try {
      result = await callGroq({
        systemPrompt: STAGE4_SYSTEM_PROMPT,
        userMessage: buildStage4UserMessage(
          stage1_output,
          stage2_output,
          stage3_output,
          knownIssues
        ),
        temperature: 0.1,
        apiKeyOverride: apiKey,
        maxRetries: 1, // Rapid check/polish stage
      });
      validated = await engine.validateJSON<Stage4Output>(result.raw, 'stage4');
    } catch (llmError) {
      console.error('LLM completely failed for Stage 4, bypassing to best-effort pre-check results.');
    }

    // 4. Construct Final Response
    // If Stage 4 succeeded, use its output. 
    // If it failed/timed out, use the original Stage 3 output with the pre-check issues attached.
    if (validated.success && validated.data) {
      return NextResponse.json({
        ...validated.data,
        latency_ms: Date.now() - start,
        retries: validated.retries,
        repaired: validated.repaired,
        source: 'llm_optimized'
      });
    }

    // Fallback: Best effort result using original schemas + pre-check validation nodes
    return NextResponse.json({
      issues_found: preCheckIssues.length,
      fixes_applied: 0,
      final_schemas: stage3_output,
      validation_results: {
        is_valid: false,
        raw_issues: preCheckIssues.map(i => ({
          rule: i.rule,
          layer: i.layer,
          issue: i.issue,
          severity: i.severity,
          suggested_fix: 'Automatic verification identified potential inconsistency.'
        })),
        consistency_checks: {
          api_fields_in_db: !preCheckIssues.some(i => i.rule === 'API→DB field mapping'),
          ui_apis_exist: !preCheckIssues.some(i => i.rule === 'UI→API mapping'),
          auth_roles_consistent: !preCheckIssues.some(i => i.rule === 'API→Auth role consistency'),
          foreign_keys_valid: !preCheckIssues.some(i => i.rule.startsWith('FK')),
          no_orphan_entities: true
        }
      },
      latency_ms: Date.now() - start,
      retries: validated.retries,
      stage4_error: validated.errors,
      source: 'fallback_best_effort'
    });

  } catch (err) {
    console.error('Fatal error in /api/stage4:', err);
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : String(err),
      step: 'api_handler_root'
    }, { status: 500 });
  }
}
