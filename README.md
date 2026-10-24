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

## Layout

```
src/
  core/     game loop, scene manager, seeded RNG
  render/   renderer, toon materials + outlines, palette, procedural props
  input/    keyboard + gamepad unified as Controllers
  audio/    WebAudio synth voices, SFX recipes, step sequencer, songs
  scenes/   title screen, playground test bed
  ui/       HTML overlay helpers and styles
```

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. In the repo settings, set Pages to deploy from GitHub Actions.
