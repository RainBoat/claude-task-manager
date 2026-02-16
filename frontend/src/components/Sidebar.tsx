import { useState, useEffect } from 'react'
import { Plus, Trash2, RotateCcw, Upload, Settings, Menu, X, Loader2 } from 'lucide-react'
import type { Project } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { updateProjectSettings, pushProject, fetchUnpushed, retryProject } from '../api'

interface Props {
  projects: Project[]
  activeProjectId: string | null
  lang: Lang
  open: boolean
  onToggle: () => void
  onSelect: (projectId: string) => void
  onAdd: () => void
  onDelete: (projectId: string) => void
  onProjectUpdated: () => void
}

const statusColors: Record<string, string> = {
  cloning: 'bg-amber-400',
  ready: 'bg-emerald-400',
  error: 'bg-red-400',
}

export default function Sidebar({ projects, activeProjectId, lang, open, onToggle, onSelect, onAdd, onDelete, onProjectUpdated }: Props) {
  const activeProject = projects.find(p => p.id === activeProjectId) ?? null
  const [unpushedCount, setUnpushedCount] = useState(0)
  const [hasRemote, setHasRemote] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const handleRetry = async (projectId: string) => {
    if (retrying) return
    setRetrying(true)
    try {
      await retryProject(projectId)
      onProjectUpdated()
    } catch (e: any) {
      alert(e.message || 'Retry failed')
    } finally {
      setRetrying(false)
    }
  }

  useEffect(() => {
    if (!activeProjectId) return
    let cancelled = false
    const poll = () => {
      fetchUnpushed(activeProjectId)
        .then(data => {
          if (!cancelled) {
            setUnpushedCount(data.count)
            setHasRemote(data.has_remote)
          }
        })
        .catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [activeProjectId])

  const handleToggleSetting = async (key: 'auto_merge' | 'auto_push', value: boolean) => {
    if (!activeProjectId) return
    try {
      await updateProjectSettings(activeProjectId, { [key]: value })
      onProjectUpdated()
    } catch {}
  }

  const handlePush = async () => {
    if (!activeProjectId || pushing) return
    setPushing(true)
    try {
      await pushProject(activeProjectId)
      setUnpushedCount(0)
    } catch (e: any) {
      alert(e.message || 'Push failed')
    } finally {
      setPushing(false)
    }
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={onToggle}
        className="md:hidden fixed top-2.5 left-3 z-50 p-2 rounded-lg bg-surface/90 backdrop-blur-sm border text-txt-secondary hover:text-txt transition-all duration-150"
        aria-label="Toggle sidebar"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Mobile backdrop */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={onToggle} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-40 h-full
        w-56 flex-shrink-0 bg-surface-deep text-txt flex flex-col
        border-r border
        transition-transform duration-200 ease-out
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Brand */}
        <div className="px-3 h-12 flex items-center gap-2 border-b border">
          <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-white font-bold text-[11px]">
            C
          </div>
          <span className="font-semibold text-sm tracking-tight text-txt">Claude Dev</span>
        </div>

        {/* Project list */}
        <nav className="flex-1 overflow-y-auto py-1">
          {projects.length === 0 && (
            <p className="px-3 py-8 text-xs text-txt-muted text-center">{t('sidebar.no_projects', lang)}</p>
          )}
          {projects.map(p => {
            const active = p.id === activeProjectId
            return (
              <div
                key={p.id}
                onClick={() => { onSelect(p.id); onToggle() }}
                className={`group flex items-center gap-2 mx-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 text-[13px] ${
                  active
                    ? 'bg-accent/8 text-txt'
                    : 'hover:bg-surface-light text-txt-secondary hover:text-txt'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColors[p.status] || 'bg-zinc-400'} ${p.status === 'cloning' ? 'animate-pulse' : ''}`} />
                <span className="truncate flex-1 font-mono text-xs">{p.name}</span>
                {p.source_type === 'local' && (
                  <span className="text-[9px] px-1 py-px rounded bg-surface-lighter text-txt-muted font-mono flex-shrink-0">local</span>
                )}
                {p.status === 'cloning' && (
                  <Loader2 size={12} className="animate-spin text-amber-400 flex-shrink-0" />
                )}
                {p.status === 'error' && (
                  <button
                    onClick={e => { e.stopPropagation(); handleRetry(p.id) }}
                    className="text-[10px] p-0.5 rounded text-red-400 hover:bg-red-500/10 transition-all duration-150 flex-shrink-0"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
                <button
                  onClick={e => {
                    e.stopPropagation()
                    if (confirm(t('sidebar.delete_confirm', lang))) onDelete(p.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-txt-muted hover:text-red-400 transition-all duration-150 p-0.5 rounded hover:bg-red-500/10 flex-shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
        </nav>

        {/* Settings panel */}
        {activeProject && activeProject.status === 'ready' && (
          <div className="px-3 py-3 border-t border space-y-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-txt-muted uppercase tracking-wider font-medium">
              <Settings size={10} />
              <span>{lang === 'zh' ? '设置' : 'Settings'}</span>
            </div>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px] text-txt-secondary">{lang === 'zh' ? '自动合并' : 'Auto Merge'}</span>
              <button
                onClick={() => handleToggleSetting('auto_merge', !activeProject.auto_merge)}
                className={`relative w-7 h-4 rounded-full transition-all duration-200 ${
                  activeProject.auto_merge ? 'bg-accent' : 'bg-surface-lighter'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  activeProject.auto_merge ? 'translate-x-3' : ''
                }`} />
              </button>
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[11px] text-txt-secondary">{lang === 'zh' ? '自动推送' : 'Auto Push'}</span>
              <button
                onClick={() => handleToggleSetting('auto_push', !activeProject.auto_push)}
                className={`relative w-7 h-4 rounded-full transition-all duration-200 ${
                  activeProject.auto_push ? 'bg-accent' : 'bg-surface-lighter'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  activeProject.auto_push ? 'translate-x-3' : ''
                }`} />
              </button>
            </label>

            {hasRemote && (
              <button
                onClick={handlePush}
                disabled={pushing || unpushedCount === 0}
                className="w-full py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 flex items-center justify-center gap-1.5 bg-accent hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed text-white"
              >
                <Upload size={12} />
                {pushing ? '...' : 'Push'}
                {unpushedCount > 0 && (
                  <span className="px-1 py-px rounded bg-white/20 text-[9px] leading-none">{unpushedCount}</span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Error panel */}
        {activeProject && activeProject.status === 'error' && (
          <div className="px-3 py-3 border-t border space-y-2">
            <p className="text-[10px] text-red-500 dark:text-red-400 uppercase tracking-wider font-medium">
              {t('project.error_label', lang)}
            </p>
            {activeProject.error && (
              <p className="text-[11px] text-red-600/80 dark:text-red-300/80 leading-relaxed break-words max-h-20 overflow-y-auto bg-red-500/5 dark:bg-red-500/10 rounded-md px-2 py-1.5">
                {activeProject.error}
              </p>
            )}
            <button
              onClick={() => handleRetry(activeProject.id)}
              disabled={retrying}
              className="w-full py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white"
            >
              <RotateCcw size={12} />
              {retrying ? t('project.retrying', lang) : t('project.retry', lang)}
            </button>
          </div>
        )}

        {/* Cloning panel */}
        {activeProject && activeProject.status === 'cloning' && (
          <div className="px-3 py-3 border-t border">
            <div className="flex items-center gap-2 text-xs text-amber-500 dark:text-amber-400">
              <Loader2 size={14} className="animate-spin" />
              <span>{t('project.status_cloning', lang)}</span>
            </div>
          </div>
        )}

        {/* Add button */}
        <div className="p-2 border-t border">
          <button
            onClick={onAdd}
            className="w-full py-1.5 rounded-lg text-[11px] font-medium text-txt-secondary hover:text-txt hover:bg-surface-light transition-all duration-150 flex items-center justify-center gap-1.5"
          >
            <Plus size={14} />
            {t('sidebar.add_project', lang)}
          </button>
        </div>
      </aside>
    </>
  )
}
