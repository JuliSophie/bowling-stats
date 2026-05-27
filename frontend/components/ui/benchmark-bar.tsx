import { benchmarkToneClass, type StatBenchmark } from '@/lib/trash-talk';

export default function BenchmarkBar({ benchmark }: { benchmark: StatBenchmark }) {
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-lane-200">
        <div className={`h-full rounded-full ${benchmarkToneClass(benchmark.tone)}`} style={{ width: `${benchmark.percent}%` }} />
      </div>
      <p className="mt-1 text-[0.68rem] font-semibold text-lane-500">
        {benchmark.label}{benchmark.detail ? ` · ${benchmark.detail}` : ''}
      </p>
    </div>
  );
}
