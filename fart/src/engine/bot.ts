import { type Card, type Rank, RANKS, isJoker } from './cards';
import { type PlayOption, playOptions } from './engine';
import { DEFAULT_RULES, type RulesConfig, isRankPlayable, resolutionFor } from './rules';
import type { GameAction } from './types';
import type { PlayerView } from './view';

/**
 * Deliberately simple prototype bot. It only reads its own PlayerView, so it
 * cannot cheat. Strategy: dump the lowest ordinary rank (as many copies as it
 * has), keep 2/7/10 and Jokers for when nothing else fits, and play a forced
 * Joker as a 2 so it can shed another card.
 */
export function chooseBotAction(
  view: PlayerView,
  rng: () => number = Math.random,
  rules: RulesConfig = DEFAULT_RULES,
): GameAction {
  const player = view.me;
  const ctx = { requiredRank: view.requiredRank, pendingContinuation: view.pendingContinuation !== null };

  if (view.pendingReveal) {
    const playable = RANKS.filter((r) => isRankPlayable(r, ctx.requiredRank, ctx.pendingContinuation, rules));
    return { type: 'chooseJokerIdentity', player, rank: pickJokerRank(playable, rules) };
  }

  const zoneCards: Card[] | null = view.hand.length > 0 ? view.hand : view.faceUp.length > 0 ? view.faceUp : null;
  if (!zoneCards) {
    return { type: 'revealFaceDown', player, index: Math.floor(rng() * view.faceDownCount) };
  }

  const options = playOptions(zoneCards, ctx, rules);
  if (options.length === 0) return { type: 'takePile', player };

  const best = options.reduce((a, b) => (score(b, zoneCards, rules) > score(a, zoneCards, rules) ? b : a));
  return {
    type: 'playCards',
    player,
    cardIds: best.cardIds,
    ...(best.jokerAs !== undefined ? { jokerAs: best.jokerAs } : {}),
  };
}

function score(option: PlayOption, cards: readonly Card[], rules: RulesConfig): number {
  const jokers = option.cardIds.filter((id) => cards.find((c) => c.id === id && isJoker(c))).length;
  if (jokers > 0) {
    // Jokers are a last resort. When forced, play one as a 2: the bot keeps the turn and
    // sheds another card on a clean slate, instead of handing the move to the next player.
    return -1000 - jokers * 100 + (continues(option.effectiveRank, rules) ? 60 : 0);
  }
  const special = rules.specials[option.effectiveRank] !== undefined;
  // Lower rank is better, more cards is better, specials are saved.
  return -option.effectiveRank * 10 + option.cardIds.length * 3 - (special ? 200 : 0);
}

function continues(rank: Rank, rules: RulesConfig): boolean {
  return resolutionFor(rules, { playedRank: rank, requiredRankBefore: null, count: 1 }).nextPlayer === 'same';
}

function pickJokerRank(playable: Rank[], rules: RulesConfig): Rank {
  // A revealed face-down Joker is best played as a 2: the follow-up card can be anything,
  // so even the next blind face-down card is guaranteed to fit.
  return playable.find((r) => continues(r, rules)) ?? playable[0] ?? 2;
}
