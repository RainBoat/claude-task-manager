import type { Project } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  projects: Project[]
  activeProjectId: string | null
  lang: Lang
  onSelect: (projectId: string) => void
  onAdd: () => void
  onDelete: (projectId: string) => void
}

const statusColors: Record<string, string> = {
  cloning: 'bg-yellow-400',
  ready: 'bg-green-400',
  error: 'bg-red-400',
}

export default function Sidebar({ projects, activeProjectId, lang, onSelect, onAdd, onDelete }: Props) {
  return (
    <aside className="w-60 flex-shrink-0 bg-gray-900 dark:bg-gray-950 text-gray-100 flex flex-col h-full">
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
              onClick={() => onSelect(p.id)}
              className={`group flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors text-sm ${
                active
                  ? 'bg-indigo-600/20 border-l-2 border-indigo-500 text-white'
                  : 'border-l-2 border-transparent hover:bg-gray-800/60 text-gray-300 hover:text-white'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[p.status] || 'bg-gray-500'}`} />
              <span className="truncate flex-1">{p.name}</span>
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
  )
}
