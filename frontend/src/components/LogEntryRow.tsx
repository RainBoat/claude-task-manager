import React, { useState, useCallback } from 'react'
import type { FeedEntry } from '../hooks/useWorkerLogs'

const toolBadgeColor: Record<string, string> = {
  Read: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  ReadFile: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  Edit: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  EditFile: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  Write: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  WriteFile: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  Bash: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  Grep: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  Glob: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  Task: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
}
const defaultBadge = 'bg-gray-500/15 text-gray-400 border-gray-500/20'

interface Props {
  entry: FeedEntry
  showWorkerLabel?: boolean
}

const LogEntryRow = React.memo(function LogEntryRow({ entry, showWorkerLabel }: Props) {
  const [expanded, setExpanded] = useState(false)
  const toggle = useCallback(() => setExpanded(v => !v), [])

  const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''
  const prefix = showWorkerLabel ? `W${entry.workerIndex}` : null

  if (entry.type === 'assistant' && entry.text) {
    return (
      <div className="group py-0.5">
        <div className="flex gap-2 items-start">
          {prefix && <span className="text-txt-muted flex-shrink-0 w-6 text-right text-[10px] pt-px">{prefix}</span>}
          <span className="text-txt-muted flex-shrink-0 text-[10px] w-[52px] text-right pt-px">{ts}</span>
          <div
            className={`text-txt-secondary whitespace-pre-wrap cursor-pointer min-w-0 ${expanded ? '' : 'line-clamp-6'}`}
            onClick={toggle}
            title={expanded ? 'Click to collapse' : 'Click to expand'}
          >
            {entry.text}
          </div>
        </div>
      </div>
    )
  }

  if (entry.type === 'tool_use') {
    const badge = toolBadgeColor[entry.tool ?? ''] ?? defaultBadge
    return (
      <div className="group py-0.5">
        <div className="flex gap-2 items-start">
          {prefix && <span className="text-txt-muted flex-shrink-0 w-6 text-right text-[10px] pt-px">{prefix}</span>}
          <span className="text-txt-muted flex-shrink-0 text-[10px] w-[52px] text-right pt-px">{ts}</span>
          <span className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-medium border flex-shrink-0 ${badge}`}>
            {entry.tool}
          </span>
          <span className="text-txt-muted truncate min-w-0" title={entry.inputRaw ?? entry.input}>
            {entry.input}
          </span>
        </div>
      </div>
    )
  }

  if (entry.type === 'error') {
    return (
      <div className="group py-0.5">
        <div className="flex gap-2 items-start">
          {prefix && <span className="text-txt-muted flex-shrink-0 w-6 text-right text-[10px] pt-px">{prefix}</span>}
          <span className="text-txt-muted flex-shrink-0 text-[10px] w-[52px] text-right pt-px">{ts}</span>
          <span className="text-red-500 dark:text-red-400 min-w-0">✗ {entry.error}</span>
        </div>
      </div>
    )
  }

  if (entry.type === 'result') {
    const parts: string[] = []
    if (entry.turns) parts.push(`${entry.turns} turns`)
    if (entry.cost != null) parts.push(`$${entry.cost.toFixed(4)}`)
    if (entry.duration != null) parts.push(`${(entry.duration / 1000).toFixed(1)}s`)
    return (
      <div className="group py-0.5">
        <div className="flex gap-2 items-start">
          {prefix && <span className="text-txt-muted flex-shrink-0 w-6 text-right text-[10px] pt-px">{prefix}</span>}
          <span className="text-txt-muted flex-shrink-0 text-[10px] w-[52px] text-right pt-px">{ts}</span>
          <span className="text-emerald-500 dark:text-emerald-400">✓ {parts.join(' · ')}</span>
        </div>
      </div>
    )
  }

  if (entry.type === 'system') {
    return (
      <div className="group py-0.5">
        <div className="flex gap-2 items-start">
          {prefix && <span className="text-txt-muted flex-shrink-0 w-6 text-right text-[10px] pt-px">{prefix}</span>}
          <span className="text-txt-muted flex-shrink-0 text-[10px] w-[52px] text-right pt-px">{ts}</span>
          <span className="text-amber-500 dark:text-amber-400 text-[10px]">⚙ {entry.text}</span>
        </div>
      </div>
    )
  }

  // Fallback
  return (
    <div className="group py-0.5">
      <div className="flex gap-2 items-start">
        {prefix && <span className="text-txt-muted flex-shrink-0 w-6 text-right text-[10px] pt-px">{prefix}</span>}
        <span className="text-txt-muted flex-shrink-0 text-[10px] w-[52px] text-right pt-px">{ts}</span>
        <span className="text-txt-muted min-w-0 truncate">{entry.text ?? entry.message ?? ''}</span>
      </div>
    </div>
  )
})

export default LogEntryRow
