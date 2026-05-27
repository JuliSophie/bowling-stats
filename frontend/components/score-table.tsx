import { getFrameType } from '@/lib/frame-utils';
import type { FrameData, GameRead } from '@/types';

export default function ScoreTable({ game }: { game: GameRead }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-left font-semibold text-lane-800">Name</th>
            {Array.from({ length: 10 }, (_, i) => (
              <th key={i} className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-center font-semibold text-lane-800">{i + 1}</th>
            ))}
            <th className="border border-lane-200 bg-lane-50 px-2 py-1.5 text-center font-semibold text-lane-800">Ges.</th>
          </tr>
        </thead>
        <tbody>
          {game.scores.map((score) => {
            const frames = score.frames as FrameData[];
            return (
              <tr key={score.player_name}>
                <td className="border border-lane-200 px-2 py-1 font-medium text-lane-900 whitespace-nowrap">{score.player_name}</td>
                {Array.from({ length: 10 }, (_, fIdx) => {
                  const frame = frames[fIdx];
                  if (!frame) return <td key={fIdx} className="border border-lane-200" />;
                  const ft = getFrameType(frame);
                  const bgClass = ft === 'strike' ? 'bg-amber-200/60' : ft === 'spare' ? 'bg-slate-200/60' : '';
                  return (
                    <td key={fIdx} className={`border border-lane-200 px-0 py-0 ${bgClass}`}>
                      <div className="flex border-b border-lane-100">
                        <span className="w-1/2 border-r border-lane-100 px-1 py-0.5 text-center">{frame.throw1}</span>
                        <span className="w-1/2 px-1 py-0.5 text-center">{frame.throw2}</span>
                        {fIdx === 9 && <span className="w-1/2 border-l border-lane-100 px-1 py-0.5 text-center">{frame.throw3}</span>}
                      </div>
                      <div className="px-1 py-0.5 text-center text-lane-600">{frame.cumulative}</div>
                    </td>
                  );
                })}
                <td className="border border-lane-200 px-2 py-1 text-center font-semibold text-lane-900">{score.total_score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
