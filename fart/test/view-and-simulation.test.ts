import { describe, expect, it } from 'vitest';
import { DECK_SIZE } from '../src/engine/cards';
import { chooseBotAction } from '../src/engine/bot';
import { applyAction, createGame } from '../src/engine/engine';
import { createRng } from '../src/engine/rng';
import type { GameState } from '../src/engine/types';
import { getPlayerView } from '../src/engine/view';

function countCards(s: GameState): number {
  const zones = s.players.reduce((n, p) => n + p.hand.length + p.faceUp.length + p.faceDown.length, 0);
  return zones + s.drawDeck.length + s.centerPile.length + s.burned.length + (s.pendingReveal ? 1 : 0);
}

function publiclySeen(s: GameState): Set<string> {
  const seen = new Set<string>();
  for (const e of s.moveHistory) {
    if (e.type === 'cardsPlayed') e.cards.forEach((p) => seen.add(p.card.id));
    if (e.type === 'pileTaken') e.cards.forEach((c) => seen.add(c.id));
    if (e.type === 'faceDownRevealed') seen.add(e.card.id);
  }
  return seen;
}

describe('player view', () => {
  it('never exposes opponent hand, any face-down card, or the deck', () => {
    const g = createGame({ seed: 3 });
    const view = getPlayerView(g, 0);
    const json = JSON.stringify(view);
    const hidden = [...g.players[1].hand, ...g.players[0].faceDown, ...g.players[1].faceDown, ...g.drawDeck];
    for (const card of hidden) expect(json).not.toContain(`"${card.id}"`);
    expect(view.opponent.handCount).toBe(3);
    expect(view.opponent.faceUp).toEqual(g.players[1].faceUp);
    expect(view.faceDownCount).toBe(3);
    expect(view.drawDeckCount).toBe(38);
  });

  it('keeps hidden values hidden throughout full bot games', () => {
    for (let seed = 1; seed <= 10; seed++) {
      let s = createGame({ seed });
      const rng = createRng(seed);
      for (let step = 0; step < 2000 && s.phase === 'playing'; step++) {
        for (const me of [0, 1] as const) {
          const json = JSON.stringify(getPlayerView(s, me));
          const opp = s.players[me === 0 ? 1 : 0];
          const seen = publiclySeen(s);
          for (const card of [...opp.hand, ...opp.faceDown, ...s.players[me].faceDown, ...s.drawDeck]) {
            // A card the opponent picked up from the pile was public; everything else must stay unseen.
            if (!seen.has(card.id)) expect(json).not.toContain(`"${card.id}"`);
          }
        }
        const r = applyAction(s, chooseBotAction(getPlayerView(s, s.activePlayer), rng));
        if (!r.ok) throw new Error(r.message);
        s = r.state;
      }
    }
  });
});

describe('bot vs bot simulation', () => {
  it('only produces legal actions, conserves all 56 cards, and games finish', () => {
    let finished = 0;
    const games = 200;
    for (let seed = 1; seed <= games; seed++) {
      let s = createGame({ seed });
      const rng = createRng(seed * 7919);
      for (let step = 0; step < 3000 && s.phase === 'playing'; step++) {
        const action = chooseBotAction(getPlayerView(s, s.activePlayer), rng);
        const r = applyAction(s, action);
        if (!r.ok) throw new Error(`seed ${seed} step ${step}: ${r.code} ${r.message}`);
        s = r.state;
        expect(countCards(s)).toBe(DECK_SIZE);
      }
      if (s.phase === 'finished') {
        finished++;
        const w = s.players[s.winner!];
        expect(w.hand.length + w.faceUp.length + w.faceDown.length).toBe(0);
      }
    }
    expect(finished).toBe(games);
  });

  it('replays identically from the same seed and actions', () => {
    const run = () => {
      let s = createGame({ seed: 99 });
      const rng = createRng(1);
      while (s.phase === 'playing') {
        const r = applyAction(s, chooseBotAction(getPlayerView(s, s.activePlayer), rng));
        if (!r.ok) throw new Error(r.message);
        s = r.state;
      }
      return s;
    };
    expect(run()).toEqual(run());
  });
});
