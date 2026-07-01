// core/bus.js — tiny pub/sub event bus wiring simulation ↔ graphics ↔ UI.
// Simulation modules emit domain events; renderers and panels subscribe.
//
// Established events (payloads are plain objects):
//   'tick:hour' 'tick:day' 'tick:month' 'tick:year' 'season'  — time flow
//   'notify' {title, text, kind, icon}                        — toast
//   'modal'  {title, text, choices:[{label, fn}]}             — decision popup
//   'province:flip' {prov, from, to}                          — territory change
//   'war' 'peace' {a, b}                                      — war state
//   'battle' {x, z, size}                                     — combat fx
//   'explosion' {x, z, big}                                   — strike fx
//   'protest' 'riot' {settlement}                             — unrest fx
//   'citizens:changed'                                        — roster refresh
//   'built' {b}                                               — new structure
//   'gameover' {reason, text}                                 — end state
//   'speech' {tone}                                           — ruler address

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  const arr = listeners.get(event);
  if (arr) {
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
}

export function emit(event, data) {
  const arr = listeners.get(event);
  if (arr) for (const fn of arr.slice()) {
    try { fn(data); } catch (e) { console.error(`[bus] listener for "${event}" failed`, e); }
  }
}

/** Convenience: toast notification. kind: info|good|bad|war|event */
export function notify(title, text, kind = 'info') {
  emit('notify', { title, text, kind });
}

export function clearBus() { listeners.clear(); }
