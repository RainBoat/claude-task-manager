import { useEffect, useState, useCallback } from 'react'
import { fetchTasks } from '../api'
import type { Task } from '../types'

export function useTasks(projectId: string | null, intervalMs = 5000) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectId) {
      setTasks([])
      return
    }
    try {
      const data = await fetchTasks(projectId)
      setTasks(data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    }
  }, [projectId])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [refresh, intervalMs])

  return { tasks, error, refresh }
}
