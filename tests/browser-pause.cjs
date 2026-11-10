const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(() => {
      const proto=CanvasRenderingContext2D.prototype, clear=proto.clearRect, arc=proto.arc;
      proto.clearRect=function(...args){this.__arcs=[];return clear.apply(this,args);};
      proto.arc=function(...args){(this.__arcs??=[]).push(args.slice(0,3));return arc.apply(this,args);};
    });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173');
    await page.waitForFunction(()=>parseFloat(document.querySelector('code')?.textContent.replace('t = ',''))>3);
    await page.getByRole('button',{name:'Pause Sim',exact:true}).click();
    await page.waitForTimeout(150);
    const sample=()=>page.evaluate(()=>({
      time:document.querySelector('code').textContent,
      arcs:document.querySelector('canvas').getContext('2d').__arcs,
      seismo:document.querySelector('canvas.seismo').toDataURL(),
    }));
    const before=await sample(); await page.waitForTimeout(650); const after=await sample();
    assert.ok(before.arcs.length>10,'test must pause an active wavefield');
    assert.deepEqual(after,before,'pause must hold clock, particles and seismograph');
    await page.getByRole('button',{name:'Resume',exact:true}).click();
    await page.waitForTimeout(250); const resumed=await sample();
    assert.notEqual(resumed.time,after.time); assert.notDeepEqual(resumed.arcs,after.arcs);
    assert.deepEqual(errors,[]);
    console.log('Browser pause/resume passed with '+before.arcs.length+' active arcs');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
