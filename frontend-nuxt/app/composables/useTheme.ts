import { onBeforeUnmount, onMounted } from 'vue'
import { useState } from '#app'

export function useTheme() {
  const theme = useState<'light' | 'dark'>('pilot-theme', () => 'light')
  let media: MediaQueryList | undefined
  let onSystemChange: ((event: MediaQueryListEvent) => void) | undefined
  const apply = () => { document.documentElement.dataset.theme = theme.value }
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    localStorage.setItem('bowling-theme', theme.value)
    apply()
  }
  onMounted(() => {
    const saved = localStorage.getItem('bowling-theme')
    media = matchMedia('(prefers-color-scheme: dark)')
    theme.value = saved === 'dark' || saved === 'light' ? saved : media.matches ? 'dark' : 'light'
    apply()
    onSystemChange = () => {
      if (!localStorage.getItem('bowling-theme')) {
        theme.value = media!.matches ? 'dark' : 'light'
        apply()
      }
    }
    media.addEventListener('change', onSystemChange)
  })
  onBeforeUnmount(() => { if (media && onSystemChange) media.removeEventListener('change', onSystemChange) })
  return { theme, toggle }
}
