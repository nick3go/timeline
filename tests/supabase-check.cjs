const {PGlite}=require('@electric-sql/pglite'),{pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),D=require('../dates.js');
(async()=>{const db=new PGlite({extensions:{pgcrypto}});await db.exec('create role anon; create role authenticated;');await db.exec(fs.readFileSync('supabase/setup.sql','utf8'));
for(const date of ['-999999','-500-03-09','-1','1','2000-02-29','2026','999999-12-31']){const r=(await db.query('select timeline_private.parse_date($1) as d',[date])).rows[0].d;assert.equal(r.lower,D.serial(date));assert.equal(r.upper,D.serial(date,true));}
await db.exec("insert into timeline_private.settings(password_hash) values (extensions.crypt('test-only',extensions.gen_salt('bf')));");await db.exec('set role anon');
const call=async p=>(await db.query('select public.timeline_api($1::jsonb) as response',[JSON.stringify(p)])).rows[0].response;
assert.deepEqual(await call({action:'list'}),{ok:true,events:[]});assert.equal((await call({action:'auth',password:'wrong'})).ok,false);
await assert.rejects(()=>db.query('select * from timeline_private.settings'),/permission denied/);
const event={id:crypto.randomUUID(),title:'Antika',start:'-500',end:'-400',notes:'',color:'blue',revision:''};
assert.equal((await call({action:'save',event,password:'wrong'})).ok,false);const saved=await call({action:'save',event,password:'test-only'});assert.equal(saved.ok,true,JSON.stringify(saved));assert.equal((await call({action:'list'})).events[0].start,'-500');
const edited=await call({action:'save',event:{...saved.event,title:'Novo ime'},password:'test-only'});assert.equal(edited.ok,true);assert.equal((await call({action:'save',event:saved.event,password:'test-only'})).ok,false);
assert.equal((await call({action:'delete',id:event.id,revision:saved.event.revision,password:'test-only'})).ok,false);
assert.equal((await call({action:'delete',id:event.id,revision:edited.event.revision,password:'test-only'})).ok,true);
for(const start of ['0','2025-02-29','2026-13-01'])assert.equal((await call({action:'save',event:{...event,id:crypto.randomUUID(),start,end:''},password:'test-only'})).ok,false);
assert.equal((await call({action:'save',event:{...event,id:crypto.randomUUID(),end:'-600'},password:'test-only'})).ok,false);
console.log('Supabase SQL passed: historical dates, public reads, hidden tables, wrong password, create/read/edit/delete, invalid dates and stale revisions.');await db.close();})();
