/** Tiny fetch helper with timeout, retries and an in-memory cache. */

const cache = new Map<string, { at: number; value: unknown }>()

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

interface RequestOptions {
  /** Cache TTL in ms. 0 disables caching. */
  ttl?: number
  retries?: number
  timeout?: number
  signal?: AbortSignal
}

function buildUrl(url: string, params?: Record<string, string | number | undefined>) {
  if (!params) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.append(key, String(value))
  }
  const query = search.toString()
  return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function getJson<T>(
  url: string,
  params?: Record<string, string | number | undefined>,
  options: RequestOptions = {},
): Promise<T> {
  const { ttl = 5 * 60_000, retries = 2, timeout = 20_000, signal } = options
  const finalUrl = buildUrl(url, params)

  if (ttl > 0) {
    const hit = cache.get(finalUrl)
    if (hit && Date.now() - hit.at < ttl) return hit.value as T
  }

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort)

    try {
      const response = await fetch(finalUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) throw new HttpError(`HTTP ${response.status} for ${finalUrl}`, response.status)
      const data = (await response.json()) as T
      if (ttl > 0) cache.set(finalUrl, { at: Date.now(), value: data })
      return data
    } catch (error) {
      lastError = error
      if (signal?.aborted) throw error
      const status = error instanceof HttpError ? error.status : 0
      if (status >= 400 && status < 500 && status !== 429) throw error
      if (attempt < retries) await sleep(320 * (attempt + 1))
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Network request failed')
}

export function clearHttpCache() {
  cache.clear()
}

/** Runs async tasks with a hard concurrency cap, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await task(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}
