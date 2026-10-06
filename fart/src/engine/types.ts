import type { Card, Rank } from './cards';
import type { ContinuationReason, SpecialEffect } from './rules';

export type { ContinuationReason };

/** Seat index, 0..playerCount-1, in turn order. */
export type PlayerId = number;
export type Zone = 'hand' | 'faceUp' | 'faceDown';

/** A card on the center pile together with the identity it was played as. */
export interface PlayedCard {
  card: Card;
  /** For a Joker this is the declared rank; for any other card it equals card.rank. */
  effectiveRank: Rank;
  player: PlayerId;
}

export interface PlayerState {
  id: PlayerId;
  hand: Card[];
  faceUp: Card[];
  faceDown: Card[];
}

export interface GameState {
  /** Plain JSON data only (rules live outside the state), so it can be cloned, stored and sent over the wire. */
  seed: number;
  /** 2–6 players, seated in turn order. */
  players: PlayerState[];
  drawDeck: Card[];
  /** Ordered bottom → top. */
  centerPile: PlayedCard[];
  burned: Card[];
  activePlayer: PlayerId;
  /** Effective rank to match or beat; tracked separately from the top card because of 7 and Joker. */
  requiredRank: Rank | null;
  /** Set when the active player must play again (after a 2 or four of a kind). */
  pendingContinuation: ContinuationReason | null;
  /** A face-down Joker that was revealed and is waiting for chooseJokerIdentity. */
  pendingReveal: Card | null;
  phase: 'playing' | 'finished';
  /** Players who got rid of all their cards, in the order they went out. */
  finishOrder: PlayerId[];
  /** First player out. */
  winner: PlayerId | null;
  /** The last player left holding cards once the game is over. */
  loser: PlayerId | null;
  /** Public event log. Contains nothing a spectator could not have seen. */
  moveHistory: GameEvent[];
  /** Number of accepted actions; doubles as a sequence number for online sync. */
  turn: number;
}

export type GameAction =
  | {
      type: 'playCards';
      player: PlayerId;
      cardIds: string[];
      /** Required when the move contains a Joker and no natural card fixes the rank. */
      jokerAs?: Rank;
    }
  | { type: 'takePile'; player: PlayerId }
  | { type: 'revealFaceDown'; player: PlayerId; index: number }
  | { type: 'chooseJokerIdentity'; player: PlayerId; rank: Rank };

export type GameEvent =
  | { type: 'cardsPlayed'; player: PlayerId; from: Zone; cards: PlayedCard[]; effect: SpecialEffect }
  | { type: 'pileBurned'; player: PlayerId; count: number }
  | { type: 'turnTransferred'; from: PlayerId; to: PlayerId; requiredRank: Rank | null }
  | { type: 'cardsDrawn'; player: PlayerId; count: number }
  | { type: 'pileTaken'; player: PlayerId; cards: Card[]; reason: 'noLegalMove' | 'blindFail' }
  | { type: 'faceDownRevealed'; player: PlayerId; card: Card; playable: boolean }
  | { type: 'playerFinished'; player: PlayerId; place: number }
  | { type: 'gameOver'; loser: PlayerId };

export type ErrorCode =
  | 'GAME_OVER'
  | 'NOT_YOUR_TURN'
  | 'AWAITING_JOKER_IDENTITY'
  | 'NO_PENDING_JOKER'
  | 'WRONG_ZONE'
  | 'INVALID_CARDS'
  | 'MIXED_RANKS'
  | 'TOO_MANY_CARDS'
  | 'JOKER_IDENTITY_REQUIRED'
  | 'ILLEGAL_RANK'
  | 'MUST_CONTINUE'
  | 'HAS_LEGAL_MOVE'
  | 'INVALID_INDEX';

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; code: ErrorCode; message: string };
