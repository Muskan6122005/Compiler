import Groq from 'groq-sdk';

const JSON_ONLY_SYSTEM_PROMPT = `You are a JSON-only output engine. Respond ONLY with valid JSON. No markdown, no explanation, no preamble. Start with { and end with }`;

function getGroqClient(apiKeyOverride?: string): Groq {
  const key = apiKeyOverride || process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY is not set');
  return new Groq({ apiKey: key });
}

export interface GroqCallOptions {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  apiKeyOverride?: string;
  maxRetries?: number;
  maxTokens?: number;
}

export interface GroqCallResult {
  data: Record<string, unknown>;
  raw: string;
  retries: number;
  latency_ms: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callGroq(options: GroqCallOptions): Promise<GroqCallResult> {
  const {
    systemPrompt,
    userMessage,
    temperature = 0.1,
    apiKeyOverride,
    maxRetries = 2,
    maxTokens = 1500,
  } = options;

  const client = getGroqClient(apiKeyOverride);
  const start = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(Math.pow(2, attempt) * 500);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const completion = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        temperature,
        messages: [
          { role: 'system', content: JSON_ONLY_SYSTEM_PROMPT + '\n\n' + systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
      }, { signal: controller.signal });

      clearTimeout(timeoutId);
      const raw = completion.choices[0]?.message?.content ?? '';
      const trimmed = raw.trim();

      // Extract JSON even if model adds noise around it
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error(`No JSON object found in response: ${trimmed.slice(0, 200)}`);

      const data = JSON.parse(jsonMatch[0]);
      return { data, raw: jsonMatch[0], retries: attempt, latency_ms: Date.now() - start };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err : new Error(String(err));
      // Rate limit or timeout — wait longer before retry
      if (lastError.name === 'AbortError' || lastError.message.includes('429') || lastError.message.includes('rate')) {
        await sleep(2000 * (attempt + 1));
      }
    }
  }

  throw new Error(`Groq call failed after ${maxRetries} retries: ${lastError?.message}`);
}

export async function repairWithGroq(
  brokenContent: string,
  error: string,
  stageDescription: string,
  apiKeyOverride?: string
): Promise<Record<string, unknown>> {
  const result = await callGroq({
    systemPrompt: `You are a JSON repair engine. You will receive broken or invalid JSON and an error message. 
Fix ONLY the issues described. Return the corrected valid JSON. 
Stage context: ${stageDescription}`,
    userMessage: `BROKEN JSON:\n${brokenContent}\n\nERROR:\n${error}\n\nReturn the fixed valid JSON:`,
    temperature: 0.1,
    apiKeyOverride,
    maxRetries: 2,
  });
  return result.data;
}
