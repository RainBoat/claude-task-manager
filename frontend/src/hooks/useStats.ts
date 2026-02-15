import { useState, useEffect } from 'react'

export interface ProjectStats {
  total: number
  completed: number
  failed: number
  cancelled: number
  in_progress: number
  pending: number
  success_rate: number | null
  avg_duration_seconds: number | null
  failure_reasons: Record<string, number>
}

export function useStats(projectId: string | null, interval = 10000) {
  const [stats, setStats] = useState<ProjectStats | null>(null)

  useEffect(() => {
    if (!projectId) { setStats(null); return }

    let active = true
    const load = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/stats`)
        if (res.ok && active) setStats(await res.json())
      } catch { /* ignore */ }
    }
    load()
    const id = setInterval(load, interval)
    return () => { active = false; clearInterval(id) }
  }, [projectId, interval])

  return stats
}
