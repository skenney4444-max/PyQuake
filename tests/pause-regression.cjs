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
    timeRef: { current: 4 }, SIM_DURATION: 15, reset() { throw new Error('unexpected reset'); }, setSimTime() {},
    glowLine() {}, glowDot() {},
  };
  const dtStart = source.indexOf('      const dt =');
  const dtEnd = source.indexOf('      const t = timeRef.current;', dtStart);
  const start = source.indexOf('      for (let i = particles.current.length');
  const end = source.indexOf('      ctx.restore();', start);
  vm.runInNewContext(source.slice(dtStart, dtEnd) + '\n' + source.slice(start, end), context);
  return { ...particle, elapsed: context.timeRef.current - 4 };
}

test('pause freezes every particle type including damping and transverse displacement', () => {
  for (const type of ['p', 's', 'surf', 'after']) {
    const p = frame(false, type);
    assert.deepEqual(p, { x: 20, y: 40, vx: 8, vy: 3, life: 2, maxLife: 2, phase: 0.4, type, elapsed: 0 });
    const resumed = frame(true, type);
    assert.ok(resumed.life < p.life);
    assert.notEqual(resumed.x, p.x);
  }
});

test('particle lifetime uses the same speed-scaled delta as the simulation clock', () => {
  const normal = frame(true, 'p', 1);
  const fast = frame(true, 'p', 2);
  for (const result of [normal, fast]) assert.ok(Math.abs(result.elapsed - (2 - result.life)) < 1e-12);
  assert.ok(Math.abs((2 - fast.life) - 2 * (2 - normal.life)) < 1e-12);
});

test('paused emission leaves particles and flags untouched until resume', () => {
  const start = source.indexOf('      const flags = flagsRef.current;');
  const end = source.indexOf('      if (audioEnabled) {', source.indexOf("if (playing && showAftershocks", start));
  const context = { playing: false, t: 11.6, flagsRef: {current: {p:true,s:true,surf:true,after:[]}},
    showAftershocks:true, audioEnabled:false, epicenter:{x:0,y:0}, emitRing(){ context.emissions++; }, emissions:0 };
  vm.runInNewContext('{'+source.slice(start,end)+'}', context);
  assert.equal(context.emissions,0); assert.equal(context.flagsRef.current.after.length,0);
  context.playing=true; vm.runInNewContext('{'+source.slice(start,end)+'}',context);
  assert.equal(context.emissions,3); assert.equal(context.flagsRef.current.after.length,3);
});

test('seismograph history survives parameter effect restarts while paused and clears on reset', () => {
  const history = Array.from({length:800}, (_,i)=>i%20);
  const ref = {current:history};
  let draw;
  const context = { seismoRef:{current:{width:800,height:130,getContext:()=>new Proxy({}, {get:()=>()=>{}})}},
    seismoBufferRef:ref, timeRef:{current:5}, playingRef:{current:false}, params:{magnitude:6,color:'#fff'},
    scenarioKey:'hawaii', stageFor:()=>({name:'test'}), drawText(){}, clamp:v=>v,
    requestAnimationFrame(fn){draw=fn;return 1;}, cancelAnimationFrame(){}, useEffect(fn){fn();} };
  const start=source.indexOf('  useEffect(() => {\n    const canvas = seismoRef.current;');
  const end=source.indexOf('\n\n  const canvasPoint',start);
  const effect=source.slice(start,end);
  vm.runInNewContext(effect,context); draw();
  context.params={magnitude:8,color:'#fff'};
  vm.runInNewContext(effect,context); draw();
  assert.equal(ref.current,history);
  assert.deepEqual(ref.current,Array.from({length:800},(_,i)=>i%20));
  ref.current=[]; draw();
  assert.equal(ref.current.length,800); assert.ok(ref.current.every(v=>v===0));
});
