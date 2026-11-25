export function usePilotState() {
  const expanded = useState<number | null>('expanded-game', () => null)
  const days = useState<Record<string, boolean>>('open-days', () => ({}))
  const previews = useState<Record<string, boolean>>('day-previews', () => ({}))
  return { expanded, days, previews }
}
import { useState } from '#app'
