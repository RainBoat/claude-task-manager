import { useState, useCallback, useEffect } from 'react'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { fetchLocalRepos, type LocalRepo } from '../api'

interface Props {
  lang: Lang
  onSubmit: (name: string, repoUrl: string, branch: string, sourceType: 'git' | 'local') => Promise<void>
  onClose: () => void
}

export default function AddProjectModal({ lang, onSubmit, onClose }: Props) {
  const [sourceType, setSourceType] = useState<'git' | 'local'>('git')
  const [name, setName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('main')
  const [submitting, setSubmitting] = useState(false)
  const [localRepos, setLocalRepos] = useState<LocalRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)

  const handleNameVoice = useCallback((text: string) => {
    setName(prev => prev ? prev + ' ' + text : text)
  }, [])
  const { listening: nameListening, startListening: startNameVoice } = useVoiceInput(handleNameVoice)

  const handleUrlVoice = useCallback((text: string) => {
    handleUrlChange(text)
  }, [])
  const { listening: urlListening, startListening: startUrlVoice } = useVoiceInput(handleUrlVoice)

  // Load local repos when switching to local mode
  useEffect(() => {
    if (sourceType === 'local') {
      setLoadingRepos(true)
      fetchLocalRepos()
        .then(setLocalRepos)
        .catch(() => setLocalRepos([]))
        .finally(() => setLoadingRepos(false))
    }
  }, [sourceType])

  const handleSubmit = async () => {
    if (!name.trim()) return
    if (sourceType === 'git' && !repoUrl.trim()) return
    if (sourceType === 'local' && !repoUrl.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(name.trim(), repoUrl.trim(), branch.trim() || 'main', sourceType)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  // Auto-fill name from URL (git mode)
  const handleUrlChange = (url: string) => {
    setRepoUrl(url)
    if (!name.trim()) {
      const match = url.match(/\/([^/]+?)(?:\.git)?$/)
      if (match) setName(match[1])
    }
  }

  // Select a local repo from dropdown
  const handleSelectLocalRepo = (repo: LocalRepo) => {
    setRepoUrl(repo.path)
    if (!name.trim()) setName(repo.name)
    setBranch(repo.branch)
  }

  const canSubmit = name.trim() && repoUrl.trim() && !submitting

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4">{t('project.add_title', lang)}</h2>

        {/* Source type tabs */}
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5 mb-4">
          <button
            onClick={() => { setSourceType('git'); setRepoUrl(''); setName(''); setBranch('main') }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              sourceType === 'git'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {lang === 'zh' ? 'Git 仓库' : 'Git Repo'}
          </button>
          <button
            onClick={() => { setSourceType('local'); setRepoUrl(''); setName(''); setBranch('main') }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              sourceType === 'local'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {lang === 'zh' ? '本地目录' : 'Local Dir'}
          </button>
        </div>

        <div className="space-y-3">
          {sourceType === 'git' ? (
            /* Git mode */
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {t('project.repo_url', lang)}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={repoUrl}
                  onChange={e => handleUrlChange(e.target.value)}
                  placeholder={t('project.url_placeholder', lang)}
                  className="w-full px-3 py-2 pr-9 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={startUrlVoice}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors text-xs ${urlListening ? 'text-red-500' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Voice input"
                >🎤</button>
              </div>
            </div>
          ) : (
            /* Local mode */
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {lang === 'zh' ? '本地路径' : 'Local Path'}
              </label>
              <input
                type="text"
                value={repoUrl}
                onChange={e => { setRepoUrl(e.target.value); if (!name.trim()) { const m = e.target.value.match(/\/([^/]+)$/); if (m) setName(m[1]) } }}
                placeholder="/mnt/repos/my-project"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
              {/* Discovered local repos */}
              {loadingRepos && (
                <p className="text-xs text-gray-400 mt-1.5">{lang === 'zh' ? '扫描中...' : 'Scanning...'}</p>
              )}
              {!loadingRepos && localRepos.length > 0 && (
                <div className="mt-1.5">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">
                    {lang === 'zh' ? '可用目录:' : 'Available:'}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {localRepos.map(repo => (
                      <button
                        key={repo.path}
                        onClick={() => handleSelectLocalRepo(repo)}
                        className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                          repoUrl === repo.path
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                            : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                      >
                        {repo.name} <span className="opacity-50">({repo.branch})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!loadingRepos && localRepos.length === 0 && sourceType === 'local' && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">
                  {lang === 'zh' ? '未发现 /mnt/repos/ 下的 Git 目录，请手动输入路径' : 'No git repos found in /mnt/repos/. Enter path manually.'}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('project.name', lang)}
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('project.name_placeholder', lang)}
                className="w-full px-3 py-2 pr-9 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={startNameVoice}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors text-xs ${nameListening ? 'text-red-500' : 'text-gray-400 hover:text-gray-600'}`}
                title="Voice input"
              >🎤</button>
            </div>
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
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {submitting ? '...' : t('project.confirm', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
