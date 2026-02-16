import { X } from 'lucide-react'
import type { GitCommit } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  commits: GitCommit[]
  lang: Lang
  onClose: () => void
}

const BRANCH_COLORS = [
  '#818cf8', // indigo (accent)
  '#34d399', // emerald
  '#f472b6', // pink
  '#fbbf24', // amber
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#fb923c', // orange
]

export default function GitPanel({ commits, lang, onClose }: Props) {
  const laneMap = new Map<string, number>()
  let nextLane = 0

  for (const c of commits) {
    const isMain = c.refs.some(r => r.includes('main') || r.includes('master') || r.includes('HEAD'))
    if (isMain && !laneMap.has(c.sha)) {
      laneMap.set(c.sha, 0)
      if (nextLane === 0) nextLane = 1
    }
  }

  for (const c of commits) {
    if (!laneMap.has(c.sha)) {
      let parentLane = -1
      for (const p of c.parents) {
        if (laneMap.has(p)) {
          parentLane = laneMap.get(p)!
          break
        }
      }
      if (parentLane >= 0) {
        const parentChildren = commits.filter(cc => cc.parents.includes(c.parents[0]))
        if (parentChildren.length > 1 && parentLane === 0) {
          laneMap.set(c.sha, nextLane++)
        } else {
          laneMap.set(c.sha, parentLane)
        }
      } else {
        laneMap.set(c.sha, nextLane++)
      }
    }
  }

  return (
    <div className="w-[340px] flex-shrink-0 bg-surface text-txt border-l border flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 h-12 border-b border flex-shrink-0">
        <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">{t('git.title', lang)}</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-txt-muted hover:text-txt hover:bg-surface-light transition-all duration-150"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {commits.length === 0 && (
          <p className="px-4 py-8 text-xs text-txt-muted text-center">{t('git.no_commits', lang)}</p>
        )}
        {commits.map((c, i) => {
          const lane = laneMap.get(c.sha) ?? 0
          const color = BRANCH_COLORS[lane % BRANCH_COLORS.length]
          const isLast = i === commits.length - 1

          return (
            <div key={c.sha} className="flex px-3 hover:bg-surface-light/50 transition-all duration-100">
              <div className="w-7 flex-shrink-0 flex flex-col items-center relative">
                {i > 0 && (
                  <div className="w-px flex-1" style={{ backgroundColor: color, opacity: 0.3 }} />
                )}
                <div
                  className="w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 z-10"
                  style={{ borderColor: color, backgroundColor: c.refs.length > 0 ? color : 'transparent' }}
                />
                {!isLast && (
                  <div className="w-px flex-1" style={{ backgroundColor: color, opacity: 0.3 }} />
                )}
              </div>

              <div className="flex-1 py-1.5 pl-1 min-w-0">
                <div className="flex items-start gap-2">
                  <code className="text-[10px] text-accent font-mono flex-shrink-0">{c.short}</code>
                  <span className="text-[11px] text-txt truncate leading-snug">{c.message}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-txt-muted font-mono">{c.author}</span>
                  <span className="text-[10px] text-txt-muted">{c.time_ago}</span>
                </div>
                {c.refs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.refs.map(ref => (
                      <span
                        key={ref}
                        className="text-[9px] px-1.5 py-0.5 rounded-md font-mono"
                        style={{
                          backgroundColor: color + '12',
                          color: color,
                          border: `1px solid ${color}25`,
                        }}
                      >
                        {ref}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
