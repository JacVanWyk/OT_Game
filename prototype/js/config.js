/* Orchard Toss — js/config.js
 * OT.CONFIG: every tunable for the prototype lives here (see ARCHITECTURE.md, "js/config.js").
 * Plain script, ES2015 max, works in the browser (window.OT) and in Node (module.exports).
 *
 * Level ramp decisions (tunables, all in this file):
 *   Zone bands   : Spring 1-10, Summer 11-22, Autumn 23-36, Winter 37-52.
 *   Fruit unlocks: cumulative across zones. A new zone's fruits are introduced one at a time
 *                  at indexInZone thresholds FRUIT_INTRO (Spring starts with two types so a
 *                  level-1 board is never single-typed).
 *   fill         : linear per zone, FILL_RAMP[zone] = [first level, last level].
 *   timeLimit    : linear per zone, TIME_RAMP[zone] = [first level, last level] (seconds, integer).
 *   obstacles    : per zone via OBSTACLE_RAMP[zone](indexInZone, levels).
 */
(function () {
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  root.OT = root.OT || {};
  var OT = root.OT;

  var ZONES = [
    { id: 'spring', name: 'Spring', levels: 10, fruits: ['cherry', 'strawberry', 'apple'] },
    { id: 'summer', name: 'Summer', levels: 12, fruits: ['watermelon', 'grape', 'banana'] },
    { id: 'autumn', name: 'Autumn', levels: 14, fruits: ['pomegranate', 'pineapple'] },
    { id: 'winter', name: 'Winter', levels: 16, fruits: ['orange', 'lemon'] }
  ];

  // indexInZone at which each of the zone's fruits is unlocked (parallel to ZONES[i].fruits)
  var FRUIT_INTRO = {
    spring: [0, 0, 2],
    summer: [0, 2, 4],
    autumn: [0, 2],
    winter: [0, 2]
  };

  // board fill fraction over the zone, [first level, last level]
  var FILL_RAMP = {
    spring: [0.50, 0.60],
    summer: [0.58, 0.66],
    autumn: [0.62, 0.70],
    winter: [0.66, 0.75]
  };

  // time limit in seconds over the zone, [first level, last level]
  var TIME_RAMP = {
    spring: [60, 50],
    summer: [55, 45],
    autumn: [55, 45],
    winter: [55, 45]
  };

  // obstacle counts per zone as a function of indexInZone (0-based) and zone length
  var OBSTACLE_RAMP = {
    spring: function () { return { walls: 0, trellis: 0, pipes: 0, coconuts: 0 }; },
    summer: function (i, len) { return { walls: (i < len / 2) ? 1 : 2, trellis: 0, pipes: 0, coconuts: 0 }; },
    autumn: function (i, len) { return { walls: 2, trellis: 1, pipes: 0, coconuts: (i < len / 2) ? 1 : 2 }; },
    winter: function (i, len) {
      var late = i >= len / 2;
      return { walls: late ? 3 : 2, trellis: late ? 2 : 1, pipes: late ? 2 : 1, coconuts: 2 };
    }
  };

  function lerp(a, b, t) { return a + (b - a) * t; }

  function levelDef(n) {
    n = Math.floor(Number(n));
    if (!(n >= 1 && n <= 52)) throw new Error('levelDef: n must be 1..52, got ' + n);
    var zoneIndex = 0, start = 1;
    while (n >= start + ZONES[zoneIndex].levels) { start += ZONES[zoneIndex].levels; zoneIndex++; }
    var zone = ZONES[zoneIndex];
    var indexInZone = n - start;
    var t = zone.levels > 1 ? indexInZone / (zone.levels - 1) : 0;

    var fruits = [];
    for (var z = 0; z <= zoneIndex; z++) {
      var zf = ZONES[z].fruits, intro = FRUIT_INTRO[ZONES[z].id];
      for (var k = 0; k < zf.length; k++) {
        if (z < zoneIndex || indexInZone >= intro[k]) fruits.push(zf[k]);
      }
    }

    var fillRamp = FILL_RAMP[zone.id], timeRamp = TIME_RAMP[zone.id];
    return {
      n: n,
      zone: zone.id,
      zoneName: zone.name,
      zoneIndex: zoneIndex,
      indexInZone: indexInZone,
      zoneLevels: zone.levels,
      rows: 8,
      cols: 5,
      fill: Math.round(lerp(fillRamp[0], fillRamp[1], t) * 1000) / 1000,
      timeLimit: Math.round(lerp(timeRamp[0], timeRamp[1], t)),
      fruits: fruits,
      obstacles: OBSTACLE_RAMP[zone.id](indexInZone, zone.levels)
    };
  }

  OT.CONFIG = {
    W: 480, H: 854, COLS: 5, ROWS: 8, CELL: 76, BOARD_X: 50, BOARD_Y: 126, LAUNCH_Y: 800,
    FRUITS: ['cherry', 'strawberry', 'apple', 'watermelon', 'grape', 'banana', 'pomegranate', 'pineapple', 'orange', 'lemon'],
    ZONES: ZONES,
    TOTAL_LEVELS: 52,
    HEARTS_MAX: 5, HEART_REFILL_MS: 30 * 60 * 1000,
    LOCKOUT_S: 0.6, FLIGHT_SPEED: 1100 /* px/s */, STAR_FRACTIONS: [0.5, 0.25] /* >=50% time left = 3 stars, >=25% = 2, else 1 */,
    FRUIT_INTRO: FRUIT_INTRO, FILL_RAMP: FILL_RAMP, TIME_RAMP: TIME_RAMP, OBSTACLE_RAMP: OBSTACLE_RAMP,
    levelDef: levelDef
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = OT.CONFIG;
})();
