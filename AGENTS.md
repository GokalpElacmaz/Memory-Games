# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Training Mind

Expo Router app of brain-training mini-games. See `README.md` for the full
architecture; the short version:

- Every game is a `GameDefinition` (`src/engine/types.ts`) exported from its own
  folder under `src/games/` and listed in `src/games/index.ts`. That registry is
  the only place the app learns about a game.
- A game component renders one round and calls `api.submit(success)`. It must
  not track score, lives, level or time — `useGameSession` owns those and feeds
  them back through `api`.
- Build a round in `useEffect(..., [api.round])`. The host increments `round`
  after each submit, and `level` changes at the same instant — never earlier —
  so a game may safely derive its layout from `api.level`.
- Attention/reaction games declare `roundLimitMs`; the host then draws the HUD
  shot clock and submits the failure itself. Do not hand-roll a round timeout.
- Colours come from `useTheme()`; a game's `accent` must be a name from
  `src/theme/palette.ts` so light mode keeps working.
- Never change a published game `id` — saved progress is keyed on it.

Run `npm run typecheck` before finishing a change.
