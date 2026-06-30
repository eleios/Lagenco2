/* ═══════════════════════════════════════════════════════
   LAGENCO — Admin Modus Floating Button
   Lightweight (~3KB) · Zero dependencies · Lazy-injected
   Always visible — opens the Business Panel directly.
   No login required.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Avoid duplicate injection
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
    var btn = buildButton();
    requestAnimationFrame(function () {
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(0) scale(1)';
      btn.style.pointerEvents = 'auto';
    });
  }

  // Always show — no auth check
  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show);
})();
