/* ============================================================
   commands.js — the Supreme Command menu (Tab).
   Each decree changes stats AND the visible world.
   ============================================================ */
(function () {
  'use strict';

  const list = [
    { id: 'arrest',     key: 'd1', label: 'Arrest Nearby',    kind: 'danger', desc: 'Seize the nearest soul' },
    { id: 'fire',       key: 'd2', label: 'Fire a Minister',  kind: '',       desc: 'Purge the cabinet' },
    { id: 'taxup',      key: 'd3', label: 'Raise Taxes',      kind: '',       desc: 'Squeeze the people' },
    { id: 'taxdown',    key: 'd4', label: 'Lower Taxes',      kind: '',       desc: 'Buy their love' },
    { id: 'propaganda', key: 'd5', label: 'Propaganda Blitz', kind: 'gold',   desc: 'Manufacture glory' },
    { id: 'war',        key: 'd6', label: 'Declare War',      kind: 'danger', desc: 'March on the world' },
    { id: 'nuke',       key: 'd7', label: 'Launch Nukes',     kind: 'danger', desc: 'End the argument' }
  ];

  const Commands = {
    list,

    buildMenu(game) {
      const wrap = document.getElementById('cmd-list');
      wrap.innerHTML = '';
      list.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'cmd-btn ' + c.kind;
        b.setAttribute('role', 'menuitem');
        b.innerHTML = `<span class="kbd">${i + 1}</span><span>${c.label}</span>`;
        b.title = c.desc;
        b.addEventListener('click', () => { Commands.execute(game, c.id); });
        wrap.appendChild(b);
      });
    },

    byKey(action) {
      const c = list.find(x => x.key === action);
      return c ? c.id : null;
    },

    execute(game, id) {
      switch (id) {
        case 'arrest':     return this.arrest(game);
        case 'fire':       return this.fire(game);
        case 'taxup':      return this.taxup(game);
        case 'taxdown':    return this.taxdown(game);
        case 'propaganda': return this.propaganda(game);
        case 'war':        return this.war(game);
        case 'nuke':       return this.nuke(game);
      }
    },

    arrest(game) {
      const n = game.nearestNPC(40);
      if (!n) { game.toast('No one is within arm\'s reach.'); return; }
      game.closeMenu();
      game.removeNPC(n, 'arrest');
      game.news(`${n.name} arrested by State Security. The charges are being invented.`);
      game.toast(`${n.name} has been arrested.`, 'danger');
      game.adjust('fear', 7);
      game.adjust('popularity', -3);
      game.scareNear(n.x, 220);
    },

    fire(game) {
      const n = game.nearestNPC(40, t => t === 'minister');
      if (!n) { game.toast('No minister close enough to dismiss.'); return; }
      game.closeMenu();
      game.removeNPC(n, 'fire');
      game.news(`Minister ${n.name} dismissed in disgrace. A loyalist will replace them by lunch.`);
      game.toast(`${n.name} has been fired.`, 'danger');
      game.adjust('fear', 4);
      game.adjust('popularity', 1);
    },

    taxup(game) {
      game.closeMenu();
      game.adjust('treasury', 25);
      game.adjust('popularity', -10);
      game.adjust('fear', 4);
      game.affectCitizens(n => { if (Math.random() < 0.6) n.setMood(Math.random() < 0.5 ? 'angry' : 'fearful'); });
      game.news('TAXES RAISED. State coffers swell as citizens tighten their belts to the last notch.');
      game.toast('Taxes raised. Treasury +$25B.', 'good');
    },

    taxdown(game) {
      game.closeMenu();
      game.adjust('treasury', -18);
      game.adjust('popularity', 9);
      game.adjust('fear', -3);
      game.affectCitizens(n => { if (Math.random() < 0.6) n.setMood('loyal'); });
      game.news('TAXES LOWERED. The Supreme Leader, in boundless generosity, lightens the burden.');
      game.toast('Taxes lowered. Loyalty rises.', 'good');
    },

    propaganda(game) {
      if (game.stats.treasury < 8) { game.toast('The treasury cannot fund a campaign.'); return; }
      game.closeMenu();
      game.adjust('treasury', -8);
      game.adjust('popularity', 14);
      game.affectCitizens(n => n.cheer(260));
      game.spawnConfetti();
      game.news('PROPAGANDA CAMPAIGN LAUNCHED. New posters declare today the happiest in history.');
      game.toast('Propaganda blitz! The people rejoice.', 'good');
    },

    war(game) {
      game.closeMenu();
      if (game.atWar) { game.toast('We are already at war on every front.'); return; }
      game.atWar = true;
      game.declareWar();
      game.adjust('military', -6);
      game.adjust('treasury', -20);
      game.adjust('fear', 8);
      game.adjust('popularity', -4);
      game.news('WAR DECLARED. Columns of soldiers march out to glory. Mothers are told to be proud.');
      game.toast('War declared. The army mobilizes.', 'danger');
    },

    nuke(game) {
      game.closeMenu();
      game.launchNukes();
      game.adjust('fear', 30);
      game.adjust('popularity', -22);
      game.adjust('military', -10);
      game.panicAll();
      game.news('☢ NUCLEAR LAUNCH AUTHORIZED ☢ The horizon burns. The world will remember this name.');
      game.toast('NUCLEAR MISSILES LAUNCHED.', 'danger');
    }
  };

  window.Commands = Commands;
})();
