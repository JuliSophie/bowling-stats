import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const scriptUrl = new URL('../../scripts/migrate-legacy-trash-talk.mjs', import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(scriptUrl)), '..');
const baseline = path.join(root, 'synthetic-baseline');
const catalogPath = path.join(root, 'backend', 'app', 'data', 'trash-talk', 'catalog.json');
const accessorPath = path.join(root, 'frontend', 'lib', 'trash-talk-texts.ts');
const generatedPath = path.join(root, 'backend', 'app', 'data', 'trash-talk', 'generated.json');
const script = fs.readFileSync(scriptUrl, 'utf8').replace(/^import .*;\r?\n/gm, '')
  .replaceAll('import.meta.url', 'scriptUrl');
const originalAccessor = "export const synthetic = { ordinary: ['Synthetischer Test.'] } as const;\n";
const metadata = { id: 'test', scenario: 'score', language: 'de', tone: 'dry', intensity: 1,
  weight: 1, cooldownGroup: 'test', conditions: { minScore: 100 } };

function initialFiles() {
  return new Map([
    [catalogPath, JSON.stringify({ version: '3.0.0', language: 'de', scenarios: [] })],
    [accessorPath, originalAccessor],
    [generatedPath, '{"version":"3.0.0","batches":[],"disabledIds":[]}\n'],
    [path.join(baseline, 'frontend', 'lib', 'trash-talk-texts.ts'), originalAccessor],
    [path.join(baseline, 'frontend', 'data', 'trash-talk', 'messages.de.json'),
      JSON.stringify([
        { ...metadata, mode: 'template', template: 'Synthetische Nachricht.' },
        { ...metadata, id: 'second', mode: 'template', template: 'Zweite Testnachricht.' },
      ])],
    [path.join(baseline, 'frontend', 'data', 'trash-talk', 'fragments.de.json'),
      JSON.stringify([{ ...metadata, openers: [''], cores: ['Synthetischer Kern.'], suffixes: [''] }])],
    [path.join(baseline, 'frontend', 'lib', 'live-commentary.ts'),
      "const fallback = { 'live.strike': ['Synthetischer Strike.'] };\n"],
  ]);
}

function run(files, write = true) {
  const writes = [];
  const fakeFs = {
    readFileSync(file) {
      if (!files.has(file)) throw new Error(`Unexpected read: ${file}`);
      return files.get(file);
    },
    existsSync: file => files.has(file),
    writeFileSync(file, content) { writes.push(file); files.set(file, content); },
  };
  let error;
  try {
    vm.runInNewContext(script, { fs: fakeFs, path, crypto, ts, fileURLToPath, scriptUrl: scriptUrl.href,
      process: { argv: ['node', 'migration', '--baseline', baseline, ...(write ? ['--write'] : [])], env: {} },
      console: { log() {} } });
  } catch (caught) { error = caught; }
  return { error, writes };
}

test('migration upgrades original sources, defaults to check-only and is byte-idempotent', () => {
  const files = initialFiles();
  const before = new Map(files);
  assert.deepEqual(run(files, false), { error: undefined, writes: [] });
  assert.deepEqual(files, before);
  assert.equal(run(files).error, undefined);
  assert.equal(JSON.parse(files.get(catalogPath)).version, '3.1.0');
  const migrated = new Map(files);
  assert.equal(run(files).error, undefined);
  assert.deepEqual(files, migrated);
  assert.equal(files.get(generatedPath), before.get(generatedPath));
});

test('migration refuses curated or partial state before either output is written', () => {
  const migrated = initialFiles();
  assert.equal(run(migrated).error, undefined);
  const mutations = {
    weight: catalog => { catalog.legacyV2.messages[0].weight = 99; },
    conditions: catalog => { catalog.legacyV2.messages[0].conditions.minScore = 999; },
    order: catalog => { catalog.scenarios.reverse(); },
    metadataOrder: catalog => { catalog.legacyV2.messages.reverse(); },
    template: catalog => { catalog.scenarios[0].templates[0] = 'Kuratiert.'; },
    missingMetadata: catalog => { delete catalog.legacyV2; },
    nullMetadata: catalog => { catalog.legacyV2 = null; },
    falseMetadata: catalog => { catalog.legacyV2 = false; },
    missingPools: catalog => { catalog.scenarios = []; },
    missingPool: catalog => { catalog.scenarios.pop(); },
    unsupportedProtocol: catalog => { catalog.version = '99.0.0'; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const files = new Map(migrated);
    const catalog = JSON.parse(files.get(catalogPath));
    mutate(catalog);
    files.set(catalogPath, JSON.stringify(catalog));
    const before = new Map(files);
    const result = run(files);
    assert.ok(result.error, name);
    assert.deepEqual(result.writes, [], name);
    assert.deepEqual(files, before, name);
  }
  for (const value of ['// edited adapter\n', undefined]) {
    const files = new Map(migrated);
    if (value === undefined) files.delete(accessorPath); else files.set(accessorPath, value);
    const before = new Map(files);
    assert.ok(run(files).error);
    assert.deepEqual(files, before);
  }
});
