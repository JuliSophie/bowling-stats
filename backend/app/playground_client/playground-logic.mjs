export function remainingPins(session) {
  if (!session) return 0;
  const card = session.scoreboard?.players?.[session.currentPlayerIndex];
  const frame = card?.frames?.[session.currentFrame - 1];
  if (!frame) return 10;
  const throws = frame.throws || [];
  if (session.currentFrame < 10) {
    return session.currentThrow === 1 ? 10 : Math.max(0, 10 - (throws[0] ?? 0));
  }
  if (session.currentThrow === 1) return 10;
  if (session.currentThrow === 2) return throws[0] === 10 ? 10 : Math.max(0, 10 - (throws[0] ?? 0));
  if (throws[0] === 10) return throws[1] === 10 ? 10 : Math.max(0, 10 - (throws[1] ?? 0));
  return 10;
}

export function presetAllowed(session, stepCount) {
  if (!session || session.currentThrow !== 1 || remainingPins(session) !== 10) return false;
  return stepCount === 1 || (session.playerCount === 1 && session.currentFrame <= 9);
}

export function requestIsCurrent(requestGeneration, currentGeneration, requestOperation, currentOperation, requestSessionId, currentSessionId) {
  return requestGeneration === currentGeneration &&
    requestOperation === currentOperation &&
    requestSessionId === currentSessionId;
}
