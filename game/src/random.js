// A small seeded random number generator (mulberry32) plus the helpers the city
// builder and the traffic use. The same seed always builds the same Solmar, which
// is what makes the screenshot scenes repeatable. No Math.random anywhere in logic.

export function createRandom(seed) {
  let a = seed | 0;
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** Float in [min, max). */
    range(min, max) {
      return min + next() * (max - min);
    },
    /** Integer in [min, max]. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** One element of an array. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
  };
}
