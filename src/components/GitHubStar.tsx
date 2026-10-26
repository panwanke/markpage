import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { useI18n } from '../i18n'

export const REPO_URL = 'https://github.com/panwanke/markpage'
const CACHE_KEY = 'markpage.github-stars.v1'
const CACHE_TTL = 6 * 60 * 60 * 1000

function readCachedStars(): number | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as { count?: unknown; at?: unknown }
    if (typeof cached.count !== 'number' || typeof cached.at !== 'number') return null
    if (Date.now() - cached.at > CACHE_TTL) return null
    return cached.count
  } catch {
    return null
  }
}

function formatStars(count: number) {
  if (count < 1000) return String(count)
  return `${(count / 1000).toFixed(count < 10000 ? 1 : 0)}k`
}

function GitHubMark() {
  return (
    <svg className="github-mark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.995 7.995 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
      />
    </svg>
  )
}

/**
 * 头部 GitHub 入口：链接到公开仓库，并顺带展示 star 数。
 * star 数只是装饰，取不到（离线、限流、未建仓）时静默降级，不阻塞任何交互。
 */
export default function GitHubStar() {
  const { t } = useI18n()
  const [stars, setStars] = useState<number | null>(readCachedStars)

  useEffect(() => {
    if (stars !== null) return
    const controller = new AbortController()
    fetch('https://api.github.com/repos/panwanke/markpage', {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { stargazers_count?: unknown } | null) => {
        const count = data?.stargazers_count
        if (typeof count !== 'number') return
        setStars(count)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ count, at: Date.now() }))
        } catch {
          // 隐私模式下写缓存会抛错，忽略即可。
        }
      })
      .catch(() => { /* 网络不可用：保持纯链接形态 */ })
    return () => controller.abort()
  }, [stars])

  return (
    <a
      className="github-star"
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      title={t('github.title')}
      aria-label={t('github.aria')}
    >
      <GitHubMark />
      <span className="github-star-label">{t('github.label')}</span>
      {stars !== null && <span className="github-star-count"><Star size={11} aria-hidden="true" />{formatStars(stars)}</span>}
    </a>
  )
}
