// core/names.js — procedural fictional names for people, places and nations.
// Syllable-recombination keeps everything pronounceable but clearly fictional.

const P_FIRST_M = ['Aldric', 'Boren', 'Casmir', 'Darius', 'Emeric', 'Fedor', 'Gustav', 'Hadrian',
  'Ivo', 'Jorun', 'Kaspar', 'Lazlo', 'Milos', 'Nikolai', 'Oskar', 'Pavel', 'Radek', 'Stefan',
  'Tomas', 'Viktor', 'Anton', 'Bruno', 'Dmitri', 'Elias', 'Franz', 'Georg', 'Henrik', 'Igor',
  'Janos', 'Karl', 'Leon', 'Marek', 'Nils', 'Otto', 'Petar', 'Roman', 'Sergei', 'Tibor', 'Ulrich', 'Vaclav'];
const P_FIRST_F = ['Anya', 'Beata', 'Celina', 'Dagmar', 'Elena', 'Freya', 'Greta', 'Hanna',
  'Irina', 'Jelena', 'Katya', 'Lena', 'Mila', 'Nadia', 'Olena', 'Petra', 'Rada', 'Sofia',
  'Tanya', 'Vera', 'Alba', 'Brigit', 'Dana', 'Eva', 'Flora', 'Gala', 'Hedda', 'Inga',
  'Jana', 'Karin', 'Lidia', 'Marta', 'Nora', 'Oksana', 'Paula', 'Runa', 'Silva', 'Tessa', 'Uma', 'Vanda'];
const P_LAST_A = ['Vol', 'Kor', 'Bran', 'Dra', 'Mal', 'Sor', 'Tar', 'Vas', 'Zhu', 'Gral',
  'Hol', 'Jan', 'Kess', 'Lom', 'Mor', 'Nav', 'Ost', 'Pol', 'Rud', 'Stel', 'Tol', 'Ur', 'Var', 'Wren', 'Yez'];
const P_LAST_B = ['kov', 'enko', 'ović', 'berg', 'mann', 'ari', 'esku', 'ov', 'ich', 'sen',
  'strom', 'nen', 'ak', 'ek', 'in', 'ała', 'os', 'us', 'ell', 'ard'];

const CITY_A = ['Vel', 'Nor', 'Kras', 'Bel', 'Star', 'Novo', 'Mir', 'Zla', 'Dun', 'Kal',
  'Ser', 'Tor', 'Vys', 'Grod', 'Lub', 'Ost', 'Pet', 'Rav', 'Sol', 'Tarn', 'Vor', 'Zar', 'Bre', 'Dol', 'Fen'];
const CITY_B = ['grad', 'burg', 'mir', 'stad', 'holm', 'nica', 'ovo', 'gorod', 'pol', 'kova',
  'dorf', 'wick', 'thal', 'brück', 'haven', 'more', 'vik', 'zan', 'chester', 'field'];
const VILLAGE_B = ['by', 'dale', 'brook', 'holt', 'stead', 'moor', 'creek', 'fen', 'ridge', 'hollow'];

const NATION_A = ['Vel', 'Kor', 'Ar', 'Zan', 'Bal', 'Cas', 'Dor', 'Est', 'Fal', 'Gor',
  'Hel', 'Ist', 'Jor', 'Kal', 'Lut', 'Mor', 'Nar', 'Or', 'Pol', 'Ruth', 'Sar', 'Tyr', 'Ul', 'Vor', 'Zem'];
const NATION_B = ['dova', 'mark', 'land', 'thia', 'goria', 'stan', 'nia', 'via', 'donia', 'rath',
  'menia', 'burg', 'wald', 'sia', 'tania', 'veria', 'lund', 'gard', 'moria', 'kia'];

const AGENCY = ['State Security Bureau', 'Directorate IX', 'National Intelligence Office',
  'Internal Affairs Commission', 'Foreign Watch Service', 'The Chancellery Guard'];

const PAPER = ['The Daily Standard', 'The People\'s Voice', 'The Morning Tribune',
  'The National Observer', 'The Free Gazette', 'The Capital Herald'];

export function personName(rng, sex) {
  const first = rng.pick(sex === 'f' ? P_FIRST_F : P_FIRST_M);
  const last = rng.pick(P_LAST_A) + rng.pick(P_LAST_B);
  return `${first} ${last}`;
}

export function cityName(rng, isVillage = false) {
  return rng.pick(CITY_A) + rng.pick(isVillage ? VILLAGE_B : CITY_B);
}

export function nationName(rng) {
  return rng.pick(NATION_A) + rng.pick(NATION_B);
}

export function agencyName(rng) { return rng.pick(AGENCY); }
export function paperName(rng) { return rng.pick(PAPER); }

export function leaderTitle(gov) {
  return {
    democracy: 'President', republic: 'Chancellor', monarchy: 'King',
    autocracy: 'Supreme Leader', junta: 'General', theocracy: 'High Prelate',
  }[gov] || 'Leader';
}

/** Distinct-ish flag color pairs for nations. */
export const FLAG_PALETTES = [
  [0xc0392b, 0xf1c40f], [0x2980b9, 0xecf0f1], [0x27ae60, 0xf39c12],
  [0x8e44ad, 0xe0e0e0], [0xd35400, 0x2c3e50], [0x16a085, 0xc0392b],
  [0x2c3e50, 0xe74c3c], [0x7f8c8d, 0xf1c40f], [0x9b59b6, 0x2ecc71],
];
