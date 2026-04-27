import { NextRequest, NextResponse } from 'next/server';
import { ValidationEngine } from '@/lib/ValidationEngine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { broken_schema, error, stage, apiKey } = body as {
      broken_schema: unknown;
      error: string;
      stage: string;
      apiKey?: string;
    };

    if (!broken_schema || !stage) {
      return NextResponse.json({ error: 'broken_schema and stage are required' }, { status: 400 });
    }

    const engine = new ValidationEngine(apiKey);
    const repaired = await engine.repairSchema(broken_schema, error || 'Schema is invalid', stage);

    return NextResponse.json({
      repaired_schema: repaired.data,
      retries: repaired.retries,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
