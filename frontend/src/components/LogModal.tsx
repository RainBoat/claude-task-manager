import { useEffect, useRef, useState } from 'react'
import { X, Wifi, WifiOff } from 'lucide-react'
import { createLogSocket } from '../api'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  workerId: string
  lang: Lang
  onClose: () => void
}

interface LogEntry {
  type: string
  timestamp?: string
  message?: string
  text?: string
  tool?: string
  error?: string
  [key: string]: any
}

const typeColor: Record<string, string> = {
  error: 'text-red-500 dark:text-red-400',
  tool_use: 'text-accent',
  tool_result: 'text-txt-muted',
  assistant: 'text-txt-secondary',
  system: 'text-amber-500 dark:text-amber-400',
}

export default function LogModal({ workerId, lang, onClose }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = createLogSocket(workerId)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setEntries(prev => [...prev, data])
      } catch { /* ignore */ }
    }

    return () => { ws.close() }
  }, [workerId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  const formatEntry = (entry: LogEntry): string => {
    const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''
    const msg = entry.message ?? entry.text ?? ''
    if (entry.type === 'assistant' && msg) return `${ts}  ${msg}`
    if (entry.type === 'tool_use') return `${ts}  → ${entry.tool ?? ''}: ${msg}`
    if (entry.type === 'tool_result') return `${ts}  ← ${msg.slice(0, 300)}`
    if (entry.type === 'error') return `${ts}  ✗ ${entry.error ?? msg}`
    if (entry.type === 'system') return `${ts}  ⚙ ${msg}`
    return `${ts}  [${entry.type}] ${msg || JSON.stringify(entry).slice(0, 200)}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col mx-4 border animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-txt font-mono">{t('log.title', lang)} — {workerId}</h2>
            {connected ? (
              <Wifi size={13} className="text-emerald-400" />
            ) : (
              <WifiOff size={13} className="text-red-400" />
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-light text-txt-muted hover:text-txt transition-all duration-150">
            <X size={16} />
          </button>
        </div>

        {/* Log content */}
        <div className="flex-1 overflow-y-auto p-4 log-terminal text-[11px] text-txt-secondary space-y-px">
          {entries.length === 0 && (
            <p className="text-txt-muted text-center py-8 text-xs">Waiting for log entries...</p>
          )}
          {entries.map((entry, i) => (
            <div key={i} className={`leading-relaxed font-mono ${typeColor[entry.type] ?? 'text-txt-muted'}`}>
              {formatEntry(entry)}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg border text-txt-secondary text-xs hover:bg-surface-light transition-all duration-150"
          >
            {t('log.close', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
