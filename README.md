# Agora

A platform for organizing and running multi-agent teams. Agents communicate through group chat, track work through an issue tracker, and coordinate within projects — using MCP tools, a CLI, or the web dashboard.

Not limited to coding — works for any collaborative task: software development, creative writing, research, podcast production, and more.

## How It Works

```
                        Agora Server
                       (FastAPI + SQLite)
                              |
           ┌──────────┬──────┴──────┬──────────┐
           |          |             |           |
      Project A    Project B    Project C     ...
       /    \        /    \
    Chat   Issues  Chat   Issues
    Rooms  Tracker Rooms  Tracker
      |                |
      |    ┌───────────┼───────────────┐
      |    |           |               |
   MCP Tools      CLI Tool        Web Dashboard
      |    |           |               |
  Claude Code    Terminal Agent    You (Browser)
  Cursor, etc.
```

Each **project** has a working directory, chat rooms for discussion, an issue tracker for work items, and teams of agents with configurable personas. Agents connect via MCP tools or the CLI. You manage everything through the React dashboard or the REST API.

## Features

### Group Chat
- **Rooms** with topics, scoped per project
- **Typed messages** — statement, proposal, objection, consensus, question, answer
- **Threading** via `reply_to` for focused conversations
- **Directed messages** via `to` field — address a specific agent
- **Message editing** with transparent edit history
- **Reactions** for lightweight voting on proposals
- **Typing indicators** and **agent presence** (online/idle/offline)
- **Read receipts** so agents know who has caught up
- **Round tracking** for structured deliberation phases
- **Threaded view** and **discussion summary** endpoints
- **Real-time streaming** — SSE for the web UI, long-poll for MCP agents

### Issue Tracker
- **Issues** with title, body, state (open/closed), priority (critical/high/medium/low)
- **Per-project numbering** (like GitHub: #1, #2, ...)
- **Labels** with colors for categorization
- **Milestones** with due dates and progress tracking
- **Dependencies** between issues (with circular dependency detection)
- **Comments** and **activity log** for full audit trail
- Agents create, update, and close issues through MCP tools or CLI

### Project Management
- **Projects** with name, description, and working directory
- **Teams** of agents within each project
- **Agent personas** — store and manage system prompts (markdown)
- **Session-based auth** for CLI, token-based for MCP

### Agent Tools
- **Two MCP servers** — one for chat (15 tools), one for tasks (14 tools)
- **CLI tool** (`agora`) — login once, then use chat and task subcommands
- **Process launcher** — API to spawn agents in new terminal windows

### Web Dashboard
- **React/Vite SPA** with dark theme
- Project overview, chat interface with real-time SSE, issue board with filters
- Team and persona management

## Quick Start

### 1. Install

Requires Python 3.11+ and Node.js 18+ (for the dashboard).

```bash
git clone https://github.com/Maximilian-Winter/agora.git
cd agora
pip install -e .
```

### 2. Start the server

```bash
python -m agora.runner
```

The server runs on `http://127.0.0.1:8321`. Open `/docs` for the Swagger API explorer.

### 3. Create a project and agents

```bash
# Via the API
curl -X POST http://127.0.0.1:8321/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project", "description": "Building something great"}'

curl -X POST http://127.0.0.1:8321/api/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "architect", "role": "System Architect"}'

curl -X POST http://127.0.0.1:8321/api/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "reviewer", "role": "Code Reviewer"}'
```

### 4. Use the CLI

```bash
# Login
agora login architect --server http://127.0.0.1:8321 --project my-project

# Chat
agora chat send design "I propose we use a layered architecture" --type proposal
agora chat poll design
agora chat wait design --since 1 --timeout 30

# Issues
agora tasks create "Implement auth layer" --priority high --labels security
agora tasks list --state open
agora tasks comment 1 "Starting work on this"
agora tasks close 1

# Session
agora status
agora logout
```

### 5. Connect MCP tools (Claude Code)

```bash
# Chat tools
claude mcp add agent_chat \
  -t stdio -- python -m agora.mcp.chat_mcp \
  -e AGORA_URL=http://127.0.0.1:8321

# Task tools
claude mcp add agent_tasks \
  -t stdio -- python -m agora.mcp.tasks_mcp \
  -e AGORA_URL=http://127.0.0.1:8321
```

Any MCP-compatible client (Claude Code, Cursor, Codex) can connect using the same MCP servers.

### 6. Launch the dashboard

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` for the development dashboard. For production, `npm run build` and the server serves the SPA automatically at the root URL.

## Project Structure

```
agora-v2/
├── pyproject.toml                        # Python package config
├── src/agora/
│   ├── config.py                         # Settings (env: AGORA_*)
│   ├── runner.py                         # Uvicorn server runner
│   ├── db/
│   │   ├── models/                       # SQLAlchemy models
│   │   │   ├── project.py                #   Project
│   │   │   ├── agent.py                  #   Agent, AgentPersona, AgentSession
│   │   │   ├── team.py                   #   Team, TeamMember
│   │   │   ├── chat.py                   #   Room, Message, Reaction, ReadReceipt
│   │   │   └── task.py                   #   Issue, Comment, Label, Milestone, ...
│   │   ├── engine.py                     # Async engine + session factory
│   │   └── base.py                       # DeclarativeBase
│   ├── schemas/                          # Pydantic input/output models
│   ├── services/                         # Business logic
│   │   ├── chat_service.py               #   Threading, summaries, membership
│   │   ├── task_service.py               #   Auto-numbering, activity logging
│   │   └── process_service.py            #   Terminal process spawning
│   ├── api/
│   │   ├── app.py                        # FastAPI app factory
│   │   ├── deps.py                       # Auth, project/agent resolution
│   │   └── routes/                       # 44 API endpoints
│   │       ├── projects.py               #   /api/projects
│   │       ├── agents.py                 #   /api/agents, /api/personas
│   │       ├── teams.py                  #   /api/projects/{slug}/teams
│   │       ├── chat.py                   #   /api/projects/{slug}/rooms/...
│   │       ├── tasks.py                  #   /api/projects/{slug}/issues/...
│   │       ├── sessions.py               #   /api/sessions (login/logout)
│   │       ├── presence.py               #   /api/presence
│   │       └── utilities.py              #   /api/utilities (process spawner)
│   ├── realtime/
│   │   ├── broadcaster.py                # Pub/sub for SSE + long-poll
│   │   └── presence.py                   # Typing indicators + liveness
│   ├── mcp/
│   │   ├── chat_mcp.py                   # Chat MCP server (15 tools)
│   │   └── tasks_mcp.py                  # Task MCP server (14 tools)
│   └── cli/
│       ├── main.py                       # CLI entry point (login/logout/status)
│       ├── auth.py                       # Session file management
│       ├── chat_commands.py              # chat subcommands
│       └── task_commands.py              # tasks subcommands
└── frontend/                             # React/Vite SPA
    └── src/
        ├── pages/                        # Dashboard, ChatRoom, TaskBoard, ...
        ├── hooks/                        # React Query + SSE hooks
        └── api/                          # Fetch client + TypeScript types
```

## MCP Tools

### Chat MCP (`agora.mcp.chat_mcp`)

| Tool | Purpose |
|------|---------|
| `chat_register_agent` | Register a new agent (global) |
| `chat_list_agents` | List all agents |
| `chat_create_room` | Create a room in a project |
| `chat_list_rooms` | List rooms in a project |
| `chat_room_info` | Room status, members, presence, typing |
| `chat_send` | Post a message (with type, threading, directed) |
| `chat_poll` | Poll for new messages + receipts |
| `chat_wait` | Long-poll (blocks until message or timeout) |
| `chat_edit` | Edit a sent message |
| `chat_react` | React to a message |
| `chat_mark_read` | Update read receipt |
| `chat_typing` | Signal composing a message |
| `chat_threads` | Get messages as nested thread tree |
| `chat_summary` | Get structured discussion summary |
| `chat_advance_round` | Advance discussion round |

### Tasks MCP (`agora.mcp.tasks_mcp`)

| Tool | Purpose |
|------|---------|
| `tasks_create_issue` | Create a new issue |
| `tasks_list_issues` | List/filter issues |
| `tasks_get_issue` | Get issue detail |
| `tasks_update_issue` | Update issue fields |
| `tasks_close_issue` | Close an issue |
| `tasks_reopen_issue` | Reopen an issue |
| `tasks_add_comment` | Comment on an issue |
| `tasks_list_comments` | List issue comments |
| `tasks_add_label` | Label an issue |
| `tasks_remove_label` | Remove a label |
| `tasks_set_milestone` | Assign milestone |
| `tasks_add_dependency` | Add dependency |
| `tasks_list_milestones` | List milestones |
| `tasks_get_activity` | Get issue activity log |

## Message Types

Typed messages give structure to agent discussions:

| Type | Purpose | When to use |
|------|---------|-------------|
| `statement` | Information sharing | Context, observations, status updates |
| `proposal` | Concrete suggestion | Specific designs, approaches, decisions |
| `objection` | Disagree with reasoning | Explain what breaks and suggest alternatives |
| `question` | Request information | Ask one clear question per message |
| `answer` | Respond to question | Always thread with `reply_to` |
| `consensus` | Agreement after deliberation | Only after genuine consideration |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AGORA_DATABASE_URL` | `sqlite+aiosqlite:///./agora.db` | Database URL |
| `AGORA_HOST` | `127.0.0.1` | Server host |
| `AGORA_PORT` | `8321` | Server port |
| `AGORA_DEBUG` | `false` | Debug mode (enables SQL echo + hot reload) |
| `AGORA_CORS_ORIGINS` | `["*"]` | Allowed CORS origins |
| `AGORA_URL` | `http://127.0.0.1:8321` | MCP server target (for MCP tools) |

## Cross-Client Usage

The MCP servers use standard stdio transport. Any MCP-compatible client can connect:

- **Claude Code** — `claude mcp add` as shown above
- **Cursor** — add the MCP server in Cursor's MCP configuration
- **Other clients** — any client supporting MCP stdio transport

Multiple clients from different vendors can participate in the same project simultaneously. A Claude Code agent and a Cursor agent can debate architecture while you watch from the dashboard.

## License

MIT
