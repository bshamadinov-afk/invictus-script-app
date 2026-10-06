import { describe, expect, it } from 'vitest';
import { DECK_SIZE, createShuffledDeck, isJoker } from '../src/engine/cards';
import { applyAction, createGame } from '../src/engine/engine';
import { createRng } from '../src/engine/rng';
import { c, expectError, ids, makeState, ok, pile, play } from './helpers';

describe('deck and deal', () => {
  it('has 56 cards: 52 standard + 4 Jokers, unique ids', () => {
    const deck = createShuffledDeck(createRng(1));
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck.filter(isJoker)).toHaveLength(4);
    for (const rank of [2, 7, 10, 14]) expect(deck.filter((x) => x.rank === rank)).toHaveLength(4);
    expect(new Set(deck.map((x) => x.id)).size).toBe(56);
  });

  it('deals 3 face-down, 3 face-up and 3 in hand to each player', () => {
    const g = createGame({ seed: 42 });
    for (const p of g.players) {
      expect(p.faceDown).toHaveLength(3);
      expect(p.faceUp).toHaveLength(3);
      expect(p.hand).toHaveLength(3);
    }
    expect(g.drawDeck).toHaveLength(56 - 18);
    expect(g.centerPile).toHaveLength(0);
  });

  it('is deterministic for a seed', () => {
    expect(createGame({ seed: 7 })).toEqual(createGame({ seed: 7 }));
    expect(createGame({ seed: 7 })).not.toEqual(createGame({ seed: 8 }));
  });
});

describe('normal moves', () => {
  it('allows the same rank or higher, rejects lower', () => {
    const eight = c(8), nine = c(9), ace = c(14), six = c(6);
    const s = makeState({ hand: [eight, nine, ace, six], centerPile: pile(8) });
    expect(ok(play(s, [eight])).requiredRank).toBe(8);
    expect(ok(play(s, [nine])).requiredRank).toBe(9);
    expect(ok(play(s, [ace])).requiredRank).toBe(14);
    expectError(play(s, [six]), 'ILLEGAL_RANK');
  });

  it('passes the turn and rejects moves out of turn', () => {
    const nine = c(9);
    const s = makeState({ hand: [nine, c(3)], centerPile: pile(8) });
    expectError(play(s, [nine], undefined, 1), 'NOT_YOUR_TURN');
    expect(ok(play(s, [nine])).activePlayer).toBe(1);
  });

  it('does not mutate the input state', () => {
    const nine = c(9);
    const s = makeState({ hand: [nine], centerPile: pile(8) });
    const before = structuredClone(s);
    ok(play(s, [nine]));
    expect(s).toEqual(before);
  });
});

describe('multiple cards of the same rank', () => {
  it('plays 2–4 equal cards as one move', () => {
    const nines = [c(9), c(9), c(9)];
    const s = ok(play(makeState({ hand: [...nines, c(4)], centerPile: pile(8) }), nines));
    expect(s.centerPile).toHaveLength(4);
    expect(s.activePlayer).toBe(1);
  });

  it('rejects mixed ranks', () => {
    const a = c(9), b = c(11);
    expectError(play(makeState({ hand: [a, b] }), [a, b]), 'MIXED_RANKS');
  });

  it('four of a kind does NOT burn', () => {
    const quads = [c(9), c(9), c(9), c(9)];
    const s = ok(play(makeState({ hand: [...quads, c(3)], centerPile: pile(8) }), quads));
    expect(s.centerPile).toHaveLength(5);
    expect(s.burned).toHaveLength(0);
    expect(s.requiredRank).toBe(9);
    expect(s.activePlayer).toBe(1);
  });

  it('caps a move at 4 cards', () => {
    const five = [c(9), c(9), c(9), c(9), c('J')];
    expectError(play(makeState({ hand: five }), five, 9), 'TOO_MANY_CARDS');
  });
});

describe('drawing back to three', () => {
  it('refills the hand to 3 after a move while the deck lasts', () => {
    const pair = [c(9), c(9)];
    const s = ok(play(makeState({ hand: [...pair, c(4)], drawDeck: [c(12), c(13), c(14)] }), pair));
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.drawDeck).toHaveLength(1);
    expect(s.moveHistory).toContainEqual({ type: 'cardsDrawn', player: 0, count: 2 });
  });

  it('draws only what is left in the deck', () => {
    const pair = [c(9), c(9)];
    const s = ok(play(makeState({ hand: [...pair, c(4)], drawDeck: [c(12)] }), pair));
    expect(s.players[0].hand).toHaveLength(2);
    expect(s.drawDeck).toHaveLength(0);
  });

  it('does not draw when the hand is already 3 or more', () => {
    const nine = c(9);
    const s = ok(play(makeState({ hand: [nine, c(3), c(4), c(5)], drawDeck: [c(12)] }), [nine]));
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.drawDeck).toHaveLength(1);
  });
});

describe('2: continuation', () => {
  it('is playable on anything and keeps the turn with no required rank (K → 2 → 6)', () => {
    const two = c(2), six = c(6);
    let s = ok(play(makeState({ hand: [two, six, c(3)], centerPile: pile(13) }), [two]));
    expect(s.activePlayer).toBe(0);
    expect(s.pendingContinuation).toBe('two');
    expect(s.requiredRank).toBeNull();
    s = ok(play(s, [six]));
    expect(s.requiredRank).toBe(6);
    expect(s.activePlayer).toBe(1);
    expect(s.pendingContinuation).toBeNull();
  });

  it('cannot take the pile instead of continuing', () => {
    const two = c(2);
    const s = ok(play(makeState({ hand: [two, c(3), c(4)], centerPile: pile(13) }), [two]));
    expectError(applyAction(s, { type: 'takePile', player: 0 }), 'MUST_CONTINUE');
  });

  it('draws before continuing so an emptied hand can still follow up', () => {
    const twos = [c(2), c(2), c(2)];
    const s = ok(play(makeState({ hand: twos, drawDeck: [c(11), c(12), c(13)] }), twos));
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.activePlayer).toBe(0);
  });
});

describe('10: burn', () => {
  it('burns the whole pile, including the 10, and the same player starts fresh', () => {
    const ten = c(10);
    const s = ok(play(makeState({ hand: [ten, c(3), c(4)], centerPile: pile(9, 13, 14) }), [ten]));
    expect(s.centerPile).toHaveLength(0);
    expect(s.burned).toHaveLength(4);
    expect(s.requiredRank).toBeNull();
    expect(s.activePlayer).toBe(0);
    expect(s.pendingContinuation).toBe('burn');
    expect(s.moveHistory).toContainEqual({ type: 'pileBurned', player: 0, count: 4 });
  });

  it('is playable on an Ace', () => {
    const ten = c(10);
    expect(play(makeState({ hand: [ten, c(3)], centerPile: pile(14) }), [ten]).ok).toBe(true);
  });
});

describe('7: transfer (provisional)', () => {
  it('passes the turn and keeps the previous required rank (9 → 7)', () => {
    const seven = c(7);
    const s = ok(play(makeState({ hand: [seven, c(3), c(4)], centerPile: pile(9) }), [seven]));
    expect(s.activePlayer).toBe(1);
    expect(s.requiredRank).toBe(9);
    expect(s.centerPile.at(-1)?.effectiveRank).toBe(7);
    expect(s.moveHistory).toContainEqual({ type: 'turnTransferred', from: 0, to: 1, requiredRank: 9 });
  });

  it('on an empty pile leaves no required rank', () => {
    const seven = c(7);
    expect(ok(play(makeState({ hand: [seven, c(3)] }), [seven])).requiredRank).toBeNull();
  });
});

describe('Joker', () => {
  it('must declare a rank when played alone', () => {
    const j = c('J');
    expectError(play(makeState({ hand: [j, c(3)] }), [j]), 'JOKER_IDENTITY_REQUIRED');
  });

  it('as an ordinary rank must still be legal, and its identity is stored', () => {
    const j = c('J');
    const s0 = makeState({ hand: [j, c(3)], centerPile: pile(11) });
    expectError(play(s0, [j], 5), 'ILLEGAL_RANK');
    const s = ok(play(s0, [j], 12));
    expect(s.centerPile.at(-1)).toMatchObject({ card: { id: j.id, rank: 'joker' }, effectiveRank: 12 });
    expect(s.requiredRank).toBe(12);
  });

  it('as 2 gets the continuation', () => {
    const j = c('J');
    const s = ok(play(makeState({ hand: [j, c(3), c(4)], centerPile: pile(14) }), [j], 2));
    expect(s.activePlayer).toBe(0);
    expect(s.pendingContinuation).toBe('two');
  });

  it('as 10 burns', () => {
    const j = c('J');
    const s = ok(play(makeState({ hand: [j, c(3), c(4)], centerPile: pile(14, 13) }), [j], 10));
    expect(s.centerPile).toHaveLength(0);
    expect(s.burned).toHaveLength(3);
  });

  it('as 7 transfers', () => {
    const j = c('J');
    const s = ok(play(makeState({ hand: [j, c(3), c(4)], centerPile: pile(9) }), [j], 7));
    expect(s.activePlayer).toBe(1);
    expect(s.requiredRank).toBe(9);
  });

  it('can join natural cards of the same rank but not declare a different one', () => {
    const j = c('J'), k1 = c(13), k2 = c(13);
    const s0 = makeState({ hand: [j, k1, k2], centerPile: pile(9) });
    const s = ok(play(s0, [j, k1, k2]));
    expect(s.centerPile.slice(-3).every((p) => p.effectiveRank === 13)).toBe(true);
    expectError(play(s0, [j, k1], 10), 'MIXED_RANKS');
  });
});

describe('taking the pile', () => {
  it('is only allowed with no legal move', () => {
    const s = makeState({ hand: [c(14), c(3)], centerPile: pile(9) });
    expectError(applyAction(s, { type: 'takePile', player: 0 }), 'HAS_LEGAL_MOVE');
  });

  it('moves the whole pile to hand; the opponent starts a fresh pile', () => {
    const s = ok(applyAction(makeState({ hand: [c(3), c(4)], centerPile: pile(9, 11, 14) }), { type: 'takePile', player: 0 }));
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.centerPile).toHaveLength(0);
    expect(s.requiredRank).toBeNull();
    expect(s.activePlayer).toBe(1);
  });

  it('a Joker in hand always counts as a legal move', () => {
    const s = makeState({ hand: [c('J'), c(3)], centerPile: pile(14) });
    expectError(applyAction(s, { type: 'takePile', player: 0 }), 'HAS_LEGAL_MOVE');
  });
});

describe('endgame zones', () => {
  it('face-up cards are locked while the hand has cards', () => {
    const up = c(13);
    const s = makeState({ hand: [c(14)], faceUp: [up, c(5), c(5)] });
    expectError(play(s, [up]), 'INVALID_CARDS');
  });

  it('plays face-up cards once the hand is empty and the deck is gone', () => {
    const k1 = c(13), k2 = c(13);
    const s = ok(play(makeState({ hand: [], faceUp: [k1, k2, c(5)], centerPile: pile(9) }), [k1, k2]));
    expect(s.players[0].faceUp).toHaveLength(1);
    expect(s.requiredRank).toBe(13);
  });

  it('takes the pile into hand when no face-up card fits', () => {
    const s0 = makeState({ hand: [], faceUp: [c(3), c(4), c(5)], centerPile: pile(9) });
    const s = ok(applyAction(s0, { type: 'takePile', player: 0 }));
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.players[0].faceUp).toHaveLength(3);
  });

  it('face-down cards can only be revealed, never selected by id', () => {
    const fd = c(13);
    const s = makeState({ hand: [], faceUp: [], faceDown: [fd, c(3), c(4)] });
    expectError(play(s, [fd]), 'WRONG_ZONE');
    expectError(applyAction(makeState({ hand: [c(3)] }), { type: 'revealFaceDown', player: 0, index: 0 }), 'WRONG_ZONE');
  });

  it('a revealed legal face-down card is played normally', () => {
    const k = c(13);
    const s = ok(applyAction(makeState({ hand: [], faceUp: [], faceDown: [c(3), k, c(4)], centerPile: pile(9) }), { type: 'revealFaceDown', player: 0, index: 1 }));
    expect(s.players[0].faceDown).toHaveLength(2);
    expect(s.centerPile.at(-1)?.card.id).toBe(k.id);
    expect(s.activePlayer).toBe(1);
    expect(s.moveHistory[0]).toMatchObject({ type: 'faceDownRevealed', playable: true });
  });

  it('a revealed illegal face-down card goes to hand together with the pile', () => {
    const three = c(3);
    const p = pile(9, 12);
    const s = ok(applyAction(makeState({ hand: [], faceUp: [], faceDown: [three, c(4)], centerPile: p }), { type: 'revealFaceDown', player: 0, index: 0 }));
    expect(ids(s.players[0].hand)).toEqual(ids([...p.map((x) => x.card), three]));
    expect(s.players[0].faceDown).toHaveLength(1);
    expect(s.centerPile).toHaveLength(0);
    expect(s.activePlayer).toBe(1);
    expect(s.moveHistory.at(-1)).toMatchObject({ type: 'pileTaken', reason: 'blindFail' });
  });

  it('a revealed face-down Joker waits for its identity and then resolves', () => {
    const j = c('J');
    let s = ok(applyAction(makeState({ hand: [], faceUp: [], faceDown: [j, c(4)], centerPile: pile(14) }), { type: 'revealFaceDown', player: 0, index: 0 }));
    expect(s.pendingReveal?.id).toBe(j.id);
    expectError(applyAction(s, { type: 'takePile', player: 0 }), 'AWAITING_JOKER_IDENTITY');
    expectError(applyAction(s, { type: 'chooseJokerIdentity', player: 0, rank: 5 }), 'ILLEGAL_RANK');
    s = ok(applyAction(s, { type: 'chooseJokerIdentity', player: 0, rank: 10 }));
    expect(s.pendingReveal).toBeNull();
    expect(s.centerPile).toHaveLength(0);
    expect(s.activePlayer).toBe(0);
  });

  it('after a 2, the follow-up face-down card is always legal', () => {
    const three = c(3);
    let s = makeState({ hand: [], faceUp: [], faceDown: [three, c(4)], centerPile: pile(14), pendingContinuation: 'two', requiredRank: null });
    s = ok(applyAction(s, { type: 'revealFaceDown', player: 0, index: 0 }));
    expect(s.requiredRank).toBe(3);
  });
});

describe('winning', () => {
  it('wins when hand, face-up and face-down are all empty', () => {
    const k = c(13);
    const s = ok(applyAction(makeState({ hand: [], faceUp: [], faceDown: [k], centerPile: pile(9) }), { type: 'revealFaceDown', player: 0, index: 0 }));
    expect(s.phase).toBe('finished');
    expect(s.winner).toBe(0);
    expectError(applyAction(s, { type: 'takePile', player: 1 }), 'GAME_OVER');
  });

  it('a last-card 2 or 10 wins immediately instead of demanding a follow-up', () => {
    const ten = c(10);
    const s = ok(play(makeState({ hand: [], faceUp: [ten], faceDown: [] }), [ten]));
    expect(s.winner).toBe(0);
    expect(s.pendingContinuation).toBeNull();
  });
});
