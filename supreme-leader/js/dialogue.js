/* ============================================================
   dialogue.js — what characters say, and the talk UI.
   Lines are grouped by character type and current mood.
   ============================================================ */
(function () {
  'use strict';

  // mood categories: loyal · neutral · fearful · plotting · cheering · angry
  const DialogueData = {
    general: {
      loyal: [
        "The army is yours to the last bullet, Supreme Leader.",
        "Give the word and we will paint the map your color.",
        "Morale is high. The troops chant your name at dawn."
      ],
      plotting: [
        "Some officers... whisper. I hear nothing, of course. Nothing.",
        "A wise leader watches his generals as closely as his enemies.",
        "The garrison grows restless. I merely... mention it."
      ],
      fearful: [
        "Y-yes! Whatever you command! Please, I am loyal!",
        "I did not say that, Supreme Leader. I would never.",
        "Spare me — the mistake was the quartermaster's, not mine!"
      ],
      neutral: [
        "Awaiting orders, Supreme Leader.",
        "The border divisions are at full readiness.",
        "Shall I mobilize, or hold position?"
      ]
    },
    minister: {
      loyal: [
        "The budget bends to your genius, as always, Excellency.",
        "I have renamed three avenues in your honor this week alone.",
        "Your portrait now hangs in every ministry. All forty thousand."
      ],
      plotting: [
        "Of course the treasury is fine. Do not trouble yourself with figures.",
        "Certain... colleagues question your methods. Not I. Never I.",
        "If anything were to happen to you, I would be devastated. Truly."
      ],
      fearful: [
        "The shortfall? A clerical error! It is being corrected!",
        "Please — my family. I have served faithfully for twenty years.",
        "I'll sign anything. Anything at all. Just put down the pen slowly."
      ],
      neutral: [
        "The quarterly reports await your seal, Supreme Leader.",
        "Tax revenue is stable. The people pay, as they must.",
        "There is paperwork. There is always paperwork."
      ]
    },
    citizen: {
      loyal: [
        "Long may you reign! My children pray to your portrait!",
        "The rations were thinner today, but glorious all the same!",
        "I waited six hours just to glimpse your motorcade. Worth it!"
      ],
      angry: [
        "Bread costs a week's wage. A WEEK. ...I mean. Glory to you.",
        "My brother was arrested for sighing too loudly. Was that you?",
        "We are cold and we are hungry. But mostly cold."
      ],
      fearful: [
        "I didn't see anything! I was just walking! Please!",
        "Is it illegal to stand here? It feels illegal to stand here.",
        "Don't look at me. They take the ones you look at."
      ],
      neutral: [
        "Another grey morning in the greatest nation on earth.",
        "They say the trains run on time now. Nobody dares be late.",
        "I keep my head down. It's safer down here."
      ],
      cheering: [
        "GLORY! GLORY TO THE SUPREME LEADER!",
        "I love the new poster! I love all the posters!",
        "Best day of my life and the State agrees!"
      ]
    },
    prisoner: {
      mercy: [
        "Please, Supreme Leader, I have children! I confess to anything!",
        "I only said the soup was cold. I take it back! It was warm!",
        "Mercy! I'll inform on my neighbors — all of them — just let me go!",
        "Twenty years for a joke about your moustache. Was it worth it?",
        "I see daylight through a slit the size of your mercy."
      ]
    },
    diplomat: {
      threat: [
        "My nation watches your... ambitions... with great concern.",
        "Sanctions can be lifted. Or they can be the least of your worries.",
        "We have submarines you have not imagined. Sleep on that."
      ],
      diplomacy: [
        "Perhaps a trade agreement? Oil for silence, shall we say?",
        "My government extends its warmest, most nervous greetings.",
        "Let us be friends. Friends do not aim missiles at one another."
      ],
      fearful: [
        "There is no need for the missiles! We were JOKING about the tariffs!",
        "I'll cable my capital at once — full surrender of the fishing rights!",
        "Diplomatic immunity still counts here, yes? ...Yes?"
      ]
    },
    scientist: {
      loyal: [
        "The warhead yield exceeds projections, Supreme Leader. Magnificent.",
        "Reactor four is stable. Mostly stable. Acceptably stable.",
        "Your weapons program is the envy of the trembling world."
      ],
      fearful: [
        "The readings are within tolerance! Please don't ask about tower seven.",
        "I can have it ready by morning. I'll sleep when I'm dead — soon, perhaps.",
        "The isotope is missing a few grams. Rounding error. Surely."
      ],
      neutral: [
        "We are three tests from full operational capacity.",
        "Radiation in this corridor is... let's call it characterful.",
        "Science serves the State. The State serves you. Therefore I serve you."
      ]
    }
  };

  function pick(arr, seed) { return arr[Math.floor(((window.__hash(seed)) * arr.length))] || arr[0]; }

  function lineFor(npc) {
    const pool = DialogueData[npc.type] || DialogueData.citizen;
    let bucket;
    if (npc.type === 'prisoner') bucket = 'mercy';
    else if (npc.type === 'diplomat') bucket = (npc.mood === 'fearful') ? 'fearful' : (npc.hostile ? 'threat' : 'diplomacy');
    else if (pool[npc.mood]) bucket = npc.mood;
    else bucket = 'neutral';
    const arr = pool[bucket] || pool.neutral || Object.values(pool)[0];
    return pick(arr, npc.seed + npc.lineSeed);
  }

  // per-type response buttons. each returns {label, kind, run(game,npc)}
  function responses(npc) {
    const T = npc.type;
    if (T === 'prisoner') return [
      { label: 'Pardon', kind: 'good', fx: (g, n) => { g.pardon(n); } },
      { label: 'Condemn', kind: 'bad', fx: (g, n) => { g.adjust('fear', 6); n.setMood('fearful'); g.toast(n.name + ' weeps and is dragged away.', 'danger'); } },
      { label: 'Ignore', kind: '', fx: () => {} }
    ];
    if (T === 'diplomat') return [
      { label: 'Negotiate', kind: 'good', fx: (g, n) => { g.adjust('treasury', 10); g.adjust('popularity', 2); n.setMood('loyal'); g.toast('A favorable accord is signed.', 'good'); } },
      { label: 'Threaten War', kind: 'bad', fx: (g, n) => { g.adjust('fear', 8); g.adjust('military', 2); n.setMood('fearful'); n.flee = true; g.toast(n.name + ' goes pale.', 'danger'); } },
      { label: 'Dismiss', kind: '', fx: () => {} }
    ];
    if (T === 'general') return [
      { label: 'Promote', kind: 'good', fx: (g, n) => { g.adjust('military', 5); g.adjust('treasury', -6); n.setMood('loyal'); g.toast(n.name + ' salutes, beaming.', 'good'); } },
      { label: 'Intimidate', kind: 'bad', fx: (g, n) => { g.adjust('fear', 7); g.adjust('popularity', -2); n.setMood('fearful'); g.toast(n.name + ' stiffens with terror.', 'danger'); } },
      { label: 'Dismiss', kind: '', fx: () => {} }
    ];
    // minister, citizen, scientist
    return [
      { label: 'Reward', kind: 'good', fx: (g, n) => { g.adjust('popularity', 4); g.adjust('treasury', -5); g.adjust('fear', -2); n.setMood(n.type === 'citizen' ? 'cheering' : 'loyal'); g.toast(n.name + ' showers you with gratitude.', 'good'); } },
      { label: 'Threaten', kind: 'bad', fx: (g, n) => { g.adjust('fear', 6); g.adjust('popularity', -3); n.setMood('fearful'); n.flee = true; g.toast(n.name + ' cowers before you.', 'danger'); } },
      { label: 'Dismiss', kind: '', fx: () => {} }
    ];
  }

  const Dialogue = {
    el: null, who: null, role: null, line: null, actions: null, face: null,
    active: null, game: null, _actionList: [],

    init(game) {
      this.game = game;
      this.el = document.getElementById('dialogue');
      this.who = document.getElementById('dlg-who');
      this.role = document.getElementById('dlg-role');
      this.line = document.getElementById('dlg-line');
      this.actions = document.getElementById('dlg-actions');
      this.face = document.getElementById('dlg-face');
    },

    isOpen() { return !!this.active; },

    open(npc) {
      this.active = npc;
      npc.lineSeed = (npc.lineSeed || 0) + 1;
      this.who.textContent = npc.name;
      this.role.textContent = npc.roleLabel;
      this.line.textContent = lineFor(npc);
      // portrait
      const fctx = this.face.getContext('2d');
      fctx.imageSmoothingEnabled = false;
      fctx.clearRect(0, 0, 64, 64);
      window.NPC.drawFace(fctx, npc);
      // actions
      this._actionList = responses(npc);
      this.actions.innerHTML = '';
      this._actionList.forEach((a, i) => {
        const b = document.createElement('button');
        b.className = 'dlg-act ' + a.kind;
        b.innerHTML = '<span class="k">' + (i + 1) + '</span>' + a.label;
        b.addEventListener('click', () => this.choose(i));
        this.actions.appendChild(b);
      });
      this.el.classList.remove('hidden');
      this.el.setAttribute('aria-hidden', 'false');
      this.game.player.frozen = true;
    },

    choose(i) {
      const a = this._actionList[i];
      if (!a || !this.active) return;
      const npc = this.active;
      a.fx(this.game, npc);
      this.close();
    },

    close() {
      if (!this.active) return;
      this.active = null;
      this.el.classList.add('hidden');
      this.el.setAttribute('aria-hidden', 'true');
      this.game.player.frozen = this.game.anyMenuOpen();
    }
  };

  window.Dialogue = Dialogue;
  window.DialogueData = DialogueData;
})();
