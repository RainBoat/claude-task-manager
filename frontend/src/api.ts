import type { Task, TaskCreatePayload, Worker, Project, ProjectCreatePayload, GitCommit } from './types'

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

// ============================================================
// WebSocket
// ============================================================

export function createLogSocket(workerId: string): WebSocket {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return new WebSocket(`${proto}//${location.host}/ws/logs/${workerId}`)
}
