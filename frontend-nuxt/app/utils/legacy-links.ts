export function legacyLink(path: string, syntheticId?: number) {
  const origin = String(useRuntimeConfig().public.legacyOrigin || '')
  if (!origin || syntheticId) return null
  try {
    const url = new URL(origin)
    if (!/^https?:$/.test(url.protocol)) return null
    return `${url.origin}${url.pathname.replace(/\/$/, "")}${path}`
  } catch { return null }
}
import { useRuntimeConfig } from '#app'
