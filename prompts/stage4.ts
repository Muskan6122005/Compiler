export const STAGE4_SYSTEM_PROMPT = `You are a validation engine. Check for inconsistencies across schemas and repair them.

INPUT: All schemas from Stage 3 (db_schema, api_schema, ui_schema, auth_schema)
OUTPUT: Valid JSON with:
- validation_results: {
    is_valid: boolean,
    errors: array of {layer: string, issue: string, severity: "error"|"warning"|"info", suggested_fix: string},
    consistency_checks: {
      "api_fields_in_db": boolean,
      "ui_apis_exist": boolean,
      "auth_roles_consistent": boolean,
      "foreign_keys_valid": boolean,
      "no_orphan_entities": boolean
    }
  }
- issues_found: number
- fixes_applied: number
- final_schemas: {
    db_schema: (corrected db_schema object),
    api_schema: (corrected api_schema object),
    ui_schema: (corrected ui_schema object),
    auth_schema: (corrected auth_schema object)
  }

CHECKS TO PERFORM:
1. API fields in request_schema must exist as columns in the DB schema
2. UI components' data_source_api must match an actual API endpoint path
3. Auth roles referenced in UI required_roles and API required_roles must exist in auth_schema.roles
4. Foreign keys in DB must point to existing tables and columns
5. No orphan entities (every entity in architecture must appear in both DB and API)

IF ERRORS FOUND:
- Attempt automatic repair in the final_schemas output
- If repair impossible, flag in errors array with severity="error"
- Never return schemas with unresolved critical errors
- Document every fix in fixes_applied count`;

export function buildStage4UserMessage(
  stage1Output: unknown,
  stage2Output: unknown,
  stage3aOutput: unknown,
  stage3bOutput: unknown,
  stage3cOutput: unknown,
  stage3dOutput: unknown,
  knownIssues: string[]
): string {
  const issueContext = knownIssues.length > 0
    ? `\n\nKNOWN ISSUES TO FIX (detected by pre-validation):\n${knownIssues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}`
    : '';

  return `Perform cross-layer validation and repair on these schemas:

ORIGINAL INTENT:
${JSON.stringify(stage1Output, null, 2)}

ARCHITECTURE:
${JSON.stringify(stage2Output, null, 2)}

DB SCHEMA:
${JSON.stringify(stage3aOutput, null, 2)}

API SCHEMA:
${JSON.stringify(stage3bOutput, null, 2)}

UI SCHEMA:
${JSON.stringify(stage3cOutput, null, 2)}

AUTH SCHEMA:
${JSON.stringify(stage3dOutput, null, 2)}
${issueContext}

Check all 5 consistency rules. Fix any issues in final_schemas. Return the complete validated and corrected schemas.`;
}
