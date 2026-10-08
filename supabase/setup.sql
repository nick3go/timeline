-- Run in the SQL Editor of the NEW shared apps project.
-- This creates only timeline-owned objects. No editor password is stored in this file.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists timeline_private;
revoke all on schema timeline_private from public, anon, authenticated;

create table if not exists timeline_private.settings (
  singleton boolean primary key default true check (singleton),
  password_hash text not null
);
create table if not exists timeline_private.events (
  id uuid primary key,
  title text not null check (length(btrim(title)) between 1 and 160),
  start_text text not null,
  end_text text not null default '',
  notes text not null default '' check (length(notes) <= 5000),
  color text not null default 'red' check (color in ('red','blue','green','amber','purple')),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
alter table timeline_private.events enable row level security;
alter table timeline_private.settings enable row level security;
revoke all on all tables in schema timeline_private from public, anon, authenticated;

-- Validate historical dates without PostgreSQL's BC date-range limitation.
-- Result contains the canonical input, first day and last day (for year-only dates).
create or replace function timeline_private.parse_date(input text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  parts text[]; civil bigint; astro bigint; mm int; dd int;
  month_days int[]; canonical text; lower_day bigint; upper_day bigint;
  y bigint; era bigint; yo bigint; mp bigint; i int;
begin
  parts := regexp_match(btrim(input), '^(-?[0-9]{1,6})(?:-([0-9]{1,2})-([0-9]{1,2}))?$');
  if parts is null then raise exception 'Vpiši leto ali datum LLLL-MM-DD.'; end if;
  civil := parts[1]::bigint;
  if civil = 0 then raise exception 'Leto 0 ne obstaja.'; end if;
  astro := case when civil < 0 then civil + 1 else civil end;
  month_days := array[31,case when mod(astro,4)=0 and (mod(astro,100)<>0 or mod(astro,400)=0) then 29 else 28 end,31,30,31,30,31,31,30,31,30,31];
  if parts[2] is not null then
    mm := parts[2]::int; dd := parts[3]::int;
    if mm < 1 or mm > 12 or dd < 1 or dd > month_days[mm] then raise exception 'Ta datum ne obstaja.'; end if;
    canonical := civil::text || '-' || lpad(mm::text,2,'0') || '-' || lpad(dd::text,2,'0');
  else
    canonical := civil::text;
  end if;
  for i in 1..2 loop
    mm := coalesce(parts[2]::int, case when i=1 then 1 else 12 end);
    dd := coalesce(parts[3]::int, case when i=1 then 1 else 31 end);
    y := astro - case when mm <= 2 then 1 else 0 end;
    era := floor(y::numeric / 400)::bigint; yo := y - era * 400;
    mp := mm + case when mm > 2 then -3 else 9 end;
    if i=1 then
      lower_day := era*146097 + yo*365 + yo/4 - yo/100 + (153*mp+2)/5 + dd - 1;
    else
      upper_day := era*146097 + yo*365 + yo/4 - yo/100 + (153*mp+2)/5 + dd - 1;
    end if;
  end loop;
  return jsonb_build_object('value',canonical,'lower',lower_day,'upper',upper_day);
end $$;
revoke all on function timeline_private.parse_date(text) from public, anon, authenticated;

create or replace function timeline_private.event_json(e timeline_private.events)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',e.id,'title',e.title,'start',e.start_text,'end',e.end_text,'notes',e.notes,'color',e.color,'revision',e.revision);
$$;
revoke all on function timeline_private.event_json(timeline_private.events) from public, anon, authenticated;

-- Single public API. Public reads; password-protected writes. No direct table access.
create or replace function public.timeline_api(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  action text := payload->>'action'; expected text; supplied text := payload->>'password';
  item jsonb; event_id uuid; old_event timeline_private.events; new_event timeline_private.events;
  start_date jsonb; end_date jsonb; event_title text; event_notes text; event_color text;
  supplied_revision text; result jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 20000 then
    return jsonb_build_object('ok',false,'error','Neveljavna zahteva.');
  end if;
  if action = 'list' then
    select coalesce(jsonb_agg(timeline_private.event_json(e) order by e.updated_at,e.id),'[]'::jsonb) into result from timeline_private.events e;
    return jsonb_build_object('ok',true,'events',result);
  end if;
  if action is null or action not in ('auth','save','delete') then return jsonb_build_object('ok',false,'error','Neznano dejanje.'); end if;
  select password_hash into expected from timeline_private.settings where singleton;
  if expected is null then return jsonb_build_object('ok',false,'error','Skrbnik mora najprej nastaviti geslo.'); end if;
  if supplied is null or octet_length(supplied) > 72 then return jsonb_build_object('ok',false,'error','Napačno geslo.'); end if;
  if extensions.crypt(supplied,expected) <> expected then return jsonb_build_object('ok',false,'error','Napačno geslo.'); end if;
  if action = 'auth' then return jsonb_build_object('ok',true); end if;
  item := case when action='save' then payload->'event' else payload end;
  if item is null or jsonb_typeof(item) <> 'object' then return jsonb_build_object('ok',false,'error','Dogodek manjka.'); end if;
  event_id := (item->>'id')::uuid;
  if event_id is null then return jsonb_build_object('ok',false,'error','ID dogodka manjka.'); end if;
  -- Same-ID edits are serialized, including concurrent inserts of a new event.
  perform pg_advisory_xact_lock(hashtextextended('timeline:' || event_id::text,0));
  select * into old_event from timeline_private.events where id=event_id;
  supplied_revision := coalesce(item->>'revision','');
  if old_event.id is not null and old_event.revision::text <> supplied_revision then
    return jsonb_build_object('ok',false,'error','Dogodek je medtem spremenil nekdo drug. Osveži stran in poskusi znova.');
  end if;
  if old_event.id is null and (action='delete' or supplied_revision <> '') then
    return jsonb_build_object('ok',false,'error','Dogodek ne obstaja več. Osveži stran.');
  end if;
  if action='delete' then
    delete from timeline_private.events where id=event_id;
    return jsonb_build_object('ok',true);
  end if;
  event_title := btrim(item->>'title'); event_notes := btrim(coalesce(item->>'notes',''));
  event_color := coalesce(item->>'color','red');
  if event_title is null or length(event_title) not between 1 and 160 then raise exception 'Ime dogodka mora imeti od 1 do 160 znakov.'; end if;
  if length(event_notes)>5000 then raise exception 'Opombe so lahko dolge največ 5000 znakov.'; end if;
  if event_color not in ('red','blue','green','amber','purple') then event_color := 'red'; end if;
  if item->>'start' is null then raise exception 'Začetek dogodka manjka.'; end if;
  start_date := timeline_private.parse_date(item->>'start');
  if coalesce(item->>'end','') <> '' then
    end_date := timeline_private.parse_date(item->>'end');
    if (end_date->>'upper')::bigint < (start_date->>'lower')::bigint then raise exception 'Konec ne sme biti pred začetkom.'; end if;
  end if;
  insert into timeline_private.events(id,title,start_text,end_text,notes,color,revision)
    values(event_id,event_title,start_date->>'value',coalesce(end_date->>'value',''),event_notes,event_color,gen_random_uuid())
  on conflict(id) do update set title=excluded.title,start_text=excluded.start_text,end_text=excluded.end_text,notes=excluded.notes,color=excluded.color,revision=excluded.revision,updated_at=now()
  returning * into new_event;
  return jsonb_build_object('ok',true,'event',timeline_private.event_json(new_event));
exception
  when invalid_text_representation then return jsonb_build_object('ok',false,'error','Neveljaven ID dogodka.');
  when raise_exception then return jsonb_build_object('ok',false,'error',sqlerrm);
  when others then return jsonb_build_object('ok',false,'error','Shranjevanje ni uspelo. Poskusi znova ali obvesti skrbnika.');
end $$;
revoke all on function public.timeline_api(jsonb) from public, anon, authenticated;
grant execute on function public.timeline_api(jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
