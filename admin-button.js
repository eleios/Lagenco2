/* ═══════════════════════════════════════════════════════
   LAGENCO — Admin Modus Floating Button
   Lightweight · Zero dependencies · Lazy-injected

   Visibility logic (multi-layer, robust):
   1. PRIMARY: Check the actual DOM state of the main website.
      - #logoutBtn visible (no "hidden" class) = logged in → show button
      - #loginBtn visible = logged out → hide button
   2. FALLBACK: Check localStorage "lagencoLoggedIn".
   3. MutationObserver: react instantly when login/logout changes the DOM.
   4. Polling fallback every 1s for extra reliability.

   Click → opens Business Panel directly (no extra auth gate).
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LOGIN_KEY = 'lagencoLoggedIn';

  // Avoid duplicate injection
  if (window.__lagencoAdminButtonMounted) return;
  window.__lagencoAdminButtonMounted = true;

  // ────────────────────────────────────────────────────────
  // Login detection — multi-layer
  // ────────────────────────────────────────────────────────
  function isHidden(el) {
    if (!el) return true;
    // Check "hidden" class (used by main website)
    if (el.classList && el.classList.contains('hidden')) return true;
    // Check inline display:none
    if (el.style && el.style.display === 'none') return true;
    // Check computed visibility
    try {
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
    } catch (e) {}
    return false;
  }

  function checkDOMLogin() {
    // The main website toggles these buttons in updateAuthUI():
    //   logged in  → #logoutBtn visible, #loginBtn has "hidden" class
    //   logged out → #loginBtn visible,  #logoutBtn has "hidden" class
    var logoutBtn = document.getElementById('logoutBtn');
    var loginBtn = document.getElementById('loginBtn');

    // If logout button exists and is visible → logged in
    if (logoutBtn && !isHidden(logoutBtn)) return true;
    // If login button exists and is visible → logged out
    if (loginBtn && !isHidden(loginBtn)) return false;
    // If neither exists on this page, fall through to localStorage
    return null;
  }

  function checkLocalStorage() {
    try {
      var raw = localStorage.getItem(LOGIN_KEY);
      if (raw === null || raw === undefined) return false;
      try {
        var parsed = JSON.parse(raw);
        if (parsed === true || parsed === 1) return true;
        if (parsed === false || parsed === 0 || parsed === null) return false;
      } catch (e) {}
      var s = String(raw).trim().toLowerCase();
      return s === 'true' || s === '1' || s === 'yes' || s === 'ingelogd';
    } catch (e) {
      return false;
    }
  }

  function isLoggedIn() {
    // PRIMARY: DOM check (most reliable — reflects actual UI state)
    var domResult = checkDOMLogin();
    if (domResult !== null && domResult !== undefined) return domResult;
    // FALLBACK: localStorage check
    return checkLocalStorage();
  }

  // ────────────────────────────────────────────────────────
  // Button management
  // ────────────────────────────────────────────────────────
  var btnEl = null;

  function buildButton() {
    if (btnEl) return btnEl;
    var a = document.createElement('a');
    a.href = 'business-panel.html';
    a.id = 'lagencoAdminFAB';
    a.setAttribute('aria-label', 'Open Admin Modus / Business Panel');
    a.setAttribute('title', 'Admin Modus — Open Business Panel');
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

  // ────────────────────────────────────────────────────────
  // Event listeners — multiple layers of detection
  // ────────────────────────────────────────────────────────

  // 1. Custom event from main website (instant)
  window.addEventListener('lagenco:auth-change', update);

  // 2. Cross-tab storage events
  window.addEventListener('storage', function (e) {
    if (e.key === LOGIN_KEY) update();
  });

  // 3. MutationObserver — detects DOM changes (login/logout button toggles)
  function setupObserver() {
    if (typeof MutationObserver === 'undefined') return;
    var observer = new MutationObserver(function (mutations) {
      // Check if login/logout buttons changed
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'style')) {
          var el = m.target;
          if (el && (el.id === 'loginBtn' || el.id === 'logoutBtn' || el.id === 'loginStatus')) {
            update();
            return;
          }
        }
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      subtree: true,
      childList: false
    });
  }

  // 4. Polling fallback — every 1 second (covers all edge cases)
  setInterval(update, 1000);

  // 5. Visibility change (covers back/forward cache)
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) update();
  });

  // ────────────────────────────────────────────────────────
  // Initial mount
  // ────────────────────────────────────────────────────────
  function init() {
    update();
    setupObserver();
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
