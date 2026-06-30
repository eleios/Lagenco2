/* ═══════════════════════════════════════════════════════
   LAGENCO — Admin Modus Floating Button
   Lightweight (~3KB) · Zero dependencies · Lazy-injected
   Only visible when user is logged in.
   Does NOT affect existing website styling or performance.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Reuse the same localStorage key as the main website
  var LOGIN_KEY = 'lagencoLoggedIn';

  function isLoggedIn() {
    try {
      var raw = localStorage.getItem(LOGIN_KEY);
      if (raw === null || raw === undefined) return false;
      // Try JSON parse first (handles true / false / 1 / 0)
      try {
        var parsed = JSON.parse(raw);
        if (parsed === true || parsed === 1) return true;
        if (parsed === false || parsed === 0 || parsed === null) return false;
      } catch (e) { /* not JSON — fall through */ }
      // String fallback
      var s = String(raw).trim().toLowerCase();
      return s === 'true' || s === '1' || s === 'yes' || s === 'ingelogd';
    } catch (e) {
      return false;
    }
  }

  // Avoid duplicate injection (SPA-like safety)
  if (window.__lagencoAdminButtonMounted) return;
  window.__lagencoAdminButtonMounted = true;

  var btnEl = null;

  function buildButton() {
    if (btnEl) return btnEl;
    var a = document.createElement('a');
    a.href = 'business-panel.html';
    a.id = 'lagencoAdminFAB';
    a.setAttribute('aria-label', 'Open Admin Modus / Business Panel');
    a.setAttribute('title', 'Admin Modus — Open Business Panel');
    // Inline styles — scoped, does not leak to website
    a.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:2147483646',
      'display:inline-flex',
      'align-items:center',
      'gap:10px',
      'padding:14px 22px',
      'border-radius:999px',
      'font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      'font-size:14px',
      'font-weight:600',
      'letter-spacing:-0.01em',
      'color:#fff',
      'background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 50%,#2563eb 100%)',
      'box-shadow:0 10px 30px rgba(79,70,229,0.35),0 4px 12px rgba(0,0,0,0.1)',
      'text-decoration:none',
      'border:none',
      'cursor:pointer',
      'transition:transform .25s cubic-bezier(0.16,1,0.3,1),box-shadow .25s ease,opacity .3s ease',
      'opacity:0',
      'transform:translateY(20px) scale(0.9)',
      'pointer-events:none',
      'will-change:transform'
    ].join(';');

    a.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">' +
        '<path d="M3 3h7v7H3z"/>' +
        '<path d="M14 3h7v7h-7z"/>' +
        '<path d="M14 14h7v7h-7z"/>' +
        '<path d="M3 14h7v7H3z"/>' +
      '</svg>' +
      '<span>Admin Modus</span>';

    // Hover effect
    a.addEventListener('mouseenter', function () {
      a.style.transform = 'translateY(-3px) scale(1.03)';
      a.style.boxShadow = '0 16px 40px rgba(79,70,229,0.45),0 6px 16px rgba(0,0,0,0.12)';
    });
    a.addEventListener('mouseleave', function () {
      a.style.transform = 'translateY(0) scale(1)';
      a.style.boxShadow = '0 10px 30px rgba(79,70,229,0.35),0 4px 12px rgba(0,0,0,0.1)';
    });

    document.body.appendChild(a);
    btnEl = a;
    return a;
  }

  function show() {
    if (!isLoggedIn()) return;
    var btn = buildButton();
    // Reveal animation
    requestAnimationFrame(function () {
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(0) scale(1)';
      btn.style.pointerEvents = 'auto';
    });
  }

  function hide() {
    if (!btnEl) return;
    btnEl.style.opacity = '0';
    btnEl.style.transform = 'translateY(20px) scale(0.9)';
    btnEl.style.pointerEvents = 'none';
  }

  function update() {
    if (isLoggedIn()) show();
    else hide();
  }

  // React to login/logout events from the main website script
  window.addEventListener('lagenco:auth-change', update);

  // Also listen to storage events (cross-tab login/logout)
  window.addEventListener('storage', function (e) {
    if (e.key === LOGIN_KEY) update();
  });

  // Initial mount — run as soon as body is ready
  if (document.body) update();
  else document.addEventListener('DOMContentLoaded', update);

  // Re-check on page visibility (covers back/forward cache scenarios)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) update();
  });

  // Polling fallback (every 2s) — covers cases where the main script
  // updates localStorage without dispatching the custom event.
  setInterval(update, 2000);
})();
