import { expect } from 'vitest';
import type { Card, Rank, Suit } from '../src/engine/cards';
import { applyAction } from '../src/engine/engine';
import type { ActionResult, GameAction, GameState, PlayedCard, PlayerId } from '../src/engine/types';

let nextId = 0;
const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/** c(8) → an 8 of some suit; c('J') → a Joker. Every call gets a unique id. */
export function c(rank: Rank | 'J'): Card {
  const id = `t${nextId++}`;
  if (rank === 'J') return { id, rank: 'joker', suit: null };
  return { id, rank, suit: suits[nextId % 4]! };
}

export function pile(...ranks: Rank[]): PlayedCard[] {
  return ranks.map((r) => ({ card: c(r), effectiveRank: r, player: 1 as PlayerId }));
}

interface Setup {
  hand?: Card[];
  faceUp?: Card[];
  faceDown?: Card[];
  oppHand?: Card[];
  oppFaceUp?: Card[];
  oppFaceDown?: Card[];
  drawDeck?: Card[];
  centerPile?: PlayedCard[];
  requiredRank?: Rank | null;
  pendingContinuation?: GameState['pendingContinuation'];
  /** Extra seats after the two default players (for 3+ player tests). */
  extraPlayers?: Array<{ hand?: Card[]; faceUp?: Card[]; faceDown?: Card[] }>;
  finishOrder?: PlayerId[];
}

/** A hand-built mid-game state; player 0 to move. Defaults keep both players far from winning. */
export function makeState(s: Setup = {}): GameState {
  const centerPile = s.centerPile ?? [];
  return {
    seed: 0,
    players: [
      { id: 0, hand: s.hand ?? [], faceUp: s.faceUp ?? [c(5), c(5), c(5)], faceDown: s.faceDown ?? [c(6), c(6), c(6)] },
      {
        id: 1,
        hand: s.oppHand ?? [c(3), c(3), c(3)],
        faceUp: s.oppFaceUp ?? [c(4), c(4), c(4)],
        faceDown: s.oppFaceDown ?? [c(9), c(9), c(9)],
      },
      ...(s.extraPlayers ?? []).map((p, i) => ({
        id: i + 2,
        hand: p.hand ?? [c(3), c(3), c(3)],
        faceUp: p.faceUp ?? [c(4), c(4), c(4)],
        faceDown: p.faceDown ?? [c(9), c(9), c(9)],
      })),
    ],
    drawDeck: s.drawDeck ?? [],
    centerPile,
    burned: [],
    activePlayer: 0,
    requiredRank: s.requiredRank !== undefined ? s.requiredRank : (centerPile.at(-1)?.effectiveRank ?? null),
    pendingContinuation: s.pendingContinuation ?? null,
    pendingReveal: null,
    phase: 'playing',
    finishOrder: s.finishOrder ?? [],
    winner: s.finishOrder?.[0] ?? null,
    loser: null,
    moveHistory: [],
    turn: 0,
  };
}

export function ok(result: ActionResult): GameState {
  if (!result.ok) throw new Error(`Expected success, got ${result.code}: ${result.message}`);
  return result.state;
}

export function expectError(result: ActionResult, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.code).toBe(code);
}

export function play(state: GameState, cards: Card[], jokerAs?: Rank, player: PlayerId = state.activePlayer): ActionResult {
  const action: GameAction = {
    type: 'playCards',
    player,
    cardIds: cards.map((x) => x.id),
    ...(jokerAs !== undefined ? { jokerAs } : {}),
  };
  return applyAction(state, action);
}

export function ids(cards: readonly Card[]): string[] {
  return cards.map((x) => x.id).sort();
}
