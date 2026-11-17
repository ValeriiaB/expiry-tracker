/* Pure helpers (no DOM) so they can be tested in Node. */
(function (root) {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }
  function toISO(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function lastDayOfMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function parseISO(iso) {
    var p = String(iso).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function validDate(y, m, d) {
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
    return d <= lastDayOfMonth(y, m);
  }
  function fullYear(s, now) {
    var y = parseInt(s, 10);
    return s.length === 2 ? 2000 + y : y;
  }

  /** Whole days from today to the ISO date (negative = already expired). */
  function daysUntil(iso, now) {
    var t = now ? new Date(now) : new Date();
    var today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((parseISO(iso) - today) / 86400000);
  }

  var MONTHS = {
    JAN: 1, FEB: 2, FEV: 2, MAR: 3, APR: 4, AVR: 4, MAY: 5, MAI: 5,
    JUN: 6, JUI: 6, JUL: 7, AUG: 8, AOU: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12
  };
  function monthFromToken(tok) {
    if (tok.indexOf('JUIL') === 0 || tok === 'JUL') return 7;
    if (tok.indexOf('JUIN') === 0 || tok === 'JUN') return 6;
    return MONTHS[tok.slice(0, 3)] || 0;
  }

  /** Find every date-looking thing in OCR text. Returns [{iso, idx}]. */
  function findDates(raw, now) {
    var nowD = now ? new Date(now) : new Date();
    var yy = nowD.getFullYear() % 100;
    var text = String(raw || '').toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    // Typical OCR confusions next to digits: O/Q -> 0, I/l/| between digits -> 1
    text = text.replace(/(\d)[OQ]/g, '$10').replace(/[OQ](\d)/g, '0$1')
      .replace(/(\d)[I|](\d)/g, '$11$2');
    var out = [];

    function run(re, fn) {
      text = text.replace(re, function () {
        var args = Array.prototype.slice.call(arguments);
        var m = args.slice(0, -2);
        var idx = args[args.length - 2];
        var res = fn(m, idx);
        if (res) { out.push({ iso: res, idx: idx }); return ' '.repeat(m[0].length); }
        return m[0];
      });
    }

    // 2027-05-12
    run(/(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/g, function (m) {
      var y = +m[1], mo = +m[2], d = +m[3];
      return validDate(y, mo, d) ? toISO(y, mo, d) : null;
    });
    // 12/05/2027, 12.05.27, 12 05 2027
    run(/(\d{1,2})[\/.\-\s](\d{1,2})[\/.\-\s](\d{4}|\d{2})(?!\d)/g, function (m) {
      var d = +m[1], mo = +m[2], y = fullYear(m[3]);
      if (mo > 12 && d <= 12) { var t = d; d = mo; mo = t; }
      return validDate(y, mo, d) ? toISO(y, mo, d) : null;
    });
    // 12 MAY 2027, 12MAI27, 12 JUIN. 2027
    run(/(\d{1,2})\s*([A-Z]{3,5})\.?\s*['’]?(\d{4}|\d{2})(?!\d)/g, function (m) {
      var mo = monthFromToken(m[2]);
      if (!mo) return null;
      var d = +m[1], y = fullYear(m[3]);
      return validDate(y, mo, d) ? toISO(y, mo, d) : null;
    });
    // MAY 2027 (month only -> last day of month)
    run(/([A-Z]{3,5})\.?\s*['’]?(\d{4})(?!\d)/g, function (m) {
      var mo = monthFromToken(m[1]);
      var y = +m[2];
      if (!mo || !validDate(y, mo, 1)) return null;
      return toISO(y, mo, lastDayOfMonth(y, mo));
    });
    // 05/2027 or 05/27 (month only -> last day of month)
    run(/(\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/g, function (m) {
      var mo = +m[1], ys = m[2];
      if (ys.length === 2 && +ys < yy - 1) return null; // probably day.month, not month/year
      var y = fullYear(ys);
      if (!validDate(y, mo, 1)) return null;
      return toISO(y, mo, lastDayOfMonth(y, mo));
    });

    out.text = text;
    return out;
  }

  /** Best expiry guess: prefer dates near DLC/EXP/BBE style keywords, else the latest date. */
  function pickBestDate(raw, now) {
    var found = findDates(raw, now);
    if (!found.length) return null;
    var up = String(raw).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var kwRe = /(DLC|DDM|DLUO|BBE|BEST BEFORE|USE BY|EXP|CONSOMMER|MHD|A CONSOMMER)/g;
    var kws = [], k;
    while ((k = kwRe.exec(up))) kws.push(k.index + k[0].length);
    var withKw = found.filter(function (f) {
      return kws.some(function (end) { return f.idx >= end - 3 && f.idx - end <= 40; });
    });
    var pool = withKw.length ? withKw : found;
    return pool.map(function (f) { return f.iso; }).sort().pop();
  }

  /** Turn OCR text into candidate product-name lines. */
  function nameCandidates(raw) {
    return String(raw || '').split(/\r?\n/)
      .map(function (l) { return l.replace(/[^\p{L}\p{N}'’&.,\- ]/gu, ' ').replace(/\s+/g, ' ').trim(); })
      .filter(function (l) { return (l.match(/\p{L}/gu) || []).length >= 3; })
      .filter(function (l, i, a) { return a.indexOf(l) === i; })
      .slice(0, 8);
  }

  /** Typed digits -> "dd/mm/yy" (or dd/mm/yyyy). No trailing separator, so backspace works. */
  function formatDigits(str) {
    var d = String(str || '').replace(/\D/g, '').slice(0, 8);
    var out = d.slice(0, 2);
    if (d.length > 2) out += '/' + d.slice(2, 4);
    if (d.length > 4) out += '/' + d.slice(4, 8);
    return out;
  }
  /** "120527" or "12/05/27" or "12052027" -> "2027-05-12", or null if not a real date. */
  function parseTyped(str) {
    var d = String(str || '').replace(/\D/g, '');
    if (d.length !== 6 && d.length !== 8) return null;
    var day = +d.slice(0, 2), mo = +d.slice(2, 4);
    var y = d.length === 6 ? 2000 + +d.slice(4, 6) : +d.slice(4, 8);
    return validDate(y, mo, day) ? toISO(y, mo, day) : null;
  }
  function isoToTyped(iso) {
    var p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0].slice(2) : '';
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function makeBackup(items, now) {
    return {
      app: 'expiry-tracker', version: 1,
      exportedAt: (now ? new Date(now) : new Date()).toISOString(),
      items: items
    };
  }

  /** Returns items array or throws Error with a readable message. */
  function readBackup(jsonText) {
    var data;
    try { data = JSON.parse(jsonText); } catch (e) { throw new Error('This file is not valid JSON.'); }
    if (!data || data.app !== 'expiry-tracker' || !Array.isArray(data.items)) {
      throw new Error('This is not an Expiry Tracker backup.');
    }
    return data.items.filter(function (it) {
      return it && typeof it.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.date || '');
    }).map(function (it) {
      return { id: String(it.id || uid()), name: it.name.slice(0, 200), date: it.date };
    });
  }

  function icsEscape(s) { return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }

  /** All-day events with an alert 7 days before. */
  function buildICS(items, now) {
    var stamp = (now ? new Date(now) : new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Expiry Tracker//EN', 'CALSCALE:GREGORIAN'];
    items.forEach(function (it) {
      var d = it.date.replace(/-/g, '');
      lines.push('BEGIN:VEVENT',
        'UID:' + it.id + '@expiry-tracker',
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + d,
        'SUMMARY:' + icsEscape('Expires: ' + it.name),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Something expires in 7 days', 'TRIGGER:-P7D', 'END:VALARM',
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  var api = {
    pad: pad, toISO: toISO, parseISO: parseISO, lastDayOfMonth: lastDayOfMonth,
    daysUntil: daysUntil, findDates: findDates, pickBestDate: pickBestDate,
    nameCandidates: nameCandidates, formatDigits: formatDigits,
    parseTyped: parseTyped, isoToTyped: isoToTyped, uid: uid, makeBackup: makeBackup,
    readBackup: readBackup, buildICS: buildICS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExpiryLib = api;
})(typeof self !== 'undefined' ? self : this);
