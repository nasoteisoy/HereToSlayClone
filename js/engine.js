/* Guildbound — rules engine. Pure game logic; talks to players through "agents"
 * (AI or human UI) and to the screen through optional ui hooks.
 */
(function (G) {
  'use strict';
  const { CLASSES, buildDeck, buildMonsters, buildLeaders } = G.Cards;

  const START_HAND = 5;
  const BASE_AP = 3;
  const MONSTERS_FACE_UP = 3;
  const SLAY_TO_WIN = 3;
  const CLASSES_TO_WIN = 6;

  // Probability that 2d6 + bonus >= need
  function probAtLeast(need, bonus) {
    let hits = 0;
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b + bonus >= need) hits++;
    return hits / 36;
  }

  class Game {
    constructor(opts) {
      this.rng = opts.rng || Math.random;
      this.ui = Object.assign({
        update() {}, log() {}, async showRoll() {}, async pause() {}, async announce() {},
      }, opts.ui || {});
      this.players = opts.players.map((p, i) => ({
        id: i, name: p.name, agent: p.agent, isHuman: !!p.isHuman,
        leader: null, party: [], hand: [], slain: [], ap: 0,
        flags: {},
      }));
      this.deck = [];
      this.discard = [];
      this.pending = []; // cards being played, awaiting challenges
      this.monsters = [];
      this.monsterDeck = [];
      this.cur = 0;
      this.turnNumber = 0;
      this.winner = null;
      this.winReason = '';
      this.logLines = [];
      this.maxTurns = opts.maxTurns || Infinity;
    }

    // ---------- utilities ----------
    rand(n) { return Math.floor(this.rng() * n); }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.rand(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    log(msg, tag) {
      const line = { msg, tag: tag || '', turn: this.turnNumber };
      this.logLines.push(line);
      if (this.logLines.length > 400) this.logLines.shift();
      this.ui.log(line);
    }
    get current() { return this.players[this.cur]; }
    others(p) {
      const out = [];
      for (let i = 1; i < this.players.length; i++) out.push(this.players[(p.id + i) % this.players.length]);
      return out;
    }

    // ---------- derived state ----------
    heroClass(h) { return h.item && h.item.item.kind === 'sigil' ? h.item.item.cls : h.cls; }
    classesOf(p) {
      const s = new Set([p.leader.cls]);
      p.party.forEach((h) => s.add(this.heroClass(h)));
      return s;
    }
    passiveCount(p, key) { return p.slain.filter((m) => m.reward === key).length; }
    hasPassive(p, key) { return this.passiveCount(p, key) > 0; }
    ownerOf(hero) { return this.players.find((p) => p.party.includes(hero)) || null; }
    hasAegis(h) { return !!(h.item && h.item.item.kind === 'aegis'); }
    canDestroy(h) { const o = this.ownerOf(h); return !this.hasAegis(h) && !(o && this.hasPassive(o, 'ward')); }
    canSteal(h) { const o = this.ownerOf(h); return !this.hasAegis(h) && !(o && this.hasPassive(o, 'no_steal')); }
    canReturn(h) { return !this.hasAegis(h); }
    isShackled(h) { return !!(h.item && h.item.item.kind === 'shackle'); }
    abilityBonus(p, h) {
      let b = this.passiveCount(p, 'ability_bonus');
      if (h.item && h.item.item.kind === 'buff') b += h.item.item.value;
      return b;
    }
    attackBonus(p) {
      return this.passiveCount(p, 'attack_bonus') + (p.leader.power === 'attack' ? 1 : 0);
    }
    challengeBonus(p) {
      return this.passiveCount(p, 'challenge_bonus') + (p.leader.power === 'challenge' ? 2 : 0);
    }
    handLimit(p) { return this.hasPassive(p, 'hand_size') ? 10 : 7; }
    meetsReq(p, m) {
      if (p.party.length < m.req.heroes) return false;
      if (m.req.cls && !p.party.some((h) => this.heroClass(h) === m.req.cls)) return false;
      return true;
    }
    drawCost(p) { return this.hasPassive(p, 'free_draw') && !p.flags.freeDrawUsed ? 0 : 1; }
    playCost(p, card) {
      if (card.kind === 'item' && p.leader.power === 'free_item' && !p.flags.freeItemUsed) return 0;
      return 1;
    }
    itemTargets() {
      const out = [];
      this.players.forEach((q) => q.party.forEach((h) => { if (!h.item) out.push(h); }));
      return out;
    }

    // ---------- setup ----------
    setup() {
      this.deck = this.shuffle(buildDeck());
      this.monsterDeck = this.shuffle(buildMonsters());
      const leaders = this.shuffle(buildLeaders());
      this.players.forEach((p, i) => {
        p.leader = leaders[i % leaders.length];
        p.hand = [];
        this.drawCards(p, START_HAND, true);
      });
      this.refillMonsters();
      this.cur = this.rand(this.players.length);
      this.log('A new adventure begins! First to slay 3 monsters, or to gather all 6 classes in their party, wins.', 'sys');
    }
    refillMonsters() {
      while (this.monsters.length < MONSTERS_FACE_UP && this.monsterDeck.length) this.monsters.push(this.monsterDeck.pop());
    }
    takeFromDeck() {
      if (!this.deck.length) {
        if (!this.discard.length) return null;
        this.deck = this.shuffle(this.discard);
        this.discard = [];
        this.log('The discard pile is shuffled into a new deck.', 'sys');
      }
      return this.deck.pop();
    }
    drawCards(p, n, quiet) {
      let got = 0;
      for (let i = 0; i < n; i++) {
        const c = this.takeFromDeck();
        if (!c) break;
        p.hand.push(c);
        got++;
      }
      if (!quiet && got) this.log(`${p.name} draws ${got} card${got > 1 ? 's' : ''}.`);
      return got;
    }
    toDiscard(card) {
      if (!card) return;
      if (card.kind === 'hero') {
        if (card.item) { this.discard.push(card.item); card.item = null; }
        card.used = false;
      }
      this.discard.push(card);
    }
    removeFromHand(p, card) {
      const i = p.hand.indexOf(card);
      if (i >= 0) p.hand.splice(i, 1);
    }
    startPending(p, card, target) { this.removeFromHand(p, card); this.pending.push({ card, by: p, target: target || null }); }
    endPending(card) { this.pending = this.pending.filter((x) => x.card !== card); }
    removeHero(hero) {
      const o = this.ownerOf(hero);
      if (o) o.party.splice(o.party.indexOf(hero), 1);
      return o;
    }
    addToParty(p, hero) {
      hero.item = hero.item || null;
      hero.used = false;
      p.party.push(hero);
      this.checkWin();
    }

    checkWin() {
      if (this.winner) return true;
      const order = [this.current, ...this.others(this.current)];
      for (const p of order) {
        if (p.slain.length >= SLAY_TO_WIN) { this.winner = p; this.winReason = `slew ${SLAY_TO_WIN} monsters`; break; }
        if (this.classesOf(p).size >= CLASSES_TO_WIN) { this.winner = p; this.winReason = `united all ${CLASSES_TO_WIN} classes`; break; }
      }
      if (this.winner) this.log(`🏆 ${this.winner.name} ${this.winReason} and wins the game!`, 'win');
      return !!this.winner;
    }

    // ---------- main loop ----------
    async play() {
      this.setup();
      this.ui.update();
      while (!this.winner && this.turnNumber < this.maxTurns) {
        await this.takeTurn();
        if (this.winner) break;
        this.cur = (this.cur + 1) % this.players.length;
      }
      this.ui.update();
      return this.winner;
    }

    async takeTurn() {
      const p = this.current;
      this.turnNumber++;
      p.ap = BASE_AP + this.passiveCount(p, 'extra_ap');
      p.flags = {};
      p.party.forEach((h) => { h.used = false; });
      this.log(`— ${p.name}'s turn —`, 'turn');
      const extra = (p.leader.power === 'turn_draw' ? 1 : 0) + this.passiveCount(p, 'turn_draw');
      if (extra) this.drawCards(p, extra);
      this.ui.update();
      await this.ui.announce(p);

      let guard = 0;
      while (!this.winner && guard++ < 40) {
        const actions = this.legalActions(p);
        if (actions.length <= 1) break; // only "end"
        const a = await p.agent.chooseAction(this, p, actions);
        if (!a || a.type === 'end') break;
        await this.perform(p, a);
        this.ui.update();
      }
      if (this.winner) return;
      await this.enforceHandLimit(p);
      this.ui.update();
    }

    legalActions(p) {
      const acts = [];
      const dc = this.drawCost(p);
      if (p.ap >= dc && (this.deck.length || this.discard.length)) acts.push({ type: 'draw', cost: dc });
      p.hand.forEach((card) => {
        if (card.kind === 'modifier' || card.kind === 'challenge') return;
        const cost = this.playCost(p, card);
        if (p.ap < cost) return;
        if (card.kind === 'item' && !this.itemTargets().length) return;
        if (card.kind === 'magic' && !this.effectViable(p, card.effect, card)) return;
        acts.push({ type: 'play', card, cost });
      });
      if (p.ap >= 1) {
        p.party.forEach((h) => {
          if (!h.used && !this.isShackled(h)) acts.push({ type: 'ability', hero: h, cost: 1 });
        });
      }
      if (p.ap >= 2) {
        this.monsters.forEach((m) => { if (this.meetsReq(p, m)) acts.push({ type: 'attack', monster: m, cost: 2 }); });
      }
      if (p.ap >= 3) acts.push({ type: 'redraw', cost: 3 });
      acts.push({ type: 'end', cost: 0 });
      return acts;
    }

    async perform(p, a) {
      switch (a.type) {
        case 'draw':
          p.ap -= a.cost;
          if (a.cost === 0) p.flags.freeDrawUsed = true;
          this.drawCards(p, 1);
          break;
        case 'play':
          if (a.card.kind === 'hero') await this.playHero(p, a.card, false);
          else if (a.card.kind === 'item') await this.playItem(p, a.card);
          else if (a.card.kind === 'magic') await this.playMagic(p, a.card);
          break;
        case 'ability':
          await this.useAbility(p, a.hero, false);
          break;
        case 'attack':
          await this.attack(p, a.monster);
          break;
        case 'redraw': {
          p.ap -= 3;
          const n = p.hand.length;
          p.hand.splice(0).forEach((c) => this.discard.push(c));
          this.log(`${p.name} discards their hand (${n}) and draws 5 fresh cards.`);
          this.drawCards(p, 5, true);
          break;
        }
      }
      this.checkWin();
    }

    // ---------- rolling ----------
    async roll(owner, opts) {
      const dice = [1 + this.rand(6), 1 + this.rand(6)];
      const r = {
        owner, dice, bonus: opts.bonus || 0, mods: [], need: opts.need, failAt: opts.failAt,
        kind: opts.kind, label: opts.label, target: opts.target || null, subject: opts.subject || null,
        get total() { return this.dice[0] + this.dice[1] + this.bonus + this.mods.reduce((s, m) => s + m.value, 0); },
        get success() { return this.total >= this.need; },
        stage: 'rolled',
      };
      this.ui.update();
      await this.ui.showRoll(r);
      await this.modifierWindow(r);
      r.stage = 'final';
      await this.ui.showRoll(r);
      const bonusTxt = r.bonus ? ` ${r.bonus > 0 ? '+' : ''}${r.bonus}` : '';
      const modTxt = r.mods.map((m) => ` ${m.value > 0 ? '+' : ''}${m.value}`).join('');
      this.log(`🎲 ${owner.name} rolls ${dice[0]}+${dice[1]}${bonusTxt}${modTxt} = ${r.total} for ${r.label} (needs ${r.need}+) — ${r.success ? 'success!' : 'failed.'}`, r.success ? 'good' : 'bad');
      return r;
    }

    async modifierWindow(r) {
      const n = this.players.length;
      let passes = 0;
      let i = r.owner.id;
      let guard = 0;
      while (passes < n && guard++ < 60) {
        const q = this.players[i];
        const mods = q.hand.filter((c) => c.kind === 'modifier');
        if (mods.length) {
          const choice = await q.agent.chooseModifier(this, q, r, mods);
          if (choice && q.hand.includes(choice.card) && choice.card.mods.includes(choice.value)) {
            this.removeFromHand(q, choice.card);
            this.discard.push(choice.card);
            r.mods.push({ by: q, value: choice.value });
            this.log(`${q.name} plays a modifier: ${choice.value > 0 ? '+' : ''}${choice.value} (now ${r.total}).`, 'mod');
            this.ui.update();
            await this.ui.showRoll(r);
            passes = 0;
            i = (i + 1) % n;
            continue;
          }
        }
        passes++;
        i = (i + 1) % n;
      }
    }

    // Returns true if the card was cancelled.
    async challengeWindow(p, card, extra) {
      for (const q of this.others(p)) {
        const chal = q.hand.find((c) => c.kind === 'challenge');
        if (!chal) continue;
        const want = await q.agent.chooseChallenge(this, q, p, card, extra || {});
        if (!want) continue;
        this.removeFromHand(q, chal);
        this.discard.push(chal);
        this.log(`⚡ ${q.name} challenges ${p.name}'s ${card.name}!`, 'challenge');
        const need = 7 + this.challengeBonus(p);
        const r = await this.roll(q, {
          kind: 'challenge', label: `a challenge against ${card.name}`, need,
          bonus: this.challengeBonus(q), target: p, subject: card,
        });
        if (r.success) {
          this.log(`${card.name} is cancelled!`, 'bad');
          return true;
        }
        this.log(`The challenge fails — ${card.name} resolves.`);
        return false;
      }
      return false;
    }

    // ---------- card plays ----------
    async playHero(p, card, free) {
      if (!free) p.ap -= this.playCost(p, card);
      this.startPending(p, card);
      this.log(`${p.name} plays the hero ${card.name} (${CLASSES[card.cls].name}).`);
      this.ui.update();
      const cancelled = await this.challengeWindow(p, card);
      this.endPending(card);
      if (cancelled) { this.toDiscard(card); return; }
      this.addToParty(p, card);
      this.ui.update();
      if (this.winner) return;
      if (this.effectViable(p, card.effect, card)) {
        this.log(`${card.name} gets a free ability roll on entering the party.`);
        await this.useAbility(p, card, true);
      } else {
        card.used = true;
      }
    }

    async playItem(p, card) {
      const cost = this.playCost(p, card);
      p.ap -= cost;
      if (cost === 0 && p.leader.power === 'free_item') p.flags.freeItemUsed = true;
      this.startPending(p, card);
      const targets = this.itemTargets();
      if (!targets.length) { this.endPending(card); this.toDiscard(card); return; }
      const target = await p.agent.chooseOption(this, p, {
        purpose: 'item_target', card, prompt: `Equip ${card.name} to which hero?`,
        options: targets.map((h) => ({ value: h, hero: h, owner: this.ownerOf(h), label: `${h.name} (${this.ownerOf(h).name})` })),
      });
      const tOwner = this.ownerOf(target);
      this.log(`${p.name} plays ${card.name} on ${target.name}${tOwner !== p ? ` (${tOwner.name}'s party)` : ''}.`);
      this.pending.forEach((x) => { if (x.card === card) x.target = target; });
      this.ui.update();
      const cancelled = await this.challengeWindow(p, card, { target, targetOwner: tOwner });
      this.endPending(card);
      if (cancelled) { this.toDiscard(card); return; }
      if (this.ownerOf(target) && !target.item) {
        target.item = card;
        this.checkWin();
      } else {
        this.log(`${target.name} is no longer a valid target; ${card.name} is discarded.`);
        this.toDiscard(card);
      }
    }

    async playMagic(p, card) {
      p.ap -= 1;
      this.startPending(p, card);
      this.log(`${p.name} casts ${card.name}: ${card.text}`);
      this.ui.update();
      const cancelled = await this.challengeWindow(p, card);
      this.endPending(card);
      this.discard.push(card);
      if (cancelled) return;
      await this.runEffect(p, card.effect, card);
      if (!this.winner && p.leader.power === 'magic_draw') this.drawCards(p, 1);
    }

    async useAbility(p, hero, free) {
      if (!free) p.ap -= 1;
      hero.used = true;
      const r = await this.roll(p, {
        kind: 'ability', label: `${hero.name}'s ability`, need: hero.need,
        bonus: this.abilityBonus(p, hero), subject: hero,
      });
      if (r.success) {
        this.log(`✨ ${hero.name}: ${hero.text}`, 'good');
        await this.runEffect(p, hero.effect, hero);
      }
    }

    async attack(p, m) {
      p.ap -= 2;
      this.log(`⚔ ${p.name} attacks ${m.name}!`, 'attack');
      const r = await this.roll(p, {
        kind: 'attack', label: `slaying ${m.name}`, need: m.need, failAt: m.failAt,
        bonus: this.attackBonus(p), subject: m,
      });
      if (r.success) {
        this.monsters.splice(this.monsters.indexOf(m), 1);
        p.slain.push(m);
        this.log(`💀 ${p.name} slays ${m.name}! New power: ${G.Cards.PASSIVES[m.reward]}`, 'win-small');
        this.refillMonsters();
        this.checkWin();
      } else if (r.total <= m.failAt) {
        if (p.leader.power === 'no_penalty') {
          this.log(`${p.leader.name} shrugs off ${m.name}'s counterattack.`);
        } else {
          await this.applyPenalty(p, m);
        }
      }
    }

    async applyPenalty(p, m) {
      const pen = m.penalty;
      if (pen.type === 'discard') {
        this.log(`${m.name} strikes back: ${p.name} must discard ${pen.n}.`, 'bad');
        await this.forceDiscard(p, pen.n, `${m.name}: discard ${pen.n} card(s)`);
      } else if (pen.type === 'sacrifice') {
        this.log(`${m.name} strikes back: ${p.name} must sacrifice a hero.`, 'bad');
        await this.forceSacrifice(p);
      } else if (pen.type === 'lose_turn') {
        this.log(`${m.name} strikes back: ${p.name} loses the rest of their turn.`, 'bad');
        p.ap = 0;
      }
    }

    async forceDiscard(p, n, prompt) {
      n = Math.min(n, p.hand.length);
      if (n <= 0) return;
      const cards = await p.agent.chooseCards(this, p, { purpose: 'discard', n, cards: p.hand.slice(), prompt: prompt || `Discard ${n} card(s)` });
      const chosen = (cards || []).filter((c) => p.hand.includes(c)).slice(0, n);
      while (chosen.length < n) { const c = p.hand.find((x) => !chosen.includes(x)); chosen.push(c); }
      chosen.forEach((c) => { this.removeFromHand(p, c); this.discard.push(c); });
      this.log(`${p.name} discards ${chosen.map((c) => c.name).join(', ')}.`);
    }

    async forceSacrifice(p) {
      if (!p.party.length) { this.log(`${p.name} has no heroes to sacrifice.`); return; }
      const h = await p.agent.chooseOption(this, p, {
        purpose: 'sacrifice', prompt: 'Choose a hero to sacrifice',
        options: p.party.map((x) => ({ value: x, hero: x, owner: p, label: x.name })),
      });
      this.removeHero(h);
      this.toDiscard(h);
      this.log(`${p.name} sacrifices ${h.name}.`, 'bad');
    }

    async enforceHandLimit(p) {
      const lim = this.handLimit(p);
      if (p.hand.length > lim) await this.forceDiscard(p, p.hand.length - lim, `Hand limit is ${lim}: discard ${p.hand.length - lim}`);
    }

    // ---------- effects ----------
    oppHeroes(p, filter) {
      const out = [];
      this.others(p).forEach((q) => q.party.forEach((h) => { if (!filter || filter(h)) out.push(h); }));
      return out;
    }
    heroOptions(list) {
      return list.map((h) => ({ value: h, hero: h, owner: this.ownerOf(h), label: `${h.name} (${this.ownerOf(h).name})` }));
    }

    effectViable(p, eff, source) {
      if (Array.isArray(eff)) return eff.some((e) => this.effectViable(p, e, source));
      switch (eff.type) {
        case 'destroy_hero': return this.oppHeroes(p, (h) => this.canDestroy(h)).length > 0;
        case 'steal_hero': return this.oppHeroes(p, (h) => this.canSteal(h)).length > 0;
        case 'return_hero': return this.oppHeroes(p, (h) => this.canReturn(h)).length > 0;
        case 'each_sacrifice': return this.oppHeroes(p).length > 0;
        case 'pull': case 'peek_take': case 'all_discard':
          return this.others(p).some((q) => q.hand.length > 0);
        case 'search_discard': return this.discard.some((c) => !eff.kind || c.kind === eff.kind);
        case 'play_hero_free': return p.hand.some((c) => c.kind === 'hero' && c !== source);
        case 'seek_hero': return this.deck.some((c) => c.kind === 'hero') || this.discard.some((c) => c.kind === 'hero');
        case 'steal_item': return this.oppHeroes(p, (h) => !!h.item).length > 0;
        case 'draw': return this.deck.length + this.discard.length > 0;
        default: return true;
      }
    }

    async runEffect(p, eff, source) {
      if (Array.isArray(eff)) {
        for (const e of eff) { if (this.winner) return; await this.runEffect(p, e, source); this.ui.update(); }
        return;
      }
      if (this.winner) return;
      const fizzle = () => this.log(`…but there is nothing to affect.`);
      switch (eff.type) {
        case 'draw': this.drawCards(p, eff.n); break;
        case 'gain_ap': p.ap += eff.n; this.log(`${p.name} gains ${eff.n} action point${eff.n > 1 ? 's' : ''}.`); break;
        case 'destroy_hero': {
          const list = this.oppHeroes(p, (h) => this.canDestroy(h));
          if (!list.length) return fizzle();
          const h = await p.agent.chooseOption(this, p, { purpose: 'destroy', prompt: 'Destroy which hero?', options: this.heroOptions(list) });
          const o = this.removeHero(h);
          this.toDiscard(h);
          this.log(`🔥 ${p.name} destroys ${o.name}'s ${h.name}.`, 'bad');
          break;
        }
        case 'steal_hero': {
          const list = this.oppHeroes(p, (h) => this.canSteal(h));
          if (!list.length) return fizzle();
          const h = await p.agent.chooseOption(this, p, { purpose: 'steal', prompt: 'Steal which hero?', options: this.heroOptions(list) });
          const o = this.removeHero(h);
          p.party.push(h);
          this.log(`🫳 ${p.name} steals ${h.name} from ${o.name}.`, 'bad');
          this.checkWin();
          break;
        }
        case 'return_hero': {
          const list = this.oppHeroes(p, (h) => this.canReturn(h));
          if (!list.length) return fizzle();
          const h = await p.agent.chooseOption(this, p, { purpose: 'return', prompt: "Return which hero to its owner's hand?", options: this.heroOptions(list) });
          const o = this.removeHero(h);
          if (h.item) { this.discard.push(h.item); h.item = null; }
          h.used = false;
          o.hand.push(h);
          this.log(`↩ ${h.name} returns to ${o.name}'s hand.`);
          break;
        }
        case 'each_sacrifice':
          for (const q of this.others(p)) { if (q.party.length) await this.forceSacrifice(q); }
          break;
        case 'pull': {
          const opts = this.others(p).filter((q) => q.hand.length);
          if (!opts.length) return fizzle();
          const q = await p.agent.chooseOption(this, p, { purpose: 'pull_player', prompt: 'Pull a random card from whom?', options: opts.map((x) => ({ value: x, player: x, label: `${x.name} (${x.hand.length} cards)` })) });
          const c = q.hand[this.rand(q.hand.length)];
          this.removeFromHand(q, c);
          p.hand.push(c);
          this.log(`${p.name} pulls a card from ${q.name}.`);
          break;
        }
        case 'peek_take': {
          const opts = this.others(p).filter((q) => q.hand.length);
          if (!opts.length) return fizzle();
          const q = await p.agent.chooseOption(this, p, { purpose: 'peek_player', prompt: 'Look at whose hand?', options: opts.map((x) => ({ value: x, player: x, label: `${x.name} (${x.hand.length} cards)` })) });
          const c = await p.agent.chooseOption(this, p, { purpose: 'take_card', prompt: `Take a card from ${q.name}'s hand`, options: q.hand.map((x) => ({ value: x, card: x, label: x.name })) });
          this.removeFromHand(q, c);
          p.hand.push(c);
          this.log(`${p.name} looks at ${q.name}'s hand and takes a card.`);
          break;
        }
        case 'all_discard':
          for (const q of this.others(p)) await this.forceDiscard(q, eff.n);
          break;
        case 'self_discard':
          await this.forceDiscard(p, eff.n);
          break;
        case 'others_draw':
          this.others(p).forEach((q) => this.drawCards(q, eff.n));
          break;
        case 'search_discard': {
          const list = this.discard.filter((c) => !eff.kind || c.kind === eff.kind);
          if (!list.length) return fizzle();
          const c = await p.agent.chooseOption(this, p, { purpose: 'search', prompt: `Take a${eff.kind ? 'n ' + eff.kind : ' card'} from the discard pile`, options: list.map((x) => ({ value: x, card: x, label: x.name })) });
          this.discard.splice(this.discard.indexOf(c), 1);
          if (eff.play && c.kind === 'hero') {
            this.log(`${p.name} recruits ${c.name} from the discard pile straight into their party.`);
            this.addToParty(p, c);
            c.used = true;
          } else {
            p.hand.push(c);
            this.log(`${p.name} takes ${c.name} from the discard pile.`);
          }
          break;
        }
        case 'seek_hero': {
          let found = null;
          let revealed = 0;
          let guard = 0;
          while (!found && guard++ < 200) {
            const c = this.takeFromDeck();
            if (!c) break;
            if (c.kind === 'hero') found = c; else { this.discard.push(c); revealed++; }
          }
          if (!found) return fizzle();
          if (eff.play) {
            this.log(`${p.name} reveals ${revealed} card(s) and finds ${found.name}, who joins the party!`);
            this.addToParty(p, found);
            found.used = true;
          } else {
            this.log(`${p.name} reveals ${revealed} card(s) and takes ${found.name} into hand.`);
            p.hand.push(found);
          }
          break;
        }
        case 'play_hero_free': {
          const list = p.hand.filter((c) => c.kind === 'hero' && c !== source);
          if (!list.length) return fizzle();
          const c = await p.agent.chooseOption(this, p, { purpose: 'play_free', prompt: 'Play which hero for free?', options: list.map((x) => ({ value: x, card: x, label: x.name })) });
          await this.playHero(p, c, true);
          break;
        }
        case 'steal_item': {
          const list = this.oppHeroes(p, (h) => !!h.item);
          if (!list.length) return fizzle();
          const h = await p.agent.chooseOption(this, p, { purpose: 'steal_item', prompt: 'Take an item from which hero? (it goes to your hand)', options: list.map((x) => ({ value: x, hero: x, owner: this.ownerOf(x), label: `${x.item.name} on ${x.name}` })) });
          const it = h.item;
          h.item = null;
          p.hand.push(it);
          this.log(`${p.name} takes ${it.name} from ${h.name}.`);
          break;
        }
        default:
          this.log(`(unknown effect ${eff.type})`);
      }
    }
  }

  G.Engine = { Game, probAtLeast, START_HAND, BASE_AP, SLAY_TO_WIN, CLASSES_TO_WIN };
})(typeof window !== 'undefined' ? (window.Guild = window.Guild || {}) : (globalThis.Guild = globalThis.Guild || {}));
