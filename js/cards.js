/* Guildbound — card definitions.
 * All names, characters and text here are original to this project.
 */
(function (G) {
  'use strict';

  const CLASSES = {
    blade:    { name: 'Blade',    icon: '⚔', color: '#c0392b' },
    arcanist: { name: 'Arcanist', icon: '✦', color: '#6c4bd1' },
    shade:    { name: 'Shade',    icon: '☾', color: '#34495e' },
    warden:   { name: 'Warden',   icon: '⛨', color: '#2f7d6d' },
    tinker:   { name: 'Tinker',   icon: '⚙', color: '#b7791f' },
    druid:    { name: 'Druid',    icon: '❦', color: '#3f8f2f' },
  };
  const CLASS_KEYS = Object.keys(CLASSES);

  // Effect building blocks. Each effect is { type, ...params } or an array of them.
  const E = {
    draw: (n) => ({ type: 'draw', n }),
    destroy: () => ({ type: 'destroy_hero' }),
    steal: () => ({ type: 'steal_hero' }),
    pull: (n) => ({ type: 'pull', n }),
    oppDiscard: (n) => ({ type: 'opp_discard', n }),
    allDiscard: (n) => ({ type: 'all_discard', n }),
    search: (kind, play) => ({ type: 'search_discard', kind: kind || null, play: !!play }),
    gainAp: (n) => ({ type: 'gain_ap', n }),
    playFree: () => ({ type: 'play_hero_free' }),
    returnHero: () => ({ type: 'return_hero' }),
    sacrificeAll: () => ({ type: 'each_sacrifice' }),
    seekHero: (play) => ({ type: 'seek_hero', play: !!play }),
    stealItem: () => ({ type: 'steal_item' }),
    peekTake: () => ({ type: 'peek_take' }),
    discardSelf: (n) => ({ type: 'self_discard', n }),
    othersDraw: (n) => ({ type: 'others_draw', n }),
  };

  const HEROES = [
    // Blade — aggression
    { name: 'Kestrel Ashblade',     cls: 'blade', need: 8,  text: 'Destroy a hero.', effect: E.destroy() },
    { name: 'Brannoc the Unbent',   cls: 'blade', need: 8,  text: 'Gain 2 action points.', effect: E.gainAp(2) },
    { name: 'Sira Vantor',          cls: 'blade', need: 9,  text: 'Destroy a hero, then draw a card.', effect: [E.destroy(), E.draw(1)] },
    { name: 'Old Mattock',          cls: 'blade', need: 6,  text: 'Each other player discards a card.', effect: E.allDiscard(1) },
    { name: 'Ylva Stormedge',       cls: 'blade', need: 10, text: 'Each other player sacrifices a hero.', effect: E.sacrificeAll() },
    // Arcanist — knowledge
    { name: 'Orrin Glasswick',      cls: 'arcanist', need: 6, text: 'Draw 2 cards.', effect: E.draw(2) },
    { name: 'Tamsin Veyl',          cls: 'arcanist', need: 8, text: 'Take any card from the discard pile.', effect: E.search(null) },
    { name: 'Ezzra of the Ninth Lamp', cls: 'arcanist', need: 7, text: 'Draw 3 cards, then discard 1.', effect: [E.draw(3), E.discardSelf(1)] },
    { name: 'Pell Quillfeather',    cls: 'arcanist', need: 5, text: 'Draw a card.', effect: E.draw(1) },
    { name: 'Magister Ondrel',      cls: 'arcanist', need: 9, text: 'Reveal cards until a Hero appears and add it straight to your party.', effect: E.seekHero(true) },
    // Shade — thievery
    { name: 'Nix Halloway',         cls: 'shade', need: 8,  text: 'Steal a hero.', effect: E.steal() },
    { name: 'Velvet Moth',          cls: 'shade', need: 6,  text: "Pull a random card from another player's hand.", effect: E.pull(1) },
    { name: 'Corrin Ashfall',       cls: 'shade', need: 7,  text: "Look at a player's hand and take a card from it.", effect: E.peekTake() },
    { name: 'Whisper Jen',          cls: 'shade', need: 9,  text: 'Steal an item, then pull a random card.', effect: [E.stealItem(), E.pull(1)] },
    { name: 'The Lantern Thief',    cls: 'shade', need: 10, text: 'Steal a hero, then pull a random card.', effect: [E.steal(), E.pull(1)] },
    // Warden — order
    { name: 'Hollis Greystone',     cls: 'warden', need: 7, text: "Return another player's hero to their hand.", effect: E.returnHero() },
    { name: 'Brina Oakshield',      cls: 'warden', need: 6, text: 'Take a Hero from the discard pile.', effect: E.search('hero') },
    { name: 'Captain Dovrin',       cls: 'warden', need: 8, text: 'Play a Hero from your hand for free.', effect: E.playFree() },
    { name: 'Mara Ironveil',        cls: 'warden', need: 7, text: 'Draw a card and gain 1 action point.', effect: [E.draw(1), E.gainAp(1)] },
    { name: 'Seren Wallward',       cls: 'warden', need: 9, text: 'Steal an item, then draw a card.', effect: [E.stealItem(), E.draw(1)] },
    // Tinker — contraptions
    { name: 'Fizzwick Coil',        cls: 'tinker', need: 6, text: 'Take an Item from the discard pile.', effect: E.search('item') },
    { name: 'Garrow Spanner',       cls: 'tinker', need: 7, text: 'Steal an item.', effect: E.stealItem() },
    { name: 'Lumi Gearheart',       cls: 'tinker', need: 7, text: 'Take a Modifier from the discard pile, then draw a card.', effect: [E.search('modifier'), E.draw(1)] },
    { name: 'Tobble Brass',         cls: 'tinker', need: 6, text: 'Draw 2 cards. Each other player draws 1.', effect: [E.draw(2), E.othersDraw(1)] },
    { name: 'Professor Vintra',     cls: 'tinker', need: 9, text: 'Reveal cards until a Hero appears; take it into your hand. Draw a card.', effect: [E.seekHero(false), E.draw(1)] },
    // Druid — growth
    { name: 'Fern Mosswhistle',     cls: 'druid', need: 7,  text: 'Play a Hero from your hand for free.', effect: E.playFree() },
    { name: 'Rowan Thistle',        cls: 'druid', need: 8,  text: "Return another player's hero to their hand, then draw a card.", effect: [E.returnHero(), E.draw(1)] },
    { name: 'Elder Wythe',          cls: 'druid', need: 10, text: 'Take a Hero from the discard pile and add it to your party.', effect: E.search('hero', true) },
    { name: 'Pip Brambleback',      cls: 'druid', need: 5,  text: 'Draw a card.', effect: E.draw(1) },
    { name: 'Sable Wildroot',       cls: 'druid', need: 7,  text: 'Each other player discards a card. Draw a card.', effect: [E.allDiscard(1), E.draw(1)] },
  ];

  const ITEMS = [
    { name: 'Lucky Acorn',     count: 2, item: { kind: 'buff', value: 1 }, text: "Equipped hero's ability rolls get +1." },
    { name: 'Runed Gauntlet',  count: 1, item: { kind: 'buff', value: 2 }, text: "Equipped hero's ability rolls get +2." },
    { name: 'Cracked Mirror',  count: 2, item: { kind: 'buff', value: -2 }, cursed: true, text: "Cursed. Equipped hero's ability rolls get -2." },
    { name: 'Iron Shackles',   count: 1, item: { kind: 'shackle' }, cursed: true, text: "Cursed. Equipped hero's ability cannot be used." },
    { name: 'Aegis Charm',     count: 2, item: { kind: 'aegis' }, text: 'Equipped hero cannot be destroyed, stolen or returned.' },
    ...CLASS_KEYS.map((c) => ({
      name: `Sigil of the ${CLASSES[c].name}`, count: 1, item: { kind: 'sigil', cls: c },
      text: `Equipped hero counts as a ${CLASSES[c].name} instead of its own class.`,
    })),
  ];

  const MAGIC = [
    { name: 'Wildfire',        count: 2, text: 'Destroy a hero.', effect: E.destroy() },
    { name: 'Second Sight',    count: 2, text: 'Draw 2 cards.', effect: E.draw(2) },
    { name: 'Grave Whisper',   count: 1, text: 'Take any card from the discard pile.', effect: E.search(null) },
    { name: 'Quickening',      count: 2, text: 'Gain 2 action points.', effect: E.gainAp(2) },
    { name: 'Sticky Fingers',  count: 1, text: "Pull 2 random cards from other players' hands.", effect: [E.pull(1), E.pull(1)] },
    { name: 'Tremor',          count: 1, text: 'Each other player discards 2 cards.', effect: E.allDiscard(2) },
    { name: 'Recall',          count: 1, text: "Return another player's hero to their hand.", effect: E.returnHero() },
  ];

  const MODIFIERS = [
    { count: 4, mods: [2, -2] },
    { count: 3, mods: [1, -3] },
    { count: 3, mods: [3, -1] },
    { count: 2, mods: [4] },
    { count: 2, mods: [-4] },
  ];

  const CHALLENGE_COUNT = 8;

  const PASSIVES = {
    turn_draw:      'Draw a card at the start of your turn.',
    attack_bonus:   '+1 to your monster attack rolls.',
    ability_bonus:  '+1 to your hero ability rolls.',
    challenge_bonus:'+1 to your challenge rolls; challenges against you get -1.',
    extra_ap:       '+1 action point each turn.',
    ward:           'Your heroes cannot be destroyed.',
    no_steal:       'Your heroes cannot be stolen.',
    hand_size:      'Your hand limit is 10.',
    free_draw:      'Your first Draw action each turn is free.',
  };

  // req: minimum heroes in party (leader not counted) + optional class requirement
  const MONSTERS = [
    { name: 'Gloomfang Pack',    req: { heroes: 2 },             need: 8,  failAt: 4, penalty: { type: 'discard', n: 2 }, reward: 'turn_draw' },
    { name: 'Rustmaw Wyrm',      req: { heroes: 2, cls: 'tinker' }, need: 8, failAt: 5, penalty: { type: 'sacrifice' }, reward: 'free_draw' },
    { name: 'The Hollow King',   req: { heroes: 3 },             need: 9,  failAt: 6, penalty: { type: 'sacrifice' }, reward: 'extra_ap' },
    { name: 'Mirebelly Toad',    req: { heroes: 2 },             need: 7,  failAt: 4, penalty: { type: 'discard', n: 1 }, reward: 'hand_size' },
    { name: 'Shardwing Harpy',   req: { heroes: 2, cls: 'shade' }, need: 8, failAt: 5, penalty: { type: 'discard', n: 2 }, reward: 'no_steal' },
    { name: 'Ashen Colossus',    req: { heroes: 3, cls: 'blade' }, need: 9, failAt: 5, penalty: { type: 'sacrifice' }, reward: 'attack_bonus' },
    { name: 'Thornmother',       req: { heroes: 2, cls: 'druid' }, need: 8, failAt: 5, penalty: { type: 'sacrifice' }, reward: 'ward' },
    { name: 'The Weeping Lich',  req: { heroes: 3, cls: 'arcanist' }, need: 9, failAt: 6, penalty: { type: 'sacrifice' }, reward: 'ability_bonus' },
    { name: 'Bog Hydra',         req: { heroes: 4 },             need: 10, failAt: 6, penalty: { type: 'sacrifice' }, reward: 'extra_ap' },
    { name: 'Ironbark Golem',    req: { heroes: 2, cls: 'warden' }, need: 8, failAt: 5, penalty: { type: 'discard', n: 2 }, reward: 'challenge_bonus' },
    { name: 'Cinder Imp Swarm',  req: { heroes: 1 },             need: 7,  failAt: 3, penalty: { type: 'lose_turn' }, reward: 'hand_size' },
    { name: 'Glass Serpent',     req: { heroes: 2 },             need: 8,  failAt: 4, penalty: { type: 'discard', n: 1 }, reward: 'ability_bonus' },
  ];

  const LEADERS = [
    { name: 'Vael the Ironheart',   cls: 'blade',    power: 'attack',    text: '+1 to your monster attack rolls.' },
    { name: 'Myrr, Keeper of Pages', cls: 'arcanist', power: 'magic_draw', text: 'After you play a Magic card, draw a card.' },
    { name: 'Quill of the Veil',    cls: 'shade',    power: 'challenge', text: '+2 to your challenge rolls; challenges against you get -2.' },
    { name: 'Branka Stoneward',     cls: 'warden',   power: 'no_penalty', text: 'Ignore penalties when a monster attack fails.' },
    { name: 'Tilly Cogsworth',      cls: 'tinker',   power: 'free_item', text: 'The first Item you play each turn costs 0 AP.' },
    { name: 'Ysolde Greenmantle',   cls: 'druid',    power: 'turn_draw', text: 'Draw an extra card at the start of your turn.' },
  ];

  let uid = 0;
  const nextId = () => 'c' + (++uid);

  function buildDeck() {
    const deck = [];
    HEROES.forEach((h) => deck.push({ id: nextId(), kind: 'hero', ...h }));
    ITEMS.forEach((it) => {
      for (let i = 0; i < it.count; i++) {
        deck.push({ id: nextId(), kind: 'item', name: it.name, item: it.item, cursed: !!it.cursed, text: it.text });
      }
    });
    MAGIC.forEach((m) => {
      for (let i = 0; i < m.count; i++) deck.push({ id: nextId(), kind: 'magic', name: m.name, text: m.text, effect: m.effect });
    });
    MODIFIERS.forEach((m) => {
      for (let i = 0; i < m.count; i++) {
        const label = m.mods.map((v) => (v > 0 ? '+' + v : String(v))).join(' / ');
        deck.push({ id: nextId(), kind: 'modifier', name: 'Modifier ' + label, mods: m.mods,
          text: m.mods.length > 1 ? `Play on any roll: ${label} (your choice).` : `Play on any roll: ${label}.` });
      }
    });
    for (let i = 0; i < CHALLENGE_COUNT; i++) {
      deck.push({ id: nextId(), kind: 'challenge', name: 'Objection!',
        text: 'When another player plays a Hero, Item or Magic card, roll 7+ to cancel it.' });
    }
    return deck;
  }

  function buildMonsters() {
    return MONSTERS.map((m) => ({ id: nextId(), kind: 'monster', ...m }));
  }

  function buildLeaders() {
    return LEADERS.map((l) => ({ id: nextId(), kind: 'leader', ...l }));
  }

  G.Cards = { CLASSES, CLASS_KEYS, PASSIVES, HEROES, ITEMS, MAGIC, MONSTERS, LEADERS, buildDeck, buildMonsters, buildLeaders };
})(typeof window !== 'undefined' ? (window.Guild = window.Guild || {}) : (globalThis.Guild = globalThis.Guild || {}));
