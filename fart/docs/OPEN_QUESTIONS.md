# Open rules questions

The handoff brief leaves these unspecified. Each one is implemented as the
default below and, where possible, behind a `RulesConfig` switch so the answer
can change without touching the engine. Please confirm or correct them.

| # | Question | Current behavior | Where to change |
|---|----------|------------------|-----------------|
| 1 | **7 (transfer)** is provisional. | Turn passes to the opponent; required rank stays what it was before the 7 (9 → 7 ⇒ opponent answers a 9). On an empty pile there is no required rank. | `resolveSevenTransfer` in `src/engine/rules.ts`, or `RulesConfig.specials[7]` |
| 2 | Can a **10** be played on any rank (e.g. on an Ace)? | Yes, 10 is always playable. | `RulesConfig.alwaysPlayableRanks` |
| 3 | Can a **7** be played on any rank? | Yes, inferred from the 9 → 7 example. | `RulesConfig.alwaysPlayableRanks` |
| 4 | After a **10 burns**, must the same player lead the next card? | Yes ("the player who played the 10 starts a fresh pile"): they must play again, anything is legal. | `resolveTen` |
| 5 | Can **Jokers be combined with natural cards** of the same rank (K + K + Joker-as-K)? | Yes, up to 4 cards in total. | `RulesConfig.allowJokersInSets` |
| 6 | Does a **2 or 10 as the very last card** win, or does the player still owe a follow-up? | It wins immediately. | `resolvePlay` in `src/engine/engine.ts` |
| 7 | When a 2 empties the hand while the deck still has cards, does the player draw before the follow-up? | Yes, refill happens after every play, including the 2. | `drawUp` call in `resolvePlay` |
| 8 | Can a player **take the pile voluntarily** while holding a legal move? | No, only with no legal move. A Joker in the active zone always counts as a legal move. | `takePile` |
| 9 | Can **several face-up cards of one rank** be played together? | Yes, like hand cards. Hand and face-up cards are never mixed in one move. | `playCards` |
| 10 | **Who starts** the game? | Seeded coin flip, or `startingPlayer` passed to `createGame`. | `createGame` |
| 11 | Can a game **loop forever**? | With poor play, yes: two players can bounce the same pile back and forth. The bot avoids it by burning with forced Jokers. Consider a stalemate rule for online play (e.g. a move cap). | — |
