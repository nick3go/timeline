-- Run in timeline project SQL Editor. Preserves events and password.
begin;
-- Additive migration: existing events remain top-level events.
alter table timeline_private.events add column if not exists parent_id uuid
  references timeline_private.events(id) on delete restrict;
alter table timeline_private.events add column if not exists image text not null default '';
create index if not exists timeline_events_parent_idx on timeline_private.events(parent_id);
create or replace function timeline_private.event_json(e timeline_private.events)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',e.id,'title',e.title,'start',e.start_text,'end',e.end_text,'notes',e.notes,'color',e.color,'revision',e.revision,'parentId',e.parent_id,'image',e.image);
$$;
revoke all on function timeline_private.event_json(timeline_private.events) from public, anon, authenticated;

-- Single public API. Public reads; password-protected writes. No direct table access.
create or replace function public.timeline_api(payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  action text := payload->>'action'; expected text; supplied text := payload->>'password';
  item jsonb; event_id uuid; old_event timeline_private.events; new_event timeline_private.events;
  start_date jsonb; end_date jsonb; event_title text; event_notes text; event_color text;
  supplied_revision text; result jsonb; chosen_parent uuid; parent_event timeline_private.events; event_image text; descendant_ids uuid[]; descendant_revisions jsonb; delete_mode text;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or octet_length(payload::text) > 450000 then
    return jsonb_build_object('ok',false,'error','Neveljavna zahteva.');
  end if;
  if action = 'list' then
    select coalesce(jsonb_agg(timeline_private.event_json(e) order by e.updated_at,e.id),'[]'::jsonb) into result from timeline_private.events e;
    return jsonb_build_object('ok',true,'events',result,'supportsSubevents',true,'supportsNestedEvents',true,'supportsImages',true);
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
  -- Serialize hierarchy changes to prevent parent edits racing with child inserts.
  perform pg_advisory_xact_lock(hashtextextended('timeline:hierarchy',0));
  select * into old_event from timeline_private.events where id=event_id;
  supplied_revision := coalesce(item->>'revision','');
  if old_event.id is not null and old_event.revision::text <> supplied_revision then
    return jsonb_build_object('ok',false,'error','Dogodek je medtem spremenil nekdo drug. Osveži stran in poskusi znova.');
  end if;
  if old_event.id is null and (action='delete' or supplied_revision <> '') then
    return jsonb_build_object('ok',false,'error','Dogodek ne obstaja več. Osveži stran.');
  end if;
  if action='delete' then
    with recursive subtree as (
      select id,revision from timeline_private.events where parent_id=event_id
      union all select e.id,e.revision from timeline_private.events e join subtree t on e.parent_id=t.id
    ) select coalesce(array_agg(id),array[]::uuid[]),coalesce(jsonb_object_agg(id::text,revision::text),'{}'::jsonb)
      into descendant_ids,descendant_revisions from subtree;
    if cardinality(descendant_ids)>0 then
      delete_mode := payload->>'childrenMode';
      if delete_mode is null or delete_mode not in ('delete','detach') then
        raise exception 'Izberi, ali naj se poddogodki izbrišejo ali postanejo samostojni.';
      end if;
      if coalesce(payload->'descendantRevisions','{}'::jsonb) <> descendant_revisions then
        raise exception 'Poddogodki so se medtem spremenili. Osveži stran in potrdi brisanje znova.';
      end if;
      if delete_mode='detach' then
        update timeline_private.events set parent_id=null,revision=gen_random_uuid(),updated_at=now() where id=any(descendant_ids);
      else
        delete from timeline_private.events where id=any(descendant_ids) or id=event_id;
      end if;
    end if;
    delete from timeline_private.events where id=event_id;
    select coalesce(jsonb_agg(timeline_private.event_json(e) order by e.updated_at,e.id),'[]'::jsonb) into result from timeline_private.events e;
    return jsonb_build_object('ok',true,'events',result);
  end if;
  event_title := btrim(item->>'title'); event_notes := btrim(coalesce(item->>'notes',''));
  event_color := coalesce(item->>'color','red');
  if event_title is null or length(event_title) not between 1 and 160 then raise exception 'Ime dogodka mora imeti od 1 do 160 znakov.'; end if;
  if length(event_notes)>5000 then raise exception 'Opombe so lahko dolge največ 5000 znakov.'; end if;
  if event_color not in ('red','blue','green','amber','purple') then event_color := 'red'; end if;
  if item->>'start' is null then raise exception 'Začetek dogodka manjka.'; end if;
  event_image := case when item ? 'image' then coalesce(item->>'image','') else coalesce(old_event.image,'') end;
  if length(event_image)>300000 or (event_image like 'https://%' and length(event_image)>2048) or (event_image<>'' and event_image !~ '^https://[^[:space:]]+$' and event_image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$') then
    raise exception 'Slika mora biti spletni naslov HTTPS ali manjša slika JPG, PNG ali WebP.';
  end if;
  start_date := timeline_private.parse_date(item->>'start');
  if coalesce(item->>'end','') <> '' then
    end_date := timeline_private.parse_date(item->>'end');
    if (end_date->>'upper')::bigint < (start_date->>'lower')::bigint then raise exception 'Konec ne sme biti pred začetkom.'; end if;
  end if;
  chosen_parent := case when item ? 'parentId' then nullif(item->>'parentId','')::uuid else old_event.parent_id end;
  if chosen_parent is not null then
    if chosen_parent=event_id then raise exception 'Dogodek ne more biti svoj poddogodek.'; end if;
    select * into parent_event from timeline_private.events where id=chosen_parent;
    if parent_event.id is null or parent_event.end_text='' then
      raise exception 'Izberi nadrejeni dogodek z začetkom in koncem.';
    end if;
    if exists(with recursive ancestors as (
      select id,parent_id from timeline_private.events where id=chosen_parent
      union all select e.id,e.parent_id from timeline_private.events e join ancestors a on e.id=a.parent_id
    ) select 1 from ancestors where id=event_id) then
      raise exception 'Nadrejeni dogodek ne sme biti eden od njegovih poddogodkov.';
    end if;
    if (start_date->>'lower')::bigint < (timeline_private.parse_date(parent_event.start_text)->>'lower')::bigint
       or (coalesce(end_date,start_date)->>'upper')::bigint > (timeline_private.parse_date(parent_event.end_text)->>'upper')::bigint then
      raise exception 'Poddogodek mora biti znotraj obdobja nadrejenega dogodka.';
    end if;
  end if;
  if exists(select 1 from timeline_private.events where events.parent_id=event_id) then
    if end_date is null then raise exception 'Dogodek s poddogodki mora imeti konec.'; end if;
    if exists(select 1 from timeline_private.events child where child.parent_id=event_id
      and ((timeline_private.parse_date(child.start_text)->>'lower')::bigint < (start_date->>'lower')::bigint
       or (timeline_private.parse_date(coalesce(nullif(child.end_text,''),child.start_text))->>'upper')::bigint > (end_date->>'upper')::bigint)) then
      raise exception 'Obdobje mora zajemati vse poddogodke. Najprej uredi njihove datume.';
    end if;
  end if;
  insert into timeline_private.events(id,title,start_text,end_text,notes,color,revision,parent_id,image)
    values(event_id,event_title,start_date->>'value',coalesce(end_date->>'value',''),event_notes,event_color,gen_random_uuid(),chosen_parent,event_image)
  on conflict(id) do update set title=excluded.title,start_text=excluded.start_text,end_text=excluded.end_text,notes=excluded.notes,color=excluded.color,parent_id=excluded.parent_id,image=excluded.image,revision=excluded.revision,updated_at=now()
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
