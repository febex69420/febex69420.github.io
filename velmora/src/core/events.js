// Tiny pub/sub event bus. World events flow through here so systems stay decoupled.
// Channels used across the game:
//   'noise'      {x, z, severity, kind}   gunshots, explosions, crashes
//   'explosion'  {x, y, z, radius, power}
//   'alert'      {level}                  national alert level changed
//   'npc-killed' {npc}
//   'night'      {isNight}
//   'notify'     {title, text, kind}
export class EventBus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, []);
    this.map.get(type).push(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    const list = this.map.get(type);
    if (list) {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
  }
  emit(type, data) {
    const list = this.map.get(type);
    if (list) for (const fn of list.slice()) fn(data);
  }
}
