# Časovnica

Preprosta spletna aplikacija v slovenščini za dogodke in obdobja. Prazen trak ob prvi uporabi, dodajanje in urejanje z geslom, opombe, barve, iskanje, povečava, seznam in mobilni prikaz.

## Enkratna aktivacija shranjevanja (Google Sheets)

Koda je pripravljena, živa skupna shramba pa deluje šele po naslednji objavi v tvojem Google računu. Geslo se preverja v Apps Script na strežniku; ni zapisano v javni kodi. Dogodki se ne shranjujejo samo v brskalnik.

1. Odpri **https://script.google.com/** in ustvari **New project**.
2. V datoteko **Code.gs** prilepi vsebino [backend/Code.gs](backend/Code.gs).
3. Dodaj skriptno datoteko **Dates** in vanjo prilepi [backend/Dates.gs](backend/Dates.gs).
4. Dodaj datoteko **HTML** z imenom **App** in vanjo prilepi [backend/App.html](backend/App.html). To je celotna aplikacija v eni datoteki, že pripravljena za objavo.
5. V **Project Settings → Script Properties → Add script property** nastavi:
   - Property: `EDITOR_PASSWORD`
   - Value: geslo, ki si ga določil v pogovoru
6. V urejevalniku izberi funkcijo **setup_** in klikni **Run**. Odobri dostop do Google Sheets. Funkcija ustvari preglednico **Časovnica – dogodki** in njen ID shrani sama. Povezava do preglednice se izpiše v dnevniku izvajanja. Ponoven zagon ne izbriše dogodkov.
7. Izberi **Deploy → New deployment → Web app**.
   - **Execute as:** Me
   - **Who has access:** Anyone
   - Klikni **Deploy** in kopiraj naslov, ki se konča z **/exec**.
8. Ta naslov je že delujoča spletna aplikacija s skupno shrambo. Odpri ga: prvi trak je prazen. Vsi obiskovalci vidijo iste dogodke, za spremembe pa morajo vnesti navedeno geslo. Preglednice ni treba javno deliti.

Google Workspace lahko omeji možnost objave za »Anyone«. V takem primeru uporabi račun, ki omogoča javne spletne aplikacije. Pri posodobitvi Apps Script izberi **Deploy → Manage deployments → Edit → New version → Deploy**, da obdržiš isti naslov.

### Uporaba na GitHub Pages ali drugem statičnem gostovanju

V [config.js](config.js) prilepi isti naslov `/exec`:

```js
window.TIMELINE_CONFIG = { endpoint: 'TUKAJ_PRILEPI_NASLOV_EXEC' };
```

Nato na GitHubu v **Settings → Pages → Deploy from a branch** izberi **main** in **/(root)**. Aplikacija bo po objavi dosegljiva na `https://nick3go.github.io/timeline/`. Začasno lahko naslov preizkusiš z gumbom **Povezava s shrambo**, toda tak naslov je shranjen le v trenutnem brskalniku; za druge obiskovalce ga nastavi v `config.js`.

GitHub Pages je statično gostovanje. Geslo in pisanje v Google Sheets zato opravlja Apps Script. Če brskalnik ali Google politika blokira povezavo iz statične strani, uporabi neposredni `/exec` naslov iz koraka 8; tam aplikacija komunicira z istim strežnikom prek `google.script.run`.

## Datumi

- `2026`: samo leto.
- `2026-10-07`: polni datum.
- `-500`: leto 500 pred našim štetjem.
- `-500-03-09`: 9. marec 500 pred našim štetjem.
- Leto 0 ne obstaja. Za letom -1 pride leto 1.
- Prazen konec pomeni posamezen dogodek, izpolnjen konec pa obdobje.
- Pri koncu, vpisanem samo kot leto, obdobje sega do konca tega leta. Pri začetku začne na začetku leta.
- Za razporejanje uporabljamo proleptični gregorijanski koledar; datumi se ne pretvarjajo iz julijanskega koledarja.

## Shranjevanje in urejanje

Branje je javno. Za vsako dodajanje, urejanje ali brisanje aplikacija zahteva geslo. Geslo se hrani samo v pomnilniku med odprtim obrazcem; ne shranjuje se v localStorage ali URL. Po zaprtju obrazca se počisti. Barve in opombe se shranijo skupaj z dogodki. Vnosi se preverijo tudi na strežniku. Zapisi imajo revizijo; zastarel vnos ne more prepisati novejšega. Skript uporablja zaklep pri pisanju in zaščito pred formulami v celicah. ID vnosov omogoča varno ponavljanje neuspešne zahteve brez ustvarjanja kopije dogodka.

Geslo ni omejitev dostopa do branja. Uporabniki z uredniškim dostopom do Apps Script lahko vidijo njegove lastnosti. Za zasebne ali zelo obremenjene projekte je primernejša shramba z uporabniškimi računi. Apps Script ima kvote; to je lahka aplikacija za manjšo skupino.

## Razvoj in preverjanje

Ni ogrodja, odvisnosti ali postopka namestitve. Potrebuješ Node 20+ in Python 3 za lokalni strežnik.

```sh
npm test
npm run build
npm start
```

`build` ustvari `backend/App.html` in `backend/Dates.gs` iz osnovnih datotek. Po spremembah jih znova kopiraj v Apps Script in objavi novo različico.

Datumski in strežniški testi preverijo datume pr. n. št., prehod iz -1 v 1, prestopna leta, neveljavne vnose, geslo in konflikte pri urejanju. `tests/browser.cjs` je preverjanje brskalnika s simuliranim strežnikom in zahteva Playwright. Živega Google backenda ni mogoče preveriti pred njegovo aktivacijo.

Uradna dokumentacija: [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web), [Properties Service](https://developers.google.com/apps-script/guides/properties), [Lock Service](https://developers.google.com/apps-script/reference/lock), [HTML service client communication](https://developers.google.com/apps-script/guides/html/communication).
