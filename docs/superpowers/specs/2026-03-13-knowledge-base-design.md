# Knowledge Base

**Date**: 2026-03-13
**Status**: Approved
**Approach**: Single-Phase Build

## Overview

A persistent, navigable document store for multi-agent projects. Agents create, read, search, and reference structured markdown documents through the CLI. The knowledge base is the third pillar of Agora alongside chat (real-time discussion) and issues (work tracking). It holds the accumulated understanding of a project.

A cross-reference system parses `kb:` and `#N` mentions in chat messages, issue bodies, and issue comments, storing them as structured links for reverse lookups and clickable rendering in the frontend.

## Data Model

### New Tables

#### KBDocument

| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| project_id | FK → Project | Cascade delete |
| path | String(500) | e.g. "architecture/api-design.md". Unique per project |
| title | String(200) | From frontmatter or defaults to filename |
| tags | Text (nullable) | Comma-separated, e.g. "architecture,api,rest" |
| content | Text | Raw markdown body (without frontmatter) |
| created_by | String(100) | Agent name who created |
| updated_by | String(100) | Agent name who last modified |
| created_at | DateTime | |
| updated_at | DateTime | |

Unique constraint on `(project_id, path)`.

#### kb_document_fts (FTS5 Virtual Table)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS kb_document_fts USING fts5(
    title, content, tags,
    content='kb_documents',
    content_rowid='id'
);
```

Content-less external content FTS table — indexes but does not duplicate data. Kept in sync via SQLAlchemy `after_insert`, `after_update`, `after_delete` event listeners on KBDocument:

- **Insert**: `INSERT INTO kb_document_fts(rowid, title, content, tags) VALUES (...)`
- **Update**: delete old entry, insert new (FTS5 does not support UPDATE)
- **Delete**: `INSERT INTO kb_document_fts(kb_document_fts, rowid, title, content, tags) VALUES('delete', ...)`

Created via raw SQL in the app lifespan alongside `Base.metadata.create_all`, since SQLAlchemy ORM does not support FTS5 virtual tables.

#### Mention

| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| project_id | FK → Project | Cascade delete |
| source_type | String(20) | "message", "issue_comment", "issue_body" |
| source_id | Integer | ID of the message, comment, or issue |
| mention_type | String(10) | "kb" or "issue" |
| target_path | String(500, nullable) | KB document path (for `kb:` mentions) |
| target_issue_number | Integer (nullable) | Issue number (for `#N` mentions) |
| created_at | DateTime | |

One row per mention occurrence. A message referencing `kb:foo.md` and `#7` produces two rows.

### Changes to Existing Models

No schema changes to Message, IssueComment, or Issue. Mention parsing happens at the service layer on save, creating Mention rows as a side effect.

## API Endpoints

### KB Document CRUD

```
POST   /api/projects/{slug}/kb                    Create/replace document
         Body: { path, title?, tags?, content, author }
         Returns: KBDocumentOut (201 if created, 200 if replaced)

GET    /api/projects/{slug}/kb                     List documents
         Query: prefix? (path prefix filter), tag?
         Returns: KBDocumentSummary[] (path, title, tags, updated_by, updated_at — no content)

GET    /api/projects/{slug}/kb/{path:path}         Read document
         Query: section? (header text for section extraction)
         Returns: KBDocumentOut (full content, or just the matched section)

DELETE /api/projects/{slug}/kb/{path:path}         Delete document
         Returns: 204

PATCH  /api/projects/{slug}/kb/{path:path}/move    Move/rename document
         Body: { new_path }
         Returns: KBDocumentOut
```

### KB Search & Tree

```
GET    /api/projects/{slug}/kb/search              Full-text search
         Query: q (search term), tag?, limit? (default 20)
         Returns: KBSearchResult[] (path, title, snippet, rank)

GET    /api/projects/{slug}/kb/tree                Document tree
         Returns: KBTreeNode[] (nested: { name, path?, title?, children? })
```

**Route ordering**: The `/kb/search` and `/kb/tree` routes must be registered **before** `/kb/{path:path}` in the router, since `{path:path}` is a catch-all that would otherwise swallow `search` and `tree` as path values.

The search endpoint uses FTS5's `MATCH` with `bm25()` for ranking and `snippet()` for context:

```sql
SELECT kd.*, snippet(kb_document_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
       bm25(kb_document_fts) as rank
FROM kb_document_fts
JOIN kb_documents kd ON kd.id = kb_document_fts.rowid
WHERE kb_document_fts MATCH :query
ORDER BY rank
LIMIT :limit
```

Tag filtering is applied as an additional `WHERE` clause on the joined `kb_documents` table.

The tree endpoint builds a nested structure from all document paths. Leaf nodes have `path` and `title`; directory nodes have `name` and `children`.

### Mentions

```
GET    /api/projects/{slug}/mentions               Reverse lookup
         Query: kb_path? OR issue_number?
         Returns: MentionOut[] (source_type, source_id, mention_type, target, created_at)
```

No separate create endpoint — mentions are extracted automatically when messages, comments, and issues are saved.

### Changes to Existing Endpoints

Mention parsing hooks into existing save flows as additive post-save calls:

- `POST /api/projects/{slug}/rooms/{room}/messages` — after saving a message, extract and store mentions
- `PUT /api/projects/{slug}/rooms/{room}/messages/{id}` — re-parse mentions on edit (delete old, insert new)
- `POST /api/projects/{slug}/issues` — parse issue body for mentions on create
- `PATCH /api/projects/{slug}/issues/{number}` — re-parse issue body on update
- `POST /api/projects/{slug}/issues/{number}/comments` — parse comment for mentions

Existing endpoint behavior is unchanged — mention extraction is a side effect that cannot fail the main operation (wrapped in try/except, logged on error).

## Mention Parsing

### Regex Patterns

- **KB references**: `kb:([^\s]+)` — captures everything after `kb:` until whitespace
- **Issue references**: `(?<![&#/\w])#(\d+)` — captures the number after `#`, with negative lookbehind to skip HTML entities (`&#123;`), URL fragments (`/path#123`), and word characters (`C#7`). Matches inside markdown code fences (`` ` `` or `` ``` ``) are excluded by stripping code blocks before parsing.

### Storage Flow

1. On message/comment/issue save, call `extract_mentions(text) → list of (type, target)`
2. Delete any existing Mention rows for that source (handles edits cleanly)
3. Insert new Mention rows

### Mention Validation

Mentions are stored regardless of whether the target exists. If someone writes `kb:nonexistent.md`, the Mention row is created with `target_path="nonexistent.md"`. The frontend renders non-existent targets as dimmed/broken links. This avoids coupling mention parsing to KB document existence checks.

## Tag Filtering

Tags are stored as a comma-separated string. Filtering uses exact matching at the application level: split the stored string by comma, check if the requested tag is in the resulting list. This avoids false matches (e.g., searching for tag "api" matching "api-design").

## Section Extraction

The `section` query parameter on the read endpoint extracts content from a matched header down to the next header of equal or higher level. Implementation: regex splits the markdown by headers, finds the matching section by header text, returns that slice. Matching is case-insensitive.

## CLI Commands

New Typer app in `src/agora/cli/kb_commands.py`, registered in `main.py` as `app.add_typer(kb_app, name="kb")`.

### Commands

| Command | Method | Path | Notes |
|---------|--------|------|-------|
| `kb write <path> [--title] [--tags] [--body]` | POST | `/projects/{slug}/kb` | Reads stdin if no `--body`. Prints "Created" or "Updated" |
| `kb read <path> [--section]` | GET | `/projects/{slug}/kb/{path}?section=` | Prints raw markdown to stdout |
| `kb list [prefix] [--tag]` | GET | `/projects/{slug}/kb?prefix=&tag=` | Prints `path — "title"` per line |
| `kb search <query> [--tag] [--limit]` | GET | `/projects/{slug}/kb/search` | Prints `path — snippet` per line |
| `kb tree` | GET | `/projects/{slug}/kb/tree` | Prints indented tree view |
| `kb move <old> <new>` | PATCH | `/projects/{slug}/kb/{path}/move` | Prints "Moved old → new" |
| `kb delete <path>` | DELETE | `/projects/{slug}/kb/{path}` | Prints "Deleted path" |

### Stdin Support

For `kb write`, if `--body` is not provided, the command reads from stdin. Detects stdin availability with `sys.stdin.isatty()` — if stdin is a pipe, read it; if it's a terminal and no `--body`, print an error.

### Output Format

All output is plain text for agent consumption. No colors, no tables. Search results include a brief snippet for context.

The CLI distinguishes "Created" vs "Updated" output by checking the HTTP response status code (201 vs 200) from the upsert endpoint.

## Frontend UI

### Navigation

Project sidebar gains a "Knowledge Base" entry between Documents and Agents in the existing TABS array (after "Documents", before "Agents"). Both Documents (template generation) and Knowledge Base (persistent document store) coexist — they serve different purposes.

### New Routes

```
/projects/:slug/kb              → KnowledgeBase page
/projects/:slug/kb/new          → KBEditor (create)
/projects/:slug/kb/edit/:path   → KBEditor (edit)
```

### KB Browser (Two-Panel Layout)

- **Left panel**: tree sidebar with collapsible directory structure, search input at top, tag filter chips below search
- **Right panel**: document viewer with rendered markdown, path breadcrumb, title, tag chips, "Updated by agent · time ago" metadata, Edit button, "References (N)" toggle button
- **References panel**: collapsible panel below the doc header showing reverse lookups — which messages, issues, and comments reference this document
- **+ New button**: in tree sidebar header, navigates to KBEditor

### KB Editor (Full Page)

- Path input + title input (side by side)
- Tag chips with add/remove and text input for new tags
- Write/Preview toggle tabs
- Simple markdown toolbar (bold, italic, code, link, heading)
- Markdown textarea
- Save / Cancel buttons

### Mention Rendering

A shared `MentionRenderer` component processes text content and replaces mention patterns with clickable links:

- `kb:path/to/doc.md` → green styled link, navigates to `/projects/:slug/kb/path/to/doc.md`
- `kb:path/to/doc.md#Section` → green styled link with section fragment
- `#N` → amber styled link, navigates to `/projects/:slug/issues/N`
- Non-existent targets rendered as dimmed/strikethrough

Used in:
- `ChatRoom.tsx` — message content
- `TaskDetail.tsx` — issue body and comments

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Create document with existing path | Replace (upsert), return 200 instead of 201 |
| Read non-existent document | 404 |
| Read with non-existent section name | Return full document with empty `section_match` field |
| Delete non-existent document | 404 |
| Move to path that already exists | 409 Conflict |
| Move document with existing mentions | Mention rows referencing old path are updated to new path |
| Search with no results | Empty array |
| Mention references non-existent KB doc | Mention stored anyway; frontend renders as broken link |
| FTS sync fails | Log error, do not fail the main operation |
| Mention extraction fails | Log error, do not fail the message/comment save |

## Implementation Scope

### New Files

**Backend:**
- `src/agora/db/models/kb_document.py` — KBDocument model
- `src/agora/db/models/mention.py` — Mention model
- `src/agora/schemas/kb.py` — Pydantic schemas for KB CRUD, search, tree
- `src/agora/schemas/mention.py` — Pydantic schemas for mentions
- `src/agora/services/kb_service.py` — section extraction, tree building, FTS5 sync event listeners
- `src/agora/services/mention_service.py` — mention parsing, extraction, storage
- `src/agora/api/routes/kb.py` — KB CRUD + search + tree endpoints
- `src/agora/api/routes/mentions.py` — reverse lookup endpoint
- `src/agora/cli/kb_commands.py` — CLI subcommands

**Frontend:**
- `frontend/src/pages/KnowledgeBase.tsx` — two-panel KB browser
- `frontend/src/pages/KnowledgeBase.module.css` — styles
- `frontend/src/pages/KBEditor.tsx` — create/edit document page
- `frontend/src/pages/KBEditor.module.css` — styles
- `frontend/src/hooks/useKnowledgeBase.ts` — KB CRUD + search hooks
- `frontend/src/hooks/useMentions.ts` — mention lookup hooks
- `frontend/src/components/MentionRenderer.tsx` — renders mention patterns as clickable links

### Modified Files

- `src/agora/db/models/__init__.py` — add KBDocument, Mention imports
- `src/agora/db/engine.py` — add KBDocument, Mention to imports
- `src/agora/api/app.py` — register KB and mention routers, add FTS5 table creation in lifespan
- `src/agora/cli/main.py` — register kb_app
- `src/agora/api/routes/chat.py` — call mention extraction after message save and edit
- `src/agora/api/routes/tasks.py` — call mention extraction after issue/comment save
- `frontend/src/api/types.ts` — add KB and Mention types
- `frontend/src/App.tsx` — add KB routes
- `frontend/src/pages/ProjectView.tsx` — add "Knowledge Base" nav link
- `frontend/src/pages/ChatRoom.tsx` — use MentionRenderer for message content
- `frontend/src/pages/TaskDetail.tsx` — use MentionRenderer for issue body and comments
