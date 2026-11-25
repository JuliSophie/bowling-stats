import type { LiveCommentaryCatalog } from './live-commentary';

function hash(value: string) {
  let h = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    h ^= value.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rendezvous(seed: string, candidates: Array<{ id: string; text: string }>) {
  return candidates
    .map((candidate) => ({ ...candidate, score: hash(`${seed}|${candidate.id}`) }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

function render(template: string, bindings: Record<string, string>) {
  const placeholders = [...template.matchAll(/\{\{?\s*([a-zA-Z][\w]*)\s*\}?\}/g)].map((match) => match[1]);
  if (placeholders.some((name) => !(name in bindings))) return null;
  const unknown = template.replace(/\{\{?\s*[a-zA-Z][\w]*\s*\}?\}/g, '').match(/[{}]/);
  if (unknown) return null;
  return template.replace(/\{\{?\s*([a-zA-Z][\w]*)\s*\}?\}/g, (_, name: string) => bindings[name]);
}

export function selectTemplate(
  scenario: string,
  throwId: string,
  bindings: Record<string, string>,
  catalog?: LiveCommentaryCatalog,
  allowLegacyGeneric = false,
) {
  const entry = catalog?.scenarios?.find((item) => item.id === scenario);
  const legacyEntry = catalog?.scenarios?.find((item) =>
    item.kind === 'legacy-live' && item.legacyLiveScenario === scenario);
  const sourceEntry = entry ?? legacyEntry;
  if (scenario === 'live.throw' && sourceEntry?.kind === 'legacy-live' && !allowLegacyGeneric) return null;
  const source = sourceEntry
    ? (sourceEntry.enabled === false ? [] : sourceEntry.templates ?? [])
    : [];
  // Projected legacy pools keep their original rendezvous keys even after filtering.
  const ids = sourceEntry?.templateSelectionIds
    ?? (sourceEntry?.kind === 'legacy-live' ? [] : sourceEntry?.templateIds ?? []);
  const candidates = source.map((text, index) => ({ text: render(text, bindings), id: ids[index] ?? `${scenario}.${index + 1}` }))
    .filter((item): item is { text: string; id: string } => Boolean(item.text));
  return rendezvous(`${throwId}|${scenario}`, candidates)?.text ?? null;
}
