/* Historical civil dates: no year zero. Shared by browser, tests and Apps Script. */
const TimelineDates = (() => {
  function parse(input) {
    const m = String(input).trim().match(/^(-?\d{1,6})(?:-(\d{1,2})-(\d{1,2}))?$/);
    if (!m) throw new Error('Vpiši leto (npr. 2026 ali -500) ali datum LLLL-MM-DD.');
    const year = Number(m[1]);
    if (!year || Math.abs(year) > 999999) throw new Error('Leto 0 ne obstaja. Uporabi -1 ali 1.');
    const month = m[2] ? Number(m[2]) : null, day = m[3] ? Number(m[3]) : null;
    const astro = year < 0 ? year + 1 : year;
    const leap = astro % 4 === 0 && (astro % 100 !== 0 || astro % 400 === 0);
    const days = [31, leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
    if (month !== null && (month < 1 || month > 12 || day < 1 || day > days[month-1])) throw new Error('Ta datum ne obstaja.');
    return { year, month, day, value: String(year) + (month === null ? '' : '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0')) };
  }
  function serial(input, end = false) {
    const d = typeof input === 'string' ? parse(input) : input;
    const y = d.year < 0 ? d.year + 1 : d.year;
    // Gregorian days from a fixed epoch, supporting large and negative years.
    const month = d.month || (end ? 12 : 1), day = d.day || (end ? 31 : 1);
    const a = y - (month <= 2 ? 1 : 0), era = Math.floor(a / 400), yo = a - era * 400;
    const mp = month + (month > 2 ? -3 : 9);
    return era * 146097 + yo * 365 + Math.floor(yo/4) - Math.floor(yo/100) + Math.floor((153*mp+2)/5) + day - 1;
  }
  function format(input) {
    const d = typeof input === 'string' ? parse(input) : input;
    return (d.month ? `${d.day}. ${d.month}. ` : '') + Math.abs(d.year) + (d.year < 0 ? ' pr. n. št.' : '');
  }
  function fromSerial(n) {
    const era = Math.floor(n / 146097), doe = n - era * 146097;
    const yo = Math.floor((doe - Math.floor(doe/1460) + Math.floor(doe/36524) - Math.floor(doe/146096))/365);
    let y = yo + era * 400;
    const doy = doe - (365*yo + Math.floor(yo/4) - Math.floor(yo/100));
    const mp = Math.floor((5*doy+2)/153);
    const day = doy - Math.floor((153*mp+2)/5) + 1, month = mp + (mp < 10 ? 3 : -9);
    y += month <= 2 ? 1 : 0;
    return {year:y <= 0 ? y-1 : y,month,day};
  }
  function validate(event) {
    if (typeof event.title !== 'string' || !event.title.trim() || event.title.trim().length > 160) throw new Error('Ime dogodka mora imeti od 1 do 160 znakov.');
    const start = parse(event.start), end = event.end ? parse(event.end) : null;
    if (end && serial(end,true) < serial(start)) throw new Error('Konec ne sme biti pred začetkom.');
    if (typeof event.notes !== 'string' || event.notes.length > 5000) throw new Error('Opombe so lahko dolge največ 5000 znakov.');
    const color = ['red','blue','green','amber','purple'].includes(event.color) ? event.color : 'red';
    return {title:event.title.trim(),start:start.value,end:end ? end.value : '',notes:event.notes.trim(),color};
  }
  return {parse,serial,format,fromSerial,validate};
})();
if (typeof module !== 'undefined') module.exports = TimelineDates;
