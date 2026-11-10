const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/App.jsx'), 'utf8');

function frame(playing, type, speed = 1) {
  const particle = { x: 20, y: 40, vx: 8, vy: 3, life: 2, maxLife: 2, phase: 0.4, type };
  const context = {
    playing, timeScale: speed, lastRef: { current: 1000 }, timestamp: 1016,
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    particles: { current: [particle] }, ctx: {}, bloom: 1,
    glowLine() {}, glowDot() {},
  };
  const dtStart = source.indexOf('      const dt =');
  const dtEnd = source.indexOf('\n', dtStart);
  const start = source.indexOf('      for (let i = particles.current.length');
  const end = source.indexOf('      ctx.restore();', start);
  vm.runInNewContext(source.slice(dtStart, dtEnd) + '\n' + source.slice(start, end), context);
  return particle;
}

test('pause freezes every particle type including damping and transverse displacement', () => {
  for (const type of ['p', 's', 'surf', 'after']) {
    const p = frame(false, type);
    assert.deepEqual(p, { x: 20, y: 40, vx: 8, vy: 3, life: 2, maxLife: 2, phase: 0.4, type });
    const resumed = frame(true, type);
    assert.ok(resumed.life < p.life);
    assert.notEqual(resumed.x, p.x);
  }
});

test('particle lifetime uses the same speed-scaled delta as the simulation clock', () => {
  const normal = frame(true, 'p', 1);
  const fast = frame(true, 'p', 2);
  assert.ok(Math.abs((2 - fast.life) - 2 * (2 - normal.life)) < 1e-12);
});
