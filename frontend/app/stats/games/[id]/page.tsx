'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Navigation from '@/components/navigation';
import { BackButton } from '@/components/navigation-memory';
import { fetchGames } from '@/lib/api';
import { calculateGameExcitement, formatTensionIndex } from '@/lib/excitement';
import { buildGameReport } from '@/lib/game-report';
import { scoreBenchmark, playerScoreBenchmark, excitementTrash, comebackTrash, bigLeadTrash, closestMomentTrash, lateDramaTrash } from '@/lib/trash-talk';
import { derivePlayerSummaries } from '@/lib/player-stats';
import type { GameRead } from '@/types';
import GameChart from '@/components/game-chart';

export default function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [games, setGames] = useState<GameRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameId, setGameId] = useState<number | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      setGameId(Number(id));
      fetchGames().then(setGames).finally(() => setLoading(false));
    });
  }, [params]);

  if (loading || gameId === null) {
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
  const lateDrama = excitement && report?.leaderAfterFrame9 && report.winner && report.leaderAfterFrame9 !== report.winner
    ? lateDramaTrash(report.leaderAfterFrame9, report.winner)
    : null;

  return (
    <>
      <Navigation />
      <main className="app-main max-w-5xl">
        <BackButton className="flex items-center gap-1.5 self-start back-button" />

        <div className="section-card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-lane-900">{game.location}</h1>
              <p className="text-sm text-lane-600 mt-1">{game.played_at}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {game.scores.map((score) => {
              const isWinner = score.total_score === maxScore;
              const summary = playerSummaries.find((p) => p.name === score.player_name);
              const benchmark = summary
                ? playerScoreBenchmark(score.total_score, summary.avgScore, isWinner ? 'winningPeak' : 'peak')
                : scoreBenchmark(score.total_score);
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
          </div>

          {excitement && (
            <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/70 p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-orange-700">Spannungs-Index</p>
                  <p className="text-xl font-bold text-orange-900">🔥 {formatTensionIndex(excitement.tensionIndex)}</p>
                </div>
                <div>
                  <p className="text-xs text-orange-700">Führungswechsel</p>
                  <p className="text-lg font-semibold text-orange-900">{excitement.leadChanges}</p>
                </div>
                <div>
                  <p className="text-xs text-orange-700">Abstand 9 → Ende</p>
                  <p className="text-lg font-semibold text-orange-900">{excitement.gapAfterFrame9} → {excitement.finalGap}</p>
                </div>
                <div>
                  <p className="text-xs text-orange-700">Drama-Faktor</p>
                  <p className="text-lg font-semibold text-orange-900">{excitement.dramaFactor}</p>
                </div>
              </div>
              <p className="mt-3 text-xs font-semibold leading-relaxed text-orange-800">{excitementTrash(excitement.tensionIndex)}</p>
              {lateDrama && <p className="mt-1 text-xs font-semibold leading-relaxed text-orange-800">{lateDrama}</p>}
            </div>
          )}
        </div>

        {report && (
          <div className="section-card p-5">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-lane-800">Match-Report</h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-lane-600">{report.story}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {report.biggestLead && (
                <div className="rounded-xl bg-lane-50 p-4">
                  <p className="text-xs text-lane-500">Größter Vorsprung</p>
                  <p className="text-lg font-semibold text-lane-900">{report.biggestLead.margin} Pins</p>
                  <p className="text-xs text-lane-500">{report.biggestLead.playerName}, Frame {report.biggestLead.frame}</p>
                  <p className="mt-2 text-[0.68rem] font-semibold leading-relaxed text-lane-600">{bigLeadTrash(report.biggestLead.margin, report.biggestLead.playerName)}</p>
                </div>
              )}
              {report.closestMoment && (
                <div className="rounded-xl bg-lane-50 p-4">
                  <p className="text-xs text-lane-500">Knappster Moment</p>
                  <p className="text-lg font-semibold text-lane-900">{report.closestMoment.margin} Pins</p>
                  <p className="text-xs text-lane-500">nach Frame {report.closestMoment.frame}</p>
                  <p className="mt-2 text-[0.68rem] font-semibold leading-relaxed text-lane-600">{closestMomentTrash(report.closestMoment.margin, report.closestMoment.frame)}</p>
                </div>
              )}
              {report.comeback && report.comeback.pins > 0 && (
                <div className="rounded-xl bg-lane-50 p-4">
                  <p className="text-xs text-lane-500">Comeback</p>
                  <p className="text-lg font-semibold text-lane-900">{report.comeback.pins} Pins</p>
                  <p className="text-xs text-lane-500">aufgeholt von {report.comeback.playerName}</p>
                  <p className="mt-2 text-[0.68rem] font-semibold leading-relaxed text-lane-600">{comebackTrash(report.comeback.pins)}</p>
                </div>
              )}
              <div className="rounded-xl bg-lane-50 p-4">
                <p className="text-xs text-lane-500">Entscheidendes Frame</p>
                <p className="text-lg font-semibold text-lane-900">{report.decidingFrame ? `Frame ${report.decidingFrame}` : '–'}</p>
                <p className="text-xs text-lane-500">Führung bis zum Ende gehalten</p>
              </div>
            </div>

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
                      <th className="px-2 py-1.5 text-center">Konstanz</th>
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
          </div>
        )}

        <div className="section-card p-4">
          <h2 className="mb-4 text-lg font-semibold text-lane-800">Spielverlauf</h2>
          <GameChart game={game} allGames={games} />
        </div>
      </main>
    </>
  );
}
