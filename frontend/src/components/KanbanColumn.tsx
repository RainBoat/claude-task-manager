import type { Task, KanbanColumn } from '../types'
import type { Lang } from '../i18n'
import TaskCard from './TaskCard'

const colorMap: Record<string, { badge: string; bg: string }> = {
  gray:   { badge: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400', bg: 'bg-surface-light/50' },
  blue:   { badge: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400', bg: 'bg-blue-50/30 dark:bg-blue-500/[0.03]' },
  purple: { badge: 'bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400', bg: 'bg-violet-50/30 dark:bg-violet-500/[0.03]' },
  green:  { badge: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50/30 dark:bg-emerald-500/[0.03]' },
  red:    { badge: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400', bg: 'bg-red-50/30 dark:bg-red-500/[0.03]' },
  amber:  { badge: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400', bg: 'bg-amber-50/30 dark:bg-amber-500/[0.03]' },
  slate:  { badge: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400', bg: 'bg-surface-light/50' },
}

interface Props {
  column: KanbanColumn
  tasks: Task[]
  lang: Lang
  onClickTask: (task: Task) => void
  onRetry: (taskId: string) => void
  onCancel: (taskId: string) => void
  onDelete: (taskId: string) => void
  onViewLog: (workerId: string) => void
  onMerge: (taskId: string, squash: boolean) => void
  compact?: boolean
}

export default function KanbanColumnComp({ column, tasks, lang, onClickTask, onRetry, onCancel, onDelete, onViewLog, onMerge, compact }: Props) {
  const colors = colorMap[column.color] ?? colorMap.gray
  const label = lang === 'zh' ? column.label : column.labelEn

  if (compact) {
    return (
      <>
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            columnKey={column.key}
            lang={lang}
            onClick={() => onClickTask(task)}
            onRetry={() => onRetry(task.id)}
            onCancel={() => onCancel(task.id)}
            onDelete={() => onDelete(task.id)}
            onViewLog={() => task.worker_id && onViewLog(task.worker_id)}
            onMerge={(squash) => onMerge(task.id, squash)}
          />
        ))}
      </>
    )
  }

  return (
    <div className={`min-w-[260px] w-[260px] flex-shrink-0 rounded-xl ${colors.bg} flex flex-col max-h-[calc(100vh-200px)]`}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <h3 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">{label}</h3>
        <span className={`text-[10px] font-medium font-mono px-1.5 py-0.5 rounded-md ${colors.badge}`}>
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2">
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            columnKey={column.key}
            lang={lang}
            onClick={() => onClickTask(task)}
            onRetry={() => onRetry(task.id)}
            onCancel={() => onCancel(task.id)}
            onDelete={() => onDelete(task.id)}
            onViewLog={() => task.worker_id && onViewLog(task.worker_id)}
            onMerge={(squash) => onMerge(task.id, squash)}
          />
        ))}
      </div>
    </div>
  )
}
