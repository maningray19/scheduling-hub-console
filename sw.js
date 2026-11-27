'use strict';
/* CORE-PWA-SW (27 Nov 2026): service worker of the Core / Command Center app, version core-pwa-20261127-2
   Purpose: lets the Core app be installed as an app, and shows a plain "no connection" page when the network is down.
   What it does NOT do (on purpose):
   - It never stores a page, a script, a style sheet, an API answer or anything the person is signed in to. Only offline.html and the app icons are stored.
   - It never answers a request from a store. Every page, script and call goes to the network exactly as without a service worker.
   - It stays out of the client portal, contracts, signing and verification pages, WhatsApp opt-in and every other site on the origin.
   - It does not touch /build.json or the version watch: those requests are not intercepted at all.
   Kill switch: /sw-off.json. If it says {"off":true} this worker deletes its stores and unregisters itself (checked at start and at most every 30 minutes while a page is opened).
   Rollback: publish sw-tombstone.js as sw.js (an empty worker that clears the caches and unregisters itself), or set sw-off.json to {"off":true}. */
var CORE_SW_VERSION = 'core-pwa-20261127-2'; /* change this text whenever sw.js changes, e.g. core-pwa-20261128-1 */
var CORE_SW_CACHE = CORE_SW_VERSION;
var CORE_SW_SHELL = ['/offline.html', '/assets/core-icon-192.png', '/assets/core-icon-maskable-192.png'];
var CORE_SW_BYPASS = new RegExp('^/(preview-frame|booking-backup)');
var CORE_SW_LAST_CHECK = 0;
var CORE_SW_CHECK_GAP = 30 * 60 * 1000;

function coreSwKill() {
  return self.caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return self.caches['delete'](k); }));
  }).then(function () { return self.registration.unregister(); });
}

function coreSwSwitchIsOff() {
  CORE_SW_LAST_CHECK = Date.now();
  return self.fetch('/sw-off.json?cb=' + CORE_SW_LAST_CHECK, { cache: 'no-store' }).then(function (r) {
    if (!r || !r.ok) { return false; }
    return r.json().then(function (j) { return !!(j && j.off === true); }, function () { return false; });
  }, function () { return false; });
}

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(self.caches.open(CORE_SW_CACHE).then(function (c) {
    return Promise.all(CORE_SW_SHELL.map(function (u) {
      return self.fetch(u, { cache: 'no-cache' }).then(function (r) { if (r && r.ok && r.status === 200) { return c.put(u, r); } return null; }, function () { return null; });
    }));
  }).catch(function () { return null; }));
});

self.addEventListener('message', function (event) {
  if (event && event.data && event.data.type === 'CORE_SKIP_WAITING') { self.skipWaiting(); }
});

self.addEventListener('activate', function (event) {
  event.waitUntil(coreSwSwitchIsOff().then(function (off) {
    if (off) { return coreSwKill(); }
    return self.caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CORE_SW_CACHE; }).map(function (k) { return self.caches['delete'](k); }));
    }).then(function () { return self.clients.claim(); });
  }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request, url;
  if (req.method !== 'GET' || req.mode !== 'navigate') { return; }
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) { return; }
  if (CORE_SW_BYPASS.test(url.pathname)) { return; }
  if (Date.now() - CORE_SW_LAST_CHECK > CORE_SW_CHECK_GAP) {
    event.waitUntil(coreSwSwitchIsOff().then(function (off) { if (off) { return coreSwKill(); } return null; }));
  }
  event.respondWith(self.fetch(req, { cache: 'no-cache' }).catch(function () {
    return self.caches.match('/offline.html').then(function (r) {
      return r || new Response('No connection. Please check your internet and try again.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    });
  }));
});
