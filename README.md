# Sorry Not Sorry

A party board game for the browser, in the spirit of Mario Party 2. Everything you see and hear (models, textures, music, sound effects) is generated in code. No asset files.

## Run it

```sh
npm install
npm run dev      # local dev server
npm run build    # type-check + production build into dist/
```

## Controls

| Action | Gamepad | Keyboard |
| --- | --- | --- |
| Move | Left stick / D-pad | WASD / arrow keys |
| A (confirm, jump) | A | Space / J |
| B (back) | B | Left Shift / K |
| Start | Start | Enter / Esc |

## Items

You carry one item at a time. Get them from purple **?** spaces or the yellow shop space, and use them before you roll.

| Item | Price | Effect |
| --- | --- | --- |
| Turbo Boot | 5 | Roll two dice |
| Gold Boot | 10 | Roll three dice |
| Skeleton Key | 5 | Opens the locked gate shortcut (used automatically) |
| Swap Block | 10 | Swap places with a random rival |
| Duel Glove | 10 | Duel a rival for coins in a 1-on-1 minigame |
| Pickpocket Chest | 15 | Steal a rival's item |
| Star Lamp | 25 | Warp to the star |

Orange **X** spaces start a battle: everyone pays into a pot and the minigame winners split it. In the last 5 turns blue and red spaces count double. At the end, three bonus stars go to the top minigame earner, the richest moment and the most **!** spaces.

## Dev shortcuts

- `?debug=board&turns=10`: board game with four CPUs
- `?debug=minigame&id=bumper&play=1`: loop one minigame (`play=1` gives you seat 1)
- `?debug=ending`: results screen with sample numbers
- `?speed=4`: run the game faster

## Layout

```
src/
  core/     game loop, scene manager, seeded RNG
  render/   renderer, toon materials + outlines, palette, procedural props
  input/    keyboard + gamepad unified as Controllers
  audio/    WebAudio synth voices, SFX recipes, step sequencer, songs
  board/    board graph, spaces, dice, items, HUD, the Grudge
  minigames/ minigame framework and the minigames
  scenes/   title, character select, setup, board, ending
  ui/       HTML overlay helpers and styles
```

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. In the repo settings, set Pages to deploy from GitHub Actions.
