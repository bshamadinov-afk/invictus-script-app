import type { Rank } from './cards';

/**
 * What happens to the table after a set of cards with a given effective rank
 * lands on the center pile. Every special card is one of these handlers, and a
 * Joker reuses whichever handler its declared rank maps to, so a Joker-as-10
 * burns exactly like a real 10.
 */
export interface Resolution {
  /** Rank the next card must match or beat; null means anything goes. */
  requiredRank: Rank | null;
  /** 'same' = the player who just played must play again (2, 10). */
  nextPlayer: 'same' | 'opponent';
  /** Remove the whole center pile from the game. */
  burn: boolean;
  /** Tag recorded in the event log so a UI can animate the effect. */
  effect: SpecialEffect;
}

export type SpecialEffect = 'none' | 'continue' | 'burn' | 'transfer';

export interface ResolutionContext {
  /** Effective rank shared by every card in the move. */
  playedRank: Rank;
  /** requiredRank as it was immediately before this move. */
  requiredRankBefore: Rank | null;
  /** How many cards were played together (1..4). */
  count: number;
}

export type SpecialHandler = (ctx: ResolutionContext) => Resolution;

/** Ordinary card: it becomes the rank to beat, and the turn passes. */
export const resolveNormal: SpecialHandler = ({ playedRank }) => ({
  requiredRank: playedRank,
  nextPlayer: 'opponent',
  burn: false,
  effect: 'none',
});

/** 2: breaks through anything; the same player must immediately play again, on a clean slate. */
export const resolveTwo: SpecialHandler = () => ({
  requiredRank: null,
  nextPlayer: 'same',
  burn: false,
  effect: 'continue',
});

/** 10: burns the center pile; the same player starts a fresh pile. */
export const resolveTen: SpecialHandler = () => ({
  requiredRank: null,
  nextPlayer: 'same',
  burn: true,
  effect: 'burn',
});

/**
 * 7: transfer. PROVISIONAL (handoff §4.3): the turn passes to the opponent and
 * the required rank stays whatever it was before the 7 (9 → 7 ⇒ opponent still
 * answers a 9). The product owner has not finalised this rule; change it here
 * (or pass a different handler in RulesConfig.specials) without touching the engine.
 */
export const resolveSevenTransfer: SpecialHandler = ({ requiredRankBefore }) => ({
  requiredRank: requiredRankBefore,
  nextPlayer: 'opponent',
  burn: false,
  effect: 'transfer',
});

export interface RulesConfig {
  /** Hand is refilled to this size from the draw deck after every play while the deck lasts. */
  handSize: number;
  /** Face-up and face-down cards dealt per player. */
  tableCards: number;
  /** Max equal-rank cards in a single move (four of a kind has no extra effect). */
  maxCardsPerMove: number;
  /** Ranks that may be played regardless of the current required rank. */
  alwaysPlayableRanks: readonly Rank[];
  /** Special-card handlers by effective rank. Ranks not listed use resolveNormal. */
  specials: Partial<Record<Rank, SpecialHandler>>;
  /** Whether Jokers may be combined with natural cards of their declared rank in one move. */
  allowJokersInSets: boolean;
}

export const DEFAULT_RULES: RulesConfig = {
  handSize: 3,
  tableCards: 3,
  maxCardsPerMove: 4,
  // 2 is explicit in the spec; 7 is implied by the 9 → 7 example; 10 is an
  // assumption (see docs/OPEN_QUESTIONS.md).
  alwaysPlayableRanks: [2, 7, 10],
  specials: { 2: resolveTwo, 7: resolveSevenTransfer, 10: resolveTen },
  allowJokersInSets: true,
};

export function resolutionFor(rules: RulesConfig, ctx: ResolutionContext): Resolution {
  const handler = rules.specials[ctx.playedRank] ?? resolveNormal;
  return handler(ctx);
}

/** Can a card (or set) of this effective rank go on the pile right now? */
export function isRankPlayable(
  rank: Rank,
  requiredRank: Rank | null,
  pendingContinuation: boolean,
  rules: RulesConfig,
): boolean {
  if (pendingContinuation || requiredRank === null) return true;
  if (rules.alwaysPlayableRanks.includes(rank)) return true;
  return rank >= requiredRank;
}
