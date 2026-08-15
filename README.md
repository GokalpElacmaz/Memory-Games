# Training Mind

An Expo (React Native) app of short brain-training mini-games, built so that
adding a game is a one-file job.

Inspired by *Memory Games: Brain Training* on Android, which has no iOS release.

## SDK version

The project is pinned to **Expo SDK 54**, deliberately, not to the newest SDK.

Expo Go runs exactly one SDK version, and the installed client here is an SDK 54
build. Anything newer fails to open at all with "Project is incompatible with
this version of Expo Go", no matter how up to date the app is. SDK 54 is what
the sibling Woordje project runs on, which is how we know it works on this
device.

Before bumping the SDK, check what Expo Go actually supports (its Settings tab
reports it). Then:

```bash
npm install expo@^55.0.0 && npx expo install --fix
```

Reanimated 4 needs `react-native-worklets` as an explicit dependency — keep it
in step with the reanimated version when moving SDKs.

A development build (`npx expo run:ios`, or EAS) has no such constraint and can
sit on any SDK — that is the path once this stops being a hobby project.

## Running it

```bash
npm install
```

```bash
npx expo start
```

Press `i` for the iOS simulator, `a` for Android, `w` for the browser. Nothing
in the app uses native code beyond the Expo SDK, so Expo Go works for day-to-day
development.

```bash
npm run typecheck
```

## The games

| Game | Category | Idea |
| --- | --- | --- |
| Memory Grid | Memory | Cells light up on a 4×4 board; recall them. The board grows to 5×5, 6×6, 7×7, 8×8 as levels pass. |
| Rotating Grid | Memory | A pattern lights up and hides, then the board turns 90/180/270°. Tap where the pattern is now — a marker bar along one edge is the only sign of which way it went. |
| Memory Hex | Memory | The same recall task on a honeycomb that gains a ring per stage. |
| What's New | Memory | A 144-cell board keeps every cell you have found; each round adds one more and you tap the newcomer. |
| Who's New | Memory | Emoji tokens scattered at random non-overlapping spots. The board blanks for a beat, then returns rescattered with one extra — position never helps. |
| Symbol Order | Memory | Signs flash in order; replay the order from a shuffled palette. One colour per hue family, so no two tiles are a shade apart. |
| Planes | Attention | A sky full of grey traffic at mixed sizes and speeds, with one coloured plane among it. Its nose never points where it goes: orange means swipe the course, blue means swipe the nose. |
| Colour Check | Attention | A coloured circle over a colour word: yes or no. From level 4 the word is printed in a third colour (Stroop interference). |
| One and Only | Logic | Every shape-and-colour pair on the board repeats — except one. Find as many odd pairs as possible before the 60-second overall timer or your lives run out. |
| Colour Chain | Logic | Link touching squares of one colour by dragging or tapping. Every row and column has its own arrows and wraps Pac-Man style, so you slide lines into alignment. A chain of n scores 2ⁿ. |
| Higher Side | Logic | One running number, two operations — pick the side that leaves it bigger. Ported from the KelMat web project. |
| Black Keys | Speed | An endless, full-screen four-lane piano track keeps speeding up until your lives run out. Tap visible black tiles; press anywhere on a long tile and hold until its blue fill completes. |

## Architecture

```
app/                     expo-router routes (thin — they only pick a game)
  _layout.tsx            providers + stack
  index.tsx              home screen, built from the registry
  game/[id].tsx          looks the id up in the registry
  settings.tsx
src/
  engine/                everything shared by all games
    types.ts             GameDefinition + GameApi — the contract
    useGameSession.ts    countdown, score, lives, timer, level, run end
    GameHost.tsx         how-to-play, HUD, countdown and results overlays
    Hud.tsx
    rng.ts               shuffle / sample / pick helpers
  games/                 one folder per game
    index.ts             THE REGISTRY
    _template/           copy this to start a new game (not registered)
  components/            Screen, Board, Button, PressableScale, Shape
  storage/               AsyncStorage-backed settings and best scores
  theme/                 colour tokens, light + dark
```

### The split

A game component **renders a round and reports the outcome**. It never tracks
score, lives, time or level — the host owns all of that and hands the current
values back through `api`.

```ts
useEffect(() => {
  /* build a round from api.level */
}, [api.round]);          // the host bumps `round` after every submit

api.submit(true, { delayMs: 600 });   // success — host scores it, levels up, advances
api.submit(false);                    // failure — host takes a life, ends the run at zero
```

Useful `api` fields: `level`, `round`, `score`, `lives`, `streak`, `timeLeft`,
`isRunning`, `memoriseBonusMs` (extra study time the player chose in Settings),
plus `setPrompt`, `haptic`, `addScore` and `endRun`.

## Adding a game

1. `cp -r src/games/_template src/games/my-game`
2. Rename the component and the exported definition.
3. Add it to the array in `src/games/index.ts`.

That is the whole checklist. The home screen, its category section, the
how-to-play screen, routing, scoring, best-score persistence and the results
screen all read from the definition.

Two rules worth respecting:

- **Never change a published `id`.** Saved progress is keyed on it.
- **Take colours from `useTheme()`**, and pick the game's `accent` from the
  names in `src/theme/palette.ts`, so light mode keeps working.

`session` decides the shape of a run:

```ts
session: { mode: 'lives', lives: 3 }                  // round-based
session: { mode: 'timed', seconds: 60, lives: 3 }     // beat the clock
```

`progression.levelUpEvery` decides how fast difficulty climbs: `1` for one level
per success, `6` for a slower ramp, `null` to leave the level alone.

`roundLimitMs` puts a shot clock on each round. The host draws a draining bar in
the HUD and submits a failure for the player when it expires, so a game never
has to write its own timeout. Attention games use it; memorise games leave it
off so the player can think.

```ts
roundLimitMs: (level) => clamp(3400 - level * 250, 1400, 3400)
```

Two timing rules the host guarantees, so games do not have to defend against
them: `level` only ever changes at the same moment as `round` (a game reading
`api.level` will never re-render the round it is still showing feedback for),
and only the first `submit` in a round counts.

## Publishing

The app ships as **Training Mind** (`com.gokalpelacmaz.memorygames2026`). The
`slug` stays `memory-games` because it keys the EAS project — renaming it breaks
the link to `extra.eas.projectId`.

Build numbers are **not** in `app.json`. `eas.json` sets
`appVersionSource: "remote"` with `autoIncrement`, so EAS holds the counter
server-side and bumps it every build; `ios.buildNumber` and
`android.versionCode` are deliberately absent because they would be ignored.

Only `expo.version` is edited by hand, and only for a new user-facing release.

```bash
eas build --platform ios --profile production
```

```bash
eas submit --platform ios --latest
```

To inspect or correct the remote counter — needed if a build was ever uploaded
outside EAS, since App Store Connect rejects a build number it has already seen
for a given version:

```bash
eas build:version:get --platform ios
```

Going public is the **Distribution** tab in App Store Connect, not TestFlight;
the two run side by side and releasing does not disable beta testing. Two things
block a first submission: a privacy policy URL (required even though this app
collects nothing — scores live only in local `AsyncStorage`), and iPad
screenshots, which Apple demands because `ios.supportsTablet` is `true`.
