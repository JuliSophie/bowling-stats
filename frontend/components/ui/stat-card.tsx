'use client';

import Link from 'next/link';
import InfoTip from '@/components/ui/info-tip';
import BenchmarkBar from '@/components/ui/benchmark-bar';
import type { StatBenchmark } from '@/lib/trash-talk';

export function StatCard({ label, value, sub, info, benchmark, href }: {
  label: string;
  value: string | number;
  sub?: string;
  info?: string;
  benchmark?: StatBenchmark;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-lane-600">{label}</p>
        {info && !href && <InfoTip text={info} />}
      </div>
      <p className="mt-1 text-lg font-bold text-lane-900">{value}</p>
      {sub && <p className="text-xs text-lane-500">{sub}</p>}
      {benchmark && <BenchmarkBar benchmark={benchmark} />}
    </>
  );

  if (href) {
    return (
      <div className="relative">
        <Link href={href} className="block rounded-lg border border-lane-200 bg-lane-50 p-3 pr-10 transition hover:-translate-y-0.5 hover:border-lane-300 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-lane-700/30">
          {content}
        </Link>
        {info && <span className="absolute right-3 top-3"><InfoTip text={info} /></span>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-lane-200 bg-lane-50 p-3">
      {content}
    </div>
  );
}

export function InsightCard({ title, value, description, info, benchmark, href }: {
  title: string;
  value: string;
  description: string;
  info: string;
  benchmark?: StatBenchmark;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-1.5">
        <p className="text-xs font-semibold text-lane-600">{title}</p>
        {!href && <InfoTip text={info} />}
      </div>
      <p className="mt-1 text-2xl font-black text-lane-900">{value}</p>
      <p className="mt-1 text-xs text-lane-500">{description}</p>
      {benchmark && <BenchmarkBar benchmark={benchmark} />}
    </>
  );

  if (href) {
    return (
      <div className="relative">
        <Link href={href} className="block rounded-lg border border-lane-200 bg-lane-50 p-3 pr-10 transition hover:-translate-y-0.5 hover:border-lane-300 hover:bg-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-lane-700/30">
          {content}
        </Link>
        <span className="absolute right-3 top-3"><InfoTip text={info} /></span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-lane-200 bg-lane-50 p-3">
      {content}
    </div>
  );
}
