(function () {
  'use strict';
  var L = window.ExpiryLib;
  var KEY = 'expiry-tracker:v1';
  var WEEK_MS = 7 * 86400000;
  var state = { items: [], lastBackup: null };
  var view = 'cal';
  var cursor = new Date();           // month being shown
  var selected = L.toISO(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
  var editingId = null;
  var ocrTarget = null;

  function $(s) { return document.querySelector(s); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* ---------- storage ---------- */
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && Array.isArray(raw.items)) {
        state.lastBackup = raw.lastBackup || null;
        var bad = 0, fixed = 0;
        state.items = raw.items.filter(function (it) {
          if (!it || typeof it.name !== 'string') { bad++; return false; }
          if (/^\d{4}-\d{2}-\d{2}$/.test(it.date || '') && !isNaN(L.parseISO(it.date))) return true;
          var iso = L.parseTyped(it.date);        // repair dates saved as typed text, e.g. "050630"
          if (iso) { it.date = iso; fixed++; return true; }
          bad++; return false;
        });
        if (fixed || bad) {
          save();
          setTimeout(function () {
            toast((fixed ? 'Repaired ' + fixed + ' date(s). ' : '') + (bad ? bad + ' item(s) had no valid date and were removed.' : ''));
          }, 300);
        }
      }
    } catch (e) { /* first run */ }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Could not save. Is storage full?'); }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  /* ---------- helpers ---------- */
  function fmtDate(iso) {
    return L.parseISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function urgency(iso) {
    var d = L.daysUntil(iso);
    if (d <= 7) return 'urgent';
    if (d <= 30) return 'soon';
    return '';
  }
  function whenText(iso) {
    var d = L.daysUntil(iso);
    if (d < 0) return 'expired ' + (-d) + (d === -1 ? ' day ago' : ' days ago');
    if (d === 0) return 'today';
    if (d === 1) return 'tomorrow';
    return 'in ' + d + ' days';
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function sorted(list) {
    return list.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name); });
  }

  /* ---------- views ---------- */
  function show(name) {
    view = name;
    ['cal', 'add', 'settings'].forEach(function (v) { $('#view-' + v).hidden = v !== name; });
    document.querySelectorAll('nav button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    if (name === 'cal') renderCal();
    if (name === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  function itemRow(it, showDate) {
    var li = el('li');
    li.appendChild(el('span', 'badge ' + urgency(it.date)));
    li.appendChild(el('span', 'nm', it.name));
    var dt = el('span', 'dt', showDate ? fmtDate(it.date) + '\n' + whenText(it.date) : whenText(it.date));
    dt.style.whiteSpace = 'pre-line';
    li.appendChild(dt);
    li.addEventListener('click', function () { startEdit(it.id); });
    return li;
  }

  function renderCal() {
    // weekday header (Monday first)
    var wd = $('#weekdays');
    if (!wd.children.length) {
      var base = new Date(2024, 0, 1); // a Monday
      for (var i = 0; i < 7; i++) {
        var d = new Date(base); d.setDate(base.getDate() + i);
        wd.appendChild(el('div', '', d.toLocaleDateString(undefined, { weekday: 'narrow' })));
      }
    }
    var y = cursor.getFullYear(), m = cursor.getMonth();
    $('#month-label').textContent = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    var byDate = {};
    state.items.forEach(function (it) { (byDate[it.date] = byDate[it.date] || []).push(it); });

    var grid = $('#days');
    grid.textContent = '';
    var first = new Date(y, m, 1);
    var offset = (first.getDay() + 6) % 7;
    var start = new Date(y, m, 1 - offset);
    var todayISO = L.toISO(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
    for (var c = 0; c < 42; c++) {
      var day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + c);
      if (c >= 35 && day.getMonth() !== m) break;
      var iso = L.toISO(day.getFullYear(), day.getMonth() + 1, day.getDate());
      var b = el('button', 'day');
      b.type = 'button';
      if (day.getMonth() !== m) b.classList.add('out');
      if (iso === todayISO) b.classList.add('today');
      if (iso === selected) b.classList.add('selected');
      b.appendChild(el('span', '', String(day.getDate())));
      var dots = el('span', 'dots');
      var list = byDate[iso] || [];
      list.slice(0, 3).forEach(function () { dots.appendChild(el('span', 'dot ' + urgency(iso))); });
      if (list.length > 3) dots.appendChild(el('span', 'more', '+'));
      b.appendChild(dots);
      b.addEventListener('click', (function (isoDay, dayObj) {
        return function () {
          selected = isoDay;
          if (dayObj.getMonth() !== cursor.getMonth()) cursor = new Date(dayObj.getFullYear(), dayObj.getMonth(), 1);
          renderCal();
        };
      })(iso, day));
      grid.appendChild(b);
    }

    // selected day list
    $('#day-title').textContent = fmtDate(selected);
    var dl = $('#day-list');
    dl.textContent = '';
    var todays = sorted(byDate[selected] || []);
    if (!todays.length) dl.appendChild(el('li', 'empty', 'Nothing expires this day.')).style.cssText = 'background:none;border:0;cursor:default';
    todays.forEach(function (it) { dl.appendChild(itemRow(it, false)); });

    // soon strip: expired or within 7 days
    var soon = sorted(state.items.filter(function (it) { return L.daysUntil(it.date) <= 7; }));
    $('#soon').hidden = !soon.length;
    if (soon.length) {
      $('#soon-title').textContent = soon.length === 1 ? '1 item needs attention' : soon.length + ' items need attention';
      var sl = $('#soon-list');
      sl.textContent = '';
      soon.forEach(function (it) { sl.appendChild(itemRow(it, true)); });
    }

    $('#backup-banner').hidden = !backupDue();
  }

  function backupDue() {
    if (!state.items.length) return false;
    if (!state.lastBackup) return true;
    return Date.now() - new Date(state.lastBackup).getTime() > WEEK_MS;
  }

  /* ---------- add / edit ---------- */
  function resetForm() {
    editingId = null;
    $('#form').reset();
    $('#name-chips').textContent = '';
    setStatus('');
    $('#form-title').textContent = 'Add item';
    $('#delete').hidden = true;
    $('#cancel').hidden = true;
    $('#date').value = '';
  }
  function startEdit(id) {
    var it = state.items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    resetForm();
    editingId = id;
    $('#name').value = it.name;
    $('#date').value = L.isoToTyped(it.date);
    $('#form-title').textContent = 'Edit item';
    $('#delete').hidden = false;
    $('#cancel').hidden = false;
    show('add');
  }
  function setStatus(msg, isErr) {
    var s = $('#ocr-status');
    s.textContent = msg || '';
    s.classList.toggle('err', !!isErr);
  }

  $('#form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#name').value.trim();
    var date = L.parseTyped($('#date').value);
    if (!name) return;
    if (!date) {
      setStatus('Date not valid. Type 6 digits: day, month, year (e.g. 120527).', true);
      $('#date').focus();
      return;
    }
    if (editingId) {
      state.items.forEach(function (it) { if (it.id === editingId) { it.name = name; it.date = date; } });
    } else {
      state.items.push({ id: L.uid(), name: name, date: date });
    }
    save();
    var d = L.parseISO(date);
    cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    selected = date;
    resetForm();
    toast('Saved');
    show('cal');
  });
  $('#date').addEventListener('input', function () {
    this.value = L.formatDigits(this.value);
    if (this.value.replace(/\D/g, '').length >= 6) setStatus('');
  });
  $('#delete').addEventListener('click', function () {
    if (!editingId || !confirm('Delete this item?')) return;
    state.items = state.items.filter(function (it) { return it.id !== editingId; });
    save(); resetForm(); toast('Deleted'); show('cal');
  });
  $('#cancel').addEventListener('click', function () { resetForm(); show('cal'); });

  /* ---------- photo -> text (OCR runs on the phone) ---------- */
  document.querySelectorAll('.cam').forEach(function (b) {
    b.addEventListener('click', function () {
      ocrTarget = b.dataset.target;
      $('#photo').value = '';
      $('#photo').click();
    });
  });
  $('#photo').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (f) runOCR(f, ocrTarget);
  });

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('offline')); };
      document.head.appendChild(s);
    });
  }
  var workerPromise = null;
  function getWorker(onProgress) {
    if (!workerPromise) {
      workerPromise = (window.Tesseract ? Promise.resolve() :
        loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'))
        .then(function () {
          return window.Tesseract.createWorker('eng+fra', 1, {
            logger: function (m) { if (m.status === 'recognizing text') onProgress(m.progress); }
          });
        })
        .catch(function (e) { workerPromise = null; throw e; });
    }
    return workerPromise;
  }

  function prepareImage(file) {
    var bmp = window.createImageBitmap
      ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return null; })
      : Promise.resolve(null);
    return bmp.then(function (b) {
      if (b) return b;
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () { res(img); };
        img.onerror = rej;
        img.src = URL.createObjectURL(file);
      });
    }).then(function (img) {
      var w = img.width, h = img.height, max = 1800;
      var k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      var data = ctx.getImageData(0, 0, c.width, c.height), p = data.data;
      for (var i = 0; i < p.length; i += 4) {       // grayscale + contrast
        var g = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
        g = Math.max(0, Math.min(255, (g - 128) * 1.5 + 128));
        p[i] = p[i + 1] = p[i + 2] = g;
      }
      ctx.putImageData(data, 0, 0);
      return c;
    });
  }

  function runOCR(file, target) {
    var cams = document.querySelectorAll('.cam');
    cams.forEach(function (b) { b.disabled = true; });
    setStatus('Preparing photo…');
    prepareImage(file)
      .then(function (canvas) {
        setStatus('Loading text reader (first time needs internet)…');
        return getWorker(function (p) { setStatus('Reading… ' + Math.round(p * 100) + '%'); })
          .then(function (w) { return w.recognize(canvas); });
      })
      .then(function (r) {
        var text = (r && r.data && r.data.text) || '';
        if (target === 'date') {
          var best = L.pickBestDate(text);
          if (best) {
            $('#date').value = L.isoToTyped(best);
            setStatus('Found ' + fmtDate(best) + '. Please check it.');
          } else {
            setStatus('No date found. Try a closer, sharper photo or type it.', true);
          }
        } else {
          var cands = L.nameCandidates(text);
          var chips = $('#name-chips');
          chips.textContent = '';
          if (!cands.length) {
            setStatus('No text found. Try again or type the name.', true);
            return;
          }
          $('#name').value = cands[0];
          cands.slice(1).forEach(function (c) {
            var b = el('button', 'chip', c);
            b.type = 'button';
            b.addEventListener('click', function () { $('#name').value = c; });
            chips.appendChild(b);
          });
          setStatus('Name filled in. Tap another line below if it is better.');
        }
      })
      .catch(function (e) {
        setStatus(e && e.message === 'offline'
          ? 'Could not load the text reader. Connect to the internet once, or type it.'
          : 'Could not read the photo. Please type it.', true);
      })
      .then(function () { cams.forEach(function (b) { b.disabled = false; }); });
  }

  /* ---------- backup / restore / calendar export ---------- */
  function renderSettings() {
    var n = state.items.length;
    $('#backup-info').textContent = (n + (n === 1 ? ' item' : ' items')) + ' stored on this phone. ' +
      (state.lastBackup ? 'Last backup: ' + new Date(state.lastBackup).toLocaleString() : 'No backup yet.');
    $('#app-info').textContent = 'Expiry Tracker · data stays on this phone · no account';
  }

  function saveFile(name, mime, text) {
    var file = typeof File === 'function' ? new File([text], name, { type: mime }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: name }).then(function () { return true; })
        .catch(function (e) { if (e && e.name === 'AbortError') return false; throw e; });
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    return Promise.resolve(true);
  }

  function doBackup() {
    var day = new Date().toISOString().slice(0, 10);
    var json = JSON.stringify(L.makeBackup(state.items), null, 2);
    saveFile('expiry-backup-' + day + '.json', 'application/json', json).then(function (done) {
      if (!done) return;
      state.lastBackup = new Date().toISOString();
      save(); renderSettings(); renderCal();
      toast('Backup saved');
    }).catch(function () { toast('Backup failed'); });
  }
  $('#backup-now').addEventListener('click', doBackup);
  $('#banner-backup').addEventListener('click', doBackup);

  $('#restore').addEventListener('click', function () { $('#restore-file').value = ''; $('#restore-file').click(); });
  $('#restore-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var items = L.readBackup(String(r.result));
        if (!confirm('Replace the ' + state.items.length + ' items on this phone with ' + items.length + ' items from the backup?')) return;
        state.items = items;
        save(); renderSettings(); toast('Restored ' + items.length + ' items');
      } catch (e) { toast(e.message); }
    };
    r.readAsText(f);
  });

  $('#export-ics').addEventListener('click', function () {
    if (!state.items.length) { toast('Nothing to export yet'); return; }
    saveFile('expiry-calendar.ics', 'text/calendar', L.buildICS(state.items)).catch(function () { toast('Export failed'); });
  });

  /* ---------- nav + month controls ---------- */
  document.querySelectorAll('nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.view === 'add' && (view !== 'add' || editingId)) resetForm();
      show(b.dataset.view);
    });
  });
  $('#prev').addEventListener('click', function () { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); renderCal(); });
  $('#next').addEventListener('click', function () { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); renderCal(); });
  $('#month-label').addEventListener('click', function () {
    var t = new Date();
    cursor = new Date(t.getFullYear(), t.getMonth(), 1);
    selected = L.toISO(t.getFullYear(), t.getMonth() + 1, t.getDate());
    renderCal();
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && view === 'cal') renderCal(); });

  /* ---------- go ---------- */
  load();
  show('cal');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
