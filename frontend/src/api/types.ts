export interface Project {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  working_dir: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectStats {
  room_count: number;
  open_issue_count: number;
  total_issue_count: number;
}

export interface Agent {
  id: number;
  name: string;
  display_name: string | null;
  role: string | null;
  persona_id: number | null;
  created_at: string;
}

export interface ProjectAgent {
  id: number;
  project_id: number;
  agent_id: number;
  system_prompt: string | null;
  initial_task: string | null;
  model: string | null;
  allowed_tools: string | null;
  prompt_source: string; // "append" | "override"
  skip_permissions: boolean;
  added_at: string;
  // Flattened from agent
  agent_name: string;
  agent_display_name: string | null;
  agent_role: string | null;
}

export interface Room {
  id: number;
  project_id: number;
  name: string;
  topic: string | null;
  current_round: number;
  created_at: string;
}

export interface Message {
  id: number;
  room_id: number;
  sender: string;
  content: string;
  message_type: string;
  reply_to: number | null;
  to: string | null;
  edited_at: string | null;
  edit_history: unknown[] | null;
  created_at: string;
  reactions: ReactionSummary[];
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  senders: string[];
}

export interface PollResponse {
  messages: Message[];
  receipts: Receipt[];
}

export interface Receipt {
  agent: string;
  last_read: number;
  updated_at: string;
}

export interface Issue {
  id: number;
  project_id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  priority: string;
  assignee: string | null;
  reporter: string;
  milestone_id: number | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  labels: Label[];
  comment_count: number;
}

export interface Label {
  id: number;
  project_id: number;
  name: string;
  color: string | null;
  description: string | null;
}

export interface Comment {
  id: number;
  issue_id: number;
  author: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface RoomStatus {
  room: Room;
  message_count: number;
  members: Agent[];
  receipts: Receipt[];
  presence: { agent: string; status: string }[];
  typing: string[];
}

export interface LaunchConfig {
  agentName: string;
  role: string;
  systemPrompt: string;
  initialTask: string;
  workingDir: string;
  serverUrl: string;
  projectSlug: string;
  model: string;
  allowedTools: string;
  promptSource: 'append' | 'override';
  skipPermissions: boolean;
}
