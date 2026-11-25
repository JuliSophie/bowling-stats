import type { GameRead } from '../../../frontend/types'
import { calculateGameExcitement } from '../../../frontend/lib/excitement'
import { formatDateDE, formatPlayedAtTime, getFrameType } from '../../../frontend/lib/frame-utils'
import { addPersonalBestData, buildGameChartData } from '../../../frontend/lib/game-chart-data'

export type { GameRead }
export { calculateGameExcitement, formatDateDE, formatPlayedAtTime, getFrameType }
export { addPersonalBestData, buildGameChartData }

export function groupGames(games: GameRead[]) {
  const groups = new Map<string, GameRead[]>()
  for (const game of games) groups.set(game.played_at, [...(groups.get(game.played_at) || []), game])
  return [...groups].sort((a, b) => b[0].localeCompare(a[0])).map(([date, dayGames]) => ({
    date, games: dayGames.sort((a, b) => a.id - b.id)
  }))
}

export function dayPlayers(games: GameRead[]) {
  const totals = new Map<string, number>()
  games.forEach(g => g.scores.forEach(s => totals.set(s.player_name, (totals.get(s.player_name) || 0) + s.total_score)))
  return [...totals].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total }))
}

export function winnerNames(game: GameRead) {
  const max = Math.max(...game.scores.map(s => s.total_score), -Infinity)
  return game.scores.filter(s => s.total_score === max).map(s => s.player_name)
}
