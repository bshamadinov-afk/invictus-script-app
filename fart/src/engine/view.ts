import type { Card, Rank } from './cards';
import { opponentOf } from './engine';
import type { ContinuationReason, GameEvent, GameState, PlayedCard, PlayerId } from './types';

/**
 * Everything one player is allowed to know. This is what a client renders and,
 * online, the only thing the server ever sends it. Opponent hand values, every
 * face-down value and the draw deck order are reduced to counts.
 */
export interface PlayerView {
  me: PlayerId;
  hand: Card[];
  faceUp: Card[];
  faceDownCount: number;
  opponent: { handCount: number; faceUp: Card[]; faceDownCount: number };
  drawDeckCount: number;
  centerPile: PlayedCard[];
  burnedCount: number;
  activePlayer: PlayerId;
  requiredRank: Rank | null;
  pendingContinuation: ContinuationReason | null;
  /** A revealed face-down Joker is public: both players saw it flip. */
  pendingReveal: Card | null;
  phase: GameState['phase'];
  winner: PlayerId | null;
  moveHistory: GameEvent[];
  turn: number;
}

export function getPlayerView(state: GameState, me: PlayerId): PlayerView {
  const self = state.players[me];
  const opp = state.players[opponentOf(me)];
  const view: PlayerView = {
    me,
    hand: self.hand,
    faceUp: self.faceUp,
    faceDownCount: self.faceDown.length,
    opponent: { handCount: opp.hand.length, faceUp: opp.faceUp, faceDownCount: opp.faceDown.length },
    drawDeckCount: state.drawDeck.length,
    centerPile: state.centerPile,
    burnedCount: state.burned.length,
    activePlayer: state.activePlayer,
    requiredRank: state.requiredRank,
    pendingContinuation: state.pendingContinuation,
    pendingReveal: state.pendingReveal,
    phase: state.phase,
    winner: state.winner,
    moveHistory: state.moveHistory,
    turn: state.turn,
  };
  // Detach from the authoritative state so a client can never mutate it.
  return structuredClone(view);
}
