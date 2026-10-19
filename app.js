'use strict';
// Facilitator Command Center (development build, synthetic data). No framework, no inline script, textContent only.
(function () {
  var TZ = 'Asia/Dubai';
  var root = document.getElementById('app');
  var state = { user: null, tab: 'calendar', view: 'day', date: todayDubai(), company: '', items: [], loaded: null, drawer: null, controls: null, tabData: {}, search: '', status: '', assess: '' };

  // ------------------------------------------------------------ helpers
  function h(tag, props) {
    var e = document.createElement(tag);
    var kids = Array.prototype.slice.call(arguments, 2);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'class') e.className = props[k];
      else if (k === 'text') e.textContent = props[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]);
      else if (props[k] === true) e.setAttribute(k, '');
      else if (props[k] !== false && props[k] != null) e.setAttribute(k, props[k]);
    });
    (function add(list) { list.forEach(function (c) { if (c == null || c === false) return; if (Array.isArray(c)) { add(c); return; } e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); })(kids);
    return e;
  }
  function getToken() { try { return window.sessionStorage.getItem('pic_token'); } catch (e) { return window.__pic_token || null; } }
  function setToken(t) { window.__pic_token = t; try { if (t) window.sessionStorage.setItem('pic_token', t); else window.sessionStorage.removeItem('pic_token'); } catch (e) { /* kept in memory only */ } }
  function toast(msg, kind) {
    var box = document.querySelector('.toasts'); if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(box); }
    var t = h('div', { class: 'toast' + (kind ? ' ' + kind : ''), text: msg }); box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 350); }, 2600);
  }
  function toastFor(method, path) {
    if (method === 'GET' || /\/ui\/api\/(login|logout)$/.test(path)) return null;
    if (/\/release/.test(path)) return 'Result released';
    if (/\/action$/.test(path)) return 'Interview updated';
    if (/controls\/freeze/.test(path)) return 'Emergency freeze is ON';
    if (/controls\/enable/.test(path)) return 'Re-enable step recorded';
    if (/links/.test(path)) return 'Link step recorded';
    if (method === 'DELETE') return 'Removed';
    return 'Saved';
  }
  function api(method, path, body) {
    var base = window.PIC_API_BASE || '';
    var opts = { method: method, credentials: base ? 'omit' : 'same-origin', headers: {} };
    if (method !== 'GET') opts.headers['x-pic-csrf'] = '1';
    if (base) { var tk = getToken(); if (tk) opts.headers.authorization = 'Bearer ' + tk; }
    if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(base + path, opts).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (r.ok && toastFor(method, path)) toast(toastFor(method, path));
        if (j && j.token && (path === '/ui/api/login' || path === '/ui/api/login-sso') && base) setToken(j.token);
        if (path === '/ui/api/logout' && base) setToken(null);
        if (r.status === 401 && path !== '/ui/api/login') { state.user = null; render(); }
        if (!r.ok) { var e = new Error((j && j.error && j.error.message) || 'Request failed'); e.code = j && j.error && j.error.code; e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayDubai() { return new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 10); }
  function addDays(ds, n) { var d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dow(ds) { return new Date(ds + 'T00:00:00Z').getUTCDay(); }
  function isoStart(ds) { return ds + 'T00:00:00+04:00'; }
  function localDate(iso) { return new Date(Date.parse(iso) + 4 * 3600000).toISOString().slice(0, 10); }
  function localTime(iso) { return new Date(Date.parse(iso) + 4 * 3600000).toISOString().slice(11, 16); }
  function fmtDay(ds) { return new Date(ds + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function companyBadge(c) { return h('span', { class: 'co co-' + c, text: c }); }
  function chip(text, kind) { return h('span', { class: 'chip' + (kind ? ' ' + kind : ''), text: text }); }
  function statusLabel(s) { return ({ confirmed: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show' })[s] || s; }
  function statusKind(s) { return s === 'completed' ? 'ok' : (s === 'cancelled' || s === 'no_show') ? 'bad' : ''; }
  var ASSESS = { none: 'Not started', draft: 'Draft', submitted: 'Submitted', awaiting_advisor: 'Awaiting advisor', approved: 'Approved', released: 'Released' };

  // ------------------------------------------------------------ data
  // Smooth clicks: every menu click first redraws at once from what is already known (the company filter and the menus work on the loaded list, never on the network),
  // then fresh data is fetched quietly and the screen is redrawn when it arrives. Calendar ranges are cached (a bigger cached range also serves a smaller one) and the next/previous range is fetched ahead.
  var calCache = []; var resCache = {};
  function rangeFor(d, view) {
    d = d || state.date; view = view || state.view;
    if (view === 'day') return [d, addDays(d, 1)];
    if (view === 'week') { var s = addDays(d, -((dow(d) + 6) % 7)); return [s, addDays(s, 7)]; }
    var first = d.slice(0, 8) + '01'; var s2 = addDays(first, -((dow(first) + 6) % 7)); return [s2, addDays(s2, 42)];
  }
  function calLookup(r) {
    var f = Date.parse(isoStart(r[0])), t = Date.parse(isoStart(r[1])), best = null;
    calCache.forEach(function (e) { if (e.from <= f && e.to >= t && (!best || e.at > best.at)) best = e; });
    if (!best) return null;
    return { items: best.items.filter(function (i) { var s = Date.parse(i.start); return s >= f && s < t; }), exact: best.from === f && best.to === t, at: best.at };
  }
  function calFetch(r) {
    var f = Date.parse(isoStart(r[0])), t = Date.parse(isoStart(r[1]));
    return api('GET', '/ui/api/calendar?from=' + encodeURIComponent(isoStart(r[0])) + '&to=' + encodeURIComponent(isoStart(r[1]))).then(function (j) {
      calCache = calCache.filter(function (e) { return !(e.from === f && e.to === t); }); calCache.push({ from: f, to: t, items: j.items, at: Date.now() });
      if (calCache.length > 12) calCache.shift();
      return j.items;
    });
  }
  function loadCalendar() {
    if (state.tab !== 'calendar') return Promise.resolve();
    var r = rangeFor(); var key = isoStart(r[0]) + '|' + isoStart(r[1]); var hit = calLookup(r);
    if (hit && hit.exact && Date.now() - hit.at < 20000) return Promise.resolve();       // fresh enough: nothing to fetch
    return calFetch(r).then(function () {
      var now = rangeFor(); if (isoStart(now[0]) + '|' + isoStart(now[1]) === key && state.tab === 'calendar') { state.items = (calLookup(r) || { items: [] }).items; state.error = null; state.calLoading = false; }
      setTimeout(prefetchCalendar, 400);
    }).catch(function (e) { state.error = e.message; state.calLoading = false; });
  }
  function prefetchCalendar() {
    if (state.tab !== 'calendar' || !state.user) return;
    var step = state.view === 'day' ? 1 : state.view === 'week' ? 7 : 30;
    [step, -step].forEach(function (n) {
      var d = state.view === 'month' ? shiftMonth(n > 0 ? 1 : -1) : addDays(state.date, n); var r = rangeFor(d, state.view);
      if (!calLookup(r)) calFetch(r).catch(function () {});
    });
  }
  function loadWide() {
    var from = addDays(todayDubai(), -30), to = addDays(todayDubai(), 62);
    return api('GET', '/ui/api/calendar?from=' + encodeURIComponent(isoStart(from)) + '&to=' + encodeURIComponent(isoStart(to)))
      .then(function (j) { state.wide = j.items; state.error = null; }).catch(function (e) { state.error = e.message; });
  }
  function resKey() { var rr = resRange(); return '/ui/api/results?from=' + encodeURIComponent(isoStart(rr[0])) + '&to=' + encodeURIComponent(isoStart(rr[1])) + (state.company ? '&company=' + state.company : ''); }
  // what can be shown immediately for the current tab (called right after a click, before any network)
  function prime() {
    if (state.tab === 'calendar') { var hit = calLookup(rangeFor()); state.items = hit ? hit.items : []; state.calLoading = !hit; }
    if (state.tab === 'results') state.tabData.results = resCache[resKey()] || null;
  }
  function loadControls() { return api('GET', '/ui/api/controls').then(function (c) { state.controls = c; }).catch(function () {}); }

  // ------------------------------------------------------------ pieces
  function eventButton(it) {
    var d = it.details || {};
    var title = d.client_name || (it.details_unavailable ? 'Details unavailable' : 'Loading details');
    var chips = h('div', { class: 'chips' },
      chip(statusLabel(it.status), statusKind(it.status)),
      phase(it) === 'ongoing' ? chip('Ongoing now', 'warn') : null,
      it.rescheduled ? chip('Rescheduled', 'warn') : null,
      d.documents ? chip('Docs: ' + (d.documents.passport === 'valid' && d.documents.cv === 'valid' ? 'complete' : 'incomplete'), d.documents.passport === 'valid' && d.documents.cv === 'valid' ? 'ok' : 'warn') : null,
      isHistory(it) ? chip('Handled in ' + it.company + ' portal (history)', '') : chip('Assessment: ' + (ASSESS[it.assessment_status] || it.assessment_status), it.assessment_status === 'released' ? 'ok' : ''),
      d.advisor_confirmation ? chip('Advisor: ' + d.advisor_confirmation.replace('_', ' '), d.advisor_confirmation === 'confirmed' ? 'ok' : (d.advisor_confirmation === 'pending' ? 'warn' : '')) : null,
      d.verification_status ? chip('Verification: ' + d.verification_status, d.verification_status === 'verified' ? 'ok' : '') : null,
      d.result_release ? chip('Release: ' + d.result_release.replace('_', ' '), d.result_release === 'released' ? 'ok' : (d.result_release === 'ready' ? 'warn' : '')) : null);
    return h('button', { class: 'ev ' + it.company + ' ' + it.status, type: 'button', 'data-id': it.id, onclick: function () { openDrawer(it.id); },
      'aria-label': localTime(it.start) + ' ' + it.company + ' ' + title },
      h('div', { class: 'l1' }, h('strong', { text: localTime(it.start) + '-' + localTime(it.end) }), companyBadge(it.company), h('span', { text: title }),
        d.job_position ? h('span', { class: 'note', text: d.job_position }) : null, d.advisor_name ? h('span', { class: 'note', text: 'Advisor: ' + d.advisor_name }) : null),
      chips);
  }
  var STATUS_MENU = [['', 'All interviews'], ['upcoming', 'Upcoming'], ['ongoing', 'Ongoing now'], ['attended', 'Attended (completed)'], ['cancelled', 'Cancelled'], ['no_show', 'No-show'], ['rescheduled', 'Rescheduled']];
  var ASSESS_MENU = [['', 'Any assessment'], ['none', 'Not started'], ['draft', 'Draft'], ['submitted', 'Submitted'], ['awaiting_advisor', 'Awaiting advisor'], ['approved', 'Approved'], ['released', 'Released']];
  function phase(it) { var now = Date.now(); return it.status === 'confirmed' ? (Date.parse(it.start) <= now && now < Date.parse(it.end) ? 'ongoing' : (Date.parse(it.start) > now ? 'upcoming' : 'overdue')) : it.status; }
  // An older interview (imported after it took place) is read-only history only while its company system supplies no Counselor or job for it;
  // as soon as the company returns them (RGAB owner's decision 2026-10-19), the normal buttons come back by themselves.
  function isHistory(x) { var d = x.details || {}; return !!x.pre_launch && !d.advisor_name && !d.job_position && !d.advisor_confirmation; }
  function matches(it) {
    if (state.company && it.company !== state.company) return false;
    if (state.status) { var ph = phase(it); if (state.status === 'rescheduled' ? !it.rescheduled : state.status === 'attended' ? it.status !== 'completed' : state.status === 'upcoming' ? ph !== 'upcoming' : state.status === 'ongoing' ? ph !== 'ongoing' : it.status !== state.status) return false; }
    if (state.assess && it.assessment_status !== state.assess) return false;
    if (!state.search) return true;
    var q = state.search.toLowerCase(); var d = it.details || {};
    return [d.client_name, d.job_position, d.advisor_name, it.company, it.status].join(' ').toLowerCase().indexOf(q) >= 0;
  }

  function dayView(items, ds, marks) {
    var wrap = h('div', { class: 'card' });
    var list = items.filter(function (i) { return localDate(i.start) === ds && matches(i); }).sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); });
    wrap.appendChild(h('h2', { text: fmtDay(ds) + ' (Dubai time)' }));
    if (!list.length) wrap.appendChild(h('p', { class: 'note', text: 'No interviews on this day for the selected filter.' }));
    var rows = list.map(function (it) { return { t: localTime(it.start), node: eventButton(it) }; });
    (marks || []).forEach(function (m) { if (m.date === ds) rows.push({ t: m.time, node: h('div', { class: 'mark', text: m.text }) }); });
    if (ds === todayDubai()) { var nd = new Date(Date.now() + 4 * 3600000); rows.push({ t: pad(nd.getUTCHours()) + ':' + pad(nd.getUTCMinutes()), node: h('div', { class: 'nowline', text: 'Now' }) }); }
    rows.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : 0; });
    rows.forEach(function (r) { wrap.appendChild(h('div', { class: 'dayrow' }, h('div', { class: 't', text: r.t }), r.node)); });
    return wrap;
  }
  function weekView(items) {
    var r = rangeFor(); var box = h('div', { class: 'week' });
    for (var i = 0; i < 7; i++) {
      var ds = addDays(r[0], i); var col = h('div', { class: 'col' + (ds === todayDubai() ? ' today' : '') }, h('h3', { text: DOW[dow(ds)] + ' ' + ds.slice(8) + '/' + ds.slice(5, 7) }));
      var list = items.filter(function (it) { return localDate(it.start) === ds && matches(it); });
      list.forEach(function (it) { col.appendChild(eventButton(it)); });
      if (!list.length) col.appendChild(h('p', { class: 'note', text: '-' }));
      box.appendChild(col);
    }
    return box;
  }
  function monthView(items) {
    var r = rangeFor(); var box = h('div', { class: 'month' });
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(function (d) { box.appendChild(h('div', { class: 'dow', text: d })); });
    for (var i = 0; i < 42; i++) {
      var ds = addDays(r[0], i);
      var list = items.filter(function (it) { return localDate(it.start) === ds && matches(it) && it.status !== 'cancelled'; });
      var cell = h('button', { class: 'cell' + (ds.slice(0, 7) !== state.date.slice(0, 7) ? ' other' : '') + (ds === todayDubai() ? ' today' : ''), type: 'button', 'aria-label': ds + ', ' + list.length + ' interviews',
        onclick: (function (d0) { return function () { state.view = 'day'; state.date = d0; refresh(); }; })(ds) },
        h('span', { class: 'd', text: ds.slice(8) }), list.length ? h('span', { class: 'n', text: String(list.length) }) : null);
      list.slice(0, 3).forEach(function (it) { cell.appendChild(h('span', { class: 'mini ' + it.company, text: localTime(it.start) + ' ' + it.company + (it.details && it.details.client_name ? ' ' + it.details.client_name : '') })); });
      box.appendChild(cell);
    }
    return box;
  }

  function calendarTab() {
    var r = rangeFor();
    var title = state.view === 'month' ? new Date(state.date + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : state.view === 'week' ? fmtDay(r[0]) + ' - ' + fmtDay(addDays(r[1], -1)) : fmtDay(state.date);
    var step = state.view === 'day' ? 1 : state.view === 'week' ? 7 : 30;
    var bar = h('div', { class: 'toolbar' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, ['day', 'week', 'month'].map(function (v) {
        return h('button', { type: 'button', 'aria-pressed': String(state.view === v), text: v[0].toUpperCase() + v.slice(1), onclick: function () { state.view = v; refresh(); } });
      })),
      h('button', { class: 'btn secondary', type: 'button', text: 'Previous', onclick: function () { state.date = state.view === 'month' ? shiftMonth(-1) : addDays(state.date, -step); refresh(); } }),
      h('button', { class: 'btn secondary', type: 'button', text: 'Today', onclick: function () { state.date = todayDubai(); refresh(); } }),
      h('button', { class: 'btn secondary', type: 'button', text: 'Next', onclick: function () { state.date = state.view === 'month' ? shiftMonth(1) : addDays(state.date, step); refresh(); } }),
      h('span', { class: 'title', text: title }),
      h('input', { type: 'date', value: state.date, 'aria-label': 'Go to date', onchange: function (e) { if (e.target.value) { state.date = e.target.value; refresh(); } } }),
      companyFilter(), statusMenu(), searchBox());
    var body = state.view === 'day' ? dayView(state.items, state.date, breakMarks(state.date)) : state.view === 'week' ? weekView(state.items) : monthView(state.items);
    return h('div', null, statsStrip(), bar, state.error ? h('p', { class: 'err', text: state.error }) : null, state.calLoading ? h('p', { class: 'note', text: 'Loading interviews...' }) : null, body);
  }
  function statsStrip() {
    var items = (state.items || []).filter(function (i) { return i.status !== 'cancelled'; });
    var by = function (c) { return items.filter(function (i) { return i.company === c; }).length; };
    var attention = items.filter(function (i) { if (isHistory(i)) return false;  return i.status === 'completed' && ['none', 'draft', 'submitted'].indexOf(i.assessment_status) >= 0 || i.assessment_status === 'awaiting_advisor' || (i.assessment_status === 'approved' && i.status === 'completed'); }).length;
    var scope = state.view === 'day' ? 'this day' : state.view === 'week' ? 'this week' : 'this month';
    function tile(cls, num, lbl, company, tip) { return h('button', { class: 'stat ' + cls, type: 'button', 'aria-pressed': String(state.company === company && cls !== 's-ATT'), title: tip,
      onclick: function () { if (cls === 's-ATT') { state.tab = 'queues'; refresh(); return; } state.company = company; refresh(); } }, h('span', { class: 'num', text: String(num) }), h('span', { class: 'lbl', text: lbl })); }
    return h('div', { class: 'stats' }, tile('s-ALL', items.length, 'Interviews ' + scope, '', 'Show both companies'), tile('s-RGOS', by('RGOS'), 'RGOS', 'RGOS', 'Show RGOS only'), tile('s-RGAB', by('RGAB'), 'RGAB', 'RGAB', 'Show RGAB only'), tile('s-ATT', attention, 'Need your attention', '', 'Open the queues'));
  }
  // Tutorials: narrated videos, one per menu, listed in the left menu's last entry. Files live next to the page in videos/ (manifest.json lists them).
  function tutorialsTab() {
    var m = state.tabData.videos; var list = (m && m.chapters) || [];
    if (!list.length) return h('div', { class: 'card' }, h('h2', { text: 'Tutorials' }), h('p', { class: 'note', text: 'The tutorial videos are being prepared and will appear here.' }));
    var cur = state.tutorial && list.filter(function (c) { return c.id === state.tutorial; })[0] || list[0];
    var player = h('video', { class: 'player', controls: true, preload: 'metadata', src: 'videos/' + cur.file, 'aria-label': cur.title });
    if (cur.poster) player.setAttribute('poster', 'videos/' + cur.poster);
    var steps = list.map(function (c) {
      return h('button', { class: 'chap' + (c.id === cur.id ? ' on' : ''), type: 'button', 'data-chapter': c.id, onclick: function () { state.tutorial = c.id; state.fx = true; renderMain(); } },
        h('span', { class: 'chap-n', text: String(list.indexOf(c) + 1) }), h('span', { class: 'chap-t' }, h('strong', { text: c.title }), h('span', { class: 'note', text: (c.minutes ? c.minutes + ' min - ' : '') + (c.summary || '') })));
    });
    var yt = m.youtube && /^[A-Za-z0-9_-]{10,60}$/.test(m.youtube.playlist || '') ? h('div', { class: 'card' }, h('h2', { text: 'Also on YouTube (unlisted playlist)' }),
      h('iframe', { class: 'player', src: 'https://www.youtube-nocookie.com/embed/videoseries?list=' + m.youtube.playlist, title: 'Tutorial playlist', allow: 'fullscreen', referrerpolicy: 'strict-origin-when-cross-origin' })) : null;
    var markers = (cur.markers || []).length ? h('div', { class: 'markers', 'aria-label': 'Jump to a chapter' }, cur.markers.map(function (mk) { return h('button', { class: 'btn secondary mk', type: 'button', text: Math.floor(mk.t / 60) + ':' + (mk.t % 60 < 10 ? '0' : '') + (mk.t % 60) + ' ' + mk.title, onclick: function () { player.currentTime = mk.t; player.play().catch(function () {}); } }); })) : null;
    var learned = {}; try { learned = JSON.parse(window.localStorage.getItem('pic_learned') || '{}'); } catch (e) { learned = {}; }
    var points = (cur.points || []).length ? h('div', { class: 'points' }, h('h3', { text: 'Remember' }), (cur.points || []).map(function (pt, i) {
      var key = cur.id + ':' + i; var cb = h('input', { type: 'checkbox', id: 'pt-' + key, checked: !!learned[key], onchange: function (e) { learned[key] = e.target.checked; try { window.localStorage.setItem('pic_learned', JSON.stringify(learned)); } catch (x) { /* optional */ } } });
      return h('label', { class: 'pt', for: 'pt-' + key }, cb, h('span', { text: pt })); })) : null;
    return h('div', { class: 'tutorials' }, h('div', null, h('div', { class: 'card' }, h('h2', { text: cur.title }), player, markers, h('p', { class: 'note', text: cur.summary || '' }), points), yt), h('div', { class: 'card chapters' }, h('h2', { text: 'Chapters' }), steps));
  }
  function shiftMonth(n) { var d = new Date(state.date + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n, 1); return d.toISOString().slice(0, 10); }
  function breakMarks(ds) {
    var out = [];
    ((state.tabData.avail || {}).recurring || []).forEach(function (b) { if (b.weekdays.indexOf(dow(ds)) >= 0) out.push({ date: ds, time: b.start, text: 'Break ' + b.start + '-' + b.end + ' (' + b.label + ')' }); });
    ((state.tabData.avail || {}).unavailability || []).forEach(function (u) { if (localDate(u.start) <= ds && localDate(u.end) >= ds) out.push({ date: ds, time: localTime(u.start), text: u.kind + ': ' + (u.reason || 'unavailable') }); });
    return out;
  }
  function menu(id, label, opts, key) {
    var sel = h('select', { id: id, 'aria-label': label, title: label, onchange: function (e) { state[key] = e.target.value; refresh(); } }, opts.map(function (o) { return h('option', { value: o[0], text: o[1], selected: state[key] === o[0] }); }));
    return sel;
  }
  function statusMenu() { return h('span', { class: 'menus' }, menu('status-filter', 'Interview status', STATUS_MENU, 'status'), menu('assess-filter', 'Assessment result', ASSESS_MENU, 'assess')); }
  function companyFilter() {
    return h('div', { class: 'seg', role: 'group', 'aria-label': 'Company filter' }, [['', 'Both'], ['RGOS', 'RGOS'], ['RGAB', 'RGAB']].map(function (o) {
      return h('button', { type: 'button', 'aria-pressed': String(state.company === o[0]), text: o[1], onclick: function () { state.company = o[0]; refresh(); } });
    }));
  }
  function searchBox() {
    var inp = h('input', { type: 'search', placeholder: 'Search client, job, advisor', 'aria-label': 'Search', value: state.search, oninput: function (e) { state.search = e.target.value; clearTimeout(searchBox.t); searchBox.t = setTimeout(function () { var pos = e.target.selectionStart; renderMain(); var again = document.querySelector('input[type=search]'); if (again) { again.focus(); again.setSelectionRange(pos, pos); } }, 200); } });
    return inp;
  }

  // ------------------------------------------------------------ queues
  function queueTable(rows, empty) {
    if (!rows.length) return h('p', { class: 'note', text: empty });
    var t = h('table', null, h('thead', null, h('tr', null, ['When (Dubai)', 'Company', 'Client', 'Job', 'Advisor', 'Interview', 'Docs', 'Assessment', 'Advisor confirm', 'Release'].map(function (x) { return h('th', { text: x }); }))));
    var tb = h('tbody');
    rows.forEach(function (it) {
      var d = it.details || {};
      var tr = h('tr', { 'data-id': it.id, tabindex: '0', onclick: function () { openDrawer(it.id); }, onkeydown: function (e) { if (e.key === 'Enter') openDrawer(it.id); } },
        h('td', { text: localDate(it.start) + ' ' + localTime(it.start) }), h('td', null, companyBadge(it.company)), h('td', { text: d.client_name || '-' }), h('td', { text: d.job_position || '-' }),
        h('td', { text: d.advisor_name || '-' }), h('td', { text: statusLabel(it.status) }),
        h('td', { text: d.documents ? (d.documents.passport === 'valid' && d.documents.cv === 'valid' ? 'complete' : 'incomplete') : '-' }),
        h('td', { text: ASSESS[it.assessment_status] }), h('td', { text: d.advisor_confirmation ? d.advisor_confirmation.replace('_', ' ') : '-' }), h('td', { text: d.result_release ? d.result_release.replace('_', ' ') : '-' }));
      tb.appendChild(tr);
    });
    t.appendChild(tb); return h('div', { class: 'scroll-x' }, t);
  }
  function queuesTab() {
    var all = (state.wide || []).filter(matches).filter(function (i) { return !isHistory(i); }); var now = Date.now();
    var sec = function (title, rows, empty) { return h('div', { class: 'card' }, h('h2', { text: title + ' (' + rows.length + ')' }), queueTable(rows, empty)); };
    var upcoming = all.filter(function (i) { return i.status === 'confirmed' && Date.parse(i.end) >= now; });
    var needResult = all.filter(function (i) { return i.status === 'completed' && ['none', 'draft', 'submitted'].indexOf(i.assessment_status) >= 0; });
    var pendingAdvisor = all.filter(function (i) { return i.assessment_status === 'awaiting_advisor'; });
    var ready = all.filter(function (i) { return i.assessment_status === 'approved' && i.status === 'completed'; });
    var done = all.filter(function (i) { return i.status === 'completed' || i.assessment_status === 'released'; });
    return h('div', null, h('div', { class: 'toolbar' }, companyFilter(), statusMenu(), searchBox()), state.error ? h('p', { class: 'err', text: state.error }) : null,
      sec('Interview queue - upcoming', upcoming, 'Nothing scheduled.'),
      h('div', { class: 'grid2' },
        sec('Assessment queue - to be written', needResult, 'Nothing waiting.'),
        sec('Pending advisor confirmations', pendingAdvisor, 'Nothing waiting for an advisor.'),
        sec('Results ready for release', ready, 'No results are ready.')),
      sec('Completed interviews', done, 'None yet.'),
      sec('Cancelled interviews', all.filter(function (i) { return i.status === 'cancelled'; }), 'None.'),
      sec('No-show records', all.filter(function (i) { return i.status === 'no_show'; }), 'None.'));
  }

  // ------------------------------------------------------------ results sent: what happened to every released assessment result
  // The core knows when a result was released; e-mail delivery, opening and the client's answer are reported by the owning company.
  var RES_STATE = {
    accepted: ['Accepted', 'ok'], rejected: ['Rejected', 'bad'], ignored: ['Ignored', 'warn'], opened: ['Opened', ''], delivered: ['Delivered', ''], sent: ['Sent', ''],
    bounced: ['Not delivered', 'bad'], waiting_for_company: ['Waiting for company report', 'warn']
  };
  // Reporting periods in Dubai time. Weeks run Monday to Sunday; months are calendar months. Returns [first day, day after the last day].
  var RES_PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['lastweek', 'Last week'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Custom range']];
  function resRange() {
    var t = todayDubai(); var k = state.resPreset || '30d';
    var mon = addDays(t, -((new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7)); var m1 = t.slice(0, 8) + '01';
    var prevM = function (ds) { var d = new Date(ds + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10); };
    var nextM = function (ds) { var d = new Date(ds + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); };
    if (k === 'today') return [t, addDays(t, 1)];
    if (k === 'yesterday') return [addDays(t, -1), t];
    if (k === 'week') return [mon, addDays(mon, 7)];
    if (k === 'lastweek') return [addDays(mon, -7), mon];
    if (k === '7d') return [addDays(t, -6), addDays(t, 1)];
    if (k === 'month') return [m1, nextM(m1)];
    if (k === 'lastmonth') return [prevM(m1), m1];
    if (k === 'custom' && state.resFrom && state.resTo && state.resFrom <= state.resTo) return [state.resFrom, addDays(state.resTo, 1)];
    return [addDays(t, -29), addDays(t, 1)];
  }
  function resultsTab() {
    var r = state.tabData.results;
    var preset = h('select', { id: 'res-preset', 'aria-label': 'Reporting period', onchange: function (e) { state.resPreset = e.target.value; refreshTab(); } }, RES_PRESETS.map(function (o) { return h('option', { value: o[0], text: o[1], selected: (state.resPreset || '30d') === o[0] }); }));
    var rg = resRange(); var win = h('div', { class: 'toolbar-group' }, preset);
    if ((state.resPreset || '') === 'custom') { win.appendChild(h('input', { type: 'date', id: 'res-from', value: state.resFrom || rg[0], 'aria-label': 'From', onchange: function (e) { state.resFrom = e.target.value; state.resTo = state.resTo || e.target.value; refreshTab(); } })); win.appendChild(h('input', { type: 'date', id: 'res-to', value: state.resTo || addDays(rg[1], -1), 'aria-label': 'To', onchange: function (e) { state.resTo = e.target.value; state.resFrom = state.resFrom || e.target.value; refreshTab(); } })); }
    win.appendChild(h('span', { class: 'note', text: rg[0] + (addDays(rg[1], -1) !== rg[0] ? ' to ' + addDays(rg[1], -1) : '') + ' (Dubai)' }));
    var bar = h('div', { class: 'toolbar' }, win, companyFilter(), h('button', { class: 'btn secondary', type: 'button', text: 'Refresh', onclick: function () { refreshTab(); } }));
    if (!r) return h('div', null, bar, state.error ? h('p', { class: 'err', text: state.error }) : h('p', { class: 'note', text: 'Loading...' }));
    var c = r.counts, p = r.pipeline;
    function pct(n) { return c.released ? Math.round(100 * n / c.released) + '% of sent' : ''; }
    function tile(cls, num, lbl, sub) { return h('div', { class: 'stat ' + cls }, h('span', { class: 'num', text: String(num) }), h('span', { class: 'lbl', text: lbl }), sub ? h('span', { class: 'note', text: sub }) : null); }
    var tiles = h('div', { class: 'stats' },
      tile('s-ALL', p.interviews_completed, 'Interviews completed', p.no_show ? p.no_show + ' no-show' : ''),
      tile('s-ALL', p.assessment_submitted, 'Assessments written', p.with_advisor + ' with an advisor, ' + p.approved_not_released + ' ready to send'),
      tile('s-ALL', c.released, 'Results sent', 'released from here'),
      tile('s-ALL', c.delivered, 'Received (e-mail delivered)', pct(c.delivered)),
      tile('s-ALL', c.opened, 'Opened', pct(c.opened)),
      tile('s-RGAB', c.accepted, 'Accepted', pct(c.accepted)),
      tile('s-ATT', c.rejected, 'Rejected', pct(c.rejected)),
      tile('s-ATT', c.ignored, 'Ignored', 'no answer after ' + r.ignore_after_days + ' days'),
      tile('s-ATT', c.bounced, 'Not delivered', 'bounced or failed'),
      tile('s-ATT', c.waiting_for_company, 'Waiting for company report', 'sent, but the company has not reported yet'));
    var steps = [['Interviews completed', p.interviews_completed], ['Assessments written', p.assessment_submitted], ['Results sent', c.released], ['Delivered', c.delivered], ['Opened', c.opened], ['Accepted', c.accepted]];
    var top = Math.max(1, p.interviews_completed, p.assessment_submitted, c.released);
    var funnel = h('div', { class: 'card' }, h('h2', { text: 'From interview to answer' }), steps.map(function (s) {
      var fill = h('span', { class: 'fill' }); fill.style.width = Math.max(s[1] ? 2 : 0, Math.round(100 * s[1] / top)) + '%';
      return h('div', { class: 'funnel-row' }, h('span', { class: 'fl', text: s[0] }), h('span', { class: 'ftrack' }, fill), h('span', { class: 'fn', text: String(s[1]) }));
    }));
    function cell(co) { var b = r.by_company[co] || {}; return [co, b.released || 0, b.delivered || 0, b.opened || 0, b.accepted || 0, b.rejected || 0, b.ignored || 0, b.bounced || 0, b.waiting_for_company || 0]; }
    var per = h('div', { class: 'card scroll-x' }, h('h2', { text: 'By company' }),
      h('table', null, h('thead', null, h('tr', null, ['Company', 'Sent', 'Delivered', 'Opened', 'Accepted', 'Rejected', 'Ignored', 'Not delivered', 'Waiting'].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', null, ['RGOS', 'RGAB'].filter(function (co) { return !state.company || state.company === co; }).map(function (co) { return h('tr', null, cell(co).map(function (x, i) { return h('td', { text: String(x), class: i === 0 ? 'co ' + co : '' }); })); }))));
    function rate(a, b) { return b > 0 ? Math.round(1000 * a / b) / 10 + '%' : 'N/A'; }
    var advRows = (r.by_advisor || []).map(function (a) {
      var decided = a.accepted + a.rejected;
      return h('tr', null, h('td', { text: a.advisor_name || ('Advisor ' + String(a.advisor_ref).slice(0, 8)) }), h('td', null, h('span', { class: 'co ' + a.company, text: a.company })),
        [a.released, a.delivered, a.opened, a.accepted, a.rejected, a.released - decided - a.bounced - a.waiting_for_company - a.ignored, a.ignored].map(function (x) { return h('td', { text: String(x) }); }),
        h('td', { text: rate(a.delivered, a.released) }), h('td', { text: rate(a.accepted, decided) + (decided ? ' (of ' + decided + ')' : '') }), h('td', { text: rate(a.rejected, decided) }),
        h('td', { text: a.avg_answer_hours === null || a.avg_answer_hours === undefined ? 'N/A' : a.avg_answer_hours + ' h' }));
    });
    var advisors = h('div', { class: 'card scroll-x' }, h('h2', { text: 'By advisor / counselor' }),
      h('p', { class: 'note', text: 'Acceptance and rejection rate = accepted (or rejected) divided by the results the client has answered; the number it is based on is shown. N/A means there is nothing to divide by yet. Answer time = from sending to the client answer.' }),
      advRows.length ? h('table', null, h('thead', null, h('tr', null, ['Advisor', 'Company', 'Sent', 'Delivered', 'Opened', 'Accepted', 'Rejected', 'Pending', 'Ignored', 'Delivery rate', 'Acceptance rate', 'Rejection rate', 'Avg answer time'].map(function (x) { return h('th', { text: x }); }))), h('tbody', null, advRows))
        : h('p', { class: 'note', text: 'No results were sent in this period.' }));
    var rows = r.items.map(function (i) {
      var st = RES_STATE[i.state] || [i.state, '']; var ev = i.events || {};
      var when = function (k) { return ev[k] ? localDate(ev[k]) + ' ' + localTime(ev[k]) : '-'; };
      var delivered = ev.email_delivered || ev.opened || ev.accepted || ev.rejected;
      return h('tr', null,
        h('td', { text: localDate(i.released_at) + ' ' + localTime(i.released_at) }), h('td', null, h('span', { class: 'co ' + i.company, text: i.company })),
        h('td', { text: (i.history ? 'Client ' + String(i.client_ref).slice(0, 10) + ' (earlier record)' : (i.client_name || (i.details_unavailable ? 'Details unavailable' : ''))) + (i.advisor_name ? ' (' + i.advisor_name + ')' : '') }), h('td', { text: i.start ? localDate(i.start) + ' ' + localTime(i.start) : '-' }),
        h('td', { text: ev.email_bounced && !delivered ? 'Not delivered' : delivered ? 'Delivered' : ev.email_sent ? 'Sent' : '-' }),
        h('td', { text: ev.opened || ev.accepted || ev.rejected ? 'Yes' + (ev.opened ? ' - ' + when('opened') : '') : 'No' }),
        h('td', { text: ev.accepted ? 'Accepted ' + when('accepted') : ev.rejected ? 'Rejected ' + when('rejected') : '-' }),
        h('td', null, h('span', { class: 'chip ' + st[1], text: st[0] })));
    });
    var sent = h('div', { class: 'card scroll-x' }, h('h2', { text: 'Sent items (' + r.items.length + ')' }),
      h('p', { class: 'note', text: 'Times are Dubai time. "Ignored" means the client has not answered ' + r.ignore_after_days + ' days after the result was sent; it is only counted for a company whose system reports client answers' + ((r.answers_tracked_by || []).length ? ' (now: ' + r.answers_tracked_by.join(', ') + ')' : ' (none yet)') + '. "Waiting for company report" means the result was released but the company system has not reported on it yet.' }),
      r.items.length ? h('table', null, h('thead', null, h('tr', null, ['Sent', 'Company', 'Client', 'Interview', 'E-mail', 'Opened', 'Client answer', 'Status'].map(function (x) { return h('th', { text: x }); }))), h('tbody', null, rows))
        : h('p', { class: 'note', text: 'No results were sent in this period.' }));
    return h('div', null, bar, state.error ? h('p', { class: 'err', text: state.error }) : null, tiles, h('div', { class: 'grid2' }, funnel, per), advisors, sent);
  }

  // ------------------------------------------------------------ availability
  function availabilityTab() {
    var a = state.tabData.avail || { unavailability: [], recurring: [] };
    var msg = h('p', { class: 'err', id: 'availmsg' });
    var kind = h('select', { id: 'lv-kind', 'aria-label': 'Type' }, ['leave', 'holiday', 'break', 'temporary'].map(function (k) { return h('option', { value: k, text: k }); }));
    var s = h('input', { type: 'datetime-local', id: 'lv-start', 'aria-label': 'From (Dubai time)' }); var e = h('input', { type: 'datetime-local', id: 'lv-end', 'aria-label': 'Until (Dubai time)' });
    var reason = h('input', { type: 'text', id: 'lv-reason', placeholder: 'Reason (optional)', maxlength: '200', 'aria-label': 'Reason' });
    var recWd = h('input', { type: 'text', id: 'rb-days', value: '0,1,2,3,4,5,6', 'aria-label': 'Weekdays 0=Sun' });
    var recS = h('input', { type: 'time', id: 'rb-start', value: '14:00' }); var recE = h('input', { type: 'time', id: 'rb-end', value: '15:00' }); var recL = h('input', { type: 'text', id: 'rb-label', value: 'Break', maxlength: '80' });
    return h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', { text: 'Leave, holidays and temporary unavailability' }),
        h('p', { class: 'note', text: 'Times are Dubai time. Time that already has a booked interview cannot be blocked; cancel or move the interview first.' }),
        h('div', { class: 'field' }, h('label', { text: 'Type' }), kind), h('div', { class: 'field' }, h('label', { text: 'From' }), s), h('div', { class: 'field' }, h('label', { text: 'Until' }), e), h('div', { class: 'field' }, h('label', { text: 'Reason' }), reason),
        h('button', { class: 'btn', type: 'button', text: 'Add unavailable period', onclick: function () {
          if (!s.value || !e.value) { msg.textContent = 'Choose from and until.'; return; }
          api('POST', '/ui/api/availability', { start: s.value + ':00+04:00', end: e.value + ':00+04:00', kind: kind.value, reason: reason.value }).then(function () { return refreshTab(); }).catch(function (x) { msg.textContent = x.code === 'conflicts_with_bookings' ? 'Blocked: interviews are already booked in that period.' : x.message; });
        } }), msg,
        h('table', null, h('thead', null, h('tr', null, ['Type', 'From', 'Until', 'Reason', ''].map(function (x) { return h('th', { text: x }); }))),
          h('tbody', null, a.unavailability.map(function (u) {
            return h('tr', null, h('td', { text: u.kind }), h('td', { text: localDate(u.start) + ' ' + localTime(u.start) }), h('td', { text: localDate(u.end) + ' ' + localTime(u.end) }), h('td', { text: u.reason || '' }),
              h('td', null, h('button', { class: 'btn secondary', type: 'button', text: 'Remove', onclick: function () { api('DELETE', '/ui/api/availability/' + u.id).then(refreshTab); } })));
          })))),
      h('div', { class: 'card' }, h('h2', { text: 'Recurring daily breaks' }),
        h('table', null, h('thead', null, h('tr', null, ['Label', 'Days', 'Time', ''].map(function (x) { return h('th', { text: x }); }))),
          h('tbody', null, a.recurring.map(function (b) {
            return h('tr', null, h('td', { text: b.label }), h('td', { text: b.weekdays.map(function (d) { return DOW[d]; }).join(' ') }), h('td', { text: b.start + '-' + b.end }),
              h('td', null, h('button', { class: 'btn secondary', type: 'button', text: 'Remove', onclick: function () { api('DELETE', '/ui/api/recurring-break/' + b.id).then(refreshTab).catch(function (x) { msg.textContent = x.message; }); } })));
          }))),
        h('h3', { text: 'Add a recurring break' }),
        h('div', { class: 'field' }, h('label', { text: 'Weekdays (0 = Sunday ... 6 = Saturday, comma separated)' }), recWd),
        h('div', { class: 'field' }, h('label', { text: 'From' }), recS), h('div', { class: 'field' }, h('label', { text: 'Until' }), recE), h('div', { class: 'field' }, h('label', { text: 'Label' }), recL),
        h('button', { class: 'btn', type: 'button', text: 'Add recurring break', onclick: function () {
          var days = recWd.value.split(',').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x >= 0 && x <= 6; });
          api('POST', '/ui/api/recurring-break', { label: recL.value, weekdays: days, start: recS.value, end: recE.value }).then(refreshTab).catch(function (x) { msg.textContent = x.code === 'conflicts_with_bookings' ? 'Blocked: interviews are already booked in that window.' : x.message; });
        } })),
      scheduleCard(),
      extraCard(),
      profilesCard());
  }
  function scheduleCard() {
    var rows = (state.tabData.schedule || { items: [] }).items; var isAppr = state.user && state.user.role === 'approver'; var msg = h('p', { class: 'err', id: 'schedmsg' });
    var cur = rows[0] || { weekdays: [0, 1, 2, 3, 4, 5, 6], first_start: '10:00', last_start: '20:00' };
    var days = h('input', { type: 'text', id: 'sc-days', value: cur.weekdays.join(','), 'aria-label': 'Weekdays 0=Sunday' });
    var f = h('input', { type: 'time', id: 'sc-first', value: cur.first_start }); var l = h('input', { type: 'time', id: 'sc-last', value: cur.last_start });
    return h('div', { class: 'card' }, h('h2', { text: 'Working schedule of the facilitator' }),
      h('p', { class: 'note', text: 'Applies to both companies and takes priority over company hours: a time must be inside both. Daily breaks and leave are set above. Existing appointments are never changed by editing the schedule.' }),
      rows.length ? h('p', null, 'Days ' + cur.weekdays.map(function (d) { return DOW[d]; }).join(' ') + ', first start ' + cur.first_start + ', last start ' + cur.last_start + ' (Dubai time)') : h('p', { class: 'note', text: 'No schedule set.' }),
      isAppr ? h('div', null, h('div', { class: 'field' }, h('label', { text: 'Weekdays (0 = Sunday ... 6 = Saturday)' }), days), h('div', { class: 'field' }, h('label', { text: 'First start' }), f), h('div', { class: 'field' }, h('label', { text: 'Last start' }), l),
        h('button', { class: 'btn', type: 'button', id: 'sc-save', text: 'Save schedule', onclick: function () {
          var d = days.value.split(',').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x >= 0 && x <= 6; });
          api('PUT', '/ui/api/schedule', { weekdays: d, first_start: f.value, last_start: l.value }).then(function (r) { msg.className = 'ok'; msg.textContent = r.existing_outside ? 'Saved. ' + r.existing_outside + ' existing appointment(s) are outside the new schedule and were left untouched.' : 'Saved.'; return refreshTab(); }).catch(function (x) { msg.className = 'err'; msg.textContent = x.message; });
        } }), msg) : h('p', { class: 'note', text: 'Only an approver can change the schedule.' }));
  }
  function extraCard() {
    var items = (state.tabData.extra || { items: [] }).items; var isAppr = state.user && state.user.role === 'approver'; var msg = h('p', { class: 'err', id: 'extramsg' });
    var comp = h('select', { id: 'ex-company', 'aria-label': 'Company' }, [['', 'Both companies'], ['RGOS', 'RGOS only'], ['RGAB', 'RGAB only']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var s = h('input', { type: 'datetime-local', id: 'ex-start', 'aria-label': 'From (Dubai time)' }); var e = h('input', { type: 'datetime-local', id: 'ex-end', 'aria-label': 'Until (Dubai time)' }); var r = h('input', { type: 'text', id: 'ex-reason', placeholder: 'Reason', maxlength: '200', 'aria-label': 'Reason' });
    return h('div', { class: 'card' }, h('h2', { text: 'Extra availability outside company hours' }),
      h('p', { class: 'note', text: 'Only an approver can open time outside the normal hours of a company. It never overrides breaks, leave, the slot grid or an existing booking.' }),
      items.length ? h('table', null, h('thead', null, h('tr', null, ['Company', 'From', 'Until', 'Reason', ''].map(function (x) { return h('th', { text: x }); }))), h('tbody', null, items.map(function (i) {
        return h('tr', null, h('td', { text: i.company || 'Both' }), h('td', { text: localDate(i.start) + ' ' + localTime(i.start) }), h('td', { text: localDate(i.end) + ' ' + localTime(i.end) }), h('td', { text: i.reason || '' }),
          h('td', null, isAppr ? h('button', { class: 'btn secondary', type: 'button', text: 'Remove', onclick: function () { api('DELETE', '/ui/api/extra-availability/' + i.id).then(refreshTab).catch(function (x) { msg.textContent = x.code === 'conflicts_with_bookings' ? 'Blocked: interviews are booked in that time. Cancel or move them first.' : x.message; }); } }) : null));
      }))) : h('p', { class: 'note', text: 'None.' }),
      isAppr ? h('div', null, h('div', { class: 'field' }, comp), h('div', { class: 'field' }, s), h('div', { class: 'field' }, e), h('div', { class: 'field' }, r),
        h('button', { class: 'btn', type: 'button', id: 'ex-add', text: 'Add extra availability', onclick: function () {
          if (!s.value || !e.value) { msg.textContent = 'Choose from and until.'; return; }
          api('POST', '/ui/api/extra-availability', { company: comp.value, start: s.value + ':00+04:00', end: e.value + ':00+04:00', reason: r.value }).then(refreshTab).catch(function (x) { msg.textContent = x.message; });
        } }), msg) : h('p', { class: 'note', text: 'Read-only for your role.' }));
  }
  function profilesCard() {
    var p = (state.tabData.profiles || {}).items || [];
    return h('div', { class: 'card' }, h('h2', { text: 'Company booking hours (per-company configuration)' }),
      h('table', null, h('thead', null, h('tr', null, ['Company', 'Slot', 'First start', 'Last start', 'Company break', 'Days'].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', null, p.map(function (c) { return h('tr', null, h('td', null, companyBadge(c.company)), h('td', { text: c.slot_minutes + ' min' }), h('td', { text: c.first_start }), h('td', { text: c.last_start }), h('td', { text: c.break_start ? c.break_start + '-' + c.break_end : 'none' }), h('td', { text: c.weekdays.map(function (d) { return DOW[d]; }).join(' ') })); }))),
      h('p', { class: 'note', text: 'Development seed values. Each company supplies its own hours; the core never assumes shared hours.' }));
  }

  // ------------------------------------------------------------ management
  function managementTab() {
    var c = state.controls || {}; var d = state.tabData;
    var msg = h('p', { class: 'err', id: 'mgmtmsg' });
    var reason = h('input', { type: 'text', id: 'fz-reason', placeholder: 'Reason (required)', maxlength: '200', 'aria-label': 'Reason' });
    var frozen = c.bookings_enabled === false || c.releases_enabled === false;
    var controls = h('div', { class: 'card' }, h('h2', { text: 'Emergency controls' }),
      h('p', null, 'New bookings: ', chip(c.bookings_enabled === false ? 'FROZEN' : 'enabled', c.bookings_enabled === false ? 'bad' : 'ok'), ' Result releases: ', chip(c.releases_enabled === false ? 'FROZEN' : 'enabled', c.releases_enabled === false ? 'bad' : 'ok')),
      h('p', { class: 'note', text: 'Freezing never deletes or changes existing appointments. Cancel, no-show and completed updates keep working.' }),
      h('div', { class: 'field' }, reason),
      h('div', { class: 'actions' },
        h('button', { class: 'btn danger', type: 'button', id: 'freeze-btn', text: 'Freeze new bookings and releases', onclick: function () { api('POST', '/ui/api/controls/freeze', { bookings: true, releases: true, reason: reason.value }).then(refreshAll).catch(function (x) { msg.textContent = x.message; }); } }),
        frozen ? h('button', { class: 'btn secondary', type: 'button', id: 'enable-req-btn', text: 'Request to re-enable (needs a second approver)', onclick: function () { api('POST', '/ui/api/controls/enable-request', { reason: reason.value || 'Resume normal operation' }).then(refreshAll).catch(function (x) { msg.textContent = x.message; }); } }) : null),
      (c.pending_enable || []).map(function (p) { return h('div', null, 'Pending re-enable request (' + p.approvals + '/2 approvals): ' + p.reason + ' ', h('button', { class: 'btn', type: 'button', text: 'Approve', onclick: function () { api('POST', '/ui/api/controls/enable-approve/' + p.id).then(refreshAll).catch(function (x) { msg.textContent = x.code === 'second_approver_required' ? 'A different approver must approve.' : x.message; }); } })); }), msg);
    var inc = (d.incidents || { items: [] }).items;
    var incidents = h('div', { class: 'card' }, h('h2', { text: 'Incidents (' + inc.filter(function (i) { return i.status === 'open'; }).length + ' open)' }),
      inc.length ? h('table', null, h('thead', null, h('tr', null, ['When', 'Kind', 'Company', 'Status', ''].map(function (x) { return h('th', { text: x }); }))), h('tbody', null, inc.slice(0, 30).map(function (i) {
        return h('tr', null, h('td', { text: localDate(i.at) + ' ' + localTime(i.at) }), h('td', { text: i.kind }), h('td', { text: i.company || '-' }), h('td', { text: i.status }),
          h('td', null, i.status === 'open' ? h('button', { class: 'btn secondary', type: 'button', text: 'Mark reviewed', onclick: function () { api('POST', '/ui/api/incidents/' + i.id + '/review', { note: 'Reviewed by approver' }).then(refreshTab); } }) : null));
      }))) : h('p', { class: 'note', text: 'No incidents.' }));
    var rep = (d.report || { rows: [] }).rows;
    var report = h('div', { class: 'card' }, h('h2', { text: 'Management report (last 30 days to next 60 days)' }),
      rep.length ? h('table', null, h('thead', null, h('tr', null, ['Company', 'Interview', 'Assessment', 'Count'].map(function (x) { return h('th', { text: x }); }))), h('tbody', null, rep.map(function (r) { return h('tr', null, h('td', null, companyBadge(r.company)), h('td', { text: statusLabel(r.status) }), h('td', { text: ASSESS[r.assessment_status] }), h('td', { text: String(r.count) })); }))) : h('p', { class: 'note', text: 'No data.' }));
    var aud = (d.audit || { items: [] }).items;
    var audit = h('div', { class: 'card' }, h('h2', { text: 'Audit history' }), aud.length ? h('table', null, h('thead', null, h('tr', null, ['When', 'Actor', 'Action', 'Target'].map(function (x) { return h('th', { text: x }); }))), h('tbody', null, aud.slice(0, 40).map(function (a) {
      return h('tr', null, h('td', { text: localDate(a.at) + ' ' + localTime(a.at) }), h('td', { text: String(a.actor).slice(0, 8) }), h('td', { text: a.action }), h('td', { text: a.target ? String(a.target).slice(0, 8) : '' }));
    }))) : h('p', { class: 'note', text: 'Nothing recorded yet.' }));
    return h('div', null, controls, h('div', { class: 'grid2' }, incidents, report), audit);
  }

  function linksTab() {
    var l = state.tabData.links || { identities: [], requests: [] }; var msg = h('p', { class: 'err', id: 'linkmsg' });
    var comp = h('select', { id: 'lk-company', 'aria-label': 'Company' }, ['RGOS', 'RGAB'].map(function (c) { return h('option', { value: c, text: c }); }));
    var ref = h('input', { type: 'text', id: 'lk-ref', placeholder: 'Employee reference in that company', maxlength: '128', 'aria-label': 'Employee reference' });
    var isFac = state.user && state.user.role === 'facilitator'; var isAppr = state.user && state.user.role === 'approver';
    return h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', { text: 'Linked company identities' }),
        h('p', { class: 'note', text: 'Each link is proven by a one-time code issued inside that company portal, then approved by two different approvers. No company password is ever entered here.' }),
        l.identities.length ? h('table', null, h('thead', null, h('tr', null, ['Company', 'Reference', 'Linked', 'State', ''].map(function (x) { return h('th', { text: x }); }))), h('tbody', null, l.identities.map(function (i) {
          return h('tr', null, h('td', null, companyBadge(i.company)), h('td', { text: i.employee_ref }), h('td', { text: localDate(i.linked_at) }), h('td', { text: i.revoked_at ? 'revoked' : 'active' }),
            h('td', null, isAppr && !i.revoked_at ? h('button', { class: 'btn danger', type: 'button', text: 'Revoke', onclick: function () { api('POST', '/ui/api/links/identity/' + i.id + '/revoke', {}).then(refreshTab); } }) : null));
        }))) : h('p', { class: 'note', text: 'No linked identities.' })),
      h('div', { class: 'card' }, h('h2', { text: 'Link requests' }),
        l.requests.map(function (r) {
          var code = h('input', { type: 'text', placeholder: 'One-time code', 'aria-label': 'One-time code', maxlength: '12', size: '10' });
          return h('div', { class: 'card' }, h('div', null, companyBadge(r.company), ' ' + r.employee_ref + ' - ' + r.status + ' (' + r.approvals + '/2 approvals)'),
            r.status === 'pending' && (isFac || isAppr) ? h('div', { class: 'actions' }, code, h('button', { class: 'btn', type: 'button', text: 'Verify code', onclick: function () { api('POST', '/ui/api/links/' + r.id + '/verify', { code: code.value }).then(refreshTab).catch(function (x) { msg.textContent = x.message; }); } })) : null,
            r.status === 'verified' && isAppr ? h('button', { class: 'btn', type: 'button', text: 'Approve link', onclick: function () { api('POST', '/ui/api/links/' + r.id + '/approve', {}).then(refreshTab).catch(function (x) { msg.textContent = x.code === 'second_approver_required' ? 'A different approver must give the second approval.' : x.message; }); } }) : null);
        }),
        isFac ? h('div', null, h('h3', { text: 'Request a new link' }), h('div', { class: 'field' }, comp), h('div', { class: 'field' }, ref),
          h('button', { class: 'btn', type: 'button', text: 'Request link', onclick: function () { api('POST', '/ui/api/links/request', { company: comp.value, employee_ref: ref.value }).then(refreshTab).catch(function (x) { msg.textContent = x.message; }); } })) : null, msg));
  }

  // ------------------------------------------------------------ drawer
  function openDrawer(id) {
    state.drawer = { id: id, loading: true }; renderMain();
    api('GET', '/ui/api/booking/' + id).then(function (b) { state.drawer = { id: id, b: b }; renderMain(); }).catch(function (e) { state.drawer = { id: id, error: e.message }; renderMain(); });
  }
  function drawerEl() {
    var dr = state.drawer; if (!dr) return null;
    var close = h('button', { class: 'btn secondary', type: 'button', text: 'Close', id: 'drawer-close', onclick: function () { state.drawer = null; renderMain(); } });
    var box = h('aside', { class: 'drawer', role: 'dialog', 'aria-label': 'Interview details' }, close);
    if (dr.loading) { box.appendChild(h('p', { text: 'Loading...' })); return box; }
    if (dr.error) { box.appendChild(h('p', { class: 'err', text: dr.error })); return box; }
    var b = dr.b; var d = b.details || {}; var isFac = state.user.role === 'facilitator' || state.user.role === 'approver';   // facilitator and owners can act
    box.appendChild(h('h2', null, companyBadge(b.company), ' ' + (d.client_name || 'Details unavailable')));
    if (b.details_unavailable) box.appendChild(h('p', { class: 'note', text: 'The company system did not answer. Scheduling data below comes from the core.' }));
    var rows = [['Interview', localDate(b.start) + ' ' + localTime(b.start) + '-' + localTime(b.end) + ' (Dubai)'], ['Interview status', statusLabel(b.status)], ['Job position', d.job_position || '-'], ['Advisor', d.advisor_name || '-'],
      ['Client e-mail', d.client_email || '-'],
      ['Documents', d.documents ? 'Passport: ' + d.documents.passport + ', CV: ' + d.documents.cv : '-'], ['Assessment status', ASSESS[b.assessment_status]],
      ['Advisor confirmation', d.advisor_confirmation ? d.advisor_confirmation.replace('_', ' ') : '-'], ['Verification', d.verification_status || '-'], ['Result release', d.result_release ? d.result_release.replace('_', ' ') : '-'],
      ['Company branding', d.branding || '-']];
    var dl = h('dl', { class: 'kv' }); rows.forEach(function (r) { dl.appendChild(h('dt', { text: r[0] })); dl.appendChild(h('dd', { text: r[1] })); }); box.appendChild(dl);
    if (d.assessment) box.appendChild(h('p', { class: window.PIC_ENV === 'live' ? 'note' : 'mark', text: 'Template: ' + ((d.assessment.template && (d.assessment.template.label || d.assessment.template.id)) || '-') }));
    var msg = h('p', { class: 'err', id: 'drawermsg' });
    function run(action) { return api('POST', '/ui/api/booking/' + b.id + '/action', { action: action }).then(function () { return refreshAll(); }).then(function () { openDrawer(b.id); }).catch(function (x) { msg.className = 'err'; msg.textContent = x.message; }); }
    function act(label, action, enabled) {
      return h('button', { class: 'btn secondary', type: 'button', text: label, disabled: !enabled, 'data-action': action, onclick: function () { if (action === 'request_advisor_confirmation') confirmAdvisor(b, d, function () { run(action); }); else run(action); } });
    }
    if (isHistory(b)) {
      box.appendChild(h('p', { class: 'note history-note', text: 'Handled in the ' + b.company + ' portal, before the Command Center. Grades, the Counselor confirmation and the result e-mail for this interview stay in ' + b.company + '. Shown here as history only; nothing can be sent from here.' }));
    } else if (isFac) {
      var done = b.status === 'completed'; var sched = b.status === 'confirmed';
      box.appendChild(h('div', { class: 'actions' },
        act('Mark interview completed', 'complete_interview', sched), act('Mark no-show', 'mark_no_show', sched),
        act('Save assessment draft', 'save_draft', done && b.assessment_status === 'none'), act('Submit assessment', 'submit', done && b.assessment_status === 'draft'),
        act('Send to advisor for confirmation', 'request_advisor_confirmation', done && b.assessment_status === 'submitted'),
        h('button', { class: 'btn', type: 'button', id: 'release-btn', text: 'Release result', disabled: !(done && b.assessment_status === 'approved'), onclick: function () { confirmRelease(b, msg); } })));
    } else box.appendChild(h('p', { class: 'note', text: 'Read-only access (' + state.user.role + ').' }));
    if (!isHistory(b)) box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn secondary', type: 'button', id: 'preview-btn', text: 'Preview assessment form (' + b.company + ' branding)', onclick: function () { showPreview(b, msg); } })));
    box.appendChild(msg);
    box.appendChild(h('h3', { text: 'History' }));
    box.appendChild(h('ul', { class: 'timeline' }, (b.events || []).map(function (e) { return h('li', { text: localDate(e.at) + ' ' + localTime(e.at) + ' - ' + e.event.replace(/_/g, ' ') }); })));
    return box;
  }
  // Tolerant of what each company's system returns: missing fields show a dash; "brand_matches_company" blocks only when a company says false.
  function brandOk(p) { return !p.template || p.template.brand_matches_company !== false; }
  function previewBlock(p) {
    if (typeof p.html === 'string' && p.html) {   // the company's real design, in a sandboxed frame (nothing in it can run, open or load from outside)
      var fr = h('iframe', { class: 'previewframe', src: 'preview-frame.html', sandbox: 'allow-scripts', title: 'The result e-mail as it will be sent' });
      fr.addEventListener('load', function () { try { fr.contentWindow.postMessage({ html: p.html }, '*'); } catch (e) { /* frame gone */ } });
      window.addEventListener('message', function (ev) { if (ev.source === fr.contentWindow && ev.data && typeof ev.data.h === 'number') fr.style.height = Math.min(Math.max(ev.data.h + 8, 160), 1600) + 'px'; });
      return h('div', { class: 'brandbox brand-' + p.company },
        h('dl', { class: 'kv' }, h('dt', { text: 'From' }), h('dd', { text: p.from || '-' }), h('dt', { text: 'To' }), h('dd', { text: p.to || '-' }), h('dt', { text: 'Subject' }), h('dd', { text: p.subject || '-' })),
        fr, h('p', { class: 'note', text: [(p.branding || {}).signature, p.delivery].filter(Boolean).join(' | ') }),
        brandOk(p) ? null : h('p', { class: 'err', text: 'BLOCKED: this assessment is bound to a template of another company. It cannot be sent.' }));
    }
    var tpl = p.template || {}; var br = p.branding || {}; var secs = Array.isArray(p.sections) ? p.sections : [];
    var empty = !secs.length && !tpl.label && !tpl.id;
    return h('div', { class: 'brandbox brand-' + p.company },
      h('div', { class: 'brandhead' }, h('strong', { text: br.name || p.company }), br.letterhead && br.letterhead !== br.name ? h('span', { text: ' ' + br.letterhead }) : null),
      h('dl', { class: 'kv' },
        h('dt', { text: 'From' }), h('dd', { text: p.from || '-' }), h('dt', { text: 'To' }), h('dd', { text: p.to || '-' }),
        h('dt', { text: 'Client' }), h('dd', { text: p.client_name || '-' }), h('dt', { text: 'Job position' }), h('dd', { text: p.job_position || '-' }),
        h('dt', { text: 'Advisor' }), h('dd', { text: p.advisor_name || '-' }),
        h('dt', { text: 'Template' }), h('dd', { text: tpl.label || tpl.id || '-' })),
      secs.length ? h('ul', null, secs.map(function (x) { return h('li', { text: x }); })) : null,
      empty ? h('p', { class: 'note', text: 'No assessment result is recorded for this interview yet, so there is nothing to show. The company system fills this in once the result exists.' }) : null,
      h('p', { class: 'note', text: [br.signature, p.delivery].filter(Boolean).join(' | ') }),
      brandOk(p) ? null : h('p', { class: 'err', text: 'BLOCKED: this assessment is bound to a template of another company. It cannot be sent.' }));
  }
  function showPreview(b, msg) {
    api('GET', '/ui/api/booking/' + b.id + '/preview').then(function (p) {
      var dlg = h('dialog', { id: 'preview-dialog' }, h('h3', { text: 'Assessment form preview - ' + p.company + ' branding only' }), previewBlock(p),
        h('div', { class: 'actions' }, h('button', { class: 'btn secondary', type: 'button', text: 'Close', onclick: function () { dlg.close(); } })));
      document.body.appendChild(dlg); dlg.addEventListener('close', function () { dlg.remove(); }); dlg.showModal();
    }).catch(function (x) { msg.className = 'err'; msg.textContent = x.message; });
  }
  // Warning before the assessment details go to the advisor: it names the company and the advisor, and says nothing reaches the other company.
  function confirmAdvisor(b, d, go) {
    var other = b.company === 'RGOS' ? 'RGAB' : 'RGOS';
    var dlg = h('dialog', { id: 'advisor-dialog' }, h('h3', { text: 'Send to the ' + b.company + ' advisor for confirmation?' }),
      h('div', { class: 'brandbox brand-' + b.company }, h('div', { class: 'brandhead' }, companyBadge(b.company), ' ' + (d.advisor_name || 'the advisor of this interview')),
        h('ul', null, h('li', { text: 'The advisor sees the interview and assessment details inside the ' + b.company + ' system only.' }), h('li', { text: 'Nothing is sent to ' + other + ', its advisors or its clients.' }),
          h('li', { text: 'The advisor confirms or reports an error there; the answer comes back here. Then you can release the result.' }))),
      h('div', { class: 'actions' }, h('button', { class: 'btn', id: 'advisor-confirm', type: 'button', text: 'Yes, send to the ' + b.company + ' advisor', onclick: function () { dlg.close(); go(); } }),
        h('button', { class: 'btn secondary', type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } })));
    document.body.appendChild(dlg); dlg.addEventListener('close', function () { dlg.remove(); }); dlg.showModal();
  }
  function confirmRelease(b, msg) {
    api('GET', '/ui/api/booking/' + b.id + '/preview').then(function (p) {
      var dlg = h('dialog', { id: 'release-dialog' }, h('h3', { text: 'Release this result in ' + p.company + ' branding?' }), previewBlock(p),
        h('p', { text: 'It is sent once, only through ' + p.company + ', with ' + p.company + ' branding. Recipient, template and branding are validated by that company first.' }),
        h('div', { class: 'actions' }, h('button', { class: 'btn', id: 'release-confirm', type: 'button', disabled: !brandOk(p), text: 'Yes, release', onclick: function () {
          dlg.close(); api('POST', '/ui/api/booking/' + b.id + '/release', {}).then(function (r) { msg.className = 'ok'; msg.textContent = 'Sent as ' + r.branding + ' to ' + r.sent_to + ' (' + (r.delivery || '') + ')'; return refreshAll(); }).then(function () { openDrawer(b.id); }).catch(function (x) { msg.className = 'err'; msg.textContent = x.code === 'controls_disabled' ? 'Releases are frozen by management.' : x.code === 'incorrect_template' ? 'Blocked: wrong company template. An incident was recorded.' : x.message; });
        } }), h('button', { class: 'btn secondary', type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } })));
      document.body.appendChild(dlg); dlg.addEventListener('close', function () { dlg.remove(); }); dlg.showModal();
    }).catch(function (x) { msg.className = 'err'; msg.textContent = x.message; });
  }

  // ------------------------------------------------------------ shell
  // Sign in: the person's company login (email + password go straight to that company's own login service) or the Command Center's own login name; both need the one-time code.
  function loginView() {
    var methods = [['local', 'Login name']].concat(Object.keys(window.PIC_SSO || {}).map(function (c) { return [c, (window.PIC_SSO[c].label || c) + ' account']; }));
    var method = state.loginMethod && methods.some(function (m) { return m[0] === state.loginMethod; }) ? state.loginMethod : (methods.length > 1 ? methods[1][0] : 'local');
    var err = h('p', { class: 'err', id: 'login-err', role: 'alert' });
    var email = h('input', { type: 'email', id: 'email', autocomplete: 'username', required: true }); var pw = h('input', { type: 'password', id: 'password', autocomplete: 'current-password', required: true });
    var totp = h('input', { type: 'text', id: 'totp', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', required: true });
    function fail(e) { pw.value = ''; totp.value = ''; err.textContent = e && e.status === 429 ? 'Too many attempts. Try again later.' : 'Sign-in failed. Check your details and code.'; }
    var form = h('form', { class: 'login', onsubmit: function (ev) {
      ev.preventDefault(); err.textContent = '';
      if (method === 'local') { api('POST', '/ui/api/login', { email: email.value, password: pw.value, totp: totp.value }).then(function () { return init(); }).catch(fail); return; }
      var cfg = window.PIC_SSO[method];
      // password goes only to the company's own login service, never to this application's server
      var H = { apikey: cfg.key, 'content-type': 'application/json' };
      var step = fetch(cfg.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: H, body: JSON.stringify({ email: email.value.trim(), password: pw.value }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject({ status: r.status }); });
      if (cfg.mfa) {   // this company requires its own second factor: get a second-factor (aal2) session with the code from the company's authenticator app
        step = step.then(function (j) {
          var A = { apikey: cfg.key, 'content-type': 'application/json', authorization: 'Bearer ' + j.access_token };
          return fetch(cfg.url + '/auth/v1/user', { headers: A }).then(function (r) { return r.ok ? r.json() : Promise.reject({ status: r.status }); }).then(function (u) {
            var f = (u.factors || []).filter(function (x) { return x.factor_type === 'totp' && x.status === 'verified'; })[0]; if (!f) return { access_token: j.access_token, password_only: true };   // an account without a company second factor: our own code is used instead
            return fetch(cfg.url + '/auth/v1/factors/' + f.id + '/challenge', { method: 'POST', headers: A, body: '{}' }).then(function (r) { return r.ok ? r.json() : Promise.reject({ status: r.status }); })
              .then(function (c) { return fetch(cfg.url + '/auth/v1/factors/' + f.id + '/verify', { method: 'POST', headers: A, body: JSON.stringify({ challenge_id: c.id, code: totp.value.trim() }) }); })
              .then(function (r) { return r.ok ? r.json() : Promise.reject({ status: r.status }); });
          });
        });
      }
      step.then(function (j) { var own = !cfg.mfa || j.password_only; pw.value = ''; return api('POST', '/ui/api/login-sso', { company: method, token: j.access_token, totp: own ? totp.value : undefined }); })
        .then(function () { return init(); }).catch(fail);
    } }, h('h1', { text: 'Facilitator Command Center' }), h('p', { text: 'Private. Authorised facilitator and management only.' }),
      methods.length > 1 ? h('div', { class: 'seg login-methods', role: 'group', 'aria-label': 'Sign in with' }, methods.map(function (m) { return h('button', { type: 'button', 'aria-pressed': String(method === m[0]), text: m[1], onclick: function () { state.loginMethod = m[0]; render(); } }); })) : null,
      h('div', { class: 'field' }, h('label', { for: 'email', text: method === 'local' ? 'Login name' : 'E-mail (your ' + ((window.PIC_SSO[method] || {}).label || method) + ' login)' }), email), h('div', { class: 'field' }, h('label', { for: 'password', text: 'Password' }), pw),
      h('div', { class: 'field' }, h('label', { for: 'totp', text: 'Authenticator code' }), totp), h('button', { class: 'btn', type: 'submit', text: 'Sign in' }), err,
      window.PIC_ENV === 'live' ? null : h('p', { class: 'note', text: 'Development build: synthetic test identities only.' }));
    return form;
  }
  var TABS = [['calendar', 'Calendar'], ['queues', 'Queues'], ['results', 'Results sent'], ['availability', 'Leave and availability'], ['links', 'Linked identities'], ['management', 'Management'], ['tutorials', 'Tutorials']];
  function tourSeen() { try { return window.localStorage.getItem('pic_tour_done') === '1'; } catch (e) { return true; } }
  function mainShell() {
    var u = state.user; var frozen = state.controls && (state.controls.bookings_enabled === false || state.controls.releases_enabled === false);
    var tabs = TABS.filter(function (t) { return t[0] !== 'management' || u.role === 'approver' || u.role === 'viewer'; });
    return h('div', null,
      frozen ? h('div', { class: 'banner', role: 'alert', text: 'EMERGENCY FREEZE ACTIVE: new bookings' + (state.controls.releases_enabled === false ? ' and result releases are' : ' are') + ' disabled. Existing appointments are unaffected.' }) : null,
      window.PIC_ENV === 'live' ? null : h('div', { class: 'synth', text: 'DEVELOPMENT BUILD - synthetic data only. Assessment templates shown are clearly marked placeholders, not approved templates.' }),
      h('header', { class: 'topbar' }, h('h1', { text: 'Facilitator Command Center' }), h('span', { class: 'badge', text: u.display_name + ' - ' + u.role }),
        h('button', { class: 'btn secondary' + (tourSeen() ? '' : ' hint'), type: 'button', id: 'tour-btn', text: 'Tour', title: 'A two-minute guided tour', onclick: function () { if (window.PICTour) window.PICTour.start(); } }),
        h('button', { class: 'btn secondary', type: 'button', id: 'logout', text: 'Sign out', onclick: function () { api('POST', '/ui/api/logout', {}).finally(function () { state.user = null; render(); }); } })),
      h('nav', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) { return h('button', { role: 'tab', type: 'button', 'aria-selected': String(state.tab === t[0]), 'data-tab': t[0], text: t[1], onclick: function () { state.tab = t[0]; state.fx = true; refresh(); } }); })),
      h('main', { id: 'main' }));
  }
  function renderMain() {
    var m = document.getElementById('main'); if (!m) return;
    m.textContent = '';
    var body = state.tab === 'calendar' ? calendarTab() : state.tab === 'queues' ? queuesTab() : state.tab === 'results' ? resultsTab() : state.tab === 'availability' ? availabilityTab() : state.tab === 'links' ? linksTab() : state.tab === 'tutorials' ? tutorialsTab() : managementTab();
    if (state.fx) { body.classList.add('enter'); state.fx = false; }
    m.appendChild(body); var d = drawerEl(); if (d) m.appendChild(d);
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === state.tab)); });
  }
  function render() {
    root.textContent = '';
    if (!state.user) { root.appendChild(loginView()); return; }
    root.appendChild(mainShell()); renderMain();
  }
  function refreshTab() {
    var t = state.tab; var jobs = [];
    var rng = encodeURIComponent(isoStart(addDays(todayDubai(), -30))) + '&to=' + encodeURIComponent(isoStart(addDays(todayDubai(), 62)));
    if (t === 'calendar') { jobs.push(loadCalendar()); jobs.push(api('GET', '/ui/api/availability?from=' + rng).then(function (a) { state.tabData.avail = a; }).catch(function () {})); }
    if (t === 'queues') jobs.push(loadWide());
    if (t === 'results') { var rr = resRange(); var rq = '/ui/api/results?from=' + encodeURIComponent(isoStart(rr[0])) + '&to=' + encodeURIComponent(isoStart(rr[1])) + (state.company ? '&company=' + state.company : ''); jobs.push(api('GET', rq).then(function (x) { resCache[rq] = x; if (rq === resKey()) state.tabData.results = x; state.error = ''; }).catch(function (e) { state.error = e.message || 'Could not load.'; })); }
    if (t === 'availability') { jobs.push(api('GET', '/ui/api/schedule').then(function (x) { state.tabData.schedule = x; }).catch(function () {})); jobs.push(api('GET', '/ui/api/extra-availability?from=' + rng).then(function (x) { state.tabData.extra = x; }).catch(function () {})); jobs.push(api('GET', '/ui/api/availability?from=' + rng).then(function (a) { state.tabData.avail = a; })); jobs.push(api('GET', '/ui/api/profiles').then(function (p) { state.tabData.profiles = p; })); }
    if (t === 'tutorials') jobs.push(fetch('videos/manifest.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) { state.tabData.videos = m; }).catch(function () { state.tabData.videos = null; }));
    if (t === 'links') jobs.push(api('GET', '/ui/api/links').then(function (l) { state.tabData.links = l; }));
    if (t === 'management') {
      jobs.push(api('GET', '/ui/api/incidents').then(function (i) { state.tabData.incidents = i; }).catch(function () {}));
      jobs.push(api('GET', '/ui/api/audit').then(function (a) { state.tabData.audit = a; }).catch(function () { state.tabData.audit = { items: [] }; }));
      jobs.push(api('GET', '/ui/api/report?from=' + rng).then(function (r) { state.tabData.report = r; }).catch(function () {}));
    }
    return Promise.all(jobs).then(renderMain);
  }
  function refreshAll() { return loadControls().then(function () { return refreshTab(); }).then(function () { var shell = document.querySelector('.banner'); if (state.user) { var scroll = window.scrollY; root.textContent = ''; root.appendChild(mainShell()); renderMain(); window.scrollTo(0, scroll); } }); }
  function refresh() {
    prime();
    try { renderMain(); } catch (e) { var m = document.getElementById('main'); if (m) { m.textContent = ''; m.appendChild(h('p', { class: 'note', text: 'Loading...' })); } }   // this tab's data is not loaded yet: it is drawn when it arrives
    return refreshTab();
  }
  function init() {
    return api('GET', '/ui/api/me').then(function (m) { state.user = m.user; return loadControls(); }).then(function () { render(); return refreshTab(); }).catch(function (e) { if (e && e.status !== 401) console.error('init failed', e && e.stack || e); state.user = null; render(); });
  }
  document.addEventListener('keydown', function (e) {
    if (!state.user || e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains('touring') || /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '') || document.querySelector('dialog[open]')) return;
    var k = e.key; var step = state.view === 'day' ? 1 : state.view === 'week' ? 7 : 30;
    if (state.tab === 'calendar') {
      if (k === 'd' || k === 'w' || k === 'm') { state.view = k === 'd' ? 'day' : k === 'w' ? 'week' : 'month'; refresh(); }
      else if (k === 't') { state.date = todayDubai(); refresh(); }
      else if (k === 'ArrowRight') { state.date = state.view === 'month' ? shiftMonth(1) : addDays(state.date, step); refresh(); }
      else if (k === 'ArrowLeft') { state.date = state.view === 'month' ? shiftMonth(-1) : addDays(state.date, -step); refresh(); }
    }
    if (k === '?' && window.PICTour) window.PICTour.start();
    if (k === 'Escape' && state.drawer) { state.drawer = null; renderMain(); }
  });
  init();
  setInterval(function () { if (state.user && !state.drawer && document.visibilityState === 'visible' && !document.body.classList.contains('touring') && !(document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) refreshAll().catch(function () {}); }, 15000);
})();
