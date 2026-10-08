(() => {
  'use strict';
  const $ = id => document.getElementById(id), D = TimelineDates;
  const config = window.TIMELINE_CONFIG || {};
  const supabase = config.provider === 'supabase';
  const native = typeof google !== 'undefined' && google.script && google.script.run;
  let endpoint = supabase ? (config.supabaseUrl ? config.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/timeline_api' : '') : config.endpoint || localStorage.getItem('timeline-endpoint') || '';
  let draftImage='', imageBusy=false, imageGeneration=0, deleting=null, deleteSnapshot={}, supportsNestedEvents=false, supportsImages=false, parentManuallyChosen = false, supportsSubevents = false, events = [], selected = null, editing = null, draftId = null, password = '', authExpiresAt = 0, authTimer = null, pending = null, zoom = 1, mode = 'track', loading = false;
  const colors = {red:'#c55744',blue:'#4d7daa',green:'#548369',amber:'#b98735',purple:'#8a6aaa'};
  function notice(message, error = false) { $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('error',error); }
  function show(id) { $(id).showModal(); }
  function close(id) { $(id).close(); }
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('dialog').close());
  const AUTH_DURATION = 10 * 60 * 1000;
  function lockEditing() {password='';authExpiresAt=0;clearTimeout(authTimer);authTimer=null;}
  function editingUnlocked() {if(password && performance.now()<authExpiresAt)return true;lockEditing();return false;}
  function unlockEditing(value) {lockEditing();password=value;authExpiresAt=performance.now()+AUTH_DURATION;authTimer=setTimeout(lockEditing,AUTH_DURATION);}
  window.addEventListener('pagehide',lockEditing);
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
    if (!result?.ok) {if(result?.error==='Napačno geslo.')lockEditing();throw new Error(result?.error || 'Shramba je vrnila neveljaven odgovor.');}
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
    try { const result = await request('list'); events = result.events; supportsSubevents = !!result.supportsSubevents; supportsNestedEvents=!!result.supportsNestedEvents;supportsImages=!!result.supportsImages; render(); notice(''); $('sync').textContent = 'Vsi dogodki so shranjeni · '+new Date().toLocaleTimeString('sl-SI',{hour:'2-digit',minute:'2-digit'}); }
    catch(e) {notice(errorText(e),true); $('sync').textContent = 'Povezava ni uspela · prikaz ni osvežen';}
    finally {loading = false; $('refresh').disabled = false;}
  }
  function rangeText(e) { return D.format(e.start) + (e.end ? ' – '+D.format(e.end) : ''); }
  function children(id) { return events.filter(e=>e.parentId===id).sort(compareEvents); }
  function compareEvents(a,b) {return D.serial(a.start)-D.serial(b.start)||a.title.localeCompare(b.title,'sl');}
  function parentOf(e) {return events.find(p=>p.id===e.parentId);}
  function descendants(id) {
    const found=[],seen=new Set([id]),queue=children(id);
    while(queue.length){const e=queue.shift();if(seen.has(e.id))continue;seen.add(e.id);found.push(e);queue.push(...children(e.id));}return found;
  }
  function ancestors(e) {const found=[],seen=new Set([e.id]);let p=parentOf(e);while(p && !seen.has(p.id)){seen.add(p.id);found.unshift(p);p=parentOf(p);}return found;}
  function visibleEvents() {
    const q=$('search').value.toLocaleLowerCase('sl').trim(),seen=new Set();
    const matches=e=>(e.title+' '+e.notes+' '+rangeText(e)).toLocaleLowerCase('sl').includes(q);
    function walk(e,inherited=false){if(seen.has(e.id))return [];seen.add(e.id);const match=inherited||matches(e);const nested=children(e.id).flatMap(c=>walk(c,match));return match||nested.length ? [e,...nested] : [];}
    return events.filter(e=>!e.parentId || !parentOf(e)).sort(compareEvents).flatMap(e=>walk(e));
  }
  function imageNode(e,className) {const image=el('img',className);image.src=e.image;image.alt='Slika: '+e.title;image.loading='lazy';image.referrerPolicy='no-referrer';image.onerror=()=>{image.hidden=true;};return image;}
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
      filtered.forEach(e => {const b = el('button','list-event'); b.style.setProperty('--event-color',colors[e.color]); b.classList.toggle('subevent',!!e.parentId);b.style.setProperty('--depth',Math.min(ancestors(e).length,5)); b.append(el('span','list-date',rangeText(e))); const info=el('span'); info.append(el('strong','',e.title)); if(e.parentId)info.append(el('span','parent-label','↳ '+ancestors(e).map(p=>p.title).join(' › ')));  if(e.image)info.append(imageNode(e,'list-image')); if(e.notes) info.append(el('span','excerpt',e.notes)); b.append(info,el('span','','↗')); b.onclick=()=>detail(e); $('list').append(b);});
      return;
    }
    const canvas = $('canvas'); canvas.replaceChildren();
    const min = Math.min(...filtered.map(e=>D.serial(e.start))), max = Math.max(...filtered.map(e=>D.serial(e.end||e.start,Boolean(e.end))));
    const span = Math.max(max-min,365), pad = span*.09, start = min-pad, finish=max+pad+(max===min ? 365 : 0);
    const width = Math.max($('track').clientWidth,800)*zoom; canvas.style.width=width+'px';
    const x = value => 30+(value-start)/(finish-start)*(width-230);
    const tickCount=Math.max(3,Math.floor(width/145));
    for(let i=0;i<=tickCount;i++) {const value=Math.round(start+(finish-start)*i/tickCount), date=D.fromSerial(value); const tick=el('div','tick');tick.style.left=x(value)+'px';tick.append(el('span','',span<730 ? D.format(date) : D.format({year:date.year,month:null,day:null})));canvas.append(tick);}
    let row=0;
    filtered.forEach(e=>{
      const left=x(D.serial(e.start)), end=e.end ? x(D.serial(e.end,true)) : left;
      const barWidth=Math.max(190,Math.min(390,end-left));
      const top=65+row++*120;
      if(e.end){const line=el('div','duration-line');line.style.cssText=`left:${left}px;top:${top+100}px;width:${Math.max(3,end-left)}px;--event-color:${colors[e.color]}`;canvas.append(line);}
      const b=el('button','event-bar'+(e.parentId?' subevent':''));b.style.cssText=`left:${left}px;top:${top}px;width:${barWidth}px;--event-color:${colors[e.color]}`;b.append(el('strong','',e.title),el('small','',rangeText(e))); if(e.parentId)b.append(el('span','parent-label','↳ '+ancestors(e).map(p=>p.title).join(' › '))); else if(children(e.id).length)b.append(el('span','parent-label',children(e.id).length+' poddogodkov')); if(e.image){b.classList.add('has-image');b.append(imageNode(e,'event-image'));}b.title=e.title+' · '+rangeText(e);b.onclick=()=>detail(e); canvas.append(b);
    });
    canvas.style.height=Math.max(330,110+row*120)+'px';
  }
  function detail(e) {
    selected=e; $('detail-title').textContent=e.title; $('detail-date').textContent=rangeText(e);
    $('detail-notes').textContent=e.notes||'Za ta dogodek ni opomb.'; $('detail-image').replaceChildren();if(e.image)$('detail-image').append(imageNode(e,'detail-image'));$('detail-image').hidden=!e.image;
    const parent=parentOf(e); $('detail-parent').hidden=!parent;
    $('detail-parent').textContent=parent ? '↳ '+parent.title : '';
    $('detail-parent').onclick=()=>{close('detail-dialog');detail(parent);};
    const nested=children(e.id); $('detail-children').replaceChildren();
    $('children-section').hidden=!nested.length;
    nested.forEach(child=>{const b=el('button','child-detail');b.append(el('strong','',child.title),el('span','',rangeText(child)));b.onclick=()=>{close('detail-dialog');detail(child);};$('detail-children').append(b);});
    $('add-child').hidden=!supportsSubevents || !e.end || (!supportsNestedEvents && !!e.parentId);
    $('delete').disabled=nested.length>0 && !supportsNestedEvents; $('delete').title=nested.length ? 'Najprej odstrani ali prestavi poddogodke.' : '';
    $('children-help').hidden=!nested.length || supportsNestedEvents;
    show('detail-dialog');
  }
  function openEditor(e, parentId='') {
    editing=e; parentManuallyChosen=!!e || !!parentId; draftId=e?.id || TimelineIds.create(); $('edit-form').reset();
    $('edit-title').textContent=e ? 'Uredi dogodek' : parentId ? 'Dodaj poddogodek' : 'Dodaj dogodek'; $('edit-error').textContent='';
    $('parent-field').hidden=!supportsSubevents;
    const select=$('parent-id'); select.replaceChildren(el('option','','Samostojen dogodek')); select.options[0].value='';
    const hasChildren=e && children(e.id).length>0;const excluded=new Set(e ? [e.id,...descendants(e.id).map(c=>c.id)] : []);
    events.filter(p=>p.end && !excluded.has(p.id) && (supportsNestedEvents || (!p.parentId && !hasChildren))).sort(compareEvents).forEach(p=>{const option=el('option','',[...ancestors(p).map(a=>a.title),p.title].join(' › ')+' · '+rangeText(p));option.value=p.id;select.append(option);});
    select.value=e?.parentId || parentId || ''; select.disabled=!!hasChildren && !supportsNestedEvents;
    if(e){for(const key of ['title','start','end','notes'])$('edit-form').elements[key].value=e[key]; $('edit-form').elements.color.value=e.color;}
    else if(parentId){$('edit-form').elements.color.value=events.find(p=>p.id===parentId)?.color||'red';}
    imageGeneration++;imageBusy=false;draftImage=e?.image||'';$('image-file').value='';$('image-url').value=draftImage.startsWith('https://')?draftImage:'';$('image-field').hidden=!supportsImages;updateImagePreview();updateParentHint(); show('edit-dialog');
  }
  function updateParentHint() {const p=events.find(e=>e.id===$('parent-id').value);$('parent-help').textContent=p ? 'Obdobje: '+rangeText(p)+'. Datumi poddogodka morajo biti znotraj tega obdobja.' : 'Glede na datume se nadrejeni dogodek izbere samodejno. Izbiro lahko ročno spremeniš.';}
  function chooseParentFromDates() {
    if (!supportsSubevents || parentManuallyChosen || editing) return;
    const form=$('edit-form'), select=$('parent-id');
    let chosen='';
    try {
      const start=D.serial(form.elements.start.value);
      const end=D.serial(form.elements.end.value || form.elements.start.value,true);
      if (end>=start) {
        const candidates=events.filter(p=>{
          if(!p.end || (!supportsNestedEvents && p.parentId) || p.id===draftId)return false;
          const lower=D.serial(p.start), upper=D.serial(p.end,true);
          return lower<=start && upper>=end && (lower<start || upper>end);
        }).sort((a,b)=>(D.serial(a.end,true)-D.serial(a.start))-(D.serial(b.end,true)-D.serial(b.start)) || compareEvents(a,b) || a.id.localeCompare(b.id));
        chosen=candidates[0]?.id || '';
      }
    } catch (_) { /* Wait for complete, valid dates. */ }
    select.value=chosen; updateParentHint();
  }
  $('parent-id').onchange=()=>{parentManuallyChosen=true;updateParentHint();};
  for(const name of ['start','end']) {
    $('edit-form').elements[name].addEventListener('input',chooseParentFromDates);
    $('edit-form').elements[name].addEventListener('change',chooseParentFromDates);
  }
  $('add-child').onclick=()=>{const parent=selected;close('detail-dialog');authorize(()=>openEditor(null,parent.id));};
  function authorize(callback) {if(editingUnlocked()){callback();return;}if(!native && !endpoint){show('settings-dialog');return;}pending=callback;$('auth-form').reset();$('auth-error').textContent='';show('auth-dialog');}
  $('add').onclick=$('first').onclick=()=>authorize(()=>openEditor(null));
  $('auth-form').onsubmit=async e=>{e.preventDefault();$('unlock').disabled=true; $('auth-error').textContent='';try{const p=$('password').value;await request('auth',{password:p});close('auth-dialog');$('password').value='';unlockEditing(p);const callback=pending;pending=null;callback();}catch(err){$('auth-error').textContent=errorText(err);}finally{$('unlock').disabled=false;}};
  $('edit').onclick=()=>{close('detail-dialog');authorize(()=>openEditor(selected));};
  $('delete').onclick=()=>{const item=selected;close('detail-dialog');authorize(()=>{
    deleting=item;const nested=descendants(item.id);deleteSnapshot=Object.fromEntries(nested.map(e=>[e.id,e.revision]));
    $('delete-form').reset();$('delete-title').textContent='Izbriši »'+item.title+'«?';$('delete-options').hidden=!nested.length;
    $('delete-description').textContent=nested.length ? 'Ta dogodek ima '+nested.length+' poddogodkov na vseh ravneh. Kaj naj se zgodi z njimi?' : 'Dogodek bo trajno izbrisan.';
    $('delete-error').textContent='';show('delete-dialog');
  });};
  $('delete-form').onsubmit=async e=>{e.preventDefault();if(!editingUnlocked()){authorize(()=>$('delete-form').requestSubmit());return;}
    const childrenMode=$('delete-form').elements.childrenMode.value;if(Object.keys(deleteSnapshot).length && !childrenMode){$('delete-error').textContent='Izberi, kaj naj se zgodi s poddogodki.';return;}
    $('confirm-delete').disabled=true;$('delete-error').textContent='';try{const result=await request('delete',{id:deleting.id,revision:deleting.revision,password,childrenMode,descendantRevisions:deleteSnapshot});
      if(result.events)events=result.events;else events=events.filter(e=>e.id!==deleting.id);render();close('delete-dialog');notice('Dogodek je izbrisan.');$('sync').textContent='Sprememba shranjena';
    }catch(err){$('delete-error').textContent=errorText(err);}finally{$('confirm-delete').disabled=false;}
  };
  function updateImagePreview() {$('image-preview').replaceChildren();if(draftImage)$('image-preview').append(imageNode({image:draftImage,title:'Predogled'},'detail-image'));$('remove-image').hidden=!draftImage;$('image-status').textContent=imageBusy?'Pripravljam sliko …':'';}
  $('image-url').oninput=()=>{imageGeneration++;imageBusy=false;draftImage=$('image-url').value.trim();$('image-file').value='';updateImagePreview();};
  $('remove-image').onclick=()=>{imageGeneration++;imageBusy=false;draftImage='';$('image-file').value='';$('image-url').value='';updateImagePreview();};
  $('image-file').onchange=async()=>{const file=$('image-file').files[0];if(!file)return;const generation=++imageGeneration;imageBusy=true;updateImagePreview();
    try{if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>10*1024*1024)throw new Error('Izberi sliko JPG, PNG ali WebP, veliko največ 10 MB.');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Slike ni mogoče prebrati.'));reader.readAsDataURL(file);});
      const source=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Slike ni mogoče odpreti.'));image.src=data;});
      const canvas=document.createElement('canvas');let size=Math.min(1,1200/Math.max(source.width,source.height)),output='';
      for(let i=0;i<8;i++){canvas.width=Math.max(1,Math.round(source.width*size));canvas.height=Math.max(1,Math.round(source.height*size));const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0,canvas.width,canvas.height);output=canvas.toDataURL('image/jpeg',0.8);if(output.length<=280000)break;size*=0.75;}
      if(output.length>280000)throw new Error('Slika je prevelika. Izberi manjšo.');
      if(generation!==imageGeneration)return;draftImage=output;$('image-url').value='';
    }catch(err){if(generation===imageGeneration)$('edit-error').textContent=errorText(err);}finally{if(generation===imageGeneration){imageBusy=false;updateImagePreview();}}
  };
  $('edit-form').onsubmit=async e=>{e.preventDefault();if(!editingUnlocked()){authorize(()=>$('edit-form').requestSubmit());return;}$('edit-error').textContent='';try{if(imageBusy)throw new Error('Počakaj, da se slika pripravi.');if(draftImage && !/^https:\/\/[^\s]{1,2040}$/.test(draftImage) && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(draftImage))throw new Error('Vpiši veljaven spletni naslov slike HTTPS.');chooseParentFromDates();const event=D.validate(Object.fromEntries(new FormData(e.target)));const parentId=supportsSubevents ? $('parent-id').value : editing?.parentId||''; const parent=events.find(p=>p.id===parentId); if(parent && (D.serial(event.start)<D.serial(parent.start) || D.serial(event.end||event.start,true)>D.serial(parent.end,true)))throw new Error('Poddogodek mora biti znotraj obdobja nadrejenega dogodka.');$('save').disabled=true;const result=await request('save',{event:{...event,id:draftId,revision:editing?.revision||'',...(supportsSubevents?{parentId}: {}),...(supportsImages?{image:draftImage}: {})},password});events=events.filter(e=>e.id!==result.event.id);events.push(result.event);render();close('edit-dialog');notice('');$('sync').textContent='Vsi dogodki so shranjeni';}catch(err){$('edit-error').textContent=errorText(err);}finally{$('save').disabled=false;}};
  $('search').oninput=render; $('refresh').onclick=load;
  for(const view of ['track','list']) $(view+'-view').onclick=()=>{mode=view;for(const v of ['track','list']){$(v+'-view').classList.toggle('active',v===view);$(v+'-view').setAttribute('aria-pressed',v===view);}document.querySelector('.zoom').hidden=view==='list';render();};
  $('zoom-in').onclick=()=>{zoom=Math.min(8,zoom*1.5);render();};$('zoom-out').onclick=()=>{zoom=Math.max(1,zoom/1.5);render();};$('fit').onclick=()=>{zoom=1;render();$('track').scrollLeft=0;};
  $('settings').hidden=!!native || supabase;$('settings').onclick=()=>{$('endpoint').value=endpoint;$('settings-error').textContent='';show('settings-dialog');};
  $('settings-form').onsubmit=async e=>{e.preventDefault();const url=$('endpoint').value.trim();if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)){$('settings-error').textContent='Uporabi naslov Google Apps Script, ki se konča z /exec.';return;}endpoint=url;localStorage.setItem('timeline-endpoint',url);events=[];render();close('settings-dialog');await load();};
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});
  window.addEventListener('focus',()=>{if(!document.querySelector('dialog[open]'))load();});
  load();
})();
