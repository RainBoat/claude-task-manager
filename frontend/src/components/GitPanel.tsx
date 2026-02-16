import { useState, useRef, useCallback } from 'react'
import { X, ChevronRight, Loader2 } from 'lucide-react'
import type { GitCommit, GitFileChange } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { fetchCommitDetail } from '../api'

interface Props {
  commits: GitCommit[]
  lang: Lang
  projectId: string
  onClose: () => void
}

// ── Constants ──────────────────────────────────────────────

const ROW_H = 36
const LANE_W = 16
const NODE_R = 4
const LINE_W = 2
const BRANCH_COLORS = [
  '#818cf8', // indigo
  '#34d399', // emerald
  '#f472b6', // pink
  '#fbbf24', // amber
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#fb923c', // orange
  '#2dd4bf', // teal
]

// ── Graph topology types ───────────────────────────────────

interface Connection {
  fromLane: number
  toLane: number
  type: 'straight' | 'merge' | 'fork'
  color: string
}

interface GraphNode {
  lane: number
  color: string
  isMerge: boolean
  connections: Connection[]
}

// ── Lane assignment algorithm ──────────────────────────────

function buildGraph(commits: GitCommit[]): GraphNode[] {
  const nodes: GraphNode[] = []
  // activeLanes[i] = sha that "owns" lane i, or null if free
  const activeLanes: (string | null)[] = []
  // Map from sha → lane index (for parent lookups)
  const shaToLane = new Map<string, number>()
  // Map from sha → row index
  const shaToRow = new Map<string, number>()

  commits.forEach((c, idx) => {
    shaToRow.set(c.sha, idx)
  })

  for (let idx = 0; idx < commits.length; idx++) {
    const c = commits[idx]
    const isMerge = c.parents.length > 1
    const connections: Connection[] = []

    // 1. Find lane for this commit
    let myLane = activeLanes.indexOf(c.sha)
    if (myLane === -1) {
      // Not reserved — allocate a new lane (find first free slot)
      myLane = activeLanes.indexOf(null)
      if (myLane === -1) {
        myLane = activeLanes.length
        activeLanes.push(null)
      }
    }
    activeLanes[myLane] = null // free it, we'll reassign below
    shaToLane.set(c.sha, myLane)

    const color = BRANCH_COLORS[myLane % BRANCH_COLORS.length]

    // 2. Handle parents
    if (c.parents.length > 0) {
      const firstParent = c.parents[0]

      // First parent continues in the same lane
      if (!shaToLane.has(firstParent)) {
        // Reserve this lane for the first parent
        activeLanes[myLane] = firstParent
      }

      // Draw connection to first parent (straight or will be drawn by next row)
      const firstParentRow = shaToRow.get(firstParent)
      if (firstParentRow !== undefined && firstParentRow > idx) {
        connections.push({
          fromLane: myLane,
          toLane: myLane,
          type: 'straight',
          color,
        })
      }

      // Additional parents (merge sources)
      for (let p = 1; p < c.parents.length; p++) {
        const parentSha = c.parents[p]
        const parentLane = shaToLane.get(parentSha)
        if (parentLane !== undefined) {
          const pColor = BRANCH_COLORS[parentLane % BRANCH_COLORS.length]
          connections.push({
            fromLane: parentLane,
            toLane: myLane,
            type: 'merge',
            color: pColor,
          })
        } else {
          // Parent not yet seen — allocate a lane for it
          let newLane = activeLanes.indexOf(null)
          if (newLane === -1) {
            newLane = activeLanes.length
            activeLanes.push(null)
          }
          activeLanes[newLane] = parentSha
          const pColor = BRANCH_COLORS[newLane % BRANCH_COLORS.length]
          connections.push({
            fromLane: newLane,
            toLane: myLane,
            type: 'merge',
            color: pColor,
          })
        }
      }
    }

    // 3. Continuation lines: any active lane that passes through this row
    for (let l = 0; l < activeLanes.length; l++) {
      if (activeLanes[l] !== null && l !== myLane) {
        const lColor = BRANCH_COLORS[l % BRANCH_COLORS.length]
        connections.push({
          fromLane: l,
          toLane: l,
          type: 'straight',
          color: lColor,
        })
      }
    }

    // Also draw continuation for myLane if it has a parent below
    if (activeLanes[myLane] !== null) {
      connections.push({
        fromLane: myLane,
        toLane: myLane,
        type: 'straight',
        color,
      })
    }

    nodes.push({ lane: myLane, color, isMerge, connections })
  }

  // Trim unused lanes — find max lane used
  return nodes
}

// ── SVG Graph Cell ─────────────────────────────────────────

function GraphCell({ node, maxLanes, isFirst, isLast }: {
  node: GraphNode
  maxLanes: number
  isFirst: boolean
  isLast: boolean
}) {
  const w = maxLanes * LANE_W + LANE_W
  const h = ROW_H
  const cx = node.lane * LANE_W + LANE_W / 2 + LANE_W / 2
  const cy = h / 2

  return (
    <svg width={w} height={h} className="flex-shrink-0" style={{ minWidth: w }}>
      {/* Connection lines */}
      {node.connections.map((conn, i) => {
        const fromX = conn.fromLane * LANE_W + LANE_W / 2 + LANE_W / 2
        const toX = conn.toLane * LANE_W + LANE_W / 2 + LANE_W / 2

        if (conn.type === 'straight') {
          // Vertical pass-through line
          const topY = conn.fromLane === node.lane && isFirst ? cy : 0
          const botY = conn.fromLane === node.lane && isLast ? cy : h
          return (
            <line
              key={`s-${i}`}
              x1={fromX} y1={topY}
              x2={fromX} y2={botY}
              stroke={conn.color}
              strokeWidth={LINE_W}
              opacity={0.35}
            />
          )
        }

        if (conn.type === 'merge') {
          // Bezier curve from branch lane (top) to merge point (center)
          const startX = fromX
          const startY = 0
          const endX = toX
          const endY = cy
          const cp1y = h * 0.6
          const cp2y = h * 0.2
          return (
            <path
              key={`m-${i}`}
              d={`M ${startX} ${startY} C ${startX} ${cp1y}, ${endX} ${cp2y}, ${endX} ${endY}`}
              fill="none"
              stroke={conn.color}
              strokeWidth={LINE_W}
              opacity={0.35}
            />
          )
        }

        if (conn.type === 'fork') {
          const startX = fromX
          const startY = cy
          const endX = toX
          const endY = h
          const cp1y = h * 0.8
          const cp2y = h * 0.4
          return (
            <path
              key={`f-${i}`}
              d={`M ${startX} ${startY} C ${startX} ${cp1y}, ${endX} ${cp2y}, ${endX} ${endY}`}
              fill="none"
              stroke={conn.color}
              strokeWidth={LINE_W}
              opacity={0.35}
            />
          )
        }

        return null
      })}

      {/* Commit node */}
      {node.isMerge ? (
        <>
          <circle cx={cx} cy={cy} r={NODE_R + 1} fill="none" stroke={node.color} strokeWidth={1.5} opacity={0.5} />
          <circle cx={cx} cy={cy} r={NODE_R - 1} fill={node.color} />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={NODE_R} fill={node.color} />
      )}
    </svg>
  )
}

// ── File status icon ───────────────────────────────────────

function FileStatusIcon({ status }: { status: string }) {
  if (status === 'A') return <span className="text-[10px] font-bold text-green-400 w-4 text-center">+</span>
  if (status === 'D') return <span className="text-[10px] font-bold text-red-400 w-4 text-center">&minus;</span>
  if (status === 'R') return <span className="text-[10px] font-bold text-yellow-400 w-4 text-center">R</span>
  return <span className="text-[10px] font-bold text-blue-400 w-4 text-center">~</span>
}

// ── Stat bar (GitHub-style green/red) ──────────────────────

function StatBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions
  if (total === 0) return null
  const maxBlocks = 5
  const addBlocks = Math.round((additions / total) * maxBlocks) || (additions > 0 ? 1 : 0)
  const delBlocks = Math.round((deletions / total) * maxBlocks) || (deletions > 0 ? 1 : 0)

  return (
    <span className="inline-flex gap-px ml-2 items-center flex-shrink-0">
      <span className="text-[9px] text-green-400 mr-0.5">+{additions}</span>
      <span className="text-[9px] text-red-400 mr-1">-{deletions}</span>
      {Array.from({ length: addBlocks }).map((_, i) => (
        <span key={`a${i}`} className="w-1.5 h-1.5 rounded-sm bg-green-500" />
      ))}
      {Array.from({ length: delBlocks }).map((_, i) => (
        <span key={`d${i}`} className="w-1.5 h-1.5 rounded-sm bg-red-500" />
      ))}
    </span>
  )
}

// ── File change row ────────────────────────────────────────

function FileChangeRow({ file }: { file: GitFileChange }) {
  const parts = file.path.split('/')
  const fileName = parts.pop()!
  const dirPath = parts.length > 0 ? parts.join('/') + '/' : ''

  return (
    <div className="flex items-center gap-1.5 py-0.5 px-2 hover:bg-surface-light/30 rounded text-[11px]">
      <FileStatusIcon status={file.status} />
      <span className="truncate min-w-0 flex-1 font-mono">
        <span className="text-txt-muted">{dirPath}</span>
        <span className="text-txt">{fileName}</span>
      </span>
      <StatBar additions={file.additions} deletions={file.deletions} />
    </div>
  )
}

// ── Commit detail (expanded) ───────────────────────────────

function CommitDetail({ projectId, sha, lang }: { projectId: string; sha: string; lang: Lang }) {
  const [files, setFiles] = useState<GitFileChange[] | null>(null)
  const [loading, setLoading] = useState(true)
  const fetched = useRef(false)

  if (!fetched.current) {
    fetched.current = true
    fetchCommitDetail(projectId, sha)
      .then(data => setFiles(data.files))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 text-[11px] text-txt-muted">
        <Loader2 size={12} className="animate-spin" />
        {t('git.loading', lang)}
      </div>
    )
  }

  if (!files || files.length === 0) {
    return (
      <div className="py-2 px-3 text-[11px] text-txt-muted">
        {t('git.no_changes', lang)}
      </div>
    )
  }

  const totalAdd = files.reduce((s, f) => s + f.additions, 0)
  const totalDel = files.reduce((s, f) => s + f.deletions, 0)

  return (
    <div className="pb-1.5 pt-0.5">
      <div className="text-[10px] text-txt-muted px-3 pb-1">
        {t('git.files_changed', lang).replace('{n}', String(files.length))}
        <span className="ml-2 text-green-400">+{totalAdd}</span>
        <span className="ml-1 text-red-400">-{totalDel}</span>
      </div>
      <div className="space-y-px">
        {files.map(f => <FileChangeRow key={f.path} file={f} />)}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────

export default function GitPanel({ commits, lang, projectId, onClose }: Props) {
  const [expandedSha, setExpandedSha] = useState<string | null>(null)

  const graphNodes = buildGraph(commits)
  const maxLanes = graphNodes.reduce((max, n) => {
    const nodeLaneMax = n.connections.reduce((m, c) => Math.max(m, c.fromLane, c.toLane), n.lane)
    return Math.max(max, nodeLaneMax)
  }, 0) + 1

  const toggleExpand = useCallback((sha: string) => {
    setExpandedSha(prev => prev === sha ? null : sha)
  }, [])

  return (
    <div className="w-[340px] flex-shrink-0 bg-surface text-txt border-l border flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border flex-shrink-0">
        <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">{t('git.title', lang)}</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-txt-muted hover:text-txt hover:bg-surface-light transition-all duration-150"
        >
          <X size={15} />
        </button>
      </div>

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto">
        {commits.length === 0 && (
          <p className="px-4 py-8 text-xs text-txt-muted text-center">{t('git.no_commits', lang)}</p>
        )}
        {commits.map((c, i) => {
          const node = graphNodes[i]
          const isExpanded = expandedSha === c.sha
          const isFirst = i === 0
          const isLast = i === commits.length - 1

          return (
            <div key={c.sha}>
              {/* Commit row */}
              <div
                className="flex cursor-pointer hover:bg-surface-light/50 transition-all duration-100"
                style={{ minHeight: ROW_H }}
                onClick={() => toggleExpand(c.sha)}
              >
                {/* Graph column */}
                <GraphCell node={node} maxLanes={maxLanes} isFirst={isFirst} isLast={isLast && !isExpanded} />

                {/* Info column */}
                <div className="flex-1 py-1.5 pr-3 min-w-0 flex flex-col justify-center">
                  <div className="flex items-center gap-1.5">
                    <ChevronRight
                      size={10}
                      className={`flex-shrink-0 text-txt-muted transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <span className="text-[11px] text-txt truncate leading-snug">{c.message}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 pl-4">
                    <code className="text-[10px] text-accent font-mono flex-shrink-0">{c.short}</code>
                    <span className="text-[10px] text-txt-muted truncate">{c.author}</span>
                    <span className="text-[10px] text-txt-muted flex-shrink-0">{c.time_ago}</span>
                  </div>
                  {c.refs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 pl-4">
                      {c.refs.map(ref => {
                        const isHead = ref.includes('HEAD')
                        return (
                          <span
                            key={ref}
                            className="text-[9px] px-1.5 py-0.5 rounded-full font-mono"
                            style={{
                              backgroundColor: isHead ? 'var(--color-accent, #818cf8)' + '20' : node.color + '15',
                              color: isHead ? 'var(--color-accent, #818cf8)' : node.color,
                              border: `1px solid ${isHead ? 'var(--color-accent, #818cf8)' : node.color}30`,
                              ...(isHead ? { boxShadow: `0 0 6px ${node.color}25` } : {}),
                            }}
                          >
                            {ref}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-dashed border-surface-light ml-2 mr-2 mb-1">
                  <CommitDetail projectId={projectId} sha={c.sha} lang={lang} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
