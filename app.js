'use strict';
// Facilitator Command Center (development build, synthetic data). No framework, no inline script, textContent only.
(function () {
  var TZ = 'Asia/Dubai';
  var root = document.getElementById('app');
  var state = { user: null, tab: 'calendar', view: 'day', date: todayDubai(), company: '', items: [], loaded: null, drawer: null, controls: null, tabData: {}, search: '', status: '', assess: '' };
  var liveSession = 0;

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
    if (method === 'GET' || /\/ui\/api\/(login|logout)$/.test(path) || /\/notifications\/[0-9]+\/read$/.test(path) || /\/operational-issues\/[a-f0-9-]{36}\/read$/.test(path)) return null;
    if (/\/release/.test(path)) return 'Result released';
    if (/\/action$/.test(path)) return 'Interview updated';
    if (/controls\/freeze/.test(path)) return 'Emergency freeze is ON';
    if (/controls\/enable/.test(path)) return 'Re-enable step recorded';
    if (/links/.test(path)) return 'Link step recorded';
    if (method === 'DELETE') return 'Removed';
    return 'Saved';
  }
  // A failed or very slow load of an interview, its result design, its documents or a company list is reported (area, interview id, status, time only; never client data), so what Aira could not see can be found afterwards.
  var lastProblemAt = 0;
  function reportSlow(method, path, failed, ms) {
    if (method !== 'GET' || (!failed && ms < 12000)) return;
    var m = /^\/ui\/api\/(booking\/([0-9a-f-]{36})\/(preview|documents)|booking\/([0-9a-f-]{36})|lists\/(confirmations|offers))(\?|$)/.exec(path); if (!m) return;
    if (Date.now() - lastProblemAt < 15000) return; lastProblemAt = Date.now();
    var body = { area: m[3] || (m[4] ? 'details' : 'lists'), status: typeof failed === 'number' ? failed : (failed ? 0 : 200), ms: Math.min(Math.round(ms), 600000), note: failed ? String(failed).slice(0, 40) : 'slow' }; var bid = m[2] || m[4]; if (bid) body.booking = bid;
    try { var base = window.PIC_API_BASE || ''; var h = { 'content-type': 'application/json', 'x-pic-csrf': '1' }; var tk = base ? getToken() : null; if (tk) h.authorization = 'Bearer ' + tk;
      fetch(base + '/ui/api/ui-problem', { method: 'POST', credentials: base ? 'omit' : 'same-origin', headers: h, body: JSON.stringify(body), keepalive: true }).catch(function () {}); } catch (e) { /* reporting must never disturb the screen */ }
  }
  function api(method, path, body, requestOptions) {
    var t0 = Date.now(); var failed = null;
    var requestUser = state.user; var requestSession = typeof liveSession === 'number' ? liveSession : 0;
    var base = window.PIC_API_BASE || '';
    if (state && state.showTest && method === 'GET' && /^\/ui\/api\/(calendar|results|booking|lists)/.test(path)) path += (path.indexOf('?') >= 0 ? '&' : '?') + 'test=1';   // owners only: the server ignores it for everyone else
    var opts = { method: method, credentials: base ? 'omit' : 'same-origin', headers: {} };
    if (method !== 'GET') opts.headers['x-pic-csrf'] = '1';
    if (base) { var tk = getToken(); if (tk) opts.headers.authorization = 'Bearer ' + tk; }
    if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var controller = new AbortController(); var expired = false;
    var externalSignal = requestOptions && requestOptions.signal;
    function cancelRequest() { controller.abort(); }
    if (externalSignal) { if (externalSignal.aborted) cancelRequest(); else externalSignal.addEventListener('abort', cancelRequest, { once: true }); }
    opts.signal = controller.signal;
    var timer = setTimeout(function () { expired = true; controller.abort(); }, method === 'GET' ? (/\/live-updates/.test(path) ? 35000 : /\/preview/.test(path) ? 60000 : 25000) : 45000);
    return fetch(base + path, opts).then(function (r) {
      return r.json().catch(function (e) { if (expired) throw e; return null; }).then(function (j) {
        if (r.ok && !(typeof isPendingActionResponse === 'function' && isPendingActionResponse(j)) && (!j || j.ok !== false) && toastFor(method, path)) toast(toastFor(method, path));
        if (j && j.token && (path === '/ui/api/login' || path === '/ui/api/login-sso' || path === '/ui/api/launch') && base) setToken(j.token);
        if (path === '/ui/api/logout' && base) setToken(null);
        if (r.status === 401 && path !== '/ui/api/login' && state.user === requestUser && (typeof liveSession !== 'number' || liveSession === requestSession)) { if (typeof endSession === 'function') endSession(); else state.user = null; render(); }
        if (!r.ok) { var e = new Error((j && j.error && j.error.message) || 'Request failed'); e.code = j && j.error && j.error.code; e.status = r.status; throw e; }
        return j;
      });
    }).catch(function (e) {
      failed = e && e.status ? e.status : (expired ? 'timeout' : 'network');
      if (expired || (e && e.name === 'AbortError')) { var timeout = new Error(method === 'GET' ? 'This is taking too long. Check your connection and press Retry or Refresh.' : 'The response took too long. The change may have reached the company. Refresh and check its status before trying again.'); timeout.code = 'request_timeout'; throw timeout; }
      if (e && e.status) throw e;
      if (e instanceof TypeError) { var network = new Error(method === 'GET' ? 'The connection was interrupted. Check your connection and press Retry or Refresh.' : 'The connection was interrupted. The change may have reached the company. Refresh and check its status before trying again.'); network.code = 'network_error'; throw network; }
      throw e;
    }).finally(function () { clearTimeout(timer); if (externalSignal) externalSignal.removeEventListener('abort', cancelRequest); reportSlow(method, path, failed, Date.now() - t0); });
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
  function statusLabel(s) { return ({ confirmed: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show', not_completed: 'Interview Not Completed' })[s] || s; }
  function statusKind(s) { return s === 'completed' ? 'ok' : s === 'not_completed' ? 'warn' : (s === 'cancelled' || s === 'no_show') ? 'bad' : ''; }
  var INCOMPLETE_EXPLANATION = 'Interview Not Completed - Client joined the scheduled Zoom interview but disconnected during the session and did not rejoin the meeting. No further response was received from the client regarding the continuation of the interview. Interview was not completed.';
  var ASSESS = { none: 'Not started', draft: 'Draft', submitted: 'Submitted', awaiting_advisor: 'Awaiting advisor', approved: 'Approved', released: 'Released' };

  // ------------------------------------------------------------ data
  // Smooth clicks: every menu click first redraws at once from what is already known (the company filter and the menus work on the loaded list, never on the network),
  // then fresh data is fetched quietly and the screen is redrawn when it arrives. Calendar ranges are cached (a bigger cached range also serves a smaller one) and the next/previous range is fetched ahead.
  var calCache = []; var resCache = {}; var calPending = {}; var calEpoch = 0;
  function uniqueBookings(items) {
    var seen = Object.create(null); var result = [];
    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (!item || typeof item.id !== 'string') return;
      var key = String(item.company || '') + ':' + item.id; var index = seen[key];
      if (index === undefined) { seen[key] = result.length; result.push(item); return; }
      var previous = result[index];
      if (Number(item.version || 0) >= Number(previous.version || 0)) result[index] = Object.assign({}, previous, item, { details: item.details || previous.details });
    });
    return result;
  }
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
    var epoch = calEpoch;
    var key = (limited() ? 'interviewer:' : 'full:') + f + ':' + t + ':' + epoch;
    if (calPending[key]) return calPending[key];
    calPending[key] = api('GET', (limited() ? '/ui/api/interviewer/calendar' : '/ui/api/calendar') + '?from=' + encodeURIComponent(isoStart(r[0])) + '&to=' + encodeURIComponent(isoStart(r[1]))).then(function (j) {
      if (epoch !== calEpoch) return [];
      j.items = uniqueBookings(j.items);
      calCache = calCache.filter(function (e) { return !(e.from === f && e.to === t); }); calCache.push({ from: f, to: t, items: j.items, at: Date.now() });
      if (calCache.length > 12) calCache.shift();
      return j.items;
    }).finally(function () { delete calPending[key]; });
    return calPending[key];
  }
  function loadCalendar(force) {
    if (state.tab !== 'calendar') return Promise.resolve();
    var r = rangeFor(); var key = isoStart(r[0]) + '|' + isoStart(r[1]); var hit = calLookup(r);
    if (!force && hit && hit.exact && Date.now() - hit.at < 20000) return Promise.resolve();       // fresh enough: nothing to fetch
    return calFetch(r).then(function () {
      var now = rangeFor(); if (isoStart(now[0]) + '|' + isoStart(now[1]) === key && state.tab === 'calendar') { state.items = (calLookup(r) || { items: [] }).items; state.error = null; state.calLoading = false; }
      setTimeout(prefetchCalendar, 400);
    }).catch(function (e) { var now = rangeFor(); if (state.tab === 'calendar' && isoStart(now[0]) + '|' + isoStart(now[1]) === key) { state.error = e.message; state.calLoading = false; } });
  }
  function prefetchCalendar() {
    if (state.tab !== 'calendar' || !state.user || state.drawer || document.visibilityState !== 'visible' || (navigator.connection && navigator.connection.saveData)) return;
    var step = state.view === 'day' ? 1 : state.view === 'week' ? 7 : 30;
    [step].forEach(function (n) {
      var d = state.view === 'month' ? shiftMonth(n > 0 ? 1 : -1) : addDays(state.date, n); var r = rangeFor(d, state.view);
      if (!calLookup(r)) calFetch(r).catch(function () {});
    });
  }
  function loadWide() {
    var from = addDays(todayDubai(), -30), to = addDays(todayDubai(), 62);
    return api('GET', '/ui/api/calendar?from=' + encodeURIComponent(isoStart(from)) + '&to=' + encodeURIComponent(isoStart(to)))
      .then(function (j) { state.wide = uniqueBookings(j.items); if (state.tab === 'queues') state.error = null; }).catch(function (e) { if (state.tab === 'queues') state.error = e.message; });
  }
  function resKey() { var rr = resRange(); return '/ui/api/results?from=' + encodeURIComponent(isoStart(rr[0])) + '&to=' + encodeURIComponent(isoStart(rr[1])) + (state.company ? '&company=' + state.company : ''); }
  // what can be shown immediately for the current tab (called right after a click, before any network)
  function prime() {
    if (state.tab === 'calendar') { var hit = calLookup(rangeFor()); state.items = hit ? hit.items : []; state.calLoading = !hit; }
    if (state.tab === 'results') state.tabData.results = resCache[resKey()] || null;
  }
  function loadControls() { if (limited()) return Promise.resolve(); return api('GET', '/ui/api/controls').then(function (c) { state.controls = c; }).catch(function () {}); }

  // ------------------------------------------------------------ pieces
  function eventButton(it) {
    if (limited()) return limitedEvent(it);
    var d = it.details || {};
    var title = d.client_name || (it.details_unavailable ? 'Details unavailable' : 'Loading details');
    var chips = h('div', { class: 'chips' },
      chip(statusLabel(it.status), statusKind(it.status)),
      phase(it) === 'ongoing' ? chip('Ongoing now', 'warn') : null,
      it.rescheduled ? chip('Rescheduled', 'warn') : null,
      d.documents ? chip('Docs: ' + docsLabel(d.documents), docsComplete(d.documents) ? 'ok' : 'warn') : null,
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
  var STATUS_MENU = [['', 'All interviews'], ['upcoming', 'Upcoming'], ['ongoing', 'Ongoing now'], ['attended', 'Attended (completed)'], ['not_completed', 'Interview Not Completed'], ['cancelled', 'Cancelled'], ['no_show', 'No-show'], ['rescheduled', 'Rescheduled']];
  var ASSESS_MENU = [['', 'Any assessment'], ['none', 'Not started'], ['draft', 'Draft'], ['submitted', 'Submitted'], ['awaiting_advisor', 'Awaiting advisor'], ['approved', 'Approved'], ['released', 'Released']];
  function phase(it) { var now = Date.now(); return it.status === 'confirmed' ? (Date.parse(it.start) <= now && now < Date.parse(it.end) ? 'ongoing' : (Date.parse(it.start) > now ? 'upcoming' : 'overdue')) : it.status; }
  // An older interview (imported after it took place) is read-only history only while its company system supplies no Counselor or job for it;
  // as soon as the company returns them (RGAB owner's decision 2026-10-19), the normal buttons come back by themselves.
  // Documents: each company words them its own way (RGOS: "present"; the demo: "valid"). Complete = both passport and CV are on file; anything missing, expired or unclear counts as incomplete.
  var DOC_OK = ['valid', 'present', 'verified', 'complete', 'completed', 'ok', 'uploaded', 'received', 'on file', 'yes', 'true'];
  function docOk(v) { return DOC_OK.indexOf(String(v === undefined || v === null ? '' : v).toLowerCase()) >= 0; }
  function docsComplete(d) { return !!d && docOk(d.passport) && docOk(d.cv); }
  function docsLabel(d) { return d ? (docsComplete(d) ? 'complete' : 'incomplete') : '-'; }
  // ---- the Interviewer role: schedule + interview details + documents (view only). Nothing else is drawn for it, and the server refuses everything else anyway.
  function limited() { return !!(state.user && state.user.role === 'interviewer'); }
  function limitedEvent(it) {
    var d = it.details || {}; var title = d.client_name || (it.details_unavailable ? 'Details unavailable' : 'Loading details');
    return h('button', { class: 'ev ' + it.company + ' ' + it.status, type: 'button', 'data-id': it.id, onclick: function () { openDrawer(it.id); }, 'aria-label': localTime(it.start) + ' ' + title },
      h('div', { class: 'l1' }, h('strong', { text: localTime(it.start) + '-' + localTime(it.end) }), h('span', { text: title }), d.job_position ? h('span', { class: 'note', text: d.job_position }) : null, d.advisor_name ? h('span', { class: 'note', text: 'Advisor: ' + d.advisor_name }) : null),
      h('div', { class: 'chips' }, chip(statusLabel(it.status), statusKind(it.status))));
  }
  function limitedDrawer(box, dr) {
    var b = dr.b; var d = b.details || {};
    box.appendChild(h('h2', { text: d.client_name || 'Interview' }));
    var rows = [['Interview', localDate(b.start) + ' ' + localTime(b.start) + '-' + localTime(b.end) + ' (Dubai)'], ['Interview status', statusLabel(b.status)], ['Client', d.client_name || '-'], ['Job position', d.job_position || '-'], ['Advisor', d.advisor_name || '-'], ['Company', b.company]];
    (d.info || []).forEach(function (x) { rows.push([x.label, x.value]); });
    var dl = h('dl', { class: 'kv' }); rows.forEach(function (r) { dl.appendChild(h('dt', { text: r[0] })); dl.appendChild(h('dd', { class: r[2] ? 'missing' : '', text: r[2] ? 'MISSING - ' + b.company + ' has not sent the program applied' : r[1] })); }); box.appendChild(dl);
    if (['confirmed', 'completed'].indexOf(b.status) >= 0) box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'docs-btn', text: 'View uploaded documents side by side', onclick: function () { showDocuments(b); } })));
    box.appendChild(h('p', { class: 'note', text: 'View only. Documents are shown live, cannot be downloaded, and every opening is recorded.' }));
    return box;
  }
  function isHistory(x) { var d = x.details || {}; return !!x.pre_launch && x.company !== 'RGAB' && !d.advisor_name && !d.job_position && !d.advisor_confirmation; }
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
      limited() ? null : companyFilter(), limited() ? null : statusMenu(), searchBox());
    var body = state.view === 'day' ? dayView(state.items, state.date, breakMarks(state.date)) : state.view === 'week' ? weekView(state.items) : monthView(state.items);
    return h('div', null, limited() ? null : workflowOverview(), limited() ? null : statsStrip(), bar, state.error ? h('p', { class: 'err', text: state.error }) : null, state.calLoading ? h('p', { class: 'note', text: 'Loading interviews...' }) : null, body);
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
    if (m === undefined) return h('div', { class: 'card' }, h('h2', { text: 'Tutorials' }), h('p', { class: 'note', text: 'Loading the tutorials...' }));
    if (!list.length) return h('div', { class: 'card' }, h('h2', { text: 'Tutorials' }), h('p', { class: 'note', text: 'The tutorial videos are being prepared and will appear here.' }));
    var cur = state.tutorial && list.filter(function (c) { return c.id === state.tutorial; })[0] || list[0];
    var player = h('video', { class: 'player', controls: true, preload: 'metadata', src: 'videos/' + cur.file, 'aria-label': cur.title });
    if (cur.poster) player.setAttribute('poster', 'videos/' + cur.poster);
    var steps = list.map(function (c) {
      return h('button', { class: 'chap' + (c.id === cur.id ? ' on' : ''), type: 'button', 'data-chapter': c.id, onclick: function () { state.tutorial = c.id; state.fx = true; state.forceRender = true; renderMain(); state.forceRender = false; } },
        h('span', { class: 'chap-n', text: c.id === 'full' ? 'All' : String(list.filter(function (x) { return x.id !== 'full'; }).indexOf(c) + 1) }), h('span', { class: 'chap-t' }, h('strong', { text: c.title }), h('span', { class: 'note', text: (c.minutes ? c.minutes + ' min - ' : '') + (c.summary || '') })));
    });
    var markers = (cur.markers || []).length ? h('div', { class: 'markers', 'aria-label': 'Jump to a chapter' }, cur.markers.map(function (mk) { return h('button', { class: 'btn secondary mk', type: 'button', text: Math.floor(mk.t / 60) + ':' + (mk.t % 60 < 10 ? '0' : '') + (mk.t % 60) + ' ' + mk.title, onclick: function () { player.currentTime = mk.t; player.play().catch(function () {}); } }); })) : null;
    var learned = {}; try { learned = JSON.parse(window.localStorage.getItem('pic_learned') || '{}'); } catch (e) { learned = {}; }
    var points = (cur.points || []).length ? h('div', { class: 'points' }, h('h3', { text: 'Remember' }), (cur.points || []).map(function (pt, i) {
      var key = cur.id + ':' + i; var cb = h('input', { type: 'checkbox', id: 'pt-' + key, checked: !!learned[key], onchange: function (e) { learned[key] = e.target.checked; try { window.localStorage.setItem('pic_learned', JSON.stringify(learned)); } catch (x) { /* optional */ } } });
      return h('label', { class: 'pt', for: 'pt-' + key }, cb, h('span', { text: pt })); })) : null;
    return h('div', { class: 'tutorials' }, h('div', null, h('div', { class: 'card' }, h('h2', { text: cur.title }), player, markers, h('p', { class: 'note', text: cur.summary || '' }), points)), h('div', { class: 'card chapters' }, h('h2', { text: 'Chapters' }), steps));
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
        h('td', { text: docsLabel(d.documents), title: d.documents ? 'Passport: ' + d.documents.passport + ', CV: ' + d.documents.cv : '' }),
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
        sec('Pending advisor confirmations', pendingAdvisor, 'Nothing waiting for an advisor.')),
      sec('Results ready for release', ready, 'No results are ready.'),
      sec('Completed interviews', done, 'None yet.'),
      sec('Cancelled interviews', all.filter(function (i) { return i.status === 'cancelled'; }), 'None.'),
      sec('No-show records', all.filter(function (i) { return i.status === 'no_show'; }), 'None.'));
  }

  // ------------------------------------------------------------ results sent: what happened to every released assessment result
  // The core knows when a result was released; e-mail delivery, opening and the client's answer are reported by the owning company.
  var RANKS = [['released', 'Most results sent'], ['accepted', 'Most accepted'], ['rate', 'Highest acceptance rate'], ['rejlow', 'Lowest rejection rate'], ['fast', 'Fastest answer'], ['fewignored', 'Fewest ignored']];
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
  // CSV download of what is on the screen (same period and company filter). Every download is written to the audit trail first (who, what, how many rows).
  function csvCell(v) { var t = String(v === null || v === undefined ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; }
  function downloadCsv(name, rows, what) {
    var text = '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    return api('POST', '/ui/api/export-log', { what: what, rows: Math.max(0, rows.length - 1) }).then(function () {
      var url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000); toast('Downloaded ' + name);
    }).catch(function () { toast('The download could not be recorded, so it was not made. Try again.'); });
  }
  function exportSent() {
    var r = state.tabData.results; if (!r) return; var rg = resRange(); var d = function (iso) { return iso ? localDate(iso) + ' ' + localTime(iso) : ''; };
    var rows = [['Sent (Dubai)', 'Company', 'Client', 'Advisor / counselor', 'Interview (Dubai)', 'E-mail', 'Opened', 'Client answer', 'Status']].concat(r.items.map(function (i) {
      var ev = i.events || {}; var delivered = ev.email_delivered || ev.opened || ev.accepted || ev.rejected; var st = RES_STATE[i.state] || [i.state];
      return [d(i.released_at), i.company, i.history ? 'Client ' + String(i.client_ref).slice(0, 10) + ' (earlier record)' : (i.client_name || ''), i.advisor_name || '', d(i.start),
        ev.email_bounced && !delivered ? 'Not delivered' : delivered ? 'Delivered' : ev.email_sent ? 'Sent' : '', ev.opened || ev.accepted || ev.rejected ? (ev.opened ? d(ev.opened) : 'Yes') : 'No',
        ev.accepted ? 'Accepted ' + d(ev.accepted) : ev.rejected ? 'Rejected ' + d(ev.rejected) : '', st[0]];
    }));
    return downloadCsv('sent-items_' + rg[0] + '_to_' + addDays(rg[1], -1) + (state.company ? '_' + state.company : '') + '.csv', rows, 'sent_items');
  }
  function exportRanking() {
    var r = state.tabData.results; if (!r) return; var rg = resRange();
    var list = (r.by_advisor || []).filter(function (a) { return !state.company || a.company === state.company; });
    var rows = [['Company', 'Advisor / counselor', 'Sent', 'Delivered', 'Opened', 'Accepted', 'Rejected', 'Ignored', 'Answered', 'Acceptance rate %', 'Rejection rate %', 'Average answer time (hours)']].concat(list.map(function (a) {
      var dec = a.accepted + a.rejected;
      return [a.company, a.advisor_name || (a.advisor_ref ? 'Staff ' + String(a.advisor_ref).slice(0, 8) : 'No counselor on record'), a.released, a.delivered, a.opened, a.accepted, a.rejected, a.ignored, dec,
        dec ? Math.round(1000 * a.accepted / dec) / 10 : '', dec ? Math.round(1000 * a.rejected / dec) / 10 : '', a.avg_answer_hours === null || a.avg_answer_hours === undefined ? '' : a.avg_answer_hours];
    }));
    return downloadCsv('ranking_' + rg[0] + '_to_' + addDays(rg[1], -1) + (state.company ? '_' + state.company : '') + '.csv', rows, 'ranking');
  }
  function resultsTab() {
    var r = state.tabData.results;
    var preset = h('select', { id: 'res-preset', 'aria-label': 'Reporting period', onchange: function (e) { state.resPreset = e.target.value; refreshTab(); } }, RES_PRESETS.map(function (o) { return h('option', { value: o[0], text: o[1], selected: (state.resPreset || '30d') === o[0] }); }));
    var rg = resRange(); var win = h('div', { class: 'toolbar-group' }, preset);
    if ((state.resPreset || '') === 'custom') { win.appendChild(h('input', { type: 'date', id: 'res-from', value: state.resFrom || rg[0], 'aria-label': 'From', onchange: function (e) { state.resFrom = e.target.value; state.resTo = state.resTo || e.target.value; refreshTab(); } })); win.appendChild(h('input', { type: 'date', id: 'res-to', value: state.resTo || addDays(rg[1], -1), 'aria-label': 'To', onchange: function (e) { state.resTo = e.target.value; state.resFrom = state.resFrom || e.target.value; refreshTab(); } })); }
    win.appendChild(h('span', { class: 'note', text: rg[0] + (addDays(rg[1], -1) !== rg[0] ? ' to ' + addDays(rg[1], -1) : '') + ' (Dubai)' }));
    var bar = h('div', { class: 'toolbar' }, win, companyFilter(), h('button', { class: 'btn secondary', type: 'button', text: 'Refresh', onclick: function () { refreshTab(); } }),
      h('button', { class: 'btn secondary', type: 'button', text: 'Download sent items (CSV)', onclick: exportSent }), h('button', { class: 'btn secondary', type: 'button', text: 'Download ranking (CSV)', onclick: exportRanking }));
    if (!r) return h('div', null, bar, state.error ? h('p', { class: 'err', text: state.error }) : h('p', { class: 'note', text: 'Loading...' }));
    var c = r.counts, p = r.pipeline;
    function pct(n) { return c.released ? Math.round(100 * n / c.released) + '% of sent' : ''; }
    function tile(cls, num, lbl, sub) { return h('div', { class: 'stat ' + cls }, h('span', { class: 'num', text: String(num) }), h('span', { class: 'lbl', text: lbl }), sub ? h('span', { class: 'note', text: sub }) : null); }
    var tiles = h('div', { class: 'stats' },
      tile('s-ALL', p.interviews_completed, 'Interviews completed', (p.no_show ? p.no_show + ' no-show' : '') + (p.not_completed ? (p.no_show ? ', ' : '') + p.not_completed + ' not completed' : '')),
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
    // Ranking per company (each company has its own card, so a screenshot of one never shows the other). Rate-based rankings only count people with at least MIN answered results / sent results.
    var MIN = 5; var by = state.rankBy || 'released';
    function pv(x) { // [eligible, value where bigger is better]
      var a = x.a; var dec = a.accepted + a.rejected;
      if (by === 'released') return [true, a.released];
      if (by === 'accepted') return [true, a.accepted];
      if (by === 'rate') return [dec >= MIN, dec ? a.accepted / dec : 0];
      if (by === 'rejlow') return [dec >= MIN, dec ? -(a.rejected / dec) : 0];
      if (by === 'fast') return [dec >= MIN && a.avg_answer_hours !== null && a.avg_answer_hours !== undefined, -(a.avg_answer_hours || 0)];
      return [a.released >= MIN, -a.ignored];   // fewest ignored
    }
    function rankingCard(co) {
      var list = (r.by_advisor || []).filter(function (a) { return a.company === co && (state.showFormer || !a.inactive); }).map(function (a) { return { a: a, dec: a.accepted + a.rejected }; });
      list.forEach(function (x) { var p = pv(x); x.ok = p[0]; x.v = p[1]; });
      list.sort(function (p, q) { return (q.ok - p.ok) || (q.v - p.v) || (q.a.released - p.a.released) || (q.a.accepted - p.a.accepted); });
      var rank = 0, prev = null, pos = 0;
      list.forEach(function (x) { pos += 1; if (!x.ok) { x.rank = null; return; } if (prev === null || x.v !== prev) rank = pos; prev = x.v; x.rank = rank; });
      var rows = list.map(function (x) {
        var a = x.a; var decided = x.dec; var medal = x.rank === 1 ? ' \u{1F947}' : x.rank === 2 ? ' \u{1F948}' : x.rank === 3 ? ' \u{1F949}' : '';
        var nums = [a.released, a.delivered, a.opened, a.accepted, a.rejected, a.released - decided - a.bounced - a.waiting_for_company - a.ignored, a.ignored];
        return h('tr', { class: x.rank && x.rank <= 3 ? 'top' + x.rank : '' },
          h('td', { class: 'rank', text: x.rank ? x.rank + medal : '-', title: x.rank ? '' : 'Not ranked: fewer than ' + MIN + ' results for this ranking' }),
          h('td', null, a.advisor_name || (a.advisor_ref ? 'Staff ' + String(a.advisor_ref).slice(0, 8) : 'No counselor on record'), a.no_results_yet && !a.released ? h('span', { class: 'chip', text: 'No result sent yet' + (a.interviews ? ' - ' + a.interviews + ' interview' + (a.interviews === 1 ? '' : 's') : ''), title: 'Listed so every ' + (co === 'RGAB' ? 'counselor' : 'advisor') + ' is visible, also new staff' }) : null),
          h('td', { text: a.interviews_done === undefined ? '-' : String(a.interviews_done), title: 'Interviews held in this period' }), h('td', { text: a.waiting === undefined || a.waiting === null ? '-' : String(a.waiting), title: a.waiting === undefined || a.waiting === null ? 'Not known: ' + co + ' sends its own result e-mails and does not tell the Command Center before sending' : 'Approved, result e-mail not released yet' }),
          nums.map(function (n) { return h('td', { text: String(n) }); }),
          h('td', { text: rate(a.delivered, a.released) }), h('td', { text: rate(a.accepted, decided) + (decided ? ' (of ' + decided + ')' : '') }), h('td', { text: rate(a.rejected, decided) }),
          h('td', { text: a.avg_answer_hours === null || a.avg_answer_hours === undefined ? 'N/A' : a.avg_answer_hours + ' h' }));
      });
      var what = co === 'RGAB' ? 'counselor' : 'advisor'; var basis = (RANKS.filter(function (o) { return o[0] === by; })[0] || RANKS[0])[1];
      return h('div', { class: 'card scroll-x rankcard brand-' + co },
        h('h2', null, companyBadge(co), ' ' + co + ' - ' + what + ' ranking'),
        h('p', { class: 'note', text: 'Ranked by: ' + basis + '. Period: ' + resRange()[0] + ' to ' + addDays(resRange()[1], -1) + ' (Dubai). Rates use the answered results shown in brackets; "-" = not ranked (fewer than ' + MIN + ' for this ranking).' }),
        rows.length ? h('table', null, h('thead', null, h('tr', null, ['#', co === 'RGAB' ? 'Counselor' : 'Advisor', 'Interviews held', 'Waiting to send', 'Sent', 'Delivered', 'Opened', 'Accepted', 'Rejected', 'Pending', 'Ignored', 'Delivery rate', 'Acceptance rate', 'Rejection rate', 'Avg answer time'].map(function (x) { return h('th', { text: x }); }))), h('tbody', null, rows))
          : h('p', { class: 'note', text: 'No results were sent in this period.' }));
    }
    var rankSel = h('select', { id: 'rank-by', 'aria-label': 'Rank by', onchange: function (e) { state.rankBy = e.target.value; renderMain(); } }, RANKS.map(function (o) { return h('option', { value: o[0], text: 'Rank by: ' + o[1], selected: by === o[0] }); }));
    var cos = ['RGOS', 'RGAB'].filter(function (co) { return !state.company || state.company === co; });
    // the ranking has its own period buttons (same period as the rest of the page): daily, weekly, monthly or a custom range
    var QUICK = [['today', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['lastmonth', 'Last month'], ['30d', 'Last 30 days'], ['custom', 'Custom']];
    var curP = state.resPreset || '30d';
    var periodSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Ranking period' }, QUICK.map(function (o) {
      return h('button', { type: 'button', 'aria-pressed': String(curP === o[0]), text: o[1], onclick: function () { state.resPreset = o[0]; refresh(); } });
    }));
    var customBox = curP === 'custom' ? h('span', { class: 'toolbar-group' },
      h('input', { type: 'date', 'aria-label': 'Ranking from', value: state.resFrom || rg[0], onchange: function (e) { state.resFrom = e.target.value; state.resTo = state.resTo || e.target.value; refresh(); } }),
      h('input', { type: 'date', 'aria-label': 'Ranking until', value: state.resTo || addDays(rg[1], -1), onchange: function (e) { state.resTo = e.target.value; state.resFrom = state.resFrom || e.target.value; refresh(); } })) : null;
    var formerBox = h('label', { class: 'former-toggle' }, h('input', { type: 'checkbox', id: 'show-former', checked: !!state.showFormer, onchange: function (e) { state.showFormer = e.target.checked; renderMain(); } }), ' Show former staff');
    var advisors = h('div', { class: 'rankings' }, h('div', { class: 'toolbar' }, h('strong', { text: 'Ranking of advisors and counselors (a separate card for each company)' }), periodSeg, customBox, rankSel, formerBox), cos.map(rankingCard));
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

  // ------------------------------------------------------------ notices (the owner writes, the facilitator reads and presses "Got it")
  function loadNotices() {
    if (limited()) return Promise.resolve();
    return api('GET', '/ui/api/notices').then(function (r) { var before = JSON.stringify(state.notices); state.notices = r.items; if (JSON.stringify(r.items) !== before) updateNoticesUi(); }).catch(function () {});
  }
  // redraws only the notice bar and the gate, never the screen under them (so a playing tutorial is never rebuilt)
  function updateNoticesUi() {
    var m = document.getElementById('main'); if (!m || !state.user) return;
    var old = m.querySelector('.notices'); if (old) old.remove(); var nb = noticesBar(); if (nb) m.insertBefore(nb, m.firstChild);
    var og = document.querySelector('.gate'); var keep = og && og.dataset.id; var gate = gateOverlay();
    if (gate && gate.dataset.id === keep) return; if (og) og.remove(); if (gate) { document.body.appendChild(gate); setTimeout(gate.__check, 30); }
  }
  function noticesBar() {
    var memoRole = state.user.role === 'facilitator' || state.user.role === 'approver';
    var waiting = (state.notices || []).filter(function (n) { return n.active && !n.acked && n.mandatory; });
    if (state.user.role === 'approver' && state.gateSnoozed && waiting.length) return h('div', { class: 'notices memo-bar', role: 'status' }, h('span', { text: waiting.length + (waiting.length === 1 ? ' notice is' : ' notices are') + ' waiting for you. ' }), h('button', { class: 'btn', type: 'button', id: 'memo-read', text: 'Read now', onclick: function () { state.gateSnoozed = false; updateNoticesUi(); } }));
    var open = (state.notices || []).filter(function (n) { return n.active && !n.acked && (!n.mandatory || !memoRole); }); if (!open.length) return null;
    return h('div', { class: 'notices' }, open.map(function (n) {
      return h('div', { class: 'notice', role: 'alert' }, h('strong', { class: 'notice-t', text: n.title }), h('p', { class: 'notice-b', text: n.body }),
        h('div', { class: 'notice-f' }, h('span', { class: 'note', text: 'From ' + (n.from || 'the owner') + ', ' + localDate(n.created_at) + ' ' + localTime(n.created_at) }),
          h('button', { class: 'btn', type: 'button', text: 'I acknowledge', onclick: function (e) { e.target.disabled = true; api('POST', '/ui/api/notices/' + n.id + '/ack', {}).then(function () { n.acked = true; renderMain(); return loadNotices(); }).then(renderMain).catch(function () { e.target.disabled = false; }); } })));
    }));
  }
  function noticesTab() {   // every published notice stays here, so it can always be read again
    var all = state.notices || []; var f = state.noticeFilter || ''; var list = all.filter(function (n) { return !f || (f === 'owner' ? !n.company : n.company === f); });
    var count = function (k) { return all.filter(function (n) { return k === 'owner' ? !n.company : n.company === k; }).length; };
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Notice history' }, [['', 'All (' + all.length + ')'], ['RGOS', 'RGOS (' + count('RGOS') + ')'], ['RGAB', 'RGAB (' + count('RGAB') + ')'], ['owner', 'From the owner (' + count('owner') + ')']].map(function (o) {
      return h('button', { type: 'button', 'aria-pressed': String(f === o[0]), text: o[1], onclick: function () { state.noticeFilter = o[0]; renderMain(); } }); }));
    return h('div', null, h('div', { class: 'card' }, h('h2', { text: 'Notices' }), h('p', { class: 'note', text: 'Everything published for you stays here, with a separate history for RGOS, RGAB and the owner. Your acknowledgement is recorded with the date and time.' }), seg),
      list.length ? list.map(function (n) {
        var status = n.acked ? chip('Acknowledged ' + localDate(n.my_acked_at) + ' ' + localTime(n.my_acked_at), 'ok') : chip('Not acknowledged yet', 'warn');
        return h('details', { class: 'card notice-item', open: !n.acked }, h('summary', null, n.company ? companyBadge(n.company) : null, ' ', h('strong', { text: n.title }), ' ', status, h('span', { class: 'note', text: ' - ' + (n.from || 'the owner') + ', ' + localDate(n.created_at) + ' ' + localTime(n.created_at) })),
          h('p', { class: 'notice-b', text: n.body }),
          !n.acked && !n.mandatory ? h('button', { class: 'btn', type: 'button', text: 'I acknowledge', onclick: function (e) { e.target.disabled = true; api('POST', '/ui/api/notices/' + n.id + '/ack', { read_to_end: true }).then(function () { return loadNotices(); }).then(renderMain).catch(function () { e.target.disabled = false; }); } }) : null);
      }) : h('p', { class: 'note', text: 'No notices here yet.' }));
  }
  function noticesCard() {
    var list = (state.tabData.noticesAll || { items: [] }).items; var msg = h('p', { class: 'err', id: 'noticemsg' });
    var title = h('input', { type: 'text', id: 'nt-title', maxlength: '140', placeholder: 'Title', 'aria-label': 'Notice title' });
    var body = h('textarea', { id: 'nt-body', rows: '4', maxlength: '4000', placeholder: 'What the facilitator should know or do', 'aria-label': 'Notice text' });
    var gated = h('input', { type: 'checkbox', id: 'nt-gated' });
    var aud = h('select', { id: 'nt-aud', 'aria-label': 'Who sees it' }, [['facilitator', 'The facilitator (Aira) and owners'], ['all', 'Everyone who signs in']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    return h('div', { class: 'card' }, h('h2', { text: 'Notices' }), h('p', { class: 'note', text: 'A notice shows at the top of the Command Center until the person presses "Got it". It is recorded who saw it and when.' }),
      h('div', { class: 'field' }, h('label', { text: 'Title' }), title), h('div', { class: 'field' }, h('label', { text: 'Text' }), body), h('div', { class: 'field' }, h('label', { text: 'Show to' }), aud), h('div', { class: 'field' }, h('label', { for: 'nt-gated', text: 'Gated: the person must press "Got it" before using the Command Center' }), gated),
      h('button', { class: 'btn', type: 'button', text: 'Post notice', onclick: function () { api('POST', '/ui/api/notices', { title: title.value, body: body.value, audience: aud.value, mandatory: gated.checked }).then(function () { title.value = ''; body.value = ''; return refreshTab(); }).catch(function (x) { msg.textContent = x.message; }); } }), msg,
      list.length ? h('table', null, h('thead', null, h('tr', null, ['Posted', 'Title', 'Seen by', ''].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', null, list.map(function (n) { var seen = (n.acked_by || []).map(function (a) { return a.name + ' ' + localDate(a.at) + ' ' + localTime(a.at) + (a.read_to_end === true ? ' (read to the end)' : ''); }).join('; ');
          return h('tr', null, h('td', { text: localDate(n.created_at) + ' ' + localTime(n.created_at) }), h('td', { text: n.title + (n.active ? '' : ' (removed)') }), h('td', { text: seen || 'Not seen yet' }),
            h('td', null, n.active ? h('button', { class: 'btn secondary', type: 'button', text: 'Remove', onclick: function () { api('DELETE', '/ui/api/notices/' + n.id).then(refreshTab); } }) : null)); }))) : h('p', { class: 'note', text: 'No notices yet.' }));
  }
  // ------------------------------------------------------------ workspace functions (the company describes them; the Command Center shows and carries them)
  function askDialog(o) {   // o: { title, text, kind: confirm|confirm_reason|choice|slot, choices, reasonLabel, bookingId } -> Promise of params, or null when cancelled
    return new Promise(function (resolve) {
      var msg = h('p', { class: 'err', role: 'alert' }); var done = false; var field = null; var picked = null;
      var finish = function (v) { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
      var body = [h('h3', { text: o.title }), o.text ? h('p', { text: o.text }) : null];
      if (o.kind === 'confirm_reason') { field = h('textarea', { rows: '3', maxlength: '500', 'aria-label': o.reasonLabel || 'Reason' }); body.push(h('label', { text: o.reasonLabel || 'Reason' }), field); }
      var mail1 = null; var mail2 = null;
      if (o.kind === 'recipient') {
        mail1 = h('input', { type: 'email', id: 'new-recipient', maxlength: '254', autocomplete: 'off', placeholder: 'New e-mail address', 'aria-label': 'New e-mail address' });
        mail2 = h('input', { type: 'email', id: 'new-recipient2', maxlength: '254', autocomplete: 'off', placeholder: 'Type the new e-mail address again', 'aria-label': 'Type the new e-mail address again' });
        field = h('input', { type: 'text', maxlength: '300', placeholder: o.reasonLabel || 'Why is the address changed?', 'aria-label': o.reasonLabel || 'Why is the address changed?' });
        body.push(h('p', { class: 'note', text: 'Only the result e-mail that has not been sent yet goes to the new address. Check it letter by letter: a wrong address sends the result to a stranger.' }), mail1, mail2, field);
      }
      if (o.kind === 'choice') { field = h('select', { 'aria-label': 'Choose' }, (o.choices || []).map(function (c) { return h('option', { value: String(c.value), text: c.label }); })); body.push(field); }
      if (o.kind === 'slot') {
        var slotBox = h('div', { class: 'slotbox' }, h('p', { class: 'note', text: 'Pick a day to see the free times.' }));
        var day = h('input', { type: 'date', 'aria-label': 'New day', min: todayDubai(), onchange: function (e) {
          if (!e.target.value) return; slotBox.textContent = ''; slotBox.appendChild(h('p', { class: 'note', text: 'Loading...' })); picked = null;
          api('GET', '/ui/api/booking/' + o.bookingId + '/slots?date=' + encodeURIComponent(e.target.value)).then(function (r) {
            slotBox.textContent = ''; var free = (r.slots || []).filter(function (s) { return s.state === 'available'; });
            if (!free.length) { slotBox.appendChild(h('p', { class: 'note', text: 'No free time on that day.' })); return; }
            free.forEach(function (s) { slotBox.appendChild(h('button', { type: 'button', class: 'slot', text: localTime(s.start), onclick: function (ev) { picked = s; slotBox.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); }); ev.target.setAttribute('aria-pressed', 'true'); } })); });
          }).catch(function (x) { slotBox.textContent = ''; slotBox.appendChild(h('p', { class: 'err', text: x.message || 'Could not load the times.' })); });
        } });
        var why = h('input', { type: 'text', maxlength: '300', placeholder: o.reasonLabel || 'Reason (optional)', 'aria-label': o.reasonLabel || 'Reason (optional)' }); field = why;
        body.push(day, slotBox, why);
      }
      body.push(msg, h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', text: o.kind === 'confirm' ? 'Yes' : 'Confirm', onclick: function () {
          if (o.kind === 'recipient') {
            var e1 = mail1.value.trim().toLowerCase(); var e2 = mail2.value.trim().toLowerCase();
            if (!/^[^\s@<>"',;()\[\]\\]{1,64}@[a-z0-9.-]{1,185}\.[a-z]{2,24}$/.test(e1)) { msg.textContent = 'That e-mail address is not valid.'; return; }
            if (e1 !== e2) { msg.textContent = 'The two addresses are not the same. Type them again.'; return; }
            if (!field.value || field.value.trim().length < 3) { msg.textContent = 'Write a short reason.'; return; }
            finish({ email: e1, reason: field.value.trim() });
          }
          else if (o.kind === 'confirm_reason') { if (!field.value || field.value.trim().length < 3) { msg.textContent = 'Write a short reason.'; return; } finish({ reason: field.value.trim() }); }
          else if (o.kind === 'choice') { var c = (o.choices || []).filter(function (x) { return String(x.value) === field.value; })[0]; finish({ value: c ? c.value : field.value }); }
          else if (o.kind === 'slot') { if (!picked) { msg.textContent = 'Choose a time.'; return; } var sp = { start: picked.start, end: picked.end }; if (field && field.value.trim()) sp.reason = field.value.trim(); finish(sp); }
          else finish({});
        } }),
        h('button', { class: 'btn secondary', type: 'button', text: 'Cancel', onclick: function () { finish(null); } })));
      var dlg = h('dialog', { class: 'ask-dialog' }, body); dlg.addEventListener('close', function () { finish(null); }); document.body.appendChild(dlg); dlg.showModal();
    });
  }
  function workflowModel(b, dr) {
    var d = b.details || {}; var x = dr.extra || {}; var ws = dr.workspace || {}; var mail = ws.result_email || {};
    var labels = [['Job position', d.job_position || x.job_position], ['Program applied', d.program_applied], ['Country applied', d.country_applied], ['Salary', d.salary], ['Nationality', d.nationality]];
    var missing = labels.filter(function (r) { return !r[1]; }).map(function (r) { return r[0]; });
    var ranks = { none: 0, draft: 1, submitted: 2, awaiting_advisor: 3, approved: 4, released: 5 }; var rank = ranks[b.assessment_status] || 0;
    var stopped = b.status === 'cancelled' || b.status === 'no_show' || b.status === 'not_completed'; var completed = b.status === 'completed';
    var who = b.company === 'RGAB' ? 'Counselor' : 'Advisor';
    var emailState = String(mail.state || '').toLowerCase();
    var sent = ['sent', 'delivered', 'opened', 'accepted', 'rejected'].indexOf(emailState) >= 0;
    var scheduled = ['scheduled', 'queued', 'pending'].indexOf(emailState) >= 0;
    var emailText = mail.label || (rank === 5 ? 'Released to ' + b.company + '. Sending and delivery have not been confirmed here.' : 'The company supplies the sending schedule after the result is ready.');
    if (mail.scheduled_for && !isNaN(Date.parse(mail.scheduled_for))) emailText += ' Scheduled: ' + localDate(mail.scheduled_for) + ' ' + localTime(mail.scheduled_for) + ' Dubai.';
    return { missing: missing, stopped: stopped, steps: [
      { title: 'Check client and booking details', status: missing.length ? 'needs attention' : 'details available', text: missing.length ? 'Ask ' + b.company + ' to check: ' + missing.join(', ') + '. Do not guess or copy details from another booking.' : 'Check these details against the booking before continuing.' },
      { title: 'Hold the interview', status: completed ? 'done' : stopped ? 'stopped' : 'next', text: stopped ? 'This interview is ' + statusLabel(b.status) + '. Do not create or release another result for it.' : completed ? 'The interview is marked completed.' : 'After the interview finishes, press Mark interview completed. If the client did not attend, use Mark no-show.' },
      { title: 'Record and submit the assessment', status: rank >= 2 ? 'done' : completed && !stopped ? 'next' : 'waiting', text: dr.grading && dr.grading.supports_draft === false ? 'Enter the grades and required note, then submit. This company does not offer a separate draft step.' : 'Enter the grades and required note, save the draft, check it, then submit. If grading is not offered here, complete it in the company Interview Workspace.' },
      { title: 'Get ' + who + ' confirmation', status: stopped ? 'stopped' : rank >= 4 ? 'done' : rank === 3 ? 'waiting for ' + who : rank === 2 ? 'next' : 'waiting', text: 'Send the submitted assessment to the owning ' + who + '. Wait for the company to confirm; correct any reported error in the company system.' },
      { title: 'Check the result design and release once', status: rank === 5 ? 'released' : stopped ? 'stopped' : rank === 4 ? 'next' : 'waiting', text: 'Open the result preview and check the recipient, company and design. Release only when the company allows it. A summary without the design is not a design preview.' },
      { title: 'Check the sending schedule and delivery', status: sent ? 'company reports ' + emailState : scheduled ? 'scheduled, not sent' : emailState === 'failed' || emailState === 'bounced' ? 'needs attention' : 'awaiting company report', text: emailText + ' Released, scheduled, sent and delivered are separate stages. Use the available sending controls below; do not release again to check progress.' }
    ] };
  }
  function workflowOverview() {
    var stages = ['Check details', 'Hold the interview', 'Submit assessment', 'Get confirmation', 'Preview and release', 'Track sending'];
    var message = h('p', { class: 'workflow-overview-message', role: 'status' });
    return h('section', { class: 'workflow-overview', 'aria-label': 'Interview workflow overview' },
      h('div', { class: 'workflow-overview-header' },
        h('div', null, h('span', { class: 'workflow-overview-eyebrow', text: 'YOUR DAILY GUIDE' }), h('h2', { text: 'Aira\'s interview route' }), h('p', { text: 'Open an interview to see the next step, what is waiting, and which controls are ready.' })),
        h('div', { class: 'workflow-overview-actions' },
          h('button', { class: 'btn', type: 'button', text: 'Choose an interview', onclick: function () {
            var target = document.querySelector('button.ev[data-id]');
            if (!target) { message.textContent = 'Select a day or another calendar view to find an interview.'; return; }
            var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }); target.focus({ preventScroll: true });
            message.textContent = 'Choose the interview card to open its step-by-step guide. No interview status has changed.';
          } }))),
      h('ol', { class: 'workflow-overview-stages', 'aria-label': 'Six interview stages' }, stages.map(function (label, index) {
        return h('li', null, h('span', { class: 'workflow-overview-number', 'aria-hidden': 'true', text: ('0' + (index + 1)).slice(-2) }), h('span', { text: label }));
      })), message);
  }
  function workflowCard(b, dr) {
    var model = workflowModel(b, dr);
    var current = model.steps.findIndex(function (step) { return step.status === 'next'; });
    if (model.missing.length) current = 0;
    if (current < 0) current = model.steps.findIndex(function (step) { return /waiting for|needs attention|scheduled|awaiting company/.test(step.status); });
    if (current < 0) current = model.steps.length - 1;
    var opened = dr.workflowOpen || {}; if (!dr.workflowOpen) opened[current] = true;
    var targets = ['.drawer .kv', '.drawer [data-action="complete_interview"]', '.drawer .gradecard, .drawer [data-action="submit"]', '.drawer [data-action="request_advisor_confirmation"]', '.drawer #preview-btn', '.drawer .workspace'];
    var shortcuts = ['Find client details', 'Find interview controls', 'Find assessment controls', 'Find confirmation controls', 'Find result preview', 'Find sending status'];
    function jump(index, message) {
      var target = document.querySelector(targets[index]);
      if (!target) { message.textContent = 'These controls are not available for this interview yet. Follow the recorded status and next-step message below.'; return; }
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      if (!target.disabled && typeof target.focus === 'function') {
        if (!target.hasAttribute('tabindex') && !/BUTTON|INPUT|SELECT|TEXTAREA/.test(target.tagName)) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
      message.textContent = target.disabled ? 'This control is waiting for an earlier step. Read its status before continuing.' : 'The relevant section is highlighted below. This guide has not performed any action.';
    }
    return h('section', { class: 'card interview-workflow workflow-' + b.company, 'aria-label': 'Step-by-step interview workflow' },
      h('div', { class: 'workflow-intro' },
        h('span', { class: 'workflow-eyebrow', text: 'YOUR INTERVIEW ROUTE · ' + b.company }),
        h('h3', { text: 'Aira\'s step-by-step workflow' }),
        h('p', { class: 'workflow-current', text: model.stopped ? 'This interview is stopped. Review its recorded status.' : 'Start here: ' + model.steps[current].title }),
        h('p', { class: 'note', text: 'Open a step for guidance. Status comes from the recorded interview and company reports; opening this guide does not complete a step.' })),
      model.missing.length ? h('p', { class: 'workflow-warning', role: 'status', text: (dr.pending > 0 ? 'Still checking details. ' : 'Details need checking. ') + 'Missing: ' + model.missing.join(', ') + '. Ask ' + b.company + ' to complete its existing source record, then refresh details.' }) : null,
      h('ol', { class: 'workflow-steps' }, model.steps.map(function (step, index) {
        var tone = /needs attention|stopped|failed|bounced/.test(step.status) ? 'attention' : step.status === 'next' ? 'current' : /^(done|released|company reports)/.test(step.status) ? 'recorded' : 'waiting';
        var message = h('p', { class: 'workflow-jump-message', role: 'status' });
        return h('li', { class: 'workflow-step is-' + tone + (index === current ? ' is-guided' : '') },
          h('details', { open: !!opened[index], ontoggle: function (event) { dr.workflowOpen = dr.workflowOpen || opened; dr.workflowOpen[index] = event.target.open; } },
            h('summary', { 'aria-label': 'Step ' + (index + 1) + ': ' + step.title + '. ' + step.status },
              h('span', { class: 'workflow-step-number', 'aria-hidden': 'true', text: ('0' + (index + 1)).slice(-2) }),
              h('span', { class: 'workflow-step-heading' }, h('strong', { text: step.title }), h('span', { class: 'workflow-state', text: step.status })),
              h('span', { class: 'workflow-chevron', 'aria-hidden': 'true', text: '+' })),
            h('div', { class: 'workflow-step-content' }, h('p', { class: 'note', text: step.text }),
              h('button', { class: 'btn secondary workflow-jump', type: 'button', text: shortcuts[index], onclick: function () { jump(index, message); } }), message)));
      })));
  }
  // Session hints bridge drawer refreshes; fresh company workspace readback restores them after reload.
  var pendingActionState = Object.create(null); var pendingActionVersions = Object.create(null);
  function isPendingActionResponse(reply) {
    return !!reply && typeof reply === 'object' && (reply.pending === true || ['move_pending', 'recovery_pending', 'scheduling_pending'].indexOf(reply.code) >= 0 || ['pending', 'recovery_pending'].indexOf(reply.status) >= 0);
  }
  function actionOperationRef(value) { return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : ''; }
  function pendingActionKey(booking) { return booking && ['RGOS', 'RGAB'].indexOf(booking.company) >= 0 && actionOperationRef(booking.id) ? booking.company + ':' + booking.id : ''; }
  function pendingActionVersion(booking) { return pendingActionVersions[pendingActionKey(booking)] || 0; }
  function pendingActionFor(booking) { return pendingActionState[pendingActionKey(booking)] || null; }
  function syncPendingAction(booking, workspace, readVersion) {
    var key = pendingActionKey(booking);
    if (!key || !workspace || readVersion !== pendingActionVersion(booking) || !Object.prototype.hasOwnProperty.call(workspace, 'pending_action')) return false;
    var value = workspace.pending_action;
    if (value === null) { var existed = !!pendingActionState[key]; delete pendingActionState[key]; return existed; }
    if (!value || value.kind !== 'reschedule' || ['pending', 'review'].indexOf(value.status) < 0 || !actionOperationRef(value.operation_ref)) return false;
    var previous = JSON.stringify(pendingActionState[key] || null);
    pendingActionState[key] = { kind: 'reschedule', status: value.status, operation_ref: value.operation_ref };
    return previous !== JSON.stringify(pendingActionState[key]);
  }
  function recordCompanyAction(booking, action, reply) {
    if (isPendingActionResponse(reply)) {
      var key = pendingActionKey(booking); var ref = actionOperationRef(reply.operation_ref) || actionOperationRef(reply.move_receipt);
      if (reply.operation_ref && reply.move_receipt && actionOperationRef(reply.operation_ref) !== actionOperationRef(reply.move_receipt)) ref = '';
      if (key) {
        pendingActionVersions[key] = pendingActionVersion(booking) + 1;
        pendingActionState[key] = { kind: action === 'reschedule' || reply.code === 'move_pending' ? 'reschedule' : 'company_action', status: 'pending', operation_ref: ref };
      }
      return true;
    }
    if (reply && reply.ok === false) {
      var error = new Error(reply.code === 'move_operation_closed' ? 'The company closed this reschedule request without confirming a new time. Refresh the current interview before requesting another change.' : 'The company did not confirm this change. Refresh the current interview and check its status before trying again.');
      error.code = reply.code; throw error;
    }
    return false;
  }
  function pendingActionCard(booking) {
    var pending = pendingActionFor(booking); if (!pending) return null;
    var reschedule = pending.kind === 'reschedule';
    return h('div', { class: 'notice pending-action', role: 'status', 'aria-live': 'polite' },
      h('strong', { text: pending.status === 'review' ? 'Company review is required' : reschedule ? 'Reschedule verification is pending' : 'Company verification is pending' }),
      h('p', { text: booking.company + ' has not confirmed this change. ' + (reschedule ? 'The requested new time is not confirmed. ' : '') + 'The interview below remains the last reported current appointment.' }),
      h('p', { text: 'Do not repeat the action, create a replacement, or cancel merely to clear this pending request. Coordinate a genuine cancellation with the assigned advisor/counselor and company Team Leader or Super Admin.' }),
      h('p', { class: 'note', text: pending.operation_ref ? 'Request reference: ' + pending.operation_ref : 'A valid request reference was not supplied. Ask the owning company to check the existing interview.' }),
      h('button', { class: 'btn secondary', type: 'button', text: 'Refresh current interview', onclick: function () { openDrawer(booking.id); } }));
  }

  function workspaceCard(b, dr, msg) {
    var ws = dr.workspace; if (!ws) return null;
    var actions = Array.isArray(ws.actions) ? ws.actions.filter(function (a) { return a.id !== 'mark_not_completed'; }) : []; var mail = ws.result_email;
    if (!actions.length && !mail) return null;
    var sending = actions.filter(function (a) { return /result|email|requeue/.test(a.id); });
    var other = actions.filter(function (a) { return sending.indexOf(a) < 0; });
    return h('div', { class: 'card workspace' }, h('h3', { text: 'Sending schedule and company functions' }),
      mail ? h('div', { class: 'mail-status', role: 'status' }, h('strong', { text: 'Result e-mail: ' + (mail.label || mail.state || 'Awaiting company report') }),
        mail.scheduled_for && !isNaN(Date.parse(mail.scheduled_for)) ? h('p', { text: 'Scheduled for ' + localDate(mail.scheduled_for) + ' at ' + localTime(mail.scheduled_for) + ' Dubai time.' }) : null,
        h('p', { class: 'note', text: 'Release hands the result to ' + b.company + '. A scheduled result has not been sent yet. Check Results sent for the company\'s sending and delivery reports.' })) : null,
      !sending.length ? h('p', { class: 'note', text: b.company + ' is not offering a change to the sending schedule for this interview and account right now.' }) : h('h4', { text: 'Sending controls' }),
      h('div', { class: 'actions' }, sending.concat(other).map(function (a) {
        return h('button', { class: 'btn secondary', type: 'button', 'data-ws': a.id, text: a.label, disabled: a.id === 'reschedule' && !!pendingActionFor(b), onclick: function () {
          if (a.id === 'reschedule' && pendingActionFor(b)) return;
          askDialog({ title: a.label, text: a.confirm || '', kind: a.kind, choices: a.choices, reasonLabel: a.reason_label, bookingId: b.id }).then(function (params) {
            if (!params) return; msg.className = 'err'; msg.textContent = '';
            return api('POST', '/ui/api/booking/' + b.id + '/action', { action: a.id, params: params }).then(function (reply) { if (recordCompanyAction(b, a.id, reply)) softRender(); return refreshAll(); }).then(function () { openDrawer(b.id); }).catch(function (x) { msg.className = 'err'; msg.textContent = x.message; });
          });
        } });
      })));
  }
  function listsTab(name) {
    var data = state.tabData['list_' + name]; var title = name === 'offers' ? 'Offer follow-up' : 'Advisor confirmations';
    var bar = h('div', { class: 'toolbar' }, companyFilter(), h('button', { class: 'btn secondary', type: 'button', text: 'Refresh', onclick: function () { refreshTab(); } }));
    if (!data) return h('div', null, bar, h('p', { class: 'note', text: 'Loading...' }));
    var msg = h('p', { class: 'err', id: 'listmsg' });
    return h('div', null, bar, msg, data.sections.map(function (sec) {
      var head = h('h2', null, companyBadge(sec.company), ' ' + (sec.title || title) + ' (' + sec.company + ')');
      if (sec.error) return h('div', { class: 'card' }, head, h('p', { class: 'note', text: sec.code === 'outside_hours' ? sec.company + ' shows this list to you only from 10:00 AM to 10:00 PM Dubai time.' : sec.error === 'unavailable' ? sec.company + ' did not answer just now. It will try again by itself; if it stays like this, tell the owner.' : sec.error === 'forbidden' ? sec.company + ' did not allow this list for your account. Tell the owner.' : sec.error === 'no_identity' ? 'Your ' + sec.company + ' account is not linked yet. Tell the owner.' : sec.company + ' has not switched this on yet.' }));
      return h('div', { class: 'card scroll-x' }, head, sec.note ? h('p', { class: 'note', text: sec.note }) : null,
        sec.rows.length ? h('table', null, h('thead', null, h('tr', null, sec.columns.map(function (c) { return h('th', { text: c.label }); }).concat([h('th', { text: '' })]))),
          h('tbody', null, sec.rows.map(function (r) {
            return h('tr', null, sec.columns.map(function (c) { return h('td', { text: r.cells[c.id] || '' }); }).concat([h('td', null, r.actions.map(function (a) {
              return h('button', { class: 'btn secondary', type: 'button', text: a.label, onclick: function () {
                askDialog({ title: a.label, text: a.confirm || '', kind: a.kind, choices: a.choices, reasonLabel: a.reason_label }).then(function (params) {
                  if (!params) return; msg.textContent = '';
                  return api('POST', '/ui/api/lists/' + name + '/action', { company: sec.company, row_id: r.id, action: a.id, params: params }).then(function () { return refreshTab(); }).catch(function (x) { msg.textContent = x.message; });
                });
              } });
            }))]));
          }))) : h('p', { class: 'note', text: 'Nothing here.' }));
    }));
  }
  // a gated (mandatory) notice covers the screen until the person presses "Got it"
  function gateOverlay() {
    var gateRole = state.user && (state.user.role === 'facilitator' || (state.user.role === 'approver' && !state.gateSnoozed));   // owners see the same centred memo; "Read later" lets them reach the emergency controls first
    var pending = gateRole ? (state.notices || []).filter(function (x) { return x.active && x.mandatory && !x.acked; }) : [];
    var n = pending[0]; document.body.classList.toggle('gated', !!n); if (!n) return null;
    var reached = false, sending = false, initialized = false, disposed = false;
    var lastHeight = 0, lastWidth = 0, resizeObserver, removalObserver;
    var content = h('p', { class: 'notice-b', text: n.body });
    var scroller = h('div', { class: 'notice-scroll', tabindex: '0', id: 'gate-text', role: 'region', 'aria-label': 'Notice message. Scroll here to read to the end.' }, content);
    var hint = h('p', { class: 'note', id: 'gate-hint', role: 'status', 'aria-live': 'polite', text: 'Read the message below. Scroll inside the message to reach the end.' });
    var error = h('p', { class: 'err gate-error', role: 'alert' });
    var ok = h('button', { class: 'btn', type: 'button', id: 'gate-ok', text: 'I acknowledge', disabled: true, onclick: function () {
      el.__check(); if (!reached || sending || disposed) return;
      sending = true; ok.disabled = true; error.textContent = '';
      api('POST', '/ui/api/notices/' + n.id + '/ack', { read_to_end: true }).then(function () { n.acked = true; return loadNotices(); }).then(function () { renderMain(); }).catch(function (failure) {
        if (!el.isConnected) return; sending = false; error.textContent = failure.message || 'Acknowledgement could not be verified. Please try again.'; el.__check();
      });
    } });
    var later = state.user.role === 'approver' ? h('button', { class: 'btn secondary', type: 'button', id: 'gate-later', text: 'Read later', onclick: function () { state.gateSnoozed = true; updateNoticesUi(); } }) : null;
    var header = h('header', { class: 'gate-header' }, h('div', { class: 'gate-eyebrow', text: 'Required notice' + (pending.length > 1 ? ' | ' + pending.length + ' awaiting acknowledgement' : '') }),
      n.company ? h('div', { class: 'gate-company' }, companyBadge(n.company), h('span', { class: 'note', text: ' Notice from ' + n.company })) : null,
      h('h2', { id: 'gate-title', text: n.title }),
      h('p', { class: 'note', id: 'gate-description', text: 'From ' + (n.from || 'the owner') + ', ' + localDate(n.created_at) + ' ' + localTime(n.created_at) + '. Read this notice before continuing. Your explicit acknowledgement is recorded with the date and time.' }));
    var el = h('div', { class: 'gate', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title', 'aria-describedby': 'gate-description gate-hint', 'data-id': n.id },
      h('section', { class: 'gate-box', tabindex: '-1' }, header, scroller, h('footer', { class: 'gate-footer' }, hint, error, later, ok)));
    function focusMessage() { if (el.isConnected) scroller.focus({ preventScroll: true }); }
    function keydown(event) {
      if (!el.isConnected) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); return; }
      if (event.key !== 'Tab') return;
      var targets = Array.prototype.slice.call(el.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')).filter(function (node) { return node.getClientRects().length; });
      var first = targets[0], last = targets[targets.length - 1];
      if (!first) { event.preventDefault(); focusMessage(); return; }
      if (!el.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
    }
    function focusin(event) { if (el.isConnected && !el.contains(event.target)) focusMessage(); }
    function fontsLoading() { reached = false; el.__check(); }
    function dispose() {
      if (disposed) return; disposed = true;
      if (resizeObserver) resizeObserver.disconnect(); if (removalObserver) removalObserver.disconnect();
      window.removeEventListener('resize', el.__check); document.removeEventListener('keydown', keydown, true); document.removeEventListener('focusin', focusin, true);
      if (document.fonts && document.fonts.removeEventListener) { document.fonts.removeEventListener('loadingdone', el.__check); document.fonts.removeEventListener('loading', fontsLoading); }
      if (!document.querySelector('.gate')) {
        document.body.classList.remove('gated'); var previous = document.body.__picGateReturnFocus; delete document.body.__picGateReturnFocus;
        if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus({ preventScroll: true });
        else { var main = document.getElementById('main'); if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); } }
      }
    }
    el.__check = function () {
      if (disposed || !el.isConnected) return;
      if (!initialized) {
        initialized = true;
        if (!document.body.__picGateReturnFocus) document.body.__picGateReturnFocus = document.activeElement;
        document.addEventListener('keydown', keydown, true); document.addEventListener('focusin', focusin, true); window.addEventListener('resize', el.__check);
        if (typeof ResizeObserver === 'function') { resizeObserver = new ResizeObserver(el.__check); resizeObserver.observe(scroller); resizeObserver.observe(content); }
        removalObserver = new MutationObserver(function () { if (!el.isConnected) dispose(); }); removalObserver.observe(document.body, { childList: true });
        if (document.fonts) { document.fonts.ready.then(function () { if (!disposed) el.__check(); }); if (document.fonts.addEventListener) { document.fonts.addEventListener('loadingdone', el.__check); document.fonts.addEventListener('loading', fontsLoading); } }
        focusMessage();
      }
      var remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if ((lastHeight !== scroller.scrollHeight || lastWidth !== scroller.clientWidth) && remaining > 2) reached = false;
      lastHeight = scroller.scrollHeight; lastWidth = scroller.clientWidth;
      if (scroller.clientHeight > 0 && remaining <= 2 && (!document.fonts || document.fonts.status !== 'loading')) reached = true;
      ok.disabled = sending || !reached;
      hint.textContent = sending ? 'Saving your acknowledgement...' : reached ? 'End of notice reached. Select "I acknowledge" to continue.' : 'Scroll inside the message to the end to enable "I acknowledge".';
    };
    scroller.addEventListener('scroll', el.__check, { passive: true });
    return el;
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
  function daysLabel(ws) {   // 0 = Sunday ... 6 = Saturday; shown Monday first, as a range when the days run on
    var o = (ws || []).map(function (d) { return (d + 6) % 7; }).sort(function (x, y) { return x - y; }); if (!o.length) return '-';
    var names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']; if (o.length === 7) return 'Every day';
    var run = o.every(function (v, i) { return i === 0 || v === o[i - 1] + 1; });
    return run && o.length > 2 ? names[o[0]] + ' - ' + names[o[o.length - 1]] : o.map(function (v) { return names[v]; }).join(', ');
  }
  function profilesCard() {
    var p = (state.tabData.profiles || {}).items || [];
    return h('div', { class: 'card wide-card' }, h('h2', { text: 'Company booking hours' }),
      h('table', null, h('thead', null, h('tr', null, ['Company', 'Slot', 'First start', 'Last start', 'Company break', 'Days'].map(function (x) { return h('th', { text: x }); }))),
        h('tbody', null, p.map(function (c) { return h('tr', null, h('td', null, companyBadge(c.company)), h('td', { text: c.slot_minutes + ' min' }), h('td', { text: c.first_start }), h('td', { text: c.last_start }), h('td', { text: c.break_start ? c.break_start + ' - ' + c.break_end : 'none' }), h('td', { text: daysLabel(c.weekdays) })); }))),
      h('p', { class: 'note', text: window.PIC_ENV === 'live' ? 'Each company supplies its own hours. Interviews can only be booked inside them.' : 'Development seed values. Each company supplies its own hours; the core never assumes shared hours.' }));
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
        frozen ? h('button', { class: 'btn secondary', type: 'button', id: 'enable-req-btn', text: 'Request to re-enable (the owner approves)', onclick: function () { api('POST', '/ui/api/controls/enable-request', { reason: reason.value || 'Resume normal operation' }).then(refreshAll).catch(function (x) { msg.textContent = x.message; }); } }) : null),
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
    var AUDIT_LABEL = { login: 'Signed in', login_failed: 'Sign-in refused (wrong password or code)', logout: 'Signed out', release_requested: 'Result release requested', interview_action: 'Interview action',
      result_history_import: 'Company loaded earlier results', notice_posted: 'Posted a notice', notice_acknowledged: 'Pressed "Got it" on a notice', notice_removed: 'Removed a notice', export: 'Downloaded a report', document_list: 'Looked at the list of client documents', document_view: 'Opened a client document', document_download: 'Downloaded a client document', emergency_freeze: 'Emergency stop switched on', freeze: 'Emergency stop switched on', enable_requested: 'Asked to switch bookings back on', enable_approved: 'Bookings switched back on',
      link_requested: 'Account link requested', link_approved: 'Account link approved', link_revoked: 'Account link removed', incident_reviewed: 'Incident reviewed' };
    function auditWhat(a) { return AUDIT_LABEL[a.action] || (a.action.charAt(0).toUpperCase() + a.action.slice(1).replace(/_/g, ' ')); }
    function auditDetail(a) {
      var x = a.detail || {}; var out = [];
      if (x.via) out.push('with the ' + x.via + ' account');
      if (typeof x.inserted === 'number') out.push(x.inserted + ' new, ' + x.updated + ' corrected' + (x.company ? ' (' + x.company + ')' : ''));
      if (x.action) out.push(String(x.action).replace(/_/g, ' '));
      if (x.locked) out.push('account locked');
      if (x.reason) out.push('reason: ' + x.reason);
      return out.join('; ');
    }
    var audit = h('div', { class: 'card scroll-x' }, h('h2', { text: 'Audit history' }), aud.length ? h('table', null, h('thead', null, h('tr', null, ['When', 'Who', 'What happened', 'Details'].map(function (x) { return h('th', { text: x }); }))), h('tbody', null, aud.slice(0, 40).map(function (a) {
      return h('tr', null, h('td', { text: localDate(a.at) + ' ' + localTime(a.at) }), h('td', { text: a.actor_name || 'Unknown' }), h('td', { text: auditWhat(a) }), h('td', { text: [auditDetail(a), a.target ? 'ref ' + String(a.target).slice(0, 8) : ''].filter(Boolean).join(' - ') }));
    }))) : h('p', { class: 'note', text: 'Nothing recorded yet.' }));
    var testCard = state.user && state.user.role === 'approver' ? h('div', { class: 'card' }, h('h2', { text: 'Test records' }),
      h('p', { class: 'note', text: 'The QA employee and the QA client are hidden from every screen, for everyone. Switch this on only when you are testing: the test records then appear (marked) for you until you switch it off or sign out.' }),
      h('label', null, h('input', { type: 'checkbox', id: 'show-test', checked: !!state.showTest, onchange: function (e) { state.showTest = e.target.checked; calCache = []; resCache = {}; refreshAll(); } }), ' Show test records (owners only)')) : null;
    var rep = state.tabData.reporting; var ago = function (iso) { if (!iso) return 'never'; var m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
    var reportCard = rep && state.user && state.user.role === 'approver' ? h('div', { class: 'card' }, h('h2', { text: 'Company reporting (real time)' }),
      h('p', { class: 'note', text: 'Each company must report what happens to a result (sent, delivered, opened, accepted) within minutes, and keep its staff list current. The ranking is only as exact as these reports.' }),
      rep.companies.map(function (c) {
        var issues = []; if (c.unreported_sent > 0) issues.push(c.unreported_sent + ' released result' + (c.unreported_sent === 1 ? '' : 's') + ' never reported as sent'); if (c.late_events_7d > 0) issues.push(c.late_events_7d + ' report' + (c.late_events_7d === 1 ? '' : 's') + ' came more than 10 minutes late (longest ' + c.max_lag_min_7d + ' min)'); if (c.outbox_pending_15m > 0) issues.push(c.outbox_pending_15m + ' update' + (c.outbox_pending_15m === 1 ? '' : 's') + ' waiting to be picked up for more than 15 minutes'); if (!c.roster || !c.roster.offered) issues.push('no staff list yet, so new or deactivated staff are not reflected in the ranking');
        return h('div', { class: 'card' }, h('div', null, companyBadge(c.company), ' ', chip(issues.length ? 'Needs attention' : 'Reporting well', issues.length ? 'warn' : 'ok')),
          h('p', { class: 'note', text: 'Results released in the last 14 days: ' + c.releases_14d + '. Reports received in the last 7 days: ' + c.events_7d + '. Last report: ' + ago(c.last_event_at) + '. Last full results record: ' + ago(c.last_history_at) + '. Staff list: ' + (c.roster && c.roster.offered ? c.roster.count + ' active people' : 'not offered') + '.' }),
          issues.length ? h('ul', null, issues.map(function (t) { return h('li', { text: t }); })) : h('p', { text: 'Nothing is missing.' }));
      })) : null;
    return h('div', null, controls, reportCard, testCard, h('div', { class: 'grid2' }, incidents, report), noticesCard(), audit);
  }

  function linksTab() {
    var l = state.tabData.links || { identities: [], requests: [] }; var msg = h('p', { class: 'err', id: 'linkmsg' });
    var comp = h('select', { id: 'lk-company', 'aria-label': 'Company' }, ['RGOS', 'RGAB'].map(function (c) { return h('option', { value: c, text: c }); }));
    var ref = h('input', { type: 'text', id: 'lk-ref', placeholder: 'Employee reference in that company', maxlength: '128', 'aria-label': 'Employee reference' });
    var isFac = state.user && state.user.role === 'facilitator'; var isAppr = state.user && state.user.role === 'approver';
    return h('div', { class: 'grid2' },
      h('div', { class: 'card' }, h('h2', { text: 'Linked company identities' }),
        h('p', { class: 'note', text: 'Each link is proven by a one-time code issued inside that company portal, then approved by the owner (the one approver). No company password is ever entered here.' }),
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
    var dr = { id: id, loading: true }; state.drawer = dr; renderMain();
    return api('GET', limited() ? '/ui/api/interviewer/interview/' + id : '/ui/api/booking/' + id).then(function (b) {
      if (state.drawer !== dr) return;
      dr.loading = false; dr.b = b; renderMain();
      if (limited()) return;
      loadDrawerExtras(id, b); loadDupes(id, b);
    }).catch(function (e) { if (state.drawer !== dr) return; dr.loading = false; dr.error = e.message; renderMain(); });
  }
  // the same client booked twice (for example an old record and a new one): shown on the card and in the release box so a second result is never released by mistake
  function loadDupes(id, b) {
    var role = state.user && state.user.role; if ((role !== 'facilitator' && role !== 'approver') || isHistory(b)) return;
    api('GET', '/ui/api/booking/' + id + '/possible-duplicates').then(function (r) { if (!(state.drawer && state.drawer.id === id)) return; var items = (r && r.items) || []; if (JSON.stringify(items) !== JSON.stringify(state.drawer.dups || [])) { state.drawer.dups = items; softRender(); } }).catch(function () {});
  }
  function dupText(x) { return localDate(x.start) + ' ' + localTime(x.start) + ' - ' + statusLabel(x.status) + (x.assessment_status && x.assessment_status !== 'none' ? ', assessment ' + String(x.assessment_status).replace('_', ' ') : ''); }
  // redraws the open interview card without wiping what is being typed
  function softRender() {
    if (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.closest && document.activeElement.closest('.drawer')) return;
    var old = document.querySelector('.drawer'); var top = old ? old.scrollTop : 0; var mainTop = window.pageYOffset;
    renderMain();
    var neu = document.querySelector('.drawer'); if (neu && top) neu.scrollTop = top; if (mainTop) window.scrollTo(0, mainTop);
  }
  // what RGAB gives only in its preview, its documents list and its counselor confirmations (its list lookup has just five fields): merged into the card, live
  function loadDrawerExtras(id, b, quiet) {
      var dr = state.drawer; if (!dr || dr.id !== id || dr.extrasLoading) return Promise.resolve();
      var pendingReadVersion = typeof pendingActionVersion === 'function' ? pendingActionVersion(b) : 0;
      dr.extrasLoading = true; var previousErrors = JSON.stringify(dr.loadErrors || {}); var documentError = dr.loadErrors && dr.loadErrors.documents;
      dr.loadErrors = quiet && documentError ? { documents: documentError } : {};
      var isFacRole = state.user && (state.user.role === 'facilitator' || state.user.role === 'approver');
      var live = ['confirmed', 'completed'].indexOf(b.status) >= 0 && !isHistory(b) && !(quiet && dr.preview404); var nreq = (live ? 1 : 0) + (isFacRole && !isHistory(b) && !quiet ? 1 : 0) + (isFacRole && b.company === 'RGAB' && !isHistory(b) ? 1 : 0);
      dr.pending = quiet ? 0 : nreq; var remaining = nreq;
      var settle = function () { remaining -= 1; if (state.drawer !== dr) return; if (dr.pending > 0) dr.pending -= 1; if (remaining <= 0) { dr.extrasLoading = false; if (!quiet || previousErrors !== JSON.stringify(dr.loadErrors)) softRender(); } };
      var failed = function (part, e) { if (state.drawer === dr) dr.loadErrors[part] = e.message || 'Could not load. Press Retry.'; };
      if (!nreq) dr.extrasLoading = false;
      // if the company offers a grading form for this interview (addendum 0.3.7), show it
      if (live) api('GET', '/ui/api/booking/' + id + '/preview').then(function (p) {
        dr.preview404 = false;
        if (!(state.drawer === dr && p)) return; var changed = false; var x = state.drawer.extra = state.drawer.extra || {};
        if (p.job_position && x.job_position !== p.job_position) { x.job_position = p.job_position; changed = true; } if (p.advisor_name && x.advisor_name !== p.advisor_name) { x.advisor_name = p.advisor_name; changed = true; }
        if (typeof p.to === 'string' && p.to.indexOf('@') > 0 && !p.placeholder && x.client_email !== p.to) { x.client_email = p.to; changed = true; }
        if (b.status === 'completed' && ['none', 'draft'].indexOf(b.assessment_status) >= 0 && p.grading && Array.isArray(p.grading.criteria) && !state.drawer.grading) { state.drawer.grading = p.grading; state.drawer.grades = {}; state.drawer.note = ''; changed = true; }
        var workspace = p.workspace && typeof p.workspace === 'object' && Array.isArray(p.workspace.actions) ? p.workspace : null;
        if (typeof syncPendingAction === 'function' && syncPendingAction(b, workspace, pendingReadVersion)) changed = true;
        if (JSON.stringify(dr.workspace || null) !== JSON.stringify(workspace)) { dr.workspace = workspace; changed = true; }
        if (p.branding && p.branding.name && x.branding !== p.branding.name) { x.branding = p.branding.name; changed = true; }
        if (changed) softRender();
      }).catch(function (e) { if (e && e.status === 404) { dr.preview404 = true; failed('preview', new Error(b.company + ' cannot find the details of this interview yet. It is not a problem with your screen. Tell the owner which interview it is.')); } else failed('preview', e); }).then(settle);   // a missing interview is asked about once, not every 15 seconds
      // Document listing is an audited user view. Background status refresh must not generate another view audit.
      if (isFacRole && !isHistory(b) && !quiet) api('GET', '/ui/api/booking/' + id + '/documents').then(function (dd) {
        if (state.drawer !== dr) return; var items = (dd && dd.items) || []; var x = state.drawer.extra = state.drawer.extra || {};
        var txt = items.length ? items.map(function (i) { return i.label; }).join(', ') : 'None uploaded'; if (x.docs !== txt) { x.docs = txt; softRender(); }
      }).catch(function (e) { failed('documents', e); }).then(settle);
      if (isFacRole && b.company === 'RGAB' && !isHistory(b)) api('GET', '/ui/api/lists/confirmations?company=RGAB').then(function (r) {
        if (state.drawer !== dr) return; var sec = (r.sections || [])[0]; if (sec && sec.error) { failed('confirmations', new Error(sec.code === 'outside_hours' ? 'Confirmation details are available from 10:00 AM to 10:00 PM Dubai time.' : 'The company could not supply confirmation details. Press Retry.')); return; } var row = sec && (sec.rows || []).filter(function (q) { return q.booking_id === id; })[0]; if (!row) return;
        var x = state.drawer.extra = state.drawer.extra || {}; var st = row.cells && row.cells.state; if (st && x.confirmation !== st) { x.confirmation = st; softRender(); }
      }).catch(function (e) { failed('confirmations', e); }).then(settle);
  }
  function drawerEl() {
    var dr = state.drawer; if (!dr) return null;
    var close = h('button', { class: 'btn secondary', type: 'button', text: 'Close', id: 'drawer-close', onclick: function () { state.drawer = null; renderMain(); } });
    var box = h('aside', { class: 'drawer' + (dr.shown ? ' still' : ''), role: 'dialog', 'aria-label': 'Interview details' }, close); dr.shown = true;
    if (dr.loading) { box.appendChild(h('p', { text: 'Loading...' })); return box; }
    if (dr.error) { box.appendChild(h('p', { class: 'err', role: 'alert', text: dr.error })); box.appendChild(h('button', { class: 'btn secondary', type: 'button', text: 'Retry interview details', onclick: function () { openDrawer(dr.id); } })); return box; }
    if (limited()) return limitedDrawer(box, dr);
    var b = dr.b; var d = b.details || {}; var xx = dr.extra || {}; var dash = dr.pending > 0 ? 'Loading...' : '-'; var isFac = state.user.role === 'facilitator' || state.user.role === 'approver';   // facilitator and owners can act
    box.appendChild(h('h2', null, companyBadge(b.company), ' ' + (d.client_name || 'Details unavailable')));
    if (dr.dups && dr.dups.length) box.appendChild(h('div', { class: 'dupwarn', role: 'alert' }, h('strong', { text: 'Possible duplicate: this client has another interview with ' + b.company + '.' }),
      h('ul', null, dr.dups.map(function (x) { return h('li', { text: dupText(x) }); })), h('p', { text: 'Use ONE interview for the result. Do not release or send a second result for the same client. Tell the owner if both should stay.' })));
    var pendingCard = pendingActionCard(b); if (pendingCard) box.appendChild(pendingCard);
    if (b.details_unavailable) box.appendChild(h('p', { class: 'note', text: 'The company system did not answer. Scheduling data below comes from the core.' }));
    var rows = [['Interview', localDate(b.start) + ' ' + localTime(b.start) + '-' + localTime(b.end) + ' (Dubai)'], ['Interview status', statusLabel(b.status)], ['Job position', d.job_position || xx.job_position || dash], ['Program applied', d.program_applied || dash, !d.program_applied && !(dr.pending > 0)], ['Country applied', d.country_applied || dash], ['Salary', d.salary || dash], ['Nationality', d.nationality || dash],
      [b.company === 'RGAB' ? 'Counselor' : 'Advisor', d.advisor_name || xx.advisor_name || dash],
      ['Client e-mail', d.client_email || xx.client_email || dash],
      ['Documents', d.documents ? 'Passport: ' + d.documents.passport + ', CV: ' + d.documents.cv : (xx.docs || dash)], ['Assessment status', ASSESS[b.assessment_status]],
      [b.company === 'RGAB' ? 'Counselor confirmation' : 'Advisor confirmation', d.advisor_confirmation ? d.advisor_confirmation.replace('_', ' ') : (xx.confirmation || (b.assessment_status === 'approved' ? 'Confirmed' : dash))], ['Verification', d.verification_status || 'Not provided by ' + b.company], ['Result release', d.result_release ? d.result_release.replace('_', ' ') : 'Not provided by ' + b.company],
      ['Company branding', d.branding || xx.branding || dash]];
    if (Array.isArray(d.info)) d.info.forEach(function (line) { if (line && line.label && line.value) rows.push([line.label, line.value]); });
    var dl = h('dl', { class: 'kv' }); rows.forEach(function (r) { dl.appendChild(h('dt', { text: r[0] })); dl.appendChild(h('dd', { class: r[2] ? 'missing' : '', text: r[2] ? 'MISSING - ' + b.company + ' has not sent the program applied' : r[1] })); }); box.appendChild(dl);
    if (d.assessment) box.appendChild(h('p', { class: window.PIC_ENV === 'live' ? 'note' : 'mark', text: 'Template: ' + ((d.assessment.template && (d.assessment.template.label || d.assessment.template.id)) || '-') }));
    if (isFac && !isHistory(b)) box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', id: 'docs-btn', text: 'View uploaded documents side by side', onclick: function () { showDocuments(b); } })));
    var msg = h('p', { class: 'err', id: 'drawermsg', role: 'alert' });
    if (isFac && !isHistory(b)) box.appendChild(workflowCard(b, dr));
    if (dr.loadErrors && Object.keys(dr.loadErrors).length) box.appendChild(h('div', { class: 'workflow-warning', role: 'status' },
      h('strong', { text: 'Some company details could not be checked' }),
      Object.keys(dr.loadErrors).map(function (key) { return h('p', { text: key + ': ' + dr.loadErrors[key] }); })));
    box.appendChild(h('button', { class: 'btn secondary', type: 'button', text: 'Refresh company details', onclick: function () { openDrawer(b.id); } }));
    function run(action) {
      var payload = { action: action };
      if (action === 'mark_not_completed') { payload.params = { disposition_code: 'client_disconnected_no_rejoin' }; payload.note = INCOMPLETE_EXPLANATION; }
      if (dr.grading && (action === 'save_draft' || action === 'submit')) {
        var gv = {}; var bad = null; dr.grading.criteria.forEach(function (c) { var v = dr.grades[c.id]; if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > c.max) bad = c; else gv[c.id] = v; });
        if (bad) { msg.className = 'err'; msg.textContent = 'Enter a number from 0 to ' + bad.max + ' for ' + bad.label + '.'; return Promise.resolve(); }
        var need = action === 'submit' ? (dr.grading.submit_note_min_length || 0) : 0;
        if (need && (!dr.note || dr.note.trim().length < need)) { msg.className = 'err'; msg.textContent = 'Write a note of at least ' + need + ' characters before you submit.'; return Promise.resolve(); }
        payload.grades = gv; if (dr.note && dr.note.trim()) payload.note = dr.note.trim();
      }
      return api('POST', '/ui/api/booking/' + b.id + '/action', payload).then(function (reply) { if (recordCompanyAction(b, action, reply)) softRender(); return refreshAll(); }).then(function () { openDrawer(b.id); }).catch(function (x) {
        if (x.code === 'not_applicable' || /Interview Workspace/.test(String(x.message))) { msg.className = 'note'; msg.textContent = b.company + ' records grades in its own Interview Workspace and does not accept them from the Command Center yet. The request to allow it here has been sent to ' + b.company + '; until it is switched on, save or submit this assessment in the ' + b.company + ' Interview Workspace.'; return; }
        msg.className = 'err'; msg.textContent = x.message;
      });
    }
    var nextAction = '';
    function act(label, action, enabled) {
      return h('button', { class: 'btn secondary' + (enabled ? (action === nextAction ? ' next' : '') : ' locked'), type: 'button', text: label, disabled: !enabled, 'aria-disabled': enabled ? null : 'true', title: enabled ? '' : 'Not available yet. See "Next step" above the buttons.', 'data-action': action, onclick: function () { if (action === 'request_advisor_confirmation') confirmAdvisor(b, d, function () { run(action); }); else if (action === 'mark_not_completed') askDialog({ title: 'Interview Not Completed', text: INCOMPLETE_EXPLANATION, kind: 'confirm' }).then(function (answer) { if (answer) run(action); }); else run(action); } });
    }
    if (dr.grading && !isHistory(b) && b.status !== 'not_completed') {
      var gcrit = dr.grading.criteria; var gmax = dr.grading.total_max || gcrit.reduce(function (n, c) { return n + c.max; }, 0); var gtotal = h('strong', { id: 'grade-total', text: '0 / ' + gmax });
      var gsum = function () { var t = 0; gcrit.forEach(function (c) { var v = dr.grades[c.id]; if (typeof v === 'number' && isFinite(v)) t += v; }); gtotal.textContent = t + ' / ' + gmax + (dr.grading.pass_mark ? ' (pass mark ' + dr.grading.pass_mark + ')' : ''); };
      box.appendChild(h('div', { class: 'card gradecard' }, h('h3', { text: 'Assessment grades' }),
        gcrit.map(function (c) { return h('div', { class: 'field' }, h('label', { for: 'gr-' + c.id, text: c.label + ' (0 to ' + c.max + ')' }), h('input', { type: 'number', id: 'gr-' + c.id, min: '0', max: String(c.max), step: '1', value: typeof dr.grades[c.id] === 'number' ? String(dr.grades[c.id]) : '', oninput: function (e) { dr.grades[c.id] = e.target.value === '' ? undefined : Number(e.target.value); gsum(); } })); }),
        h('div', { class: 'field' }, h('label', { for: 'gr-note', text: dr.grading.submit_note_min_length ? 'Note (required to submit, at least ' + dr.grading.submit_note_min_length + ' characters)' : 'Note (optional)' }), h('textarea', { id: 'gr-note', rows: '3', maxlength: '2000', oninput: function (e) { dr.note = e.target.value; } }, dr.note || '')),
        h('p', null, 'Total: ', gtotal), h('p', { class: 'note', text: 'Save the draft, then submit. The company checks the grades with its own rules.' })));
      gsum();
    }
    if (isHistory(b)) {
      box.appendChild(h('p', { class: 'note history-note', text: 'Handled in the ' + b.company + ' portal, before the Command Center. Grades, the Counselor confirmation and the result e-mail for this interview stay in ' + b.company + '. Shown here as history only; nothing can be sent from here.' }));
    } else if (isFac) {
      var done = b.status === 'completed'; var sched = b.status === 'confirmed'; var adv = b.company === 'RGAB' ? 'Counselor' : 'advisor';
      var as = b.assessment_status; var nextStep = b.status === 'not_completed' ? INCOMPLETE_EXPLANATION + ' Ask the owning company to follow up or rebook; this interview cannot release an assessment.' : b.status === 'cancelled' || b.status === 'no_show' ? 'This interview was ' + (b.status === 'no_show' ? 'marked no-show' : 'cancelled') + '. Nothing more to press.'
        : sched ? 'Next step: when the interview is over, press "Mark interview completed" (or "Mark no-show"). The other buttons stay grey until then.'
        : as === 'none' ? (dr.grading && dr.grading.supports_draft === false ? 'Next step: enter the grades and required note, then press "Submit assessment". This company does not use a separate draft step.' : 'Next step: enter the grades (and a note), then press "Save assessment draft". "Submit assessment" turns on after the draft is saved.')
        : as === 'draft' ? 'Next step: check the grades and the note, then press "Submit assessment". "Send to ' + adv + ' for confirmation" turns on after you submit.'
        : as === 'submitted' ? 'Next step: press "Send to ' + adv + ' for confirmation".'
        : as === 'awaiting_advisor' ? 'Sent. Now waiting for the ' + adv + ' to confirm. Nothing to press until the ' + adv + ' answers; "Release result" turns on after that.'
        : as === 'approved' ? 'The ' + adv + ' confirmed. Next step: press "Release result".'
        : as === 'released' ? 'The result was released to ' + b.company + '. Check the sending schedule below and Results sent for sending and delivery reports. Do not release it again.' : '';
      nextAction = sched ? 'complete_interview' : as === 'none' ? (dr.grading && dr.grading.supports_draft === false ? 'submit' : 'save_draft') : as === 'draft' ? 'submit' : as === 'submitted' ? 'request_advisor_confirmation' : as === 'approved' ? 'release' : '';
      if (nextStep) box.appendChild(h('p', { class: 'nextstep', role: 'status', text: nextStep }));
      if (isFac && !isHistory(b)) box.appendChild(h('p', { class: 'note legend', text: 'Green outline = press this one now. Dashed grey with a lock = not available yet.' }));
      box.appendChild(h('div', { class: 'actions' },
        act('Mark interview completed', 'complete_interview', sched), act('Mark no-show', 'mark_no_show', sched),
        act('Interview Not Completed', 'mark_not_completed', sched && Date.parse(b.start) <= Date.now() && !!(dr.workspace && Array.isArray(dr.workspace.actions) && dr.workspace.actions.some(function (a) { return a.id === 'mark_not_completed'; }))),
        (dr.grading && dr.grading.supports_draft === false) ? null : act('Save assessment draft', 'save_draft', done && b.assessment_status === 'none'),
        act('Submit assessment', 'submit', done && (b.assessment_status === 'draft' || (dr.grading && dr.grading.supports_draft === false && b.assessment_status === 'none'))),
        act('Send to ' + adv + ' for confirmation', 'request_advisor_confirmation', done && b.assessment_status === 'submitted'),
        h('button', { class: 'btn' + ((done && b.assessment_status === 'approved') ? ' next' : ' locked'), type: 'button', id: 'release-btn', text: 'Release result', disabled: !(done && b.assessment_status === 'approved'), title: (done && b.assessment_status === 'approved') ? '' : 'Not available yet. See "Next step" above the buttons.', onclick: function () { confirmRelease(b, msg); } })));
    } else box.appendChild(h('p', { class: 'note', text: 'Read-only access (' + state.user.role + ').' }));
    if (!isHistory(b)) box.appendChild(h('div', { class: 'actions' }, h('button', { class: 'btn secondary', type: 'button', id: 'preview-btn', text: 'Preview assessment form (' + b.company + ' branding)', onclick: function () { showPreview(b, msg); } })));
    box.appendChild(msg);
    var wsCard = workspaceCard(b, dr, msg); if (wsCard) box.appendChild(wsCard);
    box.appendChild(h('h3', { text: 'History' }));
    box.appendChild(h('ul', { class: 'timeline' }, (b.events || []).map(function (e) { return h('li', { text: localDate(e.at) + ' ' + localTime(e.at) + ' - ' + e.event.replace(/_/g, ' ') }); })));
    return box;
  }
  // Tolerant of what each company's system returns: missing fields show a dash; "brand_matches_company" blocks only when a company says false.
  function brandOk(p) { return !p.template || p.template.brand_matches_company !== false; }
  function disposePreviews(box) {
    Array.prototype.forEach.call(box.querySelectorAll('iframe.previewframe'), function (fr) { if (fr.__disposePreview) fr.__disposePreview(); });
  }
  function previewBlock(p) {
    if (typeof p.html === 'string' && p.html.trim() && p.html.length <= 400000) {   // company HTML stays inside the isolated, network-blocked frame
      var status = h('p', { class: 'note', role: 'status', text: 'Loading the result e-mail design...' });
      var frameUrl = 'preview-frame.html?v=20261022p2';
      var fr = h('iframe', { class: 'previewframe', src: frameUrl, sandbox: 'allow-scripts', loading: 'eager', fetchpriority: 'high', title: 'The result e-mail as it will be sent', 'data-preview-stage': 'created', 'data-preview-attempt': '1', 'data-preview-revision': '20261022p2', 'data-preview-ready': 'false', 'data-preview-loaded': 'false' });
      var timer; var disposed = false; var rendered = false; var automaticRetried = false; var attempt = 1; var stage = 'created';
      var retry = h('button', { class: 'btn secondary', type: 'button', text: 'Retry design', hidden: true, onclick: function () {
        restart(false);
      } });
      function mark(next) { stage = next; fr.setAttribute('data-preview-stage', next); }
      function fail(reason) { clearTimeout(timer); fr.setAttribute('data-preview-last-stage', stage); fr.setAttribute('data-preview-failure', reason); mark('failed'); status.className = 'err'; status.textContent = 'The design could not be displayed. Retry the design; nothing has been sent.'; retry.hidden = false; }
      function restart(automatic) {
        if (disposed) return;
        clearTimeout(timer); rendered = false; attempt++; fr.setAttribute('data-preview-attempt', String(attempt)); fr.setAttribute('data-preview-ready', 'false'); fr.setAttribute('data-preview-loaded', 'false'); fr.removeAttribute('data-preview-failure'); fr.removeAttribute('data-preview-last-stage');
        mark(automatic ? 'automatic_retry' : 'manual_retry'); status.className = 'note';
        status.textContent = automatic ? 'The preview is taking longer. Retrying once; nothing is being sent.' : 'Loading the result e-mail design...'; retry.hidden = true;
        fr.src = frameUrl + '&attempt=' + attempt + '&retry=' + Date.now(); arm();
      }
      function recover(reason) { if (!automaticRetried) { automaticRetried = true; restart(true); } else fail(reason); }
      function arm() { clearTimeout(timer); timer = setTimeout(function () { if (!disposed && !rendered) recover('timeout'); }, 10000); }
      function send() { try { fr.contentWindow.postMessage({ html: p.html, attempt: attempt }, '*'); mark('html_sent'); } catch (e) { fail('message_send_error'); } }
      function receive(ev) {
        if (disposed || ev.source !== fr.contentWindow || !ev.data) return;
        if (ev.data.attempt !== attempt || ev.data.revision !== '20261022p2') return;
        if (ev.data.preview === 'ready') { fr.setAttribute('data-preview-ready', 'true'); mark('renderer_ready'); send(); return; }
        if (ev.data.preview === 'stage' && ['parsing_html', 'sanitizing_html'].indexOf(ev.data.stage) >= 0) mark(ev.data.stage);
        if (ev.data.preview === 'error') { fail('renderer_error'); return; }
        if (ev.data.preview === 'rendered' && typeof ev.data.h === 'number' && isFinite(ev.data.h)) {
          rendered = true; mark('rendered'); fr.removeAttribute('data-preview-failure'); fr.removeAttribute('data-preview-last-stage');
          fr.style.height = Math.min(Math.max(ev.data.h + 8, 160), 1600) + 'px'; clearTimeout(timer);
          status.className = 'note'; status.textContent = 'Result e-mail design loaded. Preview only; nothing has been sent.'; retry.hidden = true;
        }
      }
      fr.addEventListener('load', function () { if (!disposed && !rendered) { fr.setAttribute('data-preview-loaded', 'true'); mark('frame_loaded'); send(); } });
      fr.addEventListener('error', function () { if (!disposed && !rendered) recover('frame_load_error'); }); window.addEventListener('message', receive); arm();
      fr.__disposePreview = function () { disposed = true; clearTimeout(timer); window.removeEventListener('message', receive); };
      return h('div', { class: 'brandbox brand-' + p.company },
        h('dl', { class: 'kv' }, h('dt', { text: 'From' }), h('dd', { text: p.from || '-' }), h('dt', { text: 'To' }), h('dd', { text: p.to || '-' }), h('dt', { text: 'Subject' }), h('dd', { text: p.subject || '-' })),
        status, retry, fr, h('p', { class: 'note', text: [(p.branding || {}).signature, p.delivery].filter(Boolean).join(' | ') }),
        brandOk(p) ? null : h('p', { class: 'err', text: 'BLOCKED: this assessment is bound to a template of another company. It cannot be sent.' }));
    }
    var tpl = p.template || {}; var br = p.branding || {}; var secs = Array.isArray(p.sections) ? p.sections : [];
    var empty = !secs.length && !tpl.label && !tpl.id;
    return h('div', { class: 'brandbox brand-' + p.company },
      h('p', { class: 'err preview-unavailable', role: 'status', text: 'Result e-mail design unavailable: ' + p.company + ' has not supplied a displayable design for this interview. The information below is an assessment summary, not the e-mail design. Ask ' + p.company + ' to check its result preview.' }),
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
  // The client's uploaded documents, side by side. Fetched live from the owning company when opened; nothing is stored here and every view is audited.
  function showDocuments(b) {
    var grid = h('div', { class: 'docgrid' }, h('p', { class: 'note', text: 'Loading documents...' })); var urls = [];
    var dlg = h('dialog', { id: 'docs-dialog', class: 'docs-dialog' },
      h('div', { class: 'docs-head' }, h('h3', { text: 'Uploaded documents - ' + (((b.details || {}).client_name) || b.company) }), h('button', { class: 'btn secondary', type: 'button', id: 'docs-close', text: 'Close', onclick: function () { dlg.close(); } })),
      h('p', { class: 'note', text: 'Shown live from ' + b.company + '. Nothing is saved in the Command Center, and every view and every download is recorded in the audit history.' }), grid);
    dlg.addEventListener('close', function () { urls.forEach(function (u) { URL.revokeObjectURL(u); }); dlg.remove(); });
    if (limited()) {   // a visible watermark with the viewer's name and the time, so a screenshot shows who took it
      var stamp = (state.user.display_name || 'Interviewer') + ' - Interviewer - ' + localDate(new Date().toISOString()) + ' ' + localTime(new Date().toISOString());
      var wm = h('div', { class: 'watermark', 'aria-hidden': 'true' }); for (var k = 0; k < 24; k++) wm.appendChild(h('span', { text: stamp })); dlg.appendChild(wm);
    }
    document.body.appendChild(dlg); dlg.showModal();
    api('GET', '/ui/api/booking/' + b.id + '/documents').then(function (l) {
      grid.textContent = '';
      if (!l.items.length) { grid.appendChild(h('p', { class: 'note', text: 'The company has no uploaded documents for this interview.' })); return; }
      l.items.forEach(function (d) {
        var body = h('div', { class: 'docbody' }, h('p', { class: 'note', text: 'Loading...' }));
        grid.appendChild(h('div', { class: 'docpanel' }, h('h4', { text: d.label }), body));
        api('GET', '/ui/api/booking/' + b.id + '/documents/' + encodeURIComponent(d.id)).then(function (f) {
          var bin = atob(f.data_base64); var arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          var u = URL.createObjectURL(new Blob([arr], { type: f.mime })); urls.push(u); body.textContent = '';
          body.appendChild(f.mime === 'application/pdf' ? h('iframe', { class: 'docframe', src: u, title: d.label }) : h('img', { class: 'docimg', src: u, alt: d.label }));
          var ext = ({ 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' })[f.mime] || 'bin';
          if (!limited()) body.appendChild(h('div', { class: 'docactions' }, h('button', { class: 'btn secondary', type: 'button', text: 'Download', onclick: function (e) {
            var btn = e.target; btn.disabled = true;
            api('POST', '/ui/api/booking/' + b.id + '/documents/' + encodeURIComponent(d.id) + '/download', {}).then(function () { var a = document.createElement('a'); a.href = u; a.download = (d.kind || 'document').replace(/[^A-Za-z0-9_-]/g, '') + '.' + ext; document.body.appendChild(a); a.click(); a.remove(); toast('Download recorded and started'); }).catch(function () { toast('The download could not be recorded, so it was not made. Try again.'); }).then(function () { btn.disabled = false; });
          } })));
        }).catch(function () { body.textContent = ''; body.appendChild(h('p', { class: 'err', text: 'This document could not be opened.' })); });
      });
    }).catch(function (e) {
      grid.textContent = '';
      grid.appendChild(h('p', { class: 'err', text: (e.status === 404 || e.status === 403 || e.status === 409) ? b.company + ' has not switched on document viewing from the Command Center yet.' : 'The documents could not be loaded.' }));
    });
  }
  function showPreview(b, msg) {
    if (document.getElementById('preview-dialog')) return;
    var content = h('div'); var closed = false; var request = 0;
    var reload = h('button', { class: 'btn secondary', type: 'button', text: 'Reload preview', onclick: load });
    var dlg = h('dialog', { id: 'preview-dialog' }, h('h3', { text: 'Result e-mail preview - ' + b.company }), content,
      h('div', { class: 'actions' }, reload, h('button', { class: 'btn secondary', type: 'button', text: 'Close', onclick: function () { dlg.close(); } })));
    function load() {
      var current = ++request; disposePreviews(content); content.textContent = '';
      content.appendChild(h('p', { class: 'note', role: 'status', text: 'Requesting the result preview from ' + b.company + '...' })); reload.disabled = true;
      api('GET', '/ui/api/booking/' + b.id + '/preview').then(function (p) {
        if (closed || current !== request) return;
        content.textContent = ''; content.appendChild(previewBlock(p));
      }).catch(function (x) {
        if (closed || current !== request) return;
        content.textContent = ''; content.appendChild(h('p', { class: 'err', role: 'alert', text: 'The preview could not be loaded. ' + x.message + ' Use Reload preview to try again. Nothing has been sent.' }));
      }).finally(function () { if (!closed && current === request) reload.disabled = false; });
    }
    document.body.appendChild(dlg); dlg.addEventListener('close', function () { closed = true; disposePreviews(content); dlg.remove(); }); dlg.showModal(); load();
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
      var rt = p.workspace && p.workspace.release_timing; var timing = null; var pick = null; var nowBox = null;
      var dupList = ((state.drawer && state.drawer.id === b.id && state.drawer.dups) || []).filter(function (x) { return x.status === 'completed' || x.status === 'confirmed'; });
      var recAct = ((p.workspace && p.workspace.actions) || []).filter(function (a) { return a.id === 'change_recipient'; })[0]; var recBtn = null;
      if (recAct) recBtn = h('button', { class: 'btn secondary', type: 'button', id: 'change-recipient-btn', text: recAct.label || 'Change recipient', onclick: function () {
        askDialog({ title: recAct.label || 'Change recipient', text: recAct.confirm || '', kind: 'recipient', reasonLabel: recAct.reason_label, bookingId: b.id }).then(function (params) {
          if (!params) return; return api('POST', '/ui/api/booking/' + b.id + '/action', { action: recAct.id, params: params }).then(function () { var old = document.getElementById('release-dialog'); if (old) { old.close(); old.remove(); } confirmRelease(b, msg); }).catch(function (x) { msg.className = 'err'; msg.textContent = x.message; });
        }); } });
      var dupBox = dupList.length ? h('input', { type: 'checkbox', id: 'release-dup-ok', onchange: function (e) { var cb = document.getElementById('release-confirm'); if (cb) cb.disabled = !(e.target.checked && brandOk(p)); } }) : null;
      var dupNote = dupList.length ? h('div', { class: 'dupwarn' }, h('strong', { text: 'This client has another interview:' }), h('ul', null, dupList.map(function (x) { return h('li', { text: dupText(x) }); })), h('label', null, dupBox, ' I checked: this is NOT a second result for the same client.')) : null;
      if (rt && rt.options && rt.options.length) {
        var lab = function (n) { return n < 24 ? n + ' hours' : n === 24 ? '24 hours (1 day, standard)' : n % 24 === 0 ? (n / 24) + ' days' : n + ' hours'; };
        pick = h('select', { id: 'release-hours', 'aria-label': 'Send the result to the client after' }, rt.options.map(function (n) { return h('option', { value: String(n), text: lab(n), selected: n === rt.default }); }));
        nowBox = state.user.role === 'approver' && rt.send_now ? h('input', { type: 'checkbox', id: 'release-now', onchange: function (e) { pick.disabled = e.target.checked; } }) : null;
        timing = h('div', { class: 'card' }, h('label', { for: 'release-hours', text: 'Send the result e-mail to the client after: ' }), pick, h('p', { class: 'note', text: 'The standard is 24 hours. The shortest is 3 hours and the longest is 5 days.' }),
          nowBox ? h('label', null, nowBox, ' Send now (super admin only)') : null);
      }
      var dlg = h('dialog', { id: 'release-dialog' }, h('h3', { text: 'Release this result in ' + p.company + ' branding?' }), previewBlock(p), recBtn, dupNote, timing,
        h('p', { text: 'Release asks ' + p.company + ' to process this result using its own checks and sending schedule. A recorded release does not prove the e-mail was sent or delivered. Recipient, template and branding are validated by that company.' }),
        h('div', { class: 'actions' }, h('button', { class: 'btn', id: 'release-confirm', type: 'button', disabled: !brandOk(p) || !!dupBox, text: 'Yes, release', onclick: function () {
          dlg.close(); var rbody = {}; if (pick) { if (nowBox && nowBox.checked) rbody.send_now = true; else rbody.send_after_hours = parseInt(pick.value, 10); } api('POST', '/ui/api/booking/' + b.id + '/release', rbody).then(function (r) { var pending = recordCompanyAction(b, 'release', r); msg.className = pending ? 'note' : 'ok'; msg.textContent = pending ? 'Company verification is pending. Refresh the current interview to check its status.' : 'Release recorded by ' + b.company + '. ' + (r.delivery || 'Check the company result queue for the sending status.'); if (pending) softRender(); return refreshAll(); }).then(function () { openDrawer(b.id); }).catch(function (x) { msg.className = 'err'; msg.textContent = x.code === 'controls_disabled' ? 'Releases are frozen by management.' : x.code === 'incorrect_template' ? 'Blocked: wrong company template. An incident was recorded.' : x.message; });
        } }), h('button', { class: 'btn secondary', type: 'button', text: 'Cancel', onclick: function () { dlg.close(); } })));
      document.body.appendChild(dlg); dlg.addEventListener('close', function () { disposePreviews(dlg); dlg.remove(); }); dlg.showModal();
    }).catch(function (x) { msg.className = 'err'; msg.textContent = x.message; });
  }

  // ------------------------------------------------------------ shell
  // Sign in: the person's company login (email + password go straight to that company's own login service) or the Command Center's own login name; both need the one-time code.
  // World clock (addendum-free, same list and look as the company portals): UAE first, 12-hour AM/PM, a top strip of favourites and a page with every place

  var WC_REGIONS = [
    ['GCC', [['ae-dubai', 'United Arab Emirates', 'Dubai', 'Asia/Dubai'], ['sa-riyadh', 'Saudi Arabia', 'Riyadh', 'Asia/Riyadh'], ['qa-doha', 'Qatar', 'Doha', 'Asia/Qatar'], ['kw-kuwait-city', 'Kuwait', 'Kuwait City', 'Asia/Kuwait'], ['bh-manama', 'Bahrain', 'Manama', 'Asia/Bahrain'], ['om-muscat', 'Oman', 'Muscat', 'Asia/Muscat']]],
    ['Southeast Asia', [['ph-manila', 'Philippines', 'Manila', 'Asia/Manila'], ['sg-singapore', 'Singapore', 'Singapore', 'Asia/Singapore'], ['my-kuala-lumpur', 'Malaysia', 'Kuala Lumpur', 'Asia/Kuala_Lumpur'], ['id-jakarta', 'Indonesia', 'Jakarta', 'Asia/Jakarta'], ['id-makassar', 'Indonesia', 'Makassar', 'Asia/Makassar'], ['id-jayapura', 'Indonesia', 'Jayapura', 'Asia/Jayapura'], ['th-bangkok', 'Thailand', 'Bangkok', 'Asia/Bangkok'], ['vn-hanoi', 'Vietnam', 'Hanoi', 'Asia/Ho_Chi_Minh'], ['kh-phnom-penh', 'Cambodia', 'Phnom Penh', 'Asia/Phnom_Penh'], ['la-vientiane', 'Laos', 'Vientiane', 'Asia/Vientiane'], ['mm-yangon', 'Myanmar', 'Yangon', 'Asia/Yangon'], ['bn-bandar-seri-begawan', 'Brunei', 'Bandar Seri Begawan', 'Asia/Brunei'], ['tl-dili', 'Timor-Leste', 'Dili', 'Asia/Dili']]],
    ['East Asia', [['jp-tokyo', 'Japan', 'Tokyo', 'Asia/Tokyo'], ['kr-seoul', 'South Korea', 'Seoul', 'Asia/Seoul'], ['cn-beijing', 'China', 'Beijing', 'Asia/Shanghai'], ['hk-hong-kong', 'Hong Kong', 'Hong Kong', 'Asia/Hong_Kong'], ['tw-taipei', 'Taiwan', 'Taipei', 'Asia/Taipei']]],
    ['Middle East and North Africa', [['jo-amman', 'Jordan', 'Amman', 'Asia/Amman'], ['eg-cairo', 'Egypt', 'Cairo', 'Africa/Cairo'], ['tr-istanbul', 'Turkey', 'Istanbul', 'Europe/Istanbul'], ['lb-beirut', 'Lebanon', 'Beirut', 'Asia/Beirut']]],
    ['South Asia', [['in-new-delhi', 'India', 'New Delhi', 'Asia/Kolkata'], ['pk-islamabad', 'Pakistan', 'Islamabad', 'Asia/Karachi'], ['bd-dhaka', 'Bangladesh', 'Dhaka', 'Asia/Dhaka'], ['np-kathmandu', 'Nepal', 'Kathmandu', 'Asia/Kathmandu'], ['lk-colombo', 'Sri Lanka', 'Colombo', 'Asia/Colombo']]],
    ['Europe', [['gb-london', 'United Kingdom', 'London', 'Europe/London'], ['pl-warsaw', 'Poland', 'Warsaw', 'Europe/Warsaw'], ['de-berlin', 'Germany', 'Berlin', 'Europe/Berlin'], ['fr-paris', 'France', 'Paris', 'Europe/Paris'], ['it-rome', 'Italy', 'Rome', 'Europe/Rome'], ['al-tirana', 'Albania', 'Tirana', 'Europe/Tirane'], ['fi-helsinki', 'Finland', 'Helsinki', 'Europe/Helsinki'], ['dk-copenhagen', 'Denmark', 'Copenhagen', 'Europe/Copenhagen'], ['ch-zurich', 'Switzerland', 'Zurich', 'Europe/Zurich'], ['nl-amsterdam', 'Netherlands', 'Amsterdam', 'Europe/Amsterdam'], ['es-madrid', 'Spain', 'Madrid', 'Europe/Madrid'], ['pt-lisbon', 'Portugal', 'Lisbon', 'Europe/Lisbon'], ['gr-athens', 'Greece', 'Athens', 'Europe/Athens']]],
    ['North America', [['ca-toronto', 'Canada', 'Toronto', 'America/Toronto'], ['ca-vancouver', 'Canada', 'Vancouver', 'America/Vancouver'], ['ca-calgary', 'Canada', 'Calgary', 'America/Edmonton'], ['ca-halifax', 'Canada', 'Halifax', 'America/Halifax'], ['us-new-york', 'United States', 'New York', 'America/New_York'], ['us-los-angeles', 'United States', 'Los Angeles', 'America/Los_Angeles'], ['us-chicago', 'United States', 'Chicago', 'America/Chicago']]],
    ['Oceania', [['au-sydney', 'Australia', 'Sydney', 'Australia/Sydney'], ['au-melbourne', 'Australia', 'Melbourne', 'Australia/Melbourne'], ['au-perth', 'Australia', 'Perth', 'Australia/Perth'], ['au-brisbane', 'Australia', 'Brisbane', 'Australia/Brisbane'], ['nz-auckland', 'New Zealand', 'Auckland', 'Pacific/Auckland']]]
  ];
  var WC_DEFAULT = ['ph-manila', 'sa-riyadh', 'jp-tokyo', 'kr-seoul', 'sg-singapore', 'gb-london', 'ca-toronto'];   // the strip: UAE always first, then the places staff work with
  var WC_ALL = []; WC_REGIONS.forEach(function (r) { r[1].forEach(function (p) { WC_ALL.push({ id: p[0], region: r[0], country: p[1], city: p[2], tz: p[3] }); }); });
  function wcPlace(id) { for (var i = 0; i < WC_ALL.length; i++) if (WC_ALL[i].id === id) return WC_ALL[i]; return null; }
  function wcFavs() { try { var v = JSON.parse(window.localStorage.getItem('pic_wc_favs') || 'null'); if (Array.isArray(v)) return v.filter(function (id) { return id !== 'ae-dubai' && wcPlace(id); }).slice(0, 12); } catch (e) { /* default list */ } return WC_DEFAULT.slice(); }
  function wcSaveFavs(list) { try { window.localStorage.setItem('pic_wc_favs', JSON.stringify(list)); } catch (e) { /* kept for this visit only */ } }
  // The time is built by hand from parts: always 12-hour with AM or PM (never a locale string), the same as the staff portals.
  function wcParts(tz, now) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'long' }); var o = {};
    f.formatToParts(now).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: o.weekday };
  }
  function wcTime(pt, secs) { var h12 = pt.h % 12 === 0 ? 12 : pt.h % 12; return (h12 < 10 ? '0' : '') + h12 + ':' + (pt.mi < 10 ? '0' : '') + pt.mi + (secs ? ':' + (pt.s < 10 ? '0' : '') + pt.s : '') + ' ' + (pt.h < 12 ? 'AM' : 'PM'); }
  var WC_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function wcOffsetMin(tz, now) {
    try { var s = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(now).filter(function (p) { return p.type === 'timeZoneName'; })[0].value; var m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(s); if (!m) return 0; return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + (+m[3] || 0)); } catch (e) { return 0; }
  }
  function wcDiffText(min) { if (min === 0) return 'Same time as UAE'; var a = Math.abs(min); var hh = Math.floor(a / 60); var mm = a % 60; var amt = hh + (mm ? ' h ' + mm + ' min' : (hh === 1 ? ' hour' : ' hours')); if (mm) amt = hh + ' h ' + mm + ' min'; return amt + (min > 0 ? ' ahead of UAE' : ' behind UAE'); }
  function wcDayTag(pt, home) { var a = Date.UTC(pt.y, pt.mo - 1, pt.d), b = Date.UTC(home.y, home.mo - 1, home.d); return a === b ? 'Today' : (a < b ? 'Yesterday' : 'Tomorrow'); }
  function wcUtc(min) { var a = Math.abs(min); return 'UTC' + (min < 0 ? '-' : '+') + (Math.floor(a / 60) < 10 ? '0' : '') + Math.floor(a / 60) + ':' + (a % 60 < 10 ? '0' : '') + (a % 60); }
  function worldClock() {
    var now = new Date(); var home = wcParts('Asia/Dubai', now);
    var uae = h('button', { class: 'wc wc-uae', type: 'button', title: 'UAE local time. Open the World clock', onclick: function () { state.tab = 'worldclock'; state.fx = true; refresh(); } },
      h('span', { class: 'wc-city', text: 'UAE' }), h('span', { class: 'wc-time wc-secs', 'data-tz': 'Asia/Dubai', 'data-secs': '1', text: wcTime(home, true) }), h('span', { class: 'wc-date', 'data-tz': 'Asia/Dubai', text: home.wd + ', ' + WC_MONTHS[home.mo - 1] + ' ' + home.d }));
    var rest = wcFavs().map(function (id) { var p = wcPlace(id); var pt = wcParts(p.tz, now); return h('div', { class: 'wc' }, h('span', { class: 'wc-city', text: p.city }), h('span', { class: 'wc-time', 'data-tz': p.tz, text: wcTime(pt, false) })); });
    return h('div', { class: 'worldclock', role: 'group', 'aria-label': 'World clock, UAE time first' }, [uae].concat(rest));
  }
  function worldClockTab() {
    var now = new Date(); var home = wcParts('Asia/Dubai', now); var homeOff = wcOffsetMin('Asia/Dubai', now); var favs = wcFavs(); var q = (state.wcQuery || '').toLowerCase();
    var search = h('input', { type: 'search', id: 'wc-search', placeholder: 'Search country, city or time zone', 'aria-label': 'Search the world clock', value: state.wcQuery || '', oninput: function (e) { state.wcQuery = e.target.value; var pos = e.target.selectionStart; renderMain(); var again = document.getElementById('wc-search'); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } } });
    function card(p) {
      var pt = wcParts(p.tz, now); var off = wcOffsetMin(p.tz, now); var day = pt.h >= 6 && pt.h < 18; var fav = favs.indexOf(p.id) >= 0; var isUae = p.id === 'ae-dubai';
      return h('div', { class: 'card wc-card' + (day ? ' day' : ' night') },
        h('div', { class: 'wc-head' }, h('div', null, h('strong', { text: p.city }), h('span', { class: 'note', text: ' ' + p.country })),
          isUae ? h('span', { class: 'chip', text: 'Reference' }) : h('button', { class: 'btn secondary wc-star', type: 'button', 'aria-pressed': String(fav), 'aria-label': (fav ? 'Remove ' : 'Add ') + p.city + (fav ? ' from' : ' to') + ' the top strip', title: fav ? 'Remove from the top strip' : 'Show in the top strip', text: fav ? '\u2605' : '\u2606', onclick: function () { var l = wcFavs(); var i = l.indexOf(p.id); if (i >= 0) l.splice(i, 1); else l.push(p.id); wcSaveFavs(l); renderMain(); } })),
        h('div', { class: 'wc-time wc-big', 'data-tz': p.tz, text: wcTime(pt, isUae) + '' }),
        h('div', { class: 'note', text: pt.wd + ', ' + WC_MONTHS[pt.mo - 1] + ' ' + pt.d + (isUae ? '' : ' (' + wcDayTag(pt, home) + ')') }),
        h('div', { class: 'note', text: wcDiffText(off - homeOff) + ' - ' + wcUtc(off) + ' - ' + (day ? 'Daytime' : 'Nighttime') }));
    }
    var sections = WC_REGIONS.map(function (r) {
      var list = WC_ALL.filter(function (p) { return p.region === r[0] && (!q || (p.country + ' ' + p.city + ' ' + p.tz).toLowerCase().indexOf(q) >= 0); });
      return list.length ? h('section', { class: 'wc-region' }, h('h3', { text: r[0] }), h('div', { class: 'wc-grid' }, list.map(card))) : null;
    });
    return h('div', null, h('div', { class: 'card' }, h('h2', { text: 'World clock' }), h('p', { class: 'note', text: 'The UAE is always the reference (the Command Center works in Dubai time). Star a place to show it in the top strip. 12-hour time with AM and PM, the same as the company portals.' }), search),
      sections.filter(Boolean).length ? sections : h('p', { class: 'note', text: 'No place matches your search.' }));
  }
  setInterval(function () { var now = new Date(); var els = document.querySelectorAll('.wc-time'); for (var i = 0; i < els.length; i++) { var tz = els[i].getAttribute('data-tz'); var t = wcTime(wcParts(tz, now), els[i].getAttribute('data-secs') === '1' || els[i].classList.contains('wc-big') && tz === 'Asia/Dubai'); if (els[i].textContent !== t) els[i].textContent = t; } var dates = document.querySelectorAll('.wc-date'); for (var j = 0; j < dates.length; j++) { var pt = wcParts('Asia/Dubai', now); var d = pt.wd + ', ' + WC_MONTHS[pt.mo - 1] + ' ' + pt.d; if (dates[j].textContent !== d) dates[j].textContent = d; } }, 1000);

  function loginView() {
    var methods = [['local', 'Login name']].concat(Object.keys(window.PIC_SSO || {}).map(function (c) { return [c, (window.PIC_SSO[c].label || c) + ' account']; }));
    var method = state.loginMethod && methods.some(function (m) { return m[0] === state.loginMethod; }) ? state.loginMethod : (methods.length > 1 ? methods[1][0] : 'local');
    var err = h('p', { class: 'err', id: 'login-err', role: 'alert' });
    var email = h('input', { type: 'email', id: 'email', autocomplete: 'username', required: true }); var pw = h('input', { type: 'password', id: 'password', autocomplete: 'current-password', required: true });
    var totp = h('input', { type: 'text', id: 'totp', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', required: true });
    var status = h('p', { class: 'note login-status', id: 'login-status', role: 'status' });
    var btn = h('button', { class: 'btn', type: 'submit', text: 'Sign in' }); var stage = '';
    // visible progress while signing in (the first request can take a few seconds when the service wakes up), and clear reasons when it fails
    function busy(on, text) { btn.disabled = on; [email, pw, totp].forEach(function (x) { x.disabled = on; }); btn.textContent = on ? 'Signing in...' : 'Sign in'; btn.classList.toggle('loading', on); status.textContent = on ? text : ''; }
    function fail(e) {
      busy(false); totp.value = '';
      err.textContent = e && e.status === 429 ? 'Too many attempts. Wait a few minutes and try again.'
        : e instanceof TypeError ? 'Could not reach the service. Check your internet connection and try again.'
        : stage === 'company' ? 'Your e-mail or password was not accepted by the company login. Check them and try again.'
        : stage === 'companycode' ? 'The two-step code was not accepted. Type the newest code from your authenticator app.'
        : method === 'local' ? 'Login name, password or code not accepted. Check them and type the newest code.'
        : 'Your login is correct, but the 6-digit code was not accepted. In your authenticator app use the entry "Scheduling Hub", make sure the phone clock is set to automatic, and type the newest code.';
      (stage === 'company' ? pw : totp).focus();
    }
    var form = h('form', { class: 'login', onsubmit: function (ev) {
      ev.preventDefault(); err.textContent = ''; stage = method === 'local' ? 'core' : 'company'; busy(true, method === 'local' ? 'Signing in...' : 'Checking your login...');
      if (method === 'local') { api('POST', '/ui/api/login', { email: email.value, password: pw.value, totp: totp.value }).then(function () { return init(); }).catch(fail); return; }
      var cfg = window.PIC_SSO[method];
      // password goes only to the company's own login service, never to this application's server
      var H = { apikey: cfg.key, 'content-type': 'application/json' };
      var step = fetch(cfg.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: H, body: JSON.stringify({ email: email.value.trim(), password: pw.value }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject({ status: r.status }); });
      if (cfg.mfa) {   // this company requires its own second factor: get a second-factor (aal2) session with the code from the company's authenticator app
        step = step.then(function (j) {
          stage = 'companycode'; status.textContent = 'Checking your two-step code...';
          var A = { apikey: cfg.key, 'content-type': 'application/json', authorization: 'Bearer ' + j.access_token };
          return fetch(cfg.url + '/auth/v1/user', { headers: A }).then(function (r) { return r.ok ? r.json() : Promise.reject({ status: r.status }); }).then(function (u) {
            var f = (u.factors || []).filter(function (x) { return x.factor_type === 'totp' && x.status === 'verified'; })[0]; if (!f) return { access_token: j.access_token, password_only: true };   // an account without a company second factor: our own code is used instead
            return fetch(cfg.url + '/auth/v1/factors/' + f.id + '/challenge', { method: 'POST', headers: A, body: '{}' }).then(function (r) { return r.ok ? r.json() : Promise.reject({ status: r.status }); })
              .then(function (c) { return fetch(cfg.url + '/auth/v1/factors/' + f.id + '/verify', { method: 'POST', headers: A, body: JSON.stringify({ challenge_id: c.id, code: totp.value.trim() }) }); })
              .then(function (r) { return r.ok ? r.json() : Promise.reject({ status: r.status }); });
          });
        });
      }
      step.then(function (j) { var own = !cfg.mfa || j.password_only; stage = 'core'; status.textContent = 'Your login is accepted. Opening the Command Center...'; return api('POST', '/ui/api/login-sso', { company: method, token: j.access_token, totp: own ? totp.value : undefined }); })
        .then(function () { return init(); }).catch(fail);
    } }, h('h1', { text: 'Facilitator Command Center' }), h('p', { text: 'Private. Authorised facilitator and management only.' }),
      methods.length > 1 ? h('div', { class: 'seg login-methods', role: 'group', 'aria-label': 'Sign in with' }, methods.map(function (m) { return h('button', { type: 'button', 'aria-pressed': String(method === m[0]), text: m[1], onclick: function () { state.loginMethod = m[0]; render(); } }); })) : null,
      h('div', { class: 'field' }, h('label', { for: 'email', text: method === 'local' ? 'Login name' : 'E-mail (your ' + ((window.PIC_SSO[method] || {}).label || method) + ' login)' }), email), h('div', { class: 'field' }, h('label', { for: 'password', text: 'Password' }), h('div', { class: 'pwwrap' }, pw, h('button', { type: 'button', class: 'pwtoggle', 'aria-pressed': 'false', 'aria-label': 'Show password', text: 'Show', onclick: function (e) { var on = pw.type === 'password'; pw.type = on ? 'text' : 'password'; e.target.textContent = on ? 'Hide' : 'Show'; e.target.setAttribute('aria-pressed', String(on)); e.target.setAttribute('aria-label', on ? 'Hide password' : 'Show password'); pw.focus(); } }))),
      h('div', { class: 'field' }, h('label', { for: 'totp', text: 'Authenticator code' }), totp), btn, status, err,
      window.PIC_ENV === 'live' ? null : h('p', { class: 'note', text: 'Development build: synthetic test identities only.' }));
    return form;
  }
  var TABS = [['calendar', 'Calendar'], ['queues', 'Queues'], ['confirmations', 'Confirmations'], ['offers', 'Offers'], ['results', 'Results sent'], ['availability', 'Leave and availability'], ['notices', 'Notices'], ['worldclock', 'World clock'], ['links', 'Linked identities'], ['management', 'Management'], ['tutorials', 'Tutorials']];
  function tourSeen() { try { return window.localStorage.getItem('pic_tour_done') === '1'; } catch (e) { return true; } }
  // One visible-tab long poll. A revision invalidates data, but never replaces an open form or card.
  var live = { run: 0, timer: null, controller: null, revision: '', fingerprint: '', items: [], unread: 0, failures: 0, dirty: false, drawerPending: false, status: 'Connecting', unsupported: false };
  function stopLive() {
    live.run++; clearTimeout(live.timer); live.timer = null;
    if (live.controller) live.controller.abort(); live.controller = null;
  }
  function endSession() {
    stopLive(); liveSession++; setToken(null); pendingActionState = Object.create(null); pendingActionVersions = Object.create(null); state.user = null; state.drawer = null; state.items = []; state.tabData = {}; state.wide = null; state.controls = null; state.notices = null; state.loaded = null; state.error = null;
    calEpoch++; calCache = []; resCache = {}; calPending = {};
    live.revision = ''; live.fingerprint = ''; live.items = []; live.unread = 0; live.dirty = false; live.drawerPending = false;
    var dialog = document.getElementById('notifications-dialog'); if (dialog) { dialog.close(); dialog.remove(); }
  }
  function liveSafe() {
    var active = document.activeElement; var video = document.querySelector('video');
    return !!state.user && document.visibilityState === 'visible' && !state.drawer && !document.body.classList.contains('touring') && !document.querySelector('dialog[open], .gate') && !(active && (active.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(active.tagName) || (active.closest && active.closest('#main')))) && !(video && !video.paused && !video.ended);
  }
  function flushLiveRefresh() {
    if (!live.dirty || !liveSafe() || live.refreshing) return;
    live.dirty = false; live.refreshing = true;
    var session = liveSession;
    refreshTab(true).then(function () { if (session === liveSession && state.error) live.dirty = true; }).catch(function () { if (session === liveSession) live.dirty = true; }).finally(function () { if (session === liveSession) { live.refreshing = false; updateLiveButton(); } });
  }
  function updateLiveButton() {
    var button = document.getElementById('notifications-btn'); if (!button) return;
    button.textContent = ''; button.appendChild(h('span', { text: 'Updates' + (live.unread ? ' (' + live.unread + ')' : '') }));
    var statusText = live.drawerPending || live.dirty ? 'Updates waiting' : live.status === 'Connecting' ? 'Connecting…' : live.status === 'Live updates connected' ? '' : live.unsupported ? 'Periodic refresh active' : 'Reconnecting…';
    if (statusText) button.appendChild(h('span', { class: 'floating-live-state', text: statusText }));
    button.setAttribute('aria-label', 'Interview updates' + (live.unread ? ', ' + live.unread + ' unread' : '') + '. ' + live.status);
    button.classList.toggle('has-unread', live.unread > 0);
    button.title = live.status;
    var hint = document.getElementById('notifications-connection'); if (hint) hint.textContent = live.status + '. New updates appear when you refresh this list.';
    var empty = document.getElementById('notifications-empty'); if (empty && !live.items.length) empty.textContent = liveEmptyText(false);
    var inbox = document.getElementById('notifications-dialog'); if (empty && live.items.length && inbox && inbox.__refresh) inbox.__refresh();
    var drawer = document.querySelector('.drawer'); var waiting = document.getElementById('interview-updates-waiting');
    if (waiting && (!drawer || !live.drawerPending)) waiting.remove();
    if (drawer && live.drawerPending && !waiting) drawer.insertBefore(h('div', { id: 'interview-updates-waiting', class: 'interview-updates-waiting', role: 'status' }, h('p', { text: 'Updates waiting. Finish your edits, then refresh this interview to see its latest status.' }), h('button', { class: 'btn secondary', type: 'button', text: 'Refresh interview', onclick: function () { var id = state.drawer && state.drawer.id; if (id) { live.drawerPending = false; openDrawer(id); } } })), drawer.firstChild);
  }
  function liveEmptyText(showAll) {
    if (!live.revision && live.status !== 'Live updates connected') return live.failures ? 'Unable to load interview updates. Check your connection and press Retry updates.' : 'Loading interview updates…';
    return showAll ? 'No interview updates are available.' : 'You have no unchecked updates in this list.';
  }
  function startLive(reset) {
    stopLive();
    if (reset) { live.revision = ''; live.fingerprint = ''; live.items = []; live.unread = 0; live.failures = 0; live.dirty = false; live.drawerPending = false; live.refreshing = false; live.unsupported = false; }
    if (!state.user || limited() || live.unsupported || document.visibilityState !== 'visible') return;
    var run = live.run; var session = liveSession;
    function current() { return run === live.run && session === liveSession && !!state.user && document.visibilityState === 'visible'; }
    function poll() {
      if (!current()) return;
      var controller = new AbortController(); live.controller = controller;
      var query = live.revision ? '?revision=' + encodeURIComponent(live.revision) + '&wait=1' : '';
      var delay = 250;
      api('GET', '/ui/api/live-updates' + query, undefined, { signal: controller.signal }).then(function (snapshot) {
        if (!current()) return;
        if (!snapshot || !/^[0-9a-f]{32}$/.test(snapshot.revision) || !Array.isArray(snapshot.items)) throw new Error('Updates temporarily unavailable');
        var fingerprint = JSON.stringify(snapshot.items.map(function (item) { return [item.id, item.booking_id, item.company, item.event, item.at, item.start, item.end, item.status, item.assessment_status, item.disposition_code, item.record_type, item.kind, item.issue_id]; }).sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); }));
        var changed = live.fingerprint && live.fingerprint !== fingerprint;
        live.fingerprint = fingerprint;
        live.revision = snapshot.revision; live.items = snapshot.items; live.unread = Math.max(0, Number(snapshot.unread) || 0); live.failures = 0; live.status = 'Live updates connected';
        if (changed) { calEpoch++; calCache = []; resCache = {}; live.dirty = true; if (state.drawer) live.drawerPending = true; }
        updateLiveButton(); flushLiveRefresh();
      }).catch(function (error) {
        if (!current()) return;
        live.failures++; delay = Math.min(30000, 1000 * Math.pow(2, Math.min(live.failures - 1, 5)));
        live.status = 'Updates reconnecting';
        if (error.status === 403 || error.status === 404) { live.unsupported = true; live.status = 'Updates unavailable; periodic refresh active'; }
        updateLiveButton();
      }).finally(function () {
        if (!current()) return;
        if (live.controller === controller) live.controller = null;
        if (!live.unsupported) live.timer = setTimeout(poll, delay);
      });
    }
    live.status = 'Connecting'; updateLiveButton(); poll();
  }
  var LIVE_LABELS = { confirmed: 'Interview scheduled', rescheduled: 'Interview rescheduled', cancelled: 'Interview cancelled', completed: 'Interview completed', no_show: 'Client did not attend', not_completed: 'Interview Not Completed', assessment_status: 'Assessment updated', advisor_details_confirmed: 'Advisor confirmed AR assessment details', advisor_details_correction_requested: 'Advisor requested corrections to AR assessment details', result_released: 'Result released', result_email_sent: 'Result e-mail sent', result_email_delivered: 'Result e-mail delivered', result_email_bounced: 'Result e-mail bounced', result_opened: 'Result opened', result_accepted: 'Result accepted', result_rejected: 'Result rejected' };
  function notificationIdentity(item) {
    var result = { client: '', advisor: '' };
    if (!item || ['RGOS', 'RGAB'].indexOf(item.company) < 0 || typeof item.booking_id !== 'string') return result;
    var dr = state.drawer; var current = dr && dr.b && dr.id === item.booking_id && dr.b.company === item.company ? dr : null;
    var candidates = (current ? [current.b] : []).concat(state.items || [], state.wide || []);
    function label(value) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) : ''; }
    candidates.forEach(function (booking) {
      if (!booking || booking.id !== item.booking_id || booking.company !== item.company) return;
      var details = booking.details || {};
      if (!result.client) result.client = label(details.client_name);
      if (!result.advisor) result.advisor = label(details.advisor_name);
    });
    if (!result.advisor && current && current.extra) result.advisor = label(current.extra.advisor_name);
    return result;
  }
  function operationalGuidance(item) {
    var uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (!item || item.record_type !== 'operational_issue' || item.event !== 'operational_issue' || ['RGOS', 'RGAB'].indexOf(item.company) < 0 || !uuid.test(item.issue_id || '') || item.id !== 'issue:' + item.issue_id) return null;
    var catalog = {
      duplicate_booking: { title: 'Possible duplicate appointment', what: 'More than one appointment may represent the same intended interview. This alert does not decide which appointment is extra.', steps: ['Open the existing records and compare their booking references, dates and statuses. A matching client name alone is not proof of a duplicate.', 'Preserve the original completed interview and every released assessment.', 'Ask the assigned advisor/counselor and interview coordinator to verify the extra appointment.', 'Only after verification, an authorized coordinator may archive or cancel the extra appointment through the company controls, recording a reason. Do not deactivate the client account.'] },
      failed_sync: { title: 'Scheduling records need reconciliation', what: 'The company and shared calendar have not confirmed the same state. This alert is not proof that a booking failed or was lost.', steps: ['Check the existing company interview and shared calendar for their current date and status.', 'Keep the original request reference. Ask the company coordinator and technical support to reconcile the records.', 'Do not submit a replacement booking or cancel an appointment merely because a reply was lost.'] },
      scheduling_unavailable: { title: 'Scheduling service needs review', what: 'The scheduling service reported an availability problem. Existing appointment status still needs to be checked.', steps: ['Check the existing interview or current request before trying again.', 'Use the booking backup guide to prepare a request for review if the calendar remains unavailable. A prepared request is not a confirmed appointment.', 'Ask the company coordinator and technical support to verify service availability. Do not delete or cancel appointments to work around the outage.'] },
      booking_recovery_pending: { title: 'Booking recovery is pending', what: 'The booking may still be reconciling. This alert does not prove that no booking exists.', steps: ['Check the current interview and its confirmation status using the same request reference.', 'Ask the company coordinator and technical support to verify recovery before repeating a write.', 'Keep the same booking identity. Do not cancel locally, create another booking or deactivate the client account while the outcome is uncertain.'] }
    };
    if (!Object.prototype.hasOwnProperty.call(catalog, item.kind)) return null;
    var entry = catalog[item.kind];
    return { title: entry.title, what: entry.what, steps: entry.steps.slice(0), reference: item.issue_id, company: item.company,
      coordinator: item.company === 'RGAB' ? 'Coordinate with the assigned Immigration Counselor and Team Leader or Management. The Super Admin handles access and technical issues.' : 'Coordinate with the assigned advisor and Team Leader or Super Admin. The Super Admin handles access and technical issues.',
      bookingId: uuid.test(item.booking_id || '') ? item.booking_id : null };
  }
  function notificationReadPath(item) {
    if (item && item.record_type === 'operational_issue') {
      var guidance = operationalGuidance(item); return guidance ? '/ui/api/operational-issues/' + guidance.reference + '/read' : '';
    }
    return item && /^[1-9][0-9]{0,18}$/.test(String(item.id)) ? '/ui/api/notifications/' + item.id + '/read' : '';
  }
  function operationalInstructions(guidance) {
    return h('div', { class: 'operational-guidance' },
      h('p', { text: guidance.what }),
      h('p', null, h('strong', { text: 'Who to coordinate with: ' }), guidance.coordinator),
      h('h4', { text: 'Next steps' }), h('ol', null, guidance.steps.map(function (step) { return h('li', { text: step }); })),
      h('p', { class: 'note', text: 'Issue reference: ' + guidance.reference }),
      h('p', { class: 'note', text: 'Marking this alert as read means you have seen it. It does not resolve the issue or deactivate any record.' }));
  }

  function notificationsDialog() {
    if (document.getElementById('notifications-dialog')) return;
    var opener = document.activeElement; var session = liveSession;
    var list = h('div', { class: 'notification-list' });
    var showAll = false; var unreadFilter; var allFilter;
    var message = h('p', { class: 'note', role: 'status', 'aria-live': 'polite' });
    var dialog = h('dialog', { id: 'notifications-dialog', class: 'notifications-dialog', 'aria-labelledby': 'notifications-title' });
    function draw() {
      list.textContent = ''; message.textContent = '';
      unreadFilter.setAttribute('aria-pressed', String(!showAll)); allFilter.setAttribute('aria-pressed', String(showAll));
      var visible = live.items.filter(function (item) { return showAll || !item.read; });
      visible.forEach(function (item) {
        var issue = operationalGuidance(item);
        if (item.record_type === 'operational_issue' && !issue) return;
        var identity = issue && !issue.bookingId ? { client: '', advisor: '' } : notificationIdentity(item);
        var mark = h('button', { class: 'btn secondary', type: 'button', text: item.read ? 'Read' : 'Mark as read', disabled: !!item.read });
        var row = h('article', { class: 'notification-item' + (issue ? ' notification-operational' : '') + (item.read ? ' is-read' : '') },
          h('div', { class: 'notification-heading' }, ['RGAB', 'RGOS'].indexOf(item.company) >= 0 ? companyBadge(item.company) : null, h('h3', { text: issue ? issue.title : LIVE_LABELS[item.event] || 'Interview updated' })),
          h('p', { class: 'notification-identity', text: identity.client || (issue && !issue.bookingId ? 'Company-level alert; no interview attached.' : 'Details available in interview') }),
          identity.advisor ? h('p', { class: 'note notification-advisor', text: 'Assigned advisor/counselor: ' + identity.advisor }) : null,
          h('p', { class: 'note', text: Number.isFinite(Date.parse(item.at)) ? new Date(item.at).toLocaleString('en-GB', { timeZone: TZ }) + ' Dubai time' : 'Recent interview update' }),
          Number.isFinite(Date.parse(item.start)) ? h('p', { class: 'note', text: 'Appointment: ' + fmtDay(localDate(item.start)) + ' at ' + localTime(item.start) + ' Dubai time' }) : null,
          issue ? operationalInstructions(issue) : null,
          item.event === 'not_completed' ? h('p', { class: 'notification-explanation', text: INCOMPLETE_EXPLANATION }) : null,
          item.event === 'assessment_status' && ASSESS[item.assessment_status] ? h('p', { class: 'note', text: 'Assessment: ' + ASSESS[item.assessment_status] + '. View the interview for its available next step.' }) : null,
          h('div', { class: 'notification-actions' }, mark, (issue && !issue.bookingId) ? null : h('button', { class: 'btn secondary', type: 'button', text: 'View interview', onclick: function () { dialog.close(); openDrawer(item.booking_id); } })));
        mark.addEventListener('click', function () {
          var readPath = notificationReadPath(item); if (!readPath) return;
          mark.disabled = true; mark.textContent = 'Saving…';
          api('POST', readPath, {}).then(function () {
            if (session !== liveSession || !state.user) return;
            live.items.forEach(function (existing) { if (String(existing.id) === String(item.id)) { if (!existing.read) live.unread = Math.max(0, live.unread - 1); existing.read = true; } }); item.read = true;
            if (showAll) { row.classList.add('is-read'); mark.textContent = 'Read'; } else { draw(); unreadFilter.focus(); }
            updateLiveButton(); message.textContent = issue ? 'Alert marked as read. This does not resolve the issue.' : 'Update marked as read.';
          }).catch(function (error) { if (session === liveSession) { mark.disabled = false; mark.textContent = 'Mark as read'; message.textContent = error.message; } });
        });
        list.appendChild(row);
      });
      if (!visible.length) list.appendChild(h('p', { id: 'notifications-empty', class: 'note', text: liveEmptyText(showAll) }));
      if (live.items.length >= 50) list.appendChild(h('p', { class: 'note', text: 'Showing up to 50 updates. After marking items as read, refresh the list to see more unchecked updates.' }));
    }
    var close = h('button', { class: 'btn secondary', type: 'button', text: 'Close', onclick: function () { dialog.close(); } });
    dialog.__refresh = draw;
    dialog.appendChild(h('div', { class: 'notification-dialog-heading' }, h('h2', { id: 'notifications-title', text: 'Interview updates' }), close));
    dialog.appendChild(h('p', { class: 'note', text: 'Unchecked updates stay unread until you mark them as read. Opening this menu does not acknowledge them. Company delivery and advisor notifications remain separate.' }));
    dialog.appendChild(h('p', { id: 'notifications-connection', class: 'note', text: live.status + '. New updates appear when you refresh this list.' }));
    dialog.appendChild(h('button', { class: 'btn secondary', type: 'button', text: 'Refresh list', onclick: draw }));
    dialog.appendChild(h('button', { class: 'btn secondary', type: 'button', text: 'Retry updates', onclick: function () { live.unsupported = false; live.failures = 0; startLive(false); draw(); } }));
    unreadFilter = h('button', { class: 'btn secondary', type: 'button', text: 'Unread', onclick: function () { showAll = false; draw(); } });
    allFilter = h('button', { class: 'btn secondary', type: 'button', text: 'All updates', onclick: function () { showAll = true; draw(); } });
    dialog.appendChild(h('div', { class: 'notification-filters', role: 'group', 'aria-label': 'Filter updates' }, unreadFilter, allFilter));
    dialog.appendChild(message); dialog.appendChild(list); draw();
    dialog.addEventListener('close', function () { dialog.remove(); if (opener && opener.isConnected) opener.focus(); flushLiveRefresh(); });
    document.body.appendChild(dialog); dialog.showModal(); close.focus();
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'visible') stopLive(); else { startLive(false); flushLiveRefresh(); } });
  document.addEventListener('focusout', function () { if (live.dirty) setTimeout(flushLiveRefresh, 0); });
  document.addEventListener('click', function () { if (live.dirty) setTimeout(flushLiveRefresh, 0); });
  function mainShell() {
    var u = state.user; var frozen = state.controls && (state.controls.bookings_enabled === false || state.controls.releases_enabled === false);
    var tabs = limited() ? TABS.filter(function (t) { return t[0] === 'calendar'; }) : TABS.filter(function (t) { if (['confirmations', 'offers'].indexOf(t[0]) >= 0) return u.role === 'facilitator' || u.role === 'approver'; return t[0] !== 'management' || u.role === 'approver' || u.role === 'viewer'; });
    return h('div', null,
      frozen ? h('div', { class: 'banner', role: 'alert', text: 'EMERGENCY FREEZE ACTIVE: new bookings' + (state.controls.releases_enabled === false ? ' and result releases are' : ' are') + ' disabled. Existing appointments are unaffected.' }) : null,
      window.PIC_ENV === 'live' ? null : h('div', { class: 'synth', text: 'DEVELOPMENT BUILD - synthetic data only. Assessment templates shown are clearly marked placeholders, not approved templates.' }),
      h('header', { class: 'topbar' }, h('h1', { text: 'Facilitator Command Center' }), worldClock(), h('span', { class: 'badge', text: u.display_name + ' - ' + u.role }),
        h('button', { class: 'btn secondary' + (tourSeen() ? '' : ' hint'), type: 'button', id: 'tour-btn', text: 'Tour', title: 'A two-minute guided tour', onclick: function () { if (window.PICTour) window.PICTour.start(); } }),
        h('button', { class: 'btn secondary', type: 'button', id: 'logout', text: 'Sign out', onclick: function () { stopLive(); api('POST', '/ui/api/logout', {}).finally(function () { endSession(); render(); }); } })),
      h('nav', { class: 'tabs', role: 'tablist' }, tabs.map(function (t) { return h('button', { role: 'tab', type: 'button', 'aria-selected': String(state.tab === t[0]), 'data-tab': t[0], text: t[1], onclick: function () { state.tab = t[0]; state.fx = true; refresh(); } }); })),
      h('main', { id: 'main' }),
      limited() ? null : h('button', { class: 'btn floating-updates' + (live.unread ? ' has-unread' : ''), type: 'button', id: 'notifications-btn', text: 'Updates' + (live.unread ? ' (' + live.unread + ')' : ''), 'aria-haspopup': 'dialog', 'aria-label': 'Interview updates' + (live.unread ? ', ' + live.unread + ' unread' : ''), onclick: notificationsDialog }));
  }
  function renderMain() {
    var m = document.getElementById('main'); if (!m) return;
    if (state.tab === 'tutorials' && !state.forceRender) { var pv = m.querySelector('video'); if (pv && !pv.paused && !pv.ended) { updateNoticesUi(); return; } }
    m.textContent = '';
    var body = state.tab === 'calendar' ? calendarTab() : state.tab === 'queues' ? queuesTab() : (state.tab === 'confirmations' || state.tab === 'offers') ? listsTab(state.tab) : state.tab === 'notices' ? noticesTab() : state.tab === 'results' ? resultsTab() : state.tab === 'worldclock' ? worldClockTab() : state.tab === 'availability' ? availabilityTab() : state.tab === 'links' ? linksTab() : state.tab === 'tutorials' ? tutorialsTab() : managementTab();
    if (state.fx) { body.classList.add('enter'); state.fx = false; }
    var nb = noticesBar(); if (nb) m.appendChild(nb);
    if (state.error) m.appendChild(h('div', { class: 'notice', role: 'alert' }, ['calendar', 'queues', 'results'].indexOf(state.tab) < 0 ? h('p', { text: state.error }) : null, h('button', { class: 'btn secondary', type: 'button', text: 'Retry loading', onclick: function () { refreshTab(); } })));
    var oldGate = document.querySelector('.gate'); if (oldGate) oldGate.remove(); var gate = gateOverlay(); if (gate) { document.body.appendChild(gate); setTimeout(gate.__check, 30); }
    m.appendChild(body); var d = drawerEl(); if (d) m.appendChild(d);
    document.querySelectorAll('nav.tabs button').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === state.tab)); });
  }
  function render() {
    root.textContent = '';
    if (!state.user) { root.appendChild(loginView()); return; }
    root.appendChild(mainShell()); renderMain();
  }
  function snap() { return JSON.stringify([state.items, state.wide, state.tabData.results, state.tabData.incidents, state.tabData.audit, state.tabData.report, state.notices, state.tabData.noticesAll, state.tabData.list_confirmations, state.tabData.list_offers]); }
  var refreshGeneration = 0;
  function refreshTab(quiet) {
    var generation = quiet ? refreshGeneration : ++refreshGeneration;
    if (!quiet) state.error = null;
    var before = quiet ? snap() : null; var t = state.tab; var jobs = []; loadNotices();   // notices load on their own and never hold a screen back
    var rng = encodeURIComponent(isoStart(addDays(todayDubai(), -30))) + '&to=' + encodeURIComponent(isoStart(addDays(todayDubai(), 62)));
    if (t === 'calendar') { jobs.push(loadCalendar(!!quiet)); if (!limited()) jobs.push(api('GET', '/ui/api/availability?from=' + rng).then(function (a) { state.tabData.avail = a; }).catch(function () {})); }
    if (t === 'queues') jobs.push(loadWide());
    if (t === 'confirmations' || t === 'offers') jobs.push(api('GET', '/ui/api/lists/' + t + (state.company ? '?company=' + state.company : '')).then(function (x) { state.tabData['list_' + t] = x; }).catch(function (e) { if (state.tab === t && generation === refreshGeneration) state.error = e.message; }));
    if (t === 'results') { var rr = resRange(); var rq = '/ui/api/results?from=' + encodeURIComponent(isoStart(rr[0])) + '&to=' + encodeURIComponent(isoStart(rr[1])) + (state.company ? '&company=' + state.company : ''); jobs.push(api('GET', rq).then(function (x) { resCache[rq] = x; if (state.tab === t && generation === refreshGeneration && rq === resKey()) { state.tabData.results = x; state.error = ''; } }).catch(function (e) { if (state.tab === t && generation === refreshGeneration && rq === resKey()) state.error = e.message || 'Could not load.'; })); }
    if (t === 'availability') { jobs.push(api('GET', '/ui/api/schedule').then(function (x) { state.tabData.schedule = x; }).catch(function () {})); jobs.push(api('GET', '/ui/api/extra-availability?from=' + rng).then(function (x) { state.tabData.extra = x; }).catch(function () {})); jobs.push(api('GET', '/ui/api/availability?from=' + rng).then(function (a) { state.tabData.avail = a; })); jobs.push(api('GET', '/ui/api/profiles').then(function (p) { state.tabData.profiles = p; })); }
    if (t === 'tutorials') jobs.push(fetch('videos/manifest.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) { state.tabData.videos = m; }).catch(function () { state.tabData.videos = null; }));
    if (t === 'links') jobs.push(api('GET', '/ui/api/links').then(function (l) { state.tabData.links = l; }));
    if (t === 'management') {
      jobs.push(api('GET', '/ui/api/incidents').then(function (i) { state.tabData.incidents = i; }).catch(function () {}));
      if (state.user && state.user.role === 'approver') jobs.push(api('GET', '/ui/api/reporting-health').then(function (h2) { state.tabData.reporting = h2; }).catch(function () {}));
      jobs.push(api('GET', '/ui/api/audit').then(function (a) { state.tabData.audit = a; }).catch(function () { state.tabData.audit = { items: [] }; }));
      jobs.push(api('GET', '/ui/api/report?from=' + rng).then(function (r) { state.tabData.report = r; }).catch(function () {}));
      jobs.push(api('GET', '/ui/api/notices?all=1').then(function (r) { state.tabData.noticesAll = r; }).catch(function () {}));
    }
    return Promise.all(jobs).catch(function (e) { if (state.tab === t && generation === refreshGeneration) state.error = e.message; }).then(function () { if (state.tab !== t || generation !== refreshGeneration || !state.user) return; if (quiet && (snap() === before || document.querySelector('dialog[open]') || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)))) return; if (quiet || state.drawer) softRender(); else renderMain(); });
  }
  function refreshAll() { return loadControls().then(function () { return refreshTab(); }).then(function () { var shell = document.querySelector('.banner'); if (state.user) { var scroll = window.scrollY; root.textContent = ''; root.appendChild(mainShell()); renderMain(); window.scrollTo(0, scroll); } }); }
  function refresh() {
    prime();
    try { renderMain(); } catch (e) { var m = document.getElementById('main'); if (m) { m.textContent = ''; m.appendChild(h('p', { class: 'note', text: 'Loading...' })); } }   // this tab's data is not loaded yet: it is drawn when it arrives
    return refreshTab();
  }
  // Opened from a company's own app: the address carries a one-time signed assertion in the part after #, which is removed from the address bar at once
  function takeLaunch() {
    var h = window.location.hash || ''; if (h.indexOf('#launch=') !== 0) return Promise.resolve();
    var a = h.slice(8); try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* address bar left as is */ }
    return api('POST', '/ui/api/launch', { assertion: a }).catch(function () { /* not accepted: the normal sign-in page is shown */ });
  }
  function init() {
    stopLive(); var session = ++liveSession;
    return takeLaunch().then(function () { return api('GET', '/ui/api/me'); }).then(function (m) { if (session !== liveSession) return; state.user = m.user; return loadControls(); }).then(function () { if (session !== liveSession || !state.user) return; render(); startLive(true); return refreshTab(); }).catch(function (e) { if (session !== liveSession) return; if (e && e.status !== 401) console.error('init failed', e && e.stack || e); endSession(); render(); });
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
  // Keep controls and interviewer/older-server fallback fresh without duplicating the live feed.
  function quietDrawer() {
    var dr = state.drawer; if (!dr || !dr.b || dr.refreshing || dr.extrasLoading || limited() || document.visibilityState !== 'visible') return;
    if (document.querySelector('dialog[open]') || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) return;
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.drawer')) return;
    dr.refreshing = true;
    return api('GET', '/ui/api/booking/' + dr.id).then(function (nb) {
      if (state.drawer !== dr) return; var changed = JSON.stringify(nb) !== JSON.stringify(state.drawer.b);
      if (changed) { state.drawer.b = nb; softRender(); }
      live.drawerPending = false; updateLiveButton();
      dr.cycles = (dr.cycles || 0) + 1; if (changed || dr.cycles % 6 === 0) loadDrawerExtras(dr.id, nb, true);
    }).catch(function (e) { if (state.drawer === dr) { dr.loadErrors = dr.loadErrors || {}; dr.loadErrors.interview = e.message; softRender(); } }).finally(function () { dr.refreshing = false; });
  }
  // a new version of this page: noticed within a minute; reloaded by itself when nothing is being typed or played
  var pageSig = null; function sigOf(t) { var n = 0; for (var i = 0; i < t.length; i++) n = (n * 31 + t.charCodeAt(i)) | 0; return t.length + ':' + n; }
  function checkVersion() {
    fetch('app.js?v=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : null; }).then(function (t) {
      if (!t) return; var sg = sigOf(t); if (pageSig === null) { pageSig = sg; return; } if (sg === pageSig) return;
      if (!document.getElementById('newver')) { var bar = h('div', { class: 'banner', id: 'newver', role: 'status' }, 'A new version of the Command Center is ready. It will reload in a moment. ', h('button', { class: 'btn secondary', type: 'button', text: 'Reload now', onclick: function () { location.reload(); } })); document.body.insertBefore(bar, document.body.firstChild); }
      var v = document.querySelector('video'); var busy = (v && !v.paused && !v.ended) || document.querySelector('dialog[open], .gate') || (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName));
      if (!busy) setTimeout(function () { location.reload(); }, 4000);
    }).catch(function () {});
  }
  checkVersion(); setInterval(checkVersion, 60000);
  var backgroundBusy = false;
  setInterval(function () {
    if (state.user && state.drawer) { quietDrawer(); return; }
    if (backgroundBusy || !liveSafe()) return;
    flushLiveRefresh();
    var before = JSON.stringify(state.controls); backgroundBusy = true;
    var session = liveSession;
    loadControls().then(function () {
      if (session !== liveSession || !liveSafe()) return;
      if (JSON.stringify(state.controls) !== before) return refreshAll();
      if ((limited() || live.unsupported) && ['calendar', 'queues', 'results', 'management'].indexOf(state.tab) >= 0) return refreshTab(true);
    }).catch(function () {}).finally(function () { backgroundBusy = false; });
  }, 15000);
})();
