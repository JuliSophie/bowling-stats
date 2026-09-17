import { remainingPins, presetAllowed, requestIsCurrent } from './playground-logic.mjs';

const API = '/api';
let session = null, socket = null, busyOwner = null, generation = 0, operation = 0;
const $ = (id) => document.getElementById(id);
const log = (message) => { $('log').textContent = `${new Date().toLocaleTimeString()}  ${message}\n${$('log').textContent}`.slice(0, 6000); };
const state = () => session && `${session.currentPlayer || '–'} · Frame ${session.currentFrame}, Wurf ${session.currentThrow} · ${session.scoreboard?.throwCount ?? 0} Würfe · ${session.scoreboard?.isFinished ? 'Spiel beendet' : 'bereit'}`;
function remaining() { return remainingPins(session); }
function render() {
  $('state').textContent = state() || 'Noch keine Session.';
  $('reset').disabled = !session;
  $('open').disabled = !session;
  [...document.querySelectorAll('#counts button, #presets button')].forEach((button) => {
    button.disabled = !session || busyOwner !== null || session.scoreboard?.isFinished ||
      (button.dataset.count && Number(button.dataset.count) > remaining());
  });
}
function setSession(next) {
  generation += 1;
  operation += 1;
  socket?.close();
  busyOwner = null;
  session = next;
  if (session) connect(generation);
  render();
}
async function request(path, options = {}) {
  const response = await fetch(API + path, { credentials: 'include', headers: {'Content-Type':'application/json', ...(options.headers || {})}, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `HTTP ${response.status}`);
  return body;
}
async function refresh(sessionId, requestGeneration, requestOperation) {
  const next = await request(`/tracking/sessions/${sessionId}`);
  if (requestIsCurrent(requestGeneration, generation, requestOperation, operation, sessionId, session?.sessionId)) {
    session = next;
    render();
  }
  return next;
}
function turnSignature(value = session) {
  if (!value) return '';
  return JSON.stringify([
    value.sessionId, value.playerNames, value.currentPlayerIndex, value.currentPlayer,
    value.currentFrame, value.currentThrow, value.scoreboard?.throwCount, value.scoreboard?.isFinished,
  ]);
}
function connect(socketGeneration) {
  const sessionId = session.sessionId;
  socket = new WebSocket(`ws://${location.host}/api/tracking/sessions/${sessionId}/ws`);
  socket.onmessage = (event) => {
    if (socketGeneration !== generation || session?.sessionId !== sessionId) return;
    const value = JSON.parse(event.data);
    if (value.type === 'session_reset') { operation += 1; busyOwner = null; }
    if (value.payload?.session && (socketGeneration === generation)) session = value.payload.session;
    render(); log(value.type);
  };
  socket.onclose = () => { if (socketGeneration === generation) { operation += 1; busyOwner = null; render(); log('WebSocket getrennt – Session neu laden.'); } };
  socket.onerror = () => { if (socketGeneration === generation) { operation += 1; busyOwner = null; render(); log('WebSocket-Fehler'); } };
}
async function sendCount(count, requestGeneration, requestOperation) {
  if (!requestIsCurrent(requestGeneration, generation, requestOperation, operation, session?.sessionId, session?.sessionId) ||
      !session || session.scoreboard?.isFinished || count > remaining()) throw new Error('Wurf abgebrochen: Bahnzustand ist nicht mehr passend.');
  const sessionId = session.sessionId;
  const now = new Date().toISOString();
  const event = await request('/tracking/mock-throws', {method:'POST', body:JSON.stringify({
    sessionId, clientEventId:`playground-${now}-${crypto.randomUUID()}`, capturedAt:now,
    pinsKnockedDown:count, ballSpeedKmh:20 + count * 1.3, confidence:.98,
    path:[{distanceM:0,board:20},{distanceM:9,board:20.5},{distanceM:18.29,board:20}]
  })});
  if (!requestIsCurrent(requestGeneration, generation, requestOperation, operation, sessionId, session?.sessionId)) throw new Error('Veraltete Session-Antwort ignoriert.');
  log(`Wurf akzeptiert: ${event.payload?.pinsKnockedDown ?? count} Pins`);
  await refresh(sessionId, requestGeneration, requestOperation);
}
async function throwPins(count) {
  if (!session || busyOwner !== null || count > remaining()) return;
  const requestGeneration = generation, requestOperation = ++operation;
  const owner = Symbol('throw');
  busyOwner = owner; render();
  try { await sendCount(count, requestGeneration, requestOperation); }
  catch (error) { if (requestGeneration === generation) log(`Fehler: ${error.message}`); }
  finally { if (busyOwner === owner) busyOwner = null; render(); }
}
async function preset(label, counts) {
  if (!session || busyOwner !== null || !presetAllowed(session, counts.length)) {
    log(`${label}: Mehrfach-Presets nur für einen Spieler in einem neuen Frame; die Bahn muss voll sein.`); return;
  }
  const requestGeneration = generation, requestOperation = ++operation;
  const owner = Symbol('preset');
  busyOwner = owner; render();
  let expected = turnSignature();
  try {
    for (const count of counts) {
      if (turnSignature() !== expected) throw new Error('Preset abgebrochen: der autoritative Bahnzustand hat sich geändert.');
      await sendCount(count, requestGeneration, requestOperation);
      expected = turnSignature();
      if (counts.length > 1) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) { if (requestGeneration === generation) log(`${label}: ${error.message}`); }
  finally { if (busyOwner === owner) busyOwner = null; render(); }
}
for (let count=0; count<=10; count++) {
  const button=document.createElement('button'); button.textContent=count; button.dataset.count=count;
  button.title=`${count} Pins`; button.onclick=()=>throwPins(count); $('counts').append(button);
}
[['Strike',[10]],['Spare',[7,3]],['Double',[10,10]],['Turkey',[10,10,10]]].forEach(([label,counts]) => {
  const button=document.createElement('button'); button.textContent=label; button.className='secondary';
  button.onclick=()=>preset(label,counts); $('presets').append(button);
});
$('create').onclick = async () => {
  const requestGeneration = ++generation;
  operation += 1;
  busyOwner = null;
  socket?.close();
  try {
    const names = $('players').value.split(/\r?\n/).map((name)=>name.trim()).filter(Boolean);
    const created = await request('/tracking/sessions', {method:'POST', body:JSON.stringify({playerNames:names,location:$('location').value.trim() || 'Testbahn'})});
    if (requestGeneration !== generation) return;
    $('code').hidden=false; $('code').textContent=created.pairingToken; setSession(created);
    log(`Session ${created.sessionId} erstellt.`);
  } catch (error) { if (requestGeneration >= generation) log(`Fehler: ${error.message}`); }
};
$('open').onclick = () => window.open('http://127.0.0.1:4317/live', '_blank', 'noopener');
$('reset').onclick = async () => {
  if (!session) return;
  const old = session, resetGeneration = generation, resetOperation = ++operation;
  const owner = Symbol('reset');
  busyOwner = owner; render();
  try {
    const next = await request(`/tracking/sessions/${old.sessionId}/reset`, {method:'POST'});
    if (resetGeneration === generation && resetOperation === operation && busyOwner === owner && session?.sessionId === old.sessionId) {
      session = next; render(); log('Spiel zurückgesetzt.');
    }
  } catch(error) { if (resetGeneration === generation) log(`Fehler: ${error.message}`); }
  finally { if (busyOwner === owner) busyOwner = null; render(); }
};
render();
