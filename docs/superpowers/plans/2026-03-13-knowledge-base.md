# Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, searchable document store with cross-reference mentions to the Agora multi-agent platform.

**Architecture:** New KBDocument model with FTS5 virtual table for search, Mention model for cross-references parsed from chat messages/issues/comments. Full CRUD API, CLI commands via Typer, and a two-panel React frontend with tree navigation, markdown editor, and mention rendering.

**Tech Stack:** FastAPI, async SQLAlchemy + SQLite + FTS5, Pydantic v2, Typer CLI, React 19 + TypeScript + TanStack React Query + React Router 7

**Spec:** `docs/superpowers/specs/2026-03-13-knowledge-base-design.md`

---

## Chunk 1: Backend Models & Schemas

### Task 1: KBDocument Model

**Files:**
- Create: `src/agora/db/models/kb_document.py`
- Modify: `src/agora/db/models/__init__.py`
- Modify: `src/agora/db/engine.py`

- [ ] **Step 1: Create KBDocument model**

Create `src/agora/db/models/kb_document.py`:

```python
"""Knowledge base document model."""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from agora.db.base import Base


class KBDocument(Base):
    __tablename__ = "kb_documents"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    path = Column(String(500), nullable=False)
    title = Column(String(200), nullable=False)
    tags = Column(Text, nullable=True)
    content = Column(Text, nullable=False, default="")
    created_by = Column(String(100), nullable=False)
    updated_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("project_id", "path", name="uq_kb_document_project_path"),
    )
```

- [ ] **Step 2: Add to model imports**

In `src/agora/db/models/__init__.py`, add:

```python
from agora.db.models.kb_document import KBDocument
```

And add `KBDocument` to the `__all__` list if one exists.

In `src/agora/db/engine.py`, add `KBDocument` to the import block:

```python
from agora.db.models import (
    # ... existing imports ...
    KBDocument,
)
```

- [ ] **Step 3: Verify module loads**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "from agora.db.models.kb_document import KBDocument; print('OK:', KBDocument.__tablename__)"
```

Expected: `OK: kb_documents`

- [ ] **Step 4: Commit**

```bash
git add src/agora/db/models/kb_document.py src/agora/db/models/__init__.py src/agora/db/engine.py
git commit -m "feat: add KBDocument model for knowledge base"
```

---

### Task 2: Mention Model

**Files:**
- Create: `src/agora/db/models/mention.py`
- Modify: `src/agora/db/models/__init__.py`
- Modify: `src/agora/db/engine.py`

- [ ] **Step 1: Create Mention model**

Create `src/agora/db/models/mention.py`:

```python
"""Cross-reference mention model for kb: and #N links."""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from agora.db.base import Base


class Mention(Base):
    __tablename__ = "mentions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(String(20), nullable=False)  # "message", "issue_comment", "issue_body"
    source_id = Column(Integer, nullable=False, index=True)
    mention_type = Column(String(10), nullable=False)  # "kb" or "issue"
    target_path = Column(String(500), nullable=True)  # for kb: mentions
    target_issue_number = Column(Integer, nullable=True)  # for #N mentions
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 2: Add to model imports**

In `src/agora/db/models/__init__.py`, add:

```python
from agora.db.models.mention import Mention
```

In `src/agora/db/engine.py`, add `Mention` to the import block.

- [ ] **Step 3: Verify module loads**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "from agora.db.models.mention import Mention; print('OK:', Mention.__tablename__)"
```

Expected: `OK: mentions`

- [ ] **Step 4: Commit**

```bash
git add src/agora/db/models/mention.py src/agora/db/models/__init__.py src/agora/db/engine.py
git commit -m "feat: add Mention model for cross-references"
```

---

### Task 3: KB Pydantic Schemas

**Files:**
- Create: `src/agora/schemas/kb.py`

- [ ] **Step 1: Create KB schemas**

Create `src/agora/schemas/kb.py`:

```python
"""Pydantic schemas for knowledge base documents."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class KBDocumentCreate(BaseModel):
    path: str = Field(..., min_length=1, max_length=500)
    title: Optional[str] = Field(None, max_length=200)
    tags: Optional[str] = None  # comma-separated
    content: str = Field(..., min_length=0)
    author: str = Field(..., min_length=1, max_length=100)


class KBDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    path: str
    title: str
    tags: Optional[str] = None
    content: str
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime


class KBDocumentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    path: str
    title: str
    tags: Optional[str] = None
    updated_by: str
    updated_at: datetime


class KBDocumentMove(BaseModel):
    new_path: str = Field(..., min_length=1, max_length=500)


class KBSearchResult(BaseModel):
    path: str
    title: str
    snippet: str
    rank: float


class KBTreeNode(BaseModel):
    name: str
    path: Optional[str] = None  # only for leaf nodes (files)
    title: Optional[str] = None  # only for leaf nodes
    children: Optional[list["KBTreeNode"]] = None  # only for directory nodes
```

- [ ] **Step 2: Verify module loads**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "from agora.schemas.kb import KBDocumentCreate, KBDocumentOut, KBSearchResult, KBTreeNode; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/agora/schemas/kb.py
git commit -m "feat: add Pydantic schemas for knowledge base"
```

---

### Task 4: Mention Pydantic Schemas

**Files:**
- Create: `src/agora/schemas/mention.py`

- [ ] **Step 1: Create Mention schemas**

Create `src/agora/schemas/mention.py`:

```python
"""Pydantic schemas for cross-reference mentions."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class MentionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_type: str
    source_id: int
    mention_type: str
    target_path: Optional[str] = None
    target_issue_number: Optional[int] = None
    created_at: datetime
```

- [ ] **Step 2: Verify module loads**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "from agora.schemas.mention import MentionOut; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/agora/schemas/mention.py
git commit -m "feat: add Pydantic schemas for mentions"
```

---

### Task 5: KB Service

**Files:**
- Create: `src/agora/services/kb_service.py`

This service handles section extraction, tree building, tag matching, and FTS5 sync.

- [ ] **Step 1: Create KB service**

Create `src/agora/services/kb_service.py`:

```python
"""Knowledge base service — section extraction, tree building, FTS sync."""

import re
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from agora.db.models.kb_document import KBDocument

# Note: The spec mentions SQLAlchemy event listeners for FTS sync, but async
# sessions do not support synchronous event hooks. FTS sync is done via
# explicit async calls (fts_insert/fts_update/fts_delete) in the route handlers.


# ── Section Extraction ──────────────────────────────────────────


def extract_section(content: str, section_name: str) -> Optional[str]:
    """Extract a section from markdown content by header text.

    Returns content from the matched header down to the next header
    of equal or higher level. Case-insensitive match.
    Returns None if no matching section found.
    """
    lines = content.split("\n")
    result_lines: list[str] = []
    capturing = False
    capture_level = 0

    for line in lines:
        header_match = re.match(r"^(#{1,6})\s+(.+)$", line)
        if header_match:
            level = len(header_match.group(1))
            header_text = header_match.group(2).strip()
            if capturing:
                # Stop at same or higher level header
                if level <= capture_level:
                    break
            elif header_text.lower() == section_name.lower():
                capturing = True
                capture_level = level
                result_lines.append(line)
                continue
        if capturing:
            result_lines.append(line)

    if not result_lines:
        return None
    return "\n".join(result_lines).strip()


# ── Tree Building ────────────────────────────────────────────────


def build_tree(docs: list[dict]) -> list[dict]:
    """Build a nested tree structure from flat document list.

    Input: [{"path": "a/b.md", "title": "B"}, ...]
    Output: [{"name": "a", "children": [{"name": "b.md", "path": "a/b.md", "title": "B"}]}]
    """
    root: dict = {}

    for doc in docs:
        parts = doc["path"].split("/")
        node = root
        for i, part in enumerate(parts):
            if part not in node:
                node[part] = {}
            if i < len(parts) - 1:
                if "__children__" not in node[part]:
                    node[part]["__children__"] = {}
                node = node[part]["__children__"]
            else:
                node[part]["__leaf__"] = doc

    def _to_list(node: dict) -> list[dict]:
        result = []
        for name, value in sorted(node.items()):
            if "__leaf__" in value:
                leaf = value["__leaf__"]
                result.append({"name": name, "path": leaf["path"], "title": leaf["title"]})
            elif "__children__" in value:
                result.append({"name": name, "children": _to_list(value["__children__"])})
            else:
                result.append({"name": name, "children": _to_list(value)})
        return result

    return _to_list(root)


# ── Tag Matching ─────────────────────────────────────────────────


def tags_contain(tags_csv: Optional[str], tag: str) -> bool:
    """Check if a comma-separated tags string contains an exact tag match."""
    if not tags_csv:
        return False
    return tag.strip().lower() in [t.strip().lower() for t in tags_csv.split(",")]


# ── FTS5 Sync ────────────────────────────────────────────────────


async def create_fts_table(db: AsyncSession) -> None:
    """Create FTS5 virtual table if it doesn't exist."""
    await db.execute(text("""
        CREATE VIRTUAL TABLE IF NOT EXISTS kb_document_fts USING fts5(
            title, content, tags,
            content='kb_documents',
            content_rowid='id'
        )
    """))
    await db.commit()


async def fts_insert(db: AsyncSession, doc_id: int, title: str, content: str, tags: str) -> None:
    """Insert a document into the FTS index."""
    await db.execute(
        text("INSERT INTO kb_document_fts(rowid, title, content, tags) VALUES (:id, :title, :content, :tags)"),
        {"id": doc_id, "title": title, "content": content, "tags": tags or ""},
    )


async def fts_delete(db: AsyncSession, doc_id: int, title: str, content: str, tags: str) -> None:
    """Delete a document from the FTS index."""
    await db.execute(
        text("INSERT INTO kb_document_fts(kb_document_fts, rowid, title, content, tags) VALUES('delete', :id, :title, :content, :tags)"),
        {"id": doc_id, "title": title, "content": content, "tags": tags or ""},
    )


async def fts_update(db: AsyncSession, doc_id: int, old_title: str, old_content: str, old_tags: str, new_title: str, new_content: str, new_tags: str) -> None:
    """Update a document in the FTS index (delete old + insert new)."""
    await fts_delete(db, doc_id, old_title, old_content, old_tags)
    await fts_insert(db, doc_id, new_title, new_content, new_tags)
```

- [ ] **Step 2: Verify module loads**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "
from agora.services.kb_service import extract_section, build_tree, tags_contain

# Test section extraction
md = '''# Doc
## Intro
Hello world
## Details
Some details
## End
Bye'''
result = extract_section(md, 'Details')
assert result == '## Details\nSome details', f'Got: {result}'

# Test tree building
docs = [{'path': 'a/b.md', 'title': 'B'}, {'path': 'a/c.md', 'title': 'C'}, {'path': 'd.md', 'title': 'D'}]
tree = build_tree(docs)
assert len(tree) == 2  # 'a' dir and 'd.md' file
assert tree[0]['name'] == 'a'
assert len(tree[0]['children']) == 2

# Test tag matching
assert tags_contain('api,rest,auth', 'api') == True
assert tags_contain('api,rest,auth', 'ap') == False
assert tags_contain(None, 'api') == False

print('All KB service tests passed')
"
```

Expected: `All KB service tests passed`

- [ ] **Step 3: Commit**

```bash
git add src/agora/services/kb_service.py
git commit -m "feat: add KB service with section extraction, tree building, and FTS5 sync"
```

---

### Task 6: Mention Service

**Files:**
- Create: `src/agora/services/mention_service.py`

- [ ] **Step 1: Create mention service**

Create `src/agora/services/mention_service.py`:

```python
"""Mention parsing and storage service for kb: and #N cross-references."""

import logging
import re

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from agora.db.models.mention import Mention

logger = logging.getLogger("agora")

# Patterns for mention extraction
KB_PATTERN = re.compile(r"kb:([^\s]+)")
ISSUE_PATTERN = re.compile(r"(?<![&#/\w])#(\d+)")

# Pattern to strip code blocks before parsing
CODE_FENCE_PATTERN = re.compile(r"```[\s\S]*?```|`[^`]+`")


def extract_mentions(text: str) -> list[tuple[str, str]]:
    """Extract mentions from text content.

    Returns list of (mention_type, target) tuples:
    - ("kb", "path/to/doc.md")
    - ("kb", "path/to/doc.md#Section")
    - ("issue", "7")
    """
    # Strip code blocks to avoid false positives
    cleaned = CODE_FENCE_PATTERN.sub("", text)

    mentions: list[tuple[str, str]] = []

    for match in KB_PATTERN.finditer(cleaned):
        mentions.append(("kb", match.group(1)))

    for match in ISSUE_PATTERN.finditer(cleaned):
        mentions.append(("issue", match.group(1)))

    return mentions


async def store_mentions(
    project_id: int,
    source_type: str,
    source_id: int,
    text: str,
    db: AsyncSession,
) -> None:
    """Extract mentions from text and store them. Replaces any existing mentions for this source."""
    try:
        # Delete existing mentions for this source (handles edits)
        await db.execute(
            delete(Mention).where(
                Mention.project_id == project_id,
                Mention.source_type == source_type,
                Mention.source_id == source_id,
            )
        )

        # Extract and insert new mentions
        mentions = extract_mentions(text)
        for mention_type, target in mentions:
            mention = Mention(
                project_id=project_id,
                source_type=source_type,
                source_id=source_id,
                mention_type=mention_type,
                target_path=target if mention_type == "kb" else None,
                target_issue_number=int(target) if mention_type == "issue" else None,
            )
            db.add(mention)

        # Don't commit here — let the caller commit as part of their transaction
    except Exception:
        logger.exception("Failed to store mentions for %s/%s", source_type, source_id)


async def update_mention_paths(
    project_id: int,
    old_path: str,
    new_path: str,
    db: AsyncSession,
) -> None:
    """Update all mentions referencing old_path to point to new_path. Called on document move."""
    await db.execute(
        update(Mention)
        .where(
            Mention.project_id == project_id,
            Mention.mention_type == "kb",
            Mention.target_path == old_path,
        )
        .values(target_path=new_path)
    )
```

- [ ] **Step 2: Verify module loads and test parsing**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "
from agora.services.mention_service import extract_mentions

# Basic mentions
result = extract_mentions('See kb:docs/api.md and issue #7')
assert ('kb', 'docs/api.md') in result
assert ('issue', '7') in result

# Section reference
result = extract_mentions('Read kb:arch/design.md#Auth for details')
assert ('kb', 'arch/design.md#Auth') in result

# Code block stripping
result = extract_mentions('Use \`#123\` in code, but #456 is a real ref')
assert ('issue', '456') in result
assert ('issue', '123') not in result

# False positive avoidance
result = extract_mentions('HTML entity &#123; and URL /path#42')
issue_nums = [t for typ, t in result if typ == 'issue']
assert '123' not in issue_nums
assert '42' not in issue_nums

print('All mention parsing tests passed')
"
```

Expected: `All mention parsing tests passed`

- [ ] **Step 3: Commit**

```bash
git add src/agora/services/mention_service.py
git commit -m "feat: add mention service with parsing, storage, and path updates"
```

---

## Chunk 2: Backend API Routes & Integration

### Task 7: FTS5 Table Creation in App Lifespan

**Files:**
- Modify: `src/agora/api/app.py`

- [ ] **Step 1: Add FTS5 table creation to lifespan**

In `src/agora/api/app.py`, in the `lifespan` function, after the `seed_default_templates` block (after `await seed_default_templates(session)`), add:

```python
    from agora.services.kb_service import create_fts_table

    async with async_session() as session:
        await create_fts_table(session)
```

Note: This reuses the existing `async_session` import already present from the seed templates block.

- [ ] **Step 2: Verify app loads**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "from agora.api.app import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/agora/api/app.py
git commit -m "feat: create FTS5 virtual table on app startup"
```

---

### Task 8: KB API Routes

**Files:**
- Create: `src/agora/api/routes/kb.py`
- Modify: `src/agora/api/app.py`

- [ ] **Step 1: Create KB routes**

Create `src/agora/api/routes/kb.py`:

```python
"""Knowledge base document CRUD, search, and tree endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from agora.db.engine import get_db
from agora.db.models.kb_document import KBDocument
from agora.schemas.kb import (
    KBDocumentCreate,
    KBDocumentMove,
    KBDocumentOut,
    KBDocumentSummary,
    KBSearchResult,
    KBTreeNode,
)
from agora.api.deps import require_project
from agora.services.kb_service import (
    build_tree,
    extract_section,
    fts_delete,
    fts_insert,
    fts_update,
    tags_contain,
)
from agora.services.mention_service import update_mention_paths

router = APIRouter(prefix="/api/projects/{project_slug}/kb", tags=["Knowledge Base"])


# ── Fixed routes MUST come before {path:path} catch-all ──────────


@router.get("/search", response_model=list[KBSearchResult])
async def search_documents(
    project_slug: str,
    q: str = Query(..., min_length=1),
    tag: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project(project_slug, db)
    result = await db.execute(
        text("""
            SELECT kd.path, kd.title, kd.tags,
                   snippet(kb_document_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
                   bm25(kb_document_fts) as rank
            FROM kb_document_fts
            JOIN kb_documents kd ON kd.id = kb_document_fts.rowid
            WHERE kb_document_fts MATCH :query AND kd.project_id = :project_id
            ORDER BY rank
            LIMIT :limit
        """),
        {"query": q, "project_id": project.id, "limit": limit},
    )
    rows = result.all()
    results = []
    for row in rows:
        if tag and not tags_contain(row.tags, tag):
            continue
        results.append(KBSearchResult(path=row.path, title=row.title, snippet=row.snippet, rank=row.rank))
    return results


@router.get("/tree", response_model=list[KBTreeNode])
async def get_document_tree(
    project_slug: str,
    db: AsyncSession = Depends(get_db),
):
    project = await require_project(project_slug, db)
    result = await db.execute(
        select(KBDocument.path, KBDocument.title)
        .where(KBDocument.project_id == project.id)
        .order_by(KBDocument.path)
    )
    docs = [{"path": row.path, "title": row.title} for row in result.all()]
    return build_tree(docs)


# ── CRUD routes ──────────────────────────────────────────────────


@router.post("", status_code=201)
async def create_or_replace_document(
    project_slug: str,
    body: KBDocumentCreate,
    db: AsyncSession = Depends(get_db),
):
    project = await require_project(project_slug, db)
    title = body.title or body.path.rsplit("/", 1)[-1]

    # Check if document already exists (upsert)
    result = await db.execute(
        select(KBDocument).where(
            KBDocument.project_id == project.id,
            KBDocument.path == body.path,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        old_title, old_content, old_tags = existing.title, existing.content, existing.tags
        existing.title = title
        existing.tags = body.tags
        existing.content = body.content
        existing.updated_by = body.author
        await db.flush()
        await fts_update(db, existing.id, old_title, old_content, old_tags or "", title, body.content, body.tags or "")
        await db.commit()
        await db.refresh(existing)
        return JSONResponse(
            status_code=200,
            content=KBDocumentOut.model_validate(existing).model_dump(mode="json"),
        )
    else:
        doc = KBDocument(
            project_id=project.id,
            path=body.path,
            title=title,
            tags=body.tags,
            content=body.content,
            created_by=body.author,
            updated_by=body.author,
        )
        db.add(doc)
        await db.flush()
        await fts_insert(db, doc.id, title, body.content, body.tags or "")
        await db.commit()
        await db.refresh(doc)
        return JSONResponse(
            status_code=201,
            content=KBDocumentOut.model_validate(doc).model_dump(mode="json"),
        )


@router.get("", response_model=list[KBDocumentSummary])
async def list_documents(
    project_slug: str,
    prefix: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project(project_slug, db)
    stmt = select(KBDocument).where(KBDocument.project_id == project.id)
    if prefix:
        stmt = stmt.where(KBDocument.path.startswith(prefix))
    stmt = stmt.order_by(KBDocument.path)
    result = await db.execute(stmt)
    docs = result.scalars().all()
    if tag:
        docs = [d for d in docs if tags_contain(d.tags, tag)]
    return docs


@router.get("/{path:path}", response_model=KBDocumentOut)
async def read_document(
    project_slug: str,
    path: str,
    section: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project(project_slug, db)
    result = await db.execute(
        select(KBDocument).where(
            KBDocument.project_id == project.id,
            KBDocument.path == path,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, f"Document '{path}' not found")

    if section:
        section_content = extract_section(doc.content, section)
        if section_content is not None:
            # Return doc with only the section content
            out = KBDocumentOut.model_validate(doc)
            out.content = section_content
            return out
        # Section not found — return full document (spec: "return full document with empty section_match")

    return doc


@router.delete("/{path:path}", status_code=204)
async def delete_document(
    project_slug: str,
    path: str,
    db: AsyncSession = Depends(get_db),
):
    project = await require_project(project_slug, db)
    result = await db.execute(
        select(KBDocument).where(
            KBDocument.project_id == project.id,
            KBDocument.path == path,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, f"Document '{path}' not found")
    await fts_delete(db, doc.id, doc.title, doc.content, doc.tags or "")
    await db.delete(doc)
    await db.commit()


@router.patch("/{path:path}/move", response_model=KBDocumentOut)
async def move_document(
    project_slug: str,
    path: str,
    body: KBDocumentMove,
    db: AsyncSession = Depends(get_db),
):
    project = await require_project(project_slug, db)
    result = await db.execute(
        select(KBDocument).where(
            KBDocument.project_id == project.id,
            KBDocument.path == path,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, f"Document '{path}' not found")

    # Check target doesn't already exist
    conflict = await db.execute(
        select(KBDocument).where(
            KBDocument.project_id == project.id,
            KBDocument.path == body.new_path,
        )
    )
    if conflict.scalar_one_or_none():
        raise HTTPException(409, f"Document '{body.new_path}' already exists")

    doc.path = body.new_path
    await update_mention_paths(project.id, path, body.new_path, db)
    await db.commit()
    await db.refresh(doc)
    return doc
```

- [ ] **Step 2: Register router in app.py**

In `src/agora/api/app.py`, add the import and registration:

```python
from agora.api.routes.kb import router as kb_router
```

And:

```python
app.include_router(kb_router)
```

- [ ] **Step 3: Verify app loads with correct route count**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "from agora.api.app import app; print(f'OK: {len(app.routes)} routes')"
```

Expected: Route count increases (should be ~116+).

- [ ] **Step 4: Commit**

```bash
git add src/agora/api/routes/kb.py src/agora/api/app.py
git commit -m "feat: add KB API routes (CRUD, search, tree, move)"
```

---

### Task 9: Mention API Routes

**Files:**
- Create: `src/agora/api/routes/mentions.py`
- Modify: `src/agora/api/app.py`

- [ ] **Step 1: Create mention routes**

Create `src/agora/api/routes/mentions.py`:

```python
"""Reverse lookup endpoint for cross-reference mentions."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agora.db.engine import get_db
from agora.db.models.mention import Mention
from agora.db.models.project import Project
from agora.schemas.mention import MentionOut

router = APIRouter(prefix="/api/projects/{project_slug}/mentions", tags=["Mentions"])


@router.get("", response_model=list[MentionOut])
async def get_mentions(
    project_slug: str,
    kb_path: Optional[str] = Query(None),
    issue_number: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.slug == project_slug))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, f"Project '{project_slug}' not found")

    stmt = select(Mention).where(Mention.project_id == project.id)

    if kb_path:
        stmt = stmt.where(Mention.mention_type == "kb", Mention.target_path == kb_path)
    elif issue_number is not None:
        stmt = stmt.where(Mention.mention_type == "issue", Mention.target_issue_number == issue_number)
    else:
        raise HTTPException(400, "Provide either kb_path or issue_number query parameter")

    stmt = stmt.order_by(Mention.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()
```

- [ ] **Step 2: Register router in app.py**

In `src/agora/api/app.py`, add:

```python
from agora.api.routes.mentions import router as mentions_router
```

And:

```python
app.include_router(mentions_router)
```

- [ ] **Step 3: Verify app loads**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "from agora.api.app import app; print(f'OK: {len(app.routes)} routes')"
```

- [ ] **Step 4: Commit**

```bash
git add src/agora/api/routes/mentions.py src/agora/api/app.py
git commit -m "feat: add mention reverse lookup API endpoint"
```

---

### Task 10: Integrate Mention Extraction into Chat & Tasks

**Files:**
- Modify: `src/agora/api/routes/chat.py`
- Modify: `src/agora/api/routes/tasks.py`

- [ ] **Step 1: Add mention extraction to chat message creation**

In `src/agora/api/routes/chat.py`, add this import at the top:

```python
from agora.services.mention_service import store_mentions
```

In the `post_message()` function (around line 214), after `await db.refresh(msg, ["reactions"])` and before the `return`, add:

```python
    await store_mentions(project.id, "message", msg.id, body.content, db)
    await db.commit()
```

In the `edit_message()` function (around line 303), after `await db.commit()`, add:

```python
    await store_mentions(project.id, "message", msg.id, body.content, db)
    await db.commit()
```

- [ ] **Step 2: Add mention extraction to task/issue routes**

In `src/agora/api/routes/tasks.py`, add this import at the top:

```python
from agora.services.mention_service import store_mentions
```

In the `create_issue()` function (around line 150), after the issue is created and committed (after `svc_create_issue` returns), add:

```python
    if issue.body:
        await store_mentions(project.id, "issue_body", issue.id, issue.body, db)
        await db.commit()
```

In the `update_issue()` function (around line 244), after the update is committed, add:

```python
    if body.body is not None:
        await store_mentions(project.id, "issue_body", issue.id, body.body, db)
        await db.commit()
```

In the `add_comment()` function (around line 283), after `await db.refresh(comment)`, add:

```python
    await store_mentions(project.id, "issue_comment", comment.id, body.body, db)
    await db.commit()
```

- [ ] **Step 3: Verify app loads**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "from agora.api.app import app; print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add src/agora/api/routes/chat.py src/agora/api/routes/tasks.py
git commit -m "feat: integrate mention extraction into chat and issue save flows"
```

---

## Chunk 3: CLI Commands

### Task 11: KB CLI Commands

**Files:**
- Create: `src/agora/cli/kb_commands.py`
- Modify: `src/agora/cli/main.py`

- [ ] **Step 1: Create KB CLI commands**

Create `src/agora/cli/kb_commands.py`:

```python
"""CLI commands for knowledge base operations."""

import sys
from typing import Optional

import typer

from agora.cli.auth import api_request, require_session

kb_app = typer.Typer(help="Knowledge base commands")


def _project_slug(session: dict) -> str:
    slug = session.get("project")
    if not slug:
        raise SystemExit("No project set. Run: agora login <name> --project SLUG")
    return slug


@kb_app.command("write")
def write(
    path: str = typer.Argument(..., help="Document path, e.g. architecture/api-design.md"),
    title: Optional[str] = typer.Option(None, "--title", "-t", help="Document title"),
    tags: Optional[str] = typer.Option(None, "--tags", help="Comma-separated tags"),
    body: Optional[str] = typer.Option(None, "--body", "-b", help="Document content (or pipe via stdin)"),
):
    """Create or replace a knowledge base document."""
    session = require_session()
    slug = _project_slug(session)

    if body is None:
        if sys.stdin.isatty():
            raise SystemExit("Provide --body or pipe content via stdin")
        body = sys.stdin.read()

    payload: dict = {
        "path": path,
        "content": body,
        "author": session["agent_name"],
    }
    if title:
        payload["title"] = title
    if tags:
        payload["tags"] = tags

    # Use direct httpx call to get status code (201=created, 200=updated)
    import httpx
    url = f"{session['server_url']}/api/projects/{slug}/kb"
    headers = {}
    if session.get("session_token"):
        headers["Authorization"] = f"Bearer {session['session_token']}"
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        result = resp.json()
        action = "Created" if resp.status_code == 201 else "Updated"
        typer.echo(f"{action}: {result['path']}")


@kb_app.command("read")
def read(
    path: str = typer.Argument(..., help="Document path, e.g. architecture/api-design.md"),
    section: Optional[str] = typer.Option(None, "--section", "-s", help="Section header to extract"),
):
    """Read a knowledge base document (or a specific section)."""
    session = require_session()
    slug = _project_slug(session)

    params = {}
    if section:
        params["section"] = section

    result = api_request("GET", f"/api/projects/{slug}/kb/{path}", params=params)
    if isinstance(result, dict):
        typer.echo(result["content"])


@kb_app.command("list")
def list_docs(
    prefix: Optional[str] = typer.Argument(None, help="Path prefix to filter, e.g. architecture/"),
    tag: Optional[str] = typer.Option(None, "--tag", help="Filter by tag"),
):
    """List knowledge base documents."""
    session = require_session()
    slug = _project_slug(session)

    params: dict = {}
    if prefix:
        params["prefix"] = prefix
    if tag:
        params["tag"] = tag

    result = api_request("GET", f"/api/projects/{slug}/kb", params=params)
    if isinstance(result, list):
        for doc in result:
            typer.echo(f"{doc['path']} — \"{doc['title']}\"")
        if not result:
            typer.echo("No documents found.")


@kb_app.command("search")
def search(
    query: str = typer.Argument(..., help="Search query"),
    tag: Optional[str] = typer.Option(None, "--tag", help="Filter by tag"),
    limit: int = typer.Option(20, "--limit", "-n", help="Max results"),
):
    """Full-text search across knowledge base documents."""
    session = require_session()
    slug = _project_slug(session)

    params: dict = {"q": query, "limit": limit}
    if tag:
        params["tag"] = tag

    result = api_request("GET", f"/api/projects/{slug}/kb/search", params=params)
    if isinstance(result, list):
        for doc in result:
            typer.echo(f"{doc['path']} — {doc['snippet']}")
        if not result:
            typer.echo("No results found.")


@kb_app.command("tree")
def tree():
    """Display the knowledge base document tree."""
    session = require_session()
    slug = _project_slug(session)

    result = api_request("GET", f"/api/projects/{slug}/kb/tree")

    def _print_tree(nodes: list, indent: int = 0) -> None:
        for node in nodes:
            prefix = "  " * indent
            if node.get("children"):
                typer.echo(f"{prefix}{node['name']}/")
                _print_tree(node["children"], indent + 1)
            else:
                typer.echo(f"{prefix}{node['name']} — \"{node.get('title', '')}\"")

    if isinstance(result, list):
        if result:
            _print_tree(result)
        else:
            typer.echo("Knowledge base is empty.")


@kb_app.command("move")
def move(
    old_path: str = typer.Argument(..., help="Current document path"),
    new_path: str = typer.Argument(..., help="New document path"),
):
    """Move or rename a document."""
    session = require_session()
    slug = _project_slug(session)

    api_request("PATCH", f"/api/projects/{slug}/kb/{old_path}/move", body={"new_path": new_path})
    typer.echo(f"Moved {old_path} → {new_path}")


@kb_app.command("delete")
def delete(
    path: str = typer.Argument(..., help="Document path to delete"),
):
    """Delete a knowledge base document."""
    session = require_session()
    slug = _project_slug(session)

    api_request("DELETE", f"/api/projects/{slug}/kb/{path}")
    typer.echo(f"Deleted {path}")
```

- [ ] **Step 2: Register in main.py**

In `src/agora/cli/main.py`, add the import:

```python
from agora.cli.kb_commands import kb_app
```

And register:

```python
app.add_typer(kb_app, name="kb", help="Knowledge base commands")
```

- [ ] **Step 3: Verify CLI loads**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -m agora.cli.main kb --help
```

Expected: Shows kb subcommands (write, read, list, search, tree, move, delete).

- [ ] **Step 4: Commit**

```bash
git add src/agora/cli/kb_commands.py src/agora/cli/main.py
git commit -m "feat: add agora kb CLI commands (write, read, list, search, tree, move, delete)"
```

---

## Chunk 4: Frontend — Types, Hooks, Components

> **Note for all frontend tasks:** UI components (`Button`, `Input`, `Modal`, `Select`, `FormField`, `Badge`, `Section`, `Tabs`) are located at `frontend/src/components/ui/`. Import from `../components/ui/` not `../components/`.

### Task 12: Frontend Types

**Files:**
- Modify: `frontend/src/api/types.ts`

- [ ] **Step 1: Add KB and Mention types**

Add to the end of `frontend/src/api/types.ts`:

```typescript
// Knowledge Base
export interface KBDocument {
  id: number;
  project_id: number;
  path: string;
  title: string;
  tags: string | null;
  content: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface KBDocumentSummary {
  path: string;
  title: string;
  tags: string | null;
  updated_by: string;
  updated_at: string;
}

export interface KBSearchResult {
  path: string;
  title: string;
  snippet: string;
  rank: number;
}

export interface KBTreeNode {
  name: string;
  path?: string;
  title?: string;
  children?: KBTreeNode[];
}

// Mentions
export interface MentionRef {
  id: number;
  source_type: string;
  source_id: number;
  mention_type: string;
  target_path: string | null;
  target_issue_number: number | null;
  created_at: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/types.ts
git commit -m "feat: add KB and Mention TypeScript types"
```

---

### Task 13: KB Hooks

**Files:**
- Create: `frontend/src/hooks/useKnowledgeBase.ts`

- [ ] **Step 1: Create KB hooks**

Create `frontend/src/hooks/useKnowledgeBase.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { KBDocument, KBDocumentSummary, KBSearchResult, KBTreeNode } from '../api/types';

export function useKBDocuments(slug: string | undefined, prefix?: string, tag?: string) {
  const params = new URLSearchParams();
  if (prefix) params.set('prefix', prefix);
  if (tag) params.set('tag', tag);
  const qs = params.toString();
  return useQuery<KBDocumentSummary[]>({
    queryKey: ['kb-docs', slug, prefix, tag],
    queryFn: () => apiFetch<KBDocumentSummary[]>(`/projects/${slug}/kb${qs ? `?${qs}` : ''}`),
    enabled: !!slug,
  });
}

export function useKBDocument(slug: string | undefined, path: string | undefined) {
  return useQuery<KBDocument>({
    queryKey: ['kb-doc', slug, path],
    queryFn: () => apiFetch<KBDocument>(`/projects/${slug}/kb/${path}`),
    enabled: !!slug && !!path,
  });
}

export function useKBTree(slug: string | undefined) {
  return useQuery<KBTreeNode[]>({
    queryKey: ['kb-tree', slug],
    queryFn: () => apiFetch<KBTreeNode[]>(`/projects/${slug}/kb/tree`),
    enabled: !!slug,
  });
}

export function useKBSearch(slug: string | undefined, query: string, tag?: string) {
  const params = new URLSearchParams({ q: query });
  if (tag) params.set('tag', tag);
  return useQuery<KBSearchResult[]>({
    queryKey: ['kb-search', slug, query, tag],
    queryFn: () => apiFetch<KBSearchResult[]>(`/projects/${slug}/kb/search?${params}`),
    enabled: !!slug && query.length > 0,
  });
}

export function useCreateOrReplaceKBDoc(slug: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { path: string; title?: string; tags?: string; content: string; author: string }) =>
      apiFetch<KBDocument>(`/projects/${slug}/kb`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-docs', slug] });
      qc.invalidateQueries({ queryKey: ['kb-tree', slug] });
      qc.invalidateQueries({ queryKey: ['kb-doc', slug] });
    },
  });
}

export function useDeleteKBDoc(slug: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) =>
      apiFetch(`/projects/${slug}/kb/${path}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-docs', slug] });
      qc.invalidateQueries({ queryKey: ['kb-tree', slug] });
    },
  });
}

export function useMoveKBDoc(slug: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, newPath }: { path: string; newPath: string }) =>
      apiFetch<KBDocument>(`/projects/${slug}/kb/${path}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ new_path: newPath }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-docs', slug] });
      qc.invalidateQueries({ queryKey: ['kb-tree', slug] });
      qc.invalidateQueries({ queryKey: ['kb-doc', slug] });
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useKnowledgeBase.ts
git commit -m "feat: add React hooks for knowledge base CRUD, search, and tree"
```

---

### Task 14: Mention Hooks

**Files:**
- Create: `frontend/src/hooks/useMentions.ts`

- [ ] **Step 1: Create mention hooks**

Create `frontend/src/hooks/useMentions.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import type { MentionRef } from '../api/types';

export function useKBMentions(slug: string | undefined, kbPath: string | undefined) {
  return useQuery<MentionRef[]>({
    queryKey: ['mentions', slug, 'kb', kbPath],
    queryFn: () => apiFetch<MentionRef[]>(`/projects/${slug}/mentions?kb_path=${encodeURIComponent(kbPath!)}`),
    enabled: !!slug && !!kbPath,
  });
}

export function useIssueMentions(slug: string | undefined, issueNumber: number | undefined) {
  return useQuery<MentionRef[]>({
    queryKey: ['mentions', slug, 'issue', issueNumber],
    queryFn: () => apiFetch<MentionRef[]>(`/projects/${slug}/mentions?issue_number=${issueNumber}`),
    enabled: !!slug && issueNumber !== undefined,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useMentions.ts
git commit -m "feat: add React hooks for mention reverse lookups"
```

---

### Task 15: MentionRenderer Component

**Files:**
- Create: `frontend/src/components/MentionRenderer.tsx`

- [ ] **Step 1: Create MentionRenderer component**

Create `frontend/src/components/MentionRenderer.tsx`:

```tsx
import { Link, useParams } from 'react-router-dom';

/**
 * Renders text content with clickable kb: and #N mentions.
 *
 * - kb:path/to/doc.md → green link to /projects/:slug/kb/path/to/doc.md
 * - kb:path/to/doc.md#Section → green link with section
 * - #N → amber link to /projects/:slug/issues/N
 */
export default function MentionRenderer({ text }: { text: string }) {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <>{text}</>;

  // Split text by mention patterns, preserving the matches
  const parts: Array<{ type: 'text' | 'kb' | 'issue'; value: string; target?: string }> = [];
  // Combined pattern: kb:... or #N (with lookbehind exclusions handled by checking)
  const pattern = /kb:([^\s]+)|(?<![&#/\w])#(\d+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Add preceding text
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // kb: mention
      parts.push({ type: 'kb', value: `kb:${match[1]}`, target: match[1] });
    } else if (match[2]) {
      // #N mention
      parts.push({ type: 'issue', value: `#${match[2]}`, target: match[2] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  if (parts.length === 0) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'kb') {
          const docPath = part.target!.replace(/#.*$/, ''); // strip section for URL
          return (
            <Link
              key={i}
              to={`/projects/${slug}/kb/${docPath}`}
              style={{
                color: '#22c55e',
                background: 'rgba(34, 197, 94, 0.1)',
                padding: '1px 4px',
                borderRadius: '3px',
                textDecoration: 'none',
              }}
            >
              {part.value}
            </Link>
          );
        }
        if (part.type === 'issue') {
          return (
            <Link
              key={i}
              to={`/projects/${slug}/issues/${part.target}`}
              style={{
                color: '#f59e0b',
                background: 'rgba(245, 158, 11, 0.1)',
                padding: '1px 4px',
                borderRadius: '3px',
                textDecoration: 'none',
              }}
            >
              {part.value}
            </Link>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MentionRenderer.tsx
git commit -m "feat: add MentionRenderer component for clickable kb: and #N links"
```

---

## Chunk 5: Frontend — Pages & Integration

### Task 16: KnowledgeBase Page

**Files:**
- Create: `frontend/src/pages/KnowledgeBase.tsx`
- Create: `frontend/src/pages/KnowledgeBase.module.css`

- [ ] **Step 1: Create KnowledgeBase page**

Create `frontend/src/pages/KnowledgeBase.tsx`:

```tsx
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useKBTree, useKBDocument, useKBSearch, useDeleteKBDoc } from '../hooks/useKnowledgeBase';
import { useKBMentions } from '../hooks/useMentions';
import MentionRenderer from '../components/MentionRenderer';
import type { KBTreeNode } from '../api/types';
import styles from './KnowledgeBase.module.css';

function TreeNode({ node, selectedPath, onSelect }: {
  node: KBTreeNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (node.children) {
    return (
      <div>
        <div className={styles.treeDir} onClick={() => setExpanded(!expanded)}>
          <span>{expanded ? '▾' : '▸'}</span> {node.name}/
        </div>
        {expanded && (
          <div className={styles.treeChildren}>
            {node.children.map((child) => (
              <TreeNode key={child.name} node={child} selectedPath={selectedPath} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${styles.treeFile} ${node.path === selectedPath ? styles.treeFileActive : ''}`}
      onClick={() => node.path && onSelect(node.path)}
    >
      {node.name}
    </div>
  );
}

export default function KnowledgeBase() {
  const { slug } = useParams<{ slug: string }>();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showRefs, setShowRefs] = useState(false);

  const { data: tree } = useKBTree(slug);
  const { data: doc } = useKBDocument(slug, selectedPath ?? undefined);
  const { data: searchResults } = useKBSearch(slug, searchQuery, activeTag ?? undefined);
  const { data: mentions } = useKBMentions(slug, selectedPath ?? undefined);
  const deleteMut = useDeleteKBDoc(slug);

  const handleDelete = () => {
    if (!selectedPath) return;
    if (!confirm(`Delete ${selectedPath}?`)) return;
    deleteMut.mutate(selectedPath, {
      onSuccess: () => setSelectedPath(null),
    });
  };

  // Collect all tags from tree for filter chips
  const allTags = new Set<string>();
  if (doc?.tags) {
    doc.tags.split(',').forEach((t) => allTags.add(t.trim()));
  }

  return (
    <div className={styles.container}>
      {/* Left: Tree Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Documents</span>
          <Link to={`/projects/${slug}/kb/new`} className={styles.newBtn}>+ New</Link>
        </div>
        <input
          className={styles.searchInput}
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {activeTag && (
          <div className={styles.activeTagBar}>
            <span className={styles.tagChipActive}>
              {activeTag} <span onClick={() => setActiveTag(null)} style={{ cursor: 'pointer' }}>×</span>
            </span>
          </div>
        )}

        {searchQuery ? (
          <div className={styles.searchResults}>
            {searchResults?.map((r) => (
              <div key={r.path} className={styles.treeFile} onClick={() => { setSelectedPath(r.path); setSearchQuery(''); }}>
                <div className={styles.searchResultTitle}>{r.title}</div>
                <div className={styles.searchResultSnippet} dangerouslySetInnerHTML={{ __html: r.snippet }} />
              </div>
            ))}
            {searchResults?.length === 0 && <div className={styles.empty}>No results</div>}
          </div>
        ) : (
          <div className={styles.treeContainer}>
            {tree?.map((node) => (
              <TreeNode key={node.name} node={node} selectedPath={selectedPath} onSelect={setSelectedPath} />
            ))}
            {tree?.length === 0 && <div className={styles.empty}>No documents yet</div>}
          </div>
        )}
      </div>

      {/* Right: Document Viewer */}
      <div className={styles.viewer}>
        {doc ? (
          <>
            <div className={styles.docHeader}>
              <div className={styles.docPath}>{doc.path.replace(/\/[^/]+$/, '/')}</div>
              <h2 className={styles.docTitle}>{doc.title}</h2>
              <div className={styles.docActions}>
                {mentions && mentions.length > 0 && (
                  <button className={styles.refsBtn} onClick={() => setShowRefs(!showRefs)}>
                    References ({mentions.length})
                  </button>
                )}
                <Link to={`/projects/${slug}/kb/edit/${doc.path}`} className={styles.editBtn}>Edit</Link>
                <button className={styles.deleteBtn} onClick={handleDelete}>Delete</button>
              </div>
            </div>
            {doc.tags && (
              <div className={styles.tagRow}>
                {doc.tags.split(',').map((t) => (
                  <span key={t.trim()} className={styles.tagChip} onClick={() => setActiveTag(t.trim())}>
                    {t.trim()}
                  </span>
                ))}
              </div>
            )}
            <div className={styles.docMeta}>
              Updated by <strong>{doc.updated_by}</strong> · {new Date(doc.updated_at).toLocaleString()}
            </div>
            {showRefs && mentions && (
              <div className={styles.referencesPanel}>
                <div className={styles.refsPanelTitle}>Referenced By</div>
                {mentions.map((m) => (
                  <div key={m.id} className={styles.refItem}>
                    <span className={styles.refSource}>{m.source_type}</span> #{m.source_id}
                  </div>
                ))}
              </div>
            )}
            <div className={styles.docContent}>
              <MentionRenderer text={doc.content} />
            </div>
          </>
        ) : (
          <div className={styles.placeholder}>
            Select a document from the tree, or <Link to={`/projects/${slug}/kb/new`}>create a new one</Link>.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CSS module**

Create `frontend/src/pages/KnowledgeBase.module.css`:

```css
.container { display: flex; height: 100%; min-height: 0; }
.sidebar { width: 260px; flex-shrink: 0; border-right: 1px solid var(--border, #333); padding: 12px; overflow-y: auto; }
.sidebarHeader { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.sidebarTitle { font-weight: bold; font-size: 0.9rem; }
.newBtn { background: #22c55e; color: #000; padding: 3px 10px; border-radius: 4px; font-size: 0.75rem; text-decoration: none; }
.searchInput { width: 100%; padding: 6px 10px; font-size: 0.8rem; border: 1px solid var(--border, #333); border-radius: 4px; background: var(--bg-input, #111); color: inherit; margin-bottom: 8px; }
.activeTagBar { margin-bottom: 8px; }
.treeContainer { font-size: 0.8rem; }
.treeDir { padding: 3px 4px; color: #999; cursor: pointer; user-select: none; }
.treeDir:hover { color: #ccc; }
.treeChildren { padding-left: 14px; }
.treeFile { padding: 3px 8px; cursor: pointer; border-radius: 3px; font-size: 0.8rem; }
.treeFile:hover { background: rgba(255,255,255,0.05); }
.treeFileActive { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
.searchResults { font-size: 0.8rem; }
.searchResultTitle { font-weight: bold; font-size: 0.8rem; }
.searchResultSnippet { color: #999; font-size: 0.75rem; margin-bottom: 8px; }
.searchResultSnippet mark { background: rgba(245, 158, 11, 0.3); color: inherit; }
.empty { color: #666; font-size: 0.8rem; padding: 12px 4px; }

.viewer { flex: 1; padding: 16px 24px; overflow-y: auto; }
.docHeader { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.docPath { font-size: 0.75rem; color: #999; }
.docTitle { font-size: 1.1rem; margin: 0; }
.docActions { margin-left: auto; display: flex; gap: 6px; }
.editBtn, .refsBtn, .deleteBtn { font-size: 0.7rem; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--border, #333); background: none; color: #ccc; cursor: pointer; text-decoration: none; }
.editBtn:hover, .refsBtn:hover { background: rgba(255,255,255,0.05); }
.deleteBtn { color: #ef4444; border-color: #ef444444; }
.deleteBtn:hover { background: rgba(239,68,68,0.1); }

.tagRow { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.tagChip { font-size: 0.65rem; background: #1e3a5f; color: #60a5fa; padding: 2px 8px; border-radius: 3px; cursor: pointer; }
.tagChipActive { font-size: 0.65rem; background: #22c55e; color: #000; padding: 2px 8px; border-radius: 3px; }
.docMeta { font-size: 0.8rem; color: #999; margin-bottom: 12px; }
.docMeta strong { color: #ccc; }

.referencesPanel { background: rgba(255,255,255,0.03); border: 1px solid var(--border, #333); border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; }
.refsPanelTitle { font-size: 0.75rem; font-weight: bold; margin-bottom: 6px; }
.refItem { font-size: 0.75rem; color: #999; line-height: 1.8; }
.refSource { color: #60a5fa; }

.docContent { border-top: 1px solid var(--border, #333); padding-top: 14px; font-size: 0.9rem; line-height: 1.7; white-space: pre-wrap; }
.placeholder { color: #666; padding: 60px 20px; text-align: center; }
.placeholder a { color: #22c55e; }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/KnowledgeBase.tsx frontend/src/pages/KnowledgeBase.module.css
git commit -m "feat: add two-panel Knowledge Base browser page"
```

---

### Task 17: KBEditor Page

**Files:**
- Create: `frontend/src/pages/KBEditor.tsx`
- Create: `frontend/src/pages/KBEditor.module.css`

- [ ] **Step 1: Create KBEditor page**

Create `frontend/src/pages/KBEditor.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useKBDocument, useCreateOrReplaceKBDoc } from '../hooks/useKnowledgeBase';
import MentionRenderer from '../components/MentionRenderer';
import styles from './KBEditor.module.css';

export default function KBEditor() {
  const { slug, '*': splatPath } = useParams<{ slug: string; '*': string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Determine if editing (path from URL splat) or creating new
  const isEdit = location.pathname.includes('/kb/edit/');
  const editPath = isEdit ? splatPath : undefined;

  const { data: existingDoc } = useKBDocument(slug, editPath);
  const saveMut = useCreateOrReplaceKBDoc(slug);

  const [path, setPath] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  // Pre-fill form when editing
  useEffect(() => {
    if (existingDoc) {
      setPath(existingDoc.path);
      setTitle(existingDoc.title);
      setTags(existingDoc.tags ? existingDoc.tags.split(',').map((t) => t.trim()) : []);
      setContent(existingDoc.content);
    }
  }, [existingDoc]);

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const handleSave = () => {
    if (!path.trim() || !slug) return;
    saveMut.mutate(
      {
        path: path.trim(),
        title: title.trim() || undefined,
        tags: tags.length > 0 ? tags.join(',') : undefined,
        content,
        author: 'admin', // TODO: get from auth context if available
      },
      {
        onSuccess: () => navigate(`/projects/${slug}/kb`),
      },
    );
  };

  const insertMarkdown = (before: string, after: string) => {
    const textarea = document.querySelector<HTMLTextAreaElement>(`.${styles.textarea}`);
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);
    const newContent = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(newContent);
  };

  return (
    <div className={styles.form}>
      <h2>{isEdit ? 'Edit Document' : 'New Document'}</h2>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Path</label>
          <input
            className={styles.input}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="architecture/api-design.md"
            disabled={isEdit}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Title</label>
          <input
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Tags</label>
        <div className={styles.tags}>
          {tags.map((t) => (
            <span key={t} className={styles.tagChip}>
              {t} <span className={styles.tagRemove} onClick={() => removeTag(t)}>×</span>
            </span>
          ))}
          <input
            className={styles.tagInput}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={addTag}
            placeholder="Add tag..."
          />
        </div>
      </div>

      <div className={styles.editorSection}>
        <div className={styles.editorHeader}>
          <div className={styles.editorTabs}>
            <button className={`${styles.tab} ${mode === 'write' ? styles.tabActive : ''}`} onClick={() => setMode('write')}>Write</button>
            <button className={`${styles.tab} ${mode === 'preview' ? styles.tabActive : ''}`} onClick={() => setMode('preview')}>Preview</button>
          </div>
          {mode === 'write' && (
            <div className={styles.toolbar}>
              <button className={styles.toolBtn} onClick={() => insertMarkdown('**', '**')} title="Bold"><b>B</b></button>
              <button className={styles.toolBtn} onClick={() => insertMarkdown('*', '*')} title="Italic"><i>I</i></button>
              <button className={styles.toolBtn} onClick={() => insertMarkdown('`', '`')} title="Code">&lt;/&gt;</button>
              <button className={styles.toolBtn} onClick={() => insertMarkdown('[', '](url)')} title="Link">🔗</button>
              <button className={styles.toolBtn} onClick={() => insertMarkdown('## ', '')} title="Heading">H</button>
            </div>
          )}
        </div>
        {mode === 'write' ? (
          <textarea
            className={styles.textarea}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write markdown content..."
          />
        ) : (
          <div className={styles.preview}>
            <MentionRenderer text={content} />
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={() => navigate(`/projects/${slug}/kb`)}>Cancel</button>
        <button className={styles.saveBtn} onClick={handleSave} disabled={!path.trim() || saveMut.isPending}>
          {saveMut.isPending ? 'Saving...' : 'Save Document'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create CSS module**

Create `frontend/src/pages/KBEditor.module.css`:

```css
.form { max-width: 900px; padding: 16px 24px; }
.form h2 { margin: 0 0 16px; font-size: 1.1rem; }
.row { display: flex; gap: 12px; margin-bottom: 12px; }
.field { flex: 1; margin-bottom: 12px; }
.fieldLabel { display: block; font-size: 0.7rem; color: #999; margin-bottom: 4px; }
.input { width: 100%; padding: 6px 10px; font-size: 0.85rem; border: 1px solid var(--border, #333); border-radius: 4px; background: var(--bg-input, #111); color: inherit; }
.input:disabled { opacity: 0.5; }

.tags { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.tagChip { font-size: 0.7rem; background: #1e3a5f; color: #60a5fa; padding: 3px 8px; border-radius: 3px; display: flex; align-items: center; gap: 4px; }
.tagRemove { cursor: pointer; opacity: 0.6; }
.tagRemove:hover { opacity: 1; }
.tagInput { padding: 3px 8px; font-size: 0.75rem; border: 1px solid var(--border, #333); border-radius: 4px; background: var(--bg-input, #111); color: inherit; width: 100px; }

.editorSection { margin-bottom: 16px; }
.editorHeader { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); padding: 6px 10px; border: 1px solid var(--border, #333); border-bottom: none; border-radius: 6px 6px 0 0; }
.editorTabs { display: flex; gap: 2px; }
.tab { font-size: 0.75rem; padding: 4px 10px; border: none; background: none; color: #999; cursor: pointer; border-radius: 3px; }
.tabActive { background: var(--border, #333); color: #fff; }
.toolbar { display: flex; gap: 2px; }
.toolBtn { font-size: 0.8rem; padding: 2px 8px; border: none; background: none; color: #666; cursor: pointer; }
.toolBtn:hover { color: #ccc; }

.textarea { width: 100%; min-height: 300px; padding: 12px; font-family: monospace; font-size: 0.85rem; line-height: 1.7; border: 1px solid var(--border, #333); border-radius: 0 0 6px 6px; background: var(--bg-input, #111); color: inherit; resize: vertical; }
.preview { padding: 12px; border: 1px solid var(--border, #333); border-radius: 0 0 6px 6px; min-height: 300px; font-size: 0.85rem; line-height: 1.7; white-space: pre-wrap; }

.actions { display: flex; justify-content: flex-end; gap: 8px; }
.cancelBtn { font-size: 0.8rem; padding: 6px 16px; border: 1px solid var(--border, #333); border-radius: 4px; background: none; color: #999; cursor: pointer; }
.cancelBtn:hover { background: rgba(255,255,255,0.05); }
.saveBtn { font-size: 0.8rem; padding: 6px 16px; border: none; border-radius: 4px; background: #22c55e; color: #000; cursor: pointer; }
.saveBtn:hover { background: #16a34a; }
.saveBtn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/KBEditor.tsx frontend/src/pages/KBEditor.module.css
git commit -m "feat: add KBEditor page with markdown editing and preview"
```

---

### Task 18: Navigation & Routing Updates

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/ProjectView.tsx`

- [ ] **Step 1: Add routes in App.tsx**

In `frontend/src/App.tsx`, add imports:

```typescript
import KnowledgeBase from './pages/KnowledgeBase';
import KBEditor from './pages/KBEditor';
```

Add routes inside the `<Route path="/projects/:slug" element={<ProjectView />}>` block, after the `documents` route:

```tsx
<Route path="kb" element={<KnowledgeBase />} />
<Route path="kb/new" element={<KBEditor />} />
<Route path="kb/edit/*" element={<KBEditor />} />
```

Note: `kb/edit/*` uses a wildcard to capture the full document path (e.g., `kb/edit/architecture/api-design.md`).

- [ ] **Step 2: Add tab in ProjectView.tsx**

In `frontend/src/pages/ProjectView.tsx`, add to the TABS array after the `documents` entry:

```typescript
{ path: 'kb', label: 'Knowledge Base' },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/ProjectView.tsx
git commit -m "feat: add Knowledge Base routes and navigation tab"
```

---

### Task 19: Integrate MentionRenderer into ChatRoom

**Files:**
- Modify: `frontend/src/pages/ChatRoom.tsx`

- [ ] **Step 1: Replace raw content with MentionRenderer**

In `frontend/src/pages/ChatRoom.tsx`, add the import:

```typescript
import MentionRenderer from '../components/MentionRenderer';
```

Find the line where message content is rendered (approximately line 56):

```tsx
{msg.content}
```

Replace with:

```tsx
<MentionRenderer text={msg.content} />
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ChatRoom.tsx
git commit -m "feat: render clickable kb: and #N mentions in chat messages"
```

---

### Task 20: Integrate MentionRenderer into TaskDetail

**Files:**
- Modify: `frontend/src/pages/TaskDetail.tsx`

- [ ] **Step 1: Replace raw content with MentionRenderer**

In `frontend/src/pages/TaskDetail.tsx`, add the import:

```typescript
import MentionRenderer from '../components/MentionRenderer';
```

Find the issue body rendering (approximately line 55):

```tsx
{issue.body && <div className={styles.body}>{issue.body}</div>}
```

Replace with:

```tsx
{issue.body && <div className={styles.body}><MentionRenderer text={issue.body} /></div>}
```

Find the comment body rendering (approximately line 70):

```tsx
<div className={styles.commentBody}>{c.body}</div>
```

Replace with:

```tsx
<div className={styles.commentBody}><MentionRenderer text={c.body} /></div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/TaskDetail.tsx
git commit -m "feat: render clickable kb: and #N mentions in issues and comments"
```

---

### Task 21: Final Build Verification

- [ ] **Step 1: Verify all backend modules load**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -c "
from agora.db.models.kb_document import KBDocument
from agora.db.models.mention import Mention
from agora.services.kb_service import extract_section, build_tree, create_fts_table
from agora.services.mention_service import extract_mentions, store_mentions
from agora.api.routes.kb import router as kb_router
from agora.api.routes.mentions import router as mentions_router
from agora.cli.kb_commands import kb_app
from agora.api.app import app
print(f'Backend OK: {len(app.routes)} routes')
"
```

- [ ] **Step 2: Verify CLI loads**

```bash
cd H:/Dev42/agora && PYTHONPATH=H:/Dev42/agora/src python -m agora.cli.main kb --help
```

Expected: Shows all 7 kb subcommands.

- [ ] **Step 3: Verify frontend builds**

```bash
cd H:/Dev42/agora/frontend && npx tsc --noEmit && npx vite build 2>&1 | tail -5
```

Expected: No TypeScript errors, build succeeds.

- [ ] **Step 4: Commit any remaining changes**

```bash
git status
```

If any unstaged changes remain, commit them.
