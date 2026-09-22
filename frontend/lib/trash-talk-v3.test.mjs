import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildDayContext, buildGameContext, eligibleScenarios, indexGameFacts, isCompatibleCatalog, selectTrashTalkV3, setTrashTalkCatalog } from './trash-talk-v3.ts';

const catalog = JSON.parse(readFileSync(new URL('../../backend/app/data/trash-talk/catalog.json', import.meta.url), 'utf8'));
for (const scenario of catalog.scenarios) {
  scenario.templateIds ??= scenario.templates.map((text) =>
    'base:' + createHash('sha256').update(`${scenario.id}\0${text}`).digest('hex').slice(0, 24));
}
const row = (name, score) => ({ player_name: name, total_score: score, frames: [] });
const game = (id, date, score, others = [], time = null) => ({
  id, played_at: date, played_at_time: time, location: 'Synthetic', mode: '10-Pin',
  scores: [row('Anna', score), ...others.map(([name, value]) => row(name, value))],
});
const context = (games, id = 2) => buildGameContext(indexGameFacts(games), id, 'Anna');
const ids = (ctx) => eligibleScenarios(ctx).map((item) => item.id);
const only = (...names) => ({ ...catalog, scenarios: [
  ...catalog.scenarios.filter((item) => item.kind),
  ...catalog.scenarios.filter((item) => names.includes(item.id)),
] });
const evidence = (extra = {}) => ({ valid: true, counterfactuals: [], strike_count: 0, spare_count: 0, open_count: 10, clean: false, ...extra });
const whatIf = (original, hypothetical, frame = 9, single = true) => ({
  frame, original_score: original, hypothetical_score: hypothetical, gain: hypothetical - original,
  pins_added: 1, single_pin_attempt: single,
});

test('current PB distinguishes new unique, ties and later supersession', () => {
  const previous = game(1, '2026-01-01', 100), target = game(2, '2026-01-02', 180);
  assert.equal(selectTrashTalkV3(context([previous, target]), catalog).scenario, 'history.personal_best.unique');
  const tied = context([game(1, '2026-01-01', 180), target]);
  assert.equal(selectTrashTalkV3(tied, catalog).scenario, 'history.personal_best.tied');
  const superseded = context([previous, target, game(3, '2026-01-03', 190)]);
  const selected = selectTrashTalkV3(superseded, catalog);
  assert.equal(selected.scenario, 'history.personal_best.superseded');
  assert.equal(selected.bindings.personalBest, '190');
  assert.equal(selected.bindings.gap, '10');
});

test('current history updates an older personal day-best comparison', () => {
  const games = [game(1, '2026-01-01', 180), game(2, '2026-01-02', 240)];
  const selected = selectTrashTalkV3(context(games, 1), catalog);
  assert.equal(selected.scenario, 'day.best.below_personal_best');
  assert.equal(selected.bindings.gap, '60');
});

test('first, solo, tied and invalid histories do not invent competitive or record claims', () => {
  const single = context([game(2, '2026-01-02', 200)]);
  assert.ok(!ids(single).includes('milestone.first_200'));
  assert.ok(!ids(single).includes('result.personal_best.last'));
  assert.ok(!ids(single).includes('history.personal_best.unique'));
  assert.ok(!ids(single).includes('result.win.cheap'));
  const tied = context([game(2, '2026-01-02', 120, [['Ben', 120]])]);
  assert.ok(ids(tied).includes('result.tie'));
  assert.ok(!ids(tied).includes('result.win.cheap'));
  const invalid = context([game(1, '2026-01-01', NaN), game(2, '2026-01-02', 200)]);
  assert.ok(!ids(invalid).some((id) => id.startsWith('history.personal_best') || id === 'milestone.first_200'));
});

test('personal best plus strict last requires actual opponents and no tied last', () => {
  const previous = game(1, '2026-01-01', 100);
  const good = context([previous, game(2, '2026-01-02', 180, [['Ben', 190]])]);
  assert.ok(ids(good).includes('result.personal_best.last'));
  const tied = context([previous, game(2, '2026-01-02', 180, [['Ben', 180]])]);
  assert.ok(!ids(tied).includes('result.personal_best.last'));
});

test('first200 is chronological, survives later improvement and rejects ambiguous time', () => {
  const first = game(2, '2026-01-02', 200);
  const games = [game(1, '2026-01-01', 150), first, game(3, '2026-01-03', 210)];
  assert.ok(ids(context(games)).includes('milestone.first_200'));
  assert.ok(!ids(context(games, 3)).includes('milestone.first_200'));
  assert.ok(!ids(context([game(1, '2026-01-02', 150), first])).includes('milestone.first_200'));
  assert.ok(!ids(context([game(1, '2026-01-02', 150, [], '18:00'), game(2, '2026-01-02', 200, [], '18:00:00')])).includes('milestone.first_200'));
});

test('baseline excludes target, requires three other games, and gap uses correct units', () => {
  const games = [100, 120, 140, 180, 160].map((score, i) => game(i, `2026-01-0${i + 1}`, score));
  const ctx = context(games, 4);
  assert.equal(ctx.average, 135);
  const selected = selectTrashTalkV3(ctx, only('form.above'));
  assert.equal(selected.bindings.gap, '25');
  assert.ok(!ids(context(games.slice(0, 3), 2)).includes('form.above'));
});

test('day roster includes people absent from the target game, outsider games do not churn', () => {
  const target = game(2, '2026-01-02', 150);
  const sameDay = { ...game(3, '2026-01-02', 0), scores: [row('Ben', 160)] };
  const historical = { ...game(4, '2025-01-01', 0), scores: [row('Ben', 220)] };
  const selected = selectTrashTalkV3(context([target, sameDay, historical]), only('history.rival_gap'));
  assert.equal(selected.bindings.rival, 'Ben');
  assert.equal(selected.bindings.gap, '70');
  const outsider = { ...game(5, '2026-02-01', 0), scores: [row('Outsider', 300)] };
  assert.deepEqual(selected, selectTrashTalkV3(context([target, sameDay, historical, outsider]), only('history.rival_gap')));
});

test('roster best spans participants historical scores, not just that day', () => {
  const target = game(2, '2026-01-02', 180, [['Ben', 150]]);
  assert.ok(ids(context([target])).includes('history.roster_best'));
  const history = { ...game(3, '2025-01-01', 0), scores: [row('Ben', 250)] };
  assert.ok(!ids(context([target, history])).includes('history.roster_best'));
});

test('stable template choice ignores irrelevant changed personal average and catalog ordering', () => {
  const target = game(2, '2026-01-02', 180);
  const a = selectTrashTalkV3(context([target]), only('day.best'));
  const b = selectTrashTalkV3(context([target, game(3, '2026-02-01', 100)]), only('day.best'));
  assert.ok(a && b);
  assert.equal(a.text, b.text);
  assert.equal(a.contextFingerprint, b.contextFingerprint);
  const reversed = structuredClone(catalog);
  reversed.scenarios.reverse();
  reversed.scenarios.forEach((item) => { item.templates.reverse(); item.templateIds.reverse(); });
  assert.deepEqual(selectTrashTalkV3(context([target]), catalog), selectTrashTalkV3(context([target]), reversed));
});

test('counterfactual requires improved result, accepts8+1, and binds actual winning margin', () => {
  const target = game(2, '2026-01-02', 180, [['Ben', 190]]);
  target.scores[0].trash_talk_evidence = evidence({ counterfactuals: [whatIf(180, 188), whatIf(180, 191, 8, false)] });
  const selected = selectTrashTalkV3(context([target]), only('counterfactual.win'));
  assert.equal(selected.bindings.hypotheticalScore, '191');
  assert.equal(selected.bindings.gap, '1');
  assert.equal(selected.bindings.frame, '8');
  target.scores[0].trash_talk_evidence.counterfactuals = [whatIf(180, 188)];
  assert.equal(context([target]).scenarioFacts.counterfactual, undefined);
  target.scores = [target.scores[0]];
  assert.equal(context([target]).scenarioFacts.counterfactual, undefined);
});

test('counterfactual tie and genuine rank improvement are separate', () => {
  const target = game(2, '2026-01-02', 100, [['Ben', 110], ['Chris', 200]]);
  target.scores[0].trash_talk_evidence = evidence({ counterfactuals: [whatIf(100, 112)] });
  assert.equal(context([target]).scenarioFacts.counterfactual.outcome, 'improve');
  target.scores.pop();
  target.scores[0].trash_talk_evidence.counterfactuals = [whatIf(100, 110)];
  assert.equal(context([target]).scenarioFacts.counterfactual.outcome, 'tie');
});

test('invalid style evidence cannot produce frame claims; valid evidence supports style', () => {
  const target = game(2, '2026-01-02', 180);
  target.scores[0].frames = Array.from({ length: 6 }, () => ({ throw1: '8', throw2: '8' }));
  assert.ok(!ids(context([target])).includes('style.strikes_open'));
  target.scores[0].trash_talk_evidence = evidence({ strike_count: 3, spare_count: 4, open_count: 3 });
  assert.ok(ids(context([target])).includes('style.strikes_open'));
  target.scores[0].trash_talk_evidence.valid = false;
  assert.ok(!ids(context([target])).includes('style.strikes_open'));
});

test('validated opponent style supplies more-strikes-lower-score fact', () => {
  const target = game(2, '2026-01-02', 180, [['Ben', 190]]);
  target.scores[0].trash_talk_evidence = evidence({ strike_count: 4, open_count: 6 });
  target.scores[1].trash_talk_evidence = evidence({ strike_count: 3, open_count: 7 });
  const selected = selectTrashTalkV3(context([target]), only('style.more_strikes_lost'));
  assert.equal(selected.bindings.rival, 'Ben');
});

test('consistent day range, trajectory and weak finish are reachable with evidence', () => {
  const games = [170, 175, 180].map((score, i) => game(i, '2026-01-02', score, [], `${18 + i}:00`));
  const ctx = context(games);
  assert.ok(ids(ctx).includes('form.consistent'));
  assert.ok(ids(ctx).includes('form.improving'));
  assert.equal(selectTrashTalkV3(ctx, only('form.consistent')).bindings.range, '10');
  games[2].scores[0].trash_talk_evidence = evidence({ frame_points: [25,25,25,15,15,15,10,10,10,30] });
  assert.ok(ids(context(games)).includes('day.best.weak_finish'));
  games.forEach((item) => { item.played_at_time = null; });
  assert.ok(!ids(context(games)).includes('form.improving'));
});

test('day totals use30not10, allow negative signed differences and do not select game claims', () => {
  const games = [0,1,2].map((i) => game(i, '2026-01-02', 180, [['Ben', 170]]));
  const ctx = buildDayContext(indexGameFacts(games), '2026-01-02', 'Anna');
  const selected = selectTrashTalkV3(ctx, catalog);
  assert.equal(selected.scenario, 'day.total.lead');
  assert.equal(selected.bindings.gap, '30');
  const loser = buildDayContext(indexGameFacts(games), '2026-01-02', 'Ben');
  assert.equal(selectTrashTalkV3(loser, catalog).bindings.gap, '30');
  assert.equal(selectTrashTalkV3(loser, catalog).scenario, 'day.total.trail');
});

test('incompatible versions and malformed or empty placeholders cannot render', () => {
  const ctx = context([game(2, '2026-01-02', 180)]);
  const incompatible = { ...catalog, version: '99.0.0' };
  assert.equal(selectTrashTalkV3(ctx, incompatible), null);
  assert.throws(() => setTrashTalkCatalog(incompatible));
  for (const bad of ['Score {score}; {not-valid}', 'Score {score}; {unknown}', 'Score {{score}}']) {
    const modified = structuredClone(only('day.best'));
    Object.assign(modified.scenarios.find(item => item.id === 'day.best'), { templates: [bad], templateIds: ['bad'] });
    assert.equal(isCompatibleCatalog(modified), true);
    assert.equal(selectTrashTalkV3(ctx, modified), null);
  }
  for (const bad of ['', '    ', 'Text\nmit Zeilenumbruch']) {
    const modified = structuredClone(only('day.best'));
    Object.assign(modified.scenarios.find(item => item.id === 'day.best'), { templates: [bad], templateIds: ['bad'] });
    assert.equal(isCompatibleCatalog(modified), false);
    assert.equal(selectTrashTalkV3(ctx, modified), null);
  }
  const badEnabled = structuredClone(only('day.best'));
  badEnabled.scenarios.find(item => item.id === 'day.best').enabled = 'false';
  assert.equal(selectTrashTalkV3(ctx, badEnabled), null);
});

test('catalog guard accepts exhausted pools but requires the consolidated envelope', () => {
  const exhausted = structuredClone(catalog);
  exhausted.scenarios[0].templates = [];
  exhausted.scenarios[0].templateIds = [];
  assert.equal(isCompatibleCatalog(exhausted), true);
  setTrashTalkCatalog(exhausted);
  assert.equal(isCompatibleCatalog({ ...exhausted, version: '3.0.0' }), false);
  assert.equal(isCompatibleCatalog({ ...exhausted, version: '3.1.0', scenarios: [] }), false);
  delete exhausted.legacyV2;
  assert.equal(isCompatibleCatalog(exhausted), false);
});

test('heroic loss is selectable with the full catalog, not shadowed by historical rival', () => {
  const target = game(2, '2026-01-02', 210, [['Ben', 220]], '18:00');
  const later = game(3, '2026-01-02', 230, [], '19:00');
  const selected = selectTrashTalkV3(context([target, later]), catalog);
  assert.equal(selected.scenario, 'result.loss.heroic');
});

test('names with placeholders are inserted literally, never recursively evaluated', () => {
  const target = game(2, '2026-01-02', 180);
  target.scores[0].player_name = '{gap}';
  const ctx = buildGameContext(indexGameFacts([target]), 2, '{gap}');
  const modified = only('day.best');
  modified.scenarios = [
    ...modified.scenarios.filter((item) => item.kind),
    { ...modified.scenarios.find((item) => item.id === 'day.best'), templates: ['{player}: {score}'], templateIds: ['literal'] },
  ];
  assert.equal(selectTrashTalkV3(ctx, modified).text, '{gap}: 180');
});

test('duplicate game IDs and duplicate score identities cannot establish records', () => {
  const target = game(2, '2026-01-02', 180);
  assert.equal(context([target, { ...target, scores: [row('Anna', 190)] }]), null);
  target.scores.push(row('Anna', 100));
  assert.equal(context([target]), null);
});

test('every shipped non-live scenario has a reachable, renderable synthetic context', () => {
  const contexts = [];
  const add = (games, id = 2) => contexts.push(context(games, id));
  add([game(2, '2026-01-02', 250, [['Ben', 200]])]);
  add([game(1, '2026-01-01', 100), game(2, '2026-01-02', 180)]);
  add([game(1, '2026-01-01', 180), game(2, '2026-01-02', 180)]);
  add([game(1, '2026-01-01', 100), game(2, '2026-01-02', 180), game(3, '2026-01-03', 200)]);
  add([game(2, '2026-01-02', 180), game(3, '2026-01-03', 240)]);
  add([game(1, '2026-01-01', 100), game(2, '2026-01-02', 220, [['Ben', 230]])]);
  add([game(2, '2026-01-02', 120, [['Ben', 100]])]);
  add([game(2, '2026-01-02', 120, [['Ben', 120]])]);
  for (const target of [70, 180]) {
    add([game(0, '2026-01-01', 100), game(1, '2026-01-02', 120), game(3, '2026-01-03', 140), game(2, '2026-01-04', target)]);
  }
  const clean = game(2, '2026-01-02', 200);
  clean.scores[0].trash_talk_evidence = evidence({ strike_count: 5, spare_count: 5, open_count: 0 });
  add([clean]);
  const style = game(2, '2026-01-02', 180, [['Ben', 190]]);
  style.scores[0].trash_talk_evidence = evidence({ strike_count: 4, spare_count: 3, open_count: 3,
    frame_points: [25,25,25,15,15,15,10,10,10,30] });
  style.scores[1].trash_talk_evidence = evidence({ strike_count: 3, spare_count: 5, open_count: 2 });
  add([style]);
  for (const scores of [[170,175,180], [180,175,170]]) {
    add(scores.map((value, i) => game(i, '2026-01-02', value, [], `${18 + i}:00`)));
  }
  for (const [hypothetical, opponents] of [[111, [['Ben',110]]], [110, [['Ben',110]]], [112, [['Ben',110],['Chris',200]]]]) {
    const target = game(2, '2026-01-02', 100, opponents);
    target.scores[0].trash_talk_evidence = evidence({ counterfactuals: [whatIf(100, hypothetical)] });
    add([target]);
  }
  const daily = indexGameFacts([0,1,2].map((i) => game(i, '2026-01-02', 180, [['Ben',170]])));
  contexts.push(buildDayContext(daily, '2026-01-02', 'Anna'), buildDayContext(daily, '2026-01-02', 'Ben'));
  const gaps = [];
  for (const scenario of catalog.scenarios.filter((item) => !item.id.startsWith('live.') && !item.kind?.startsWith('legacy-'))) {
    const matching = contexts.filter((ctx) => ids(ctx).includes(scenario.id));
    if (!matching.length) gaps.push(scenario.id);
    for (const ctx of matching) {
      const result = selectTrashTalkV3(ctx, only(scenario.id));
      assert.ok(result, `Eligible scenario does not render: ${scenario.id}`);
      assert.ok(!/[{}]/.test(result.text), `Unresolved placeholder: ${scenario.id}`);
    }
  }
  assert.deepEqual(gaps, [], `Unreachable catalog scenarios: ${gaps.join(', ')}`);
});
