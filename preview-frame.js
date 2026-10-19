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
  function tell() { try { parent.postMessage({ h: Math.ceil(document.documentElement.scrollHeight) }, '*'); } catch (e) { /* no parent */ } }
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    var d = e.data; if (!d || typeof d.html !== 'string' || d.html.length > 400000) return;
    // first remove scripts and event handlers from the text itself, so nothing even tries to run while it is being read
    var text = d.html.replace(RE_SCRIPT, '').replace(RE_HANDLER, '');
    var doc = new DOMParser().parseFromString(text, 'text/html'); clean(doc);
    Array.prototype.slice.call(document.head.querySelectorAll('style')).forEach(function (s) { s.remove(); });
    Array.prototype.slice.call(doc.querySelectorAll('style')).forEach(function (s) { document.head.appendChild(document.importNode(s, true)); s.remove(); });
    document.body.textContent = '';
    if (doc.body && doc.body.getAttribute('style')) document.body.setAttribute('style', doc.body.getAttribute('style'));
    Array.prototype.slice.call(doc.body ? doc.body.childNodes : []).forEach(function (n) { document.body.appendChild(document.importNode(n, true)); });
    tell(); setTimeout(tell, 300);
  });
})();
