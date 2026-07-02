'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Navigation from '@/components/navigation';
import { BackButton } from '@/components/navigation-memory';
import { useGames } from '@/lib/use-games';
import { calculateGameExcitement, formatTensionIndex } from '@/lib/excitement';
import { buildGameReport } from '@/lib/game-report';
import { scoreBenchmark, playerScoreBenchmark, excitementTrash, comebackTrash, bigLeadTrash, closestMomentTrash, lateDramaTrash, decidingFrameTrash } from '@/lib/trash-talk';
import { derivePlayerSummaries } from '@/lib/player-stats';
import { formatPlayedAtTime, formatDateDE } from '@/lib/frame-utils';
import Card from '@/components/ui/card';
import SectionCard from '@/components/ui/section-card';
import CardGrid from '@/components/ui/card-grid';
import InfoTip from '@/components/ui/info-tip';
import GameChart from '@/components/game-chart';

// Spannungs-Index = ((Führungswechsel + 1) / (Endabstand + 1)) · (1 + Drama-Faktor).
// Levels mirror the thresholds in excitementTrash().
const EXCITEMENT_LEVELS = [
  { label: 'Einschläfernd', range: '< 0.5', icon: '😴', min: -Infinity, max: 0.5 },
  { label: 'Solide', range: '0.5–1.5', icon: '🙂', min: 0.5, max: 1.5 },
  { label: 'Packend', range: '1.5–3', icon: '🔥', min: 1.5, max: 3 },
  { label: 'Wahnsinn', range: '≥ 3', icon: '🤯', min: 3, max: Infinity },
];

export default function GameDetailPage() {
  const pathname = usePathname();
  const gameId = Number(decodeURIComponent(pathname.split('/').pop() ?? ''));
  const { games, loading } = useGames();

  if (loading) {
    return (
      <>
        <Navigation />
        <main className="app-main max-w-5xl">
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-6 text-sm text-lane-600">Lade Spiel...</div>
        </main>
      </>
    );
  }

  const game = games.find((g) => g.id === gameId);

  if (!game) {
    return (
      <>
        <Navigation />
        <main className="app-main max-w-5xl">
          <div className="rounded-[1.3rem] border border-lane-200 bg-white/80 p-6 text-center">
            <p className="text-sm text-lane-600">Spiel nicht gefunden.</p>
            <BackButton className="mt-4 inline-block back-button" />
          </div>
        </main>
      </>
    );
  }

  const excitement = calculateGameExcitement(game);
  const report = buildGameReport(game);
  const playerSummaries = derivePlayerSummaries(games);
  const maxScore = Math.max(...game.scores.map((s) => s.total_score));
  const playedTime = formatPlayedAtTime(game.played_at_time);

  // Position within that evening's session (sorted by capture time, then id).
  const eveningGames = games
    .filter((g) => g.played_at === game.played_at)
    .sort((a, b) => (a.played_at_time ?? '').localeCompare(b.played_at_time ?? '') || a.id - b.id);
  const eveningIndex = eveningGames.findIndex((g) => g.id === game.id);

  // Global chronological order so prev/next walks the evening, then rolls into the adjacent day.
  const orderedGames = [...games].sort((a, b) =>
    a.played_at.localeCompare(b.played_at)
    || (a.played_at_time ?? '').localeCompare(b.played_at_time ?? '')
    || a.id - b.id,
  );
  const orderedIndex = orderedGames.findIndex((g) => g.id === game.id);
  const prevGame = orderedIndex > 0 ? orderedGames[orderedIndex - 1] : null;
  const nextGame = orderedIndex >= 0 && orderedIndex < orderedGames.length - 1 ? orderedGames[orderedIndex + 1] : null;
  const lateDrama = excitement && report?.leaderAfterFrame9 && report.winner && report.leaderAfterFrame9 !== report.winner
    ? lateDramaTrash(report.leaderAfterFrame9, report.winner)
    : null;

  return (
    <>
      <Navigation />
      <main className="app-main max-w-5xl">
        <div className="flex items-center justify-between gap-2">
          <BackButton className="flex items-center gap-1.5 self-start back-button" />
          <div className="flex items-center gap-2">
            {prevGame ? (
              <Link href={`/stats/games/${prevGame.id}`} className="back-button" aria-label="Vorheriges Spiel">← Vorheriges</Link>
            ) : (
              <span className="back-button pointer-events-none opacity-40" aria-disabled="true">← Vorheriges</span>
            )}
            {nextGame ? (
              <Link href={`/stats/games/${nextGame.id}`} className="back-button" aria-label="Nächstes Spiel">Nächstes →</Link>
            ) : (
              <span className="back-button pointer-events-none opacity-40" aria-disabled="true">Nächstes →</span>
            )}
          </div>
        </div>

        <SectionCard>
          <div className="mb-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-lane-500">{game.location}</p>
            <h1 className="text-2xl font-bold text-lane-900 mt-1">Spiel {eveningIndex + 1} von {eveningGames.length}</h1>
            <p className="text-sm text-lane-600 mt-1">{formatDateDE(game.played_at)}{playedTime && ` · ${playedTime} Uhr`}</p>
          </div>

          <CardGrid cols={3} className="mt-4">
            {game.scores.map((score) => {
              const isWinner = score.total_score === maxScore;
              const summary = playerSummaries.find((p) => p.name === score.player_name);
              const benchmark = summary
                ? playerScoreBenchmark(score.total_score, summary.avgScore, isWinner ? 'winningPeak' : 'peak', score.player_name)
                : scoreBenchmark(score.total_score, score.player_name);
              return (
                <Link key={score.player_name} href={`/stats/players/${encodeURIComponent(score.player_name)}`} className={`block rounded-lg border p-3 transition hover:-translate-y-0.5 hover:shadow-md ${isWinner ? 'winner-card' : 'border-lane-200 bg-lane-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-bold ${isWinner ? '' : 'text-lane-900'}`}>{isWinner ? '👑 ' : ''}{score.player_name}</span>
                    <span className={`text-lg font-black ${isWinner ? '' : 'text-lane-900'}`}>{score.total_score}</span>
                  </div>
                  {summary && <p className={`mt-1 text-xs ${isWinner ? 'opacity-70' : 'text-lane-500'}`}>Ø {summary.avgScore} · {summary.gamesPlayed} Spiele</p>}
                  <div className="mt-2">
                    <div className={`h-1.5 overflow-hidden rounded-full ${isWinner ? 'bg-amber-900/20' : 'bg-lane-200'}`}>
                      <div className={`h-full rounded-full ${isWinner ? 'bg-amber-800/60' : benchmark.tone === 'good' ? 'bg-emerald-500' : benchmark.tone === 'okay' ? 'bg-blue-500' : benchmark.tone === 'warn' ? 'bg-coral' : 'bg-lane-500'}`} style={{ width: `${benchmark.percent}%` }} />
                    </div>
                    <p className={`mt-1 text-[0.68rem] font-semibold ${isWinner ? 'opacity-70' : 'text-lane-500'}`}>
                      {benchmark.label}{benchmark.detail ? ` · ${benchmark.detail}` : ''}
                    </p>
                  </div>
                </Link>
              );
            })}
          </CardGrid>

          {excitement && (
            <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/70 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="flex items-center gap-1 text-xs text-orange-700">
                    Spannungs-Index
                    <InfoTip text="Misst, wie spannend das Spiel war. Formel: (Führungswechsel + 1) ÷ (Endabstand + 1) × (1 + Drama-Faktor). Heißt: ein knappes Ende, viele Führungswechsel und spätes Drama treiben den Wert hoch — ein früh entschiedenes Spiel drückt ihn runter." />
                  </p>
                  <p className="text-xl font-bold text-orange-900">🔥 {formatTensionIndex(excitement.tensionIndex)}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-orange-700">
                    Führungswechsel
                    <InfoTip text="Wie oft die Führung von Frame zu Frame zu einer anderen Person wechselte. Jeder Wechsel macht das Spiel spannender." />
                  </p>
                  <p className="text-lg font-semibold text-orange-900">{excitement.leadChanges}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-orange-700">
                    Abstand 9 → Ende
                    <InfoTip text="Punkteabstand zwischen Platz 1 und 2 nach dem 9. Frame und am Ende. Schrumpft er zum Schluss, war es ein enges Finish — und der Drama-Faktor steigt." />
                  </p>
                  <p className="text-lg font-semibold text-orange-900">{excitement.gapAfterFrame9} → {excitement.finalGap}</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-orange-700">
                    Drama-Faktor
                    <InfoTip text="Bonus für spätes Drama: zählt, um wie viel der Abstand auf den letzten Frames schrumpfte, plus einen festen Aufschlag, wenn die Führung erst im 10. Frame gekippt ist." />
                  </p>
                  <p className="text-lg font-semibold text-orange-900">{excitement.dramaFactor}</p>
                </div>
              </div>
              <p className="mt-3 text-xs font-semibold leading-relaxed text-orange-800">{excitementTrash(excitement.tensionIndex)}</p>
              {lateDrama && <p className="mt-1 text-xs font-semibold leading-relaxed text-orange-800">{lateDrama}</p>}

              <div className="mt-3 border-t border-orange-200/70 pt-3">
                <p className="text-xs font-semibold text-orange-800">Was den Index hochtreibt</p>
                <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-orange-700">
                  <li>🎯 <strong>Knappes Ende:</strong> je kleiner der Endabstand, desto höher — ein Foto-Finish zählt am meisten.</li>
                  <li>🔄 <strong>Führungswechsel:</strong> jeder Wechsel an der Spitze schraubt die Spannung nach oben.</li>
                  <li>⏱️ <strong>Spätes Drama:</strong> schrumpfender Abstand auf den Schluss-Frames und vor allem eine Führungsübernahme im 10. Frame geben Extra-Punkte.</li>
                </ul>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {EXCITEMENT_LEVELS.map((level) => {
                    const active = excitement.tensionIndex >= level.min && excitement.tensionIndex < level.max;
                    return (
                      <span
                        key={level.label}
                        className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${active ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700'}`}
                      >
                        {level.icon} {level.label} · {level.range}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        {report && (
          <SectionCard title="Match-Report" subtitle={report.story}>
            <CardGrid cols={4}>
              {report.biggestLead && (
                <Card
                  title="Größter Vorsprung"
                  header={`${report.biggestLead.margin} Pins`}
                  subtext={`${report.biggestLead.playerName}, Frame ${report.biggestLead.frame}`}
                  trashTalk={bigLeadTrash(report.biggestLead.margin, report.biggestLead.playerName)}
                />
              )}
              {report.closestMoment && (
                <Card
                  title="Knappster Moment"
                  header={`${report.closestMoment.margin} Pins`}
                  subtext={`nach Frame ${report.closestMoment.frame}`}
                  trashTalk={closestMomentTrash(report.closestMoment.margin, report.closestMoment.frame)}
                />
              )}
              {report.comeback && report.comeback.pins > 0 && (
                <Card
                  title="Comeback"
                  header={`${report.comeback.pins} Pins`}
                  subtext={`aufgeholt von ${report.comeback.playerName}`}
                  trashTalk={comebackTrash(report.comeback.pins)}
                />
              )}
              <Card
                title="Entscheidendes Frame"
                header={report.decidingFrame ? `Frame ${report.decidingFrame}` : '–'}
                subtext="Führung bis zum Ende gehalten"
                trashTalk={decidingFrameTrash(report.decidingFrame)}
              />
            </CardGrid>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
              <div className="rounded-xl border border-lane-100 bg-lane-50/50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-lane-800">Frame-10-Clutch</h3>
                <div className="grid gap-2">
                  {report.frame10Clutch.map((player, index) => (
                    <div key={player.playerName} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                      <span className="font-semibold text-lane-800">{index + 1}. {player.playerName}</span>
                      <span className="text-xs font-semibold text-lane-600">
                        {player.score ?? '–'} Pins im 10. · Gesamt {player.totalScore}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-lane-100 bg-lane-50/50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-lane-800">Spieler-Analyse</h3>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left text-lane-500">
                      <th className="px-2 py-1.5">Spieler</th>
                      <th className="px-2 py-1.5 text-center">X</th>
                      <th className="px-2 py-1.5 text-center">/</th>
                      <th className="px-2 py-1.5 text-center">Offen</th>
                      <th className="px-2 py-1.5 text-center">Clean %</th>
                      <th className="px-2 py-1.5 text-center">Bestes Frame</th>
                      <th className="px-2 py-1.5 text-center">Std.Abw.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.players.map((player) => (
                      <tr key={player.playerName} className="border-t border-lane-100 text-lane-800">
                        <td className="px-2 py-2 font-semibold whitespace-nowrap">{player.playerName}</td>
                        <td className="px-2 py-2 text-center">{player.strikes}</td>
                        <td className="px-2 py-2 text-center">{player.spares}</td>
                        <td className="px-2 py-2 text-center">{player.openFrames}</td>
                        <td className="px-2 py-2 text-center">{player.cleanFrameRate}%</td>
                        <td className="px-2 py-2 text-center">{player.bestFrame ? `${player.bestFrame.score} · F${player.bestFrame.frame}` : '–'}</td>
                        <td className="px-2 py-2 text-center">{player.consistency ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard padding="md" title="Spielverlauf">
          <GameChart game={game} allGames={games} />
        </SectionCard>
      </main>
    </>
  );
}
