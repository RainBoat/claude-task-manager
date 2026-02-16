import { RotateCcw, Trash2, Eye, GitMerge, GitPullRequest, Square, X } from 'lucide-react'
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

const accentMap: Record<string, string> = {
  backlog:     'border-l-zinc-400 dark:border-l-zinc-500',
  in_progress: 'border-l-blue-500',
  review:      'border-l-violet-500',
  merge:       'border-l-amber-500',
  done:        'border-l-emerald-500',
  failed:      'border-l-red-500',
  cancelled:   'border-l-zinc-400',
}

export default function TaskCard({ task, columnKey, lang, onClick, onRetry, onCancel, onDelete, onViewLog, onMerge }: Props) {
  const accent = accentMap[columnKey] ?? accentMap.backlog

  return (
    <div
      className={`group rounded-lg p-3 cursor-pointer transition-all duration-200 bg-surface border border-l-2 ${accent} hover:-translate-y-0.5 hover:shadow-md animate-fade-in`}
      onClick={onClick}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-txt-muted">#{task.id}</span>
        <div className="flex items-center gap-1">
          {task.depends_on && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
              ← {task.depends_on}
            </span>
          )}
          {task.priority > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 font-mono font-medium">
              P{task.priority}
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <h4 className="text-[13px] font-medium leading-snug mb-1 line-clamp-2 text-txt">{task.title}</h4>

      {/* Column-specific content */}
      {columnKey === 'backlog' && task.description && (
        <p className="text-xs text-txt-muted line-clamp-2 leading-relaxed">{task.description}</p>
      )}

      {columnKey === 'backlog' && (
        <div className="flex justify-end mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={e => { e.stopPropagation(); onCancel() }}
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-txt-muted hover:text-red-500 hover:bg-red-500/10 transition-all duration-150"
          >
            <X size={11} />
            {t('card.cancel', lang)}
          </button>
        </div>
      )}

      {columnKey === 'in_progress' && (
        <div className="flex items-center gap-1.5 mt-2">
          {task.worker_id && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-medium">
              {task.worker_id}
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-surface-light text-txt-muted font-mono">
            {task.status}
          </span>
          {task.worker_id && (
            <button
              onClick={e => { e.stopPropagation(); onViewLog() }}
              className="ml-auto text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-txt-muted hover:text-txt-secondary hover:bg-surface-light transition-all duration-150 opacity-0 group-hover:opacity-100"
            >
              <Eye size={11} />
              {t('card.view_log', lang)}
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onCancel() }}
            className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-txt-muted hover:text-red-500 hover:bg-red-500/10 transition-all duration-150 opacity-0 group-hover:opacity-100"
          >
            <Square size={9} className="fill-current" />
            {t('card.stop', lang)}
          </button>
        </div>
      )}

      {columnKey === 'review' && (
        <div className="mt-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium font-mono">
              Plan
            </span>
            <button
              onClick={e => { e.stopPropagation(); onCancel() }}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-txt-muted hover:text-red-500 hover:bg-red-500/10 transition-all duration-150 opacity-0 group-hover:opacity-100"
            >
              <X size={11} />
              {t('card.cancel', lang)}
            </button>
          </div>
          {task.plan && (
            <p className="text-xs text-txt-muted line-clamp-3 mt-1.5 leading-relaxed">{task.plan.slice(0, 120)}...</p>
          )}
        </div>
      )}

      {columnKey === 'done' && (
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-txt-muted font-mono">
          {task.commit_id && <code className="text-accent/70">{task.commit_id.slice(0, 7)}</code>}
          {task.completed_at && <span>{timeAgo(task.completed_at, lang)}</span>}
        </div>
      )}

      {columnKey === 'failed' && (
        <div className="mt-2">
          {task.error && (
            <p className="text-xs text-red-500 dark:text-red-400 line-clamp-2 mb-2 leading-relaxed">{task.error}</p>
          )}
          <div className="flex gap-1">
            <button
              onClick={e => { e.stopPropagation(); onRetry() }}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 font-medium transition-all duration-150"
            >
              <RotateCcw size={11} />
              {t('card.retry', lang)}
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 font-medium transition-all duration-150"
            >
              <Trash2 size={11} />
              {t('card.delete', lang)}
            </button>
          </div>
        </div>
      )}

      {columnKey === 'merge' && (
        <div className="mt-2">
          {task.branch && (
            <p className="text-[10px] font-mono text-txt-muted mb-1.5 truncate">{task.branch}</p>
          )}
          {task.commit_id && (
            <code className="text-[10px] font-mono text-accent/70 block mb-2">{task.commit_id.slice(0, 7)}</code>
          )}
          <div className="flex gap-1">
            <button
              onClick={e => { e.stopPropagation(); onMerge(true) }}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 font-medium font-mono transition-all duration-150"
            >
              <GitPullRequest size={11} />
              Squash
            </button>
            <button
              onClick={e => { e.stopPropagation(); onMerge(false) }}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 font-medium font-mono transition-all duration-150"
            >
              <GitMerge size={11} />
              Merge
            </button>
          </div>
        </div>
      )}

      {columnKey === 'cancelled' && task.error && (
        <p className="text-xs text-txt-muted line-clamp-2 mt-1 leading-relaxed">{task.error}</p>
      )}

      {columnKey === 'cancelled' && (
        <div className="flex gap-1 mt-2">
          <button
            onClick={e => { e.stopPropagation(); onRetry() }}
            className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 font-medium transition-all duration-150"
          >
            <RotateCcw size={11} />
            {t('card.retry', lang)}
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 font-medium transition-all duration-150"
          >
            <Trash2 size={11} />
            {t('card.delete', lang)}
          </button>
        </div>
      )}
    </div>
  )
}
