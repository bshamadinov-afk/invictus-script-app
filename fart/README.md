# FART: card game engine

Deterministic rules engine for **FART**, a custom 1v1 card game (inspired by
Durak but with its own rules). This is the authoritative implementation of the
rules in the project handoff brief. It has no UI and no dependencies, so it can
drive the web preview now and run on a server for online play later.

```bash
npm install
npm test          # 43 tests: rules, redaction, 200 seeded bot-vs-bot games
npm run typecheck
npm run build:web # builds web/index.html: playable page (you vs bot)
```

Open `web/index.html` in a browser to play. It is a single self-contained
file, so it can be deployed as-is (e.g. Vercel with `fart/web` as the root).

## Layout

| File | What it holds |
|------|---------------|
| `src/engine/cards.ts` | 56-card deck (52 + 4 Jokers), numeric ranks (J=11 … A=14), seeded shuffle |
| `src/engine/rng.ts` | Seeded PRNG so a seed reproduces the same deal everywhere |
| `src/engine/rules.ts` | `RulesConfig` and the special-card handlers for 2, 7 and 10 |
| `src/engine/types.ts` | `GameState`, actions, events, error codes |
| `src/engine/engine.ts` | `createGame`, the pure reducer `applyAction`, legal-move helpers |
| `src/engine/view.ts` | `getPlayerView`: the redacted state one player may see |
| `src/engine/bot.ts` | Simple prototype bot that only reads its own view |
| `docs/OPEN_QUESTIONS.md` | Rules the brief leaves open and the current defaults |

## How it works

- **Pure reducer.** `applyAction(state, action)` returns `{ ok, state, events }` or
  `{ ok: false, code, message }`. The input state is never mutated, and the state
  is plain JSON, so it can be stored, diffed and sent over the wire.
- **Actions:** `playCards` (1–4 cards of one rank, with `jokerAs` when Jokers
  need an identity), `takePile`, `revealFaceDown` (by index, blind), and
  `chooseJokerIdentity` (for a Joker revealed face-down).
- **Events** (`cardsPlayed`, `pileBurned`, `turnTransferred`, `cardsDrawn`,
  `pileTaken`, `faceDownRevealed`, `won`) are appended to `moveHistory` and
  contain only public information, which makes them suitable for animation and
  for an online event stream.
- **Zones** are modelled separately (`hand`, `faceUp`, `faceDown`). A player must
  play from hand, then face-up, then face-down (blind, one at a time).
- **`requiredRank`** is tracked separately from the top physical card, because a
  7 and a Joker change how the pile is read. The center pile is an ordered list
  of `PlayedCard { card, effectiveRank, player }`, so a Joker's chosen identity
  is stored explicitly.
- **Special cards are handlers** (`resolveTwo`, `resolveTen`,
  `resolveSevenTransfer`) looked up by *effective* rank, so a Joker declared as
  2, 7 or 10 reuses exactly the same behavior. The provisional 7 rule lives in
  one function.
- **Hidden information.** Card ids (`c00`…`c55`) are assigned after shuffling and
  never encode a value. `getPlayerView` reduces the opponent's hand, all
  face-down cards and the draw deck to counts. Tests check this across full games.

## Not done yet

- iOS (Swift) port of the engine, online rooms and server sync (handoff
  priority 7). The web page in `web/` is a first playable preview.
- Product-owner sign-off on the 7 rule and the other items in
  `docs/OPEN_QUESTIONS.md`.
