# Open rules questions

The handoff brief leaves these unspecified. Each one is implemented as the
default below and, where possible, behind a `RulesConfig` switch so the answer
can change without touching the engine. Please confirm or correct them.

| # | Question | Current behavior | Where to change |
|---|----------|------------------|-----------------|
| 1 | **7 (transfer)** is provisional. | Turn passes to the next player; required rank stays what it was before the 7 (9 → 7 ⇒ opponent answers a 9). On an empty pile there is no required rank. | `resolveSevenTransfer` in `src/engine/rules.ts`, or `RulesConfig.specials[7]` |
| 2 | Can a **10** be played on any rank (e.g. on an Ace)? | Yes, 10 is always playable. | `RulesConfig.alwaysPlayableRanks` |
| 3 | Can a **7** be played on any rank? | Yes, inferred from the 9 → 7 example. | `RulesConfig.alwaysPlayableRanks` |
| 4 | After a **10 burns**, who leads? | **Decided:** the next player starts the fresh pile. | `resolveTen` |
| 5 | Can **Jokers be combined with natural cards** of the same rank (K + K + Joker-as-K)? | Yes, up to 4 cards in total. | `RulesConfig.allowJokersInSets` |
| 6 | Does a **2 (or four of a kind) as the very last card** finish the player, or do they still owe a follow-up? | They go out immediately. | `resolvePlay` in `src/engine/engine.ts` |
| 7 | When a 2 empties the hand while the deck still has cards, does the player draw before the follow-up? | Yes, refill happens after every play, including the 2. | `drawUp` call in `resolvePlay` |
| 8 | Can a player **take the pile voluntarily** while holding a legal move? | No, only with no legal move. A Joker in the active zone always counts as a legal move. | `takePile` |
| 9 | Can **several face-up cards of one rank** be played together? | Yes, like hand cards. Hand and face-up cards are never mixed in one move. | `playCards` |
| 10 | **Who starts** the game? | Random seat (seeded), or `startingPlayer` passed to `createGame`. | `createGame` |
| 12 | **Four of a kind** in one move. | **Decided:** works like a 2: the same player must cover it with another card, anything goes. | `applyFourOfAKind` in `src/engine/rules.ts`, `RulesConfig.fourOfAKindSize` |
| 13 | Do **Jokers count** toward four of a kind (three 5s + Joker-as-5)? | Yes. | `resolutionFor` |
| 14 | **Four 7s** or **four 10s**? | Four 7s continue like a 2 (no transfer). Four 10s burn the pile *and* the same player goes again. | `applyFourOfAKind` |
| 15 | Do four equal cards **across several moves** (two 5s, then two more 5s) count? | No, only four in a single move. | `resolutionFor` |
| 16 | **3–6 players:** what ends the game? | A player with no cards left goes out (1st, 2nd, …). The game ends when one player is left holding cards: that player loses. | `resolvePlay` |
| 17 | With 3+ players, who gets the turn after a 7, a 10 burn or a pile pickup? | The next player in seat order who still has cards. | `nextPlayer` in `src/engine/engine.ts` |
| 11 | Can a game **loop forever**? | With poor play, yes: two players can bounce the same pile back and forth. The bot avoids it by burning with forced Jokers. Consider a stalemate rule for online play (e.g. a move cap). | — |
