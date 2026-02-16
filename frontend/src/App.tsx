import { useState, useCallback, useEffect } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import GitPanel from './components/GitPanel'
import AddProjectModal from './components/AddProjectModal'
import TaskInput from './components/TaskInput'
import KanbanBoard from './components/KanbanBoard'
import PlanModal from './components/PlanModal'
import BatchPlanReview from './components/BatchPlanReview'
import LogModal from './components/LogModal'
import WorkerStatusBar from './components/WorkerStatusBar'
import { useProjects } from './hooks/useProjects'
import { useTasks } from './hooks/useTasks'
import { useWorkers } from './hooks/useWorkers'
import { useGitLog } from './hooks/useGitLog'
import { useTheme } from './hooks/useTheme'
import { useStats } from './hooks/useStats'
import {
  createProject, deleteProject as apiDeleteProject,
  createTask, deleteTask, cancelTask, retryTask, approvePlan, batchApprovePlans,
  mergeTask,
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
  const workers = useWorkers(5000)
  const stats = useStats(activeProjectId, 10000)

  // Modal state
  const [planTask, setPlanTask] = useState<Task | null>(null)
  const [logWorkerId, setLogWorkerId] = useState<string | null>(null)
  const [showBatchReview, setShowBatchReview] = useState(false)

  const planPendingTasks = tasks.filter(t => t.status === 'plan_pending')

  const toggleLang = useCallback(() => setLang(l => l === 'zh' ? 'en' : 'zh'), [])

  // Project handlers
  const handleAddProject = useCallback(async (name: string, repoUrl: string, branch: string, sourceType: 'git' | 'local' | 'new' = 'git') => {
    await createProject({ name, repo_url: repoUrl, branch, source_type: sourceType })
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

  const handleMerge = useCallback(async (taskId: string, squash: boolean) => {
    if (!activeProjectId) return
    try {
      await mergeTask(activeProjectId, taskId, squash)
      await refreshTasks()
    } catch (e: any) {
      alert(e.message || 'Merge failed')
    }
  }, [activeProjectId, refreshTasks])

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

  // Batch plan handlers
  const handleBatchApproveSingle = useCallback(async (taskId: string) => {
    if (!activeProjectId) return
    await approvePlan(activeProjectId, taskId, true)
    await refreshTasks()
  }, [activeProjectId, refreshTasks])

  const handleBatchRejectSingle = useCallback(async (taskId: string, feedback: string) => {
    if (!activeProjectId) return
    await approvePlan(activeProjectId, taskId, false, feedback)
    await refreshTasks()
  }, [activeProjectId, refreshTasks])

  const handleApproveAll = useCallback(async () => {
    if (!activeProjectId || planPendingTasks.length === 0) return
    await batchApprovePlans(activeProjectId, planPendingTasks.map(t => t.id), true)
    setShowBatchReview(false)
    await refreshTasks()
  }, [activeProjectId, planPendingTasks, refreshTasks])

  return (
    <div className="h-screen flex flex-col bg-surface-deep text-txt font-sans">
      {/* Header — full width */}
      <Header
        taskCount={tasks.length}
        dark={dark}
        lang={lang}
        showGitPanel={showGitPanel}
        stats={stats}
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
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(v => !v)}
          onSelect={setActiveProjectId}
          onAdd={() => setShowAddProject(true)}
          onDelete={handleDeleteProject}
          onProjectUpdated={refreshProjects}
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
              {/* Batch review entry point */}
              {planPendingTasks.length > 1 && (
                <div className="px-4 sm:px-6 -mt-2 mb-2">
                  <button
                    onClick={() => setShowBatchReview(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium font-mono bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25 transition-all duration-200"
                  >
                    {lang === 'zh'
                      ? `批量审批 ${planPendingTasks.length} 个 Plan`
                      : `Batch Review ${planPendingTasks.length} Plans`}
                  </button>
                </div>
              )}
              <KanbanBoard
                tasks={tasks}
                lang={lang}
                onClickTask={handleClickTask}
                onRetry={handleRetry}
                onCancel={handleCancel}
                onDelete={handleDelete}
                onViewLog={handleViewLog}
                onMerge={handleMerge}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-txt-muted text-sm font-mono">
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

      {/* Worker Status Bar */}
      <WorkerStatusBar workers={workers} lang={lang} onViewFullLog={handleViewLog} />

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

      {showBatchReview && (
        <BatchPlanReview
          tasks={planPendingTasks}
          lang={lang}
          onApprove={handleBatchApproveSingle}
          onReject={handleBatchRejectSingle}
          onApproveAll={handleApproveAll}
          onOpenDetail={(task) => { setShowBatchReview(false); setPlanTask(task) }}
          onClose={() => setShowBatchReview(false)}
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
