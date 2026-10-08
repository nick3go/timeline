(() => {
  'use strict';
  const $ = id => document.getElementById(id), D = TimelineDates;
  const config = window.TIMELINE_CONFIG || {};
  const supabase = config.provider === 'supabase';
  const native = typeof google !== 'undefined' && google.script && google.script.run;
  let endpoint = supabase ? (config.supabaseUrl ? config.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/timeline_api' : '') : config.endpoint || localStorage.getItem('timeline-endpoint') || '';
  let events = [], selected = null, editing = null, draftId = null, password = '', pending = null, zoom = 1, mode = 'track', loading = false;
  const colors = {red:'#c55744',blue:'#4d7daa',green:'#548369',amber:'#b98735',purple:'#8a6aaa'};
  function notice(message, error = false) { $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('error',error); }
  function show(id) { $(id).showModal(); }
  function close(id) { $(id).close(); }
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
  $('edit-dialog').addEventListener('close', () => {password = '';});
  async function request(action, data = {}) {
    let result;
    if (native) {
      result = await new Promise((resolve,reject) => google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).api({action,...data}));
    } else {
      if (!endpoint) throw new Error('Shramba še ni povezana. Najprej nastavi povezavo s shrambo.');
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),25000);
      try {
        if (supabase && !config.publishableKey) throw new Error('Javni ključ Supabase še ni nastavljen.');
        const response = supabase
          ? await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey},body:JSON.stringify({payload:{action,...data}}),signal:controller.signal})
          : action === 'list'
          ? await fetch(endpoint+'?api=1&t='+Date.now(), {signal:controller.signal,redirect:'follow'})
          : await fetch(endpoint, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...data}),signal:controller.signal,redirect:'follow'});
        if (!response.ok) throw new Error('Shramba se ni odzvala. Preveri povezavo in dovoljenja objave.');
        result = await response.json();
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Povezava je trajala predolgo. Pred ponovnim shranjevanjem osveži dogodke in preveri, ali je bil vnos shranjen.');
        if (e instanceof TypeError || e instanceof SyntaxError) throw new Error('Povezava s shrambo ni uspela. Preveri internetno povezavo in poskusi osvežiti stran.');
        throw e;
      } finally {clearTimeout(timeout);}
    }
    if (!result?.ok) throw new Error(result?.error || 'Shramba je vrnila neveljaven odgovor.');
    return result;
  }
  function errorText(e) { return e.message || 'Pri obdelavi dogodka je prišlo do napake.'; }
  async function load() {
    if (loading) return;
    if (!native && !endpoint) {
      notice('Časovnica še ni povezana s shrambo. Za skupno shranjevanje nastavi povezavo s shrambo.');
      $('sync').textContent = 'Shramba ni povezana'; render(); return;
    }
    loading = true; $('refresh').disabled = true; $('sync').textContent = 'Nalagam dogodke …';
    try { const result = await request('list'); events = result.events; render(); notice(''); $('sync').textContent = 'Vsi dogodki so shranjeni · '+new Date().toLocaleTimeString('sl-SI',{hour:'2-digit',minute:'2-digit'}); }
    catch(e) {notice(errorText(e),true); $('sync').textContent = 'Povezava ni uspela · prikaz ni osvežen';}
    finally {loading = false; $('refresh').disabled = false;}
  }
  function rangeText(e) { return D.format(e.start) + (e.end ? ' – '+D.format(e.end) : ''); }
  function visibleEvents() {const q = $('search').value.toLocaleLowerCase('sl'); return events.filter(e => (e.title+' '+e.notes+' '+rangeText(e)).toLocaleLowerCase('sl').includes(q)).sort((a,b)=>D.serial(a.start)-D.serial(b.start)||a.title.localeCompare(b.title,'sl'));}
  function el(tag,className,text) {const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;}
  function render() {
    $('count').textContent = events.length;
    const sorted = [...events].sort((a,b)=>D.serial(a.start)-D.serial(b.start));
    $('range').textContent = sorted.length ? D.format(sorted[0].start)+' — '+D.format(sorted.reduce((a,b)=>D.serial(a.end||a.start,Boolean(a.end))>D.serial(b.end||b.start,Boolean(b.end))?a:b).end||sorted.reduce((a,b)=>D.serial(a.end||a.start,Boolean(a.end))>D.serial(b.end||b.start,Boolean(b.end))?a:b).start) : 'Tvoja zgodba se šele začenja.';
    const filtered = visibleEvents(); $('empty').hidden = events.length > 0; $('no-results').hidden = !events.length || filtered.length > 0;
    $('track').hidden = !filtered.length || mode !== 'track'; $('list').hidden = !filtered.length || mode !== 'list';
    $('zoom-label').textContent = Math.round(zoom*100)+' %';
    $('zoom-in').disabled = zoom >= 8; $('zoom-out').disabled = zoom <= 1;
    if (!filtered.length) return;
    if (mode === 'list') {
      $('list').replaceChildren();
      filtered.forEach(e => {const b = el('button','list-event'); b.style.setProperty('--event-color',colors[e.color]); b.append(el('span','list-date',rangeText(e))); const info=el('span'); info.append(el('strong','',e.title)); if(e.notes) info.append(el('span','excerpt',e.notes)); b.append(info,el('span','','↗')); b.onclick=()=>detail(e); $('list').append(b);});
      return;
    }
    const canvas = $('canvas'); canvas.replaceChildren();
    const min = Math.min(...filtered.map(e=>D.serial(e.start))), max = Math.max(...filtered.map(e=>D.serial(e.end||e.start,Boolean(e.end))));
    const span = Math.max(max-min,365), pad = span*.09, start = min-pad, finish=max+pad+(max===min ? 365 : 0);
    const width = Math.max($('track').clientWidth,800)*zoom; canvas.style.width=width+'px';
    const x = value => 30+(value-start)/(finish-start)*(width-230);
    const tickCount=Math.max(3,Math.floor(width/145));
    for(let i=0;i<=tickCount;i++) {const value=Math.round(start+(finish-start)*i/tickCount), date=D.fromSerial(value); const tick=el('div','tick');tick.style.left=x(value)+'px';tick.append(el('span','',span<730 ? D.format(date) : D.format({year:date.year,month:null,day:null})));canvas.append(tick);}
    const lanes=[];
    filtered.forEach(e=>{
      const left=x(D.serial(e.start)), end=e.end ? x(D.serial(e.end,true)) : left;
      const barWidth=Math.max(190,Math.min(390,end-left));
      let lane=lanes.findIndex(right=>right+18<left); if(lane<0)lane=lanes.length; lanes[lane]=Math.max(left+barWidth,end);
      const top=65+lane*108;
      if(e.end){const line=el('div','duration-line');line.style.cssText=`left:${left}px;top:${top+84}px;width:${Math.max(3,end-left)}px;--event-color:${colors[e.color]}`;canvas.append(line);}
      const b=el('button','event-bar');b.style.cssText=`left:${left}px;top:${top}px;width:${barWidth}px;--event-color:${colors[e.color]}`;b.append(el('strong','',e.title),el('small','',rangeText(e))); b.title=e.title+' · '+rangeText(e);b.onclick=()=>detail(e); canvas.append(b);
    });
    canvas.style.height=Math.max(330,110+lanes.length*108)+'px';
  }
  function detail(e) {selected=e; $('detail-title').textContent=e.title; $('detail-date').textContent=rangeText(e); $('detail-notes').textContent=e.notes||'Za ta dogodek ni opomb.'; show('detail-dialog');}
  function openEditor(e) {editing=e; draftId = e?.id || TimelineIds.create(); $('edit-form').reset(); $('edit-title').textContent=e ? 'Uredi dogodek' : 'Dodaj dogodek'; $('edit-error').textContent=''; if(e){for(const key of ['title','start','end','notes'])$('edit-form').elements[key].value=e[key]; $('edit-form').elements.color.value=e.color;} show('edit-dialog');}
  function authorize(callback) {if(!native && !endpoint){show('settings-dialog');return;}pending=callback;$('auth-form').reset();$('auth-error').textContent='';show('auth-dialog');}
  $('add').onclick=$('first').onclick=()=>authorize(()=>openEditor(null));
  $('auth-form').onsubmit=async e=>{e.preventDefault();$('unlock').disabled=true; $('auth-error').textContent='';try{const p=$('password').value;await request('auth',{password:p});close('auth-dialog');$('password').value='';password=p;pending();}catch(err){$('auth-error').textContent=errorText(err);}finally{$('unlock').disabled=false;}};
  $('edit').onclick=()=>{close('detail-dialog');authorize(()=>openEditor(selected));};
  $('delete').onclick=()=>{const item=selected;close('detail-dialog');authorize(async()=>{if(!confirm(`Izbrišem dogodek »${item.title}«?`)){password='';return;}try{await request('delete',{id:item.id,revision:item.revision,password});events=events.filter(e=>e.id!==item.id);render();notice('Dogodek je izbrisan.');$('sync').textContent='Sprememba shranjena';}catch(err){notice(errorText(err),true);}finally{password='';}});};
  $('edit-form').onsubmit=async e=>{e.preventDefault();$('edit-error').textContent='';try{const event=D.validate(Object.fromEntries(new FormData(e.target)));$('save').disabled=true;const result=await request('save',{event:{...event,id:draftId,revision:editing?.revision||''},password});events=events.filter(e=>e.id!==result.event.id);events.push(result.event);render();close('edit-dialog');notice('');$('sync').textContent='Vsi dogodki so shranjeni';}catch(err){$('edit-error').textContent=errorText(err);}finally{$('save').disabled=false;}};
  $('search').oninput=render; $('refresh').onclick=load;
  for(const view of ['track','list']) $(view+'-view').onclick=()=>{mode=view;for(const v of ['track','list']){$(v+'-view').classList.toggle('active',v===view);$(v+'-view').setAttribute('aria-pressed',v===view);}document.querySelector('.zoom').hidden=view==='list';render();};
  $('zoom-in').onclick=()=>{zoom=Math.min(8,zoom*1.5);render();};$('zoom-out').onclick=()=>{zoom=Math.max(1,zoom/1.5);render();};$('fit').onclick=()=>{zoom=1;render();$('track').scrollLeft=0;};
  $('settings').hidden=!!native || supabase;$('settings').onclick=()=>{$('endpoint').value=endpoint;$('settings-error').textContent='';show('settings-dialog');};
  $('settings-form').onsubmit=async e=>{e.preventDefault();const url=$('endpoint').value.trim();if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)){$('settings-error').textContent='Uporabi naslov Google Apps Script, ki se konča z /exec.';return;}endpoint=url;localStorage.setItem('timeline-endpoint',url);events=[];render();close('settings-dialog');await load();};
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});
  window.addEventListener('focus',()=>{if(!document.querySelector('dialog[open]'))load();});
  load();
})();
