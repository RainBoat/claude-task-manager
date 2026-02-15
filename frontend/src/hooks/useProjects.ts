import { useEffect, useState, useCallback } from 'react'
import { fetchProjects } from '../api'
import type { Project } from '../types'

export function useProjects(intervalMs = 5000) {
  const [projects, setProjects] = useState<Project[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchProjects()
      setProjects(data)
      setError(null)
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [refresh, intervalMs])

  return { projects, error, refresh }
}
