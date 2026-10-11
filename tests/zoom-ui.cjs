const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://timeline.test',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
const track=d.querySelector('#track'), canvas=d.querySelector('#canvas');
Object.defineProperty(track,'clientWidth',{value:800});Object.defineProperty(track,'clientHeight',{value:400});
track.getBoundingClientRect=()=>({left:100});
const events=[
{id:'long',title:'History',start:'-3000',end:'2026',notes:'',color:'red'},
{id:'a',title:'Short A',start:'1900',end:'1901',notes:'',color:'blue'},
{id:'b',title:'Short B',start:'1901',end:'1902',notes:'',color:'blue'}
];
w.TIMELINE_CONFIG={provider:'supabase',supabaseUrl:'https://test.invalid',publishableKey:'test'};
w.fetch=async()=>({ok:true,json:async()=>({ok:true,events,supportsSubevents:true})});
w.eval(['dates.js','ids.js','app.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n'));
await new Promise(r=>setTimeout(r,0));
const wheel=(delta,ctrl=true,mode=0)=>{const e=new w.WheelEvent('wheel',{deltaY:delta,ctrlKey:ctrl,clientX:350,deltaMode:mode,cancelable:true});track.dispatchEvent(e);return e;};
const fraction=(anchor=250)=>(track.scrollLeft+anchor-30)/(parseFloat(canvas.style.width)-230);
wheel(-100,false);assert.equal(canvas.style.width,'800px','Normal scrolling does not zoom');
const initial=fraction();assert.equal(wheel(-100).defaultPrevented,true);
assert.ok(parseFloat(canvas.style.width)>800);assert.ok(Math.abs(fraction()-initial)<1e-9,'Pointer retains the same date');
for(let i=0;i<20;i++)wheel(-100);
assert.ok(parseFloat(canvas.style.width)>6400,'Zoom exceeds the previous 8x limit');
assert.ok(d.querySelectorAll('.tick').length<20,'Ticks are virtualized at high zoom');
const buttonAnchor=fraction(400);d.querySelector('#zoom-in').click();assert.ok(Math.abs(fraction(400)-buttonAnchor)<1e-9,'Toolbar zoom retains viewport center');
track.scrollLeft+=800;track.dispatchEvent(new w.Event('scroll'));assert.ok(d.querySelectorAll('.tick').length<20);
wheel(100);assert.ok(Number.isFinite(track.scrollLeft),'Zoom out keeps a valid scroll offset');
const short=()=>[...d.querySelectorAll('.event-bar')].find(b=>b.querySelector('strong').textContent==='Short A');
d.querySelector('#fit').click();assert.equal(canvas.style.width,'800px');assert.equal(track.scrollLeft,0);
short().click();d.querySelector('#focus-event').click();assert.ok(parseFloat(short().style.width)>=180,'Event focus makes a short event readable');
assert.equal(d.querySelector('#detail-dialog').open,false);
for(let i=0;i<40;i++)wheel(-400);
assert.ok(parseFloat(canvas.style.width)<=16000000);assert.equal(d.querySelector('#zoom-in').disabled,true);
d.querySelector('#fit').click();wheel(-3,true,1);assert.ok(parseFloat(canvas.style.width)>800,'Line-mode wheels work');
d.querySelector('#list-view').click();const width=canvas.style.width;wheel(-100);assert.equal(canvas.style.width,width,'List view does not zoom');
w.close();console.log('Zoom passed: pointer/center anchors, extended range, bounded ticks, scroll, event focus, limits and normal wheel behavior.');
})();
