import type { Task, TaskCreatePayload, Worker, Project, ProjectCreatePayload, ProjectSettingsPayload, GitCommit, GitFileChange, DispatcherEvent } from './types'

const BASE = ''

// ============================================================
// Projects
// ============================================================

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${BASE}/api/projects`)
  if (!res.ok) throw new Error('Failed to fetch projects')
  return res.json()
}

export async function createProject(payload: ProjectCreatePayload): Promise<Project> {
  const res = await fetch(`${BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create project')
  return res.json()
}

export async function deleteProject(projectId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete project')
}

export async function retryProject(projectId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/retry`, { method: 'POST' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to retry project')
  }
}

// ============================================================
// Tasks (project-scoped)
// ============================================================

export async function fetchTasks(projectId: string): Promise<Task[]> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/tasks`)
  if (!res.ok) throw new Error('Failed to fetch tasks')
  return res.json()
}

export async function createTask(projectId: string, payload: TaskCreatePayload): Promise<Task> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create task')
  return res.json()
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete task')
}

export async function cancelTask(projectId: string, taskId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/tasks/${taskId}/cancel`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to cancel task')
}

export async function retryTask(projectId: string, taskId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/tasks/${taskId}/retry`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to retry task')
}

// ============================================================
// Plan (project-scoped)
// ============================================================

export async function generatePlan(projectId: string, taskId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/plan/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId }),
  })
  if (!res.ok) throw new Error('Failed to generate plan')
}

export async function approvePlan(
  projectId: string,
  taskId: string,
  approved: boolean,
  feedback?: string,
  answers?: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/plan/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, approved, feedback, answers }),
  })
  if (!res.ok) throw new Error('Failed to approve plan')
}

export async function batchApprovePlans(
  projectId: string,
  taskIds: string[],
  approved: boolean,
  feedback?: string,
): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/plan/batch-approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_ids: taskIds, approved, feedback }),
  })
  if (!res.ok) throw new Error('Failed to batch approve plans')
}

// ============================================================
// Workers (global)
// ============================================================

export async function fetchWorkers(): Promise<Worker[]> {
  const res = await fetch(`${BASE}/api/workers`)
  if (!res.ok) throw new Error('Failed to fetch workers')
  return res.json()
}

// ============================================================
// Git log (project-scoped)
// ============================================================

export async function fetchGitLog(projectId: string, limit = 50): Promise<GitCommit[]> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/git/log?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch git log')
  const data = await res.json()
  return data.commits
}

export async function fetchCommitDetail(projectId: string, sha: string): Promise<{ body: string; files: GitFileChange[] }> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/git/commit/${sha}`)
  if (!res.ok) throw new Error('Failed to fetch commit detail')
  return res.json()
}

// ============================================================
// Local repos discovery
// ============================================================

export interface LocalRepo {
  name: string
  path: string
  branch: string
}

export async function fetchLocalRepos(): Promise<LocalRepo[]> {
  const res = await fetch(`${BASE}/api/local-repos`)
  if (!res.ok) throw new Error('Failed to fetch local repos')
  return res.json()
}

// ============================================================
// Project settings
// ============================================================

export async function updateProjectSettings(projectId: string, settings: ProjectSettingsPayload): Promise<Project> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error('Failed to update project settings')
  return res.json()
}

// ============================================================
// Merge / Push (project-scoped)
// ============================================================

export async function mergeTask(projectId: string, taskId: string, squash: boolean = false): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/tasks/${taskId}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ squash }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to merge task')
  }
}

export async function pushProject(projectId: string): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/git/push`, { method: 'POST' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to push')
  }
}

export async function fetchUnpushed(projectId: string): Promise<{ count: number; has_remote: boolean }> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/git/unpushed`)
  if (!res.ok) return { count: 0, has_remote: false }
  return res.json()
}

// ============================================================
// Dispatcher Events (global)
// ============================================================

export async function fetchDispatcherEvents(limit = 50): Promise<DispatcherEvent[]> {
  const res = await fetch(`${BASE}/api/dispatcher/events?limit=${limit}`)
  if (!res.ok) return []
  return res.json()
}

// ============================================================
// WebSocket
// ============================================================

export function createLogSocket(
  workerId: string,
  opts?: { projectId?: string; taskId?: string; history?: number }
): WebSocket {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams()
  if (opts?.projectId) params.set('project_id', opts.projectId)
  if (opts?.taskId) params.set('task_id', opts.taskId)
  if (typeof opts?.history === 'number') params.set('history', String(opts.history))
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return new WebSocket(`${proto}//${location.host}/ws/logs/${workerId}${suffix}`)
}

export function createPlanSocket(projectId: string, taskId: string): WebSocket {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new WebSocket(`${proto}//${location.host}/ws/plan/${projectId}/${taskId}`)
}

// ============================================================
// Plan Chat
// ============================================================

export async function planChat(projectId: string, taskId: string, message: string): Promise<void> {
  const res = await fetch(`${BASE}/api/projects/${projectId}/plan/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, message }),
  })
  if (!res.ok) throw new Error('Failed to send plan message')
}
