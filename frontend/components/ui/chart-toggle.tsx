export default function ChartToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`chart-toggle rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? 'border-lane-700 bg-lane-800 text-white shadow-sm'
          : 'border-lane-300 bg-white/70 text-lane-700 hover:bg-lane-50'
      }`}
    >
      {label}
    </button>
  );
}
