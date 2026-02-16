import { useEffect, useRef, useState } from 'react'
import { createLogSocket } from '../api'
import type { Worker } from '../types'

export interface FeedEntry {
  workerId: string
  workerIndex: number
  type: string
  timestamp?: string
  message?: string
  text?: string
  tool?: string
  input?: string
  inputRaw?: string
  error?: string
  cost?: number
  duration?: number
  turns?: number
}

function hasContent(entry: FeedEntry): boolean {
  if (entry.type === 'assistant') return !!entry.text?.trim()
  if (entry.type === 'tool_use') return !!entry.tool
  if (entry.type === 'error') return !!(entry.error || entry.text)
  if (entry.type === 'result') return true
  if (entry.type === 'system') return !!entry.text?.trim()
  return !!(entry.text || entry.message)
}

const MAX_ENTRIES = 300

export function useWorkerLogs(workers: Worker[]) {
  const [entries, setEntries] = useState<FeedEntry[]>([])
  const socketsRef = useRef<Map<string, WebSocket>>(new Map())
  const workerIndexMap = useRef<Map<string, number>>(new Map())

  // Build stable index map
  useEffect(() => {
    workers.forEach((w, i) => {
      if (!workerIndexMap.current.has(w.id)) {
        workerIndexMap.current.set(w.id, i + 1)
      }
    })
  }, [workers])

  useEffect(() => {
    const sockets = socketsRef.current
    const busyIds = new Set(workers.filter(w => w.status === 'busy').map(w => w.id))

    // Close sockets for workers no longer busy
    for (const [id, ws] of sockets) {
      if (!busyIds.has(id)) {
        ws.close()
        sockets.delete(id)
      }
    }

    // Open sockets for newly busy workers
    for (const id of busyIds) {
      if (sockets.has(id)) continue
      const idx = workerIndexMap.current.get(id) ?? 0
      const ws = createLogSocket(id)
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          const entry: FeedEntry = {
            workerId: id,
            workerIndex: idx,
            type: data.type,
            timestamp: data.timestamp,
            message: data.message ?? data.text,
            text: data.text,
            tool: data.tool,
            input: data.input,
            inputRaw: data.input_raw,
            error: data.error,
            cost: data.cost,
            duration: data.duration,
            turns: data.turns,
          }
          if (!hasContent(entry)) return
          setEntries(prev => {
            const next = [...prev, entry]
            return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
          })
        } catch { /* ignore */ }
      }
      sockets.set(id, ws)
    }

    return () => {
      for (const ws of sockets.values()) ws.close()
      sockets.clear()
    }
  }, [workers])

  return entries
}
