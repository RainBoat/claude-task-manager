import { useState } from 'react'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  lang: Lang
  onSubmit: (name: string, repoUrl: string, branch: string) => Promise<void>
  onClose: () => void
}

export default function AddProjectModal({ lang, onSubmit, onClose }: Props) {
  const [name, setName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim() || !repoUrl.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(name.trim(), repoUrl.trim(), branch.trim() || 'main')
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  // Auto-fill name from URL
  const handleUrlChange = (url: string) => {
    setRepoUrl(url)
    if (!name.trim()) {
      const match = url.match(/\/([^/]+?)(?:\.git)?$/)
      if (match) setName(match[1])
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">{t('project.add_title', lang)}</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('project.repo_url', lang)}
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={e => handleUrlChange(e.target.value)}
              placeholder={t('project.url_placeholder', lang)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('project.name', lang)}
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('project.name_placeholder', lang)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('project.branch', lang)}
            </label>
            <input
              type="text"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {t('project.cancel', lang)}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !repoUrl.trim() || submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {submitting ? '...' : t('project.confirm', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
