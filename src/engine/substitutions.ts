import type { Lineup, PlayerId, PositionId } from './types';

export interface Substitution {
  in: PlayerId;
  out: PlayerId;
  /** Position the incoming player will play. */
  positionId: PositionId | null;
}

export interface SubstitutionPlan {
  subs: Substitution[];
  /** Players who stay on the court; `from` differs from `to` when they switch positions. */
  stays: { playerId: PlayerId; from: PositionId | null; to: PositionId | null }[];
}

/**
 * Works out who comes in and who goes out between two lineups (REQUIREMENTS.md §9).
 * Each incoming player is paired with an outgoing player who was playing the
 * same position where possible, so "IN Maya → Guard · OUT Ava" reads naturally.
 */
export function substitutions(current: Lineup, next: Lineup): SubstitutionPlan {
  const currentIds = new Set(current.map((s) => s.playerId));
  const nextIds = new Set(next.map((s) => s.playerId));
  const incoming = next.filter((s) => !currentIds.has(s.playerId));
  const outgoing = current.filter((s) => !nextIds.has(s.playerId));

  const subs: Substitution[] = [];
  const unpairedIn = [...incoming];
  const unpairedOut = [...outgoing];
  for (const slot of incoming) {
    const match = unpairedOut.findIndex((o) => o.positionId !== null && o.positionId === slot.positionId);
    if (match === -1) continue;
    subs.push({ in: slot.playerId, out: unpairedOut[match]!.playerId, positionId: slot.positionId });
    unpairedOut.splice(match, 1);
    unpairedIn.splice(unpairedIn.indexOf(slot), 1);
  }
  unpairedIn.forEach((slot, i) => {
    subs.push({ in: slot.playerId, out: unpairedOut[i]!.playerId, positionId: slot.positionId });
  });
  // Keep the on-screen order stable: follow the order of the next lineup.
  const order = new Map(next.map((s, i) => [s.playerId, i]));
  subs.sort((a, b) => order.get(a.in)! - order.get(b.in)!);

  const stays = next
    .filter((s) => currentIds.has(s.playerId))
    .map((s) => ({
      playerId: s.playerId,
      from: current.find((c) => c.playerId === s.playerId)!.positionId,
      to: s.positionId,
    }));
  return { subs, stays };
}
