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

/** Card ids `me` must never see: others' hands, every face-down card and the deck, unless they were shown publicly. */
function hiddenFrom(s: GameState, me: number): string[] {
  const seen = publiclySeen(s);
  const ids: string[] = [];
  for (const p of s.players) {
    if (p.id !== me) ids.push(...p.hand.map((c) => c.id));
    ids.push(...p.faceDown.map((c) => c.id));
  }
  ids.push(...s.drawDeck.map((c) => c.id));
  return ids.filter((id) => !seen.has(id));
}

function runBotGame(seed: number, playerCount: number, onStep?: (s: GameState) => void): GameState {
  let s = createGame({ seed, playerCount });
  const rng = createRng(seed * 7919 + playerCount);
  for (let step = 0; step < 5000 && s.phase === 'playing'; step++) {
    onStep?.(s);
    const r = applyAction(s, chooseBotAction(getPlayerView(s, s.activePlayer), rng));
    if (!r.ok) throw new Error(`seed ${seed} (${playerCount}p) step ${step}: ${r.code} ${r.message}`);
    s = r.state;
  }
  return s;
}

describe('player view', () => {
  it('never exposes other hands, any face-down card, or the deck', () => {
    const g = createGame({ seed: 3, playerCount: 6 });
    const view = getPlayerView(g, 0);
    const json = JSON.stringify(view);
    for (const id of hiddenFrom(g, 0)) expect(json).not.toContain(`"${id}"`);
    expect(view.opponents.map((o) => o.id)).toEqual([1, 2, 3, 4, 5]);
    expect(view.opponents.every((o) => o.handCount === 3 && o.faceDownCount === 3)).toBe(true);
    expect(view.opponents[0]!.faceUp).toEqual(g.players[1]!.faceUp);
    expect(view.drawDeckCount).toBe(2);
  });

  it('keeps hidden values hidden throughout full bot games', () => {
    for (const [seed, n] of [[1, 2], [2, 3], [3, 6]] as const) {
      runBotGame(seed, n, (s) => {
        for (let me = 0; me < n; me++) {
          const json = JSON.stringify(getPlayerView(s, me));
          for (const id of hiddenFrom(s, me)) expect(json).not.toContain(`"${id}"`);
        }
      });
    }
  });
});

describe('bot simulation', () => {
  for (const n of [2, 3, 4, 6]) {
    it(`${n} players: only legal actions, all 56 cards conserved, every game finishes`, () => {
      const games = n === 2 ? 150 : 60;
      for (let seed = 1; seed <= games; seed++) {
        const s = runBotGame(seed, n, (st) => expect(countCards(st)).toBe(DECK_SIZE));
        expect(s.phase).toBe('finished');
        expect(s.finishOrder).toHaveLength(n - 1);
        expect(s.loser).not.toBeNull();
        expect(new Set([...s.finishOrder, s.loser]).size).toBe(n);
        for (const id of s.finishOrder) {
          const p = s.players[id]!;
          expect(p.hand.length + p.faceUp.length + p.faceDown.length).toBe(0);
        }
      }
    });
  }

  it('replays identically from the same seed and actions', () => {
    expect(runBotGame(99, 6)).toEqual(runBotGame(99, 6));
  });
});
