/* Guildbound — browser UI and human agent. */
(function (G) {
  'use strict';
  const { CLASSES, CLASS_KEYS, PASSIVES } = G.Cards;
  const $ = (id) => document.getElementById(id);

  let game = null;
  let token = 0;
  let speed = 1;
  let modPref = 'smart';

  class Aborted extends Error {}
  function sleep(ms, tk) {
    return new Promise((res, rej) => setTimeout(() => (tk !== token ? rej(new Aborted()) : res()), ms * speed));
  }
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const signed = (v) => (v > 0 ? '+' + v : String(v));

  // ---------------- card rendering ----------------
  function cardTitle(card) {
    switch (card.kind) {
      case 'hero': return `${card.name} — ${CLASSES[card.cls].name} hero. Roll ${card.need}+: ${card.text}`;
      case 'monster': return `${card.name}: ${reqText(card)}. Slay on ${card.need}+, fails on ${card.failAt}-. Reward: ${PASSIVES[card.reward]}`;
      case 'leader': return `${card.name} — ${CLASSES[card.cls].name} leader. ${card.text}`;
      default: return `${card.name}: ${card.text}`;
    }
  }
  function reqText(m) {
    let t = `${m.req.heroes}+ hero${m.req.heroes > 1 ? 'es' : ''}`;
    if (m.req.cls) t += `, incl. ${CLASSES[m.req.cls].icon} ${CLASSES[m.req.cls].name}`;
    return t;
  }
  function penaltyText(p) {
    if (p.type === 'discard') return `Discard ${p.n}`;
    if (p.type === 'sacrifice') return 'Sacrifice a hero';
    return 'Lose the rest of your turn';
  }

  function renderCard(card, opts) {
    opts = opts || {};
    const size = opts.size || 'md';
    const d = el('div', `card ${card.kind} ${size}`);
    d.title = cardTitle(card);
    if (card.kind === 'hero' || card.kind === 'leader') {
      const cls = game ? game.heroClass(card) : card.cls;
      const C = CLASSES[card.kind === 'leader' ? card.cls : cls];
      d.style.setProperty('--cc', C.color);
      d.classList.add('cls');
      const top = card.kind === 'leader' ? 'Leader' : C.name;
      d.innerHTML = `
        <div class="c-top"><span class="c-icon">${C.icon}</span><span class="c-type">${top}</span>${card.kind === 'hero' ? `<span class="c-need">${card.need}+</span>` : ''}</div>
        <div class="c-art"><span>${C.icon}</span></div>
        <div class="c-name">${esc(card.name)}</div>
        <div class="c-text">${esc(card.text)}</div>`;
      if (card.kind === 'hero' && card.item) {
        const it = el('div', 'c-item' + (card.item.cursed ? ' cursed' : ''), esc(card.item.name));
        it.title = card.item.text;
        d.appendChild(it);
      }
      if (card.kind === 'hero' && card.used && opts.inParty) d.classList.add('used');
    } else if (card.kind === 'monster') {
      d.innerHTML = `
        <div class="c-top"><span class="c-icon">☠</span><span class="c-type">Monster</span><span class="c-need">${card.need}+</span></div>
        <div class="c-name">${esc(card.name)}</div>
        <div class="c-req">Needs ${reqText(card)}</div>
        <div class="c-text"><b>Fail ≤${card.failAt}:</b> ${penaltyText(card.penalty)}</div>
        <div class="c-reward">${esc(PASSIVES[card.reward])}</div>`;
    } else if (card.kind === 'modifier') {
      d.innerHTML = `
        <div class="c-top"><span class="c-icon">±</span><span class="c-type">Modifier</span></div>
        <div class="c-mods">${card.mods.map((v) => `<span class="${v > 0 ? 'plus' : 'minus'}">${signed(v)}</span>`).join('')}</div>
        <div class="c-text">${esc(card.text)}</div>`;
    } else if (card.kind === 'challenge') {
      d.innerHTML = `
        <div class="c-top"><span class="c-icon">⚡</span><span class="c-type">Challenge</span></div>
        <div class="c-big">⚡</div>
        <div class="c-name">${esc(card.name)}</div>
        <div class="c-text">${esc(card.text)}</div>`;
    } else {
      const icon = card.kind === 'item' ? (card.cursed ? '☣' : '⚜') : '✺';
      if (card.cursed) d.classList.add('cursed');
      if (card.kind === 'item' && card.item.kind === 'sigil') d.style.setProperty('--cc', CLASSES[card.item.cls].color);
      d.innerHTML = `
        <div class="c-top"><span class="c-icon">${icon}</span><span class="c-type">${card.kind === 'item' ? (card.cursed ? 'Cursed item' : 'Item') : 'Magic'}</span></div>
        <div class="c-big">${card.kind === 'item' && card.item.kind === 'sigil' ? CLASSES[card.item.cls].icon : icon}</div>
        <div class="c-name">${esc(card.name)}</div>
        <div class="c-text">${esc(card.text)}</div>`;
    }
    if (opts.onClick) {
      d.classList.add('clickable');
      d.addEventListener('click', opts.onClick);
    }
    if (opts.playable) d.classList.add('playable');
    return d;
  }

  function classDots(p) {
    const have = game.classesOf(p);
    return `<span class="dots">${CLASS_KEYS.map((k) =>
      `<span class="dot ${have.has(k) ? 'on' : ''}" style="--cc:${CLASSES[k].color}" title="${CLASSES[k].name}">${CLASSES[k].icon}</span>`).join('')}</span>`;
  }
  function slainChips(p) {
    if (!p.slain.length) return '<span class="muted">No monsters slain</span>';
    return p.slain.map((m) => `<span class="chip slain" title="${esc(PASSIVES[m.reward])}">☠ ${esc(m.name)}</span>`).join(' ');
  }

  // ---------------- human agent ----------------
  const human = {
    pendingAction: null,
    chooseAction(g, p, actions) {
      return new Promise((resolve) => { human.pendingAction = { actions, resolve }; renderAll(); });
    },
    async chooseChallenge(g, q, p, card, extra) {
      const target = extra.target ? ` on <b>${esc(extra.target.name)}</b>${extra.targetOwner === q ? ' (your hero!)' : ''}` : '';
      const need = 7 + g.challengeBonus(p);
      const bonus = g.challengeBonus(q);
      const body = el('div', 'center');
      body.innerHTML = `<p>${esc(p.name)} plays <b>${esc(card.name)}</b>${target}.</p>`;
      body.appendChild(renderCard(card));
      body.appendChild(el('p', 'muted', `Spend an Objection! card? You'll need to roll ${need}+${bonus ? ` (you get ${signed(bonus)})` : ''} to cancel it.`));
      return modal({ title: 'Challenge?', body, buttons: [
        { label: 'Let it be', value: false },
        { label: '⚡ Challenge!', value: true, primary: true },
      ] });
    },
    async chooseModifier(g, q, r, mods) {
      if (modPref === 'never') return null;
      const options = [];
      mods.forEach((card) => card.mods.forEach((value) => options.push({ card, value })));
      if (modPref === 'smart') {
        const flips = options.some((o) => (r.total >= r.need) !== (r.total + o.value >= r.need));
        if (!flips) return null;
      }
      const yours = r.owner === q;
      const body = el('div');
      body.innerHTML = `<p><b>${yours ? 'Your' : esc(r.owner.name) + "'s"}</b> roll for ${esc(r.label)}: currently <b>${r.total}</b>, needs <b>${r.need}+</b>
        — ${r.success ? '<span class="good">succeeding</span>' : '<span class="bad">failing</span>'}.</p>`;
      const row = el('div', 'row wrap center');
      const done = new Promise((resolve) => {
        options.forEach((o) => {
          const b = el('button', 'modbtn ' + (o.value > 0 ? 'plus' : 'minus'), `${signed(o.value)} <small>→ ${r.total + o.value}</small>`);
          b.onclick = () => { closeModal(); resolve(o); };
          row.appendChild(b);
        });
        body.appendChild(row);
        showModal({ title: 'Play a modifier?', body, buttons: [{ label: 'Pass', value: null }], onButton: (v) => resolve(v), low: true });
      });
      return done;
    },
    async chooseOption(g, p, req) {
      const body = el('div', 'row wrap center options');
      const done = new Promise((resolve) => {
        req.options.forEach((o) => {
          let node;
          if (o.hero) {
            node = el('div', 'opt');
            node.appendChild(renderCard(o.hero, { size: 'sm', inParty: true }));
            node.appendChild(el('div', 'opt-owner', esc(o.owner ? o.owner.name : '')));
          } else if (o.card) {
            node = renderCard(o.card, { size: 'sm' });
          } else {
            node = el('button', 'optbtn', esc(o.label));
          }
          node.classList.add('clickable');
          node.addEventListener('click', () => { closeModal(); resolve(o.value); });
          body.appendChild(node);
        });
        showModal({ title: req.prompt, body, buttons: [] });
      });
      return done;
    },
    async chooseCards(g, p, req) {
      const picked = new Set();
      const body = el('div');
      const row = el('div', 'row wrap center options');
      body.appendChild(row);
      const done = new Promise((resolve) => {
        let confirmBtn;
        req.cards.forEach((c) => {
          const node = renderCard(c, { size: 'sm' });
          node.classList.add('clickable');
          node.addEventListener('click', () => {
            if (picked.has(c)) picked.delete(c);
            else if (picked.size < req.n) picked.add(c);
            node.classList.toggle('picked', picked.has(c));
            confirmBtn.disabled = picked.size !== req.n;
            confirmBtn.textContent = `Discard (${picked.size}/${req.n})`;
          });
          row.appendChild(node);
        });
        showModal({ title: req.prompt, body, buttons: [{ label: `Discard (0/${req.n})`, value: 'ok', primary: true, disabled: true }],
          onButton: () => resolve([...picked]) });
        confirmBtn = $('modal-actions').querySelector('button');
      });
      return done;
    },
  };

  function act(match) {
    const pa = human.pendingAction;
    if (!pa) return;
    const a = pa.actions.find(match);
    if (!a) return;
    human.pendingAction = null;
    pa.resolve(a);
    renderAll();
  }

  // ---------------- modal ----------------
  let modalHandler = null;
  function showModal({ title, body, buttons, onButton, low }) {
    $('modal-title').textContent = title || '';
    const b = $('modal-body');
    b.innerHTML = '';
    if (body) b.appendChild(typeof body === 'string' ? el('div', null, body) : body);
    const acts = $('modal-actions');
    acts.innerHTML = '';
    modalHandler = onButton || null;
    (buttons || []).forEach((bt) => {
      const btn = el('button', bt.primary ? 'primary' : '', esc(bt.label));
      btn.disabled = !!bt.disabled;
      btn.onclick = () => { closeModal(); if (onButton) onButton(bt.value); };
      acts.appendChild(btn);
    });
    $('modal').classList.toggle('low', !!low);
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; modalHandler = null; }
  function modal(opts) {
    return new Promise((resolve) => showModal(Object.assign({}, opts, { onButton: resolve })));
  }

  // ---------------- dice ----------------
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function drawDie(node, v) {
    node.innerHTML = '';
    for (let i = 0; i < 9; i++) node.appendChild(el('span', PIPS[v].includes(i) ? 'pip' : ''));
  }
  async function showRoll(r, tk) {
    const box = $('roll');
    if (r.stage === 'rolled') {
      box.hidden = false;
      box.className = '';
      $('roll-label').textContent = `${r.owner.name} — ${r.label}`;
      $('roll-result').textContent = '';
      $('roll-math').textContent = '';
      box.classList.add('tumbling');
      for (let i = 0; i < 7; i++) {
        drawDie($('die1'), 1 + Math.floor(Math.random() * 6));
        drawDie($('die2'), 1 + Math.floor(Math.random() * 6));
        await sleep(70, tk);
      }
      box.classList.remove('tumbling');
      drawDie($('die1'), r.dice[0]);
      drawDie($('die2'), r.dice[1]);
    }
    const parts = [`${r.dice[0]} + ${r.dice[1]}`];
    if (r.bonus) parts.push(`<span class="${r.bonus > 0 ? 'good' : 'bad'}">${signed(r.bonus)} bonus</span>`);
    r.mods.forEach((m) => parts.push(`<span class="${m.value > 0 ? 'good' : 'bad'}">${signed(m.value)} (${esc(m.by.name)})</span>`));
    $('roll-math').innerHTML = `${parts.join(' ')} = <b>${r.total}</b> <span class="muted">· needs ${r.need}+</span>`;
    if (r.stage === 'final') {
      box.classList.add(r.success ? 'win' : 'lose');
      $('roll-result').textContent = r.success ? 'Success!' : (r.failAt != null && r.total <= r.failAt ? 'Disaster!' : 'Failed');
      await sleep(1100, tk);
      box.hidden = true;
    } else {
      await sleep(r.mods.length ? 700 : 450, tk);
    }
  }

  // ---------------- rendering ----------------
  function renderAll() {
    if (!game) return;
    const me = game.players[0];
    const pa = human.pendingAction;
    const acts = pa ? pa.actions : [];

    // opponents
    const opp = $('opponents');
    opp.innerHTML = '';
    game.players.slice(1).forEach((q) => {
      const box = el('div', 'opp' + (game.current === q && !game.winner ? ' active' : ''));
      box.innerHTML = `
        <div class="opp-head">
          <div><b>${esc(q.name)}</b> ${game.current === q && !game.winner ? `<span class="ap-mini">${q.ap} AP</span>` : ''}</div>
          <div class="muted">🂠 ${q.hand.length}</div>
        </div>
        <div class="opp-dots">${classDots(q)}</div>
        <div class="opp-slain">${slainChips(q)}</div>`;
      const row = el('div', 'row opp-party');
      row.appendChild(renderCard(q.leader, { size: 'xs' }));
      q.party.forEach((h) => row.appendChild(renderCard(h, { size: 'xs', inParty: true })));
      box.appendChild(row);
      opp.appendChild(box);
    });

    // monsters
    const mon = $('monsters');
    mon.innerHTML = '';
    game.monsters.forEach((m) => {
      const a = acts.find((x) => x.type === 'attack' && x.monster === m);
      const node = renderCard(m, { onClick: a ? () => act((x) => x === a) : null, playable: !!a });
      if (!game.meetsReq(me, m)) node.classList.add('locked');
      mon.appendChild(node);
    });
    $('deck-count').textContent = `Deck ${game.deck.length}`;
    $('discard-count').textContent = `Discard ${game.discard.length}`;
    const dt = $('discard-top');
    dt.innerHTML = '';
    if (game.discard.length) dt.appendChild(renderCard(game.discard[game.discard.length - 1], { size: 'sm' }));
    else dt.appendChild(el('div', 'card sm empty', ''));
    const pend = $('pending');
    pend.innerHTML = '';
    game.pending.forEach((x) => {
      const w = el('div', 'pending-card');
      w.appendChild(el('div', 'muted', `${esc(x.by.name)} plays${x.target ? ' on ' + esc(x.target.name) : ''}…`));
      w.appendChild(renderCard(x.card, { size: 'sm' }));
      pend.appendChild(w);
    });

    // me
    const mine = game.current === me && !game.winner;
    $('me').classList.toggle('active', mine);
    $('me-info').innerHTML = `<b>${esc(me.name)}</b> ${classDots(me)} <span class="slain-row">${slainChips(me)}</span>`;
    const ap = $('ap');
    ap.innerHTML = '';
    const apMax = Math.max(me.ap, 3);
    for (let i = 0; i < apMax; i++) ap.appendChild(el('span', 'ap-pip' + (mine && i < me.ap ? ' on' : '')));
    $('me-leader').innerHTML = '';
    $('me-leader').appendChild(renderCard(me.leader));
    const party = $('me-party');
    party.innerHTML = '';
    if (!me.party.length) party.appendChild(el('div', 'empty-party muted', 'Your party is empty — play Hero cards to recruit.'));
    me.party.forEach((h) => {
      const a = acts.find((x) => x.type === 'ability' && x.hero === h);
      const node = renderCard(h, { inParty: true, onClick: a ? () => act((x) => x === a) : null, playable: !!a });
      if (a) node.title = `Roll ${h.need}+ (1 AP) — ${h.text}`;
      party.appendChild(node);
    });
    const hand = $('hand');
    hand.innerHTML = '';
    me.hand.forEach((c) => {
      const a = acts.find((x) => x.type === 'play' && x.card === c);
      hand.appendChild(renderCard(c, { onClick: a ? () => act((x) => x === a) : null, playable: !!a }));
    });
    const draw = acts.find((x) => x.type === 'draw');
    $('btn-draw').disabled = !draw;
    $('btn-draw').querySelector('em').textContent = draw && draw.cost === 0 ? 'free' : '1 AP';
    $('btn-redraw').disabled = !acts.find((x) => x.type === 'redraw');
    $('btn-end').disabled = !pa;

    let hint = '';
    if (game.winner) hint = `${game.winner.name} ${game.winReason}.`;
    else if (pa) hint = `Your move — <b>${me.ap} AP</b> left. Click a glowing card in your hand to play it, a glowing hero to roll for its ability, or a glowing monster to attack.`;
    else if (mine) hint = 'Resolving…';
    else hint = `Waiting for ${esc(game.current.name)}…`;
    $('hint').innerHTML = hint;
  }

  function addLog(line) {
    const li = el('li', 'log-' + (line.tag || 'plain'), esc(line.msg));
    const log = $('log');
    log.appendChild(li);
    while (log.children.length > 200) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  async function banner(text, tk) {
    const b = $('banner');
    b.textContent = text;
    b.hidden = false;
    await sleep(900, tk);
    b.hidden = true;
  }

  // ---------------- game lifecycle ----------------
  const RIVAL_NAMES = ['Mirelda', 'Gorran', 'Isolde', 'Thane Ruck', 'Wren', 'Osk'];

  async function startGame() {
    const tk = ++token;
    closeModal();
    $('roll').hidden = true;
    $('setup').hidden = true;
    $('table').hidden = false;
    $('log').innerHTML = '';
    human.pendingAction = null;
    modPref = $('setup-mods').value;
    const name = $('setup-name').value.trim() || 'You';
    const nOpp = Number($('setup-opps').value);
    const names = RIVAL_NAMES.slice().sort(() => Math.random() - 0.5);
    const players = [{ name, agent: human, isHuman: true }];
    for (let i = 0; i < nOpp; i++) players.push({ name: names[i], agent: G.AI.createAI() });

    game = new G.Engine.Game({
      players,
      ui: {
        update: () => { if (tk === token) renderAll(); },
        log: (line) => { if (tk === token) addLog(line); },
        showRoll: (r) => showRoll(r, tk),
        pause: (ms) => sleep(ms, tk),
        announce: async (p) => { if (p.isHuman) await banner('Your turn!', tk); else await sleep(300, tk); },
      },
    });
    try {
      const w = await game.play();
      if (tk !== token) return;
      renderAll();
      const body = el('div', 'center');
      body.innerHTML = `<p class="big-win">${w.isHuman ? '🏆 Victory!' : '💀 Defeat'}</p><p><b>${esc(w.name)}</b> ${esc(game.winReason)}.</p>`;
      const again = await modal({ title: w.isHuman ? 'Your guild triumphs!' : `${w.name} wins`, body, buttons: [
        { label: 'View the table', value: false }, { label: 'Play again', value: true, primary: true },
      ] });
      if (again) startGame();
    } catch (e) {
      if (!(e instanceof Aborted)) { console.error(e); addLog({ msg: 'Error: ' + e.message, tag: 'bad' }); }
    }
  }

  function showRules() {
    const body = $('rules-tpl').content.cloneNode(true);
    const wrap = el('div');
    wrap.appendChild(body);
    if (!$('modal').hidden) return; // don't clobber an active prompt
    showModal({ title: 'How to play', body: wrap, buttons: [{ label: 'Got it', value: null, primary: true }] });
  }

  function init() {
    $('btn-start').onclick = startGame;
    $('btn-rules').onclick = showRules;
    $('btn-rules2').onclick = showRules;
    $('btn-new').onclick = () => {
      token++; // abort the running game
      closeModal();
      $('roll').hidden = true;
      $('setup').hidden = false;
    };
    $('btn-draw').onclick = () => act((x) => x.type === 'draw');
    $('btn-redraw').onclick = () => act((x) => x.type === 'redraw');
    $('btn-end').onclick = () => act((x) => x.type === 'end');
    $('speed').onchange = (e) => { speed = Number(e.target.value); };
    $('setup-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') startGame(); });
  }

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
  G.UI = { renderCard };
})(window.Guild = window.Guild || {});
