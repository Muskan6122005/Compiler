// Stage 3 has 4 parallel sub-prompts: DB, API, UI, Auth

// ─── 3A: Database Schema ──────────────────────────────────────────────────────
export const STAGE3A_SYSTEM_PROMPT = `Generate PostgreSQL-compatible database schema.

INPUT: Architecture JSON from Stage 2
OUTPUT: Valid JSON with:
- tables: array of {
    table_name: string,
    columns: [{name: string, type: string, constraints: string[], references: string}],
    indexes: string[],
    unique_constraints: string[]
  }

RULES:
- Use snake_case for ALL names
- Every table MUST have: id (UUID, PRIMARY KEY), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ), deleted_at (TIMESTAMPTZ nullable - for soft deletes)
- Foreign keys must reference existing tables using format "table_name.column_name"
- Soft deletes via deleted_at column (not hard DELETE)
- Indexes on foreign key columns and frequently queried fields
- Use PostgreSQL types: UUID, VARCHAR(255), TEXT, INTEGER, BIGINT, DECIMAL, BOOLEAN, TIMESTAMPTZ, JSONB
- constraints array values: "NOT NULL", "UNIQUE", "PRIMARY KEY", "DEFAULT now()"`;

export function buildStage3AUserMessage(stage2Output: unknown): string {
  return `Generate a complete PostgreSQL database schema from this architecture:

${JSON.stringify(stage2Output, null, 2)}

Return valid JSON with tables array. All tables must have id (UUID), created_at, updated_at, deleted_at. Use snake_case everywhere. Foreign keys as "table.column" in references field.`;
}

// ─── 3B: API Schema ───────────────────────────────────────────────────────────
export const STAGE3B_SYSTEM_PROMPT = `Generate RESTful API specification (OpenAPI 3.0 compatible).

INPUT: Architecture JSON + Database Schema
OUTPUT: Valid JSON with:
- endpoints: array of {
    path: string (e.g., "/api/users"),
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    auth_required: boolean,
    required_roles: string[],
    request_schema: {[field: string]: {type: string, required: boolean}},
    response_schema: {[field: string]: string},
    validation_rules: {[field: string]: string},
    status_codes: {[code: string]: string},
    rate_limit: {requests_per_minute: number, requests_per_hour: number}
  }

RULES:
- Generate a complete REST API with ALL required endpoints for every entity and page in the system design. 
- You MUST generate a minimum of 10-15 endpoints.
- Request fields MUST map to database columns that exist in the DB schema
- Include proper HTTP status codes: 200 (success), 201 (created), 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), 429 (rate limited), 500 (server error)
- Rate limiting metadata per endpoint
- Admin endpoints: 30 req/min. User endpoints: 60 req/min. Public endpoints: 100 req/min
- Every entity needs at minimum: GET list, GET by id, POST create, PUT update, DELETE (soft)
- auth_required must be true for all non-public endpoints`;

export function buildStage3BUserMessage(stage2Output: unknown, stage3aOutput: unknown): string {
  return `Generate a complete REST API schema for this app. Include ALL CRUD endpoints for every entity plus auth endpoints. You MUST generate at minimum 10 endpoints. Do not generate a health check only.

ARCHITECTURE:
${JSON.stringify(stage2Output, null, 2)}

DATABASE SCHEMA:
${JSON.stringify(stage3aOutput, null, 2)}

Return valid JSON with endpoints array. Each endpoint must have: path, method, auth_required, required_roles (array), request_schema, response_schema, validation_rules, status_codes, rate_limit.`;
}

// ─── 3C: UI Schema ────────────────────────────────────────────────────────────
export const STAGE3C_SYSTEM_PROMPT = `Generate UI component schema for a React-like framework.

INPUT: Architecture JSON + API Schema
OUTPUT: Valid JSON with:
- pages: array of {
    page_name: string,
    route: string (e.g., "/dashboard"),
    required_roles: string[],
    components: array of {
      type: string (e.g., "DataTable", "Form", "Card", "Chart", "Button"),
      props: {[key: string]: any},
      data_source_api: string (must match an exact API endpoint path),
      validations: string[],
      loading_state: string,
      error_state: string
    }
  }

RULES:
- Every form component MUST have data_source_api pointing to a POST/PUT API endpoint
- Every table/list component MUST have data_source_api pointing to a GET API endpoint
- Every CRUD entity needs: list page, detail page, create/edit form
- Include loading and error states for every component
- data_source_api MUST be an exact path from the API schema endpoints
- required_roles must match roles defined in the architecture
CONCISENESS RULES:
- Be extremely concise. Maximum 800 tokens. Output only essential fields.
- Do not add optional descriptions.`;

export function buildStage3CUserMessage(stage2Output: unknown, stage3bOutput: unknown): string {
  return `Generate a complete UI component schema from this architecture and API specification:

ARCHITECTURE:
${JSON.stringify(stage2Output, null, 2)}

API SCHEMA:
${JSON.stringify(stage3bOutput, null, 2)}

Return valid JSON with pages array. Every component must have data_source_api matching an exact API endpoint path. Include loading_state and error_state for every component.`;
}

// ─── 3D: Auth Schema ─────────────────────────────────────────────────────────
export const STAGE3D_SYSTEM_PROMPT = `Generate authentication and authorization configuration.

INPUT: Architecture JSON + User Roles
OUTPUT: Valid JSON with:
- auth_strategy: "JWT" | "Session" | "OAuth"
- roles: array of {role_name: string, permissions: string[]}
- permission_model: array of {
    resource: string,
    action: "create" | "read" | "update" | "delete" | "manage",
    allowed_roles: string[]
  }
- rate_limits: {
    global: {requests_per_minute: number},
    by_role: {[role: string]: {requests_per_minute: number, requests_per_hour: number}},
    auth_endpoints: {requests_per_minute: number}
  }

RULES:
- admin role MUST have full access (manage action) on all resources
- Guest/unauthenticated users have NO write access
- Premium features MUST be explicitly gated (payment_required in permissions)
- JWT expiry: 24h access token, 7d refresh token
- Include all roles from the architecture access_control_model
- Every resource from the DB schema must appear in permission_model
CONCISENESS RULES:
- Be extremely concise. Maximum 800 tokens. Output only essential fields.
- Do not add optional descriptions.`;

export function buildStage3DUserMessage(stage2Output: unknown, stage1Output: unknown): string {
  return `Generate complete authentication and authorization configuration from this architecture:

ARCHITECTURE:
${JSON.stringify(stage2Output, null, 2)}

ORIGINAL REQUIREMENTS (for role context):
${JSON.stringify(stage1Output, null, 2)}

Return valid JSON with auth_strategy (JWT recommended), roles array with all permissions, permission_model for every resource/action combo, and rate_limits by role.`;
}
