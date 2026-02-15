import { useState } from 'react'
import type { Task, KanbanColumn } from '../types'
import type { Lang } from '../i18n'
import KanbanColumnComp from './KanbanColumn'

const COLUMNS: KanbanColumn[] = [
  { key: 'backlog',     label: '待开发',    labelEn: 'Backlog',     color: 'gray',   statuses: ['pending', 'plan_approved'] },
  { key: 'in_progress', label: '开发中',    labelEn: 'In Progress', color: 'blue',   statuses: ['claimed', 'running', 'merging', 'testing'] },
  { key: 'review',      label: '待 Review', labelEn: 'Review',      color: 'purple', statuses: ['plan_pending'] },
  { key: 'merge',       label: '待合并',    labelEn: 'Merge',       color: 'amber',  statuses: ['merge_pending'] },
  { key: 'done',        label: '已完成',    labelEn: 'Done',        color: 'green',  statuses: ['completed'] },
  { key: 'failed',      label: '失败',      labelEn: 'Failed',      color: 'red',    statuses: ['failed'] },
  { key: 'cancelled',   label: '已取消',    labelEn: 'Cancelled',   color: 'slate',  statuses: ['cancelled'] },
]

const tabColors: Record<string, string> = {
  gray: 'border-gray-400 text-gray-600 dark:text-gray-400',
  blue: 'border-blue-500 text-blue-600 dark:text-blue-400',
  purple: 'border-purple-500 text-purple-600 dark:text-purple-400',
  green: 'border-green-500 text-green-600 dark:text-green-400',
  red: 'border-red-500 text-red-600 dark:text-red-400',
  amber: 'border-amber-500 text-amber-600 dark:text-amber-400',
  slate: 'border-slate-400 text-slate-600 dark:text-slate-400',
}

interface Props {
  tasks: Task[]
  lang: Lang
  onClickTask: (task: Task) => void
  onRetry: (taskId: string) => void
  onCancel: (taskId: string) => void
  onDelete: (taskId: string) => void
  onViewLog: (workerId: string) => void
  onMerge: (taskId: string, squash: boolean) => void
}

export default function KanbanBoard({ tasks, lang, onClickTask, onRetry, onCancel, onDelete, onViewLog, onMerge }: Props) {
  const [mobileTab, setMobileTab] = useState('backlog')

  const getCount = (col: KanbanColumn) => tasks.filter(t => col.statuses.includes(t.status)).length

  return (
    <>
      {/* Mobile: tab bar + single column */}
      <div className="md:hidden flex flex-col flex-1 overflow-hidden">
        <div className="flex overflow-x-auto px-2 py-2 gap-1 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          {COLUMNS.map(col => {
            const count = getCount(col)
            const active = mobileTab === col.key
            const label = lang === 'zh' ? col.label : col.labelEn
            return (
              <button
                key={col.key}
                onClick={() => setMobileTab(col.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? `${tabColors[col.color] || ''} bg-gray-100 dark:bg-gray-800 border-b-2`
                    : 'text-gray-500 dark:text-gray-400 border-b-2 border-transparent'
                }`}
              >
                {label} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
          {COLUMNS.filter(col => col.key === mobileTab).map(col => {
            const colTasks = tasks.filter(t => col.statuses.includes(t.status))
            return (
              <div key={col.key} className="space-y-2.5">
                {colTasks.length === 0 && (
                  <p className="text-center text-xs text-gray-400 dark:text-gray-600 py-8">
                    {lang === 'zh' ? '暂无任务' : 'No tasks'}
                  </p>
                )}
                {colTasks.map(task => (
                  <div key={task.id}>
                    <KanbanColumnComp
                      column={col}
                      tasks={[task]}
                      lang={lang}
                      onClickTask={onClickTask}
                      onRetry={onRetry}
                      onCancel={onCancel}
                      onDelete={onDelete}
                      onViewLog={onViewLog}
                      onMerge={onMerge}
                      compact
                    />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Desktop: horizontal columns */}
      <div className="hidden md:flex flex-1 overflow-x-auto kanban-scroll px-4 sm:px-6 pb-6">
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
                onMerge={onMerge}
              />
            )
          })}
        </div>
      </div>
    </>
  )
}
