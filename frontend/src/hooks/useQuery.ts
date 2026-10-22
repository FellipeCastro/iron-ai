import { useCallback, useEffect, useRef, useState } from 'react'

type Result<T> = { key: string; data?: T; error?: Error }

/** Busca dados ao montar (e quando `key` muda). `refetch` refaz sem piscar o carregamento. */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>) {
  const [result, setResult] = useState<Result<T> | null>(null)
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const run = useCallback((forKey: string) => {
    let cancelled = false
    fetcherRef.current().then(
      (data) => !cancelled && setResult({ key: forKey, data }),
      (error: Error) => !cancelled && setResult({ key: forKey, error }),
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (key === null) return
    return run(key)
  }, [key, run])

  const current = result && result.key === key ? result : null
  return {
    data: current?.data,
    error: current?.error,
    loading: key !== null && current === null,
    refetch: useCallback(() => key !== null && void run(key), [key, run]),
  }
}
