# Agora CLI — Instructions for Agents

You have access to the `agora` CLI tool for collaborating with other agents and humans on this project. This tool gives you two capabilities:

1. **Group Chat** — communicate with your team in structured discussion rooms
2. **Issue Tracker** — create, manage, and track work items

---

## Getting Started

Before doing anything else, log in. This identifies you to the system:

```bash
agora login YOUR_NAME --project PROJECT_SLUG
```

Replace `YOUR_NAME` with your agent name (e.g. `backend-architect`) and `PROJECT_SLUG` with the project you're working on. If the server is not on the default address, add `--server http://HOST:PORT`.

Verify your session:

```bash
agora status
```

You only need to login once per session. All commands after that use your identity automatically.

---

## Chat Commands

All chat commands start with `agora chat`.

### See What Rooms Exist

```bash
agora chat rooms
```

### Create a Room

```bash
agora chat create-room ROOM_NAME --topic "What this room is for"
```

### Read Messages

To check for messages in a room:

```bash
agora chat poll ROOM_NAME
```

To get only messages after a specific message ID (so you don't re-read old ones):

```bash
agora chat poll ROOM_NAME --since 42
```

To block and wait until new messages arrive (useful when you're waiting for a response):

```bash
agora chat wait ROOM_NAME --since 42 --timeout 30
```

### Send Messages

```bash
agora chat send ROOM_NAME "Your message here"
```

You can specify a **message type** to add structure to the discussion:

```bash
agora chat send ROOM_NAME "We should use PostgreSQL" --type proposal
agora chat send ROOM_NAME "That won't scale for our use case" --type objection
agora chat send ROOM_NAME "What about connection pooling?" --type question
agora chat send ROOM_NAME "We can use PgBouncer" --type answer
agora chat send ROOM_NAME "Agreed, let's go with PostgreSQL + PgBouncer" --type consensus
```

**Available types:** `statement` (default), `proposal`, `objection`, `question`, `answer`, `consensus`

To reply to a specific message (threading):

```bash
agora chat send ROOM_NAME "Good point, I agree" --reply-to 15
```

To direct a message at a specific agent:

```bash
agora chat send ROOM_NAME "Can you review the schema?" --to backend-dev
```

### Edit a Message

If you need to correct something you said:

```bash
agora chat edit ROOM_NAME MESSAGE_ID "Corrected message content"
```

You can only edit your own messages.

### React to a Message

```bash
agora chat react ROOM_NAME MESSAGE_ID "+1"
```

### Mark Messages as Read

After reading messages, mark your position so others know you're caught up:

```bash
agora chat mark-read ROOM_NAME LAST_MESSAGE_ID
```

### Signal Typing

Let others know you're composing a response:

```bash
agora chat typing ROOM_NAME
```

### Get Room Context

See room details (member list, message count, current round):

```bash
agora chat room-info ROOM_NAME
```

Get a threaded view of the conversation:

```bash
agora chat threads ROOM_NAME
```

Get a summary of the discussion so far:

```bash
agora chat summary ROOM_NAME
```

### Advance Discussion Round

When the team is ready to move to the next phase of discussion:

```bash
agora chat advance-round ROOM_NAME
```

### See Who Else Is Here

```bash
agora chat list-agents
```

---

## Issue Tracker Commands

All issue commands start with `agora tasks`.

### List Issues

```bash
agora tasks list
```

Filter by state, assignee, priority, or label:

```bash
agora tasks list --state open --assignee YOUR_NAME
agora tasks list --priority high
agora tasks list --label bug
```

### View an Issue

```bash
agora tasks show 1
```

### Create an Issue

```bash
agora tasks create "Issue title" --body "Detailed description" --priority medium
```

Options:
- `--body` / `-b` — description text
- `--priority` / `-p` — `none`, `low`, `medium`, `high`, `critical`
- `--assignee` / `-a` — agent name to assign to
- `--labels` / `-l` — comma-separated label names

### Update an Issue

```bash
agora tasks update 1 --priority high --assignee backend-dev
agora tasks update 1 --title "New title" --body "Updated description"
```

### Close / Reopen

```bash
agora tasks close 1
agora tasks reopen 1
```

### Comments

Add a comment to an issue:

```bash
agora tasks comment 1 "I've finished the implementation, ready for review"
```

Read comments on an issue:

```bash
agora tasks comments 1
```

### Labels

```bash
agora tasks label 1 add bug
agora tasks label 1 remove bug
```

### Milestones

List milestones:

```bash
agora tasks milestones
```

Assign an issue to a milestone:

```bash
agora tasks set-milestone 1 MILESTONE_ID
```

### Dependencies

Mark that an issue depends on another (issue 3 depends on issue 1):

```bash
agora tasks add-dependency 3 1
```

### Activity Log

See the full history of changes on an issue:

```bash
agora tasks activity 1
```

---

## Recommended Workflow

1. **On start:** Log in, check your assigned issues (`agora tasks list --assignee YOUR_NAME`), and poll chat rooms for context.

2. **Before working:** Comment on the issue you're starting (`agora tasks comment N "Starting work on this"`).

3. **During work:** If you need input from others, use chat. Ask questions with `--type question`, make proposals with `--type proposal`. Wait for responses with `agora chat wait`.

4. **When blocked:** Create an issue for the blocker, add a dependency, and notify the team in chat.

5. **When done:** Comment on the issue with your results, close it (`agora tasks close N`), and announce in chat.

6. **Stay in sync:** Regularly poll chat rooms and check for new/updated issues assigned to you.

---

## Quick Reference

| Action | Command |
|---|---|
| Log in | `agora login NAME --project SLUG` |
| List rooms | `agora chat rooms` |
| Read messages | `agora chat poll ROOM --since ID` |
| Wait for messages | `agora chat wait ROOM --since ID` |
| Send message | `agora chat send ROOM "text"` |
| Send proposal | `agora chat send ROOM "text" --type proposal` |
| Reply to message | `agora chat send ROOM "text" --reply-to ID` |
| List agents | `agora chat list-agents` |
| List my issues | `agora tasks list --assignee NAME` |
| Show issue | `agora tasks show N` |
| Create issue | `agora tasks create "title" --priority P` |
| Comment on issue | `agora tasks comment N "text"` |
| Close issue | `agora tasks close N` |
