import { useState, useRef, useCallback } from 'react'
import type { Task, TaskCreatePayload } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { useVoiceInput } from '../hooks/useVoiceInput'

interface Props {
  tasks: Task[]
  lang: Lang
  onSubmit: (payload: TaskCreatePayload) => Promise<void>
}

export default function TaskInput({ tasks, lang, onSubmit }: Props) {
  const [description, setDescription] = useState('')
  const [planMode, setPlanMode] = useState(false)
  const [dependsOn, setDependsOn] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleVoiceResult = useCallback((text: string) => {
    setDescription(prev => prev ? prev + ' ' + text : text)
  }, [])
  const { listening, startListening: handleVoice } = useVoiceInput(handleVoiceResult)

  const dependableTasks = tasks.filter(t =>
    ['pending', 'claimed', 'running', 'plan_pending', 'plan_approved', 'merging', 'testing'].includes(t.status)
  )

  const handleSubmit = useCallback(async () => {
    const trimDesc = description.trim()
    if (!trimDesc) return

    setSubmitting(true)
    try {
      await onSubmit({
        description: trimDesc,
        depends_on: dependsOn,
        plan_mode: planMode,
      })
      setDescription('')
      setDependsOn(null)
    } finally {
      setSubmitting(false)
    }
  }, [description, dependsOn, planMode, onSubmit])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6">
      <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('input.placeholder', lang)}
            rows={2}
            className="w-full bg-transparent text-sm placeholder-gray-400 dark:placeholder-gray-500 outline-none resize-none pr-24"
          />
          <div className="absolute right-0 bottom-0 flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleVoice}
              className={`p-1.5 rounded-lg transition-colors ${listening ? 'bg-red-100 dark:bg-red-900 text-red-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400'}`}
              title="Voice input"
            >
              🎤
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!description.trim() || submitting}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {submitting ? '...' : t('input.submit', lang)}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={planMode}
              onChange={e => setPlanMode(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>{t('input.plan_mode', lang)}</span>
          </label>

          <label className="flex items-center gap-1.5">
            <span>{t('input.depends_on', lang)}:</span>
            <select
              value={dependsOn ?? ''}
              onChange={e => setDependsOn(e.target.value || null)}
              className="bg-transparent border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-0.5 text-xs outline-none"
            >
              <option value="">{t('input.depends_none', lang)}</option>
              {dependableTasks.map(task => (
                <option key={task.id} value={task.id}>
                  [{task.id}] {task.title.slice(0, 30)}
                </option>
              ))}
            </select>
          </label>

          <span className="ml-auto hidden sm:inline">{t('input.hint', lang)}</span>
        </div>
      </div>
    </div>
  )
}
