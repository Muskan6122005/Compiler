import { z } from 'zod';

// ─── Stage 1: Intent Extraction ───────────────────────────────────────────────
export const CoreEntitySchema = z.object({
  name: z.string(),
  description: z.string(),
  relationships: z.array(z.string()).default([]),
});

export const UserRoleSchema = z.object({
  role_name: z.string(),
  permissions_level: z.string(),
});

export const FeatureSchema = z.object({
  feature_name: z.string(),
  description: z.string(),
  required_roles: z.array(z.string()).default([]),
});

export const Stage1Schema = z.object({
  app_type: z.string(),
  core_entities: z.array(CoreEntitySchema).min(1),
  user_roles: z.array(UserRoleSchema).min(1),
  features: z.array(FeatureSchema).min(1),
  business_rules: z.array(z.string()).default([]),
  payment_features: z.boolean(),
  analytics_features: z.boolean(),
  ambiguities: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
});

export type Stage1Output = z.infer<typeof Stage1Schema>;

// ─── Stage 2: System Architecture ─────────────────────────────────────────────
export const EntityAttributeSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean().default(true),
  unique: z.boolean().default(false),
});

export const EntityRelationshipSchema = z.object({
  target: z.string(),
  cardinality: z.enum(['1:1', '1:N', 'N:M']),
  description: z.string(),
});

export const ArchitectureEntitySchema = z.object({
  entity_name: z.string(),
  attributes: z.array(EntityAttributeSchema),
  relationships: z.array(EntityRelationshipSchema).default([]),
});

export const WorkflowSchema = z.object({
  workflow_name: z.string(),
  steps: z.array(z.string()).min(1),
  actors: z.array(z.string()).default([]),
});

export const AccessControlSchema = z.object({
  strategy: z.string(),
  role_hierarchy: z.record(z.string(), z.array(z.string())),
});

export const Stage2Schema = z.object({
  architecture_pattern: z.string(),
  entities: z.array(ArchitectureEntitySchema).min(1),
  workflows: z.array(WorkflowSchema).min(1),
  access_control_model: AccessControlSchema,
});

export type Stage2Output = z.infer<typeof Stage2Schema>;

// ─── Stage 3A: DB Schema ───────────────────────────────────────────────────────
export const ColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  constraints: z.array(z.string()).default([]),
  references: z.string().optional(),
});

export const TableSchema = z.object({
  table_name: z.string(),
  columns: z.array(ColumnSchema).min(1),
  indexes: z.array(z.string()).default([]),
  unique_constraints: z.array(z.string()).default([]),
});

export const Stage3ASchema = z.object({
  tables: z.array(TableSchema).min(1),
});

export type Stage3AOutput = z.infer<typeof Stage3ASchema>;

// ─── Stage 3B: API Schema ─────────────────────────────────────────────────────
export const EndpointSchema = z.object({
  path: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  auth_required: z.boolean(),
  required_roles: z.array(z.string()).default([]),
  request_schema: z.record(z.string(), z.unknown()).default({}),
  response_schema: z.record(z.string(), z.unknown()),
  validation_rules: z.record(z.string(), z.unknown()).default({}),
  status_codes: z.record(z.string(), z.string()).default({}),
  rate_limit: z.object({
    requests_per_minute: z.number().default(60),
    requests_per_hour: z.number().default(1000),
  }).default({ requests_per_minute: 60, requests_per_hour: 1000 }),
});

export const Stage3BSchema = z.object({
  endpoints: z.array(EndpointSchema).min(1),
});

export type Stage3BOutput = z.infer<typeof Stage3BSchema>;

// ─── Stage 3C: UI Schema ───────────────────────────────────────────────────────
export const ComponentSchema = z.object({
  type: z.string(),
  props: z.record(z.string(), z.unknown()).default({}),
  data_source_api: z.string().optional(),
  validations: z.array(z.string()).default([]),
  loading_state: z.string().default('spinner'),
  error_state: z.string().default('error_message'),
});

export const PageSchema = z.object({
  page_name: z.string(),
  route: z.string(),
  required_roles: z.array(z.string()).default([]),
  components: z.array(ComponentSchema).min(1),
});

export const Stage3CSchema = z.object({
  pages: z.array(PageSchema).min(1),
});

export type Stage3COutput = z.infer<typeof Stage3CSchema>;

// ─── Stage 3D: Auth Schema ────────────────────────────────────────────────────
export const PermissionSchema = z.object({
  resource: z.string(),
  action: z.enum(['create', 'read', 'update', 'delete', 'manage']),
  allowed_roles: z.array(z.string()).default([]),
});

export const RolePermissionsSchema = z.object({
  role_name: z.string(),
  permissions: z.array(z.string()).default([]),
});

export const Stage3DSchema = z.object({
  auth_strategy: z.enum(['JWT', 'Session', 'OAuth']),
  roles: z.array(RolePermissionsSchema).min(1),
  permission_model: z.array(PermissionSchema).min(1),
  rate_limits: z.record(z.string(), z.unknown()),
});

export type Stage3DOutput = z.infer<typeof Stage3DSchema>;

// ─── Stage 4: Validation Output ───────────────────────────────────────────────
export const ValidationErrorSchema = z.object({
  layer: z.string(),
  issue: z.string(),
  severity: z.enum(['error', 'warning', 'info']),
  suggested_fix: z.string(),
});

export const Stage4Schema = z.object({
  validation_results: z.object({
    is_valid: z.boolean(),
    errors: z.array(ValidationErrorSchema).default([]),
    consistency_checks: z.record(z.string(), z.boolean()).default({}),
  }),
  issues_found: z.number().default(0),
  fixes_applied: z.number().default(0),
  final_schemas: z.object({
    db_schema: z.unknown(),
    api_schema: z.unknown(),
    ui_schema: z.unknown(),
    auth_schema: z.unknown(),
  }),
});

export type Stage4Output = z.infer<typeof Stage4Schema>;

// ─── Combined schemas type ─────────────────────────────────────────────────────
export interface AllSchemas {
  stage1: Stage1Output;
  stage2: Stage2Output;
  db_schema: Stage3AOutput;
  api_schema: Stage3BOutput;
  ui_schema: Stage3COutput;
  auth_schema: Stage3DOutput;
  validation: Stage4Output;
}
