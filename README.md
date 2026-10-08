# Časovnica

Preprosta aplikacija v slovenščini za dogodke in obdobja. Podpira opombe, barve, iskanje, povečavo, seznam, mobilni prikaz ter dodajanje in urejanje z geslom.

## Aktivna skupna shramba: Supabase

Stran na https://zgo.nickg.si/ uporablja skupni Supabase projekt za manjše aplikacije. Vsi obiskovalci vidijo iste dogodke. Projekt vodniškega interfacea je ločen.

Podatki časovnice so v zasebni shemi `timeline_private`. Javno branje in spremembe izvaja namenska funkcija `public.timeline_api`. Spremembe zahtevajo geslo, ki se na strežniku primerja z bcrypt hashom. Brskalnik ne more neposredno brati tabele z geslom ali pisati v tabelo dogodkov. Revizije in transakcijski zaklep preprečujejo prepis novejših sprememb.

[Navodila za nastavitev Supabase](supabase/README.md) · [SQL za novo bazo](supabase/setup.sql)

`config.js` vsebuje URL projekta in javni publishable ključ. Geslo ter secret/service_role ključi ne sodijo v repozitorij.

Obstoječi dogodki iz Google Sheets so preneseni. Koda Google Apps Script v `backend/` je ohranjena za staro različico; aktivna stran uporablja Supabase. Staro preglednico ohrani kot kopijo. Spremembe prek starega `/exec` naslova se ne prenesejo več na novo stran.

## Datumi

- `2026`: samo leto; `2026-10-07`: polni datum.
- `-500`: leto 500 pr. n. št.; `-500-03-09`: polni datum pred našim štetjem.
- Leto 0 ne obstaja; po -1 sledi 1.
- Prazen konec pomeni posamezen dogodek; izpolnjen konec pomeni obdobje.
- Leto brez meseca in dneva ohrani svojo natančnost. Začetek leta pomeni njegov prvi dan, konec leta pa zadnji dan.
- Za razporejanje uporabljamo proleptični gregorijanski koledar.

## Razvoj in preverjanje

Aplikacija je statični HTML/CSS/JavaScript brez ogrodja. Gostuje na GitHub Pages, Supabase pa opravlja shranjevanje in preverjanje gesla.

```sh
npm test
npm start
```

Za dodatno preverjanje SQL v lokalnem okolju PostgreSQL PGlite:

```sh
npm install --no-save @electric-sql/pglite
node tests/supabase-check.cjs
```

Testi preverjajo datume, ID-je v različnih brskalnikih, varovanje tabel, geslo, branje, pisanje, brisanje in konflikte. `npm run build` sestavi staro samostojno različico Google Apps Script; za objavo statične strani ta korak ni potreben.
