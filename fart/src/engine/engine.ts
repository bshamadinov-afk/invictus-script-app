import { type Card, type Rank, RANKS, createShuffledDeck, isJoker, isRank } from './cards';
import { createRng } from './rng';
import { DEFAULT_RULES, type RulesConfig, isRankPlayable, resolutionFor } from './rules';
import type {
  ActionResult,
  ErrorCode,
  GameAction,
  GameEvent,
  GameState,
  PlayedCard,
  PlayerId,
  PlayerState,
  Zone,
} from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export interface CreateGameOptions {
  seed: number;
  /** 2–6 (default 2). Six players use 54 of the 56 cards in the deal. */
  playerCount?: number;
  /** Defaults to a seeded random seat. */
  startingPlayer?: PlayerId;
  rules?: RulesConfig;
}

export function isOut(state: GameState, player: PlayerId): boolean {
  return state.finishOrder.includes(player);
}

/** The next seat after `player` that still has cards. */
export function nextPlayer(state: GameState, player: PlayerId): PlayerId {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const candidate = (player + k) % n;
    if (!isOut(state, candidate)) return candidate;
  }
  return player;
}

/** Shuffle and deal: 3 face-down, then 3 face-up on top, then 3 to hand, per player. */
export function createGame({ seed, playerCount = 2, startingPlayer, rules = DEFAULT_RULES }: CreateGameOptions): GameState {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new RangeError(`playerCount must be ${MIN_PLAYERS}–${MAX_PLAYERS}`);
  }
  const rng = createRng(seed);
  const deck = createShuffledDeck(rng);
  const players: PlayerState[] = Array.from({ length: playerCount }, (_, id) => ({
    id,
    hand: [],
    faceUp: [],
    faceDown: [],
  }));
  const deal = (zone: Zone, n: number) => {
    for (const p of players) p[zone].push(...deck.splice(0, n));
  };
  deal('faceDown', rules.tableCards);
  deal('faceUp', rules.tableCards);
  deal('hand', rules.handSize);

  return {
    seed,
    players,
    drawDeck: deck,
    centerPile: [],
    burned: [],
    activePlayer: startingPlayer ?? Math.floor(rng() * playerCount),
    requiredRank: null,
    pendingContinuation: null,
    pendingReveal: null,
    phase: 'playing',
    finishOrder: [],
    winner: null,
    loser: null,
    moveHistory: [],
    turn: 0,
  };
}

/** The zone a player must currently play from: hand, then face-up, then face-down. */
export function activeZone(player: PlayerState): Zone {
  if (player.hand.length > 0) return 'hand';
  if (player.faceUp.length > 0) return 'faceUp';
  return 'faceDown';
}

export function cardsRemaining(player: PlayerState): number {
  return player.hand.length + player.faceUp.length + player.faceDown.length;
}

/** A legal way to play: which cards, and what a Joker-only set is declared as. */
export interface PlayOption {
  cardIds: string[];
  effectiveRank: Rank;
  jokerAs?: Rank;
}

export interface PlayContext {
  requiredRank: Rank | null;
  pendingContinuation: boolean;
}

/**
 * Representative legal plays from a set of visible cards. For each playable
 * rank and each count 1..max it returns one option, preferring natural cards
 * over Jokers. It does not enumerate every id combination; the engine accepts
 * any valid combination, this is for bots and UI hints.
 */
export function playOptions(
  cards: readonly Card[],
  ctx: PlayContext,
  rules: RulesConfig = DEFAULT_RULES,
): PlayOption[] {
  const jokers = cards.filter(isJoker);
  const options: PlayOption[] = [];
  for (const rank of RANKS) {
    if (!isRankPlayable(rank, ctx.requiredRank, ctx.pendingContinuation, rules)) continue;
    const naturals = cards.filter((c) => c.rank === rank);
    const usableJokers = naturals.length === 0 || rules.allowJokersInSets ? jokers : [];
    const pool = [...naturals, ...usableJokers];
    const max = Math.min(rules.maxCardsPerMove, pool.length);
    for (let n = 1; n <= max; n++) {
      const picked = pool.slice(0, n);
      options.push({
        cardIds: picked.map((c) => c.id),
        effectiveRank: rank,
        ...(picked.some(isJoker) ? { jokerAs: rank } : {}),
      });
    }
  }
  return options;
}

export function hasLegalPlay(state: GameState, player: PlayerId, rules: RulesConfig = DEFAULT_RULES): boolean {
  const p = state.players[player]!;
  const zone = activeZone(p);
  // A blind face-down card can always be attempted; failure is resolved by the engine.
  if (zone === 'faceDown') return p.faceDown.length > 0;
  return playOptions(p[zone], playContext(state), rules).length > 0;
}

export function playContext(state: GameState): PlayContext {
  return { requiredRank: state.requiredRank, pendingContinuation: state.pendingContinuation !== null };
}

/** Pure reducer: returns a new state (the input is never mutated) or a typed error. */
export function applyAction(state: GameState, action: GameAction, rules: RulesConfig = DEFAULT_RULES): ActionResult {
  if (state.phase === 'finished') return fail('GAME_OVER', 'The game is over.');
  if (action.player !== state.activePlayer) return fail('NOT_YOUR_TURN', `It is player ${state.activePlayer}'s turn.`);
  if (state.pendingReveal && action.type !== 'chooseJokerIdentity') {
    return fail('AWAITING_JOKER_IDENTITY', 'Choose what the revealed Joker is first.');
  }

  const next = structuredClone(state);
  const events: GameEvent[] = [];
  const error = dispatch(next, action, rules, events);
  if (error) return error;
  next.moveHistory.push(...events);
  next.turn += 1;
  return { ok: true, state: next, events };
}

function dispatch(s: GameState, action: GameAction, rules: RulesConfig, events: GameEvent[]): ActionResult | null {
  switch (action.type) {
    case 'playCards':
      return playCards(s, action.player, action.cardIds, action.jokerAs, rules, events);
    case 'takePile':
      return takePile(s, action.player, rules, events);
    case 'revealFaceDown':
      return revealFaceDown(s, action.player, action.index, rules, events);
    case 'chooseJokerIdentity':
      return chooseJokerIdentity(s, action.player, action.rank, rules, events);
  }
}

function playCards(
  s: GameState,
  playerId: PlayerId,
  cardIds: string[],
  jokerAs: Rank | undefined,
  rules: RulesConfig,
  events: GameEvent[],
): ActionResult | null {
  const player = s.players[playerId]!;
  const zone = activeZone(player);
  if (zone === 'faceDown') {
    return fail('WRONG_ZONE', 'Only face-down cards remain: reveal one with revealFaceDown.');
  }
  if (cardIds.length === 0 || new Set(cardIds).size !== cardIds.length) {
    return fail('INVALID_CARDS', 'Select one or more distinct cards.');
  }
  if (cardIds.length > rules.maxCardsPerMove) {
    return fail('TOO_MANY_CARDS', `At most ${rules.maxCardsPerMove} cards per move.`);
  }
  const cards: Card[] = [];
  for (const id of cardIds) {
    const card = player[zone].find((c) => c.id === id);
    if (!card) return fail('INVALID_CARDS', `Card ${id} is not playable from your ${zone}.`);
    cards.push(card);
  }

  const naturalRanks = new Set(cards.filter((c) => !isJoker(c)).map((c) => c.rank as Rank));
  if (naturalRanks.size > 1) return fail('MIXED_RANKS', 'All cards in a move must share one rank.');
  const hasJoker = cards.some(isJoker);
  let rank: Rank;
  if (naturalRanks.size === 1) {
    rank = [...naturalRanks][0]!;
    if (hasJoker && !rules.allowJokersInSets) {
      return fail('MIXED_RANKS', 'Jokers cannot be combined with natural cards.');
    }
    if (jokerAs !== undefined && jokerAs !== rank) {
      return fail('MIXED_RANKS', 'A Joker in a set must be declared as the set’s rank.');
    }
  } else {
    if (!isRank(jokerAs)) return fail('JOKER_IDENTITY_REQUIRED', 'Declare which rank the Joker is.');
    rank = jokerAs;
  }

  if (!isRankPlayable(rank, s.requiredRank, s.pendingContinuation !== null, rules)) {
    return fail('ILLEGAL_RANK', `A ${rank} cannot be played on a required ${s.requiredRank}.`);
  }

  const ids = new Set(cardIds);
  player[zone] = player[zone].filter((c) => !ids.has(c.id));
  resolvePlay(s, playerId, zone, cards, rank, rules, events);
  return null;
}

function takePile(s: GameState, playerId: PlayerId, rules: RulesConfig, events: GameEvent[]): ActionResult | null {
  if (s.pendingContinuation) return fail('MUST_CONTINUE', 'You must play another card.');
  if (hasLegalPlay(s, playerId, rules)) {
    return fail('HAS_LEGAL_MOVE', 'You can only take the pile when you have no legal move.');
  }
  pickUpPile(s, playerId, [], 'noLegalMove', events);
  return null;
}

function revealFaceDown(
  s: GameState,
  playerId: PlayerId,
  index: number,
  rules: RulesConfig,
  events: GameEvent[],
): ActionResult | null {
  const player = s.players[playerId]!;
  if (activeZone(player) !== 'faceDown') {
    return fail('WRONG_ZONE', 'Face-down cards are played only after your hand and face-up cards are gone.');
  }
  if (!Number.isInteger(index) || index < 0 || index >= player.faceDown.length) {
    return fail('INVALID_INDEX', `Pick a face-down card between 0 and ${player.faceDown.length - 1}.`);
  }
  const [card] = player.faceDown.splice(index, 1) as [Card];

  if (isJoker(card)) {
    // Any rank is declarable and 2/7/10 are always legal, so a Joker never fails; wait for the choice.
    events.push({ type: 'faceDownRevealed', player: playerId, card, playable: true });
    s.pendingReveal = card;
    return null;
  }
  const playable = isRankPlayable(card.rank, s.requiredRank, s.pendingContinuation !== null, rules);
  events.push({ type: 'faceDownRevealed', player: playerId, card, playable });
  if (playable) {
    resolvePlay(s, playerId, 'faceDown', [card], card.rank, rules, events);
  } else {
    pickUpPile(s, playerId, [card], 'blindFail', events);
  }
  return null;
}

function chooseJokerIdentity(
  s: GameState,
  playerId: PlayerId,
  rank: Rank,
  rules: RulesConfig,
  events: GameEvent[],
): ActionResult | null {
  const card = s.pendingReveal;
  if (!card) return fail('NO_PENDING_JOKER', 'There is no revealed Joker waiting for an identity.');
  if (!isRank(rank)) return fail('JOKER_IDENTITY_REQUIRED', 'Declare a rank from 2 to A.');
  if (!isRankPlayable(rank, s.requiredRank, s.pendingContinuation !== null, rules)) {
    return fail('ILLEGAL_RANK', `A Joker as ${rank} cannot be played on a required ${s.requiredRank}.`);
  }
  s.pendingReveal = null;
  resolvePlay(s, playerId, 'faceDown', [card], rank, rules, events);
  return null;
}

/** Shared by hand, face-up, face-down and Joker plays: put cards on the pile and apply the rank's handler. */
function resolvePlay(
  s: GameState,
  playerId: PlayerId,
  from: Zone,
  cards: Card[],
  rank: Rank,
  rules: RulesConfig,
  events: GameEvent[],
): void {
  const played: PlayedCard[] = cards.map((card) => ({ card, effectiveRank: rank, player: playerId }));
  const res = resolutionFor(rules, {
    playedRank: rank,
    requiredRankBefore: s.requiredRank,
    count: cards.length,
  });
  s.centerPile.push(...played);
  events.push({ type: 'cardsPlayed', player: playerId, from, cards: played, effect: res.effect });

  if (res.burn) {
    const burnt = s.centerPile.map((p) => p.card);
    s.burned.push(...burnt);
    s.centerPile = [];
    events.push({ type: 'pileBurned', player: playerId, count: burnt.length });
  }
  s.requiredRank = res.requiredRank;

  drawUp(s, playerId, rules, events);

  if (cardsRemaining(s.players[playerId]!) === 0) {
    // Out of cards: the player leaves the game, even if they owed a follow-up card.
    s.pendingContinuation = null;
    s.finishOrder.push(playerId);
    if (s.winner === null) s.winner = playerId;
    events.push({ type: 'playerFinished', player: playerId, place: s.finishOrder.length });
    const left = s.players.filter((p) => !isOut(s, p.id));
    if (left.length <= 1) {
      s.phase = 'finished';
      s.loser = left[0]?.id ?? null;
      if (s.loser !== null) events.push({ type: 'gameOver', loser: s.loser });
      return;
    }
    s.activePlayer = nextPlayer(s, playerId);
    return;
  }

  if (res.nextPlayer === 'same') {
    s.pendingContinuation = res.continuation ?? 'two';
  } else {
    s.pendingContinuation = null;
    s.activePlayer = nextPlayer(s, playerId);
    if (res.effect === 'transfer') {
      events.push({ type: 'turnTransferred', from: playerId, to: s.activePlayer, requiredRank: s.requiredRank });
    }
  }
}

function pickUpPile(
  s: GameState,
  playerId: PlayerId,
  extra: Card[],
  reason: 'noLegalMove' | 'blindFail',
  events: GameEvent[],
): void {
  const cards = [...s.centerPile.map((p) => p.card), ...extra];
  s.players[playerId]!.hand.push(...cards);
  s.centerPile = [];
  s.requiredRank = null;
  s.pendingContinuation = null;
  s.activePlayer = nextPlayer(s, playerId);
  events.push({ type: 'pileTaken', player: playerId, cards, reason });
}

function drawUp(s: GameState, playerId: PlayerId, rules: RulesConfig, events: GameEvent[]): void {
  const hand = s.players[playerId]!.hand;
  const need = Math.min(rules.handSize - hand.length, s.drawDeck.length);
  if (need <= 0) return;
  hand.push(...s.drawDeck.splice(0, need));
  events.push({ type: 'cardsDrawn', player: playerId, count: need });
}

function fail(code: ErrorCode, message: string): ActionResult {
  return { ok: false, code, message };
}
