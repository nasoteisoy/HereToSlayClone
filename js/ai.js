/* Guildbound — heuristic AI agent. */
(function (G) {
  'use strict';
  const { probAtLeast } = G.Engine;

  function threat(game, q) {
    return q.slain.length * 3.2 + game.classesOf(q).size * 1.1 + q.party.length * 0.4;
  }
  function topThreat(game, self) {
    let best = null;
    game.others(self).forEach((q) => { if (!best || threat(game, q) > threat(game, best)) best = q; });
    return best;
  }
  function wouldAddClass(game, p, cls) { return !game.classesOf(p).has(cls); }
  function bestPlusMod(p) {
    let m = 0;
    p.hand.forEach((c) => { if (c.kind === 'modifier') c.mods.forEach((v) => { if (v > m) m = v; }); });
    return m;
  }

  function cardValue(game, p, c) {
    switch (c.kind) {
      case 'hero': return wouldAddClass(game, p, c.cls) ? 9 : 6;
      case 'magic': return game.effectViable(p, c.effect, c) ? 7 : 4;
      case 'item': return c.item.kind === 'sigil' ? 5 : 4.5;
      case 'modifier': return 3 + Math.max(...c.mods.map(Math.abs)) * 0.3;
      case 'challenge': return 3.5;
      default: return 1;
    }
  }

  function heroValue(game, owner, h) {
    let v = 2 + (11 - h.need) * 0.2;
    const others = owner.party.filter((x) => x !== h && game.heroClass(x) === game.heroClass(h)).length;
    if (!others && owner.leader.cls !== game.heroClass(h)) v += 3; // unique class
    if (h.item) v += h.item.cursed ? -2 : 1.5;
    return v;
  }

  // Score how good an item target is for this player (<=0 means don't).
  function itemTargetScore(game, p, item, h) {
    const owner = game.ownerOf(h);
    const mine = owner === p;
    switch (item.item.kind) {
      case 'buff':
        if (item.item.value > 0) return mine ? 4 + (h.need - 6) * 0.5 : -1;
        return mine ? -5 : 3 + threat(game, owner) * 0.3 + (h.need <= 7 ? 1 : 0);
      case 'shackle': return mine ? -5 : 3 + threat(game, owner) * 0.3;
      case 'aegis': return mine ? 3 + heroValue(game, p, h) * 0.3 : -1;
      case 'sigil': {
        if (!mine) return -1;
        const cls = item.item.cls;
        if (!wouldAddClass(game, p, cls)) return -1;
        // Only good if hero's current class is duplicated elsewhere.
        const cur = game.heroClass(h);
        const dup = p.party.filter((x) => game.heroClass(x) === cur).length > 1 || p.leader.cls === cur;
        return dup ? 8 : 0.5;
      }
      default: return 0;
    }
  }

  function bestItemTarget(game, p, item) {
    let best = null; let bs = 0;
    game.itemTargets().forEach((h) => {
      const s = itemTargetScore(game, p, item, h);
      if (s > bs) { bs = s; best = h; }
    });
    return { hero: best, score: bs };
  }

  function effectScore(game, p, eff, source) {
    if (Array.isArray(eff)) return eff.reduce((s, e) => s + effectScore(game, p, e, source), 0);
    if (!game.effectViable(p, eff, source)) return 0;
    const t = topThreat(game, p);
    const tt = t ? threat(game, t) : 0;
    switch (eff.type) {
      case 'draw': return 8 * eff.n;
      case 'gain_ap': return 10 * eff.n;
      case 'destroy_hero': return 22 + tt * 1.5;
      case 'steal_hero': return 32 + tt * 1.5;
      case 'return_hero': return 16 + tt;
      case 'each_sacrifice': return 28;
      case 'pull': return 10;
      case 'peek_take': return 14;
      case 'all_discard': return 8 * eff.n;
      case 'search_discard': return 12;
      case 'seek_hero': return eff.play ? 30 : 16;
      case 'play_hero_free': return 20;
      case 'steal_item': return 9;
      case 'self_discard': return -4;
      case 'others_draw': return -3;
      default: return 2;
    }
  }

  function scoreAction(game, p, a) {
    const jitter = game.rng() * 4;
    switch (a.type) {
      case 'end': return 0.5;
      case 'redraw': return p.hand.length <= 1 && p.party.length === 0 ? 14 : 1;
      case 'draw': return (a.cost === 0 ? 30 : 12) + (p.hand.length < 3 ? 10 : 0) - p.hand.length + jitter;
      case 'attack': {
        const m = a.monster;
        const plus = bestPlusMod(p);
        const pr = probAtLeast(m.need, game.attackBonus(p) + plus * 0.8);
        if (pr < 0.42) return 0;
        const failP = 1 - probAtLeast(m.failAt + 1, game.attackBonus(p));
        const pen = m.penalty.type === 'sacrifice' ? 18 : 8;
        return 40 + pr * 70 + (p.slain.length === 2 ? 60 : 0) - failP * pen + jitter;
      }
      case 'ability': {
        const h = a.hero;
        const pr = probAtLeast(h.need, game.abilityBonus(p, h));
        const val = effectScore(game, p, h.effect, h);
        if (val <= 0 || pr < 0.2) return 0;
        return pr * val + 6 + jitter;
      }
      case 'play': {
        const c = a.card;
        if (c.kind === 'hero') {
          let s = 45;
          if (wouldAddClass(game, p, c.cls)) s += 25;
          if (game.classesOf(p).size === 5 && wouldAddClass(game, p, c.cls)) s += 100;
          // more heroes help meet monster reqs
          if (game.monsters.some((m) => !game.meetsReq(p, m))) s += 6;
          return s + jitter - (a.cost === 0 ? 0 : 0);
        }
        if (c.kind === 'magic') {
          const v = effectScore(game, p, c.effect, c);
          return v > 0 ? 18 + v * 0.8 + jitter : 0;
        }
        if (c.kind === 'item') {
          const { score } = bestItemTarget(game, p, c);
          if (score <= 0) return 0;
          return (a.cost === 0 ? 35 : 20) + score * 3 + jitter;
        }
        return 0;
      }
      default: return 0;
    }
  }

  function createAI() {
    return {
      async chooseAction(game, p, actions) {
        await game.ui.pause(650);
        let best = actions[actions.length - 1]; let bs = -Infinity;
        actions.forEach((a) => {
          const s = scoreAction(game, p, a);
          if (s > bs) { bs = s; best = a; }
        });
        if (bs < 3) return { type: 'end' };
        return best;
      },

      async chooseChallenge(game, q, p, card, extra) {
        // Always block a game-winning hero.
        if (card.kind === 'hero' && game.classesOf(p).size === 5 && !game.classesOf(p).has(card.cls)) return true;
        if (card.kind === 'item' && extra.targetOwner === q && card.cursed) return true;
        const t = topThreat(game, q);
        let prob = 0.22;
        if (t === p) prob += 0.25;
        if (card.kind === 'magic' && ['destroy_hero', 'steal_hero'].some((k) => JSON.stringify(card.effect).includes(k))) prob += 0.3;
        if (card.kind === 'hero' && game.classesOf(p).size >= 4) prob += 0.2;
        const myChals = q.hand.filter((c) => c.kind === 'challenge').length;
        prob += (myChals - 1) * 0.1;
        await game.ui.pause(250);
        return game.rng() < prob;
      },

      async chooseModifier(game, q, r, mods) {
        const total = r.total;
        const options = [];
        mods.forEach((card) => card.mods.forEach((value) => options.push({ card, value })));
        const pick = (cands, cmp) => { cands.sort(cmp); return cands[0] || null; };
        if (r.owner === q) {
          if (total >= r.need) return null;
          const up = options.filter((o) => o.value > 0 && total + o.value >= r.need);
          if (up.length) return pick(up, (a, b) => a.value - b.value);
          if (r.failAt != null && total <= r.failAt) {
            const safe = options.filter((o) => o.value > 0 && total + o.value > r.failAt);
            if (safe.length) return pick(safe, (a, b) => a.value - b.value);
          }
          return null;
        }
        // Not my roll: do I want it to fail?
        let hostile = false;
        if (r.kind === 'challenge') {
          hostile = r.target === q; // they're challenging my card
          if (!hostile && r.subject && r.target === topThreat(game, q)) return null;
        } else if (r.kind === 'attack') {
          hostile = r.owner.slain.length >= 1 || threat(game, r.owner) >= threat(game, q) || game.rng() < 0.5;
        } else if (r.kind === 'ability') {
          hostile = topThreat(game, q) === r.owner && game.rng() < 0.6;
        }
        if (!hostile || total < r.need) return null;
        const down = options.filter((o) => o.value < 0 && total + o.value < r.need);
        if (down.length) return pick(down, (a, b) => b.value - a.value);
        return null;
      },

      async chooseOption(game, p, req) {
        const opts = req.options;
        if (!opts.length) return null;
        let scorer;
        switch (req.purpose) {
          case 'destroy': case 'return': case 'steal':
            scorer = (o) => threat(game, o.owner) * 2 + heroValue(game, o.owner, o.hero)
              + (req.purpose === 'steal' && wouldAddClass(game, p, game.heroClass(o.hero)) ? 6 : 0)
              + (o.hero.item && o.hero.item.cursed ? -6 : 0);
            break;
          case 'sacrifice':
            scorer = (o) => -heroValue(game, p, o.hero);
            break;
          case 'item_target':
            scorer = (o) => itemTargetScore(game, p, req.card, o.hero);
            break;
          case 'pull_player': case 'peek_player':
            scorer = (o) => o.player.hand.length + threat(game, o.player) * 0.5;
            break;
          case 'take_card': case 'search':
            scorer = (o) => cardValue(game, p, o.card) + game.rng();
            break;
          case 'play_free':
            scorer = (o) => (wouldAddClass(game, p, o.card.cls) ? 10 : 0) + (11 - o.card.need) * 0.2;
            break;
          case 'steal_item':
            scorer = (o) => (o.hero.item.cursed ? -3 : 3) + (o.hero.item.item.kind === 'aegis' ? 2 : 0);
            break;
          default:
            scorer = () => game.rng();
        }
        let best = opts[0]; let bs = -Infinity;
        opts.forEach((o) => { const s = scorer(o); if (s > bs) { bs = s; best = o; } });
        await game.ui.pause(200);
        return best.value;
      },

      async chooseCards(game, p, req) {
        const sorted = req.cards.slice().sort((a, b) => cardValue(game, p, a) - cardValue(game, p, b));
        return sorted.slice(0, req.n);
      },
    };
  }

  G.AI = { createAI, threat };
})(typeof window !== 'undefined' ? (window.Guild = window.Guild || {}) : (globalThis.Guild = globalThis.Guild || {}));
