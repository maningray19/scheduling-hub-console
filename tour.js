/* Guided tour of the Command Center (for the facilitator and management). Works on whatever data is on screen.
   Strict-CSP safe: no inline styles in markup, only classes and CSSOM positioning. Keyboard: Right/Enter next, Left back, Esc close. */
(function () {
  'use strict';
  var active = null;

  function $(sel) { return document.querySelector(sel); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function tab(name) { var b = $('nav.tabs button[data-tab="' + name + '"]'); if (b && b.getAttribute('aria-selected') !== 'true') b.click(); return wait(700); }
  function closeDrawer() { var c = $('#drawer-close'); if (c) c.click(); return wait(250); }
  function view(label) { var bs = document.querySelectorAll('.seg[aria-label="View"] button'); for (var i = 0; i < bs.length; i++) if (bs[i].textContent === label) { bs[i].click(); break; } return wait(600); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function steps() {
    var role = (window.__picRole || ''), owner = !!$('nav.tabs button[data-tab="management"]');
    var s = [
      { title: 'Welcome', text: 'This is your one calendar for both companies. In two minutes you will see where everything is and what you can do. Use the arrow keys or the buttons. You can leave at any time with Esc.' },
      { sel: 'nav.tabs', title: 'Five places', text: 'Calendar: every interview. Queues: what is waiting for you. Leave and availability: your hours and breaks. Linked identities: which company accounts are yours.' + (owner ? ' Management: the overview and the emergency stop.' : '') },
      { before: function () { return closeDrawer().then(function () { return tab('calendar'); }).then(function () { return view('Day'); }); }, sel: '.seg[aria-label="View"]', title: 'Day, Week or Month', text: 'Choose how much you want to see. Previous, Today and Next move through time. All times are Dubai time.' },
      { sel: '.seg[aria-label="Company filter"]', title: 'Both companies, one view', text: 'You see both companies here. Use the filter to look at one company only. Company staff only ever see their own company; only you and the four owners see both.' },
      { sel: '.menus', title: 'Menus for status and assessment', text: 'Pick Upcoming, Ongoing now, Attended, Cancelled, No-show or Rescheduled. The second menu narrows by assessment stage: not started, draft, submitted, awaiting advisor, approved or released.' },
      { sel: '.dayrow .ev', title: 'Company is always labelled', text: 'Every interview shows its company with a different colour and shape (square or circle), so the two are never mixed up. Click an interview to open it.' },
      { before: function () { var e = $('.dayrow .ev'); if (e) e.click(); return wait(900); }, sel: '.drawer', title: 'Interview details', text: 'The client, the job, the advisor, the documents and the history of this interview. Details come live from the company that owns it.' },
      { sel: '.drawer .actions', title: 'What you can do here', text: 'Mark the interview completed or no-show, write and submit the assessment, send it to the advisor for confirmation, and release the result when it is approved. Buttons that are not possible yet stay grey.' },
      { sel: '#preview-btn', title: 'Preview before sending', text: 'Shows the assessment form exactly as the client will get it, in the owning company\'s own branding. The other company\'s name never appears.' },
      { before: function () { return closeDrawer().then(function () { return tab('queues'); }); }, sel: '#main', title: 'Queues: your to-do list', text: 'Upcoming interviews, assessments to write, results waiting for an advisor, and results ready to release. Work from top to bottom.' },
      { before: function () { return tab('availability'); }, sel: '#main', title: 'Your hours and breaks', text: 'Your working hours (10:00 to 20:00) and your daily break (14:00 to 15:00) apply to both companies. Leave and extra availability are managed here; nothing can be changed over an interview that is already booked.' },
      { before: function () { return tab('links'); }, sel: '#main', title: 'Linked identities', text: 'Your account in each company is linked here, once, with a one-time code and two approvals. Only linked accounts can book for you.' }
    ];
    if (owner) s.push({ before: function () { return tab('management'); }, sel: '#main', title: 'Management and emergency stop', text: 'Overview, incidents and the audit trail. Any one owner can freeze new bookings and results with one click. Putting things back on needs two different people.' });
    s.push({ before: function () { return tab('calendar'); }, title: 'You are ready', text: 'Open the calendar, click an interview, and follow the buttons. Press the Tour button at the top any time to see this again.' });
    return s;
  }

  function start() {
    if (active) return;
    var list = steps(), i = 0, timer = null;
    var shade = el('div', 'tour-shade'), hole = el('div', 'tour-hole'), card = el('div', 'tour-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'false'); card.setAttribute('aria-label', 'Guided tour');
    var count = el('div', 'tour-count'), title = el('h2', 'tour-title'), text = el('p', 'tour-text'), dots = el('div', 'tour-dots');
    var back = el('button', 'btn secondary', 'Back'), next = el('button', 'btn', 'Next'), skip = el('button', 'tour-skip', 'Skip');
    [back, next, skip].forEach(function (b) { b.type = 'button'; });
    var row = el('div', 'tour-row'); row.appendChild(skip); row.appendChild(back); row.appendChild(next);
    card.appendChild(count); card.appendChild(title); card.appendChild(text); card.appendChild(dots); card.appendChild(row);
    document.body.appendChild(shade); document.body.appendChild(hole); document.body.appendChild(card);
    document.body.classList.add('touring');

    function target() { var s = list[i].sel; return s ? $(s) : null; }
    function place() {
      var t = target(), pad = 8;
      if (t) {
        var r = t.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
        var top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad), w = Math.min(vw - 8, r.width + pad * 2), hgt = Math.min(vh - 8, r.height + pad * 2);
        hole.style.top = top + 'px'; hole.style.left = left + 'px'; hole.style.width = w + 'px'; hole.style.height = hgt + 'px'; hole.classList.remove('none');
        var cw = card.offsetWidth || 340, ch = card.offsetHeight || 220;
        var cx = Math.min(vw - cw - 12, Math.max(12, left + w / 2 - cw / 2));
        var below = top + hgt + 14, above = top - ch - 14;
        var cy = below + ch < vh ? below : (above > 8 ? above : Math.max(12, vh - ch - 12));
        if (r.width > vw * 0.6 && r.height > vh * 0.5) { cx = Math.max(12, vw - cw - 24); cy = Math.max(12, vh - ch - 24); }
        card.style.left = cx + 'px'; card.style.top = cy + 'px';
      } else {
        hole.classList.add('none'); hole.style.top = '50%'; hole.style.left = '50%'; hole.style.width = '0px'; hole.style.height = '0px';
        card.style.left = Math.max(12, (window.innerWidth - (card.offsetWidth || 340)) / 2) + 'px'; card.style.top = Math.max(12, (window.innerHeight - (card.offsetHeight || 220)) / 2) + 'px';
      }
    }
    function show() {
      var st = list[i];
      card.classList.remove('in'); count.textContent = 'Step ' + (i + 1) + ' of ' + list.length; title.textContent = st.title; text.textContent = st.text;
      dots.textContent = ''; list.forEach(function (_, k) { dots.appendChild(el('span', 'tour-dot' + (k === i ? ' on' : k < i ? ' done' : ''))); });
      back.disabled = i === 0; next.textContent = i === list.length - 1 ? 'Finish' : 'Next';
      Promise.resolve(st.before ? st.before() : null).then(function () {
        var t = target(); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        return wait(t ? 350 : 0);
      }).then(function () { place(); card.classList.add('in'); next.focus({ preventScroll: true }); });
    }
    function go(d) { var n = i + d; if (n < 0) return; if (n >= list.length) return finish(); i = n; show(); }
    function finish() {
      clearInterval(timer); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', place);
      [shade, hole, card].forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
      document.body.classList.remove('touring'); active = null;
      try { window.localStorage.setItem('pic_tour_done', '1'); } catch (e) { /* optional */ }
      var tb = $('#tour-btn'); if (tb) tb.classList.remove('hint');
      closeDrawer().then(function () { return tab('calendar'); });
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(); } else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (document.activeElement === skip || document.activeElement === back) return; e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    }
    next.addEventListener('click', function () { go(1); }); back.addEventListener('click', function () { go(-1); }); skip.addEventListener('click', finish); shade.addEventListener('click', finish);
    document.addEventListener('keydown', onKey, true); window.addEventListener('resize', place);
    timer = setInterval(function () { if (card.classList.contains('in')) place(); }, 500);      // follows the page when it redraws
    active = { finish: finish, go: go, goto: function (n) { i = Math.max(0, Math.min(list.length - 1, n)); show(); } };
    show();
  }

  window.PICTour = { start: start, stop: function () { if (active) active.finish(); }, next: function () { if (active) active.go(1); }, back: function () { if (active) active.go(-1); }, active: function () { return !!active; }, script: function () { return steps().map(function (x) { return { title: x.title, text: x.text }; }); } };
})();
