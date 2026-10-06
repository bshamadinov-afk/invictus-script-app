import type { Card, Rank } from './cards';
import type { ContinuationReason, GameEvent, GameState, PlayedCard, PlayerId } from './types';

/** What a player can see of someone else: face-up cards, and counts for everything hidden. */
export interface OpponentView {
  id: PlayerId;
  handCount: number;
  faceUp: Card[];
  faceDownCount: number;
  /** 1-based finishing place once this player is out of cards, else null. */
  place: number | null;
}

/**
 * Everything one player is allowed to know. This is what a client renders and,
 * online, the only thing the server ever sends it. Opponent hand values, every
 * face-down value and the draw deck order are reduced to counts.
 */
export interface PlayerView {
  me: PlayerId;
  playerCount: number;
  hand: Card[];
  faceUp: Card[];
  faceDownCount: number;
  place: number | null;
  /** Everyone else, in seat order starting after `me`. */
  opponents: OpponentView[];
  drawDeckCount: number;
  centerPile: PlayedCard[];
  burnedCount: number;
  activePlayer: PlayerId;
  requiredRank: Rank | null;
  pendingContinuation: ContinuationReason | null;
  /** A revealed face-down Joker is public: everyone saw it flip. */
  pendingReveal: Card | null;
  phase: GameState['phase'];
  finishOrder: PlayerId[];
  winner: PlayerId | null;
  loser: PlayerId | null;
  moveHistory: GameEvent[];
  turn: number;
}

export function getPlayerView(state: GameState, me: PlayerId): PlayerView {
  const self = state.players[me];
  if (!self) throw new RangeError(`No player ${me}`);
  const n = state.players.length;
  const placeOf = (id: PlayerId) => {
    const i = state.finishOrder.indexOf(id);
    return i === -1 ? null : i + 1;
  };
  const opponents: OpponentView[] = [];
  for (let k = 1; k < n; k++) {
    const p = state.players[(me + k) % n]!;
    opponents.push({
      id: p.id,
      handCount: p.hand.length,
      faceUp: p.faceUp,
      faceDownCount: p.faceDown.length,
      place: placeOf(p.id),
    });
  }
  const view: PlayerView = {
    me,
    playerCount: n,
    hand: self.hand,
    faceUp: self.faceUp,
    faceDownCount: self.faceDown.length,
    place: placeOf(me),
    opponents,
    drawDeckCount: state.drawDeck.length,
    centerPile: state.centerPile,
    burnedCount: state.burned.length,
    activePlayer: state.activePlayer,
    requiredRank: state.requiredRank,
    pendingContinuation: state.pendingContinuation,
    pendingReveal: state.pendingReveal,
    phase: state.phase,
    finishOrder: state.finishOrder,
    winner: state.winner,
    loser: state.loser,
    moveHistory: state.moveHistory,
    turn: state.turn,
  };
  // Detach from the authoritative state so a client can never mutate it.
  return structuredClone(view);
}
