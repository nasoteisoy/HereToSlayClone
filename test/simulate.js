// Runs many AI-only games headlessly to sanity-check the rules engine.
// Usage: node test/simulate.js [games]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

['cards.js', 'engine.js', 'ai.js'].forEach((f) => {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });
});
const G = globalThis.Guild;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function totalCards(game) {
  let n = game.deck.length + game.discard.length + game.pending.length;
  game.players.forEach((p) => {
    n += p.hand.length;
    p.party.forEach((h) => { n += 1 + (h.item ? 1 : 0); });
  });
  return n;
}

async function main() {
  const games = Number(process.argv[2] || 300);
  const stats = { slay: 0, classes: 0, none: 0, turns: 0, maxTurns: 0 };
  const expected = G.Cards.buildDeck().length;
  for (let g = 0; g < games; g++) {
    const nPlayers = 2 + (g % 3);
    const game = new G.Engine.Game({
      rng: mulberry32(g + 1),
      maxTurns: 400,
      players: Array.from({ length: nPlayers }, (_, i) => ({ name: 'AI' + i, agent: G.AI.createAI() })),
    });
    // invariant check after every action
    game.ui.update = () => {
      const n = totalCards(game);
      if (n !== expected) throw new Error(`Card count drift: ${n} vs ${expected} (game ${g}, turn ${game.turnNumber})`);
      game.players.forEach((p) => { if (p.ap < 0) throw new Error(`Negative AP for ${p.name}`); });
    };
    const w = await game.play();
    if (!w) stats.none++;
    else if (game.winReason.includes('monsters')) stats.slay++;
    else stats.classes++;
    stats.turns += game.turnNumber;
    stats.maxTurns = Math.max(stats.maxTurns, game.turnNumber);
  }
  console.log(`games=${games} slayWins=${stats.slay} classWins=${stats.classes} noWinner=${stats.none} avgTurns=${(stats.turns / games).toFixed(1)} maxTurns=${stats.maxTurns}`);
  if (stats.none > games * 0.02) { console.error('Too many stalled games'); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
