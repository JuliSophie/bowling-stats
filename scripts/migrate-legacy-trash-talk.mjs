/* Lossless, AST-only migration of the pre-v3 content banks.
 *
 * This is deliberately a migration tool, not runtime code.  It accepts only
 * the syntax used by the approved legacy files; an unfamiliar AST node is an
 * error rather than an opportunity to guess at content.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'frontend');
const catalogPath = path.join(root, 'backend', 'app', 'data', 'trash-talk', 'catalog.json');
const args = process.argv.slice(2);
const baselineArgument = args.indexOf('--baseline');
const baselineValue = baselineArgument >= 0 ? args[baselineArgument + 1] : process.env.LEGACY_BASELINE;
if (!baselineValue) throw new Error('Migration requires --baseline <captured-baseline> or LEGACY_BASELINE; no profile/session fallback is allowed.');
const baseline = path.resolve(baselineValue);
const write = args.includes('--write');

const read = (file) => fs.readFileSync(file, 'utf8');
const sourceFile = (file) => {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) throw new Error(`Cannot parse ${file}`);
  return source;
};
const fail = (node, message) => {
  throw new Error(`${message}: ${node.getText().slice(0, 120)}`);
};
const propName = (node) => node.name?.text ?? node.name?.getText();
const unwrap = (node) => {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return node;
};
const stringValue = (node) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  fail(node, 'Expected a cooked string literal');
};
const exprText = (node) => {
  if (ts.isIdentifier(node)) return `{${node.text}}`;
  if (ts.isNumericLiteral(node)) return node.text;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    if (ts.isIdentifier(node.left) && node.left.text === 'rank'
      && ts.isNumericLiteral(node.right) && node.right.text === '1') return '{rankPlusOne}';
    fail(node, 'Unknown binary formatter');
  }
  if (ts.isConditionalExpression(node)) {
    const condition = node.condition;
    const whenTrue = unwrap(node.whenTrue);
    const whenFalse = unwrap(node.whenFalse);
    if (ts.isBinaryExpression(condition) && ts.isIdentifier(condition.left)
      && ts.isNumericLiteral(condition.right) && ts.isStringLiteral(whenTrue)
      && ts.isStringLiteral(whenFalse)) {
      const name = condition.left.text;
      const operator = condition.operatorToken.kind;
      const number = condition.right.text;
      if (name === 'delta' && (operator === ts.SyntaxKind.GreaterThanEqualsToken || operator === ts.SyntaxKind.GreaterThanToken)
        && number === '0' && whenTrue.text === '+' && whenFalse.text === '') return '{deltaSign}';
      if (name === 'games' && operator === ts.SyntaxKind.ExclamationEqualsEqualsToken
        && number === '1' && whenTrue.text === 'e' && whenFalse.text === '') return '{gamesPlural}';
      if (name === 'margin' && operator === ts.SyntaxKind.ExclamationEqualsEqualsToken
        && number === '1' && whenTrue.text === 's' && whenFalse.text === '') return '{marginPlural}';
      if (name === 'pins' && operator === ts.SyntaxKind.ExclamationEqualsEqualsToken
        && number === '1' && whenTrue.text === 's' && whenFalse.text === '') return '{pinsPlural}';
    }
    fail(node, 'Unknown conditional formatter');
  }
  fail(node, 'Unknown interpolation expression');
};
const templateValue = (node) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (!ts.isTemplateExpression(node)) fail(node, 'Expected a string/template literal');
  let output = node.head.text;
  for (const span of node.templateSpans) {
    output += exprText(span.expression) + span.literal.text;
  }
  return output;
};
const arrayValue = (node) => {
  if (!ts.isArrayLiteralExpression(node)) fail(node, 'Expected an array');
  return node.elements.map((item) => {
    if (!ts.isExpression(item)) fail(item, 'Unknown array element');
    return templateValue(item);
  });
};
const exportedObjects = (file) => {
  const result = new Map();
  for (const statement of sourceFile(file).statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const exported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    const declaration = statement.declarationList.declarations[0];
    if (!ts.isIdentifier(declaration.name) || !ts.isAsExpression(declaration.initializer)) fail(statement, 'Unexpected export declaration');
    const object = declaration.initializer.expression;
    if (!ts.isObjectLiteralExpression(object)) fail(object, 'Expected exported object');
    result.set(declaration.name.text, object);
  }
  return result;
};
const poolsFromObject = (object) => [...object.properties].map((property) => {
  if (!ts.isPropertyAssignment(property) && !ts.isMethodDeclaration(property)) fail(property, 'Unknown object member');
  const name = propName(property);
  const value = unwrap(ts.isPropertyAssignment(property) ? property.initializer : property);
  if (ts.isArrowFunction(value)) {
    const body = unwrap(value.body);
    if (!ts.isArrayLiteralExpression(body)) fail(value.body, 'Expected arrow returning array');
    return {
      name,
      parameters: value.parameters.map((p) => p.name.getText()),
      parameterDeclarations: value.parameters.map((p) => `${p.name.getText()}: ${p.type?.getText() ?? 'unknown'}`),
      templates: arrayValue(body),
    };
  }
  return { name, parameters: [], parameterDeclarations: [], templates: arrayValue(value) };
});
const lower = (value) => value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
const sha = (poolId, index, text) => crypto.createHash('sha256').update(`${poolId}\0${index}\0${text}`).digest('hex').slice(0, 24);
const bindings = (templates) => [...new Set(templates.flatMap((text) => [...text.matchAll(/\{([A-Za-z][\w]*)\}/g)].map((m) => m[1])))];
const entry = (id, kind, templates, brief, extra = {}) => ({
  id, priority: 0, enabled: true, kind, bindings: bindings(templates), generationBrief: brief, templates,
  templateIds: templates.map((text, index) => sha(id, index, text)), ...extra,
});

const v1 = [];
const accessorGroups = [];
for (const [exportName, object] of exportedObjects(path.join(baseline, 'frontend', 'lib', 'trash-talk-texts.ts'))) {
  const group = [];
  for (const pool of poolsFromObject(object)) {
    const id = `legacy.v1.${lower(exportName)}.${lower(pool.name)}`;
    v1.push(entry(id, 'legacy-v1', pool.templates, `Synthetic legacy-v1 ${exportName}/${pool.name} metric commentary; component role is a complete legacy sentence. Allowed bindings: ${pool.parameters.join(', ') || 'none'}. No imported data.`, { legacyExport: exportName, legacyPool: pool.name, legacyParameters: pool.parameters }));
    group.push({ ...pool, id });
  }
  accessorGroups.push({ exportName, pools: group });
}

const messages = JSON.parse(read(path.join(baseline, 'frontend', 'data', 'trash-talk', 'messages.de.json')));
const fragments = JSON.parse(read(path.join(baseline, 'frontend', 'data', 'trash-talk', 'fragments.de.json')));
const legacyV2 = { messages: [], fragments: [] };
for (const message of messages) {
  const id = `legacy.v2.message.${lower(message.id)}`;
  const { template, ...metadata } = message;
  const item = { ...metadata, poolId: id };
  legacyV2.messages.push(item);
  v1.push(entry(id, 'legacy-v2-message', [template], `Synthetic legacy-v2 message metric ${message.scenario}; component role is one complete message. Allowed bindings are its original placeholders. No imported data.`, { legacyMetadata: metadata }));
}
for (const fragment of fragments) {
  const { openers, cores, suffixes, ...metadata } = fragment;
  const base = `legacy.v2.fragment.${lower(fragment.id)}`;
  const pools = {};
  for (const [role, values] of [['openers', openers], ['cores', cores], ['suffixes', suffixes]]) {
    const id = `${base}.${role}`;
    pools[role] = id;
    const kind = role === 'openers' ? 'legacy-v2-opener' : role === 'cores' ? 'legacy-v2-core' : 'legacy-v2-suffix';
    v1.push(entry(id, kind, values, `Synthetic legacy-v2 fragment metric ${fragment.scenario}; component role is ${role}. Allowed bindings are its original placeholders. No imported data.`, { legacyMetadata: metadata }));
  }
  legacyV2.fragments.push({ ...metadata, openersPoolId: pools.openers, coresPoolId: pools.cores, suffixesPoolId: pools.suffixes });
}

const liveSource = sourceFile(path.join(baseline, 'frontend', 'lib', 'live-commentary.ts'));
let fallback;
liveSource.forEachChild((statement) => {
  if (!ts.isVariableStatement(statement)) return;
  const declaration = statement.declarationList.declarations[0];
  if (declaration.name?.getText() === 'fallback') fallback = declaration.initializer;
});
if (!fallback || !ts.isObjectLiteralExpression(fallback)) throw new Error('Live fallback AST not found');
for (const property of fallback.properties) {
  if (!ts.isPropertyAssignment(property)) fail(property, 'Unknown live fallback member');
  const name = propName(property);
  const id = `legacy.live.${lower(name)}`;
  v1.push(entry(id, 'legacy-live', arrayValue(property.initializer), `Synthetic legacy-live ${name} event commentary; component role is a complete live fallback sentence. Allowed bindings are its original placeholders. No imported data.`, { legacyLiveScenario: name }));
}

const catalog = JSON.parse(read(catalogPath));
if (!['3.0.0', '3.1.0'].includes(catalog.version) || catalog.language !== 'de') {
  throw new Error('Unexpected base catalog version/language; migration accepts 3.0.0 or 3.1.0 input.');
}
const existingLegacy = catalog.scenarios.filter((scenario) => String(scenario.kind ?? '').startsWith('legacy-'));
const metadataPresent = Object.prototype.hasOwnProperty.call(catalog, 'legacyV2');
const metadataMatches = metadataPresent && JSON.stringify(catalog.legacyV2) === JSON.stringify(legacyV2);
const legacyMatches = JSON.stringify(existingLegacy) === JSON.stringify(v1);
const migratedCatalog = {
  ...catalog,
  version: '3.1.0',
  scenarios: catalog.scenarios.filter((scenario) => !String(scenario.kind ?? '').startsWith('legacy-')).concat(v1),
  legacyV2,
};
const accessor = [
  '// Content-free compatibility surface for the pre-v3 wrapper.',
  "import { legacyFunction, legacyPool } from './legacy-catalog';",
  '',
  "const pool = (id: string) => legacyPool(id);",
  "const fn = (id: string, parameters: readonly string[]) => legacyFunction(id, parameters);",
  '',
  ...accessorGroups.map(({ exportName, pools }) => {
    const members = pools.map(({ name, parameters, parameterDeclarations, id }) => parameters.length
      ? `  ${name}: (${parameterDeclarations.join(', ')}) => fn('${id}', ${JSON.stringify(parameters)})(${parameters.join(', ')}),`
      : `  get ${name}() { return pool('${id}'); },`).join('\n');
    return `export const ${exportName} = {\n${members}\n};`;
  }),
].join('\n');
const currentAccessorPath = path.join(frontend, 'lib', 'trash-talk-texts.ts');
const expectedAccessor = accessor;
const accessorPresent = fs.existsSync(currentAccessorPath);
const originalAccessor = read(path.join(baseline, 'frontend', 'lib', 'trash-talk-texts.ts'));
const accessorUnmigrated = accessorPresent && read(currentAccessorPath) === originalAccessor;
const migrationStarted = existingLegacy.length > 0 || metadataPresent || !accessorUnmigrated;
const migrationComplete = legacyMatches && metadataMatches && accessorPresent && read(currentAccessorPath) === `${expectedAccessor}\n`;
if (migrationStarted && !migrationComplete) {
  throw new Error('Partial legacy migration state detected (field presence is significant); refusing overwrite.');
}
if (write) {
  fs.writeFileSync(catalogPath, `${JSON.stringify(migratedCatalog, null, 2)}\n`, 'utf8');
  fs.writeFileSync(currentAccessorPath, `${accessor}\n`, 'utf8');
}
console.log(JSON.stringify({
  v1Pools: v1.filter((x) => x.kind === 'legacy-v1').length,
  v1Strings: v1.filter((x) => x.kind === 'legacy-v1').reduce((n, x) => n + x.templates.length, 0),
  v2Messages: messages.length,
  v2Fragments: fragments.length,
  v2Parts: fragments.reduce((n, x) => n + x.openers.length + x.cores.length + x.suffixes.length, 0),
  livePools: v1.filter((x) => x.kind === 'legacy-live').length,
  liveStrings: v1.filter((x) => x.kind === 'legacy-live').reduce((n, x) => n + x.templates.length, 0),
  mode: write ? 'write' : 'check',
}));
