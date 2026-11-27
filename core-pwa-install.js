'use strict';
/* CORE-PWA-INSTALL-TEMPLATE: "Install the app" for the Facilitator Command Center.
   - Registers /sw.js?v=... (scope /; the version in the address defeats the CDN, which keeps a plain /sw.js for 7 days) once per page, with the browser never using a stored copy of the worker file.
   - Makes sure the page points to /manifest.webmanifest (some portal pages did not).
   - Shows a small "Install app" button (bottom left) only when the browser can install the app (Chrome, Edge, Android) or on iPhone / iPad Safari,
     and never when the portal already runs as an installed app. The button opens the "Install the app" card: one real Install button where the
     browser allows it, plus short steps for Windows / Mac, Android and iPhone. "Not now" hides the button for 14 days on this device.
   - No notifications are requested here. Sends nothing anywhere. Shows no client data. ES5 only, ASCII only.
   - Off switch for the install button: put the text 1 in localStorage key corePwaHide on a device. Whole app: /sw-off.json (see sw.js). */
(function (win, doc) {
  if (win.CorePwa) { return; }
  var KEY = 'corePwaDismissedAt', DAYS = 14, deferred = null, btn = null, card = null, ua = (win.navigator && win.navigator.userAgent) || '';
  function ls(get, k, v) { try { if (get) { return win.localStorage.getItem(k) || ''; } win.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } return ''; }
  function standalone() {
    try { if (win.matchMedia && (win.matchMedia('(display-mode: standalone)').matches || win.matchMedia('(display-mode: window-controls-overlay)').matches)) { return true; } } catch (e) { /* no */ }
    return win.navigator.standalone === true;
  }
  function isIos() { return /iPad|iPhone|iPod/.test(ua) || (win.navigator.platform === 'MacIntel' && win.navigator.maxTouchPoints > 1); }
  function iosSafari() { return isIos() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua); }
  function dismissed() { var t = Number(ls(true, KEY)); return !!t && (new Date().getTime() - t) < DAYS * 86400000; }
  function hidden() { return ls(true, 'corePwaHide') === '1'; }

  var off = false;
  function register() {
    if (!win.navigator.serviceWorker || !win.fetch) { return; }
    /* kill switch: when /sw-off.json says off, nothing is registered and no button is shown */
    win.fetch('/sw-off.json?cb=' + new Date().getTime(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (j) {
      if (j && j.off === true) { off = true; hideBtn(); return null; }
      return win.navigator.serviceWorker.register('/sw.js?v=core-pwa-20261127-1', { scope: '/', updateViaCache: 'none' });
    }).catch(function () { /* the portal works without it */ });
  }
  function ensureManifest() {
    var l = doc.querySelector('link[rel="manifest"]');
    if (!l) { l = doc.createElement('link'); l.rel = 'manifest'; l.href = '/manifest.webmanifest'; doc.head.appendChild(l); }
  }
  function css() {
    if (doc.getElementById('core-pwa-css')) { return; }
    var l = doc.createElement('link'); l.id = 'core-pwa-css'; l.rel = 'stylesheet'; l.href = '/core-pwa.css?v=20261127-1'; doc.head.appendChild(l);
  }
  function showBtn() {
    if (btn || off || standalone() || dismissed() || hidden() || !doc.body) { return; }
    css();
    btn = doc.createElement('button'); btn.type = 'button'; btn.id = 'core-pwa-btn';
    btn.setAttribute('data-action', 'pwa-install-open'); btn.setAttribute('aria-label', 'Install the Facilitator Command Center app');
    btn.textContent = 'Install app';
    btn.addEventListener('click', openCard);
    doc.body.appendChild(btn);
  }
  function hideBtn() { if (btn && btn.parentNode) { btn.parentNode.removeChild(btn); } btn = null; }
  function closeCard() { if (card && card.parentNode) { card.parentNode.removeChild(card); } card = null; doc.removeEventListener('keydown', onKey, true); }
  function onKey(e) { if (e.key === 'Escape') { closeCard(); } }
  function openCard() {
    if (card) { return; }
    css();
    card = doc.createElement('div'); card.id = 'core-pwa-ov'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'Install the app');
    var h = '<div id="core-pwa-card"><h2>Install the app</h2><p>Open Facilitator Command Center like an app from your desktop, taskbar or phone home screen. It is the same portal and the same sign-in; it opens in its own window.</p>';
    if (deferred) { h += '<div class="core-pwa-row core-pwa-first"><button type="button" class="core-pwa-go" data-action="pwa-install-go">Install now</button></div>'; }
    h += '<h3>Windows or Mac (Chrome or Edge)</h3><ol><li>Click the install icon at the right end of the address bar, or open the browser menu.</li><li>Choose Install Facilitator Command Center (Chrome) or Apps, then Install this site as an app (Edge).</li></ol>' +
      '<h3>Android (Chrome)</h3><ol><li>Tap the three dots, then Install app or Add to Home screen.</li></ol>' +
      '<h3>iPhone or iPad (Safari)</h3><ol><li>Tap the Share button, then Add to Home Screen, then Add.</li></ol>' +
      '<p class="core-pwa-fine">The app needs the internet and shows no saved work offline. Signing out works the same as in the browser.</p>' +
      '<div class="core-pwa-row"><button type="button" data-action="pwa-install-later">Not now</button><button type="button" data-action="pwa-install-close">Close</button></div></div>';
    card.innerHTML = h;
    card.addEventListener('click', function (e) {
      var t = e.target, a = t && t.getAttribute && t.getAttribute('data-action');
      if (t === card || a === 'pwa-install-close') { closeCard(); }
      else if (a === 'pwa-install-later') { ls(false, KEY, String(new Date().getTime())); closeCard(); hideBtn(); }
      else if (a === 'pwa-install-go') { install(); }
    });
    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(card);
    var f = card.querySelector('button'); if (f && f.focus) { f.focus(); }
  }
  function install() {
    if (!deferred) { return; }
    var d = deferred; deferred = null;
    try { d.prompt(); } catch (e) { /* ignore */ }
    if (d.userChoice && d.userChoice.then) { d.userChoice.then(function () { closeCard(); hideBtn(); }, function () { closeCard(); }); } else { closeCard(); }
  }

  win.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; if (doc.body) { showBtn(); } else { doc.addEventListener('DOMContentLoaded', showBtn); } });
  win.addEventListener('appinstalled', function () { deferred = null; hideBtn(); closeCard(); });
  ensureManifest();
  if (doc.readyState === 'complete') { register(); } else { win.addEventListener('load', register); }
  if (iosSafari()) { if (doc.readyState === 'loading') { doc.addEventListener('DOMContentLoaded', showBtn); } else { showBtn(); } }
  win.CorePwa = { open: openCard, install: install, isInstalled: standalone };
})(window, document);
