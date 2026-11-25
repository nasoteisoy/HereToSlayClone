# Guildbound

An original party-building fantasy card game for the browser, inspired by the *genre* of
games like Here to Slay. All of its names, characters, cards and art are original.
You play against 1–3 AI rival guilds.

## Play

Open `index.html` in any modern browser. You don't need a build step or a server.

## How to win

- **Slay 3 monsters**, or
- have **all 6 classes** in your party (your Party Leader counts): ⚔ Blade, ✦ Arcanist, ☾ Shade, ⛨ Warden, ⚙ Tinker, ❦ Druid.

## Turn summary

You get 3 action points (AP) each turn:

| Action | Cost |
| --- | --- |
| Draw a card | 1 AP |
| Play a Hero / Item / Magic card (new heroes get a free ability roll) | 1 AP |
| Roll 2d6 for a hero's ability (once per hero per turn) | 1 AP |
| Attack a monster (you must meet its party requirement) | 2 AP |
| Discard your hand and draw 5 | 3 AP |

- **Modifiers** can be played by anyone on any roll.
- **Objection!** cards challenge another player's Hero, Item or Magic card. Roll 7+ to cancel it.
- Each slain monster gives you a permanent power. Each Party Leader has a unique power.
- At the end of your turn you discard down to 7 cards.

## Project layout

```
index.html        page shell
styles.css        all styling
js/cards.js       card data (heroes, items, magic, modifiers, monsters, leaders)
js/engine.js      rules engine (UI-agnostic, async "agents" for decisions)
js/ai.js          heuristic AI opponent
js/ui.js          rendering + human player agent
test/simulate.js  headless AI-vs-AI simulation and invariant checks
```

Run the engine check with `node test/simulate.js 300`.
