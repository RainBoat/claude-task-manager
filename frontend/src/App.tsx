import { useState, useCallback, useEffect } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import GitPanel from './components/GitPanel'
import AddProjectModal from './components/AddProjectModal'
import TaskInput from './components/TaskInput'
import KanbanBoard from './components/KanbanBoard'
import PlanModal from './components/PlanModal'
import LogModal from './components/LogModal'
import { useProjects } from './hooks/useProjects'
import { useTasks } from './hooks/useTasks'
import { useWorkers } from './hooks/useWorkers'
import { useGitLog } from './hooks/useGitLog'
import { useTheme } from './hooks/useTheme'
import {
  createProject, deleteProject as apiDeleteProject,
  createTask, deleteTask, cancelTask, retryTask, approvePlan,
} from './api'
import type { Task, TaskCreatePayload } from './types'
import type { Lang } from './i18n'

export default function App() {
  const { dark, toggle: toggleTheme } = useTheme()
  const [lang, setLang] = useState<Lang>('zh')

  // Project state
  const { projects, refresh: refreshProjects } = useProjects(5000)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [showAddProject, setShowAddProject] = useState(false)
  const [showGitPanel, setShowGitPanel] = useState(false)

  // Auto-select first project
  useEffect(() => {
    if (!activeProjectId && projects.length > 0) {
      setActiveProjectId(projects[0].id)
    }
    // If active project was deleted, reset
    if (activeProjectId && projects.length > 0 && !projects.find(p => p.id === activeProjectId)) {
      setActiveProjectId(projects[0].id)
    }
  }, [projects, activeProjectId])

  // Tasks & git for active project
  const { tasks, refresh: refreshTasks } = useTasks(activeProjectId, 5000)
  const { commits } = useGitLog(showGitPanel ? activeProjectId : null, 10000)
  useWorkers(5000)

  // Modal state
  const [planTask, setPlanTask] = useState<Task | null>(null)
  const [logWorkerId, setLogWorkerId] = useState<string | null>(null)

  const toggleLang = useCallback(() => setLang(l => l === 'zh' ? 'en' : 'zh'), [])

  // Project handlers
  const handleAddProject = useCallback(async (name: string, repoUrl: string, branch: string) => {
    await createProject({ name, repo_url: repoUrl, branch })
    await refreshProjects()
  }, [refreshProjects])

  const handleDeleteProject = useCallback(async (projectId: string) => {
    await apiDeleteProject(projectId)
    if (activeProjectId === projectId) setActiveProjectId(null)
    await refreshProjects()
  }, [activeProjectId, refreshProjects])

  // Task handlers
  const handleCreateTask = useCallback(async (payload: TaskCreatePayload) => {
    if (!activeProjectId) return
    await createTask(activeProjectId, payload)
    await refreshTasks()
  }, [activeProjectId, refreshTasks])

  const handleClickTask = useCallback((task: Task) => {
    if (task.status === 'plan_pending') {
      setPlanTask(task)
    }
  }, [])

  const handleRetry = useCallback(async (taskId: string) => {
    if (!activeProjectId) return
    await retryTask(activeProjectId, taskId)
    await refreshTasks()
  }, [activeProjectId, refreshTasks])

  const handleCancel = useCallback(async (taskId: string) => {
    if (!activeProjectId) return
    await cancelTask(activeProjectId, taskId)
    await refreshTasks()
  }, [activeProjectId, refreshTasks])

  const handleDelete = useCallback(async (taskId: string) => {
    if (!activeProjectId) return
    await deleteTask(activeProjectId, taskId)
    await refreshTasks()
  }, [activeProjectId, refreshTasks])

  const handleViewLog = useCallback((workerId: string) => {
    setLogWorkerId(workerId)
  }, [])

  const handleApprovePlan = useCallback(async (answers: Record<string, string>) => {
    if (!planTask || !activeProjectId) return
    await approvePlan(activeProjectId, planTask.id, true, undefined, answers)
    setPlanTask(null)
    await refreshTasks()
  }, [planTask, activeProjectId, refreshTasks])

  const handleRejectPlan = useCallback(async (feedback: string) => {
    if (!planTask || !activeProjectId) return
    await approvePlan(activeProjectId, planTask.id, false, feedback)
    setPlanTask(null)
    await refreshTasks()
  }, [planTask, activeProjectId, refreshTasks])

  return (
    <div className="h-screen flex flex-col">
      {/* Header — full width */}
      <Header
        taskCount={tasks.length}
        dark={dark}
        lang={lang}
        showGitPanel={showGitPanel}
        onToggleTheme={toggleTheme}
        onToggleLang={toggleLang}
        onToggleGitPanel={() => setShowGitPanel(v => !v)}
      />

      {/* Body — sidebar + main + git panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          projects={projects}
          activeProjectId={activeProjectId}
          lang={lang}
          onSelect={setActiveProjectId}
          onAdd={() => setShowAddProject(true)}
          onDelete={handleDeleteProject}
        />

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {activeProjectId ? (
            <>
              <TaskInput
                tasks={tasks}
                lang={lang}
                onSubmit={handleCreateTask}
              />
              <KanbanBoard
                tasks={tasks}
                lang={lang}
                onClickTask={handleClickTask}
                onRetry={handleRetry}
                onCancel={handleCancel}
                onDelete={handleDelete}
                onViewLog={handleViewLog}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm">
              {projects.length === 0
                ? lang === 'zh' ? '点击左侧 "+ 添加项目" 开始' : 'Click "+ Add Project" to get started'
                : lang === 'zh' ? '请选择一个项目' : 'Select a project'}
            </div>
          )}
        </main>

        {/* Git Panel */}
        {showGitPanel && activeProjectId && (
          <GitPanel
            commits={commits}
            lang={lang}
            onClose={() => setShowGitPanel(false)}
          />
        )}
      </div>

      {/* Modals */}
      {showAddProject && (
        <AddProjectModal
          lang={lang}
          onSubmit={handleAddProject}
          onClose={() => setShowAddProject(false)}
        />
      )}

      {planTask && (
        <PlanModal
          task={planTask}
          lang={lang}
          onApprove={handleApprovePlan}
          onReject={handleRejectPlan}
          onClose={() => setPlanTask(null)}
        />
      )}

      {logWorkerId && (
        <LogModal
          workerId={logWorkerId}
          lang={lang}
          onClose={() => setLogWorkerId(null)}
        />
      )}
    </div>
  )
}
