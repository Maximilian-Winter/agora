# Custom Fields, Document Templates & Agent Management Redesign

**Date**: 2026-03-12
**Status**: Approved
**Approach**: Modular Domain Separation

## Overview

Replace the current startup script generation with a flexible document template system. Add custom definable fields (typed with validation) to agents and projects. Redesign agent management for a richer UX and decouple from Claude Code specifics.

## Data Model

### New Tables

#### CustomFieldDefinition

| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| name | String(100) | Machine name, e.g. "expertise" |
| label | String(200) | Display label, e.g. "Area of Expertise" |
| field_type | Enum | string \| number \| boolean \| enum |
| entity_type | Enum | agent \| project |
| options_json | Text (nullable) | JSON array for enum choices, e.g. ["React","Go","Python"]. Validated as valid JSON array on create/update. |
| default_value | String (nullable) | Default value for new entities |
| required | Boolean | Default false |
| sort_order | Integer | Display ordering |
| created_at | DateTime | |
| updated_at | DateTime | |

#### CustomFieldValue

| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| field_id | FK → CustomFieldDefinition | |
| entity_id | Integer | ID of the agent or project. Entity type is inferred from the field definition's entity_type. |
| value | Text | Stored as string, cast by field_type |
| updated_at | DateTime | |

Unique constraint on (field_id, entity_id).

#### DocumentTemplate

| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| name | String(200) | Template name |
| description | Text (nullable) | |
| type_tag | String(100) (nullable) | Optional: "startup-script", "system-prompt", etc. |
| content | Text | Template body with {{variable}} placeholders |
| project_id | FK → Project (nullable) | null = global template |
| created_at | DateTime | |
| updated_at | DateTime | |

### Changes to Existing Models

#### ProjectAgent

- Add `runtime` field (nullable String) — e.g. "claude-code", "aider", "custom"
- Add `extra_flags` field (Text, nullable) — JSON object for runtime-agnostic flags
- Remove `skip_permissions` — migrated to `extra_flags: {"skip_permissions": true}`
- Keep `prompt_source` (append/override) — useful for any runtime
- Keep `allowed_tools` — applicable to any tool-using agent
- Keep `model` — universal concept

#### Agent / Project

- No schema changes — custom fields stored in CustomFieldValue
- Add SQLAlchemy relationships to load custom field values
- API responses include `custom_fields: {name: value, ...}`

### Removals

- Delete `frontend/src/lib/scriptGenerator.ts`
- Remove script generation UI from AgentManager
- Replace with link to Document Generation section

## API Endpoints

### Custom Field Definitions

```
POST   /api/custom-fields                    Create field definition
GET    /api/custom-fields?entity_type=agent   List definitions (filterable)
GET    /api/custom-fields/{id}                Get single definition
PATCH  /api/custom-fields/{id}                Update definition
DELETE /api/custom-fields/{id}                Delete definition + all values
```

### Custom Field Values

```
GET    /api/agents/{name}/fields              Get all field values for agent
PUT    /api/agents/{name}/fields              Set multiple field values (bulk upsert)
         Body: { "field_name": "value", "field_name2": "value2", ... }
PUT    /api/agents/{name}/fields/{field}      Set single field value
         Body: { "value": "..." }

GET    /api/projects/{slug}/fields            Get all field values for project
PUT    /api/projects/{slug}/fields            Set multiple field values (bulk upsert)
         Body: { "field_name": "value", ... }
PUT    /api/projects/{slug}/fields/{field}    Set single field value
         Body: { "value": "..." }
```

### Document Templates

```
POST   /api/templates                         Create global template
GET    /api/templates                          List global templates
GET    /api/templates/{id}                     Get template
PATCH  /api/templates/{id}                     Update template
DELETE /api/templates/{id}                     Delete template

POST   /api/projects/{slug}/templates          Create project template
GET    /api/projects/{slug}/templates          List all available (global + project)

POST   /api/templates/{id}/render              Render template
         Body: { project_slug, agent_name? }
         Returns: { rendered_content, unresolved_variables[] }
```

### Agent Management Changes

- `GET /api/agents/{name}` — response includes `custom_fields: {}`
- `GET /api/projects/{slug}/agents/{name}` — response includes `runtime`, `extra_flags`, `custom_fields`
- `PATCH /api/projects/{slug}/agents/{name}` — accepts `runtime`, `extra_flags`
- `PATCH /api/agents/{name}` — can set custom fields inline via `custom_fields: {}`

## Template Rendering Engine

### Substitution Rules

- **Pattern**: `{{namespace.field}}` — regex: `\{\{\s*([\w.]+)\s*\}\}`
- **Resolution order**:
  1. `agent.*` → built-in agent fields, then custom fields
  2. `project.*` → built-in project fields, then custom fields
  3. `platform.*` → server_url, date
- **Missing variables**: Left as-is in output, returned in `unresolved_variables[]`

### Template Variable Namespace

When both `project_slug` and `agent_name` are provided to the render endpoint, the `agent.*` namespace merges fields from both Agent (global) and ProjectAgent (per-project), with ProjectAgent fields taking precedence for overlapping names. The persona's system prompt is included: if `prompt_source` is "override", `{{agent.system_prompt}}` resolves to the ProjectAgent system_prompt; if "append", it resolves to the persona system_prompt + ProjectAgent system_prompt concatenated. If no persona exists, only the ProjectAgent system_prompt is used.

```
── Agent Fields (from Agent model) ──
{{agent.name}}, {{agent.display_name}}, {{agent.role}}

── Agent Fields (from ProjectAgent model, override Agent if overlapping) ──
{{agent.system_prompt}}, {{agent.initial_task}}, {{agent.model}}, {{agent.runtime}}

── Project Fields ──
{{project.name}}, {{project.slug}}, {{project.description}}, {{project.working_dir}}

── Custom Fields ──
{{agent.fields.<name>}}, {{project.fields.<name>}}

── Platform ──
{{platform.server_url}}, {{platform.date}}
```

## Validation

### Custom Field Validation

- **string** — any text, no max length constraint (keep it simple)
- **number** — must parse as float/int
- **boolean** — "true"/"false" stored, rendered as true/false
- **enum** — value must be in options_json list
- Validation runs on PUT to field values endpoint. Returns 422 with details on failure.

### Template Validation

- **On save** — extract all {{variables}}, warn if any don't match known fields (soft warning, not blocking)
- **On render** — return unresolved list so UI can highlight missing data
- **Name uniqueness** — enforced via unique constraint on `(name, project_id)` where `project_id` is null for global templates. Global template names are unique globally, project template names are unique within their project.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Render without agent selected | Only project + platform vars resolved; agent vars left unresolved |
| Delete a custom field definition | Cascade deletes all values; templates referencing it will show unresolved |
| Delete an agent from project | Field values remain on the global agent; only ProjectAgent config removed |
| Global template name conflicts with project template | Project template wins — shown with "override" indicator in UI |
| Required field missing on agent | Warning in agent edit UI; does not block template rendering |

## Frontend UI

### Navigation Changes

Project sidebar gains a "Documents" entry between Issues and Agents. Script generation tab removed from Agents page.

### New Routes

```
/projects/:slug/documents        → DocumentsPage (NEW)
/custom-fields                   → CustomFieldsAdmin (NEW)
/templates                       → GlobalTemplatesPage (NEW)
/projects/:slug/agents           → AgentManager (REDESIGNED)
```

### Agents Page (Redesigned)

- Card-based team roster with runtime badge (e.g. "claude-code", "aider")
- Custom field values shown as chips on each card
- Edit modal/panel with two columns: Core Settings (display name, role, runtime, model) and Custom Fields (dynamically rendered based on field definitions)
- System prompt editor below

### Documents Page (New)

- Template list with type tag filter chips (All, startup-script, system-prompt, task-prompt)
- Each template shows name, type tag badge, scope badge (global/project)
- Generate button opens modal with:
  - Agent selector dropdown (optional — some templates are agent-independent)
  - Rendered preview
  - Actions: Copy, Download, Save to Disk

### Custom Fields Admin (New)

- Tab view: Agent Fields / Project Fields
- Table of field definitions: name, type, required, default, edit button
- Add Field button

### Global Templates Page (New)

- Same list view as project Documents page, but only global templates
- Create/edit/delete global templates

## Migration Path

1. Alembic migration: add CustomFieldDefinition, CustomFieldValue, DocumentTemplate tables
2. Alembic migration: add `runtime` and `extra_flags` to ProjectAgent, drop `skip_permissions`, and migrate existing `skip_permissions=true` → `extra_flags: {"skip_permissions": true}` in the same revision
3. Seed a default "Claude Code Startup Script" global template (porting current scriptGenerator logic)
4. Extract file download utilities (`downloadFile`, `downloadZip`, `saveFilesToDisk`, `hasFileSystemAccess`) from `scriptGenerator.ts` to `frontend/src/lib/fileUtils.ts`
5. Delete `scriptGenerator.ts`, update AgentManager, add new pages (Documents page imports utilities from `fileUtils.ts`)

## Implementation Scope

### New Files

**Backend:**
- `src/agora/db/models/custom_field.py` — CustomFieldDefinition, CustomFieldValue
- `src/agora/db/models/template.py` — DocumentTemplate
- `src/agora/api/routes/custom_fields.py` — field CRUD + values
- `src/agora/api/routes/templates.py` — template CRUD + render
- `src/agora/services/template_engine.py` — variable resolution + substitution

**Frontend:**
- `frontend/src/pages/DocumentsPage.tsx` — template list + generate modal
- `frontend/src/pages/CustomFieldsAdmin.tsx` — field management
- `frontend/src/pages/TemplatesPage.tsx` — global template management
- `frontend/src/hooks/useCustomFields.ts` — field hooks
- `frontend/src/hooks/useTemplates.ts` — template hooks

### Modified Files

- `frontend/src/pages/AgentManager.tsx` — redesign
- `frontend/src/api/types.ts` — new types
- `frontend/src/App.tsx` — new routes
- `src/agora/db/models/project_agent.py` — runtime + extra_flags

### Extracted Files

- `frontend/src/lib/fileUtils.ts` — file download utilities extracted from scriptGenerator.ts

### Deleted Files

- `frontend/src/lib/scriptGenerator.ts` — after extracting utilities to fileUtils.ts
