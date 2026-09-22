import { getTrashTalkCatalog } from './trash-talk-v3';

export type LegacyBindings = Record<string, string | number | boolean | undefined>;

function render(text: string, bindings: LegacyBindings) {
  const placeholders = [...text.matchAll(/\{([A-Za-z][\w]*)\}/g)];
  const remainder = text.replace(/\{([A-Za-z][\w]*)\}/g, '');
  if (/[{}]/.test(remainder)) return null;
  if (placeholders.some((match) => !(match[1] in bindings))) return null;
  return text.replace(/\{([A-Za-z][\w]*)\}/g, (_, key: string) => {
    return String(bindings[key]);
  });
}

/** Project one active legacy pool from the authenticated shared catalog. */
export function legacyPool(id: string, bindings: LegacyBindings = {}): string[] {
  const scenario = getTrashTalkCatalog()?.scenarios.find((item) => item.id === id);
  if (!scenario || scenario.enabled === false || !Array.isArray(scenario.templates)) return [];
  return scenario.templates
    .map((text) => render(text, bindings))
    .filter((text): text is string => text !== null);
}

export function legacyFunction(id: string, parameters: readonly string[]) {
  return (...values: Array<string | number | boolean | undefined>) => {
    const result: LegacyBindings = Object.fromEntries(parameters.map((name, index) => [name, values[index]]));
    const delta = result.delta;
    const rank = result.rank;
    const games = result.games;
    const margin = result.margin;
    const pins = result.pins;
    if (typeof delta === 'number') result.deltaSign = delta >= 0 ? '+' : '';
    if (typeof rank === 'number') result.rankPlusOne = rank + 1;
    if (typeof games === 'number') result.gamesPlural = games !== 1 ? 'e' : '';
    if (typeof margin === 'number') result.marginPlural = margin !== 1 ? 's' : '';
    if (typeof pins === 'number') result.pinsPlural = pins !== 1 ? 's' : '';
    return legacyPool(id, result);
  };
}
