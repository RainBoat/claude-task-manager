import type { Task } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'

function timeAgo(iso: string, lang: Lang): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return lang === 'zh' ? '刚刚' : 'just now'
  if (mins < 60) return lang === 'zh' ? `${mins} 分钟前` : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return lang === 'zh' ? `${hrs} 小时前` : `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return lang === 'zh' ? `${days} 天前` : `${days}d ago`
}

interface Props {
  task: Task
  columnKey: string
  lang: Lang
  onClick: () => void
  onRetry: () => void
  onCancel: () => void
  onDelete: () => void
  onViewLog: () => void
  onMerge: (squash: boolean) => void
}

export default function TaskCard({ task, columnKey, lang, onClick, onRetry, onCancel, onDelete, onViewLog, onMerge }: Props) {
  const base = 'rounded-xl p-3 cursor-pointer transition-all hover:shadow-md border'

  const styleMap: Record<string, string> = {
    backlog:     'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    in_progress: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    review:      'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800',
    merge:       'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    done:        'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800',
    failed:      'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',
    cancelled:   'bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 opacity-70',
  }

  return (
    <div className={`${base} ${styleMap[columnKey] ?? styleMap.backlog}`} onClick={onClick}>
      {/* Header row: ID + priority */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">#{task.id}</span>
        <div className="flex items-center gap-1.5">
          {task.depends_on && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              🔗 {task.depends_on}
            </span>
          )}
          {task.priority > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
              P{task.priority}
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium leading-snug mb-1 line-clamp-2">{task.title}</h4>

      {/* Column-specific content */}
      {columnKey === 'backlog' && task.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-1">{task.description}</p>
      )}

      {columnKey === 'in_progress' && (
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
            {task.worker_id ?? 'assigning...'}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-200/60 dark:bg-blue-800/60 text-blue-600 dark:text-blue-300">
            {task.status}
          </span>
          {task.worker_id && (
            <button
              onClick={e => { e.stopPropagation(); onViewLog() }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {t('card.view_log', lang)}
            </button>
          )}
        </div>
      )}

      {columnKey === 'review' && (
        <div className="mt-1.5">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300 font-medium">
            Plan
          </span>
          {task.plan && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mt-1.5">{task.plan.slice(0, 120)}...</p>
          )}
        </div>
      )}

      {columnKey === 'done' && (
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
          {task.commit_id && <span className="font-mono">{task.commit_id.slice(0, 7)}</span>}
          {task.completed_at && <span>{timeAgo(task.completed_at, lang)}</span>}
        </div>
      )}

      {columnKey === 'failed' && (
        <div className="mt-2">
          {task.error && (
            <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2 mb-2">{task.error}</p>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={e => { e.stopPropagation(); onRetry() }}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800"
            >
              🔄 {t('card.retry', lang)}
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800"
            >
              🗑️ {t('card.delete', lang)}
            </button>
          </div>
        </div>
      )}

      {columnKey === 'merge' && (
        <div className="mt-2">
          {task.branch && (
            <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400 mb-2 truncate">{task.branch}</p>
          )}
          {task.commit_id && (
            <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mb-2">{task.commit_id.slice(0, 7)}</p>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={e => { e.stopPropagation(); onMerge(true) }}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800 font-medium"
            >
              Squash Merge
            </button>
            <button
              onClick={e => { e.stopPropagation(); onMerge(false) }}
              className="text-[10px] px-2.5 py-1 rounded-lg bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800 font-medium"
            >
              Merge
            </button>
          </div>
        </div>
      )}

      {columnKey === 'cancelled' && task.error && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{task.error}</p>
      )}
    </div>
  )
}
