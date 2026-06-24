/* ============================================================
   events.js — random events that interrupt the leader,
   plus the coup / overthrow failure state.
   ============================================================ */
(function () {
  'use strict';

  const POOL = ['protest', 'foreign', 'audience', 'plot', 'blackout'];

  const RandomEvents = {
    el: null, tag: null, title: null, text: null, actions: null,
    game: null, open: false, timer: 0, _options: [], coupArmed: false,

    init(game) {
      this.game = game;
      this.el = document.getElementById('event-modal');
      this.tag = document.getElementById('ev-tag');
      this.title = document.getElementById('ev-title');
      this.text = document.getElementById('ev-text');
      this.actions = document.getElementById('ev-actions');
      this.timer = this._gap();
    },

    _gap() { return 900 + Math.random() * 700; }, // ~15–27s at 60fps

    update(step) {
      if (this.open || !this.game.running) return;
      // coup watch — unloved AND unfeared regimes get overthrown
      if (this.game.stats.popularity <= 12 && this.game.stats.fear <= 22 && !this.coupArmed) {
        this.coupArmed = true; this.trigger('coup'); return;
      }
      if (this.game.stats.popularity > 20) this.coupArmed = false;

      this.timer -= step;
      if (this.timer <= 0) {
        this.timer = this._gap();
        if (this.game.dialogueOpen() || this.game.menuOpen) { this.timer = 120; return; }
        this.trigger(POOL[Math.floor(Math.random() * POOL.length)]);
      }
    },

    trigger(id) {
      const g = this.game;
      let cfg;
      switch (id) {
        case 'protest':
          g.protestNear();
          cfg = {
            tag: 'UNREST', title: 'A Protest Erupts!',
            text: 'A crowd has gathered in the street, chanting against the rationing. Cameras from abroad are watching.',
            options: [
              { label: 'Send in the troops', sub: 'They will scatter. Fear +, Loyalty −', fx: () => { g.disperseProtest(true); g.adjust('fear', 10); g.adjust('popularity', -8); g.news('Protest crushed. State TV reports a "spontaneous celebration that got out of hand."'); } },
              { label: 'Make concessions', sub: 'Extra rations. Treasury −, Loyalty +', fx: () => { g.disperseProtest(false); g.adjust('treasury', -12); g.adjust('popularity', 9); g.news('The Leader graciously grants extra rations. The crowd disperses, grateful.'); } },
              { label: 'Ignore them', sub: 'Risky. Loyalty −', fx: () => { g.adjust('popularity', -5); g.news('The palace says nothing. The chanting grows louder into the night.'); } }
            ]
          }; break;

        case 'foreign':
          cfg = {
            tag: 'DIPLOMACY', title: 'A Threatening Cable Arrives',
            text: 'A rival superpower warns you to halt your weapons program "or face consequences beyond imagining."',
            options: [
              { label: 'Threaten them back', sub: 'Military +, Fear +', fx: () => { g.adjust('military', 5); g.adjust('fear', 6); g.adjust('popularity', 3); g.news('The Leader\'s reply is broadcast nationwide. The nation roars with pride.'); } },
              { label: 'Quietly appease', sub: 'Treasury −, stability +', fx: () => { g.adjust('treasury', -15); g.adjust('popularity', 2); g.news('A secret accord is signed. Officially, nothing happened.'); } },
              { label: 'Launch the nukes', sub: 'End the conversation', fx: () => { window.Commands.nuke(g); } }
            ]
          }; break;

        case 'audience': {
          const gen = g.findNPC('general');
          const who = gen ? gen.name : 'A senior general';
          cfg = {
            tag: 'MILITARY', title: 'A General Requests an Audience',
            text: `${who} demands more funding for the army "to keep the officers... content."`,
            options: [
              { label: 'Grant the funding', sub: 'Military +, Treasury −', fx: () => { g.adjust('military', 8); g.adjust('treasury', -14); if (gen) gen.setMood('loyal'); g.news('The army receives new tanks. The generals smile — for now.'); } },
              { label: 'Refuse coldly', sub: 'They resent it. Plotting +', fx: () => { g.adjust('military', -3); if (gen) gen.setMood('plotting'); g.news('The request is denied. In the barracks, voices drop to a whisper.'); } },
              { label: 'Arrest the general', sub: 'Paranoid. Fear +, Military −', fx: () => { if (gen) g.removeNPC(gen, 'arrest'); g.adjust('fear', 9); g.adjust('military', -6); g.adjust('popularity', -3); g.news(`${who} arrested for "disloyal thoughts." The officer corps takes note.`); } }
            ]
          }; break;
        }

        case 'plot':
          cfg = {
            tag: 'SECURITY', title: 'A Plot Is Uncovered',
            text: 'Your secret police have intercepted letters. Someone in the cabinet has been plotting against you.',
            options: [
              { label: 'Purge the cabinet', sub: 'Brutal. Fear +, Loyalty −', fx: () => { const m = g.findNPC('minister'); if (m) g.removeNPC(m, 'arrest'); g.adjust('fear', 12); g.adjust('popularity', -6); g.news('A midnight purge. Several ministers are never seen again.'); } },
              { label: 'Show public mercy', sub: 'Loyalty +, Fear −', fx: () => { g.adjust('popularity', 7); g.adjust('fear', -5); g.affectCitizens(n => { if (Math.random() < 0.4) n.setMood('loyal'); }); g.news('The Leader forgives the plotters on live television. The nation weeps with love.'); } }
            ]
          }; break;

        case 'blackout':
          cfg = {
            tag: 'CRISIS', title: 'The Capital Goes Dark',
            text: 'The aging power grid has failed. The city is in darkness and the people are frightened.',
            options: [
              { label: 'Blame foreign saboteurs', sub: 'Fear +, deflect blame', fx: () => { g.adjust('fear', 7); g.adjust('popularity', -2); g.news('State TV blames foreign saboteurs for the blackout. Arrests are promised.'); } },
              { label: 'Pour money into repairs', sub: 'Treasury −, Loyalty +', fx: () => { g.adjust('treasury', -16); g.adjust('popularity', 8); g.news('Engineers work through the night. By dawn, the lights — and the portraits — glow again.'); } }
            ]
          }; break;

        case 'coup':
          cfg = {
            tag: 'EMERGENCY', title: 'The Generals Move Against You',
            text: 'Unloved and no longer feared, you have lost your grip. Tanks are turning toward the palace.',
            options: [
              { label: 'Crush the rebellion', sub: 'Needs a strong military', fx: () => {
                  if (g.stats.military >= 45) { g.adjust('fear', 18); g.adjust('military', -10); g.adjust('popularity', 4); this.coupArmed = false; g.news('The coup is crushed in a hail of fire. Your rule is absolute once more.'); }
                  else { g.gameOver('overthrown'); }
                } },
              { label: 'Flee to the bunker', sub: 'Survive, but humiliated', fx: () => { g.adjust('popularity', -4); g.adjust('fear', -6); this.coupArmed = false; g.player.x = g.world.siloX - 200; g.news('The Leader retreats to the nuclear bunker as the capital slips from his grasp.'); } }
            ]
          }; break;
      }

      this._show(cfg);
    },

    _show(cfg) {
      this.tag.textContent = cfg.tag;
      this.title.textContent = cfg.title;
      this.text.textContent = cfg.text;
      this.actions.innerHTML = '';
      this._options = cfg.options;
      cfg.options.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'ev-btn';
        b.innerHTML = `<span><b>${i + 1}.</b> ${o.label}</span>` + (o.sub ? `<small>${o.sub}</small>` : '');
        b.addEventListener('click', () => this.choose(i));
        this.actions.appendChild(b);
      });
      this.el.classList.remove('hidden');
      this.el.setAttribute('aria-hidden', 'false');
      this.open = true;
      this.game.player.frozen = true;
      const first = this.actions.querySelector('button');
      if (first) first.focus();
    },

    choose(i) {
      const o = this._options[i];
      if (!o) return;
      this.close();
      o.fx();
    },

    close() {
      this.open = false;
      this.el.classList.add('hidden');
      this.el.setAttribute('aria-hidden', 'true');
      this.game.player.frozen = this.game.anyMenuOpen();
    }
  };

  window.RandomEvents = RandomEvents;
})();
