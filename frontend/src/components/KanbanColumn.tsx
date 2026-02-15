import type { Task, KanbanColumn } from '../types'
import type { Lang } from '../i18n'
import TaskCard from './TaskCard'

const colorMap: Record<string, { badge: string; bg: string }> = {
  gray:   { badge: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300', bg: 'bg-gray-50 dark:bg-gray-900/50' },
  blue:   { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', bg: 'bg-blue-50/50 dark:bg-blue-950/30' },
  purple: { badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300', bg: 'bg-purple-50/50 dark:bg-purple-950/30' },
  green:  { badge: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', bg: 'bg-green-50/50 dark:bg-green-950/30' },
  red:    { badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', bg: 'bg-red-50/50 dark:bg-red-950/30' },
  amber:  { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300', bg: 'bg-amber-50/50 dark:bg-amber-950/30' },
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
}

export default function KanbanColumnComp({ column, tasks, lang, onClickTask, onRetry, onCancel, onDelete, onViewLog }: Props) {
  const colors = colorMap[column.color] ?? colorMap.gray
  const label = lang === 'zh' ? column.label : column.labelEn

  return (
    <div className={`min-w-[280px] w-[280px] flex-shrink-0 rounded-xl ${colors.bg} flex flex-col max-h-[calc(100vh-220px)]`}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2.5">
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
          />
        ))}
      </div>
    </div>
  )
}
