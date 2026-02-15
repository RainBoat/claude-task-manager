import { useEffect, useState } from 'react'
import { fetchWorkers } from '../api'
import type { Worker } from '../types'

export function useWorkers(intervalMs = 5000) {
  const [workers, setWorkers] = useState<Worker[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        setWorkers(await fetchWorkers())
      } catch { /* ignore */ }
    }
    load()
    const id = setInterval(load, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return workers
}
