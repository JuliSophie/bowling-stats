'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { StatsResponse } from '@/types';


type StatsDashboardProps = {
  data: StatsResponse | null;
  loading: boolean;
};


function buildTrendRows(data: StatsResponse | null) {
  if (!data) {
    return [] as Array<Record<string, number | string>>;
  }

  const rows = new Map<string, Record<string, number | string>>();

  data.score_trends.forEach((playerTrend) => {
    playerTrend.games.forEach((game) => {
      const label = new Date(game.played_at).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
      });
      const existing = rows.get(label) ?? { label };
      existing[playerTrend.player_name] = game.total_score;
      rows.set(label, existing);
    });
  });

  return Array.from(rows.values());
}


const linePalette = ['#8f5a2a', '#3a8876', '#ff8c69', '#315d8a', '#8e4d92'];


export default function StatsDashboard({ data, loading }: StatsDashboardProps) {
  const trendRows = buildTrendRows(data);

  return (
    <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="panel rounded-[2rem] p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-lane-500">Letzte 10 Spiele</p>
            <h2 className="mt-2 text-2xl font-semibold text-lane-800">Score-Entwicklung</h2>
          </div>
          {loading ? <span className="text-sm text-lane-500">Aktualisiere…</span> : null}
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <LineChart data={trendRows} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="rgba(111, 67, 30, 0.12)" strokeDasharray="4 4" />
              <XAxis dataKey="label" stroke="#6e431e" fontSize={12} />
              <YAxis domain={[0, 300]} stroke="#6e431e" fontSize={12} />
              <Tooltip />
              <Legend />
              {data?.score_trends.map((playerTrend, index) => (
                <Line
                  key={playerTrend.player_name}
                  type="monotone"
                  dataKey={playerTrend.player_name}
                  stroke={linePalette[index % linePalette.length]}
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel rounded-[2rem] p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-lane-500">Mitspieler</p>
        <h2 className="mt-2 text-2xl font-semibold text-lane-800">Durchschnittsscore</h2>
        <div className="mt-5 h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={data?.averages ?? []} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid stroke="rgba(111, 67, 30, 0.12)" horizontal={false} />
              <XAxis type="number" domain={[0, 300]} stroke="#6e431e" fontSize={12} />
              <YAxis dataKey="player_name" type="category" stroke="#6e431e" fontSize={12} width={90} />
              <Tooltip />
              <Bar dataKey="average_score" fill="#3a8876" radius={[0, 12, 12, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel rounded-[2rem] p-5 sm:p-6 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-lane-500">Spieler-Scores</p>
            <h2 className="mt-2 text-2xl font-semibold text-lane-800">Letzte Scores je Spieler</h2>
          </div>
          <div className="rounded-full bg-lane-100 px-4 py-2 text-sm text-lane-700">
            {data?.score_trends.length ?? 0} Spieler
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.score_trends ?? []).map((playerTrend) => (
            <article
              key={playerTrend.player_name}
              className="rounded-[1.5rem] border border-lane-200 bg-[rgba(255,255,255,0.72)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-lane-800">{playerTrend.player_name}</h3>
                <span className="text-sm text-lane-500">{playerTrend.games.length} Spiele</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {playerTrend.games.map((game) => (
                  <div
                    key={`${playerTrend.player_name}-${game.played_at}-${game.total_score}`}
                    className="rounded-2xl bg-lane-100 px-3 py-2 text-sm text-lane-800"
                    title={new Date(game.played_at).toLocaleDateString('de-DE')}
                  >
                    <span className="font-semibold">{game.total_score}</span>
                    <span className="ml-2 text-lane-500">
                      {new Date(game.played_at).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
                {!playerTrend.games.length ? (
                  <p className="text-sm text-lane-500">Noch keine Scores gespeichert.</p>
                ) : null}
              </div>
            </article>
          ))}
          {!data?.score_trends.length ? (
            <div className="rounded-[1.5rem] border border-lane-200 bg-[rgba(255,255,255,0.72)] p-4 text-sm text-lane-500 md:col-span-2 xl:col-span-3">
              Noch keine gespeicherten Spieler-Scores vorhanden.
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel rounded-[2rem] p-5 sm:p-6 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-lane-500">Hall of Fame</p>
            <h2 className="mt-2 text-2xl font-semibold text-lane-800">Top-Scores</h2>
          </div>
          <div className="rounded-full bg-lane-100 px-4 py-2 text-sm text-lane-700">
            {data?.hall_of_fame.length ?? 0} Einträge
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-lane-200 bg-[rgba(255,255,255,0.65)]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-lane-100/70 text-lane-700">
              <tr>
                <th className="px-4 py-3 font-medium">Spieler</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Datum</th>
                <th className="px-4 py-3 font-medium">Ort</th>
              </tr>
            </thead>
            <tbody>
              {(data?.hall_of_fame ?? []).map((entry) => (
                <tr key={`${entry.player_name}-${entry.played_at}-${entry.total_score}`} className="border-t border-lane-100 text-lane-800">
                  <td className="px-4 py-3">{entry.player_name}</td>
                  <td className="px-4 py-3 font-semibold">{entry.total_score}</td>
                  <td className="px-4 py-3">{new Date(entry.played_at).toLocaleDateString('de-DE')}</td>
                  <td className="px-4 py-3">{entry.location}</td>
                </tr>
              ))}
              {!data?.hall_of_fame.length ? (
                <tr>
                  <td className="px-4 py-5 text-lane-500" colSpan={4}>
                    Noch keine gespeicherten Spiele.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
