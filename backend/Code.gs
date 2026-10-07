/** Google Apps Script V8. Dates.gs contains the shared validation code. */
function doGet(e) {
  if (e && e.parameter.api === '1') return json_(api({action:'list'}));
  return HtmlService.createHtmlOutputFromFile('App').setTitle('Časovnica').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function doPost(e) {
  try {
    if (!e.postData || e.postData.contents.length > 15000) throw new Error('Neveljavna zahteva.');
    return json_(api(JSON.parse(e.postData.contents)));
  } catch (error) {return json_({ok:false,error:error.message});}
}
function json_(data) {return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function api(body) {
  let lock;
  try {
    const props=PropertiesService.getScriptProperties();
    if (!props.getProperty('SPREADSHEET_ID')) throw new Error('Shramba še ni nastavljena. Skrbnik mora najprej zagnati setup_.');
    const sheet=SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getSheetByName('Dogodki');
    if (!sheet) throw new Error('List Dogodki manjka.');
    if (body.action === 'list') return {ok:true,events:read_(sheet)};
    const expected=props.getProperty('EDITOR_PASSWORD');
    if(!expected) throw new Error('Skrbnik mora nastaviti EDITOR_PASSWORD v lastnostih skripta.');
    if(typeof body.password !== 'string' || !equal_(body.password,expected)) throw new Error('Napačno geslo.');
    if(body.action === 'auth') return {ok:true};
    if(!['save','delete'].includes(body.action))throw new Error('Neznano dejanje.');
    lock=LockService.getScriptLock();lock.waitLock(15000);
    const rows=read_(sheet), id=body.action==='save' ? body.event && body.event.id : body.id;
    if(typeof id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new Error('Neveljaven ID dogodka.');
    const index=rows.findIndex(r=>r.id===id), existing=rows[index];
    const revision=body.action==='save' ? body.event.revision : body.revision;
    if(existing && existing.revision !== revision)throw new Error('Dogodek je medtem spremenil nekdo drug. Zapri obrazec, osveži stran in poskusi znova.');
    if(body.action==='delete') {
      if(!existing)throw new Error('Dogodek ne obstaja več. Osveži stran.');
      sheet.deleteRow(index+2);SpreadsheetApp.flush();return {ok:true};
    }
    if(!existing && revision)throw new Error('Dogodek je bil medtem izbrisan. Osveži stran.');
    const valid=TimelineDates.validate(body.event), event={id,...valid,revision:Utilities.getUuid()};
    const values=[event.id,event.title,event.start,event.end,event.notes,event.color,event.revision].map(safeCell_);
    const target=sheet.getRange(index<0 ? sheet.getLastRow()+1 : index+2,1,1,7);
    target.setNumberFormat('@');target.setValues([values]);SpreadsheetApp.flush();
    return {ok:true,event};
  }catch(error){return {ok:false,error:error.message};}
  finally{if(lock && lock.hasLock())lock.releaseLock();}
}
function equal_(a,b) {const ah=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,a),bh=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,b);let diff=0;for(let i=0;i<ah.length;i++)diff|=ah[i]^bh[i];return diff===0;}
function safeCell_(text) {return /^[=+\-@']/.test(text) ? "'"+text : text;}
function read_(sheet) {
  if(sheet.getLastRow()<2)return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,7).getDisplayValues().map(r=>({id:r[0],title:r[1],start:r[2],end:r[3],notes:r[4],color:r[5],revision:r[6]})).filter(e=>e.id);
}
/** Run once after setting EDITOR_PASSWORD in private Script Properties in Script Properties. */
function setup_() {
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty('EDITOR_PASSWORD'))throw new Error('Najprej nastavi EDITOR_PASSWORD v Project Settings → Script Properties.');
  let ss=props.getProperty('SPREADSHEET_ID') ? SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')) : SpreadsheetApp.create('Časovnica – dogodki');
  let sheet=ss.getSheetByName('Dogodki');
  if(!sheet){sheet=ss.insertSheet('Dogodki');sheet.getRange(1,1,1,7).setValues([['id','title','start','end','notes','color','revision']]);sheet.setFrozenRows(1);sheet.getRange('A:G').setNumberFormat('@');sheet.getRange(1,1,1,7).setFontWeight('bold');sheet.autoResizeColumns(1,7);}
  props.setProperty('SPREADSHEET_ID',ss.getId());console.log('Shramba: '+ss.getUrl());
}
