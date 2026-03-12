"""Import/export routes -- full project data as JSON."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from agora.db.engine import get_db
from agora.db.models.agent import Agent
from agora.db.models.chat import Message, Reaction, Room
from agora.db.models.enums import IssueState, MessageType, Priority
from agora.db.models.project import Project
from agora.db.models.task import Issue, IssueComment, Label
from agora.api.deps import require_project

router = APIRouter(
    prefix="/api/projects/{slug}",
    tags=["Import/Export"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_reaction(reaction: Reaction) -> dict[str, Any]:
    return {
        "emoji": reaction.emoji,
        "sender": reaction.sender,
    }


def _serialize_message(msg: Message) -> dict[str, Any]:
    # Group reactions by emoji
    reactions_by_emoji: dict[str, list[str]] = {}
    for r in msg.reactions:
        reactions_by_emoji.setdefault(r.emoji, []).append(r.sender)

    return {
        "sender": msg.sender,
        "content": msg.content,
        "message_type": msg.message_type.value if isinstance(msg.message_type, MessageType) else str(msg.message_type),
        "reply_to": msg.reply_to,
        "to": msg.to,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "reactions": [
            {"emoji": emoji, "senders": senders}
            for emoji, senders in reactions_by_emoji.items()
        ],
    }


def _serialize_room(room: Room) -> dict[str, Any]:
    return {
        "name": room.name,
        "topic": room.topic,
        "current_round": room.current_round,
        "messages": [_serialize_message(m) for m in sorted(room.messages, key=lambda m: m.id)],
    }


def _serialize_comment(comment: IssueComment) -> dict[str, Any]:
    return {
        "author": comment.author,
        "body": comment.body,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


def _serialize_issue(issue: Issue) -> dict[str, Any]:
    return {
        "number": issue.number,
        "title": issue.title,
        "body": issue.body,
        "state": issue.state.value if isinstance(issue.state, IssueState) else str(issue.state),
        "priority": issue.priority.value if isinstance(issue.priority, Priority) else str(issue.priority),
        "assignee": issue.assignee,
        "reporter": issue.reporter,
        "labels": [label.name for label in issue.labels],
        "comments": [_serialize_comment(c) for c in sorted(issue.comments, key=lambda c: c.id)],
    }


# ---------------------------------------------------------------------------
# GET /api/projects/{slug}/export
# ---------------------------------------------------------------------------


@router.get("/export")
async def export_project(
    slug: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Export all project data (agents, rooms, messages, issues) as JSON."""
    project = await require_project(slug, db)

    # Load rooms with messages and reactions
    rooms_result = await db.execute(
        select(Room)
        .where(Room.project_id == project.id)
        .options(
            selectinload(Room.messages).selectinload(Message.reactions),
        )
        .order_by(Room.id)
    )
    rooms = rooms_result.scalars().all()

    # Collect all unique agent names from rooms
    agent_names: set[str] = set()
    for room in rooms:
        for msg in room.messages:
            agent_names.add(msg.sender)
            for r in msg.reactions:
                agent_names.add(r.sender)

    # Load issues with comments and labels
    issues_result = await db.execute(
        select(Issue)
        .where(Issue.project_id == project.id)
        .options(
            selectinload(Issue.comments),
            selectinload(Issue.labels),
        )
        .order_by(Issue.number)
    )
    issues = issues_result.scalars().all()

    # Collect agent names from issues too
    for issue in issues:
        if issue.assignee:
            agent_names.add(issue.assignee)
        agent_names.add(issue.reporter)
        for comment in issue.comments:
            agent_names.add(comment.author)

    # Load agents
    agents_out = []
    if agent_names:
        agents_result = await db.execute(
            select(Agent).where(Agent.name.in_(agent_names)).order_by(Agent.name)
        )
        agents = agents_result.scalars().all()
        agents_out = [
            {
                "name": a.name,
                "display_name": a.display_name,
                "role": a.role,
            }
            for a in agents
        ]

    return {
        "project": {
            "name": project.name,
            "slug": project.slug,
            "description": project.description,
        },
        "agents": agents_out,
        "rooms": [_serialize_room(r) for r in rooms],
        "issues": [_serialize_issue(i) for i in issues],
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# POST /api/projects/{slug}/import
# ---------------------------------------------------------------------------


@router.post("/import")
async def import_project(
    slug: str,
    data: dict[str, Any],
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Import project data from JSON. Skips existing agents, rooms, and issues."""
    project = await require_project(slug, db)

    summary = {
        "agents_created": 0,
        "agents_skipped": 0,
        "rooms_created": 0,
        "rooms_skipped": 0,
        "messages_created": 0,
        "issues_created": 0,
        "issues_skipped": 0,
        "comments_created": 0,
    }

    # --- Import agents ---
    for agent_data in data.get("agents", []):
        name = agent_data.get("name")
        if not name:
            continue
        existing = await db.execute(select(Agent).where(Agent.name == name))
        if existing.scalar_one_or_none():
            summary["agents_skipped"] += 1
            continue
        agent = Agent(
            name=name,
            display_name=agent_data.get("display_name"),
            role=agent_data.get("role"),
        )
        db.add(agent)
        summary["agents_created"] += 1

    await db.flush()

    # --- Import rooms and messages ---
    for room_data in data.get("rooms", []):
        room_name = room_data.get("name")
        if not room_name:
            continue

        existing = await db.execute(
            select(Room).where(and_(Room.name == room_name, Room.project_id == project.id))
        )
        if existing.scalar_one_or_none():
            summary["rooms_skipped"] += 1
            continue

        room = Room(
            name=room_name,
            topic=room_data.get("topic"),
            current_round=room_data.get("current_round", 1),
            project_id=project.id,
        )
        db.add(room)
        await db.flush()

        summary["rooms_created"] += 1

        # Import messages for this room
        for msg_data in room_data.get("messages", []):
            sender = msg_data.get("sender")
            content = msg_data.get("content")
            if not sender or not content:
                continue

            # Parse message_type
            msg_type_str = msg_data.get("message_type", "statement")
            try:
                msg_type = MessageType(msg_type_str)
            except ValueError:
                msg_type = MessageType.statement

            # Parse created_at
            created_at = None
            if msg_data.get("created_at"):
                try:
                    created_at = datetime.fromisoformat(msg_data["created_at"])
                except (ValueError, TypeError):
                    created_at = None

            msg = Message(
                room_id=room.id,
                sender=sender,
                content=content,
                message_type=msg_type,
                reply_to=msg_data.get("reply_to"),
                to=msg_data.get("to"),
                created_at=created_at or datetime.now(timezone.utc),
            )
            db.add(msg)
            await db.flush()
            summary["messages_created"] += 1

            # Import reactions for this message
            for reaction_data in msg_data.get("reactions", []):
                emoji = reaction_data.get("emoji")
                senders = reaction_data.get("senders", [])
                if not emoji:
                    continue
                for reaction_sender in senders:
                    reaction = Reaction(
                        message_id=msg.id,
                        sender=reaction_sender,
                        emoji=emoji,
                    )
                    db.add(reaction)

    # --- Import issues and comments ---
    for issue_data in data.get("issues", []):
        number = issue_data.get("number")
        title = issue_data.get("title")
        if number is None or not title:
            continue

        existing = await db.execute(
            select(Issue).where(
                and_(Issue.number == number, Issue.project_id == project.id)
            )
        )
        if existing.scalar_one_or_none():
            summary["issues_skipped"] += 1
            continue

        # Parse state and priority
        try:
            state = IssueState(issue_data.get("state", "open"))
        except ValueError:
            state = IssueState.open

        try:
            priority = Priority(issue_data.get("priority", "none"))
        except ValueError:
            priority = Priority.none

        issue = Issue(
            project_id=project.id,
            number=number,
            title=title,
            body=issue_data.get("body"),
            state=state,
            priority=priority,
            assignee=issue_data.get("assignee"),
            reporter=issue_data.get("reporter", "unknown"),
        )
        db.add(issue)
        await db.flush()

        summary["issues_created"] += 1

        # Handle labels
        for label_name in issue_data.get("labels", []):
            label_result = await db.execute(
                select(Label).where(
                    and_(Label.name == label_name, Label.project_id == project.id)
                )
            )
            label = label_result.scalar_one_or_none()
            if not label:
                label = Label(name=label_name, project_id=project.id)
                db.add(label)
                await db.flush()
            issue.labels.append(label)

        # Import comments
        for comment_data in issue_data.get("comments", []):
            author = comment_data.get("author")
            body = comment_data.get("body")
            if not author or not body:
                continue

            created_at = None
            if comment_data.get("created_at"):
                try:
                    created_at = datetime.fromisoformat(comment_data["created_at"])
                except (ValueError, TypeError):
                    created_at = None

            comment = IssueComment(
                issue_id=issue.id,
                author=author,
                body=body,
                created_at=created_at or datetime.now(timezone.utc),
            )
            db.add(comment)
            summary["comments_created"] += 1

    await db.commit()

    return {
        "status": "ok",
        "summary": summary,
    }
