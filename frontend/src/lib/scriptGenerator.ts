import JSZip from 'jszip';
import type { LaunchConfig } from '../api/types';

export type { LaunchConfig };

/**
 * Escape a string for use inside double quotes in a Windows .bat file.
 */
function escapeBatDoubleQuotes(s: string): string {
  return s.replace(/"/g, '""');
}

/**
 * Escape a string for use inside single quotes in bash.
 */
function escapeBashSingleQuotes(s: string): string {
  return s.replace(/'/g, "'\\''");
}

/**
 * Build the Claude CLI arguments based on config.
 */
function buildClaudeArgs(config: LaunchConfig, platform: 'bat' | 'sh'): string {
  const parts: string[] = [];

  // System prompt
  const prompt = config.systemPrompt.trim();
  if (prompt) {
    const flag =
      config.promptSource === 'override'
        ? '--system-prompt'
        : '--append-system-prompt';
    if (platform === 'bat') {
      parts.push(`${flag} "${escapeBatDoubleQuotes(prompt)}"`);
    } else {
      parts.push(`${flag} '${escapeBashSingleQuotes(prompt)}'`);
    }
  }

  // Model
  if (config.model?.trim()) {
    parts.push(`--model ${config.model.trim()}`);
  }

  // Allowed tools
  if (config.allowedTools?.trim()) {
    const tools = config.allowedTools
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    for (const tool of tools) {
      parts.push(`--allowedTools ${tool}`);
    }
  }

  // Skip permissions
  if (config.skipPermissions) {
    parts.push('--dangerously-skip-permissions');
  }

  // Initial task (the positional prompt argument)
  const task = config.initialTask.trim();
  if (task) {
    if (platform === 'bat') {
      parts.push(`"${escapeBatDoubleQuotes(task)}"`);
    } else {
      parts.push(`'${escapeBashSingleQuotes(task)}'`);
    }
  }

  return parts.join(' ');
}

/**
 * Generate a Windows .bat launch script for a Claude Code agent.
 */
export function generateBatScript(config: LaunchConfig): string {
  const { agentName, workingDir, serverUrl, projectSlug } = config;
  const claudeArgs = buildClaudeArgs(config, 'bat');

  const lines = [
    '@echo off',
    `set AGORA_SESSION=%USERPROFILE%\\.agora\\session-${agentName}.json`,
    '',
    `call agora login ${agentName} --project ${projectSlug} --server ${serverUrl}`,
    `echo ==> ${agentName} logged in`,
    '',
    `cd /d "${workingDir}"`,
    `claude ${claudeArgs}`,
  ];

  return lines.join('\r\n') + '\r\n';
}

/**
 * Generate a Unix .sh launch script for a Claude Code agent.
 */
export function generateShScript(config: LaunchConfig): string {
  const { agentName, workingDir, serverUrl, projectSlug } = config;
  const claudeArgs = buildClaudeArgs(config, 'sh');

  const lines = [
    '#!/bin/bash',
    'set -e',
    '',
    `export AGORA_SESSION="$HOME/.agora/session-${agentName}.json"`,
    '',
    `agora login ${agentName} --project ${projectSlug} --server ${serverUrl}`,
    `echo "==> ${agentName} logged in"`,
    '',
    `cd "${workingDir}"`,
    `claude ${claudeArgs}`,
  ];

  return lines.join('\n') + '\n';
}

/**
 * Generate a CLAUDE.md file with project context, agent roster, and full CLI reference.
 */
export function generateClaudeMd(
  projectName: string,
  projectDescription: string,
  agents: { name: string; role: string }[]
): string {
  const agentList = agents
    .map((a) => `- **${a.name}** — ${a.role}`)
    .join('\n');

  return `# ${projectName}

## Project Description

${projectDescription}

## Team Coordination

You are part of a ${agents.length}-agent team coordinating via the **Agora** platform.
Your teammates are working in the same project. Use the CLI to communicate.

### Agent Roster

${agentList}

### Your Identity

Your agent name and session are set via the \`AGORA_SESSION\` environment variable.
The CLI uses this automatically — just run commands directly.

### Communication CLI Commands

\`\`\`bash
# Chat commands (all scoped to your project automatically)
agora chat rooms                              # List rooms
agora chat create-room <name> --topic "..."   # Create a room
agora chat send <room> "message"              # Send a message
agora chat send <room> "msg" --type proposal  # Send a proposal
agora chat send <room> "msg" --type question  # Ask a question
agora chat send <room> "msg" --type answer    # Answer a question
agora chat send <room> "msg" --type objection # Object to something
agora chat send <room> "msg" --type consensus # Signal agreement
agora chat send <room> "msg" --reply-to 3     # Reply to message #3
agora chat send <room> "msg" --to agent-name  # Direct to specific agent
agora chat poll <room>                        # Get all messages
agora chat poll <room> --since 5              # Get messages after #5
agora chat wait <room> --since 5              # Long-poll for new messages
agora chat react <room> <msg-id> "+1"         # React to a message
agora chat summary <room>                     # Get discussion summary
agora chat room-info <room>                   # Room status
agora chat threads <room>                     # Threaded view

# Task commands
agora tasks create "Title" --body "desc" --priority high --assignee dev
agora tasks list                              # List all issues
agora tasks list --state open --assignee me   # Filter issues
agora tasks show <number>                     # Show issue detail
agora tasks update <number> --state closed    # Update issue
agora tasks close <number>                    # Close issue
agora tasks comment <number> "comment text"   # Comment on issue
agora tasks comments <number>                 # List comments
\`\`\`

### Workflow Protocol

1. **Design Phase**: Discuss architecture in a chat room
   - Propose designs and ideas
   - Ask questions, raise concerns
   - Reach consensus before implementation

2. **Implementation Phase**: Create issues and implement
   - Break work into issues with clear descriptions
   - Assign issues to the appropriate agent
   - Comment on issues with progress updates
   - Close issues when done

3. **Review Phase**: Feedback round in a review chat room
   - Review each other's work
   - Raise objections or approve
   - Reach final consensus

### Important Rules
- Always poll for new messages before sending, so you don't miss context
- Use message types correctly (proposal, question, answer, objection, consensus)
- Use reply_to for threading when responding to specific messages
- Keep messages concise but clear
- Create issues for trackable work items
- Comment on issues with progress updates
`;
}

/**
 * Download a single file via the browser by creating a temporary anchor element.
 */
export function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Bundle multiple files into a .zip archive and download it via the browser.
 */
export async function downloadZip(
  zipName: string,
  files: { name: string; content: string }[]
): Promise<void> {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.content);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Check if the File System Access API is available (showDirectoryPicker).
 */
export function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Save files directly to disk using the File System Access API.
 *
 * Opens a directory picker, then writes each file into the chosen directory.
 * Returns the number of files written, or null if the user cancelled.
 */
export async function saveFilesToDisk(
  files: { name: string; content: string }[]
): Promise<number | null> {
  if (!hasFileSystemAccess()) {
    throw new Error('File System Access API is not supported in this browser');
  }

  let dirHandle: FileSystemDirectoryHandle;
  try {
    dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'desktop',
    });
  } catch {
    // User cancelled the picker
    return null;
  }

  let written = 0;
  for (const file of files) {
    const fileHandle = await dirHandle.getFileHandle(file.name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file.content);
    await writable.close();
    written++;
  }

  return written;
}
