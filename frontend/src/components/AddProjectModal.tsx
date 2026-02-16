import { useState, useCallback, useEffect } from 'react'
import { X, Mic, FolderGit2, Globe, Plus } from 'lucide-react'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { fetchLocalRepos, type LocalRepo } from '../api'

interface Props {
  lang: Lang
  onSubmit: (name: string, repoUrl: string, branch: string, sourceType: 'git' | 'local' | 'new') => Promise<void>
  onClose: () => void
}

export default function AddProjectModal({ lang, onSubmit, onClose }: Props) {
  const [sourceType, setSourceType] = useState<'git' | 'local' | 'new'>('git')
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
    if (sourceType !== 'new' && !repoUrl.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(name.trim(), repoUrl.trim(), branch.trim() || 'main', sourceType)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const handleUrlChange = (url: string) => {
    setRepoUrl(url)
    if (!name.trim()) {
      const match = url.match(/\/([^/]+?)(?:\.git)?$/)
      if (match) setName(match[1])
    }
  }

  const handleSelectLocalRepo = (repo: LocalRepo) => {
    setRepoUrl(repo.path)
    if (!name.trim()) setName(repo.name)
    setBranch(repo.branch)
  }

  const canSubmit = name.trim() && (sourceType === 'new' || repoUrl.trim()) && !submitting

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface rounded-xl shadow-2xl w-full max-w-md mx-4 border animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border">
          <h2 className="text-sm font-semibold text-txt">{t('project.add_title', lang)}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-light text-txt-muted hover:text-txt transition-all duration-150">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Source type tabs */}
          <div className="flex rounded-lg bg-surface-light p-0.5 gap-0.5">
            <button
              onClick={() => { setSourceType('git'); setRepoUrl(''); setName(''); setBranch('main') }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                sourceType === 'git'
                  ? 'bg-surface shadow-sm text-txt'
                  : 'text-txt-muted hover:text-txt-secondary'
              }`}
            >
              <Globe size={13} />
              {lang === 'zh' ? 'Git 仓库' : 'Git Repo'}
            </button>
            <button
              onClick={() => { setSourceType('local'); setRepoUrl(''); setName(''); setBranch('main') }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                sourceType === 'local'
                  ? 'bg-surface shadow-sm text-txt'
                  : 'text-txt-muted hover:text-txt-secondary'
              }`}
            >
              <FolderGit2 size={13} />
              {lang === 'zh' ? '本地目录' : 'Local Dir'}
            </button>
            <button
              onClick={() => { setSourceType('new'); setRepoUrl(''); setName(''); setBranch('main') }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                sourceType === 'new'
                  ? 'bg-surface shadow-sm text-txt'
                  : 'text-txt-muted hover:text-txt-secondary'
              }`}
            >
              <Plus size={13} />
              {t('project.source_new', lang)}
            </button>
          </div>

          {sourceType === 'git' ? (
            <div>
              <label className="block text-[11px] font-medium text-txt-secondary mb-1">{t('project.repo_url', lang)}</label>
              <div className="relative">
                <input
                  type="text"
                  value={repoUrl}
                  onChange={e => handleUrlChange(e.target.value)}
                  placeholder={t('project.url_placeholder', lang)}
                  className="w-full px-3 py-2 pr-8 rounded-lg border bg-surface-deep text-sm text-txt outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 font-mono transition-all duration-150"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={startUrlVoice}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-all duration-150 ${urlListening ? 'text-red-400' : 'text-txt-muted hover:text-txt-secondary'}`}
                >
                  <Mic size={13} />
                </button>
              </div>
            </div>
          ) : sourceType === 'local' ? (
            <div>
              <label className="block text-[11px] font-medium text-txt-secondary mb-1">{lang === 'zh' ? '本地路径' : 'Local Path'}</label>
              <input
                type="text"
                value={repoUrl}
                onChange={e => { setRepoUrl(e.target.value); if (!name.trim()) { const m = e.target.value.match(/\/([^/]+)$/); if (m) setName(m[1]) } }}
                placeholder="/mnt/repos/my-project"
                className="w-full px-3 py-2 rounded-lg border bg-surface-deep text-sm text-txt outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 font-mono transition-all duration-150"
                autoFocus
              />
              {loadingRepos && (
                <p className="text-[11px] text-txt-muted mt-1.5">{lang === 'zh' ? '扫描中...' : 'Scanning...'}</p>
              )}
              {!loadingRepos && localRepos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {localRepos.map(repo => (
                    <button
                      key={repo.path}
                      onClick={() => handleSelectLocalRepo(repo)}
                      className={`text-[11px] px-2 py-1 rounded-md border font-mono transition-all duration-150 ${
                        repoUrl === repo.path
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'text-txt-secondary hover:border-accent/30 hover:text-accent'
                      }`}
                    >
                      {repo.name} <span className="opacity-50">({repo.branch})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div>
            <label className="block text-[11px] font-medium text-txt-secondary mb-1">{t('project.name', lang)}</label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('project.name_placeholder', lang)}
                className="w-full px-3 py-2 pr-8 rounded-lg border bg-surface-deep text-sm text-txt outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 font-mono transition-all duration-150"
              />
              <button
                type="button"
                onClick={startNameVoice}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-all duration-150 ${nameListening ? 'text-red-400' : 'text-txt-muted hover:text-txt-secondary'}`}
              >
                <Mic size={13} />
              </button>
            </div>
          </div>

          {sourceType !== 'new' && (
          <div>
            <label className="block text-[11px] font-medium text-txt-secondary mb-1">{t('project.branch', lang)}</label>
            <input
              type="text"
              value={branch}
              onChange={e => setBranch(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2 rounded-lg border bg-surface-deep text-sm text-txt outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 font-mono transition-all duration-150"
            />
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-txt-secondary hover:bg-surface-light transition-all duration-150"
          >
            {t('project.cancel', lang)}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all duration-150"
          >
            {submitting ? '...' : t('project.confirm', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
