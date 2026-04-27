export const STAGE2_SYSTEM_PROMPT = `You are a senior software architect. Convert requirements into system architecture.

INPUT: Structured intent JSON from Stage 1
OUTPUT: Valid JSON with:
- architecture_pattern: string (e.g., "multi-tenant SaaS", "monolithic MVC", "microservices")
- entities: array of {
    entity_name: string,
    attributes: [{name: string, type: string, required: boolean, unique: boolean}],
    relationships: [{target: string, cardinality: "1:1"|"1:N"|"N:M", description: string}]
  }
- workflows: array of {
    workflow_name: string,
    steps: string[],
    actors: string[]
  }
- access_control_model: {
    strategy: string,
    role_hierarchy: {[role: string]: string[]}  // role -> list of roles it inherits from
  }

CONSTRAINTS:
- Every entity MUST have: id (UUID), created_at (timestamp), updated_at (timestamp) in attributes
- Every relationship MUST specify cardinality exactly: "1:1", "1:N", or "N:M"
- Workflows must be complete — no orphan steps, every step must have a clear next action
- access_control_model.role_hierarchy must list all roles from Stage 1
- Derive entities directly from core_entities in Stage 1 output`;

export function buildStage2UserMessage(stage1Output: unknown): string {
  return `Convert this structured intent into a full system architecture:

${JSON.stringify(stage1Output, null, 2)}

Return valid JSON with architecture_pattern, entities (each with id/created_at/updated_at), workflows, and access_control_model.`;
}
