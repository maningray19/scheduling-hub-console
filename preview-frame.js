// Shows the company's own result e-mail (HTML) exactly as designed, inside a sandboxed frame. The page around it (the Command Center) sends the HTML by postMessage.
// Safety: the frame is sandboxed without same-origin, its policy allows no scripts but this file, no network (images only as data: pictures), no forms;
// and the HTML is cleaned here again (scripts, frames, forms, event handlers and outside links are removed), so the preview can never act, call out or fire a tracking pixel.
(function () {
  'use strict';
  var DROP = ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'audio', 'video', 'source', 'track', 'applet', 'noscript', 'template'];
  var RE_SCRIPT = new RegExp('<script\\b[\\s\\S]*?</script\\s*>', 'gi');
  var RE_HANDLER = new RegExp('\\son[a-z]+\\s*=\\s*("[^"]*"|\'[^\']*\'|[^\\s>]+)', 'gi');
  function clean(doc) {
    DROP.forEach(function (t) { Array.prototype.slice.call(doc.getElementsByTagName(t)).forEach(function (n) { n.remove(); }); });
    Array.prototype.slice.call(doc.querySelectorAll('*')).forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        var n = a.name.toLowerCase(); var v = String(a.value || '').trim().toLowerCase();
        if (n.indexOf('on') === 0 || n === 'srcset' || n === 'ping' || n === 'formaction') el.removeAttribute(a.name);
        else if (n === 'src' || n === 'background' || n === 'poster') { if (v.indexOf('data:image/') !== 0) el.removeAttribute(a.name); }
        else if (n === 'href' || n === 'xlink:href') el.removeAttribute(a.name);   // links are shown as text only: nothing in a preview can be opened
      });
    });
  }
  var revision = '20261022p2';
  var attemptMatch = /(?:^|[?&])attempt=([1-9][0-9]{0,5})(?:&|$)/.exec(window.location && window.location.search || '');
  var ownAttempt = attemptMatch ? Number(attemptMatch[1]) : 1;
  function stage(name, attempt) { document.documentElement.setAttribute('data-preview-stage', name); parent.postMessage({ preview: 'stage', stage: name, attempt: attempt, revision: revision }, '*'); }
  function tell(attempt) { try { document.documentElement.setAttribute('data-preview-stage', 'rendered'); parent.postMessage({ preview: 'rendered', attempt: attempt, revision: revision, h: Math.ceil(document.documentElement.scrollHeight) }, '*'); } catch (e) { /* no parent */ } }
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var d = e.data; if (!d || typeof d.html !== 'string') return;
    if (d.attempt !== ownAttempt) return;
    var attempt = ownAttempt;
    if (!d.html.trim() || d.html.length > 400000) { parent.postMessage({ preview: 'error', attempt: attempt, revision: revision }, '*'); return; }
    try {
    stage('parsing_html', attempt);
    // first remove scripts and event handlers from the text itself, so nothing even tries to run while it is being read
    var text = d.html.replace(RE_SCRIPT, '').replace(RE_HANDLER, '');
    var doc = new DOMParser().parseFromString(text, 'text/html'); stage('sanitizing_html', attempt); clean(doc);
    Array.prototype.slice.call(document.head.querySelectorAll('style')).forEach(function (s) { s.remove(); });
    Array.prototype.slice.call(doc.querySelectorAll('style')).forEach(function (s) { document.head.appendChild(document.importNode(s, true)); s.remove(); });
    document.body.textContent = '';
    document.body.removeAttribute('style');
    if (doc.body && doc.body.getAttribute('style')) document.body.setAttribute('style', doc.body.getAttribute('style'));
    Array.prototype.slice.call(doc.body ? doc.body.childNodes : []).forEach(function (n) { document.body.appendChild(document.importNode(n, true)); });
    tell(attempt); setTimeout(function () { tell(attempt); }, 300);
    } catch (error) { document.documentElement.setAttribute('data-preview-stage', 'renderer_error'); parent.postMessage({ preview: 'error', attempt: attempt, revision: revision }, '*'); }
  });
  document.documentElement.setAttribute('data-preview-revision', revision); document.documentElement.setAttribute('data-preview-stage', 'renderer_ready');
  parent.postMessage({ preview: 'ready', attempt: ownAttempt, revision: revision }, '*');
})();
