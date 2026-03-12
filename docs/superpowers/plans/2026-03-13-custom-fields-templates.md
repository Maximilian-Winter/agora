# Custom Fields, Document Templates & Agent Management Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace startup script generation with a flexible template system, add typed custom fields to agents/projects, and redesign agent management UX to be runtime-agnostic.

**Architecture:** Three new backend domains (custom fields, templates, template engine) with corresponding API routes, plus frontend pages. Custom fields are stored as separate entities (definition + value tables) linked to agents/projects. Templates use simple `{{variable}}` substitution resolved server-side. ProjectAgent model gets `runtime` and `extra_flags` fields replacing `skip_permissions`.

**Tech Stack:** FastAPI, SQLAlchemy (async), SQLite, Pydantic, React 19, TypeScript, TanStack Query, React Router 7

**Spec:** `docs/superpowers/specs/2026-03-12-custom-fields-templates-design.md`

---

## Chunk 1: Backend — Custom Fields

### Task 1: CustomFieldDefinition and CustomFieldValue Models

**Files:**
- Create: `src/agora/db/models/custom_field.py`
- Modify: `src/agora/db/models/__init__.py`

- [ ] **Step 1: Create custom_field.py model file**

Create `src/agora/db/models/custom_field.py`:

```python
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Boolean
from sqlalchemy.orm import relationship

from agora.db.base import Base


class CustomFieldDefinition(Base):
    """Defines a custom field that can be attached to agents or projects."""

    __tablename__ = "custom_field_definitions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # machine name, e.g. "expertise"
    label = Column(String(200), nullable=False)  # display label, e.g. "Area of Expertise"
    field_type = Column(String(20), nullable=False)  # string | number | boolean | enum
    entity_type = Column(String(20), nullable=False)  # agent | project
    options_json = Column(Text, nullable=True)  # JSON array for enum choices
    default_value = Column(String(500), nullable=True)
    required = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("name", "entity_type", name="uq_field_name_entity_type"),
    )

    values = relationship("CustomFieldValue", back_populates="field", cascade="all, delete-orphan")


class CustomFieldValue(Base):
    """Stores the value of a custom field for a specific agent or project."""

    __tablename__ = "custom_field_values"

    id = Column(Integer, primary_key=True, index=True)
    field_id = Column(Integer, ForeignKey("custom_field_definitions.id"), nullable=False, index=True)
    entity_id = Column(Integer, nullable=False)  # ID of agent or project (entity_type inferred from field definition)
    value = Column(Text, nullable=False)  # stored as string, cast by field_type
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("field_id", "entity_id", name="uq_field_entity"),
    )

    field = relationship("CustomFieldDefinition", back_populates="values")
```

- [ ] **Step 2: Register models in __init__.py**

Add to `src/agora/db/models/__init__.py`:

```python
from .custom_field import CustomFieldDefinition, CustomFieldValue
```

And add `"CustomFieldDefinition"`, `"CustomFieldValue"` to the `__all__` list.

- [ ] **Step 3: Verify models load**

```bash
cd H:/Dev42/agora && python -c "from agora.db.models import CustomFieldDefinition, CustomFieldValue; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/agora/db/models/custom_field.py src/agora/db/models/__init__.py
git commit -m "feat: add CustomFieldDefinition and CustomFieldValue models"
```

---

### Task 2: Custom Field Pydantic Schemas

**Files:**
- Create: `src/agora/schemas/custom_field.py`

- [ ] **Step 1: Create schema file**

Create `src/agora/schemas/custom_field.py`:

```python
import json
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CustomFieldDefinitionCreate(BaseModel):
    """Create a new custom field definition."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(..., min_length=1, max_length=200)
    field_type: str = Field(..., pattern=r"^(string|number|boolean|enum)$")
    entity_type: str = Field(..., pattern=r"^(agent|project)$")
    options_json: Optional[str] = None  # JSON array string for enum choices
    default_value: Optional[str] = None
    required: bool = False
    sort_order: int = 0

    @field_validator("options_json")
    @classmethod
    def validate_options_json(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            try:
                parsed = json.loads(v)
                if not isinstance(parsed, list) or not all(isinstance(i, str) for i in parsed):
                    raise ValueError("options_json must be a JSON array of strings")
            except json.JSONDecodeError:
                raise ValueError("options_json must be valid JSON")
        return v


class CustomFieldDefinitionUpdate(BaseModel):
    """Update a custom field definition."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    label: Optional[str] = Field(None, min_length=1, max_length=200)
    options_json: Optional[str] = None
    default_value: Optional[str] = None
    required: Optional[bool] = None
    sort_order: Optional[int] = None

    @field_validator("options_json")
    @classmethod
    def validate_options_json(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            try:
                parsed = json.loads(v)
                if not isinstance(parsed, list) or not all(isinstance(i, str) for i in parsed):
                    raise ValueError("options_json must be a JSON array of strings")
            except json.JSONDecodeError:
                raise ValueError("options_json must be valid JSON")
        return v


class CustomFieldDefinitionOut(BaseModel):
    """Custom field definition response."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    label: str
    field_type: str
    entity_type: str
    options_json: Optional[str]
    default_value: Optional[str]
    required: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class CustomFieldValueSet(BaseModel):
    """Set a single custom field value."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    value: str


```

- [ ] **Step 2: Verify schemas load**

```bash
python -c "from agora.schemas.custom_field import CustomFieldDefinitionCreate, CustomFieldDefinitionOut; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/agora/schemas/custom_field.py
git commit -m "feat: add Pydantic schemas for custom fields"
```

---

### Task 3: Custom Field Validation Service

**Files:**
- Create: `src/agora/services/field_validation.py`

- [ ] **Step 1: Create field validation service**

Create `src/agora/services/field_validation.py`:

```python
"""Validates custom field values against their field definitions."""

import json
from typing import Optional


def validate_field_value(value: str, field_type: str, options_json: Optional[str] = None) -> str:
    """Validate and normalize a field value based on its type.

    Args:
        value: The raw string value to validate.
        field_type: One of "string", "number", "boolean", "enum".
        options_json: JSON array of valid enum choices (required for enum type).

    Returns:
        The normalized value string.

    Raises:
        ValueError: If the value is invalid for the field type.
    """
    if field_type == "string":
        return value

    if field_type == "number":
        try:
            # Accept both int and float
            float(value)
        except ValueError:
            raise ValueError(f"Value '{value}' is not a valid number")
        return value

    if field_type == "boolean":
        lower = value.lower()
        if lower not in ("true", "false"):
            raise ValueError(f"Value '{value}' is not a valid boolean (must be 'true' or 'false')")
        return lower

    if field_type == "enum":
        if options_json is None:
            raise ValueError("Enum field has no options defined")
        options = json.loads(options_json)
        if value not in options:
            raise ValueError(f"Value '{value}' is not one of the allowed options: {options}")
        return value

    raise ValueError(f"Unknown field type: {field_type}")
```

- [ ] **Step 2: Verify module loads**

```bash
python -c "from agora.services.field_validation import validate_field_value; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/agora/services/field_validation.py
git commit -m "feat: add field value validation service"
```

---

### Task 4: Custom Fields API Routes

**Files:**
- Create: `src/agora/api/routes/custom_fields.py`
- Modify: `src/agora/api/app.py`

- [ ] **Step 1: Create custom fields route file**

Create `src/agora/api/routes/custom_fields.py`:

```python
"""CRUD for custom field definitions and values on agents/projects."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agora.db.engine import get_db
from agora.db.models.custom_field import CustomFieldDefinition, CustomFieldValue
from agora.db.models.agent import Agent
from agora.db.models.project import Project
from agora.schemas.custom_field import (
    CustomFieldDefinitionCreate,
    CustomFieldDefinitionUpdate,
    CustomFieldDefinitionOut,
    CustomFieldValueSet,
)
from agora.services.field_validation import validate_field_value

# ── Field Definition CRUD ──────────────────────────────────────────

definitions_router = APIRouter(prefix="/api/custom-fields", tags=["custom-fields"])


@definitions_router.post("", response_model=CustomFieldDefinitionOut, status_code=201)
async def create_field_definition(
    body: CustomFieldDefinitionCreate, db: AsyncSession = Depends(get_db)
):
    # Check name+entity_type uniqueness
    existing = await db.execute(
        select(CustomFieldDefinition).where(
            CustomFieldDefinition.name == body.name,
            CustomFieldDefinition.entity_type == body.entity_type,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Field '{body.name}' already exists for {body.entity_type}")

    field_def = CustomFieldDefinition(**body.model_dump())
    db.add(field_def)
    await db.commit()
    await db.refresh(field_def)
    return field_def


@definitions_router.get("", response_model=list[CustomFieldDefinitionOut])
async def list_field_definitions(
    entity_type: str | None = Query(None, pattern=r"^(agent|project)$"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CustomFieldDefinition).order_by(CustomFieldDefinition.sort_order)
    if entity_type:
        stmt = stmt.where(CustomFieldDefinition.entity_type == entity_type)
    result = await db.execute(stmt)
    return result.scalars().all()


@definitions_router.get("/{field_id}", response_model=CustomFieldDefinitionOut)
async def get_field_definition(field_id: int, db: AsyncSession = Depends(get_db)):
    field_def = await db.get(CustomFieldDefinition, field_id)
    if not field_def:
        raise HTTPException(404, "Field definition not found")
    return field_def


@definitions_router.patch("/{field_id}", response_model=CustomFieldDefinitionOut)
async def update_field_definition(
    field_id: int, body: CustomFieldDefinitionUpdate, db: AsyncSession = Depends(get_db)
):
    field_def = await db.get(CustomFieldDefinition, field_id)
    if not field_def:
        raise HTTPException(404, "Field definition not found")
    for key, val in body.model_dump(exclude_unset=True).items():
        setattr(field_def, key, val)
    await db.commit()
    await db.refresh(field_def)
    return field_def


@definitions_router.delete("/{field_id}", status_code=204)
async def delete_field_definition(field_id: int, db: AsyncSession = Depends(get_db)):
    field_def = await db.get(CustomFieldDefinition, field_id)
    if not field_def:
        raise HTTPException(404, "Field definition not found")
    await db.delete(field_def)  # cascade deletes values
    await db.commit()


# ── Field Values on Agents ──────────────────────────────────────────

agent_fields_router = APIRouter(prefix="/api/agents/{agent_name}/fields", tags=["custom-fields"])


async def _get_agent_by_name(agent_name: str, db: AsyncSession) -> Agent:
    result = await db.execute(select(Agent).where(Agent.name == agent_name))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, f"Agent '{agent_name}' not found")
    return agent


async def _get_field_values(entity_type: str, entity_id: int, db: AsyncSession) -> dict[str, str]:
    """Get all custom field values for an entity as {field_name: value}."""
    stmt = (
        select(CustomFieldDefinition.name, CustomFieldValue.value)
        .join(CustomFieldValue, CustomFieldDefinition.id == CustomFieldValue.field_id)
        .where(
            CustomFieldDefinition.entity_type == entity_type,
            CustomFieldValue.entity_id == entity_id,
        )
    )
    result = await db.execute(stmt)
    return {row.name: row.value for row in result.all()}


async def _set_field_values(
    entity_type: str, entity_id: int, fields: dict[str, str], db: AsyncSession
) -> dict[str, str]:
    """Set multiple field values, validating each against its definition."""
    result_values = {}
    for field_name, raw_value in fields.items():
        # Look up definition
        stmt = select(CustomFieldDefinition).where(
            CustomFieldDefinition.name == field_name,
            CustomFieldDefinition.entity_type == entity_type,
        )
        result = await db.execute(stmt)
        field_def = result.scalar_one_or_none()
        if not field_def:
            raise HTTPException(422, f"Unknown {entity_type} field: '{field_name}'")

        # Validate value
        try:
            validated = validate_field_value(raw_value, field_def.field_type, field_def.options_json)
        except ValueError as e:
            raise HTTPException(422, f"Field '{field_name}': {e}")

        # Upsert value
        existing = await db.execute(
            select(CustomFieldValue).where(
                CustomFieldValue.field_id == field_def.id,
                CustomFieldValue.entity_id == entity_id,
            )
        )
        fv = existing.scalar_one_or_none()
        if fv:
            fv.value = validated
        else:
            fv = CustomFieldValue(field_id=field_def.id, entity_id=entity_id, value=validated)
            db.add(fv)
        result_values[field_name] = validated

    await db.commit()
    return result_values


@agent_fields_router.get("")
async def get_agent_fields(agent_name: str, db: AsyncSession = Depends(get_db)):
    agent = await _get_agent_by_name(agent_name, db)
    return await _get_field_values("agent", agent.id, db)


@agent_fields_router.put("")
async def set_agent_fields(agent_name: str, body: dict[str, str], db: AsyncSession = Depends(get_db)):
    agent = await _get_agent_by_name(agent_name, db)
    return await _set_field_values("agent", agent.id, body, db)


@agent_fields_router.put("/{field_name}")
async def set_agent_field(
    agent_name: str, field_name: str, body: CustomFieldValueSet, db: AsyncSession = Depends(get_db)
):
    agent = await _get_agent_by_name(agent_name, db)
    result = await _set_field_values("agent", agent.id, {field_name: body.value}, db)
    return result


# ── Field Values on Projects ──────────────────────────────────────────

project_fields_router = APIRouter(prefix="/api/projects/{project_slug}/fields", tags=["custom-fields"])


async def _get_project_by_slug(project_slug: str, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.slug == project_slug))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, f"Project '{project_slug}' not found")
    return project


@project_fields_router.get("")
async def get_project_fields(project_slug: str, db: AsyncSession = Depends(get_db)):
    project = await _get_project_by_slug(project_slug, db)
    return await _get_field_values("project", project.id, db)


@project_fields_router.put("")
async def set_project_fields(
    project_slug: str, body: dict[str, str], db: AsyncSession = Depends(get_db)
):
    project = await _get_project_by_slug(project_slug, db)
    return await _set_field_values("project", project.id, body, db)


@project_fields_router.put("/{field_name}")
async def set_project_field(
    project_slug: str, field_name: str, body: CustomFieldValueSet, db: AsyncSession = Depends(get_db)
):
    project = await _get_project_by_slug(project_slug, db)
    result = await _set_field_values("project", project.id, {field_name: body.value}, db)
    return result
```

- [ ] **Step 2: Register routers in app.py**

In `src/agora/api/app.py`, **inside the `create_app()` function**, add after the existing router imports (around line 55, after `from agora.api.routes.terminals import router as terminals_router`):

```python
from agora.api.routes.custom_fields import definitions_router, agent_fields_router, project_fields_router
```

And add after existing `app.include_router(terminals_router)` (around line 68):

```python
app.include_router(definitions_router)
app.include_router(agent_fields_router)
app.include_router(project_fields_router)
```

- [ ] **Step 3: Verify server starts**

```bash
cd H:/Dev42/agora && python -c "from agora.api.app import app; print('Routes:', len(app.routes))"
```

Expected: prints route count without errors.

- [ ] **Step 4: Commit**

```bash
git add src/agora/api/routes/custom_fields.py src/agora/api/app.py
git commit -m "feat: add custom fields API routes (definitions + values for agents and projects)"
```

---

### Task 5: Manual API Smoke Test — Custom Fields

- [ ] **Step 1: Start the server and test custom fields**

```bash
cd H:/Dev42/agora && python -m uvicorn agora.api.app:app --port 8321 &
sleep 2

# Create field definition
curl -s -X POST http://localhost:8321/api/custom-fields \
  -H "Content-Type: application/json" \
  -d '{"name":"expertise","label":"Area of Expertise","field_type":"string","entity_type":"agent"}' | python -m json.tool

# List definitions
curl -s http://localhost:8321/api/custom-fields?entity_type=agent | python -m json.tool

# Create an agent first if needed, then set field value
curl -s -X PUT http://localhost:8321/api/agents/test-agent/fields \
  -H "Content-Type: application/json" \
  -d '{"expertise":"React"}' | python -m json.tool

# Get field values
curl -s http://localhost:8321/api/agents/test-agent/fields | python -m json.tool

# Kill server
kill %1
```

Expected: All requests return 200/201 with correct JSON.

- [ ] **Step 2: Commit (no changes — verification only)**

---

## Chunk 2: Backend — Document Templates & ProjectAgent Changes

### Task 6: DocumentTemplate Model

**Files:**
- Create: `src/agora/db/models/template.py`
- Modify: `src/agora/db/models/__init__.py`

- [ ] **Step 1: Create template model file**

Create `src/agora/db/models/template.py`:

```python
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from agora.db.base import Base


class DocumentTemplate(Base):
    """A document template with {{variable}} placeholders."""

    __tablename__ = "document_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    type_tag = Column(String(100), nullable=True)  # e.g. "startup-script", "system-prompt"
    content = Column(Text, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)  # null = global
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("name", "project_id", name="uq_template_name_project"),
    )

    project = relationship("Project", backref="templates")
```

- [ ] **Step 2: Register in __init__.py**

Add to `src/agora/db/models/__init__.py`:

```python
from .template import DocumentTemplate
```

And add `"DocumentTemplate"` to `__all__`.

- [ ] **Step 3: Verify models load**

```bash
python -c "from agora.db.models import DocumentTemplate; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/agora/db/models/template.py src/agora/db/models/__init__.py
git commit -m "feat: add DocumentTemplate model"
```

---

### Task 7: Template Pydantic Schemas

**Files:**
- Create: `src/agora/schemas/template.py`

- [ ] **Step 1: Create template schemas**

Create `src/agora/schemas/template.py`:

```python
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class TemplateCreate(BaseModel):
    """Create a new document template."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    type_tag: Optional[str] = Field(None, max_length=100)
    content: str = Field(..., min_length=1)


class TemplateUpdate(BaseModel):
    """Update a document template."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    type_tag: Optional[str] = Field(None, max_length=100)
    content: Optional[str] = Field(None, min_length=1)


class TemplateOut(BaseModel):
    """Document template response."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str]
    type_tag: Optional[str]
    content: str
    project_id: Optional[int]
    created_at: datetime
    updated_at: datetime


class RenderRequest(BaseModel):
    """Request to render a template."""

    model_config = ConfigDict(extra="forbid")
    project_slug: str
    agent_name: Optional[str] = None


class RenderResponse(BaseModel):
    """Rendered template output."""

    rendered_content: str
    unresolved_variables: list[str]
```

- [ ] **Step 2: Commit**

```bash
git add src/agora/schemas/template.py
git commit -m "feat: add Pydantic schemas for document templates"
```

---

### Task 8: Template Rendering Engine

**Files:**
- Create: `src/agora/services/template_engine.py`

- [ ] **Step 1: Create the template engine service**

Create `src/agora/services/template_engine.py`:

```python
"""Template rendering engine with {{variable}} substitution."""

import re
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from agora.db.models.agent import Agent, AgentPersona
from agora.db.models.project import Project
from agora.db.models.project_agent import ProjectAgent
from agora.db.models.custom_field import CustomFieldDefinition, CustomFieldValue

# Matches {{namespace.field}} with optional whitespace
VARIABLE_PATTERN = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


async def build_context(
    project_slug: str,
    agent_name: Optional[str],
    server_url: str,
    db: AsyncSession,
) -> dict[str, str]:
    """Build a flat variable context dict from project, agent, and custom fields.

    Keys are dotted paths like "agent.name", "project.slug", "agent.fields.expertise".
    """
    context: dict[str, str] = {}

    # Platform vars
    context["platform.server_url"] = server_url
    context["platform.date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Project vars
    result = await db.execute(select(Project).where(Project.slug == project_slug))
    project = result.scalar_one_or_none()
    if not project:
        return context

    context["project.name"] = project.name or ""
    context["project.slug"] = project.slug or ""
    context["project.description"] = project.description or ""
    context["project.working_dir"] = project.working_dir or ""

    # Project custom fields
    proj_fields = await _get_custom_fields("project", project.id, db)
    for fname, fval in proj_fields.items():
        context[f"project.fields.{fname}"] = fval

    # Agent vars (if specified)
    if agent_name:
        agent_result = await db.execute(select(Agent).where(Agent.name == agent_name))
        agent = agent_result.scalar_one_or_none()
        if agent:
            context["agent.name"] = agent.name or ""
            context["agent.display_name"] = agent.display_name or ""
            context["agent.role"] = agent.role or ""

            # Agent custom fields
            agent_fields = await _get_custom_fields("agent", agent.id, db)
            for fname, fval in agent_fields.items():
                context[f"agent.fields.{fname}"] = fval

            # ProjectAgent overrides (if agent is in this project)
            pa_result = await db.execute(
                select(ProjectAgent)
                .where(ProjectAgent.project_id == project.id, ProjectAgent.agent_id == agent.id)
            )
            pa = pa_result.scalar_one_or_none()
            if pa:
                # Resolve system_prompt considering persona
                system_prompt = pa.system_prompt or ""
                if agent.persona_id:
                    persona_result = await db.execute(
                        select(AgentPersona).where(AgentPersona.id == agent.persona_id)
                    )
                    persona = persona_result.scalar_one_or_none()
                    if persona and persona.system_prompt:
                        if pa.prompt_source == "override":
                            system_prompt = pa.system_prompt or persona.system_prompt or ""
                        else:  # append
                            parts = [p for p in [persona.system_prompt, pa.system_prompt] if p]
                            system_prompt = "\n\n".join(parts)

                context["agent.system_prompt"] = system_prompt
                context["agent.initial_task"] = pa.initial_task or ""
                context["agent.model"] = pa.model or ""
                context["agent.prompt_source"] = pa.prompt_source or "append"
                # runtime/extra_flags added by Task 11 — safe to access via getattr until then
                context["agent.runtime"] = getattr(pa, "runtime", None) or ""

    return context


async def _get_custom_fields(entity_type: str, entity_id: int, db: AsyncSession) -> dict[str, str]:
    """Get custom field values as {name: value} dict."""
    stmt = (
        select(CustomFieldDefinition.name, CustomFieldValue.value)
        .join(CustomFieldValue, CustomFieldDefinition.id == CustomFieldValue.field_id)
        .where(
            CustomFieldDefinition.entity_type == entity_type,
            CustomFieldValue.entity_id == entity_id,
        )
    )
    result = await db.execute(stmt)
    return {row.name: row.value for row in result.all()}


def render_template(template_content: str, context: dict[str, str]) -> tuple[str, list[str]]:
    """Render a template by substituting {{variables}} from context.

    Returns (rendered_content, list_of_unresolved_variable_names).
    """
    unresolved: list[str] = []

    def replace_var(match: re.Match) -> str:
        var_name = match.group(1)
        if var_name in context:
            return context[var_name]
        unresolved.append(var_name)
        return match.group(0)  # leave as-is

    rendered = VARIABLE_PATTERN.sub(replace_var, template_content)
    return rendered, unresolved
```

- [ ] **Step 2: Verify module loads**

```bash
python -c "from agora.services.template_engine import render_template, build_context; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/agora/services/template_engine.py
git commit -m "feat: add template rendering engine with variable substitution"
```

---

### Task 9: Template API Routes

**Files:**
- Create: `src/agora/api/routes/templates.py`
- Modify: `src/agora/api/app.py`

- [ ] **Step 1: Create template routes**

Create `src/agora/api/routes/templates.py`:

```python
"""CRUD for document templates + render endpoint."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from agora.db.engine import get_db
from agora.db.models.template import DocumentTemplate
from agora.db.models.project import Project
from agora.schemas.template import (
    TemplateCreate,
    TemplateUpdate,
    TemplateOut,
    RenderRequest,
    RenderResponse,
)
from agora.services.template_engine import build_context, render_template

# ── Global Templates ──────────────────────────────────────────

global_templates_router = APIRouter(prefix="/api/templates", tags=["templates"])


@global_templates_router.post("", response_model=TemplateOut, status_code=201)
async def create_global_template(body: TemplateCreate, db: AsyncSession = Depends(get_db)):
    # Check name uniqueness for global templates (project_id is null)
    existing = await db.execute(
        select(DocumentTemplate).where(
            DocumentTemplate.name == body.name,
            DocumentTemplate.project_id.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Global template '{body.name}' already exists")

    template = DocumentTemplate(**body.model_dump(), project_id=None)
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@global_templates_router.get("", response_model=list[TemplateOut])
async def list_global_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DocumentTemplate)
        .where(DocumentTemplate.project_id.is_(None))
        .order_by(DocumentTemplate.name)
    )
    return result.scalars().all()


@global_templates_router.get("/{template_id}", response_model=TemplateOut)
async def get_template(template_id: int, db: AsyncSession = Depends(get_db)):
    template = await db.get(DocumentTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    return template


@global_templates_router.patch("/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: int, body: TemplateUpdate, db: AsyncSession = Depends(get_db)
):
    template = await db.get(DocumentTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    updates = body.model_dump(exclude_unset=True)
    # If renaming, check uniqueness in same scope
    if "name" in updates:
        existing = await db.execute(
            select(DocumentTemplate).where(
                DocumentTemplate.name == updates["name"],
                DocumentTemplate.project_id == template.project_id,
                DocumentTemplate.id != template_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(409, f"Template '{updates['name']}' already exists in this scope")

    for key, val in updates.items():
        setattr(template, key, val)
    await db.commit()
    await db.refresh(template)
    return template


@global_templates_router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    template = await db.get(DocumentTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")
    await db.delete(template)
    await db.commit()


# ── Render ──────────────────────────────────────────

@global_templates_router.post("/{template_id}/render", response_model=RenderResponse)
async def render_template_endpoint(
    template_id: int, body: RenderRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    template = await db.get(DocumentTemplate, template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    server_url = str(request.base_url).rstrip("/")
    context = await build_context(body.project_slug, body.agent_name, server_url, db)
    rendered, unresolved = render_template(template.content, context)
    return RenderResponse(rendered_content=rendered, unresolved_variables=unresolved)


# ── Project Templates ──────────────────────────────────────────

project_templates_router = APIRouter(
    prefix="/api/projects/{project_slug}/templates", tags=["templates"]
)


async def _get_project(project_slug: str, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.slug == project_slug))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, f"Project '{project_slug}' not found")
    return project


@project_templates_router.post("", response_model=TemplateOut, status_code=201)
async def create_project_template(
    project_slug: str, body: TemplateCreate, db: AsyncSession = Depends(get_db)
):
    project = await _get_project(project_slug, db)

    # Check name uniqueness within project
    existing = await db.execute(
        select(DocumentTemplate).where(
            DocumentTemplate.name == body.name,
            DocumentTemplate.project_id == project.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Template '{body.name}' already exists in this project")

    template = DocumentTemplate(**body.model_dump(), project_id=project.id)
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@project_templates_router.get("", response_model=list[TemplateOut])
async def list_project_templates(project_slug: str, db: AsyncSession = Depends(get_db)):
    """List all templates available to a project (global + project-specific).

    Project templates override global templates with the same name.
    """
    project = await _get_project(project_slug, db)

    # Get all global and project templates
    result = await db.execute(
        select(DocumentTemplate).where(
            or_(
                DocumentTemplate.project_id.is_(None),
                DocumentTemplate.project_id == project.id,
            )
        ).order_by(DocumentTemplate.name)
    )
    all_templates = result.scalars().all()

    # Project templates override global ones by name
    by_name: dict[str, DocumentTemplate] = {}
    for t in all_templates:
        if t.name not in by_name or t.project_id is not None:
            by_name[t.name] = t

    return list(by_name.values())
```

- [ ] **Step 2: Register routers in app.py**

In `src/agora/api/app.py`, add after custom fields imports:

```python
from agora.api.routes.templates import global_templates_router, project_templates_router
```

And register:

```python
app.include_router(global_templates_router)
app.include_router(project_templates_router)
```

- [ ] **Step 3: Verify server starts**

```bash
python -c "from agora.api.app import app; print('Routes:', len(app.routes))"
```

Expected: prints route count without errors.

- [ ] **Step 4: Commit**

```bash
git add src/agora/api/routes/templates.py src/agora/api/app.py
git commit -m "feat: add template API routes (CRUD + render + project scoping)"
```

---

### Task 10: ProjectAgent Model — Add runtime and extra_flags

**Files:**
- Modify: `src/agora/db/models/project_agent.py`
- Modify: `src/agora/schemas/project_agent.py`
- Modify: `src/agora/api/routes/project_agents.py`

- [ ] **Step 1: Update ProjectAgent model**

In `src/agora/db/models/project_agent.py`, replace `skip_permissions` with `runtime` and `extra_flags`:

Replace:
```python
    skip_permissions = Column(
        Integer, nullable=False, default=0
    )  # 1 = --dangerously-skip-permissions
```

With:
```python
    runtime = Column(String(50), nullable=True)  # e.g. "claude-code", "aider", "custom"
    extra_flags = Column(Text, nullable=True)  # JSON object for runtime-agnostic flags
```

- [ ] **Step 2: Update Pydantic schemas**

In `src/agora/schemas/project_agent.py`:

Replace `skip_permissions: bool = False` in `ProjectAgentAdd` with:
```python
    runtime: Optional[str] = Field(None, max_length=50)
    extra_flags: Optional[str] = None  # JSON string
```

Replace `skip_permissions: Optional[bool] = None` in `ProjectAgentUpdate` with:
```python
    runtime: Optional[str] = Field(None, max_length=50)
    extra_flags: Optional[str] = None
```

Replace `skip_permissions: bool` in `ProjectAgentOut` with:
```python
    runtime: Optional[str]
    extra_flags: Optional[str]
```

- [ ] **Step 3: Update project_agents route**

In `src/agora/api/routes/project_agents.py`, make these specific changes:

1. In the `_to_out()` helper function: remove `skip_permissions=bool(pa.skip_permissions)` and replace with `runtime=pa.runtime, extra_flags=pa.extra_flags`
2. In the `add_agent_to_project` endpoint: remove `skip_permissions=int(body.skip_permissions)` from the `ProjectAgent()` constructor and replace with `runtime=body.runtime, extra_flags=body.extra_flags`
3. In the `update_project_agent` endpoint: remove the `if body.skip_permissions is not None: pa.skip_permissions = int(body.skip_permissions)` block (the generic `setattr` loop will handle `runtime` and `extra_flags` as simple string fields)

- [ ] **Step 4: Verify server starts**

```bash
python -c "from agora.api.app import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add src/agora/db/models/project_agent.py src/agora/schemas/project_agent.py src/agora/api/routes/project_agents.py
git commit -m "feat: replace skip_permissions with runtime and extra_flags on ProjectAgent"
```

---

### Task 11: Alembic Migrations

**Files:**
- Create: `alembic/env.py` (if not exists)
- Create: `alembic/versions/001_add_custom_fields_templates.py`
- Create: `alembic/versions/002_projectagent_runtime_extra_flags.py`

Note: The project currently uses `Base.metadata.create_all` in the lifespan for dev. Since there are no existing Alembic migrations, and the dev server auto-creates tables, these migrations are for production readiness. For now, the `create_all` approach will handle dev — but the migrations should be generated for completeness.

- [ ] **Step 1: Initialize Alembic if needed**

Check if `alembic/env.py` exists. If not:

```bash
cd H:/Dev42/agora && python -m alembic init alembic
```

Then update `alembic/env.py` to import models and use the async engine:
- Set `target_metadata = Base.metadata`
- Import `from agora.db.base import Base` and `from agora.db.models import *`

If `alembic.ini` doesn't have the correct `sqlalchemy.url`, set it to `sqlite+aiosqlite:///./agora.db`.

- [ ] **Step 2: Generate migration for new tables**

```bash
cd H:/Dev42/agora && python -m alembic revision --autogenerate -m "add custom_field_definitions, custom_field_values, document_templates tables"
```

Verify the generated migration creates the three new tables with correct columns and constraints.

- [ ] **Step 3: Generate migration for ProjectAgent changes**

```bash
cd H:/Dev42/agora && python -m alembic revision --autogenerate -m "add runtime and extra_flags to project_agents, remove skip_permissions"
```

Edit the generated migration to include data migration:

```python
def upgrade():
    # Add new columns
    op.add_column('project_agents', sa.Column('runtime', sa.String(50), nullable=True))
    op.add_column('project_agents', sa.Column('extra_flags', sa.Text(), nullable=True))

    # Migrate skip_permissions data
    op.execute("""
        UPDATE project_agents
        SET extra_flags = '{"skip_permissions": true}'
        WHERE skip_permissions = 1
    """)

    # Drop old column
    op.drop_column('project_agents', 'skip_permissions')
```

- [ ] **Step 4: Commit**

```bash
git add alembic/
git commit -m "feat: add Alembic migrations for custom fields, templates, and ProjectAgent changes"
```

---

## Chunk 3: Frontend — Types, Hooks, and Utility Extraction

> **Note for all frontend tasks:** UI components (`Button`, `Input`, `Modal`, `Select`, `FormField`, `Badge`, `Section`, `Tabs`) are located at `frontend/src/components/ui/`. Import from `../components/ui/` not `../components/`.

### Task 12: Update Frontend Types

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add new types and update ProjectAgent**

Add to `frontend/src/api/types.ts`:

```typescript
// Custom Fields
export interface CustomFieldDefinition {
  id: number;
  name: string;
  label: string;
  field_type: "string" | "number" | "boolean" | "enum";
  entity_type: "agent" | "project";
  options_json: string | null;
  default_value: string | null;
  required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// Document Templates
export interface DocumentTemplate {
  id: number;
  name: string;
  description: string | null;
  type_tag: string | null;
  content: string;
  project_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface RenderResponse {
  rendered_content: string;
  unresolved_variables: string[];
}
```

Update the existing `ProjectAgent` interface — replace `skip_permissions: boolean` with:
```typescript
  runtime: string | null;
  extra_flags: string | null;
```

Update the existing `LaunchConfig` interface — replace `skipPermissions: boolean` with:
```typescript
  runtime: string | null;
  extraFlags: string | null;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add CustomFieldDefinition, DocumentTemplate types and update ProjectAgent"
```

---

### Task 13: Extract File Utilities from scriptGenerator

**Files:**
- Create: `frontend/src/lib/fileUtils.ts`
- Modify: `frontend/src/lib/scriptGenerator.ts` (temporarily, before full deletion later)

- [ ] **Step 1: Create fileUtils.ts**

Read `frontend/src/lib/scriptGenerator.ts` and extract these functions into `frontend/src/lib/fileUtils.ts`:

```typescript
import JSZip from "jszip";

export function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadZip(
  files: { name: string; content: string }[],
  zipName: string
): Promise<void> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function hasFileSystemAccess(): boolean {
  return "showDirectoryPicker" in window;
}

export async function saveFilesToDisk(
  files: { name: string; content: string }[]
): Promise<void> {
  const dirHandle = await (window as any).showDirectoryPicker();
  for (const file of files) {
    const fileHandle = await dirHandle.getFileHandle(file.name, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(file.content);
    await writable.close();
  }
}
```

Note: Copy the exact implementations from `scriptGenerator.ts` — the above is the expected shape. Verify the actual code matches and adjust if needed.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/fileUtils.ts
git commit -m "feat: extract file download utilities from scriptGenerator to fileUtils"
```

---

### Task 14: Custom Fields Hooks

**Files:**
- Create: `frontend/src/hooks/useCustomFields.ts`

- [ ] **Step 1: Create custom fields hooks**

Create `frontend/src/hooks/useCustomFields.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { CustomFieldDefinition } from "../api/types";

// ── Field Definitions ──

export function useCustomFieldDefinitions(entityType?: "agent" | "project") {
  return useQuery({
    queryKey: ["custom-fields", entityType],
    queryFn: () => {
      const params = entityType ? `?entity_type=${entityType}` : "";
      return apiFetch<CustomFieldDefinition[]>(`/custom-fields${params}`);
    },
  });
}

export function useCreateFieldDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      label: string;
      field_type: string;
      entity_type: string;
      options_json?: string;
      default_value?: string;
      required?: boolean;
      sort_order?: number;
    }) =>
      apiFetch<CustomFieldDefinition>("/custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-fields"] }),
  });
}

export function useUpdateFieldDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      label?: string;
      options_json?: string;
      default_value?: string;
      required?: boolean;
      sort_order?: number;
    }) =>
      apiFetch<CustomFieldDefinition>(`/custom-fields/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-fields"] }),
  });
}

export function useDeleteFieldDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/custom-fields/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-fields"] }),
  });
}

// ── Field Values ──

export function useAgentFields(agentName: string) {
  return useQuery({
    queryKey: ["agent-fields", agentName],
    queryFn: () =>
      apiFetch<Record<string, string>>(`/agents/${agentName}/fields`),
    enabled: !!agentName,
  });
}

export function useSetAgentFields(agentName: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: Record<string, string>) =>
      apiFetch<Record<string, string>>(`/agents/${agentName}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["agent-fields", agentName] }),
  });
}

export function useProjectFields(projectSlug: string) {
  return useQuery({
    queryKey: ["project-fields", projectSlug],
    queryFn: () =>
      apiFetch<Record<string, string>>(
        `/projects/${projectSlug}/fields`
      ),
    enabled: !!projectSlug,
  });
}

export function useSetProjectFields(projectSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: Record<string, string>) =>
      apiFetch<Record<string, string>>(
        `/projects/${projectSlug}/fields`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields),
        }
      ),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["project-fields", projectSlug],
      }),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: No errors related to `useCustomFields.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useCustomFields.ts
git commit -m "feat: add React hooks for custom field definitions and values"
```

---

### Task 15: Template Hooks

**Files:**
- Create: `frontend/src/hooks/useTemplates.ts`

- [ ] **Step 1: Create template hooks**

Create `frontend/src/hooks/useTemplates.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { DocumentTemplate, RenderResponse } from "../api/types";

// ── Global Templates ──

export function useGlobalTemplates() {
  return useQuery({
    queryKey: ["templates", "global"],
    queryFn: () => apiFetch<DocumentTemplate[]>("/templates"),
  });
}

export function useCreateGlobalTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      description?: string;
      type_tag?: string;
      content: string;
    }) =>
      apiFetch<DocumentTemplate>("/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      name?: string;
      description?: string;
      type_tag?: string;
      content?: string;
    }) =>
      apiFetch<DocumentTemplate>(`/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

// ── Project Templates ──

export function useProjectTemplates(projectSlug: string) {
  return useQuery({
    queryKey: ["templates", "project", projectSlug],
    queryFn: () =>
      apiFetch<DocumentTemplate[]>(
        `/projects/${projectSlug}/templates`
      ),
    enabled: !!projectSlug,
  });
}

export function useCreateProjectTemplate(projectSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      description?: string;
      type_tag?: string;
      content: string;
    }) =>
      apiFetch<DocumentTemplate>(
        `/projects/${projectSlug}/templates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
  });
}

// ── Render ──

export function useRenderTemplate() {
  return useMutation({
    mutationFn: ({
      templateId,
      projectSlug,
      agentName,
    }: {
      templateId: number;
      projectSlug: string;
      agentName?: string;
    }) =>
      apiFetch<RenderResponse>(`/templates/${templateId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_slug: projectSlug,
          agent_name: agentName || undefined,
        }),
      }),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: No errors related to `useTemplates.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useTemplates.ts
git commit -m "feat: add React hooks for document templates and rendering"
```

---

## Chunk 4: Frontend — New Pages

### Task 16: Custom Fields Admin Page

**Files:**
- Create: `frontend/src/pages/CustomFieldsAdmin.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create CustomFieldsAdmin page**

Create `frontend/src/pages/CustomFieldsAdmin.tsx`. This page provides:
- Tabs: "Agent Fields" / "Project Fields"
- Table of field definitions with columns: Name, Label, Type, Required, Default, Actions
- "Add Field" button opens a form/modal with: name, label, field_type (dropdown), entity_type (from active tab), options_json (shown when type=enum), default_value, required checkbox
- Edit button on each row opens same form pre-filled
- Delete button with confirmation

Use existing component patterns from the codebase: `Button`, `Input`, `Modal`, `Select`, `FormField`, `Badge`, `Section`, `Tabs` from `../components/`.

The component should use hooks: `useCustomFieldDefinitions`, `useCreateFieldDefinition`, `useUpdateFieldDefinition`, `useDeleteFieldDefinition`.

Key implementation details:
- Active tab state controls `entityType` filter passed to `useCustomFieldDefinitions`
- Add/Edit modal with form state for all definition fields
- When `field_type` is "enum", show a text input for comma-separated options (convert to JSON array on save)
- Delete triggers confirmation modal

- [ ] **Step 2: Add route to App.tsx**

In `frontend/src/App.tsx`, add import:
```typescript
import CustomFieldsAdmin from "./pages/CustomFieldsAdmin";
```

Add route at the top level (sibling to `/agents`):
```typescript
<Route path="/custom-fields" element={<CustomFieldsAdmin />} />
```

- [ ] **Step 3: Verify page renders**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CustomFieldsAdmin.tsx frontend/src/App.tsx
git commit -m "feat: add Custom Fields Admin page with CRUD for field definitions"
```

---

### Task 17: Global Templates Page

**Files:**
- Create: `frontend/src/pages/TemplatesPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create TemplatesPage**

Create `frontend/src/pages/TemplatesPage.tsx`. This page provides:
- List of global templates with name, type_tag badge, description
- Type tag filter chips (All + unique type_tags from data)
- "New Template" button opens editor modal/form with: name, description, type_tag, content (textarea)
- Edit button opens same form pre-filled
- Delete button with confirmation
- Template content textarea should be a monospace code editor style

Use hooks: `useGlobalTemplates`, `useCreateGlobalTemplate`, `useUpdateTemplate`, `useDeleteTemplate`.

Key implementation details:
- Filter state for type_tag (null = all)
- Template list filtered by selected type_tag
- Modal with form for create/edit — name, description, type_tag, content
- Content textarea with placeholder showing available variables: `{{agent.name}}`, `{{project.slug}}`, etc.

- [ ] **Step 2: Add route to App.tsx**

```typescript
import TemplatesPage from "./pages/TemplatesPage";
```

Add route at the top level:
```typescript
<Route path="/templates" element={<TemplatesPage />} />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TemplatesPage.tsx frontend/src/App.tsx
git commit -m "feat: add Global Templates management page"
```

---

### Task 18: Documents Page (Project-scoped)

**Files:**
- Create: `frontend/src/pages/DocumentsPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create DocumentsPage**

Create `frontend/src/pages/DocumentsPage.tsx`. This is the project-scoped documents page at `/projects/:slug/documents`. It provides:

- Template list showing both global and project-specific templates (from `useProjectTemplates`)
- Each template row shows: name, type_tag badge, scope badge ("global" in indigo or "project" in green), description
- Type tag filter chips
- "New Template" button (creates project-scoped template via `useCreateProjectTemplate`)
- "Generate" button on each template row opens a generation modal:
  - Agent selector dropdown (optional, populated from `useProjectAgents`)
  - "Generate" button calls `useRenderTemplate` with templateId, projectSlug, and optionally agentName
  - Preview panel shows rendered content in monospace font
  - Warning badges for any `unresolved_variables`
  - Actions: "Copy" (clipboard), "Download" (single file via `downloadFile`), "Save to Disk" (via `saveFilesToDisk` if available)
- Edit/Delete buttons (only for project-scoped templates; global ones show "edit" linking to /templates page)

Use hooks: `useProjectTemplates`, `useCreateProjectTemplate`, `useUpdateTemplate`, `useDeleteTemplate`, `useRenderTemplate`, `useProjectAgents`.

Import file utilities from `../lib/fileUtils`.

- [ ] **Step 2: Add route to App.tsx**

```typescript
import DocumentsPage from "./pages/DocumentsPage";
```

Add as a child of the ProjectView route:
```typescript
<Route path="documents" element={<DocumentsPage />} />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DocumentsPage.tsx frontend/src/App.tsx
git commit -m "feat: add project Documents page with template rendering and export"
```

---

### Task 19: Update Navigation — Add Documents Link

**Files:**
- Modify: `frontend/src/pages/ProjectView.tsx` (or wherever the project sidebar/navigation lives)

- [ ] **Step 1: Find and update project navigation**

Locate the project navigation component (likely in `ProjectView.tsx` or a shared layout component). Add a "Documents" link between "Issues" and "Agents":

```typescript
{ to: "documents", label: "Documents" }
```

Also add global navigation links for `/custom-fields` and `/templates` in the main layout (likely `Layout.tsx` or `Dashboard.tsx`).

- [ ] **Step 2: Verify navigation renders**

```bash
cd H:/Dev42/agora/frontend && npm run build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ProjectView.tsx frontend/src/components/layout/Layout.tsx
git commit -m "feat: add Documents, Custom Fields, and Templates navigation links"
```

---

## Chunk 5: Frontend — Agent Management Redesign & Cleanup

### Task 20: Redesign AgentManager Page

**Files:**
- Modify: `frontend/src/pages/AgentManager.tsx`

- [ ] **Step 1: Rewrite AgentManager**

Redesign `frontend/src/pages/AgentManager.tsx` with the following changes:

**Remove:**
- All script generation code (buildConfigs, buildFiles, handleDownloadZip, handleSaveToDisk, preview tab)
- All state related to script generation (showPreview, previewTab, saveStatus)
- All imports from `scriptGenerator.ts`
- `LaunchConfig` usage

**Redesign to:**
- Card-based team roster layout (grid of agent cards instead of expand/collapse list)
- Each card shows:
  - Agent display_name and @name
  - Runtime badge (colored: "claude-code" indigo, "aider" green, other grey)
  - Role description
  - Custom field values as small chips (from `useAgentFields`)
  - Edit / Remove buttons
- Edit modal with two columns:
  - Left: Core Settings — display_name, role, runtime (dropdown/input), model, prompt_source, allowed_tools
  - Right: Custom Fields — dynamically rendered based on `useCustomFieldDefinitions("agent")`, showing appropriate inputs per field_type (text input for string, number input for number, checkbox for boolean, select for enum)
  - Bottom: System prompt (full-width textarea), Initial task (full-width textarea)
  - extra_flags shown as a JSON textarea for advanced users
- "Add Agent" modal stays similar but adds runtime field
- Link/button at bottom: "Generate documents for this team →" linking to `/projects/:slug/documents`

**Component structure:**

```
AgentManager (main page component)
├── State: showAddModal, editingAgent (ProjectAgent | null), confirmRemove
├── AgentCard (inline, rendered in CSS grid)
│   ├── Header: display_name, @name, runtime badge
│   ├── Body: role description, custom field chips
│   └── Footer: Edit / Remove buttons
├── AddAgentModal (reuse existing add flow + runtime dropdown)
│   ├── Agent selector (from useAgents, filtered to those not yet in project)
│   ├── Runtime dropdown: claude-code | aider | custom (text input)
│   └── Submit → useAddProjectAgent
└── EditAgentModal (opened when Edit clicked on a card)
    ├── Left column: Core Settings
    │   ├── display_name (text input)
    │   ├── role (text input)
    │   ├── runtime (dropdown/input)
    │   ├── model (text input)
    │   ├── prompt_source (select: append/override)
    │   └── allowed_tools (text input, comma-separated)
    ├── Right column: Custom Fields (dynamic)
    │   ├── For each field from useCustomFieldDefinitions("agent"):
    │   │   ├── string → text input
    │   │   ├── number → number input
    │   │   ├── boolean → checkbox
    │   │   └── enum → select with options from options_json
    │   └── Values loaded from useAgentFields(agentName)
    ├── Bottom full-width: system_prompt textarea, initial_task textarea
    ├── Advanced: extra_flags JSON textarea (collapsible)
    └── Save → useUpdateProjectAgent + useSetAgentFields
```

**Hooks used:**
- Existing: `useProject`, `useAgents`, `useProjectAgents`, `useAddProjectAgent`, `useUpdateProjectAgent`, `useRemoveProjectAgent`
- New: `useCustomFieldDefinitions("agent")`, `useAgentFields(agentName)`, `useSetAgentFields(agentName)`

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AgentManager.tsx
git commit -m "feat: redesign AgentManager with card layout, custom fields, and runtime support"
```

---

### Task 21: Delete scriptGenerator.ts

**Files:**
- Delete: `frontend/src/lib/scriptGenerator.ts`

- [ ] **Step 1: Verify no remaining imports**

```bash
cd H:/Dev42/agora/frontend && grep -r "scriptGenerator" src/ --include="*.ts" --include="*.tsx"
```

Expected: No results (AgentManager was already updated in Task 20 — Redesign AgentManager Page).

- [ ] **Step 2: Delete the file**

```bash
rm frontend/src/lib/scriptGenerator.ts
```

- [ ] **Step 3: Verify build**

```bash
cd H:/Dev42/agora/frontend && npm run build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/lib/scriptGenerator.ts
git commit -m "chore: delete scriptGenerator.ts (replaced by document templates)"
```

---

### Task 22: Seed Default Templates

**Files:**
- Create: `src/agora/seeds/__init__.py`
- Create: `src/agora/seeds/default_templates.py`
- Modify: `src/agora/api/app.py`

- [ ] **Step 1: Create default template seed**

Create directory `src/agora/seeds/` with an `__init__.py`, then create `src/agora/seeds/default_templates.py`:

```python
"""Seed default global document templates."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agora.db.models.template import DocumentTemplate


CLAUDE_CODE_STARTUP_SH = """#!/bin/bash
# Startup script for {{agent.name}} on project {{project.name}}
cd "{{project.working_dir}}"

agora login {{agent.name}} --project {{project.slug}} --server {{platform.server_url}}

claude \\
  --{{agent.prompt_source}}-system-prompt "{{agent.system_prompt}}" \\
  --model {{agent.model}} \\
  "{{agent.initial_task}}"
"""

CLAUDE_CODE_STARTUP_BAT = """@echo off
REM Startup script for {{agent.name}} on project {{project.name}}
cd /d "{{project.working_dir}}"

call agora login {{agent.name}} --project {{project.slug}} --server {{platform.server_url}}

claude ^
  --{{agent.prompt_source}}-system-prompt "{{agent.system_prompt}}" ^
  --model {{agent.model}} ^
  "{{agent.initial_task}}"
"""

SYSTEM_PROMPT_TEMPLATE = """You are {{agent.display_name}}, working on the {{project.name}} project.

Role: {{agent.role}}

Project: {{project.description}}
"""


DEFAULT_TEMPLATES = [
    {
        "name": "Claude Code Startup Script (Unix)",
        "description": "Shell script to launch a Claude Code agent",
        "type_tag": "startup-script",
        "content": CLAUDE_CODE_STARTUP_SH.strip(),
    },
    {
        "name": "Claude Code Startup Script (Windows)",
        "description": "Batch script to launch a Claude Code agent",
        "type_tag": "startup-script",
        "content": CLAUDE_CODE_STARTUP_BAT.strip(),
    },
    {
        "name": "Agent System Prompt",
        "description": "Basic system prompt template for any agent",
        "type_tag": "system-prompt",
        "content": SYSTEM_PROMPT_TEMPLATE.strip(),
    },
]


async def seed_default_templates(db: AsyncSession) -> None:
    """Insert default global templates if they don't already exist."""
    for tmpl_data in DEFAULT_TEMPLATES:
        existing = await db.execute(
            select(DocumentTemplate).where(
                DocumentTemplate.name == tmpl_data["name"],
                DocumentTemplate.project_id.is_(None),
            )
        )
        if not existing.scalar_one_or_none():
            db.add(DocumentTemplate(**tmpl_data, project_id=None))
    await db.commit()
```

- [ ] **Step 2: Call seed in app lifespan**

In `src/agora/api/app.py`, in the `lifespan` function, after `await conn.run_sync(Base.metadata.create_all)`, add:

```python
from agora.seeds.default_templates import seed_default_templates
from agora.db.engine import async_session

async with async_session() as session:
    await seed_default_templates(session)
```

This uses the existing `async_session` factory from `engine.py`.

- [ ] **Step 3: Verify server starts and templates are seeded**

```bash
cd H:/Dev42/agora && python -m uvicorn agora.api.app:app --port 8321 &
sleep 2
curl -s http://localhost:8321/api/templates | python -m json.tool
kill %1
```

Expected: Returns 3 default templates.

- [ ] **Step 4: Commit**

```bash
git add src/agora/seeds/__init__.py src/agora/seeds/default_templates.py src/agora/api/app.py
git commit -m "feat: seed default global templates (startup scripts + system prompt)"
```

---

### Task 23: Final Build Verification

- [ ] **Step 1: Backend verification**

```bash
cd H:/Dev42/agora && python -c "from agora.api.app import app; print('Backend OK')"
```

- [ ] **Step 2: Frontend build**

```bash
cd H:/Dev42/agora/frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Full integration test**

```bash
cd H:/Dev42/agora && python -m uvicorn agora.api.app:app --port 8321 &
sleep 2

# Test custom fields
curl -s -X POST http://localhost:8321/api/custom-fields \
  -H "Content-Type: application/json" \
  -d '{"name":"test_field","label":"Test","field_type":"string","entity_type":"agent"}'

# Test templates
curl -s http://localhost:8321/api/templates

# Test template render
TEMPLATE_ID=$(curl -s http://localhost:8321/api/templates | python -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
curl -s -X POST "http://localhost:8321/api/templates/${TEMPLATE_ID}/render" \
  -H "Content-Type: application/json" \
  -d '{"project_slug":"test"}' | python -m json.tool

kill %1
```

Expected: All requests succeed.

- [ ] **Step 4: Commit any fixes**

If any issues were found and fixed during verification, commit only the specific files that were changed:

```bash
git add <specific-files-that-were-fixed>
git commit -m "fix: address issues found during integration verification"
```
