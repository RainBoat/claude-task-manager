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
  idle: 'bg-emerald-400 glow-green',
  busy: 'bg-blue-400 glow-blue animate-pulse',
  stopped: 'bg-zinc-400',
  error: 'bg-red-400 glow-red',
}

export default function WorkerChip({ worker, index, selected, lang, onClick, onDoubleClick }: Props) {
  const label = `W${index}`
  const statusText = t(`workers.${worker.status}`, lang)
  const taskTitle = worker.status === 'busy' && worker.current_task_title
    ? worker.current_task_title.length > 18
      ? worker.current_task_title.slice(0, 18) + '…'
      : worker.current_task_title
    : null

  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-all duration-150 whitespace-nowrap
        ${selected
          ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
          : 'hover:bg-surface-light text-txt-secondary'}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot[worker.status]}`} />
      <span className="font-medium font-mono">{label}</span>
      {taskTitle && (
        <span className="text-txt-muted font-mono truncate max-w-[140px]">{taskTitle}</span>
      )}
      {worker.tasks_completed > 0 && (
        <span className="ml-0.5 px-1 py-px rounded text-[9px] bg-surface-light text-txt-muted font-mono leading-none">
          {worker.tasks_completed}
        </span>
      )}
    </button>
  )
}
