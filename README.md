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

## Online play

From the title screen pick **Host online game** to get a four-letter room code and an invite link. Friends pick **Join online game** and type the code, or just open the link. Up to 4 players; CPUs fill empty seats, and take over for anyone who disconnects.

Under the hood it's deterministic lockstep over WebRTC (PeerJS): every browser runs the same game from the same seed at a fixed 60 Hz, and only controller input crosses the network. The host collects each frame's input from everyone and broadcasts it, so all players simulate identical frames. The free PeerJS cloud broker introduces the players; there is no game server. Some strict networks block direct peer connections (no TURN relay is configured).

For local testing you can run your own broker (`npx peer --port 9000`) and add `?peerhost=127.0.0.1&peerport=9000` to the URL.

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

## Minigames

Every minigame has its own rules and CPU players. Ones marked ⚔ can also settle Duel Glove fights.

| Type | Minigames |
| --- | --- |
| 4-player | Bumper Brawl ⚔, Hex Hop ⚔, Bomb Drop ⚔, Trace Race ⚔, Coin Shower ⚔, Quick Draw ⚔, Pump Pump Pop ⚔, Parrot Says ⚔, Paint Panic ⚔, Sweep Leap ⚔, Archer Alley ⚔, Platform Pop ⚔ |
| 2 vs 2 | Puck Rush, Cannon Volley, Tug Tussle, Treasure Haul, Hoop Troop |
| 1 vs 3 | Rolling Rock, Beam Me Up, Peekaboo Panic, Snowball Siege, Giant Shove, Ghost Hunt, Bridge Burn, Hammer Drop, Sniper Tower |

## Dev shortcuts

- `?debug=board&turns=10&board=western`: board game with four CPUs (`pirate`, `western` or `space`)
- `?debug=minigame&id=bumper&play=1`: loop one minigame (`play=1` gives you seat 1, `duel=1` plays it one on one)
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
  net/      PeerJS transport and lockstep netcode
  scenes/   title, online lobby, character select, setup, board, ending
  ui/       HTML overlay helpers and styles
```

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. In the repo settings, set Pages to deploy from GitHub Actions.
