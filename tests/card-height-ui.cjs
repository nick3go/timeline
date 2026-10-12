const {JSDOM}=require('jsdom'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://timeline.test',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
w.TIMELINE_CONFIG={provider:'supabase',supabaseUrl:'https://test.invalid',publishableKey:'test'};
const events=[
{id:'root',title:'Parent',start:'1900',end:'2000',notes:'',color:'red'},
{id:'child',parentId:'root',title:'Child',start:'1920',end:'1980',notes:'',color:'blue'},
{id:'grandchild',parentId:'child',title:'Grandchild',start:'1940',end:'1960',notes:'',color:'green'}
];
w.fetch=async()=>({ok:true,json:async()=>({ok:true,events,supportsSubevents:true,supportsNestedEvents:true})});
w.eval(['dates.js','ids.js','app.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n'));
await new Promise(r=>setTimeout(r,0));
const track=d.querySelector('#track'), canvas=d.querySelector('#canvas'), slider=d.querySelector('#card-height');
track.scrollLeft=42;track.scrollTop=30;
assert.equal(slider.min,'24');
for(const height of [24,32,44,48,180,88]){
  slider.value=height;slider.dispatchEvent(new w.Event('input'));
  assert.equal(canvas.style.getPropertyValue('--card-height'),height+'px');
  assert.equal(d.querySelector('#card-height-value').textContent,height+' px');
  const cards=[...d.querySelectorAll('.event-bar')],lines=[...d.querySelectorAll('.duration-line')];
  const rowGap=Math.max(16,Math.min(32,Math.round(height*.36)));
  assert.equal(cards.length,3);
  cards.forEach((card,row)=>{
    assert.equal(parseFloat(card.style.top),65+row*(height+rowGap),'Every nested lane uses the chosen height');
    assert.equal(parseFloat(lines[row].style.top),parseFloat(card.style.top)+height+Math.round(rowGap*.375),'Duration lines remain below the cards');
    if(row<cards.length-1)assert.ok(parseFloat(lines[row].style.top)+6<65+(row+1)*(height+rowGap),'Duration lines do not overlap the next row');
  });
  assert.equal(canvas.classList.contains('short-cards'),height<72);
  assert.equal(canvas.classList.contains('tiny-cards'),height<48);
  assert.equal(track.scrollLeft,42);assert.equal(track.scrollTop,30);
}
slider.value=180;slider.dispatchEvent(new w.Event('input'));
d.querySelector('#list-view').click();assert.equal(d.querySelector('#height-control').hidden,true);
d.querySelector('#track-view').click();assert.equal(d.querySelector('#height-control').hidden,false);
assert.equal(canvas.style.getPropertyValue('--card-height'),'180px','View switches preserve the selected height');
d.querySelector('#refresh').click();await new Promise(r=>setTimeout(r,0));
assert.equal(canvas.style.getPropertyValue('--card-height'),'180px','Data refresh preserves the selected height');
w.close();console.log('Card height passed: all hierarchy levels, line offsets, extremes, scrolling, view switches and refresh.');
})();

