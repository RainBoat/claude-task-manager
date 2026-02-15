import { useState, useEffect } from 'react'
import type { Project } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { updateProjectSettings, pushProject, fetchUnpushed } from '../api'

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
  cloning: 'bg-yellow-400',
  ready: 'bg-green-400',
  error: 'bg-red-400',
}

export default function Sidebar({ projects, activeProjectId, lang, open, onToggle, onSelect, onAdd, onDelete, onProjectUpdated }: Props) {
  const activeProject = projects.find(p => p.id === activeProjectId) ?? null
  const [unpushedCount, setUnpushedCount] = useState(0)
  const [hasRemote, setHasRemote] = useState(false)
  const [pushing, setPushing] = useState(false)

  // Poll unpushed count for active project
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
      {/* Mobile hamburger button */}
      <button
        onClick={onToggle}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-gray-900/80 text-white backdrop-blur-sm"
        aria-label="Toggle sidebar"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {open
            ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          }
        </svg>
      </button>

      {/* Backdrop for mobile */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-40 h-full
        w-60 flex-shrink-0 bg-gray-900 dark:bg-gray-950 text-gray-100 flex flex-col
        transition-transform duration-200 ease-in-out
        ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-2.5 border-b border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow">
            C
          </div>
          <span className="font-semibold text-sm tracking-tight">Claude Dev</span>
        </div>

        {/* Project list */}
        <nav className="flex-1 overflow-y-auto py-2">
          {projects.length === 0 && (
            <p className="px-4 py-6 text-xs text-gray-500 text-center">{t('sidebar.no_projects', lang)}</p>
          )}
          {projects.map(p => {
            const active = p.id === activeProjectId
            return (
              <div
                key={p.id}
                onClick={() => { onSelect(p.id); onToggle() }}
                className={`group flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors text-sm ${
                  active
                    ? 'bg-indigo-600/20 border-l-2 border-indigo-500 text-white'
                    : 'border-l-2 border-transparent hover:bg-gray-800/60 text-gray-300 hover:text-white'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[p.status] || 'bg-gray-500'}`} />
                <span className="truncate flex-1">{p.name}</span>
                {p.source_type === 'local' && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-gray-700 text-gray-400 flex-shrink-0">local</span>
                )}
                <button
                  onClick={e => {
                    e.stopPropagation()
                    if (confirm(t('sidebar.delete_confirm', lang))) onDelete(p.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity text-xs p-0.5"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </nav>

        {/* Project settings (when a project is selected) */}
        {activeProject && activeProject.status === 'ready' && (
          <div className="px-3 py-3 border-t border-gray-800 space-y-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
              {lang === 'zh' ? '项目设置' : 'Settings'}
            </p>

            {/* Auto merge toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-gray-400">
                {lang === 'zh' ? '自动合并' : 'Auto Merge'}
              </span>
              <button
                onClick={() => handleToggleSetting('auto_merge', !activeProject.auto_merge)}
                className={`relative w-8 h-4.5 rounded-full transition-colors ${
                  activeProject.auto_merge ? 'bg-indigo-500' : 'bg-gray-600'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  activeProject.auto_merge ? 'translate-x-3.5' : ''
                }`} />
              </button>
            </label>

            {/* Auto push toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-gray-400">
                {lang === 'zh' ? '自动推送' : 'Auto Push'}
              </span>
              <button
                onClick={() => handleToggleSetting('auto_push', !activeProject.auto_push)}
                className={`relative w-8 h-4.5 rounded-full transition-colors ${
                  activeProject.auto_push ? 'bg-indigo-500' : 'bg-gray-600'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                  activeProject.auto_push ? 'translate-x-3.5' : ''
                }`} />
              </button>
            </label>

            {/* Push button — only show when there's a remote */}
            {hasRemote && (
              <button
                onClick={handlePush}
                disabled={pushing || unpushedCount === 0}
                className="w-full mt-1 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white"
              >
                {pushing ? (lang === 'zh' ? '推送中...' : 'Pushing...') : (
                  <>
                    Push
                    {unpushedCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">{unpushedCount}</span>
                    )}
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Add button */}
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={onAdd}
            className="w-full py-2 rounded-lg border border-dashed border-gray-600 hover:border-indigo-500 hover:bg-indigo-600/10 text-gray-400 hover:text-indigo-400 text-sm transition-colors"
          >
            + {t('sidebar.add_project', lang)}
          </button>
        </div>
      </aside>
    </>
  )
}
