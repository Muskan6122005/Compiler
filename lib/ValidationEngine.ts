import { ZodSchema, ZodError } from 'zod';
import { repairWithGroq } from './groqClient';
import {
  Stage1Schema, Stage2Schema, Stage3ASchema, Stage3BSchema,
  Stage3CSchema, Stage3DSchema, Stage4Schema,
  Stage3AOutput, Stage3BOutput, Stage3COutput, Stage3DOutput,
} from './schemaContracts';

export interface ValidationResult<T> {
  success: boolean;
  data: T | null;
  errors: string[];
  repaired: boolean;
  retries: number;
}

export interface CrossLayerIssue {
  rule: string;
  layer: string;
  issue: string;
  severity: 'error' | 'warning';
  autoFixed: boolean;
}

const STAGE_SCHEMAS: Record<string, ZodSchema> = {
  stage1: Stage1Schema,
  stage2: Stage2Schema,
  stage3a: Stage3ASchema,
  stage3b: Stage3BSchema,
  stage3c: Stage3CSchema,
  stage3d: Stage3DSchema,
  stage4: Stage4Schema,
};

const STAGE_DESCRIPTIONS: Record<string, string> = {
  stage1: 'Intent extraction: app_type, core_entities, user_roles, features, business_rules',
  stage2: 'System architecture: architecture_pattern, entities, workflows, access_control_model',
  stage3a: 'Database schema: tables with columns, indexes, foreign keys',
  stage3b: 'API schema: endpoints with method, auth, request/response schemas',
  stage3c: 'UI schema: pages with routes, components, data_source_api mappings',
  stage3d: 'Auth schema: auth_strategy, roles, permission_model, rate_limits',
  stage4: 'Validation results: issues_found, fixes_applied, final_schemas',
};

export class ValidationEngine {
  private apiKeyOverride?: string;

  constructor(apiKeyOverride?: string) {
    this.apiKeyOverride = apiKeyOverride;
  }

  // Parse raw string → validated object, with LLM repair on failure
  async validateJSON<T>(
    raw: string,
    stage: string,
    maxRetries = 3
  ): Promise<ValidationResult<T>> {
    const schema = STAGE_SCHEMAS[stage];
    if (!schema) throw new Error(`Unknown stage: ${stage}`);

    let parsed: unknown;
    let retries = 0;
    let repaired = false;
    let lastError = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt === 0) {
          // Try regex-extracting JSON if wrapped in markdown
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('No JSON object found in response');
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          // LLM repair on subsequent attempts
          repaired = true;
          retries++;
          parsed = await repairWithGroq(
            raw,
            lastError,
            STAGE_DESCRIPTIONS[stage],
            this.apiKeyOverride
          );
        }

        const result = schema.safeParse(parsed);
        if (result.success) {
          return { success: true, data: result.data as T, errors: [] as string[], repaired, retries };
        }

        lastError = this.formatZodError(result.error);
        raw = JSON.stringify(parsed, null, 2); // Use parsed (but schema-invalid) for next repair
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      success: false,
      errors: [lastError],
      repaired,
      retries,
    };
  }

  // Check required fields are present (Zod-based, per stage)
  checkRequiredFields(obj: unknown, stage: string): { valid: boolean; missing: string[] } {
    const schema = STAGE_SCHEMAS[stage];
    if (!schema) return { valid: false, missing: [`Unknown stage: ${stage}`] };

    const result = schema.safeParse(obj);
    if (result.success) return { valid: true, missing: [] };

    const missing = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    return { valid: false, missing };
  }

  // Cross-layer consistency checks (5 rules)
  crossLayerCheck(schemas: {
    db_schema: Stage3AOutput;
    api_schema: Stage3BOutput;
    ui_schema: Stage3COutput;
    auth_schema: Stage3DOutput;
  }): CrossLayerIssue[] {
    const issues: CrossLayerIssue[] = [];
    const { db_schema, api_schema, ui_schema, auth_schema } = schemas;

    // Defensive array extraction
    const tables = Array.isArray(db_schema?.tables) ? db_schema.tables : [];
    const endpoints = Array.isArray(api_schema?.endpoints) ? api_schema.endpoints : [];
    const pages = Array.isArray(ui_schema?.pages) ? ui_schema.pages : [];
    const roles_list = Array.isArray(auth_schema?.roles) ? auth_schema.roles : [];

    // Build lookup sets
    const dbTables = new Set(tables.map((t) => t.table_name));
    const dbColumns = new Map<string, Set<string>>();
    for (const table of tables) {
      const columns = Array.isArray(table.columns) ? table.columns : [];
      dbColumns.set(table.table_name, new Set(columns.map((c) => c.name)));
    }

    const apiPaths = new Set(endpoints.map((e) => e.path));
    const authRoles = new Set(roles_list.map((r) => r.role_name));

    // ── Rule 1: Every UI component data_source_api must match an API endpoint
    for (const page of pages) {
      const components = Array.isArray(page.components) ? page.components : [];
      for (const component of components) {
        if (component.data_source_api && !apiPaths.has(component.data_source_api)) {
          issues.push({
            rule: 'UI→API mapping',
            layer: 'ui_schema',
            issue: `Component in "${page.page_name}" references API path "${component.data_source_api}" which does not exist`,
            severity: 'error',
            autoFixed: false,
          });
        }
      }
    }

    // ── Rule 2: Every API request field must exist in DB schema
    for (const endpoint of endpoints) {
      const reqFields = Object.keys(endpoint.request_schema || {});
      for (const field of reqFields) {
        // Check if field exists in any table column
        let found = false;
        for (const [, cols] of dbColumns) {
          if (cols.has(field)) { found = true; break; }
        }
        if (!found && field !== 'id' && field !== 'page' && field !== 'limit' && field !== 'search') {
          issues.push({
            rule: 'API→DB field mapping',
            layer: 'api_schema',
            issue: `Endpoint "${endpoint.method} ${endpoint.path}" has request field "${field}" not found in any DB table`,
            severity: 'warning',
            autoFixed: false,
          });
        }
      }
    }

    // ── Rule 3: Every role in API endpoints must exist in Auth config
    for (const endpoint of endpoints) {
      const roles = (endpoint as any).required_roles ?? (endpoint as any).roles ?? (endpoint as any).allowed_roles ?? [];
      const rolesArray = Array.isArray(roles) ? roles : [];
      for (const role of rolesArray) {
        if (!authRoles.has(role) && role !== 'public') {
          issues.push({
            rule: 'API→Auth role consistency',
            layer: 'api_schema',
            issue: `Endpoint "${endpoint.method} ${endpoint.path}" requires role "${role}" not defined in auth config`,
            severity: 'error',
            autoFixed: false,
          });
        }
      }
    }

    // ── Rule 4: Every foreign key must point to a real table+column
    for (const table of tables) {
      const columns = Array.isArray(table.columns) ? table.columns : [];
      for (const col of columns) {
        if (col.references) {
          const [refTable, refCol] = col.references.split('.');
          if (!dbTables.has(refTable)) {
            issues.push({
              rule: 'FK→Table existence',
              layer: 'db_schema',
              issue: `Column "${table.table_name}.${col.name}" references non-existent table "${refTable}"`,
              severity: 'error',
              autoFixed: false,
            });
          } else if (refCol && !dbColumns.get(refTable)?.has(refCol)) {
            issues.push({
              rule: 'FK→Column existence',
              layer: 'db_schema',
              issue: `Column "${table.table_name}.${col.name}" references non-existent column "${refTable}.${refCol}"`,
              severity: 'error',
              autoFixed: false,
            });
          }
        }
      }
    }

    // ── Rule 5: No endpoint accessible without auth unless explicitly public
    for (const endpoint of endpoints) {
      const roles = (endpoint as any).required_roles ?? (endpoint as any).roles ?? (endpoint as any).allowed_roles ?? [];
      const rolesArray = Array.isArray(roles) ? roles : [];
      if (
        !endpoint.auth_required &&
        rolesArray.length > 0 &&
        !rolesArray.includes('public')
      ) {
        issues.push({
          rule: 'Auth enforcement',
          layer: 'api_schema',
          issue: `Endpoint "${endpoint.method} ${endpoint.path}" has required_roles but auth_required=false`,
          severity: 'error',
          autoFixed: false,
        });
      }
    }

    return issues;
  }

  // Targeted repair: ONLY pass broken sub-schema + error, max 3 retries
  async repairSchema(
    broken: unknown,
    error: string,
    stage: string
  ): Promise<{ data: unknown; retries: number }> {
    const MAX_RETRIES = 3;
    let current = JSON.stringify(broken, null, 2);
    let retries = 0;

    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const repaired = await repairWithGroq(
          current,
          error,
          STAGE_DESCRIPTIONS[stage],
          this.apiKeyOverride
        );
        const schema = STAGE_SCHEMAS[stage];
        if (schema) {
          const result = schema.safeParse(repaired);
          if (result.success) return { data: result.data, retries: i + 1 };
          error = this.formatZodError(result.error);
          current = JSON.stringify(repaired, null, 2);
        } else {
          return { data: repaired, retries: i + 1 };
        }
        retries = i + 1;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        retries = i + 1;
      }
    }

    throw new Error(`Repair failed after ${MAX_RETRIES} retries for ${stage}: ${error}`);
  }

  private formatZodError(error: ZodError): string {
    return error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
  }
}
