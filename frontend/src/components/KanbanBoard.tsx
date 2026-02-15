import type { Task, KanbanColumn } from '../types'
import type { Lang } from '../i18n'
import KanbanColumnComp from './KanbanColumn'

const COLUMNS: KanbanColumn[] = [
  { key: 'backlog',     label: '待开发',    labelEn: 'Backlog',     color: 'gray',   statuses: ['pending', 'plan_approved'] },
  { key: 'in_progress', label: '开发中',    labelEn: 'In Progress', color: 'blue',   statuses: ['claimed', 'running', 'merging', 'testing'] },
  { key: 'review',      label: '待 Review', labelEn: 'Review',      color: 'purple', statuses: ['plan_pending'] },
  { key: 'done',        label: '已完成',    labelEn: 'Done',        color: 'green',  statuses: ['completed'] },
  { key: 'failed',      label: '失败',      labelEn: 'Failed',      color: 'red',    statuses: ['failed'] },
  { key: 'cancelled',   label: '已取消',    labelEn: 'Cancelled',   color: 'amber',  statuses: ['cancelled'] },
]

interface Props {
  tasks: Task[]
  lang: Lang
  onClickTask: (task: Task) => void
  onRetry: (taskId: string) => void
  onCancel: (taskId: string) => void
  onDelete: (taskId: string) => void
  onViewLog: (workerId: string) => void
}

export default function KanbanBoard({ tasks, lang, onClickTask, onRetry, onCancel, onDelete, onViewLog }: Props) {
  return (
    <div className="flex-1 overflow-x-auto kanban-scroll px-4 sm:px-6 pb-6">
      <div className="flex gap-4 min-w-max">
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => col.statuses.includes(t.status))
          return (
            <KanbanColumnComp
              key={col.key}
              column={col}
              tasks={colTasks}
              lang={lang}
              onClickTask={onClickTask}
              onRetry={onRetry}
              onCancel={onCancel}
              onDelete={onDelete}
              onViewLog={onViewLog}
            />
          )
        })}
      </div>
    </div>
  )
}
