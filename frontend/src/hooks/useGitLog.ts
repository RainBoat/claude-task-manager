import { useEffect, useState, useCallback } from 'react'
import { fetchGitLog } from '../api'
import type { GitCommit } from '../types'

export function useGitLog(projectId: string | null, intervalMs = 10000) {
  const [commits, setCommits] = useState<GitCommit[]>([])

  const refresh = useCallback(async () => {
    if (!projectId) {
      setCommits([])
      return
    }
    try {
      const data = await fetchGitLog(projectId)
      setCommits(data)
    } catch {
      /* ignore */
    }
  }, [projectId])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [refresh, intervalMs])

  return { commits, refresh }
}
