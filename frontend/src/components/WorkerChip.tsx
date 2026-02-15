import type { Worker } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  worker: Worker
  index: number
  selected: boolean
  lang: Lang
  onClick: () => void
  onDoubleClick: () => void
}

const statusDot: Record<Worker['status'], string> = {
  idle: 'bg-green-400',
  busy: 'bg-blue-400 animate-pulse',
  stopped: 'bg-gray-400',
  error: 'bg-red-400',
}

export default function WorkerChip({ worker, index, selected, lang, onClick, onDoubleClick }: Props) {
  const label = `W${index}`
  const statusText = t(`workers.${worker.status}`, lang)
  const taskTitle = worker.status === 'busy' && worker.current_task_title
    ? worker.current_task_title.length > 20
      ? worker.current_task_title.slice(0, 20) + '…'
      : worker.current_task_title
    : null

  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap
        ${selected
          ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400'
          : 'hover:bg-gray-200 dark:hover:bg-gray-700'}
      `}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[worker.status]}`} />
      <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <span className="text-gray-500 dark:text-gray-400">
        {statusText}{taskTitle ? `: "${taskTitle}"` : ''}
      </span>
      {worker.tasks_completed > 0 && (
        <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-[10px] text-gray-500 dark:text-gray-400 leading-none">
          {worker.tasks_completed}
        </span>
      )}
    </button>
  )
}
