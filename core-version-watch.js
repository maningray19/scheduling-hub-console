'use strict';
/* Calm 'newer version' note: a busy person gets it after 10 minutes (constants block below), never an automatic reload while someone types or a dialog is open. */
(function () {
  var URL_ = '/build.json';
  var FIRST_CHECK_MS = 20000;
  var CHECK_MS = 120000;
  var IDLE_NEEDED_MS = 180000;
  var RETRY_MS = 30000;
  var MIN_RELOAD_GAP_MS = 3 * 3600000;
  /* RG-VW-BUSY-20261127 timing block: change the numbers here only. A busy person gets the calm note after
     NOTE_AFTER_MS of waiting, at most once per NOTE_GAP_MS per browser; never an automatic reload while busy. (was 4 h and 6 h) */
  var NOTE_AFTER_MS = 10 * 60000;
  var NOTE_GAP_MS = 2 * 3600000;
  var LS_RELOAD = 'coreVwLastReload';
  var LS_NOTE = 'coreVwLastNote';
  var STACK_ID = 'core-vw-banner';

  var currentBuild = null;
  var baseTag = null;
  var pendingSince = 0;
  var banner = null;
  var timer = null;
  var lastInput = (new Date()).getTime();
  var lastHidden = 0;

  function now() { return (new Date()).getTime(); }

  function lsGet(k) { try { return Number(window.localStorage.getItem(k)) || 0; } catch (e) { return 0; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, String(v)); } catch (e) {} }

  function getBuild(cb) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', URL_ + '?t=' + now(), true);
      x.timeout = 10000;
      x.onreadystatechange = function () {
        if (x.readyState !== 4) { return; }
        if (x.status !== 200) { cb(null); return; }
        try {
          var d = JSON.parse(x.responseText);
          cb(d && d.build ? String(d.build) : null);
        } catch (e) { cb(null); }
      };
      x.ontimeout = function () { cb(null); };
      x.onerror = function () { cb(null); };
      x.send();
    } catch (e) { cb(null); }
  }

  /* The tag of this page's own HTML as the server serves it right now (null when it cannot be read). */
  function getPageTag(cb) {
    try {
      var x = new XMLHttpRequest();
      x.open('HEAD', window.location.pathname + '?vw=' + now(), true);
      x.timeout = 10000;
      x.onreadystatechange = function () {
        if (x.readyState !== 4) { return; }
        if (x.status !== 200) { cb(null); return; }
        var et = x.getResponseHeader('ETag') || '';
        var lm = x.getResponseHeader('Last-Modified') || '';
        var len = x.getResponseHeader('Content-Length') || '';
        var tag = (et + '|' + lm).replace(/^W\//, '');
        if (!et && !lm) { cb(null); return; }
        cb(tag + '|' + (et ? '' : len));
      };
      x.ontimeout = function () { cb(null); };
      x.onerror = function () { cb(null); };
      x.send();
    } catch (e) { cb(null); }
  }

  function markInput() { lastInput = now(); }
  function listen() {
    var ev = ['keydown', 'pointerdown', 'mousedown', 'touchstart', 'wheel', 'input'], i;
    for (i = 0; i < ev.length; i++) {
      try { document.addEventListener(ev[i], markInput, true); } catch (e) {}
    }
    try {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') { lastHidden = now(); }
        else { lastInput = now(); }
      });
    } catch (e) {}
  }

  /* True when reloading now could disturb the person. A failing check means busy: never reload on a guess. */
  function busy() {
    try {
      if (window.CORE_CALL_ACTIVE) { return true; }
      /* Opt-in dirty hook: a page or form can say it holds unsaved work (window.CORE_DIRTY() or a data-core-dirty attribute). */
      if (typeof window.CORE_DIRTY === 'function' && window.CORE_DIRTY()) { return true; }
      if (document.querySelector('[data-core-dirty]:not([data-core-dirty="false"])')) { return true; }
      var a = document.activeElement;
      if (a) {
        var tag = (a.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { return true; }
        if (a.isContentEditable) { return true; }
      }
      var f = document.querySelectorAll('input[type="text"],input[type="search"],input[type="email"],input[type="tel"],input[type="number"],textarea');
      var i;
      for (i = 0; i < f.length; i++) {
        if (f[i].value && String(f[i].value).length > 0 && !f[i].readOnly && !f[i].disabled) { return true; }
      }
      var d = document.querySelectorAll('[role="dialog"],[role="alertdialog"],.gate,.drawer');
      for (i = 0; i < d.length; i++) {
        var st = window.getComputedStyle(d[i]);
        if (st && st.display !== 'none' && st.visibility !== 'hidden' && d[i].offsetParent !== null) { return true; }
      }
      var b = document.querySelectorAll('[aria-busy="true"]');
      if (b.length) { return true; }
      var m = document.querySelectorAll('audio,video');
      for (i = 0; i < m.length; i++) { if (!m[i].paused && !m[i].ended && !m[i].muted) { return true; } }
      return false;
    } catch (e) { return true; }
  }

  function idleEnough() { return (now() - lastInput) >= IDLE_NEEDED_MS; }

  function hardRefresh() {
    var finished = false;
    function done() { if (finished) { return; } finished = true; try { window.location.reload(); } catch (e) {} }
    try {
      var jobs = [];
      if (window.caches && window.caches.keys) {
        jobs.push(window.caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return window.caches['delete'](k); })); }));
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.update ? r.update() : null; })); }));
      }
      window.setTimeout(done, 3000);
      Promise.all(jobs).then(done, done);
    } catch (e) { done(); }
  }
  window.coreHardRefresh = hardRefresh;

  function styles() {
    if (document.getElementById('core-pwa-css')) { return; }
    var l = document.createElement('link'); l.id = 'core-pwa-css'; l.rel = 'stylesheet'; l.href = '/core-pwa.css?v=20261127-1'; document.head.appendChild(l);
  }

  function showNote() {
    if (banner) { return; }
    if ((now() - lsGet(LS_NOTE)) < NOTE_GAP_MS) { return; }
    lsSet(LS_NOTE, now());
    styles();
    banner = document.createElement('div');
    banner.className = 'core-vw';
    banner.id = STACK_ID;
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<span><b>A newer version of this page is available.</b> Reload when you have finished what you are doing; it takes a few seconds and you stay signed in.</span>';
    var go = document.createElement('button');
    go.type = 'button';
    go.textContent = 'Reload';
    go.onclick = function () { go.disabled = true; go.textContent = 'Reloading...'; hardRefresh(); };
    var later = document.createElement('button');
    later.type = 'button';
    later.className = 'ghost';
    later.textContent = 'Not now';
    later.onclick = function () {
      if (banner && banner.parentNode) { banner.parentNode.removeChild(banner); }
      banner = null;
    };
    banner.appendChild(go);
    banner.appendChild(later);
    document.body.appendChild(banner);
  }

  /* A real change of this page is waiting: apply it only at a quiet moment, at most once per 3 hours. */
  function applyWhenQuiet() {
    if (!pendingSince) { pendingSince = now(); }
    if (document.visibilityState !== 'visible') { timer = window.setTimeout(applyWhenQuiet, RETRY_MS); return; }
    if (idleEnough() && !busy() && (now() - lsGet(LS_RELOAD)) >= MIN_RELOAD_GAP_MS) {
      lsSet(LS_RELOAD, now());
      hardRefresh();
      return;
    }
    if ((now() - pendingSince) >= NOTE_AFTER_MS) { showNote(); }
    timer = window.setTimeout(applyWhenQuiet, RETRY_MS);
  }

  function tick() {
    getBuild(function (build) {
      if (!build) { timer = window.setTimeout(tick, CHECK_MS); return; }
      if (build === currentBuild) { timer = window.setTimeout(tick, CHECK_MS); return; }
      /* The shared build number moved. That alone is NOT a reason to bother anyone: check this page's own file. */
      getPageTag(function (tag) {
        currentBuild = build;
        if (!tag || !baseTag) { timer = window.setTimeout(tick, CHECK_MS); return; }
        if (tag === baseTag) { timer = window.setTimeout(tick, CHECK_MS); return; }
        applyWhenQuiet();
      });
    });
  }

  function start() {
    listen();
    getPageTag(function (tag) {
      baseTag = tag;
      getBuild(function (build) {
        currentBuild = build;
        timer = window.setTimeout(tick, FIRST_CHECK_MS);
      });
    });
  }

  window.CORE_VW = { state: function () { return { build: currentBuild, base: baseTag, pending: pendingSince, banner: !!banner }; } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
