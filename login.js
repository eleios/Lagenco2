/* ═══════════════════════════════════════════════════════
   LAGENCO — Login pagina logic (v1.0)
   Authenticatie via Firebase Realtime Database:
   - Admin-credentials leven in /bp/adminUsers/{uid}
   - Wachtwoord wordt client-side gehashed (SHA-256) vóór vergelijking
   - Bij succes: schrijf auth-state naar sessionStorage (veilig, tab-scope)
   - Default fallback: admin@lagenco.nl / lagenco123 (gebruikt de oude
     hard-coded credentials als Firebase niet bereikbaar is — voor dev/demo)
   ═══════════════════════════════════════════════════════ */
(function (window, document) {
  'use strict';

  // ────────────────────────────────────────────────────────
  // Configuratie — constanten op één plek i.p.v. magic strings
  // ────────────────────────────────────────────────────────
  const SESSION_KEY = 'lagencoLoggedIn';          // sessionStorage (tab-scope)
  const REMEMBER_EMAIL_KEY = 'lagencoRememberEmail'; // localStorage (optioneel)
  const DARK_KEY = 'lagencoBPDarkMode';            // localStorage (donker thema)
  const FALLBACK_AUTH = {
    email: 'admin@lagenco.nl',
    passwordHash: null // wordt berekend bij initialisatie
  };
  // Het fallback-wachtwoord. Wordt alleen gebruikt als Firebase niet bereikbaar is
  // (bijv. tijdens lokale dev zonder internet). In productie staat de echte
  // hash in Firebase onder /bp/adminUsers/{uid}/passwordHash.
  const FALLBACK_PASSWORD = 'lagenco123';

  // ────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);

  /** Toon/verberg een foutmelding. */
  function showError(msg) {
    const box = $('#lpError');
    const txt = $('#lpErrorMsg');
    if (!box || !txt) return;
    txt.textContent = msg || 'Er ging iets mis. Probeer het opnieuw.';
    box.classList.add('show');
    // Voeg error-class toe aan inputs voor rode outline
    $('#lpEmail')?.classList.add('error');
    $('#lpPassword')?.classList.add('error');
  }
  function clearError() {
    $('#lpError')?.classList.remove('show');
    $('#lpEmail')?.classList.remove('error');
    $('#lpPassword')?.classList.remove('error');
  }

  /** Zet de submit-knop in laad-modus (of terug). */
  function setLoading(loading) {
    const btn = $('#lpSubmit');
    if (!btn) return;
    if (loading) {
      btn.classList.add('loading');
      btn.disabled = true;
    } else {
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  /**
   * SHA-256 hash van een string, hex-output.
   * Gebruikt de native Web Crypto API (subtle.digest) — asynchroon.
   * @param {string} text
   * @returns {Promise<string>} hex-string van 64 tekens
   */
  async function sha256(text) {
    try {
      const buf = new TextEncoder().encode(text);
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(hash))
        .map(function (b) { return b.toString(16).padStart(2, '0'); })
        .join('');
    } catch (e) {
      // Fallback voor oude browsers — simpele (niet-cryptografisch sterke) hash
      console.warn('[Login] Web Crypto niet beschikbaar, using fallback hash');
      let h = 0;
      for (let i = 0; i < text.length; i++) {
        h = ((h << 5) - h) + text.charCodeAt(i);
        h |= 0;
      }
      return 'fallback_' + (h >>> 0).toString(16);
    }
  }

  /**
   * Vergelijk twee hashes in constante tijd (timing-safe) om timing-aanvallen
   * te bemoeilijken. Beide inputs moeten strings zijn.
   */
  function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  /**
   * Verkrijg admin-gebruikers uit Firebase.
   * Retourneert een array van { email, passwordHash, name } objecten.
   * Bij fout: retourneert null (caller mag fallback gebruiken).
   */
  async function fetchAdminUsers() {
    if (!window.LagencoDB || !window.LagencoDB.isConfigured) return null;
    try {
      // We lezen direct uit de cache (die door startPolling / syncAll wordt gevuld).
      // Cache-key is 'adminUsers' onder bp/.
      const cached = window.LagencoDB._cache && window.LagencoDB._cache.bp
        ? window.LagencoDB._cache.bp.adminUsers
        : null;
      if (cached && Array.isArray(cached) && cached.length > 0) return cached;

      // Cache leeg → probeer direct via Firebase te lezen.
      // We doen een eenmalige fetch (geen real-time listener nodig op de login-pagina).
      if (window.firebase && firebase.database) {
        const snap = await firebase.database().ref('bp/adminUsers').once('value');
        const val = snap.val();
        if (Array.isArray(val)) return val;
        if (val && typeof val === 'object') return Object.values(val);
      }
      return null;
    } catch (e) {
      console.warn('[Login] Kon adminUsers niet ophalen uit Firebase:', e.message);
      return null;
    }
  }

  /**
   * Authenticeer een gebruiker.
   * 1. Probeer Firebase: vergelijk email + hash met adminUsers in database.
   * 2. Fallback: als Firebase niet bereikbaar is, vergelijk met FALLBACK_AUTH.
   * @returns {Promise<{ok: boolean, user?: Object, error?: string}>}
   */
  async function authenticate(email, password) {
    const passwordHash = await sha256(password);
    const emailNorm = String(email || '').trim().toLowerCase();

    // 1. Probeer Firebase
    const adminUsers = await fetchAdminUsers();
    if (adminUsers && adminUsers.length > 0) {
      for (let i = 0; i < adminUsers.length; i++) {
        const u = adminUsers[i];
        if (!u) continue;
        const uEmail = String(u.email || '').trim().toLowerCase();
        if (uEmail === emailNorm && timingSafeEqual(String(u.passwordHash || ''), passwordHash)) {
          return { ok: true, user: { email: u.email, name: u.name || u.email, uid: u.uid || u.id || null } };
        }
      }
      // Firebase was bereikbaar maar geen match → fout (geen fallback proberen)
      return { ok: false, error: 'Onjuist e-mailadres of wachtwoord.' };
    }

    // 2. Fallback — alleen als Firebase niet bereikbaar was
    if (FALLBACK_AUTH.email.toLowerCase() === emailNorm &&
        timingSafeEqual(FALLBACK_AUTH.passwordHash || '', passwordHash)) {
      return { ok: true, user: { email: FALLBACK_AUTH.email, name: 'Lagenco Admin', uid: 'fallback' } };
    }
    return { ok: false, error: 'Onjuist e-mailadres of wachtwoord.' };
  }

  /** Schrijf auth-state naar sessionStorage (en optioneel email naar localStorage). */
  function persistSession(user, rememberEmail) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        logged: true,
        user: user,
        at: Date.now()
      }));
    } catch (e) {}
    // Onthoud e-mail optioneel in localStorage (om bij volgende bezoek voor te vullen)
    try {
      if (rememberEmail && user && user.email) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, user.email);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }
    } catch (e) {}
  }

  // ────────────────────────────────────────────────────────
  // Initialisatie
  // ────────────────────────────────────────────────────────
  async function initLogin() {
    // Bereid de fallback-hash voor (asynchroon, vóór eerste gebruik)
    FALLBACK_AUTH.passwordHash = await sha256(FALLBACK_PASSWORD);

    // Donker thema toepassen (zelfde sleutel als dashboard) voor consistente ervaring
    try {
      if (localStorage.getItem(DARK_KEY) === 'true') {
        document.body.classList.add('bp-dark');
      }
    } catch (e) {}

    // Als gebruiker al is ingelogd in deze tab → direct doorsturen
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.logged === true) {
          // Ga naar opgeslagen redirect-target of standaard dashboard
          const target = sessionStorage.getItem('lagencoLoginRedirect') || 'business-panel.html';
          sessionStorage.removeItem('lagencoLoginRedirect');
          window.location.replace(target);
          return;
        }
      }
    } catch (e) {}

    // Vul onthouden e-mail in
    try {
      const remembered = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (remembered) {
        $('#lpEmail').value = remembered;
        $('#lpRemember').checked = true;
        // Focus op wachtwoord want e-mail staat al
        $('#lpPassword').focus();
      }
    } catch (e) {}

    // Wachtwoord tonen/verbergen toggle
    $('#lpPwToggle')?.addEventListener('click', function () {
      const input = $('#lpPassword');
      const icon = this.querySelector('i');
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
      } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
      }
    });

    // Form-submit afhandelen
    $('#lpForm')?.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearError();

      const email = $('#lpEmail').value;
      const password = $('#lpPassword').value;
      const remember = $('#lpRemember').checked;

      if (!email || !password) {
        showError('Vul zowel e-mailadres als wachtwoord in.');
        return;
      }

      setLoading(true);
      try {
        const result = await authenticate(email, password);
        if (result.ok) {
          persistSession(result.user, remember);
          // Korte feedback voordat we doorsturen
          const btn = $('#lpSubmit');
          if (btn) {
            btn.querySelector('.lp-btn-text').textContent = 'Succes! Doorsturen…';
            btn.style.background = 'linear-gradient(135deg, #4A9D5E, #2D7A3E)';
          }
          setTimeout(function () {
            // Ga naar opgeslagen redirect-target of standaard dashboard
            const target = sessionStorage.getItem('lagencoLoginRedirect') || 'business-panel.html';
            sessionStorage.removeItem('lagencoLoginRedirect');
            window.location.href = target;
          }, 400);
        } else {
          setLoading(false);
          showError(result.error || 'Inloggen mislukt.');
          // Wachtwoord leegmaken bij fout
          $('#lpPassword').value = '';
          $('#lpPassword').focus();
        }
      } catch (err) {
        console.error('[Login] Fout bij authenticatie:', err);
        setLoading(false);
        showError('Er ging iets mis bij het inloggen. Probeer het opnieuw.');
      }
    });

    // Foutmelding wissen zodra gebruiker typt
    $('#lpEmail')?.addEventListener('input', clearError);
    $('#lpPassword')?.addEventListener('input', clearError);
  }

  // Start wanneer DOM klaar is
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogin);
  } else {
    initLogin();
  }
})(window, document);
