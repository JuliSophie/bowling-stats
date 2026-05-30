'use client';

import Card from '@/components/ui/card';
import BenchmarkBar from '@/components/ui/benchmark-bar';
import type { StatBenchmark } from '@/lib/trash-talk';

// StatCard / InsightCard are thin presets over the shared <Card>, kept for the
// many existing call sites. New code can use <Card> directly.

export function StatCard({ label, value, sub, info, benchmark, href }: {
  label: string;
  value: string | number;
  sub?: string;
  info?: string;
  benchmark?: StatBenchmark;
  href?: string;
}) {
  return (
    <Card title={label} header={value} subtext={sub} info={info} href={href} padding="sm">
      {benchmark && <BenchmarkBar benchmark={benchmark} />}
    </Card>
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
  return (
    <Card title={title} header={value} headerSize="xl" subtext={description} info={info} href={href} padding="md">
      {benchmark && <BenchmarkBar benchmark={benchmark} />}
    </Card>
  );
}
