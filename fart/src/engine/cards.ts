import type { Rng } from './rng';
import { shuffle } from './rng';

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

/** Numeric ranks so ordering is a plain comparison: 11 = J, 12 = Q, 13 = K, 14 = A. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const JOKER_COUNT = 4;
export const DECK_SIZE = SUITS.length * RANKS.length + JOKER_COUNT; // 56

export type Card =
  | { id: string; rank: Rank; suit: Suit }
  | { id: string; rank: 'joker'; suit: null };

export function isJoker(card: Card): card is Extract<Card, { rank: 'joker' }> {
  return card.rank === 'joker';
}

export function isRank(value: unknown): value is Rank {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 14;
}

const RANK_LABELS: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
const SUIT_SYMBOLS: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

export function rankLabel(rank: Rank): string {
  return RANK_LABELS[rank];
}

export function cardLabel(card: Card): string {
  return isJoker(card) ? '🃏' : `${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

/**
 * Builds and shuffles the 56-card deck. Ids are assigned after shuffling
 * (`c00`..`c55`), so an id never encodes a card's value: a client that only
 * ever sees ids of cards it is allowed to see learns nothing about the rest.
 */
export function createShuffledDeck(rng: Rng): Card[] {
  const faces: Array<Omit<Card, 'id'>> = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) faces.push({ rank, suit });
  }
  for (let i = 0; i < JOKER_COUNT; i++) faces.push({ rank: 'joker', suit: null });
  return shuffle(faces, rng).map(
    (face, i) => ({ ...face, id: `c${String(i).padStart(2, '0')}` }) as Card,
  );
}
