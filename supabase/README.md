# Aktivacija Supabase za časovnico

Uporabi NOVI projekt za manjše aplikacije. Projekt vodniškega interfacea ostane ločen.

1. V novem projektu odpri **SQL Editor → New query**.
2. Prilepi celotno vsebino [setup.sql](setup.sql) in klikni **Run**. Skript ustvari shemo `timeline_private`, tabeli `events` in `settings` ter javno funkcijo `timeline_api`. V tabelah ni javnega dostopa. Javno branje in preverjanje gesla opravlja funkcija.
3. V novi zasebni SQL poizvedbi nastavi geslo. Zamenjaj `TVOJE_GESLO` z geslom iz pogovora. Te poizvedbe z resničnim geslom ne objavljaj na GitHubu.

```sql
insert into timeline_private.settings (singleton, password_hash)
values (true, extensions.crypt('TVOJE_GESLO', extensions.gen_salt('bf', 10)))
on conflict (singleton) do update set password_hash = excluded.password_hash;
```

4. V **Settings → Data API** poišči **Project URL**. V **Settings → API Keys** kopiraj **Publishable key** (`sb_publishable_…`) ali legacy **anon** key. Secret key in service_role key ostaneta zasebna.
5. Po prenosu obstoječih dogodkov nastavi `config.js`:

```js
window.TIMELINE_CONFIG = {
  provider: 'supabase',
  supabaseUrl: 'https://PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_...'
};
```

Javni ključ ni geslo. V tej aplikaciji javni ključ lahko pokliče samo namenski API; spreminjanje dogodkov zahteva geslo, ki ga funkcija preveri na strežniku. Geslo je shranjeno kot bcrypt hash v zasebni shemi. Branje dogodkov je javno.

## Prehod s Sheets

Priprava SQL in dodatna podpora v strani ne preklopita žive aplikacije samodejno. Trenutna konfiguracija ostane na Google Sheets, dokler ni novi projekt nastavljen in preverjen.

Obstoječe dogodke je treba pred preklopom prebrati iz stare shrambe, prenesti v novo bazo in primerjati imena, datume, opombe, barve ter število vnosov. Pri prenosu ohrani ID-je in praviloma revizije. Med končnim prenosom ne dodajaj ali urejaj vnosov v stari shrambi. Google preglednico ohrani kot kopijo, dokler ne potrdiš delovanja nove aplikacije.

Po preklopu vse nove dogodke shranjuje Supabase. Aplikacija pri pisanju in brisanju preverja revizije in prepreči prepis novejše spremembe. Podatki za datum ostanejo besedilo, da ohranijo leto brez meseca/dneva ter leta pred našim štetjem.

## Preverjanje pripravljene SQL kode

Osnovni testi: `npm test`. Preverjanje SQL v lokalnem PostgreSQL okolju PGlite:

```sh
npm install --no-save @electric-sql/pglite
node tests/supabase-check.cjs
```

Testi preverijo varovanje tabel, napačno geslo, zgodovinske datume, branje, dodajanje, urejanje, brisanje in zavračanje zastarelih sprememb. Živi projekt lahko preverimo po nastavitvi URL-ja in javnega ključa.
