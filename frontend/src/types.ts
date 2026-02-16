export interface Project {
  id: string
  name: string
  repo_url: string | null
  branch: string
  source_type: 'git' | 'local'
  auto_merge: boolean
  auto_push: boolean
  status: 'cloning' | 'ready' | 'error'
  error: string | null
  created_at: string
}

export interface ProjectCreatePayload {
  name: string
  repo_url?: string
  branch?: string
  source_type?: 'git' | 'local' | 'new'
  auto_merge?: boolean
  auto_push?: boolean
}

export interface ProjectSettingsPayload {
  auto_merge?: boolean
  auto_push?: boolean
}

export interface GitCommit {
  sha: string
  short: string
  parents: string[]
  message: string
  author: string
  time_ago: string
  refs: string[]
}

export interface PlanMessage {
  role: 'assistant' | 'user'
  content: string
  timestamp: string
}

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: number
  worker_id: string | null
  branch: string | null
  plan: string | null
  plan_approved: boolean
  plan_questions: PlanQuestion[] | null
  plan_answers: Record<string, string> | null
  plan_messages: PlanMessage[] | null
  plan_session_id: string | null
  depends_on: string | null
  commit_id: string | null
  error: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export type TaskStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'plan_pending'
  | 'plan_approved'
  | 'merging'
  | 'testing'
  | 'merge_pending'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface PlanQuestion {
  key: string
  question: string
  options: string[]
  default: string
}

export interface Worker {
  id: string
  pid: number | null
  container_id: string | null
  status: 'idle' | 'busy' | 'stopped' | 'error'
  current_task_id: string | null
  current_task_title: string | null
  tasks_completed: number
  last_activity: string | null
  started_at: string | null
}

export interface TaskCreatePayload {
  description: string
  priority?: number
  depends_on?: string | null
  plan_mode?: boolean
}

export type KanbanColumn = {
  key: string
  label: string
  labelEn: string
  color: string
  statuses: TaskStatus[]
}

export interface GitFileChange {
  path: string
  status: 'A' | 'M' | 'D' | 'R'
  additions: number
  deletions: number
}

export interface DispatcherEvent {
  ts: string
  source: string
  message: string
}
