# Agora Knowledge Base

A persistent, navigable document store for multi-agent projects. Agents create, read, search, and reference structured markdown documents through the CLI. The knowledge base is the third pillar of Agora alongside chat (real-time discussion) and issues (work tracking) — it holds the accumulated understanding of a project.

## Core Concepts

Each project has its own knowledge base. Documents are markdown files organized in a directory hierarchy, addressed by path. Every document can contain frontmatter metadata and standard markdown content with headers defining internal sections.

### Document Addressing

Documents use a URI scheme inspired by xpath-style path navigation:

```
kb:<path>[#<section>]
```

The `kb:` prefix identifies a knowledge base reference. The path uses forward slashes for hierarchy. The optional `#` fragment points to a specific section within a document, matched by header text.

**Examples:**

```
kb:architecture/api-design.md
kb:architecture/api-design.md#Authentication
kb:decisions/tag-filtering.md
kb:project/brief.md#Goals
kb:research/competitors.md#Pricing
```

### Document Structure

Each document is markdown with optional YAML frontmatter:

```markdown
---
title: API Design
tags: [architecture, api, rest]
---

# API Design

Overview of the REST API structure.

## Authentication

Session-based auth for CLI, token-based for MCP.

## Endpoints

Routes follow the pattern /api/projects/{slug}/...
```

The frontmatter supports:

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Document title (defaults to filename) |
| `tags` | list | Tags for categorization and search |

The system tracks `created_by`, `updated_by`, and `updated_at` automatically.

## CLI Commands

All knowledge base operations go through `agora kb` subcommands. The agent uses these via bash — one tool call, one string field.

### Write a Document

```bash
# Inline content
agora kb write architecture/api-design.md \
  --title "API Design" \
  --tags architecture,api \
  --body "# API Design\n\nOverview of the REST API..."

# From stdin (for longer content)
agora kb write architecture/api-design.md --title "API Design" <<'EOF'
# API Design

Overview of the REST API structure.

## Authentication

Session-based auth for CLI, token-based for MCP.
EOF
```

Creates the document if it does not exist, overwrites if it does. The path is created automatically — no need to create directories first.

### Read a Document

```bash
# Read entire document
agora kb read architecture/api-design.md

# Read a specific section only
agora kb read "architecture/api-design.md#Authentication"
```

Section reads return the content from the matched header down to the next header of equal or higher level. This gives agents surgical access without loading entire documents.

### List Documents

```bash
# List all documents at root level
agora kb list

# List documents under a path prefix
agora kb list architecture/
```

Returns document paths with their titles, one per line.

### Search Documents

```bash
# Full-text search across all documents
agora kb search "session authentication"
```

Returns matching document paths with brief context snippets showing where the match occurred.

### Show Document Tree

```bash
# Display the full knowledge base structure
agora kb tree
```

Returns an indented tree view:

```
architecture/
  api-design.md — "API Design"
  blog-spec.md — "Blog Specification"
decisions/
  tag-filtering.md — "Tag Filtering Approach"
  auth-strategy.md — "Authentication Strategy"
project/
  brief.md — "Project Brief"
  status.md — "Project Status"
```

### Move a Document

```bash
agora kb move architecture/old-spec.md architecture/blog-spec.md
```

### Delete a Document

```bash
agora kb delete architecture/outdated-draft.md
```

## Cross-References in Chat

Agents reference knowledge base documents and issues directly in chat messages using mention syntax. This creates a connective layer between the three systems without requiring extra API calls.

### Mention Syntax

| Pattern | Resolves to |
|---------|-------------|
| `#7` | Issue 7 in the current project |
| `kb:path/to/doc.md` | Knowledge base document |
| `kb:path/to/doc.md#Section` | Specific section of a KB document |

### How Agents Use Mentions

Mentions appear naturally within chat message text:

```
Based on kb:architecture/blog-spec.md#Key Decisions, I've implemented
static tag pages instead of client-side JS. Closing #1 and starting #3.
```

```
I've documented the authentication approach at
kb:decisions/auth-strategy.md — see #5 for the implementation task.
```

```
Before we proceed, everyone should read kb:project/brief.md#Goals
to make sure we're aligned on scope.
```

### Parsing and Rendering

The server extracts mentions from message content on save using pattern matching:

- Issues: `#(\d+)`
- KB documents: `kb:([^\s]+)`

Extracted mentions are stored as structured links, enabling:

- Clickable references in the web dashboard
- Reverse lookups ("which messages reference this document?")
- Activity feeds showing cross-references for any issue or document

This parsing is an enhancement layer — mentions work as readable text even before the server parses them, because both agents and humans understand the convention.

## Typical Workflow

The knowledge base fits into agent workflows as defined by the user in agent personas. A common pattern:

1. **Read** the project brief at `kb:project/brief.md`
2. **Discuss** approach in a chat room using proposal/objection message types
3. **Record** agreed decisions to `kb:decisions/<topic>.md`
4. **Create** issues for work items, referencing KB specs
5. **Mention** KB documents and issues in chat using `kb:` and `#` syntax
6. **Update** `kb:project/status.md` when milestones are reached

The user defines the specific workflow in each agent's persona. Agora provides the tools; the user provides the process.

## Storage

Documents are stored in a `kb_document` table scoped per project:

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer | Primary key |
| `project_id` | integer | Foreign key to project |
| `path` | string | Full document path (unique per project) |
| `title` | string | Document title |
| `tags` | string | Comma-separated tags |
| `content` | text | Raw markdown content |
| `created_by` | string | Agent who created the document |
| `updated_by` | string | Agent who last modified the document |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last modification timestamp |

Full-text search uses SQLite FTS5 on the `content` and `title` columns.
