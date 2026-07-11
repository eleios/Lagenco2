/* ═══════════════════════════════════════════════════════
   LAGENCO BUSINESS PANEL — Main App Logic
   - Auth gate (login required)
   - SPA-like view router
   - All views: dashboard, producten, voorraad, inkoop, verkoop,
     catalogus, klanten, tracking, marktplaats, research,
     werknemers, rapporten, instellingen
   - Modals, toasts, charts (Chart.js lazy-loaded)
   ═══════════════════════════════════════════════════════ */
(function (window, document) {
  'use strict';

  // ────────────────────────────────────────────────────────
  // Auth gate — uses the inline auth from business-panel.html
  // (window.__bpAuth) so login logic is centralized and
  // independent of this file's load timing.
  // Auth state lives in sessionStorage (NOT localStorage) — cleared on tab close.
  // ────────────────────────────────────────────────────────
  const LOGIN_KEY = 'lagencoLoggedIn';
  function isLoggedIn() {
    if (window.__bpAuth && typeof window.__bpAuth.isLoggedIn === 'function') {
      return window.__bpAuth.isLoggedIn();
    }
    // Fallback (in case inline script hasn't loaded yet) — read from LagencoDB
    if (window.LagencoDB && typeof window.LagencoDB.getAuth === 'function') {
      return window.LagencoDB.getAuth();
    }
    return false;
  }
  // Live re-check: if the login state changes while the panel is open
  // (e.g. user logs out in another tab), react immediately.
  // Auth state is in sessionStorage now (no storage event fires for that),
  // but we still listen for the custom lagenco:auth-change event.
  window.addEventListener('lagenco:auth-change', function (e) {
    if (e.detail && e.detail.logged === false) {
      window.location.href = 'index.html';
    }
  });

  // ────────────────────────────────────────────────────────
  // Utility: escape HTML
  // ────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const D = window.BPData;
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.prototype.slice.call((ctx || document).querySelectorAll(sel));

  // ────────────────────────────────────────────────────────
  // Toast
  // ────────────────────────────────────────────────────────
  function toast(title, msg, type) {
    type = type || 'success';
    const c = $('#bpToastContainer');
    if (!c) return;
    const icons = { success: 'fa-check', error: 'fa-times', warn: 'fa-exclamation', info: 'fa-info' };
    const el = document.createElement('div');
    el.className = 'bp-toast ' + type;
    el.innerHTML =
      '<div class="bp-toast-icon"><i class="fas ' + (icons[type] || icons.info) + '"></i></div>' +
      '<div class="bp-toast-content">' +
        '<div class="bp-toast-title">' + esc(title) + '</div>' +
        (msg ? '<div class="bp-toast-msg">' + esc(msg) + '</div>' : '') +
      '</div>' +
      '<button class="bp-toast-close" aria-label="Sluiten"><i class="fas fa-times"></i></button>';
    c.appendChild(el);
    const close = () => {
      el.classList.add('hide');
      setTimeout(() => el.remove(), 300);
    };
    el.querySelector('.bp-toast-close').addEventListener('click', close);
    setTimeout(close, 3800);
  }

  // ────────────────────────────────────────────────────────
  // Modal — met ESC-to-close en basis focus trap
  // ────────────────────────────────────────────────────────
  // Bewaar het element dat focus had vóór de modal opende, zodat we het kunnen herstellen.
  let _lastFocusBeforeModal = null;
  // Actieve modal keydown handler (zodat we maar één listener tegelijk hebben)
  let _activeModalEscHandler = null;

  function openModal(opts) {
    closeModal();
    const root = $('#bpModalRoot');
    const back = document.createElement('div');
    back.className = 'bp-modal-backdrop';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    const modal = document.createElement('div');
    modal.className = 'bp-modal' + (opts.large ? ' lg' : '');
    modal.innerHTML =
      '<div class="bp-modal-head">' +
        '<div class="bp-modal-title"><i class="fas ' + (opts.icon || 'fa-circle') + '"></i> ' + esc(opts.title) + '</div>' +
        '<button class="bp-modal-close" aria-label="Sluiten"><i class="fas fa-times"></i></button>' +
      '</div>' +
      '<div class="bp-modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="bp-modal-foot">' + opts.footer + '</div>' : '');
    back.appendChild(modal);
    root.appendChild(back);

    // Bewaar huidige focus om te herstellen bij sluiten
    _lastFocusBeforeModal = document.activeElement;

    const close = () => closeModal();

    // ESC-to-close + focus trap
    const keyHandler = function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        close();
        return;
      }
      // Focus trap: Tab en Shift+Tab blijven binnen de modal
      if (e.key === 'Tab' || e.keyCode === 9) {
        const focusables = modal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !modal.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modal.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    _activeModalEscHandler = keyHandler;
    document.addEventListener('keydown', keyHandler);

    back.addEventListener('click', e => { if (e.target === back) close(); });
    modal.querySelector('.bp-modal-close').addEventListener('click', close);

    // Verplaats focus naar de modal (of het eerste focusable element) voor screen readers
    setTimeout(function () {
      const focusables = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0) {
        // Vermijd de close-button als eerste focus (liever het eerste input-veld)
        const firstInput = Array.prototype.find.call(focusables, function (el) {
          return el.tagName !== 'BUTTON' || !el.classList.contains('bp-modal-close');
        });
        (firstInput || focusables[0]).focus();
      } else {
        modal.setAttribute('tabindex', '-1');
        modal.focus();
      }
    }, 50);

    if (opts.onMount) opts.onMount(modal, close);
    return { modal, close };
  }
  function closeModal() {
    const root = $('#bpModalRoot');
    if (root) root.innerHTML = '';
    // Verwijder ESC keydown handler
    if (_activeModalEscHandler) {
      document.removeEventListener('keydown', _activeModalEscHandler);
      _activeModalEscHandler = null;
    }
    // Herstel focus naar het element dat focus had vóór de modal opende
    if (_lastFocusBeforeModal && typeof _lastFocusBeforeModal.focus === 'function') {
      try { _lastFocusBeforeModal.focus(); } catch (e) {}
      _lastFocusBeforeModal = null;
    }
  }
  function confirmModal(title, msg, onConfirm) {
    openModal({
      title: title, icon: 'fa-exclamation-triangle',
      body: '<p class="bp-muted">' + esc(msg) + '</p>',
      footer:
        '<button class="bp-btn bp-btn-ghost" data-action="cancel">Annuleren</button>' +
        '<button class="bp-btn bp-btn-danger" data-action="ok"><i class="fas fa-check"></i> Bevestigen</button>',
      onMount: (m, close) => {
        m.querySelector('[data-action="cancel"]').addEventListener('click', close);
        m.querySelector('[data-action="ok"]').addEventListener('click', () => { onConfirm(); close(); });
      }
    });
  }

  // ────────────────────────────────────────────────────────
  // View registry
  // ────────────────────────────────────────────────────────
  const VIEWS = {};
  function view(name, fn) { VIEWS[name] = fn; }
  let currentView = null;
  let currentSearch = '';

  const VIEW_META = {
    dashboard:        { title: 'Dashboard',         sub: 'Overzicht van je handelsadministratie' },
    agenda:           { title: 'Agenda',            sub: 'Afspraken, notities en herinneringen — maand-, week- en dagweergave' },
    notitieblok:      { title: 'Notitieblok',       sub: 'Persoonlijke notities met titel, beschrijving en categorie — permanent opgeslagen' },
    websiteproducten: { title: 'Website Producten', sub: 'Beheer alle producten die op de website staan (naam, prijs, beschrijving, conditiegrade) — real-time sync via Firebase' },
    producten:        { title: 'Producten',          sub: 'Beheer je productcatalogus en prijzen' },
    voorraad:         { title: 'Voorraad',           sub: 'Voorraadniveaus en magazijnbeheer' },
    inkoop:           { title: 'Inkoop',             sub: 'Inkooporders en leveranciers' },
    verkoop:          { title: 'Verkoop',            sub: 'Verkooplog en winstberekening' },
    catalogus:        { title: 'Catalogus',          sub: 'Gecombineerd productoverzicht met stats' },
    klanten:          { title: 'Klanten',            sub: 'Klantendatabase en orderhistorie' },
    tracking:         { title: 'Tracking',           sub: 'Zendingen volgen en status beheren' },
    marktplaats:      { title: 'Marktplaats',        sub: 'Actieve advertenties en verkopen' },
    biedingen:        { title: 'Biedingen',          sub: 'Biedingen van klanten op je producten' },
    coupons:          { title: 'Wheel Spin Coupons',  sub: 'Gewonnen kortingscodes en coupon status' },
    wheelsettings:    { title: 'Wheel Spin Instellingen', sub: 'Prijzen, kansen en spins beheren' },
    research:         { title: 'Research',           sub: 'Onderzoek nieuwe producten om in te kopen' },
    werknemers:       { title: 'Werknemers',         sub: 'Uitkeringen en werknemersbetalingen' },
    rapporten:        { title: 'Rapporten',          sub: 'Inzichten en bedrijfsanalytics' },
    instellingen:     { title: 'Instellingen',       sub: 'Data beheer en configuratie' }
  };

  function navigate(name) {
    if (!VIEWS[name]) name = 'dashboard';
    currentView = name;
    const meta = VIEW_META[name] || { title: name, sub: '' };
    $('#bpPageTitle').textContent = meta.title;
    $('#bpPageSub').textContent = meta.sub;
    $$('.bp-nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === name));
    const content = $('#bpContent');
    content.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'bp-view';
    content.appendChild(wrap);
    VIEWS[name](wrap);
    // Close mobile sidebar
    $('#bpSidebar')?.classList.remove('open');
    $('#bpSidebarOverlay')?.classList.remove('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ────────────────────────────────────────────────────────
  // UI helpers
  // ────────────────────────────────────────────────────────
  function emptyState(icon, title, sub, actionLabel, actionFn) {
    const div = document.createElement('div');
    div.className = 'bp-empty';
    div.innerHTML =
      '<div class="bp-empty-icon"><i class="fas ' + icon + '"></i></div>' +
      '<div class="bp-empty-title">' + esc(title) + '</div>' +
      '<div class="bp-empty-sub">' + esc(sub) + '</div>';
    if (actionLabel) {
      const btn = document.createElement('button');
      btn.className = 'bp-btn bp-btn-primary';
      btn.innerHTML = '<i class="fas fa-plus"></i> ' + esc(actionLabel);
      btn.addEventListener('click', actionFn);
      div.appendChild(btn);
    }
    return div;
  }

  function kpiCard(label, value, icon, variant, delta) {
    const v = variant ? 'is-' + variant : '';
    const deltaHtml = delta
      ? '<div class="bp-kpi-delta ' + (delta.up ? 'up' : 'down') + '"><i class="fas fa-arrow-' + (delta.up ? 'up' : 'down') + '"></i> ' + esc(delta.text) + '</div>'
      : '';
    return '<div class="bp-kpi ' + v + '">' +
      '<div class="bp-kpi-head"><div class="bp-kpi-label">' + esc(label) + '</div>' +
      '<div class="bp-kpi-icon"><i class="fas ' + icon + '"></i></div></div>' +
      '<div class="bp-kpi-value">' + value + '</div>' + deltaHtml + '</div>';
  }

  function statusBadge(status) {
    const s = String(status || '').toLowerCase();
    let cls = 'neutral';
    if (['compleet', 'actief', 'op voorraad', 'goedgekeurd', 'verkocht', 'geleverd'].includes(s)) cls = 'success';
    else if (['verzonden', 'in verzending', 'onderzoek', 'misschien', 'in afwachting'].includes(s)) cls = 'info';
    else if (['retourneerd', 'geannuleerd', 'afgewezen', 'laag', 'uitverkocht', 'tekort'].includes(s)) cls = 'danger';
    else if (['wachtend', 'open', 'verzending'].includes(s)) cls = 'warn';
    return '<span class="bp-badge bp-badge-' + cls + ' bp-badge-dot">' + esc(status || '-') + '</span>';
  }

  function actionBtns(editFn, deleteFn, viewFn) {
    const wrap = document.createElement('div');
    wrap.className = 'bp-row-actions';
    if (viewFn) {
      const b = document.createElement('button');
      b.className = 'bp-row-action view'; b.title = 'Bekijken';
      b.innerHTML = '<i class="fas fa-eye"></i>';
      b.addEventListener('click', viewFn);
      wrap.appendChild(b);
    }
    if (editFn) {
      const b = document.createElement('button');
      b.className = 'bp-row-action edit'; b.title = 'Bewerken';
      b.innerHTML = '<i class="fas fa-pen"></i>';
      b.addEventListener('click', editFn);
      wrap.appendChild(b);
    }
    if (deleteFn) {
      const b = document.createElement('button');
      b.className = 'bp-row-action delete'; b.title = 'Verwijderen';
      b.innerHTML = '<i class="fas fa-trash"></i>';
      b.addEventListener('click', deleteFn);
      wrap.appendChild(b);
    }
    return wrap;
  }

  // Build a modal form with fields config
  function formModal(title, icon, fields, onSave, initial) {
    let body = '<div class="bp-form-grid">';
    fields.forEach(f => {
      const val = initial ? (initial[f.key] != null ? initial[f.key] : '') : (f.default || '');
      const full = f.full ? ' full' : '';
      const req = f.required ? ' <span class="req">*</span>' : '';
      body += '<div class="bp-field' + full + '">';
      body += '<label class="bp-label">' + esc(f.label) + req + '</label>';
      if (f.type === 'textarea') {
        body += '<textarea class="bp-textarea" name="' + f.key + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(val) + '</textarea>';
      } else if (f.type === 'select') {
        body += '<select class="bp-select" name="' + f.key + '">';
        (f.options || []).forEach(o => {
          const ov = typeof o === 'object' ? o.value : o;
          const ol = typeof o === 'object' ? o.label : o;
          body += '<option value="' + esc(ov) + '"' + (String(val) === String(ov) ? ' selected' : '') + '>' + esc(ol) + '</option>';
        });
        body += '</select>';
      } else if (f.type === 'number' || f.type === 'euro') {
        if (f.type === 'euro') {
          body += '<div class="bp-input-group"><span class="bp-prefix">€</span>' +
            '<input type="number" step="0.01" name="' + f.key + '" placeholder="' + esc(f.placeholder || '0,00') + '" value="' + esc(val) + '"></div>';
        } else {
          body += '<input type="number" step="' + (f.step || '1') + '" class="bp-input" name="' + f.key + '" placeholder="' + esc(f.placeholder || '') + '" value="' + esc(val) + '">';
        }
      } else {
        body += '<input type="' + (f.type || 'text') + '" class="bp-input" name="' + f.key + '" placeholder="' + esc(f.placeholder || '') + '" value="' + esc(val) + '">';
      }
      body += '</div>';
    });
    body += '</div>';

    openModal({
      title: title, icon: icon, large: true, body: body,
      footer:
        '<button class="bp-btn bp-btn-ghost" data-action="cancel">Annuleren</button>' +
        '<button class="bp-btn bp-btn-primary" data-action="save"><i class="fas fa-check"></i> Opslaan</button>',
      onMount: (m, close) => {
        m.querySelector('[data-action="cancel"]').addEventListener('click', close);
        m.querySelector('[data-action="save"]').addEventListener('click', () => {
          const data = {};
          fields.forEach(f => {
            const el = m.querySelector('[name="' + f.key + '"]');
            let v = el ? el.value : '';
            if (f.type === 'number' || f.type === 'euro') v = D.parseNum(v);
            data[f.key] = v;
          });
          onSave(data, close);
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: DASHBOARD
  // ═══════════════════════════════════════════════════════
  // Periode-state voor de winst-weergave (blijft bewaard tijdens de sessie)
  let dashboardPeriod = 'always'; // 'today' | '7days' | '1month' | 'always'

  /** Format een delta als HTML-badge met pijl en kleur (up=green, down=red).
   *  Het +/- teken staat als klein superscript achteraan de badge (rechtsonder). */
  function deltaBadge(delta, opts) {
    opts = opts || {};
    const isMoney = opts.money === true;
    const isInverted = opts.inverted === true; // voor metrics waar "up" slecht is (bv. lowStock)
    const up = delta.abs > 0;
    const down = delta.abs < 0;
    // Bij inverted: meer = slechter, dus rood
    const positive = isInverted ? down : up;
    const negative = isInverted ? up : down;
    let cls = 'neutral';
    if (positive && delta.abs !== 0) cls = 'up';
    else if (negative && delta.abs !== 0) cls = 'down';
    const icon = up ? 'fa-arrow-up' : (down ? 'fa-arrow-down' : 'fa-minus');
    // Bedrag/zonder +/- teken vooraan — teken komt achteraan als superscript
    const absStr = isMoney
      ? D.fmtEuro(Math.abs(delta.abs)).replace('€ ', '€ ')
      : String(Math.abs(delta.abs));
    const pctStr = (delta.pct >= 0 ? '+' : '') + delta.pct.toFixed(1) + '%';
    const sign = delta.abs >= 0 ? '+' : '−';
    return '<span class="bp-delta-badge ' + cls + '">' +
      '<i class="fas ' + icon + '"></i> ' + absStr + ' · ' + pctStr +
      '<span class="bp-delta-sign">' + sign + '</span>' +
      '</span>';
  }

  /** Genereer de weekvergelijking-widget HTML (deze week vs vorige week).
   *  Wordt zowel op het dashboard als in de rapporten-view hergebruikt. */
  function renderWeeklyComparisonWidget(opts) {
    opts = opts || {};
    const week = D.weeklyComparison();
    let html = '<div class="bp-card bp-weekly-card">';
    html += '<div class="bp-card-head">';
    html += '<div class="bp-card-title"><i class="fas fa-arrows-left-right"></i> Weekvergelijking</div>';
    html += '<div class="bp-weekly-head-right">';
    html += '<span class="bp-weekly-period">' + esc(week.period.currentStart) + ' — ' + esc(week.period.currentEnd) + '</span>';
    if (opts.showPdfButton) {
      html += '<button class="bp-btn bp-btn-primary bp-btn-sm" data-pdf-btn><i class="fas fa-file-pdf"></i> PDF-rapport</button>';
    }
    html += '</div>';
    html += '</div>';
    html += '<div class="bp-card-body">';

    // 4 vergelijking-rijen: Winst, Omzet, Nieuwe klanten, Lage voorraad
    html += '<div class="bp-weekly-grid">';
    // Winst
    html += '<div class="bp-weekly-row">';
    html += '<div class="bp-weekly-row-icon" style="background:var(--bp-success-soft);color:var(--bp-success)"><i class="fas fa-arrow-trend-up"></i></div>';
    html += '<div class="bp-weekly-row-body">';
    html += '<div class="bp-weekly-row-label">Winst</div>';
    html += '<div class="bp-weekly-row-current">' + D.fmtEuro(week.current.profit) + '</div>';
    html += '<div class="bp-weekly-row-prev">Vorige week: ' + D.fmtEuro(week.previous.profit) + '</div>';
    html += '</div>';
    html += '<div class="bp-weekly-row-delta">' + deltaBadge(week.deltas.profit, { money: true }) + '</div>';
    html += '</div>';
    // Omzet
    html += '<div class="bp-weekly-row">';
    html += '<div class="bp-weekly-row-icon" style="background:var(--bp-info-soft);color:var(--bp-info)"><i class="fas fa-euro-sign"></i></div>';
    html += '<div class="bp-weekly-row-body">';
    html += '<div class="bp-weekly-row-label">Omzet</div>';
    html += '<div class="bp-weekly-row-current">' + D.fmtEuro(week.current.revenue) + '</div>';
    html += '<div class="bp-weekly-row-prev">Vorige week: ' + D.fmtEuro(week.previous.revenue) + '</div>';
    html += '</div>';
    html += '<div class="bp-weekly-row-delta">' + deltaBadge(week.deltas.revenue, { money: true }) + '</div>';
    html += '</div>';
    // Nieuwe klanten
    html += '<div class="bp-weekly-row">';
    html += '<div class="bp-weekly-row-icon" style="background:var(--bp-lavender-soft);color:var(--bp-lavender)"><i class="fas fa-user-plus"></i></div>';
    html += '<div class="bp-weekly-row-body">';
    html += '<div class="bp-weekly-row-label">Nieuwe klanten</div>';
    html += '<div class="bp-weekly-row-current">' + D.fmtNum(week.current.newCustomers) + '</div>';
    html += '<div class="bp-weekly-row-prev">Vorige week: ' + D.fmtNum(week.previous.newCustomers) + '</div>';
    html += '</div>';
    html += '<div class="bp-weekly-row-delta">' + deltaBadge(week.deltas.newCustomers) + '</div>';
    html += '</div>';
    // Lage voorraad (inverted: meer = slechter)
    html += '<div class="bp-weekly-row">';
    html += '<div class="bp-weekly-row-icon" style="background:var(--bp-danger-soft);color:var(--bp-danger)"><i class="fas fa-triangle-exclamation"></i></div>';
    html += '<div class="bp-weekly-row-body">';
    html += '<div class="bp-weekly-row-label">Lage voorraad (nu)</div>';
    html += '<div class="bp-weekly-row-current">' + D.fmtNum(week.current.lowStockCount) + '</div>';
    html += '<div class="bp-weekly-row-prev">Vorige week: ' + D.fmtNum(week.previous.lowStockCount) + '</div>';
    html += '</div>';
    html += '<div class="bp-weekly-row-delta">' + deltaBadge(week.deltas.lowStockCount, { inverted: true }) + '</div>';
    html += '</div>';
    html += '</div>'; // /bp-weekly-grid

    // Top producten deze week (compact)
    if (week.current.topProducts.length > 0) {
      html += '<div class="bp-section-heading">Top producten deze week</div>';
      html += '<div class="bp-weekly-top">';
      week.current.topProducts.forEach(function (p, i) {
        html += '<div class="bp-weekly-top-item">';
        html += '<div class="bp-weekly-top-rank">' + (i + 1) + '</div>';
        html += '<div class="bp-weekly-top-body">';
        html += '<div class="bp-weekly-top-name">' + esc(p.name) + '</div>';
        html += '<div class="bp-weekly-top-meta">' + p.count + ' verkocht · ' + D.fmtEuro(p.revenue) + ' omzet · ' + D.fmtEuro(p.profit) + ' winst</div>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="bp-weekly-empty">Nog geen verkopen deze week — verkoop je eerste product om hier top-producten te zien.</div>';
    }
    html += '</div>'; // /bp-card-body
    html += '</div>'; // /bp-weekly-card
    return html;
  }

  /** Wire een PDF-rapport knop (data-pdf-btn attribute) binnen een root element. */
  function wirePdfButton(root) {
    $$('[data-pdf-btn]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.LagencoReport && typeof window.LagencoReport.generateWeeklyReport === 'function') {
          window.LagencoReport.generateWeeklyReport();
        } else {
          toast('PDF laden…', 'De PDF-bibliotheek wordt geladen, even geduld…', 'info');
          setTimeout(function () {
            if (window.LagencoReport) window.LagencoReport.generateWeeklyReport();
            else toast('Fout', 'Kon PDF-bibliotheek niet laden. Vernieuw de pagina.', 'error');
          }, 800);
        }
      });
    });
  }

  view('dashboard', function (root) {
    const s = D.dashboardStats();

    // ── Periode-filterbalk (Vandaag / 7 dagen / 1 maand / Altijd) ──
    const periods = [
      { key: 'today',   label: 'Vandaag',        icon: 'fa-calendar-day' },
      { key: '7days',  label: 'Afgelopen 7 dagen', icon: 'fa-calendar-week' },
      { key: '1month',  label: '1 maand',        icon: 'fa-calendar' },
      { key: 'always',  label: 'Altijd',         icon: 'fa-infinity' }
    ];
    let periodHtml = '<div class="bp-period-bar">';
    periodHtml += '<div class="bp-period-label"><i class="fas fa-filter"></i> Winst periode:</div>';
    periodHtml += '<div class="bp-period-tabs">';
    periods.forEach(p => {
      periodHtml += '<button class="bp-period-tab' + (dashboardPeriod === p.key ? ' active' : '') + '" data-period="' + p.key + '">' +
        '<i class="fas ' + p.icon + '"></i> ' + esc(p.label) +
        '</button>';
    });
    periodHtml += '</div></div>';

    // ── Winst+omzet voor de geselecteerde periode berekenen ──
    const periodData = D.profitInPeriod(dashboardPeriod);
    // Handmatige winst-correctie wordt BIJ de periode-winst opgeteld
    const ms = D.getManualStats();
    const periodProfit = periodData.profit + ms.winst;
    const periodRevenue = periodData.revenue + ms.omzet;

    let html = periodHtml;
    html += '<div class="bp-kpi-grid">';
    html += kpiCard('Winst · ' + periods.find(p => p.key === dashboardPeriod).label,
                    D.fmtEuro(periodProfit),
                    'fa-arrow-trend-up', 'success',
                    { up: true, text: periodData.count + ' verkopen' });
    html += kpiCard('Omzet', D.fmtEuro(s.totalRevenue), 'fa-euro-sign', 'info');
    html += kpiCard('Geïnvesteerd', D.fmtEuro(s.totalInvested), 'fa-piggy-bank', 'warn');
    html += kpiCard('Voorraadwaarde', D.fmtEuro(s.totalStockValue), 'fa-warehouse', 'violet', { up: true, text: s.totalUnits + ' eenheden' });
    html += kpiCard('Producten', D.fmtNum(s.totalProducts), 'fa-box', 'primary');
    html += kpiCard('Gem. Marge', D.fmtPct(s.avgMargin), 'fa-percent', 'info');
    html += kpiCard('Klanten', D.fmtNum(s.customersCount), 'fa-users', 'success');
    html += kpiCard('Lage Voorraad', D.fmtNum(s.lowStockCount), 'fa-triangle-exclamation', s.lowStockCount > 0 ? 'danger' : 'success');
    html += '</div>';

    html += '<div class="bp-grid-dashboard">';
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-chart-line"></i> Omzet & Winst</div>' +
      '<button class="bp-btn bp-btn-ghost bp-btn-sm" data-goto="verkoop">Bekijk verkoop →</button></div>' +
      '<div class="bp-chart-wrap"><canvas id="dashChart1"></canvas></div></div>';
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-chart-pie"></i> Categorieën</div></div>' +
      '<div class="bp-chart-wrap"><canvas id="dashChart2"></canvas></div></div>';
    html += '</div>';

    html += '<div class="bp-grid-2">';
    // Recent sales
    const sales = D.list('verkoop').slice(0, 5);
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-receipt"></i> Recente Verkopen</div>' +
      '<button class="bp-btn bp-btn-ghost bp-btn-sm" data-goto="verkoop">Alle verkopen</button></div>' +
      '<div class="bp-card-body-p0">';
    if (sales.length === 0) {
      html += '<div class="bp-empty"><div class="bp-empty-icon"><i class="fas fa-receipt"></i></div><div class="bp-empty-title">Nog geen verkopen</div></div>';
    } else {
      html += '<div class="bp-table-wrap"><table class="bp-table"><thead><tr><th>Datum</th><th>Product</th><th class="num">Bedrag</th><th class="num">Winst</th></tr></thead><tbody>';
      sales.forEach(x => {
        html += '<tr><td>' + esc(x.date) + '</td><td>' + esc(x.product) + '</td><td class="num strong">' + D.fmtEuro(x.sellPrice) + '</td><td class="num" style="color:var(--bp-success)">' + D.fmtEuro(x.profit) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div></div>';

    // Low stock alerts
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-triangle-exclamation"></i> Lage Voorraad</div>' +
      '<button class="bp-btn bp-btn-ghost bp-btn-sm" data-goto="voorraad">Voorraad</button></div>' +
      '<div class="bp-card-body-p0">';
    if (s.lowStock.length === 0) {
      html += '<div class="bp-empty"><div class="bp-empty-icon"><i class="fas fa-check"></i></div><div class="bp-empty-title">Alles op voorraad</div><div class="bp-empty-sub">Geen lage-voorraad meldingen</div></div>';
    } else {
      html += '<div class="bp-table-wrap"><table class="bp-table"><thead><tr><th>Product</th><th class="num">Voorraad</th><th class="num">Min</th><th>Status</th></tr></thead><tbody>';
      s.lowStock.forEach(v => {
        html += '<tr><td>' + esc(v.name) + '</td><td class="num strong">' + D.fmtNum(v.stock) + '</td><td class="num muted">' + D.fmtNum(v.minStock) + '</td><td>' + statusBadge('Laag') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div></div>';

    // ── Agenda widget: komende herinneringen ──
    const upcoming = D.upcomingAgenda(7);
    html += '<div class="bp-grid-2">';
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-bell"></i> Komende herinneringen</div>' +
      '<button class="bp-btn bp-btn-ghost bp-btn-sm" data-goto="agenda">Naar agenda →</button></div>' +
      '<div class="bp-card-body-p0">';
    if (upcoming.items.length === 0) {
      html += '<div class="bp-empty"><div class="bp-empty-icon"><i class="fas fa-check"></i></div>' +
        '<div class="bp-empty-title">Geen herinneringen</div>' +
        '<div class="bp-empty-sub">Voor de komende 7 dagen staat niets gepland</div></div>';
    } else {
      html += '<div class="bp-agenda-widget">';
      upcoming.items.slice(0, 5).forEach(function (e) {
        const evDate = D.parseDate(e.date);
        const dayNum = evDate.getDate();
        const monShort = MONTH_NAMES_NL_SHORT[evDate.getMonth()];
        const meta = D.AGENDA_TYPE_META[e.type] || D.AGENDA_TYPE_META.afspraak;
        const timeLabel = e.time ? e.time : 'hele dag';
        html += '<div class="bp-agenda-widget-item" data-goto="agenda" data-occurrence="' + esc(e.occurrenceId) + '">' +
          '<div class="bp-agenda-widget-date"><div class="bp-agenda-widget-date-day">' + dayNum + '</div>' +
          '<div class="bp-agenda-widget-date-mon">' + esc(monShort) + '</div></div>' +
          '<div class="bp-agenda-widget-body">' +
          '<div class="bp-agenda-widget-title">' + esc(e.title) + '</div>' +
          '<div class="bp-agenda-widget-meta">' +
          '<span class="bp-agenda-widget-pill" data-type="' + esc(e.type) + '"></span>' +
          '<span><i class="far fa-clock"></i> ' + esc(timeLabel) + '</span>' +
          (e.customerName ? '<span><i class="fas fa-user"></i> ' + esc(e.customerName) + '</span>' : '') +
          '</div></div></div>';
      });
      html += '</div>';
    }
    html += '</div></div>';

    // ── Quick actions / snelkoppelingen ──
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-bolt"></i> Snelkoppelingen</div></div>' +
      '<div class="bp-card-body">';
    html += '<div class="bp-grid-2" style="gap:0.6rem">';
    html += '<button class="bp-btn bp-btn-primary bp-btn-sm" data-goto="agenda" data-preset="today"><i class="fas fa-plus"></i> Nieuwe afspraak</button>';
    html += '<button class="bp-btn bp-btn-ghost bp-btn-sm" data-goto="agenda"><i class="fas fa-calendar-day"></i> Vandaag</button>';
    html += '<button class="bp-btn bp-btn-ghost bp-btn-sm" data-goto="verkoop"><i class="fas fa-cash-register"></i> Verkoop loggen</button>';
    html += '<button class="bp-btn bp-btn-ghost bp-btn-sm" data-goto="klanten"><i class="fas fa-user-plus"></i> Nieuwe klant</button>';
    html += '</div>';
    html += '<div class="bp-section-heading">Agenda overzicht</div>';
    const todayStr = D.fmtDate(new Date());
    const allAgenda = D.list('agenda') || [];
    const todayItems = allAgenda.filter(function (x) { return x.date === todayStr; }).length;
    const weekItems = D.expandAgendaEvents(
      startOfWeek(new Date()),
      addDays(startOfWeek(new Date()), 7)
    ).length;
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.5rem">' +
      '<div style="padding:0.85rem;background:var(--bp-card-2);border:1px solid var(--bp-border);border-radius:var(--bp-r)">' +
      '<div style="font-family:Poppins;font-weight:700;font-size:1.5rem;color:var(--bp-primary-2);line-height:1">' + todayItems + '</div>' +
      '<div style="font-size:0.75rem;color:var(--bp-text-muted);margin-top:0.25rem">items vandaag</div></div>' +
      '<div style="padding:0.85rem;background:var(--bp-card-2);border:1px solid var(--bp-border);border-radius:var(--bp-r)">' +
      '<div style="font-family:Poppins;font-weight:700;font-size:1.5rem;color:var(--bp-warn);line-height:1">' + weekItems + '</div>' +
      '<div style="font-size:0.75rem;color:var(--bp-text-muted);margin-top:0.25rem">items deze week</div></div>' +
      '</div>';
    html += '</div></div>';
    html += '</div>';

    root.innerHTML = html;

    // Render charts (after DOM is in place)
    setTimeout(() => renderDashboardCharts(), 50);

    // Wire navigation buttons
    $$('[data-goto]', root).forEach(b => b.addEventListener('click', () => navigate(b.dataset.goto)));

    // Wire periode-tabs — bij klik wordt de geselecteerde periode bewaard
    // en de dashboard-view opnieuw gerendered.
    $$('.bp-period-tab', root).forEach(btn => {
      btn.addEventListener('click', () => {
        dashboardPeriod = btn.dataset.period;
        navigate('dashboard');
      });
    });

    // PDF-rapport knop zit alleen in de rapporten-view (volgens user request).
    // Dashboard heeft geen weekvergelijking-widget meer.
  });

  function renderDashboardCharts() {
    if (typeof Chart === 'undefined') {
      // Chart.js not yet loaded — retry shortly
      setTimeout(renderDashboardCharts, 200);
      return;
    }
    // Chart 1: Revenue & profit over time
    // (afhankelijk van geselecteerde periode — toont meer of minder data)
    const c1 = document.getElementById('dashChart1');
    if (c1) {
      const data = D.salesOverTime();
      // Filter op dezelfde periode als de winst-tab
      let filtered = data;
      const now = new Date();
      let since = null;
      if (dashboardPeriod === 'today') {
        since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        // vandaag kan meerdere maanden overlappen → behoud huidige maand
        since = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (dashboardPeriod === '7days' || dashboardPeriod === '7weeks') {
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dashboardPeriod === '1month') {
        since = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      }
      if (since) {
        filtered = data.filter(d => {
          const [y, m] = d.month.split('-');
          return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1) >= new Date(since.getFullYear(), since.getMonth(), 1);
        });
        if (filtered.length === 0) filtered = data.slice(-3);
      }
      const labels = filtered.map(d => {
        const [y, m] = d.month.split('-');
        return new Date(y, m - 1).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' });
      });
      new Chart(c1, {
        type: 'line',
        data: {
          labels: labels.length ? labels : ['Geen data'],
          datasets: [
            { label: 'Omzet', data: filtered.map(d => d.revenue), borderColor: '#5BA8C9', backgroundColor: 'rgba(91,168,201,0.12)', fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#5BA8C9' },
            { label: 'Winst', data: filtered.map(d => d.profit), borderColor: '#4A9D5E', backgroundColor: 'rgba(74,157,94,0.12)', fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#4A9D5E' }
          ]
        },
        options: chartOpts({ legend: true })
      });
    }
    // Chart 2: Category breakdown (doughnut)
    const c2 = document.getElementById('dashChart2');
    if (c2) {
      const cats = D.categoryBreakdown();
      new Chart(c2, {
        type: 'doughnut',
        data: {
          labels: cats.map(c => c.category),
          datasets: [{
            data: cats.map(c => c.stockValue),
            // Merk-palette: groen → perzik → geel → lavendel → blauw → warm-rood
            backgroundColor: ['#6BBF7E', '#FF8B5C', '#FFD56B', '#9F8AC9', '#5BA8C9', '#E06055'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: '65%',
          plugins: { legend: { position: 'bottom', labels: { padding: 14, font: { size: 11 } } } }
        }
      });
    }
  }

  function chartOpts(opts) {
    opts = opts || {};
    const dark = document.body.classList.contains('bp-dark');
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: opts.legend ? {
          display: true, position: 'top', align: 'end',
          labels: {
            padding: 14, font: { size: 11 },
            color: dark ? '#a5b5a7' : '#6B7A6C',
            usePointStyle: true, pointStyle: 'circle'
          }
        } : { display: false },
        tooltip: {
          backgroundColor: dark ? '#0f1410' : '#0f172a',
          titleColor: dark ? '#e8efe9' : '#fff',
          bodyColor: dark ? '#a5b5a7' : '#cbd5e1',
          padding: 12, cornerRadius: 8,
          titleFont: { size: 12 }, bodyFont: { size: 12 }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: dark ? '#a5b5a7' : '#6B7A6C' }
        },
        y: {
          grid: { color: dark ? '#2d3a2e' : '#e2e8f0', drawBorder: false },
          ticks: { font: { size: 11 }, color: dark ? '#a5b5a7' : '#6B7A6C', callback: v => '€ ' + v }
        }
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: AGENDA  (v1.2 — nieuw)
  // Volledige kalender met maand-, week- en dagweergave.
  // Ondersteunt herhalingen (weekly/monthly/yearly), kleur-codering
  // per type, klant-koppeling, notities, herinneringen en zoeken/filteren.
  // Data-laag: D.expandAgendaEvents(start, end) → lijst voorkomens.
  // ═══════════════════════════════════════════════════════

  /** Agendastate — blijft bewaard tijdens de sessie (zoals dashboardPeriod). */
  const agendaState = {
    view: 'month',           // 'month' | 'week' | 'day'
    cursor: new Date(),      // middelpunt van de weergave
    selectedDate: D.fmtDate(new Date()),  // geselecteerde dag (YYYY-MM-DD)
    search: '',
    typeFilter: 'all'        // 'all' | 'afspraak' | 'persoonlijk' | 'notitie'
  };

  /** Nederlandse weekdagnamen — korte en lange variant. */
  const DAY_NAMES_NL = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  const DAY_NAMES_NL_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  const MONTH_NAMES_NL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
                          'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const MONTH_NAMES_NL_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
                                'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  /** Helpers voor datumweergave — gecentraliseerd i.p.v. inline new Date(). */
  function startOfWeek(d) {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // Maandag = eerste dag van de week in NL
    const day = (r.getDay() + 6) % 7;
    r.setDate(r.getDate() - day);
    return r;
  }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function addMonths(d, n) { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }
  function isToday(d) { return sameDay(d, new Date()); }

  /** Event-pill HTML voor in het maand-rooster (max 3 zichtbaar, daarna "+N meer"). */
  function agendaEventPill(ev) {
    const time = ev.time ? '<span class="bp-evt-pill-time">' + esc(ev.time) + '</span>' : '';
    const completedCls = ev.completed ? ' completed' : '';
    return '<button class="bp-evt-pill' + completedCls + '" data-type="' + esc(ev.type) + '" data-occurrence="' + esc(ev.occurrenceId) + '" data-event-id="' + esc(ev.id) + '" title="' + esc(ev.title) + '">' +
      time + '<span class="bp-evt-pill-title">' + esc(ev.title) + '</span>' +
      '</button>';
  }

  /** Type-badge HTML (voor in dag-view en modal). */
  function agendaTypeBadge(type) {
    const meta = D.AGENDA_TYPE_META[type] || D.AGENDA_TYPE_META.afspraak;
    return '<span class="bp-cal-day-row-type" data-type="' + esc(type) + '">' +
      '<i class="fas ' + meta.icon + '"></i> ' + esc(meta.label) + '</span>';
  }

  /** Klanten-lookup voor het modal — geeft [{value,label}] options terug. */
  function agendaCustomerOptions() {
    const customers = D.list('klanten') || [];
    return [{ value: '', label: '— Geen klant —' }].concat(
      customers.map(function (k) { return { value: k.id, label: k.name + (k.email ? ' · ' + k.email : '') }; })
    );
  }

  /** Open het add/edit-modal voor een agenda-item. */
  function editAgendaEvent(event, presetDate) {
    const isEdit = !!event;
    const initial = event || {};
    if (presetDate && !initial.date) initial.date = presetDate;

    const typeOpts = Object.keys(D.AGENDA_TYPE_META).map(function (k) {
      return { value: k, label: D.AGENDA_TYPE_META[k].label };
    });
    const recurOpts = D.AGENDA_RECURRENCE_TYPES.map(function (r) {
      const labels = { none: 'Eenmalig', weekly: 'Wekelijks', monthly: 'Maandelijks', yearly: 'Jaarlijks' };
      return { value: r, label: labels[r] || r };
    });

    const fields = [
      { key: 'title', label: 'Titel', required: true, full: true, placeholder: 'Bijv. "Levering Sennheiser E604 ophalen"' },
      { key: 'type', label: 'Type', type: 'select', options: typeOpts, required: true, full: true },
      { key: 'date', label: 'Datum', type: 'date', required: true },
      { key: 'time', label: 'Starttijd', type: 'time', placeholder: 'HH:MM (leeg = hele dag)' },
      { key: 'endtime', label: 'Eindtijd', type: 'time', placeholder: 'optioneel' },
      { key: 'location', label: 'Locatie', placeholder: 'Bijv. "Magazijn A" of adres' },
      { key: 'customerId', label: 'Klant koppelen', type: 'select', options: agendaCustomerOptions() },
      { key: 'recurrence', label: 'Herhaling', type: 'select', options: recurOpts },
      { key: 'recurrenceEndDate', label: 'Herhaling t/m', type: 'date', placeholder: 'leeg = voor altijd' },
      { key: 'reminder', label: 'Herinnering op dashboard', type: 'select',
        options: [{ value: 'true', label: 'Ja — toon in dashboard-widget' }, { value: 'false', label: 'Nee — alleen in agenda' }] },
      { key: 'note', label: 'Notitie', type: 'textarea', full: true, placeholder: 'Extra details, checklist, telefoonnummer…' }
    ];

    formModal(isEdit ? 'Afspraak bewerken' : 'Nieuwe agenda-item',
      'fa-calendar-day', fields,
      function (data, close) {
        if (!data.title || !String(data.title).trim()) {
          toast('Fout', 'Titel is verplicht', 'error');
          return;
        }
        if (!data.date) {
          toast('Fout', 'Datum is verplicht', 'error');
          return;
        }
        // Normaliseer: lege strings → null waar relevant
        const clean = {
          title: String(data.title).trim(),
          type: data.type || 'afspraak',
          date: data.date,
          time: data.time || null,
          endtime: data.endtime || null,
          location: data.location || '',
          customerId: data.customerId || '',
          customerName: '',
          note: data.note || '',
          recurrence: data.recurrence || 'none',
          recurrenceEndDate: data.recurrenceEndDate || '',
          reminder: data.reminder === 'true' || data.reminder === true,
          completed: initial.completed || false
        };
        // Cache customerName bij selectie
        if (clean.customerId) {
          const k = D.get('klanten', clean.customerId);
          if (k) clean.customerName = k.name;
        }
        if (isEdit) {
          D.update('agenda', event.id, clean);
          toast('Opgeslagen', clean.title + ' is bijgewerkt', 'success');
        } else {
          D.add('agenda', clean);
          toast('Toegevoegd', clean.title + ' staat in de agenda', 'success');
        }
        close();
        navigate('agenda');
      }, initial);
  }

  /** Verwijder een agenda-item met bevestiging. */
  function deleteAgendaEvent(event) {
    confirmModal('Agenda-item verwijderen',
      'Weet je zeker dat je "' + event.title + '" wilt verwijderen?' +
      (event.recurrence && event.recurrence !== 'none' ? ' Dit verwijdert ook alle toekomstige herhalingen.' : ''),
      function () {
        D.remove('agenda', event.id);
        toast('Verwijderd', event.title + ' is verwijderd', 'success');
        navigate('agenda');
      });
  }

  /** Detail-modal: toon alle info van één voorkomen met actie-knoppen. */
  function viewAgendaOccurrence(ev) {
    const item = D.get('agenda', ev.id);
    if (!item) { toast('Fout', 'Item niet (meer) gevonden', 'error'); return; }
    const meta = D.AGENDA_TYPE_META[ev.type] || D.AGENDA_TYPE_META.afspraak;
    const recurLabels = { none: 'Eenmalig', weekly: 'Wekelijks', monthly: 'Maandelijks', yearly: 'Jaarlijks' };
    const dateNL = D.parseDate(ev.date).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    let body = '<div class="bp-detail-grid">';
    body += '<div class="bp-detail-row"><div class="bp-detail-label">Type</div><div class="bp-detail-value">' + agendaTypeBadge(ev.type) + '</div></div>';
    body += '<div class="bp-detail-row"><div class="bp-detail-label">Datum</div><div class="bp-detail-value">' + esc(dateNL) + '</div></div>';
    if (ev.time) {
      body += '<div class="bp-detail-row"><div class="bp-detail-label">Tijd</div><div class="bp-detail-value">' + esc(ev.time) + (ev.endtime ? ' — ' + esc(ev.endtime) : '') + '</div></div>';
    }
    if (ev.location) {
      body += '<div class="bp-detail-row"><div class="bp-detail-label">Locatie</div><div class="bp-detail-value"><i class="fas fa-map-marker-alt"></i> ' + esc(ev.location) + '</div></div>';
    }
    if (ev.customerName) {
      body += '<div class="bp-detail-row"><div class="bp-detail-label">Klant</div><div class="bp-detail-value"><i class="fas fa-user"></i> ' + esc(ev.customerName) + '</div></div>';
    }
    if (ev.recurrence && ev.recurrence !== 'none') {
      body += '<div class="bp-detail-row"><div class="bp-detail-label">Herhaling</div><div class="bp-detail-value"><i class="fas fa-repeat"></i> ' + esc(recurLabels[ev.recurrence] || ev.recurrence) + (item.recurrenceEndDate ? ' t/m ' + esc(item.recurrenceEndDate) : '') + '</div></div>';
    }
    if (ev.reminder) {
      body += '<div class="bp-detail-row"><div class="bp-detail-label">Herinnering</div><div class="bp-detail-value"><i class="fas fa-bell" style="color:var(--bp-warn)"></i> Wordt op dashboard getoond</div></div>';
    }
    if (ev.note) {
      body += '<div class="bp-detail-row"><div class="bp-detail-label">Notitie</div><div class="bp-detail-value">' + esc(ev.note).replace(/\n/g, '<br>') + '</div></div>';
    }
    body += '</div>';

    openModal({
      title: ev.title, icon: meta.icon, large: true, body: body,
      footer:
        '<button class="bp-btn bp-btn-ghost" data-action="close">Sluiten</button>' +
        '<button class="bp-btn bp-btn-danger" data-action="delete"><i class="fas fa-trash"></i> Verwijderen</button>' +
        '<button class="bp-btn bp-btn-primary" data-action="edit"><i class="fas fa-pen"></i> Bewerken</button>' +
        (ev.completed
          ? '<button class="bp-btn bp-btn-success" data-action="toggle"><i class="fas fa-rotate-left"></i> Markereren als open</button>'
          : '<button class="bp-btn bp-btn-success" data-action="toggle"><i class="fas fa-check"></i> Markeren als voltooid</button>'),
      onMount: function (m, close) {
        m.querySelector('[data-action="close"]').addEventListener('click', close);
        m.querySelector('[data-action="delete"]').addEventListener('click', function () {
          close();
          deleteAgendaEvent(item);
        });
        m.querySelector('[data-action="edit"]').addEventListener('click', function () {
          close();
          editAgendaEvent(item);
        });
        m.querySelector('[data-action="toggle"]').addEventListener('click', function () {
          D.toggleAgendaCompleted(item.id);
          toast('Bijgewerkt', item.title + ' gemarkeerd als ' + (item.completed ? 'open' : 'voltooid'), 'success');
          close();
          navigate('agenda');
        });
      }
    });
  }

  /** Maand-view renderen — 6 weken rooster rondom de cursor-maand. */
  function renderAgendaMonth(root, events) {
    const cursor = agendaState.cursor;
    const first = startOfMonth(cursor);
    const last = endOfMonth(cursor);
    // Begin op de maandag vóór of op de eerste dag van de maand
    const gridStart = startOfWeek(first);
    const todayStr = D.fmtDate(new Date());

    // Events per datum groeperen
    const byDate = {};
    events.forEach(function (e) {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });

    let html = '<div class="bp-cal-month">';
    html += '<div class="bp-cal-weekdays">';
    DAY_NAMES_NL_SHORT.forEach(function (name, i) {
      html += '<div class="bp-cal-weekday' + (i >= 5 ? ' weekend' : '') + '">' + esc(name) + '</div>';
    });
    html += '</div>';
    html += '<div class="bp-cal-grid">';

    // 6 weken × 7 dagen = 42 cellen
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const ds = D.fmtDate(d);
      const otherMonth = d.getMonth() !== cursor.getMonth();
      const isTodayCls = isToday(d) ? ' today' : '';
      const otherCls = otherMonth ? ' other-month' : '';
      html += '<div class="bp-cal-day' + otherCls + isTodayCls + '" data-date="' + ds + '">';
      html += '<div class="bp-cal-daynum">' + d.getDate() + '</div>';
      const dayEvents = byDate[ds] || [];
      if (dayEvents.length > 0) {
        html += '<div class="bp-cal-day-events">';
        dayEvents.slice(0, 3).forEach(function (e) {
          html += agendaEventPill(e);
        });
        if (dayEvents.length > 3) {
          html += '<div class="bp-evt-more">+' + (dayEvents.length - 3) + ' meer</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div></div>';
    root.innerHTML = html;

    // Wire: klik op dag → switch naar dag-view met die datum
    $$('.bp-cal-day', root).forEach(function (cell) {
      cell.addEventListener('click', function (e) {
        // Als er op een event-pill geklikt is, laat dat de event-actie doen
        if (e.target.closest('.bp-evt-pill')) return;
        agendaState.selectedDate = cell.dataset.date;
        agendaState.view = 'day';
        agendaState.cursor = D.parseDate(cell.dataset.date) || new Date();
        navigate('agenda');
      });
    });
    // Wire: klik op event-pill → detail-modal
    $$('.bp-evt-pill', root).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const occ = events.find(function (x) { return x.occurrenceId === btn.dataset.occurrence; });
        if (occ) viewAgendaOccurrence(occ);
      });
    });
  }

  /** Week-view renderen — 7 dagen × uren (8:00–20:00). */
  function renderAgendaWeek(root, events) {
    const weekStart = startOfWeek(agendaState.cursor);
    const days = []; for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i));
    const HOUR_START = 8;  // 08:00
    const HOUR_END = 20;   // 20:00 (exclusief)
    const PX_PER_HOUR = 48;

    // Events per datum groeperen
    const byDate = {};
    events.forEach(function (e) {
      if (!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });

    let html = '<div class="bp-cal-week">';
    // Header
    html += '<div class="bp-cal-week-head">';
    html += '<div class="bp-cal-week-head-cell"></div>'; // lege hoek
    days.forEach(function (d) {
      const todayCls = isToday(d) ? ' today' : '';
      html += '<div class="bp-cal-week-head-cell' + todayCls + '">' +
        '<div class="bp-cal-week-head-day">' + esc(DAY_NAMES_NL_SHORT[(d.getDay() + 6) % 7]) + '</div>' +
        '<div class="bp-cal-week-head-num">' + d.getDate() + '</div>' +
        '</div>';
    });
    html += '</div>';
    // Body
    html += '<div class="bp-cal-week-body">';
    // Tijd-kolom
    html += '<div class="bp-cal-time-col">';
    for (let h = HOUR_START; h < HOUR_END; h++) {
      html += '<div class="bp-cal-time-slot">' + String(h).padStart(2, '0') + ':00</div>';
    }
    html += '</div>';
    // Dag-kolommen
    days.forEach(function (d) {
      const ds = D.fmtDate(d);
      const todayCls = isToday(d) ? ' today' : '';
      html += '<div class="bp-cal-day-col' + todayCls + '" data-date="' + ds + '">';
      for (let h = HOUR_START; h < HOUR_END; h++) {
        html += '<div class="bp-cal-hour" data-hour="' + h + '" data-date="' + ds + '"></div>';
      }
      // Events absoluut positioneren
      const dayEvents = (byDate[ds] || []).filter(function (e) {
        if (!e.time) return false;
        const hour = parseInt(e.time.split(':')[0], 10);
        return hour >= HOUR_START && hour < HOUR_END;
      });
      dayEvents.forEach(function (e) {
        const [h, m] = e.time.split(':').map(function (x) { return parseInt(x, 10); });
        const top = (h - HOUR_START) * PX_PER_HOUR + (m / 60) * PX_PER_HOUR;
        let height = PX_PER_HOUR * 0.85;
        if (e.endtime) {
          const [eh, em] = e.endtime.split(':').map(function (x) { return parseInt(x, 10); });
          const endTop = (eh - HOUR_START) * PX_PER_HOUR + (em / 60) * PX_PER_HOUR;
          height = Math.max(20, endTop - top - 2);
        }
        const completedCls = e.completed ? ' completed' : '';
        html += '<div class="bp-cal-event-block' + completedCls + '" data-type="' + esc(e.type) + '" data-occurrence="' + esc(e.occurrenceId) + '" style="top:' + top + 'px;height:' + height + 'px">' +
          '<div class="bp-cal-event-time">' + esc(e.time) + (e.endtime ? '–' + esc(e.endtime) : '') + '</div>' +
          '<div class="bp-cal-event-title">' + esc(e.title) + '</div>' +
          '</div>';
      });
      html += '</div>';
    });
    html += '</div></div>';
    root.innerHTML = html;

    // Wire: klik op lege uurslot → nieuw item met preset-datum+tijd
    $$('.bp-cal-hour', root).forEach(function (slot) {
      slot.addEventListener('click', function () {
        const date = slot.dataset.date;
        const hour = slot.dataset.hour;
        // Pre-fill via een tijdelijk initial object
        const initial = { date: date, time: String(hour).padStart(2, '0') + ':00', type: 'afspraak', reminder: true, recurrence: 'none' };
        editAgendaEvent(null, date);
        // Patch the form values after modal opens — formModal leest initial bij mount,
        // dus we kunnen niet meer ingrijpen. Daarom timer:
        setTimeout(function () {
          const timeInput = document.querySelector('#bpModalRoot [name="time"]');
          if (timeInput) timeInput.value = String(hour).padStart(2, '0') + ':00';
        }, 30);
      });
    });
    // Wire: klik op event-block → detail-modal
    $$('.bp-cal-event-block', root).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const occ = events.find(function (x) { return x.occurrenceId === btn.dataset.occurrence; });
        if (occ) viewAgendaOccurrence(occ);
      });
    });
  }

  /** Dag-view renderen — lijst van events op geselecteerde datum. */
  function renderAgendaDay(root, events) {
    const sel = agendaState.selectedDate || D.fmtDate(new Date());
    const d = D.parseDate(sel) || new Date();
    const dayEvents = events.filter(function (e) { return e.date === sel; });

    let html = '<div class="bp-cal-day-view">';
    html += '<div class="bp-cal-day-header">';
    html += '<div class="bp-cal-day-header-left">';
    html += '<div class="bp-cal-day-header-day">' + d.getDate() + '</div>';
    html += '<div class="bp-cal-day-header-month">' + esc(DAY_NAMES_NL[(d.getDay() + 6) % 7] + ' ' + MONTH_NAMES_NL[d.getMonth()] + ' ' + d.getFullYear()) + '</div>';
    html += '</div>';
    html += '<div class="bp-cal-day-header-right">';
    html += '<button class="bp-btn bp-btn-ghost bp-btn-sm" data-day-nav="prev"><i class="fas fa-chevron-left"></i></button>';
    html += '<button class="bp-btn bp-btn-ghost bp-btn-sm" data-day-nav="today">Vandaag</button>';
    html += '<button class="bp-btn bp-btn-ghost bp-btn-sm" data-day-nav="next"><i class="fas fa-chevron-right"></i></button>';
    html += '<button class="bp-btn bp-btn-primary bp-btn-sm" data-day-nav="add"><i class="fas fa-plus"></i> Nieuw</button>';
    html += '</div>';
    html += '</div>';

    html += '<div class="bp-cal-day-list">';
    if (dayEvents.length === 0) {
      html += '<div class="bp-empty"><div class="bp-empty-icon"><i class="fas fa-calendar-day"></i></div>' +
        '<div class="bp-empty-title">Geen items op deze dag</div>' +
        '<div class="bp-empty-sub">Klik op "Nieuw" om een afspraak of notitie toe te voegen.</div></div>';
    } else {
      dayEvents.forEach(function (e) {
        const timeLabel = e.time ? e.time + (e.endtime ? '–' + e.endtime : '') : 'hele dag';
        const allDayCls = e.time ? '' : ' all-day';
        const completedCls = e.completed ? ' completed' : '';
        html += '<div class="bp-cal-day-row" data-occurrence="' + esc(e.occurrenceId) + '">';
        html += '<div class="bp-cal-day-row-time' + allDayCls + '">' + esc(timeLabel) + '</div>';
        html += '<div class="bp-cal-day-row-body">';
        html += '<div class="bp-cal-day-row-title' + completedCls + '">' + esc(e.title) + ' ' + agendaTypeBadge(e.type) + '</div>';
        const meta = [];
        if (e.location) meta.push('<span><i class="fas fa-map-marker-alt"></i>' + esc(e.location) + '</span>');
        if (e.customerName) meta.push('<span><i class="fas fa-user"></i>' + esc(e.customerName) + '</span>');
        if (e.recurrence && e.recurrence !== 'none') meta.push('<span><i class="fas fa-repeat"></i>herhalend</span>');
        if (e.reminder) meta.push('<span><i class="fas fa-bell" style="color:var(--bp-warn)"></i>herinnering</span>');
        if (e.note) meta.push('<span><i class="fas fa-note-sticky"></i>' + esc(e.note.length > 60 ? e.note.slice(0, 57) + '…' : e.note) + '</span>');
        if (meta.length) html += '<div class="bp-cal-day-row-meta">' + meta.join('') + '</div>';
        html += '</div>';
        html += '<div>' + (e.completed
          ? '<button class="bp-row-action view" data-act="toggle" title="Markeer als open"><i class="fas fa-rotate-left"></i></button>'
          : '<button class="bp-row-action view" data-act="toggle" title="Markeer als voltooid"><i class="fas fa-check"></i></button>') + '</div>';
        html += '</div>';
      });
    }
    html += '</div></div>';
    root.innerHTML = html;

    // Wire: navigatie-knoppen
    $$('[data-day-nav]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        const nav = btn.dataset.dayNav;
        if (nav === 'prev') { agendaState.cursor = addDays(d, -1); agendaState.selectedDate = D.fmtDate(agendaState.cursor); navigate('agenda'); }
        else if (nav === 'next') { agendaState.cursor = addDays(d, 1); agendaState.selectedDate = D.fmtDate(agendaState.cursor); navigate('agenda'); }
        else if (nav === 'today') { agendaState.cursor = new Date(); agendaState.selectedDate = D.fmtDate(agendaState.cursor); navigate('agenda'); }
        else if (nav === 'add') { editAgendaEvent(null, sel); }
      });
    });
    // Wire: rij-klik → detail-modal
    $$('.bp-cal-day-row', root).forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('[data-act]')) return;
        const occ = events.find(function (x) { return x.occurrenceId === row.dataset.occurrence; });
        if (occ) viewAgendaOccurrence(occ);
      });
    });
    // Wire: toggle voltooid
    $$('[data-act="toggle"]', root).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const row = btn.closest('.bp-cal-day-row');
        const occ = events.find(function (x) { return x.occurrenceId === row.dataset.occurrence; });
        if (occ) {
          D.toggleAgendaCompleted(occ.id);
          toast('Bijgewerkt', 'Status gewijzigd', 'success');
          navigate('agenda');
        }
      });
    });
  }

  /** Toolbar (view-switcher + navigatie + zoek + filter) voor de agenda. */
  function renderAgendaToolbar() {
    const cursor = agendaState.cursor;
    let currentLabel = '';
    if (agendaState.view === 'month') {
      currentLabel = MONTH_NAMES_NL[cursor.getMonth()].charAt(0).toUpperCase() + MONTH_NAMES_NL[cursor.getMonth()].slice(1) + ' ' + cursor.getFullYear();
    } else if (agendaState.view === 'week') {
      const ws = startOfWeek(cursor);
      const we = addDays(ws, 6);
      currentLabel = 'Week ' + getWeekNumber(cursor) + ' · ' + ws.getDate() + ' ' + MONTH_NAMES_NL_SHORT[ws.getMonth()] + ' – ' + we.getDate() + ' ' + MONTH_NAMES_NL_SHORT[we.getMonth()];
    } else {
      const d = D.parseDate(agendaState.selectedDate) || new Date();
      currentLabel = DAY_NAMES_NL[(d.getDay() + 6) % 7].charAt(0).toUpperCase() + DAY_NAMES_NL[(d.getDay() + 6) % 7].slice(1) + ' ' + d.getDate() + ' ' + MONTH_NAMES_NL[d.getMonth()];
    }

    const views = [
      { key: 'month', label: 'Maand', icon: 'fa-calendar-days' },
      { key: 'week',  label: 'Week',  icon: 'fa-calendar-week' },
      { key: 'day',   label: 'Dag',   icon: 'fa-calendar-day' }
    ];

    let html = '<div class="bp-agenda-toolbar">';
    html += '<div class="bp-agenda-nav">';
    html += '<button class="bp-agenda-nav-btn" data-nav="prev" aria-label="Vorige"><i class="fas fa-chevron-left"></i></button>';
    html += '<button class="bp-agenda-nav-btn" data-nav="today" aria-label="Vandaag"><i class="fas fa-circle-dot"></i></button>';
    html += '<button class="bp-agenda-nav-btn" data-nav="next" aria-label="Volgende"><i class="fas fa-chevron-right"></i></button>';
    html += '<div class="bp-agenda-current">' + esc(currentLabel) + '</div>';
    html += '</div>';
    html += '<div class="bp-agenda-viewtabs">';
    views.forEach(function (v) {
      html += '<button class="bp-agenda-viewtab' + (agendaState.view === v.key ? ' active' : '') + '" data-viewtab="' + v.key + '"><i class="fas ' + v.icon + '"></i> ' + esc(v.label) + '</button>';
    });
    html += '</div>';
    html += '<div class="bp-agenda-search"><i class="fas fa-search"></i><input type="text" id="bpAgendaSearch" placeholder="Zoek in titel, notitie, klant…" value="' + esc(agendaState.search) + '"></div>';
    html += '<select class="bp-agenda-filter" id="bpAgendaFilter">';
    html += '<option value="all"' + (agendaState.typeFilter === 'all' ? ' selected' : '') + '>Alle types</option>';
    Object.keys(D.AGENDA_TYPE_META).forEach(function (k) {
      html += '<option value="' + esc(k) + '"' + (agendaState.typeFilter === k ? ' selected' : '') + '>' + esc(D.AGENDA_TYPE_META[k].label) + '</option>';
    });
    html += '</select>';
    html += '<button class="bp-btn bp-btn-primary bp-btn-sm" id="bpAgendaAdd"><i class="fas fa-plus"></i> Nieuw</button>';
    html += '</div>';
    return html;
  }

  /** ISO-weeknummer berekenen (1–53). */
  function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  }

  /** Sidebar (legenda + quick-add) voor de agenda. */
  function renderAgendaAside() {
    let html = '<div class="bp-agenda-aside">';
    html += '<div class="bp-agenda-legend">';
    html += '<div class="bp-agenda-legend-title">Legenda</div>';
    Object.keys(D.AGENDA_TYPE_META).forEach(function (k) {
      html += '<div class="bp-agenda-legend-row"><div class="bp-agenda-legend-swatch" data-type="' + esc(k) + '"></div>' +
        '<i class="fas ' + D.AGENDA_TYPE_META[k].icon + '" style="color:var(--bp-text-faint);width:1rem"></i> ' +
        esc(D.AGENDA_TYPE_META[k].label) + '</div>';
    });
    html += '</div>';
    // Mini-stats
    const todayStr = D.fmtDate(new Date());
    const allItems = D.list('agenda') || [];
    const todayCount = allItems.filter(function (x) { return x.date === todayStr; }).length;
    const reminderCount = allItems.filter(function (x) { return x.reminder && !x.completed; }).length;
    html += '<div class="bp-card"><div class="bp-card-body">';
    html += '<div class="bp-section-heading">Vandaag</div>';
    html += '<div style="font-family:Poppins;font-size:1.5rem;font-weight:700;color:var(--bp-primary-2)">' + todayCount + ' <span style="font-size:0.8rem;color:var(--bp-text-muted);font-weight:600">items</span></div>';
    html += '<div class="bp-section-heading">Actieve herinneringen</div>';
    html += '<div style="font-family:Poppins;font-size:1.5rem;font-weight:700;color:var(--bp-warn)">' + reminderCount + '</div>';
    html += '</div></div>';
    html += '</div>';
    return html;
  }

  /** Hoofd-view voor 'agenda'. */
  view('agenda', function (root) {
    // Bereken periode rondom de cursor
    let start, end;
    if (agendaState.view === 'month') {
      // Iets breder dan de maand zelf, want de grid toont ook een paar dagen van vorige/volgende maand
      const first = startOfMonth(agendaState.cursor);
      start = addDays(startOfWeek(first), -1);
      end = addDays(startOfWeek(first), 43);
    } else if (agendaState.view === 'week') {
      start = addDays(startOfWeek(agendaState.cursor), -1);
      end = addDays(startOfWeek(agendaState.cursor), 8);
    } else {
      const d = D.parseDate(agendaState.selectedDate) || new Date();
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
      end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 23, 59, 59);
    }
    let events = D.expandAgendaEvents(start, end);

    // Filter: zoek
    if (agendaState.search) {
      const q = agendaState.search.toLowerCase();
      events = events.filter(function (e) {
        return (e.title || '').toLowerCase().indexOf(q) !== -1 ||
               (e.note || '').toLowerCase().indexOf(q) !== -1 ||
               (e.customerName || '').toLowerCase().indexOf(q) !== -1 ||
               (e.location || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    // Filter: type
    if (agendaState.typeFilter !== 'all') {
      events = events.filter(function (e) { return e.type === agendaState.typeFilter; });
    }

    // Layout: toolbar + (calendar | aside)
    let html = renderAgendaToolbar();
    html += '<div class="bp-agenda-layout">';
    html += '<div class="bp-agenda-main" id="bpAgendaMain"></div>';
    html += renderAgendaAside();
    html += '</div>';
    root.innerHTML = html;

    // Render de juiste view in #bpAgendaMain
    const main = $('#bpAgendaMain', root);
    if (agendaState.view === 'month') renderAgendaMonth(main, events);
    else if (agendaState.view === 'week') renderAgendaWeek(main, events);
    else renderAgendaDay(main, events);

    // Wire toolbar
    $$('[data-nav]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        const nav = btn.dataset.nav;
        if (nav === 'prev') {
          if (agendaState.view === 'month') agendaState.cursor = addMonths(agendaState.cursor, -1);
          else if (agendaState.view === 'week') agendaState.cursor = addDays(agendaState.cursor, -7);
          else { const d = D.parseDate(agendaState.selectedDate) || new Date(); const n = addDays(d, -1); agendaState.cursor = n; agendaState.selectedDate = D.fmtDate(n); }
        } else if (nav === 'next') {
          if (agendaState.view === 'month') agendaState.cursor = addMonths(agendaState.cursor, 1);
          else if (agendaState.view === 'week') agendaState.cursor = addDays(agendaState.cursor, 7);
          else { const d = D.parseDate(agendaState.selectedDate) || new Date(); const n = addDays(d, 1); agendaState.cursor = n; agendaState.selectedDate = D.fmtDate(n); }
        } else if (nav === 'today') {
          agendaState.cursor = new Date();
          agendaState.selectedDate = D.fmtDate(agendaState.cursor);
        }
        navigate('agenda');
      });
    });
    $$('[data-viewtab]', root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        agendaState.view = btn.dataset.viewtab;
        if (agendaState.view === 'day' && !agendaState.selectedDate) {
          agendaState.selectedDate = D.fmtDate(new Date());
        }
        navigate('agenda');
      });
    });
    const searchInput = $('#bpAgendaSearch', root);
    if (searchInput) {
      let t;
      searchInput.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          agendaState.search = searchInput.value;
          navigate('agenda');
        }, 220);
      });
    }
    const filterSel = $('#bpAgendaFilter', root);
    if (filterSel) {
      filterSel.addEventListener('change', function () {
        agendaState.typeFilter = filterSel.value;
        navigate('agenda');
      });
    }
    const addBtn = $('#bpAgendaAdd', root);
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        // Pre-fill datum met selectedDate (als day-view) of vandaag
        const preset = agendaState.view === 'day' ? agendaState.selectedDate : D.fmtDate(new Date());
        editAgendaEvent(null, preset);
      });
    }
  });

  // ═══════════════════════════════════════════════════════
  // DARK MODE — toggle + persistence in localStorage
  // ═══════════════════════════════════════════════════════
  const DARK_KEY = 'lagencoBPDarkMode';
  function isDarkMode() {
    try { return localStorage.getItem(DARK_KEY) === 'true'; } catch (e) { return false; }
  }
  function applyDarkMode(dark) {
    if (dark) {
      document.body.classList.add('bp-dark');
      document.documentElement.classList.add('bp-dark');
    } else {
      document.body.classList.remove('bp-dark');
      document.documentElement.classList.remove('bp-dark');
    }
    try { localStorage.setItem(DARK_KEY, dark ? 'true' : 'false'); } catch (e) {}
    // Update icoon op de toggle-knop
    const icon = $('#bpDarkToggle i');
    if (icon) {
      icon.className = dark ? 'fas fa-sun' : 'fas fa-moon';
    }
    // Update theme-color meta (voor mobile browser UI)
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1410' : '#0F3D2E');
    // Re-render de huidige view zodat charts (die hardcoded kleuren hebben)
    // opnieuw worden getekend met de nieuwe achtergrond.
    if (currentView && VIEWS[currentView]) {
      // setTimeout om te zorgen dat de CSS-transition eerst afrondt
      setTimeout(function () { navigate(currentView); }, 50);
    }
  }

  // ═══════════════════════════════════════════════════════
  // PWA — Install prompt handling
  // ═══════════════════════════════════════════════════════
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    // Voorkom de standaard mini-infobar
    e.preventDefault();
    deferredInstallPrompt = e;
    // Toon een subtiele knop in de topbar (alleen als install mogelijk is)
    const topbar = $('.bp-topbar-right');
    if (topbar && !$('#bpInstallApp')) {
      const btn = document.createElement('button');
      btn.className = 'bp-icon-btn bp-install-btn';
      btn.id = 'bpInstallApp';
      btn.title = 'Installeer als app';
      btn.setAttribute('aria-label', 'Installeer als app');
      btn.innerHTML = '<i class="fas fa-download"></i>';
      btn.style.background = 'linear-gradient(135deg, var(--bp-primary), var(--bp-primary-2))';
      btn.style.color = '#fff';
      btn.style.boxShadow = '0 4px 12px rgba(107, 191, 126, 0.30)';
      btn.addEventListener('click', function () {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function (choice) {
          if (choice.outcome === 'accepted') {
            toast('App geïnstalleerd', 'Lagenco Admin staat nu op je thuisscherm', 'success');
          }
          deferredInstallPrompt = null;
          btn.remove();
        });
      });
      // Plaats helemaal links van de topbar-right
      topbar.insertBefore(btn, topbar.firstChild);
    }
  });
  // Verberg de knop zodra de app is geïnstalleerd
  window.addEventListener('appinstalled', function () {
    $('#bpInstallApp')?.remove();
    deferredInstallPrompt = null;
    toast('Geïnstalleerd', 'Lagenco Admin is nu als app geïnstalleerd', 'success');
  });

  // ═══════════════════════════════════════════════════════
  // VIEW: NOTITIEBLOK  (Planning → Notitieblok)
  // Volledige CRUD voor persoonlijke notities. Elke notitie heeft:
  //   titel, beschrijving (vrije tekst), categorie (vrij te kiezen/aanmaken)
  // Alle notities worden permanent in Firebase (bp/notities) opgeslagen
  // en real-time gesynchroniseerd via de onBpChange callback in boot().
  // ═══════════════════════════════════════════════════════

  /** Notitieblok state — zoek + categorie-filter blijven bewaard tijdens sessie. */
  const notitieState = {
    search: '',
    categoryFilter: 'all'  // 'all' of een categorie-naam
  };

  /** Standaard categorieën die altijd beschikbaar zijn (naast de door de gebruiker aangemaakte). */
  const NOTITIE_DEFAULT_CATEGORIES = ['Algemeen', 'Ideeën', 'Te doen', 'Belangrijk'];

  /** Verzamel alle categorieën: default + alle categorieën die in notities voorkomen. */
  function notitieAllCategories() {
    const set = new Set(NOTITIE_DEFAULT_CATEGORIES);
    (D.list('notities') || []).forEach(function (n) {
      if (n.category && String(n.category).trim()) set.add(String(n.category).trim());
    });
    return Array.from(set);
  }

  /** Open het add/edit-modal voor een notitie. */
  function editNotitie(notitie) {
    const isEdit = !!notitie;
    const initial = notitie || {};
    const existingCats = notitieAllCategories();

    const fields = [
      { key: 'title', label: 'Titel', required: true, full: true, placeholder: 'Bijv. "Inkooplijst juli" of "Idee voor nieuwe categorie"' },
      { key: 'category', label: 'Categorie', required: true, full: true, placeholder: 'Kies of typ een nieuwe categorie',
        type: 'text', suggestions: existingCats },
      { key: 'content', label: 'Beschrijving / notitie', type: 'textarea', full: true,
        placeholder: 'Schrijf je notitie hier… (vrije tekst, meerdere regels toegestaan)' }
    ];

    // Bouw body handmatig omdat formModal geen suggestions/combobox ondersteunt.
    let body = '<div class="bp-form-grid">';
    fields.forEach(function (f) {
      const val = initial ? (initial[f.key] != null ? initial[f.key] : '') : (f.default || '');
      const full = f.full ? ' full' : '';
      const req = f.required ? ' <span class="req">*</span>' : '';
      body += '<div class="bp-field' + full + '">';
      body += '<label class="bp-label">' + esc(f.label) + req + '</label>';
      if (f.type === 'textarea') {
        body += '<textarea class="bp-textarea" name="' + f.key + '" rows="6" placeholder="' + esc(f.placeholder || '') + '">' + esc(val) + '</textarea>';
      } else {
        // Gebruik een <input list="..."> combobox zodat gebruiker kan kiezen OF typen
        const listId = f.suggestions && f.suggestions.length ? 'dl-' + f.key : '';
        body += '<input type="' + (f.type || 'text') + '" class="bp-input" name="' + f.key + '" placeholder="' + esc(f.placeholder || '') + '" value="' + esc(val) + '"' + (listId ? ' list="' + listId + '"' : '') + ' autocomplete="off">';
        if (listId) {
          body += '<datalist id="' + listId + '">';
          f.suggestions.forEach(function (s) {
            body += '<option value="' + esc(s) + '">';
          });
          body += '</datalist>';
        }
      }
      body += '</div>';
    });
    body += '</div>';

    openModal({
      title: isEdit ? 'Notitie bewerken' : 'Nieuwe notitie',
      icon: 'fa-note-sticky',
      large: true,
      body: body,
      footer:
        '<button class="bp-btn bp-btn-ghost" data-action="cancel">Annuleren</button>' +
        '<button class="bp-btn bp-btn-primary" data-action="save"><i class="fas fa-check"></i> Opslaan</button>',
      onMount: function (m, close) {
        m.querySelector('[data-action="cancel"]').addEventListener('click', close);
        m.querySelector('[data-action="save"]').addEventListener('click', function () {
          const titleEl = m.querySelector('[name="title"]');
          const catEl = m.querySelector('[name="category"]');
          const contentEl = m.querySelector('[name="content"]');
          const title = titleEl ? titleEl.value.trim() : '';
          const category = catEl ? catEl.value.trim() : '';
          const content = contentEl ? contentEl.value : '';
          if (!title) {
            toast('Fout', 'Titel is verplicht', 'error');
            titleEl?.focus();
            return;
          }
          if (!category) {
            toast('Fout', 'Categorie is verplicht — typ een bestaande of nieuwe categorie', 'error');
            catEl?.focus();
            return;
          }
          const clean = {
            title: title,
            category: category,
            content: content
          };
          if (isEdit) {
            D.update('notities', notitie.id, clean);
            toast('Opgeslagen', 'Notitie is bijgewerkt', 'success');
          } else {
            D.add('notities', clean);
            toast('Toegevoegd', 'Notitie is opgeslagen in de database', 'success');
          }
          close();
          navigate('notitieblok');
        });
      }
    });
  }

  /** Verwijder een notitie met bevestiging. */
  function deleteNotitie(notitie) {
    confirmModal('Notitie verwijderen',
      'Weet je zeker dat je "' + notitie.title + '" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.',
      function () {
        D.remove('notities', notitie.id);
        toast('Verwijderd', 'Notitie is verwijderd uit de database', 'success');
        // Korte vertraging zodat closeModal afrondt vóór de re-render.
        // Zonder dit kan de oude kaart kort zichtbaar blijven in de nieuwe view.
        setTimeout(function () { navigate('notitieblok'); }, 50);
      });
  }

  /** Format datum-tijd voor weergave. */
  function notitieFmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d)) return iso;
      return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' · ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }

  /** Hoofd-view voor 'notitieblok'. */
  view('notitieblok', function (root) {
    let allNotities = D.list('notities') || [];
    // Sorteer: nieuwste eerst (op createdAt, fallback op updatedAt)
    allNotities.sort(function (a, b) {
      const aT = a.updatedAt || a.createdAt || '';
      const bT = b.updatedAt || b.createdAt || '';
      return aT < bT ? 1 : (aT > bT ? -1 : 0);
    });

    // Filter: zoek
    let filtered = allNotities;
    if (notitieState.search) {
      const q = notitieState.search.toLowerCase();
      filtered = filtered.filter(function (n) {
        return (n.title || '').toLowerCase().indexOf(q) !== -1 ||
               (n.content || '').toLowerCase().indexOf(q) !== -1 ||
               (n.category || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    // Filter: categorie
    if (notitieState.categoryFilter !== 'all') {
      filtered = filtered.filter(function (n) { return n.category === notitieState.categoryFilter; });
    }

    // Toolbar
    let html = '<div class="bp-agenda-toolbar">';
    html += '<div class="bp-agenda-nav">';
    html += '<button class="bp-btn bp-btn-primary bp-btn-sm" id="bpNotitieAdd"><i class="fas fa-plus"></i> Nieuwe notitie</button>';
    html += '</div>';
    html += '<div class="bp-agenda-search"><i class="fas fa-search"></i>';
    html += '<input type="text" id="bpNotitieSearch" placeholder="Zoek in titel, inhoud of categorie…" value="' + esc(notitieState.search) + '">';
    html += '</div>';
    // Categorie-filter
    const cats = notitieAllCategories();
    html += '<select class="bp-agenda-filter" id="bpNotitieCatFilter">';
    html += '<option value="all"' + (notitieState.categoryFilter === 'all' ? ' selected' : '') + '>Alle categorieën</option>';
    cats.forEach(function (c) {
      html += '<option value="' + esc(c) + '"' + (notitieState.categoryFilter === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    });
    html += '</select>';
    html += '</div>'; // /toolbar

    // Stats bar
    const total = allNotities.length;
    const catCounts = {};
    allNotities.forEach(function (n) {
      const c = n.category || '(geen)';
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    const topCats = Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a]; }).slice(0, 4);

    html += '<div class="bp-grid-2" style="margin-bottom:1.25rem">';
    html += '<div class="bp-card"><div class="bp-card-body" style="display:flex;align-items:center;gap:1rem">';
    html += '<div class="bp-weekly-row-icon" style="background:var(--bp-primary-soft);color:var(--bp-primary)"><i class="fas fa-note-sticky"></i></div>';
    html += '<div><div style="font-family:Poppins;font-weight:700;font-size:1.5rem;color:var(--bp-text);line-height:1">' + total + '</div>';
    html += '<div style="font-size:0.78rem;color:var(--bp-text-muted);margin-top:0.2rem">notities totaal</div></div>';
    html += '</div></div>';
    html += '<div class="bp-card"><div class="bp-card-body">';
    html += '<div class="bp-section-heading" style="margin-top:0">Categorieën</div>';
    if (topCats.length === 0) {
      html += '<div style="font-size:0.82rem;color:var(--bp-text-muted)">Nog geen categorieën — maak je eerste notitie aan.</div>';
    } else {
      html += '<div style="display:flex;flex-wrap:wrap;gap:0.5rem">';
      topCats.forEach(function (c) {
        html += '<span class="bp-badge bp-badge-primary" style="cursor:pointer" data-cat-filter="' + esc(c) + '">' + esc(c) + ' · ' + catCounts[c] + '</span>';
      });
      html += '</div>';
    }
    html += '</div></div>';
    html += '</div>';

    // Notities grid
    if (filtered.length === 0) {
      html += '<div class="bp-card"><div class="bp-card-body">';
      html += '<div class="bp-empty"><div class="bp-empty-icon"><i class="fas fa-note-sticky"></i></div>';
      if (total === 0) {
        html += '<div class="bp-empty-title">Nog geen notities</div>';
        html += '<div class="bp-empty-sub">Klik op "Nieuwe notitie" om je eerste notitie aan te maken. Alle notities worden permanent opgeslagen.</div>';
      } else {
        html += '<div class="bp-empty-title">Geen notities gevonden</div>';
        html += '<div class="bp-empty-sub">Pas je zoekterm of categorie-filter aan, of maak een nieuwe notitie.</div>';
      }
      html += '</div></div></div>';
    } else {
      html += '<div class="bp-notitie-grid">';
      filtered.forEach(function (n) {
        const preview = (n.content || '').length > 180 ? (n.content).slice(0, 177) + '…' : (n.content || '');
        const updated = notitieFmtDate(n.updatedAt || n.createdAt);
        html += '<div class="bp-card bp-notitie-card" data-notitie-id="' + esc(n.id) + '">';
        html += '<div class="bp-card-head">';
        html += '<div class="bp-card-title"><i class="fas fa-note-sticky" style="color:var(--bp-warn)"></i> ' + esc(n.title) + '</div>';
        html += '<div class="bp-notitie-actions">';
        html += '<button class="bp-row-action edit" data-act="edit" title="Bewerken"><i class="fas fa-pen"></i></button>';
        html += '<button class="bp-row-action delete" data-act="delete" title="Verwijderen"><i class="fas fa-trash"></i></button>';
        html += '</div>';
        html += '</div>';
        html += '<div class="bp-card-body">';
        if (preview) {
          html += '<div class="bp-notitie-content">' + esc(preview).replace(/\n/g, '<br>') + '</div>';
        } else {
          html += '<div class="bp-notitie-content bp-muted" style="font-style:italic">Geen beschrijving</div>';
        }
        html += '<div class="bp-notitie-meta">';
        html += '<span class="bp-badge bp-badge-primary">' + esc(n.category || 'Algemeen') + '</span>';
        if (updated) html += '<span class="bp-notitie-date"><i class="far fa-clock"></i> ' + esc(updated) + '</span>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    root.innerHTML = html;

    // Wire: nieuwe notitie knop
    $('#bpNotitieAdd', root)?.addEventListener('click', function () {
      editNotitie(null);
    });

    // Wire: zoek (debounced)
    const searchInput = $('#bpNotitieSearch', root);
    if (searchInput) {
      let t;
      searchInput.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          notitieState.search = searchInput.value;
          navigate('notitieblok');
        }, 220);
      });
    }

    // Wire: categorie-filter
    $('#bpNotitieCatFilter', root)?.addEventListener('change', function () {
      notitieState.categoryFilter = this.value;
      navigate('notitieblok');
    });

    // Wire: categorie-badge clicks (in stats bar)
    $$('[data-cat-filter]', root).forEach(function (badge) {
      badge.addEventListener('click', function () {
        notitieState.categoryFilter = badge.dataset.catFilter;
        navigate('notitieblok');
      });
    });

    // Wire: notitie kaarten (edit + delete)
    $$('.bp-notitie-card', root).forEach(function (card) {
      const notitieId = card.dataset.notitieId;
      const notitie = (allNotities).find(function (n) { return n.id === notitieId; });
      if (!notitie) return;
      // Klik op kaart (behalve op actie-knoppen) → open edit
      card.addEventListener('click', function (e) {
        if (e.target.closest('[data-act]')) return;
        editNotitie(notitie);
      });
      // Edit knop
      card.querySelector('[data-act="edit"]')?.addEventListener('click', function (e) {
        e.stopPropagation();
        editNotitie(notitie);
      });
      // Delete knop
      card.querySelector('[data-act="delete"]')?.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteNotitie(notitie);
      });
    });
  });

  // ═══════════════════════════════════════════════════════
  // VIEW: WEBSITE PRODUCTEN
  // Beheert de producten die op de publieke website staan
  // (/products/{id} in Firebase — real-time sync)
  // ═══════════════════════════════════════════════════════
  view('websiteproducten', function (root) {
    if (!window.LagencoDB || !window.LagencoDB.isConfigured) {
      root.innerHTML = '<div class="bp-card"><div class="bp-card-body">' +
        '<div class="bp-empty"><div class="bp-empty-icon"><i class="fas fa-exclamation-triangle"></i></div>' +
        '<div class="bp-empty-title">Firebase niet geconfigureerd</div>' +
        '<div class="bp-empty-sub">Vul de Firebase config in github-db.js in om website producten te beheren.</div>' +
        '</div></div></div>';
      return;
    }

    const products = window.LagencoDB.getProducts();

    function gradeStars(value) {
      const grades = {
        excellent:  { stars: 5, label: 'Excellent',  desc: 'Als nieuw' },
        goed:       { stars: 4, label: 'Goed',       desc: 'Lichte gebruikssporen' },
        redelijk:   { stars: 3, label: 'Redelijk',   desc: 'Zichtbare slijtage' },
        beschadigd: { stars: 2, label: 'Beschadigd',  desc: 'Cosmetische schade' }
      };
      const g = grades[value] || grades.goed;
      let s = '';
      for (let i = 0; i < 5; i++) {
        s += '<i class="fa' + (i < g.stars ? 's' : 'r') + ' fa-star" style="color:' + (i < g.stars ? '#f59e0b' : '#d1d5db') + ';font-size:.85rem"></i>';
      }
      return '<span style="display:inline-flex;align-items:center;gap:.4rem">' +
        '<span style="display:inline-flex;gap:.1rem">' + s + '</span>' +
        '<span style="font-weight:700;color:var(--bp-text);font-size:.8rem">' + g.label + '</span>' +
        '</span>';
    }

    let html = '<div class="bp-filter-bar">' +
      '<div class="bp-search-inline"><i class="fas fa-search"></i><input type="text" id="wpSearch" placeholder="Zoek website product…"></div>' +
      '<select class="bp-filter-select" id="wpGrade">' +
        '<option value="">Alle condities</option>' +
        '<option value="excellent">⭐⭐⭐⭐⭐ Excellent</option>' +
        '<option value="goed">⭐⭐⭐⭐ Goed</option>' +
        '<option value="redelijk">⭐⭐⭐ Redelijk</option>' +
        '<option value="beschadigd">⭐⭐ Beschadigd</option>' +
      '</select>' +
      '<button class="bp-btn bp-btn-primary" id="wpAdd"><i class="fas fa-plus"></i> Nieuw product</button>' +
      '</div>';

    html += '<div class="bp-card" style="margin-bottom:1rem;background:linear-gradient(135deg,#ecfdf5,#f0fdfa);border:1px solid #a7f3d0">' +
      '<div class="bp-card-body" style="display:flex;align-items:center;gap:.875rem;padding:1rem 1.25rem">' +
        '<div style="width:2.5rem;height:2.5rem;background:var(--bp-success);border-radius:.625rem;display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0"><i class="fas fa-fire"></i></div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-weight:700;color:#065f46;font-size:.95rem;font-family:Sora,sans-serif">Real-time synchronisatie actief</div>' +
          '<div style="color:#047857;font-size:.825rem;margin-top:.15rem">Wijzigingen worden direct opgeslagen in Firebase en zichtbaar voor alle bezoekers van de website.</div>' +
        '</div>' +
      '</div></div>';

    html += '<div id="wpList">';
    html += renderWebsiteProductList(products);
    html += '</div>';

    root.innerHTML = html;

    $('#wpAdd', root).addEventListener('click', () => editWebsiteProduct());
    $('#wpSearch', root).addEventListener('input', () => filterWP());
    $('#wpGrade', root).addEventListener('change', () => filterWP());

    function filterWP() {
      const q = ($('#wpSearch', root).value || '').toLowerCase();
      const g = $('#wpGrade', root).value;
      const filtered = window.LagencoDB.getProducts().filter(p => {
        if (g && p.conditionGrade !== g) return false;
        if (q && !(p.title || '').toLowerCase().includes(q) && !(p.description || '').toLowerCase().includes(q)) return false;
        return true;
      });
      $('#wpList', root).innerHTML = renderWebsiteProductList(filtered);
      wireWPActions();
    }
    wireWPActions();

    function wireWPActions() {
      $$('.bp-row-action.edit', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        const p = window.LagencoDB.getProduct(id);
        if (p) editWebsiteProduct(p);
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        const p = window.LagencoDB.getProduct(id);
        if (!p) return;
        confirmModal('Website product verwijderen',
          'Weet je zeker dat je "' + (p.title || 'dit product') + '" van de website wilt verwijderen? Dit verwijdert het product uit Firebase en het verdwijnt direct van de website.',
          () => {
            window.LagencoDB.deleteProduct(id).then(() => {
              toast('Verwijderd', (p.title || 'Product') + ' is verwijderd van de website', 'success');
              navigate('websiteproducten');
            });
          });
      }));
      $$('.bp-row-action.view', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        const p = window.LagencoDB.getProduct(id);
        if (!p) return;
        const img = (p.images && p.images[0]) || p.image || '';
        openModal({
          title: p.title || 'Product', icon: 'fa-eye',
          body: '<div style="text-align:center">' +
                (img ? '<img src="' + esc(img) + '" alt="" style="max-width:100%;max-height:300px;border-radius:.5rem;margin-bottom:1rem">' : '') +
                '<div style="margin-bottom:.75rem">' + gradeStars(p.conditionGrade) + '</div>' +
                '<p style="color:var(--bp-muted);line-height:1.6;margin-bottom:.75rem">' + esc(p.description || '') + '</p>' +
                '<p style="font-size:1.5rem;font-weight:800;color:var(--bp-success)">€ ' + esc(String(Number(p.price || 0).toFixed(2))) + '</p>' +
                (p.oldPrice ? '<p style="text-decoration:line-through;color:var(--bp-muted)">€ ' + esc(String(Number(p.oldPrice).toFixed(2))) + '</p>' : '') +
                '</div>'
        });
      }));
    }

    function renderWebsiteProductList(items) {
      if (!items || items.length === 0) {
        return '<div class="bp-card"><div class="bp-card-body">' +
          emptyState('fa-globe', 'Geen website producten',
            'Er staan nog geen producten op de website. Voeg je eerste product toe om te beginnen.',
            'Product toevoegen', () => editWebsiteProduct()).outerHTML +
          '</div></div>';
      }
      let html = '<div class="bp-card"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
        '<thead><tr><th>Product</th><th>Beschrijving</th><th>Conditie</th><th class="num">Prijs</th><th class="num">Acties</th></tr></thead><tbody>';
      items.forEach(p => {
        const img = (p.images && p.images[0]) || p.image || '';
        html += '<tr data-id="' + esc(p.id) + '">' +
          '<td class="strong">' +
            '<div style="display:flex;align-items:center;gap:.75rem">' +
              (img ? '<img src="' + esc(img) + '" alt="" style="width:2.5rem;height:2.5rem;object-fit:cover;border-radius:.375rem;border:1px solid var(--bp-border)">' : '<div style="width:2.5rem;height:2.5rem;background:var(--bp-bg-2);border-radius:.375rem;display:flex;align-items:center;justify-content:center;color:var(--bp-muted)"><i class="fas fa-image"></i></div>') +
              '<div style="min-width:0">' +
                '<div style="font-weight:700;color:var(--bp-text)">' + esc(p.title || '(naamloos)') + '</div>' +
                '<div style="font-size:.75rem;color:var(--bp-muted)">' + esc(p.badge || 'Uitgelicht') + '</div>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td style="max-width:300px"><div style="color:var(--bp-muted);font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc((p.description || '').slice(0, 80)) + (p.description && p.description.length > 80 ? '…' : '') + '</div></td>' +
          '<td>' + gradeStars(p.conditionGrade) + '</td>' +
          '<td class="num"><strong>€ ' + esc(String(Number(p.price || 0).toFixed(2))) + '</strong>' +
            (p.oldPrice ? '<div style="text-decoration:line-through;color:var(--bp-muted);font-size:.75rem">€ ' + esc(String(Number(p.oldPrice).toFixed(2))) + '</div>' : '') +
          '</td>' +
          '<td class="num"></td></tr>';
      });
      html += '</tbody></table></div></div></div>';

      setTimeout(() => {
        $$('#wpList tr[data-id]').forEach(tr => {
          const id = tr.dataset.id;
          const cell = tr.querySelector('td:last-child');
          cell.appendChild(actionBtns(
            () => editWebsiteProduct(window.LagencoDB.getProduct(id)),
            () => {
              const p = window.LagencoDB.getProduct(id);
              if (!p) return;
              confirmModal('Website product verwijderen',
                'Weet je zeker dat je "' + (p.title || 'dit product') + '" van de website wilt verwijderen?',
                () => {
                  window.LagencoDB.deleteProduct(id).then(() => {
                    toast('Verwijderd', (p.title || 'Product') + ' is verwijderd van de website', 'success');
                    navigate('websiteproducten');
                  });
                });
            },
            () => {
              const p = window.LagencoDB.getProduct(id);
              if (!p) return;
              const img = (p.images && p.images[0]) || p.image || '';
              openModal({
                title: p.title || 'Product', icon: 'fa-eye',
                body: '<div style="text-align:center">' +
                      (img ? '<img src="' + esc(img) + '" alt="" style="max-width:100%;max-height:300px;border-radius:.5rem;margin-bottom:1rem">' : '') +
                      '<div style="margin-bottom:.75rem">' + gradeStars(p.conditionGrade) + '</div>' +
                      '<p style="color:var(--bp-muted);line-height:1.6;margin-bottom:.75rem">' + esc(p.description || '') + '</p>' +
                      '<p style="font-size:1.5rem;font-weight:800;color:var(--bp-success)">€ ' + esc(String(Number(p.price || 0).toFixed(2))) + '</p>' +
                      '</div>'
              });
            }
          ));
        });
      }, 0);
      return html;
    }

    function editWebsiteProduct(p) {
      const isNew = !p;
      const fields = [
        { key: 'title', label: 'Productnaam', required: true, placeholder: 'bv. Sennheiser E604 Instrumentmicrofoon', full: true },
        { key: 'price', label: 'Verkoopprijs', type: 'euro', placeholder: '0,00', required: true },
        { key: 'oldPrice', label: 'Oude prijs (optioneel)', type: 'euro', placeholder: '0,00' },
        { key: 'conditionGrade', label: 'Product Condition Grade', type: 'select', required: true, options: [
            { value: 'excellent',  label: '⭐⭐⭐⭐⭐ Excellent — Als nieuw' },
            { value: 'goed',       label: '⭐⭐⭐⭐ Goed — Lichte gebruikssporen' },
            { value: 'redelijk',   label: '⭐⭐⭐ Redelijk — Zichtbare slijtage' },
            { value: 'beschadigd', label: '⭐⭐ Beschadigd — Cosmetische schade' }
          ], default: 'goed' },
        { key: 'badge', label: 'Badge (optioneel)', placeholder: 'bv. Nieuw, Retourproduct, Tweedehands', full: true },
        { key: 'description', label: 'Productbeschrijving', type: 'textarea', placeholder: 'Uitgebreide beschrijving van het product…', full: true }
      ];
      formModal(isNew ? 'Nieuw website product' : 'Website product bewerken', 'fa-globe', fields, (data, close) => {
        if (!data.title) { toast('Fout', 'Productnaam is verplicht', 'error'); return; }
        if (!data.price || data.price <= 0) { toast('Fout', 'Vul een geldige verkoopprijs in (groter dan 0)', 'error'); return; }

        if (isNew) {
          const newProduct = {
            id: 'p-' + Date.now(),
            title: data.title,
            description: data.description || '',
            price: Number(data.price),
            oldPrice: data.oldPrice ? Number(data.oldPrice) : null,
            badge: data.badge || 'Uitgelicht',
            conditionGrade: data.conditionGrade || 'goed',
            image: 'https://images.unsplash.net/photo-1503602642458-232111445657?w=500&q=80',
            images: ['https://images.unsplash.net/photo-1503602642458-232111445657?w=500&q=80'],
            createdAt: Date.now()
          };
          window.LagencoDB.saveProduct(newProduct).then(() => {
            toast('Toegevoegd', data.title + ' is toegevoegd aan de website', 'success');
            close();
            navigate('websiteproducten');
          });
        } else {
          const updated = Object.assign({}, p, {
            title: data.title,
            description: data.description || '',
            price: Number(data.price),
            oldPrice: data.oldPrice ? Number(data.oldPrice) : null,
            badge: data.badge || 'Uitgelicht',
            conditionGrade: data.conditionGrade || 'goed',
            updatedAt: Date.now()
          });
          window.LagencoDB.saveProduct(updated).then(() => {
            toast('Opgeslagen', data.title + ' is bijgewerkt op de website', 'success');
            close();
            navigate('websiteproducten');
          });
        }
      }, p || {});
    }
  });

  // ═══════════════════════════════════════════════════════
  // VIEW: PRODUCTEN
  // ═══════════════════════════════════════════════════════
  view('producten', function (root) {
    const producten = D.list('producten');
    const grouped = {};
    producten.forEach(p => {
      const c = p.category || 'Overig';
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push(p);
    });

    let html = '<div class="bp-filter-bar">' +
      '<div class="bp-search-inline"><i class="fas fa-search"></i><input type="text" id="prodSearch" placeholder="Zoek product…"></div>' +
      '<select class="bp-filter-select" id="prodCat"><option value="">Alle categorieën</option>' +
      Object.keys(grouped).map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('') +
      '</select>' +
      '<button class="bp-btn bp-btn-primary" id="prodAdd"><i class="fas fa-plus"></i> Product toevoegen</button>' +
      '</div>';

    html += '<div id="prodList">';
    html += renderProductList(producten, grouped);
    html += '</div>';

    root.innerHTML = html;

    $('#prodAdd', root).addEventListener('click', () => editProduct());
    $('#prodSearch', root).addEventListener('input', e => filterProducts());
    $('#prodCat', root).addEventListener('change', e => filterProducts());

    function filterProducts() {
      const q = ($('#prodSearch', root).value || '').toLowerCase();
      const cat = $('#prodCat', root).value;
      const filtered = producten.filter(p => {
        if (cat && p.category !== cat) return false;
        if (q && !p.name.toLowerCase().includes(q)) return false;
        return true;
      });
      const g = {};
      filtered.forEach(p => { const c = p.category || 'Overig'; if (!g[c]) g[c] = []; g[c].push(p); });
      $('#prodList', root).innerHTML = renderProductList(filtered, g);
      wireProductActions();
    }
    wireProductActions();

    function wireProductActions() {
      $$('.bp-row-action.edit', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        editProduct(D.get('producten', id));
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        const p = D.get('producten', id);
        confirmModal('Product verwijderen', 'Weet je zeker dat je "' + p.name + '" wilt verwijderen?', () => {
          D.remove('producten', id);
          toast('Verwijderd', p.name + ' is verwijderd', 'success');
          navigate('producten');
        });
      }));
    }
  });

  function renderProductList(producten, grouped) {
    if (producten.length === 0) {
      return '<div class="bp-card"><div class="bp-card-body">' +
        emptyState('fa-box', 'Geen producten', 'Voeg je eerste product toe om te beginnen', 'Product toevoegen', () => editProduct()).outerHTML +
        '</div></div>';
    }
    let html = '';
    Object.keys(grouped).forEach(cat => {
      html += '<div class="bp-cat-header"><i class="fas fa-folder"></i> ' + esc(cat) + ' <span class="bp-badge bp-badge-neutral">' + grouped[cat].length + '</span></div>';
      html += '<div class="bp-card" style="margin-bottom:1rem"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
        '<thead><tr><th>Product</th><th class="num">Inkoopprijs</th><th class="num">Verkoopprijs</th><th class="num">Winst</th><th class="num">Marge</th><th class="num">ROM</th><th class="num">Verkocht</th><th class="num">Acties</th></tr></thead><tbody>';
      grouped[cat].forEach(p => {
        const m = D.computeProductMetrics(p);
        html += '<tr data-id="' + p.id + '">' +
          '<td class="strong">' + esc(p.name) + '</td>' +
          '<td class="num muted">' + D.fmtEuro(m.cost) + '</td>' +
          '<td class="num strong">' + D.fmtEuro(m.sell) + '</td>' +
          '<td class="num" style="color:var(--bp-success)">' + D.fmtEuro(m.profit) + '</td>' +
          '<td class="num">' + D.fmtPct(m.margin) + '</td>' +
          '<td class="num"><span class="bp-badge bp-badge-info">' + D.fmtPct(m.rom) + '</span></td>' +
          '<td class="num">' + D.fmtNum(m.sold) + '</td>' +
          '<td class="num"></td></tr>';
      });
      html += '</tbody></table></div></div></div>';
    });
    // Append action buttons after HTML is in DOM
    setTimeout(() => {
      $$('#prodList tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        const cell = tr.querySelector('td:last-child');
        cell.appendChild(actionBtns(
          () => editProduct(D.get('producten', id)),
          () => {
            const p = D.get('producten', id);
            confirmModal('Product verwijderen', 'Weet je zeker dat je "' + p.name + '" wilt verwijderen?', () => {
              D.remove('producten', id);
              toast('Verwijderd', p.name + ' is verwijderd', 'success');
              navigate('producten');
            });
          }
        ));
      });
    }, 0);
    return html;
  }

  function editProduct(p) {
    const isNew = !p;
    const fields = [
      { key: 'name', label: 'Productnaam', required: true, placeholder: 'bv. Sennheiser E604', full: true },
      { key: 'category', label: 'Categorie', type: 'select', options: ['Microfoons', 'Gereedschap', 'Dyson', 'Overigen', 'Overig'], default: 'Microfoons' },
      { key: 'costPrice', label: 'Inkoopprijs', type: 'euro', placeholder: '0,00' },
      { key: 'sellPrice', label: 'Verkoopprijs', type: 'euro', placeholder: '0,00' },
      { key: 'sold', label: 'Aantal verkocht', type: 'number', step: '1', default: 0 },
      { key: 'status', label: 'Status', type: 'select', options: ['actief', 'inactief', 'uitverkocht'] }
    ];
    formModal(isNew ? 'Nieuw product' : 'Product bewerken', 'fa-box', fields, (data, close) => {
      if (!data.name) { toast('Fout', 'Productnaam is verplicht', 'error'); return; }
      if (isNew) {
        D.add('producten', data);
        // Also create a voorraad entry
        D.add('voorraad', { productId: '', category: data.category, name: data.name, stock: 0, minStock: 1, location: 'Magazijn A' });
        // link them
        const prods = D.list('producten');
        const vs = D.list('voorraad');
        const newProd = prods[0];
        const newV = vs.find(v => v.name === data.name && !v.productId);
        if (newV) { newV.productId = newProd.id; D.save('voorraad', vs); }
        toast('Toegevoegd', data.name + ' is toegevoegd', 'success');
      } else {
        D.update('producten', p.id, data);
        // sync name/category in voorraad
        const vs = D.list('voorraad').map(v => v.productId === p.id ? Object.assign(v, { name: data.name, category: data.category }) : v);
        D.save('voorraad', vs);
        toast('Opgeslagen', data.name + ' is bijgewerkt', 'success');
      }
      close();
      navigate('producten');
    }, p || {});
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: VOORRAAD
  // ═══════════════════════════════════════════════════════
  view('voorraad', function (root) {
    const voorraad = D.list('voorraad');
    const producten = D.list('producten');
    const grouped = {};
    voorraad.forEach(v => {
      const c = v.category || 'Overig';
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push(v);
    });

    let html = '<div class="bp-filter-bar">' +
      '<div class="bp-search-inline"><i class="fas fa-search"></i><input type="text" id="vSearch" placeholder="Zoek voorraad…"></div>' +
      '<button class="bp-btn bp-btn-primary" id="vAdd"><i class="fas fa-plus"></i> Voorraad toevoegen</button>' +
      '</div>';

    html += '<div id="vList">';
    html += renderVoorraadList(grouped, voorraad);
    html += '</div>';

    root.innerHTML = html;
    $('#vAdd', root).addEventListener('click', () => editVoorraad());
    $('#vSearch', root).addEventListener('input', () => filterV());

    function filterV() {
      const q = ($('#vSearch', root).value || '').toLowerCase();
      const filtered = voorraad.filter(v => v.name.toLowerCase().includes(q));
      const g = {};
      filtered.forEach(v => { const c = v.category || 'Overig'; if (!g[c]) g[c] = []; g[c].push(v); });
      $('#vList', root).innerHTML = renderVoorraadList(g, filtered);
      wireV();
    }
    wireV();

    function wireV() {
      $$('.bp-row-action.edit', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        editVoorraad(D.get('voorraad', id));
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        const v = D.get('voorraad', id);
        confirmModal('Verwijderen', 'Voorraad van "' + v.name + '" verwijderen?', () => {
          D.remove('voorraad', id);
          toast('Verwijderd', '', 'success');
          navigate('voorraad');
        });
      }));
      $$('.bp-stock-adjust', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        const delta = parseInt(e.currentTarget.dataset.delta, 10);
        const v = D.get('voorraad', id);
        const newStock = Math.max(0, (parseInt(v.stock, 10) || 0) + delta);
        D.update('voorraad', id, { stock: newStock });
        toast('Bijgewerkt', v.name + ': ' + newStock + ' stuks', 'success');
        navigate('voorraad');
      }));
    }
  });

  function renderVoorraadList(grouped, voorraad) {
    if (voorraad.length === 0) return emptyState('fa-warehouse', 'Geen voorraad', 'Voeg voorraad toe', 'Toevoegen', () => editVoorraad()).outerHTML;
    let html = '';
    Object.keys(grouped).forEach(cat => {
      html += '<div class="bp-cat-header"><i class="fas fa-folder"></i> ' + esc(cat) + '</div>';
      html += '<div class="bp-card" style="margin-bottom:1rem"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
        '<thead><tr><th>Product</th><th>Locatie</th><th class="num">Voorraad</th><th>Voorraadbalk</th><th class="num">Min</th><th>Status</th><th class="num">Acties</th></tr></thead><tbody>';
      grouped[cat].forEach(v => {
        const stock = parseInt(v.stock, 10) || 0;
        const min = parseInt(v.minStock, 10) || 0;
        const pct = Math.min(100, (stock / Math.max(min * 3, 1)) * 100);
        const cls = stock === 0 ? 'danger' : (stock <= min ? 'warn' : '');
        const status = stock === 0 ? 'Uitverkocht' : (stock <= min ? 'Laag' : 'Op voorraad');
        html += '<tr data-id="' + v.id + '">' +
          '<td class="strong">' + esc(v.name) + '</td>' +
          '<td class="muted">' + esc(v.location || '-') + '</td>' +
          '<td class="num strong">' + D.fmtNum(stock) + '</td>' +
          '<td><div class="bp-stock-bar"><div class="bp-stock-bar-fill ' + cls + '" style="width:' + pct + '%"></div></div></td>' +
          '<td class="num muted">' + D.fmtNum(min) + '</td>' +
          '<td>' + statusBadge(status) + '</td>' +
          '<td class="num"><div class="bp-row-actions">' +
            '<button class="bp-row-action bp-stock-adjust" data-delta="-1" title="-1"><i class="fas fa-minus"></i></button>' +
            '<button class="bp-row-action bp-stock-adjust" data-delta="1" title="+1"><i class="fas fa-plus"></i></button>' +
          '</div></td></tr>';
      });
      html += '</tbody></table></div></div></div>';
    });
    // Add edit/delete buttons
    setTimeout(() => {
      $$('#vList tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        const cell = tr.querySelector('td:last-child');
        cell.appendChild(actionBtns(
          () => editVoorraad(D.get('voorraad', id)),
          () => {
            const v = D.get('voorraad', id);
            confirmModal('Verwijderen', 'Verwijder voorraad van "' + v.name + '"?', () => {
              D.remove('voorraad', id); toast('Verwijderd', '', 'success'); navigate('voorraad');
            });
          }
        ));
      });
    }, 0);
    return html;
  }

  function editVoorraad(v) {
    const products = D.list('producten');
    const fields = [
      { key: 'name', label: 'Productnaam', required: true, placeholder: 'bv. Sennheiser E604' },
      { key: 'category', label: 'Categorie', type: 'select', options: ['Microfoons', 'Gereedschap', 'Accessoires', 'Overigen', 'Overig'] },
      { key: 'stock', label: 'Voorraad', type: 'number', step: '1', default: 0 },
      { key: 'minStock', label: 'Minimum voorraad', type: 'number', step: '1', default: 1 },
      { key: 'location', label: 'Locatie', placeholder: 'bv. Magazijn A' },
      { key: 'productId', label: 'Gekoppeld product (ID)', type: 'select', options: [{ value: '', label: '— Geen —' }].concat(products.map(p => ({ value: p.id, label: p.name }))) }
    ];
    formModal(v ? 'Voorraad bewerken' : 'Voorraad toevoegen', 'fa-warehouse', fields, (data, close) => {
      if (!data.name) { toast('Fout', 'Naam is verplicht', 'error'); return; }
      if (v) { D.update('voorraad', v.id, data); toast('Opgeslagen', '', 'success'); }
      else { D.add('voorraad', data); toast('Toegevoegd', '', 'success'); }
      close(); navigate('voorraad');
    }, v || {});
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: INKOOP
  // ═══════════════════════════════════════════════════════
  view('inkoop', function (root) {
    const inkoop = D.list('inkoop');
    const total = inkoop.reduce((a, i) => a + D.parseNum(i.totalCost), 0);
    let html = '<div class="bp-kpi-grid" style="margin-bottom:1rem">';
    html += kpiCard('Totale Inkoop', D.fmtEuro(total), 'fa-shopping-cart', 'warn', { up: true, text: inkoop.length + ' orders' });
    html += kpiCard('Gem. per Order', D.fmtEuro(inkoop.length ? total / inkoop.length : 0), 'fa-chart-bar', 'info');
    html += '</div>';

    html += '<div class="bp-filter-bar">' +
      '<div class="bp-search-inline"><i class="fas fa-search"></i><input type="text" id="iSearch" placeholder="Zoek inkoop…"></div>' +
      '<button class="bp-btn bp-btn-primary" id="iAdd"><i class="fas fa-plus"></i> Inkoop toevoegen</button>' +
      '</div>';

    html += '<div id="iList">' + renderInkoopList(inkoop) + '</div>';
    root.innerHTML = html;

    $('#iAdd', root).addEventListener('click', () => editInkoop());
    $('#iSearch', root).addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const filtered = inkoop.filter(i => JSON.stringify(i).toLowerCase().includes(q));
      $('#iList', root).innerHTML = renderInkoopList(filtered);
      wireI();
    });
    wireI();

    function wireI() {
      $$('.bp-row-action.edit', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('[data-id]').dataset.id;
        editInkoop(D.get('inkoop', id));
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('[data-id]').dataset.id;
        const i = D.get('inkoop', id);
        confirmModal('Verwijderen', 'Inkooporder verwijderen?', () => {
          D.remove('inkoop', id); toast('Verwijderd', '', 'success'); navigate('inkoop');
        });
      }));
    }
  });

  function renderInkoopList(inkoop) {
    if (inkoop.length === 0) return emptyState('fa-shopping-cart', 'Geen inkooporders', 'Voeg een inkooporder toe', 'Toevoegen', () => editInkoop()).outerHTML;
    let html = '<div class="bp-stack">';
    inkoop.forEach(i => {
      const items = (i.items || []).map(it => '<span class="bp-badge bp-badge-neutral">' + D.fmtNum(it.qty) + 'x ' + esc(it.name) + ' (' + D.fmtEuro(it.cost) + ')</span>').join(' ');
      html += '<div class="bp-card bp-card-hover" data-id="' + i.id + '"><div class="bp-card-body">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap">' +
          '<div><div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.4rem">' +
            '<span class="bp-strong" style="font-size:1.05rem">' + esc(i.date) + '</span>' +
            statusBadge(i.status) +
          '</div>' +
          '<div class="bp-pill-group" style="margin-bottom:0.5rem">' + items + '</div>' +
          (i.note ? '<div class="bp-muted" style="font-size:0.8rem"><i class="fas fa-sticky-note"></i> ' + esc(i.note) + '</div>' : '') +
          '</div>' +
          '<div style="text-align:right"><div class="bp-stat-label">Totaal</div><div style="font-size:1.4rem;font-weight:700;color:var(--bp-warn)">' + D.fmtEuro(i.totalCost) + '</div></div>' +
        '</div></div></div>';
    });
    html += '</div>';
    // Attach actions
    setTimeout(() => {
      $$('#iList [data-id]').forEach(card => {
        const id = card.dataset.id;
        const cell = card.querySelector('.bp-card-body > div > div:last-child');
        if (cell) {
          const acts = actionBtns(
            () => editInkoop(D.get('inkoop', id)),
            () => { const i = D.get('inkoop', id); confirmModal('Verwijderen', 'Inkooporder verwijderen?', () => { D.remove('inkoop', id); toast('Verwijderd', '', 'success'); navigate('inkoop'); }); }
          );
          acts.style.flexDirection = 'column';
          cell.appendChild(acts);
        }
      });
    }, 0);
    return html;
  }

  function editInkoop(i) {
    const isNew = !i;
    if (!i) i = { date: new Date().toISOString().slice(0, 10), items: [], totalCost: 0, status: 'Verzonden', note: '' };
    let body = '<div class="bp-field full" style="margin-bottom:1rem"><label class="bp-label">Datum <span class="req">*</span></label>' +
      '<input type="date" class="bp-input" id="iDate" value="' + esc(i.date || '') + '"></div>' +
      '<div class="bp-field full" style="margin-bottom:1rem"><label class="bp-label">Status</label>' +
      '<select class="bp-select" id="iStatus"><option>Verzonden</option><option>Compleet</option><option>In afwachting</option><option>Geannuleerd</option></select></div>' +
      '<div class="bp-field full" style="margin-bottom:1rem"><label class="bp-label">Notitie</label>' +
      '<textarea class="bp-textarea" id="iNote" placeholder="Optionele notitie…">' + esc(i.note || '') + '</textarea></div>' +
      '<div class="bp-section-title"><i class="fas fa-list"></i> Productregels</div>' +
      '<div id="iItems"></div>' +
      '<button class="bp-btn bp-btn-secondary bp-btn-sm" id="iAddItem" style="margin-top:0.75rem"><i class="fas fa-plus"></i> Regel toevoegen</button>' +
      '<div style="margin-top:1rem;padding:1rem;background:var(--bp-card-2);border-radius:12px;text-align:right">' +
        '<div class="bp-stat-label">Totale inkoopkosten</div>' +
        '<div id="iTotal" style="font-size:1.5rem;font-weight:700;color:var(--bp-warn)">€ 0,00</div>' +
      '</div>';

    openModal({
      title: isNew ? 'Nieuwe inkooporder' : 'Inkooporder bewerken', icon: 'fa-shopping-cart', large: true, body: body,
      footer: '<button class="bp-btn bp-btn-ghost" data-action="cancel">Annuleren</button><button class="bp-btn bp-btn-primary" data-action="save"><i class="fas fa-check"></i> Opslaan</button>',
      onMount: (m, close) => {
        const items = (i.items || []).slice();
        const itemsEl = m.querySelector('#iItems');
        function recalc() {
          let total = 0;
          $$('.i-item', itemsEl).forEach(row => {
            const qty = D.parseNum(row.querySelector('.i-qty').value);
            const cost = D.parseNum(row.querySelector('.i-cost').value);
            const lineTotal = qty * cost;
            row.querySelector('.i-linetotal').textContent = D.fmtEuro(lineTotal);
            total += lineTotal;
          });
          m.querySelector('#iTotal').textContent = D.fmtEuro(total);
        }
        function addRow(item) {
          item = item || { name: '', qty: 1, cost: 0 };
          const row = document.createElement('div');
          row.className = 'i-item';
          row.style.cssText = 'display:grid;grid-template-columns:1fr 80px 110px 110px 36px;gap:0.5rem;align-items:center;margin-bottom:0.5rem';
          row.innerHTML =
            '<input type="text" class="bp-input i-name" placeholder="Productnaam" value="' + esc(item.name) + '">' +
            '<input type="number" class="bp-input i-qty" placeholder="1" min="0" value="' + esc(item.qty) + '">' +
            '<div class="bp-input-group"><span class="bp-prefix">€</span><input type="number" class="i-cost" step="0.01" placeholder="0,00" value="' + esc(item.cost) + '"></div>' +
            '<div class="i-linetotal strong" style="text-align:right">' + D.fmtEuro(0) + '</div>' +
            '<button class="bp-row-action delete" title="Verwijder regel"><i class="fas fa-times"></i></button>';
          itemsEl.appendChild(row);
          row.querySelector('.i-qty').addEventListener('input', recalc);
          row.querySelector('.i-cost').addEventListener('input', recalc);
          row.querySelector('.bp-row-action.delete').addEventListener('click', () => { row.remove(); recalc(); });
        }
        items.forEach(addRow);
        if (items.length === 0) addRow();
        m.querySelector('#iAddItem').addEventListener('click', () => addRow());
        recalc();

        // Pre-set status
        const sel = m.querySelector('#iStatus');
        Array.from(sel.options).forEach(o => { if (o.value === i.status) o.selected = true; });

        m.querySelector('[data-action="cancel"]').addEventListener('click', close);
        m.querySelector('[data-action="save"]').addEventListener('click', () => {
          const date = m.querySelector('#iDate').value;
          if (!date) { toast('Fout', 'Datum is verplicht', 'error'); return; }
          const newItems = $$('.i-item', itemsEl).map(row => ({
            name: row.querySelector('.i-name').value,
            qty: D.parseNum(row.querySelector('.i-qty').value),
            cost: D.parseNum(row.querySelector('.i-cost').value)
          })).filter(x => x.name);
          const total = newItems.reduce((a, x) => a + x.qty * x.cost, 0);
          const data = { date: date, items: newItems, totalCost: total, status: sel.value, note: m.querySelector('#iNote').value };
          if (isNew) D.add('inkoop', data);
          else D.update('inkoop', i.id, data);
          toast('Opgeslagen', '', 'success');
          close(); navigate('inkoop');
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: VERKOOP
  // ═══════════════════════════════════════════════════════
  view('verkoop', function (root) {
    const verkoop = D.list('verkoop');
    const totalRev = verkoop.reduce((a, s) => a + D.parseNum(s.sellPrice), 0);
    const totalProfit = verkoop.reduce((a, s) => a + D.parseNum(s.profit), 0);
    let html = '<div class="bp-kpi-grid" style="margin-bottom:1rem">';
    html += kpiCard('Omzet', D.fmtEuro(totalRev), 'fa-euro-sign', 'info', { up: true, text: verkoop.length + ' verkopen' });
    html += kpiCard('Winst', D.fmtEuro(totalProfit), 'fa-arrow-trend-up', 'success');
    html += kpiCard('Gem. per Verkoop', D.fmtEuro(verkoop.length ? totalRev / verkoop.length : 0), 'fa-chart-bar', 'violet');
    html += '</div>';

    html += '<div class="bp-filter-bar">' +
      '<div class="bp-search-inline"><i class="fas fa-search"></i><input type="text" id="sSearch" placeholder="Zoek verkoop…"></div>' +
      '<button class="bp-btn bp-btn-primary" id="sAdd"><i class="fas fa-plus"></i> Verkoop toevoegen</button>' +
      '</div>';

    html += '<div id="sList">' + renderVerkoopList(verkoop) + '</div>';
    root.innerHTML = html;

    $('#sAdd', root).addEventListener('click', () => editVerkoop());
    $('#sSearch', root).addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const filtered = verkoop.filter(s => JSON.stringify(s).toLowerCase().includes(q));
      $('#sList', root).innerHTML = renderVerkoopList(filtered);
      wireS();
    });
    wireS();

    function wireS() {
      $$('.bp-row-action.edit', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        editVerkoop(D.get('verkoop', id));
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        confirmModal('Verwijderen', 'Verkoop verwijderen?', () => {
          D.remove('verkoop', id); toast('Verwijderd', '', 'success'); navigate('verkoop');
        });
      }));
    }
  });

  function renderVerkoopList(verkoop) {
    if (verkoop.length === 0) return emptyState('fa-cash-register', 'Geen verkopen', 'Voeg een verkoop toe', 'Toevoegen', () => editVerkoop()).outerHTML;
    let html = '<div class="bp-card"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
      '<thead><tr><th>Datum</th><th>Product</th><th>Kanaal</th><th>Klant</th><th class="num">Inkoop</th><th class="num">Verkoop</th><th class="num">Kosten</th><th class="num">Winst</th><th class="num">Acties</th></tr></thead><tbody>';
    verkoop.forEach(s => {
      html += '<tr data-id="' + s.id + '">' +
        '<td>' + esc(s.date) + '</td>' +
        '<td class="strong">' + esc(s.product) + '</td>' +
        '<td><span class="bp-badge bp-badge-neutral">' + esc(s.channel || '-') + '</span></td>' +
        '<td class="muted">' + esc(s.customer || '-') + '</td>' +
        '<td class="num muted">' + D.fmtEuro(s.costPrice) + '</td>' +
        '<td class="num strong">' + D.fmtEuro(s.sellPrice) + '</td>' +
        '<td class="num muted">' + D.fmtEuro(s.costs || 0) + '</td>' +
        '<td class="num" style="color:var(--bp-success);font-weight:600">' + D.fmtEuro(s.profit) + '</td>' +
        '<td class="num"></td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    setTimeout(() => {
      $$('#sList tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        tr.querySelector('td:last-child').appendChild(actionBtns(
          () => editVerkoop(D.get('verkoop', id)),
          () => confirmModal('Verwijderen', 'Verkoop verwijderen?', () => { D.remove('verkoop', id); toast('Verwijderd', '', 'success'); navigate('verkoop'); })
        ));
      });
    }, 0);
    return html;
  }

  function editVerkoop(s) {
    const products = D.list('producten');
    const isNew = !s;
    if (!s) s = { date: new Date().toISOString().slice(0, 10), product: '', costPrice: 0, sellPrice: 0, costs: 0, profit: 0, channel: 'Marktplaats', customer: '', note: '' };
    let body = '<div class="bp-form-grid">' +
      '<div class="bp-field"><label class="bp-label">Datum <span class="req">*</span></label><input type="date" class="bp-input" id="sDate" value="' + esc(s.date) + '"></div>' +
      '<div class="bp-field"><label class="bp-label">Product <span class="req">*</span></label><select class="bp-select" id="sProduct"><option value="">— Kies —</option>' +
        products.map(p => '<option value="' + esc(p.name) + '" data-cost="' + p.costPrice + '">' + esc(p.name) + '</option>').join('') +
        '</select></div>' +
      '<div class="bp-field"><label class="bp-label">Kanaal</label><select class="bp-select" id="sChannel"><option>Marktplaats</option><option>Website</option><option>eBay</option><option>Direct</option><option>Anders</option></select></div>' +
      '<div class="bp-field"><label class="bp-label">Klant</label><input type="text" class="bp-input" id="sCustomer" value="' + esc(s.customer || '') + '"></div>' +
      '<div class="bp-field"><label class="bp-label">Inkoopprijs</label><div class="bp-input-group"><span class="bp-prefix">€</span><input type="number" step="0.01" id="sCost" value="' + esc(s.costPrice) + '"></div></div>' +
      '<div class="bp-field"><label class="bp-label">Verkoopprijs</label><div class="bp-input-group"><span class="bp-prefix">€</span><input type="number" step="0.01" id="sSell" value="' + esc(s.sellPrice) + '"></div></div>' +
      '<div class="bp-field"><label class="bp-label">Extra kosten</label><div class="bp-input-group"><span class="bp-prefix">€</span><input type="number" step="0.01" id="sCosts" value="' + esc(s.costs || 0) + '"></div></div>' +
      '<div class="bp-field"><label class="bp-label">Berekende winst</label><div class="bp-input-group"><span class="bp-prefix">€</span><input type="text" id="sProfit" readonly style="background:var(--bp-card-2);font-weight:600;color:var(--bp-success)"></div></div>' +
      '<div class="bp-field full"><label class="bp-label">Notitie</label><textarea class="bp-textarea" id="sNote">' + esc(s.note || '') + '</textarea></div>' +
      '</div>';
    openModal({
      title: isNew ? 'Nieuwe verkoop' : 'Verkoop bewerken', icon: 'fa-cash-register', large: true, body: body,
      footer: '<button class="bp-btn bp-btn-ghost" data-action="cancel">Annuleren</button><button class="bp-btn bp-btn-primary" data-action="save"><i class="fas fa-check"></i> Opslaan</button>',
      onMount: (m, close) => {
        const cost = m.querySelector('#sCost');
        const sell = m.querySelector('#sSell');
        const costs = m.querySelector('#sCosts');
        const profit = m.querySelector('#sProfit');
        function recalc() { profit.value = D.fmtEuro(D.parseNum(sell.value) - D.parseNum(cost.value) - D.parseNum(costs.value)).replace('€ ', ''); }
        cost.addEventListener('input', recalc); sell.addEventListener('input', recalc); costs.addEventListener('input', recalc);
        m.querySelector('#sProduct').addEventListener('change', e => {
          const opt = e.target.selectedOptions[0];
          if (opt && opt.dataset.cost) { cost.value = opt.dataset.cost; recalc(); }
        });
        // pre-select
        if (s.product) Array.from(m.querySelector('#sProduct').options).forEach(o => { if (o.value === s.product) o.selected = true; });
        if (s.channel) Array.from(m.querySelector('#sChannel').options).forEach(o => { if (o.value === s.channel) o.selected = true; });
        recalc();

        m.querySelector('[data-action="cancel"]').addEventListener('click', close);
        m.querySelector('[data-action="save"]').addEventListener('click', () => {
          const data = {
            date: m.querySelector('#sDate').value,
            product: m.querySelector('#sProduct').value,
            channel: m.querySelector('#sChannel').value,
            customer: m.querySelector('#sCustomer').value,
            costPrice: D.parseNum(cost.value),
            sellPrice: D.parseNum(sell.value),
            costs: D.parseNum(costs.value),
            profit: D.parseNum(sell.value) - D.parseNum(cost.value) - D.parseNum(costs.value),
            note: m.querySelector('#sNote').value
          };
          if (!data.date || !data.product) { toast('Fout', 'Datum en product zijn verplicht', 'error'); return; }
          if (isNew) {
            D.add('verkoop', data);
            // increment sold count + reduce stock
            const p = products.find(x => x.name === data.product);
            if (p) {
              D.update('producten', p.id, { sold: (parseInt(p.sold, 10) || 0) + 1 });
              const v = D.list('voorraad').find(x => x.productId === p.id);
              if (v) D.update('voorraad', v.id, { stock: Math.max(0, (parseInt(v.stock, 10) || 0) - 1) });
            }
          } else D.update('verkoop', s.id, data);
          toast('Opgeslagen', '', 'success'); close(); navigate('verkoop');
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: CATALOGUS
  // ═══════════════════════════════════════════════════════
  view('catalogus', function (root) {
    const cat = D.buildCatalogus();
    let html = '<div class="bp-filter-bar">' +
      '<div class="bp-search-inline"><i class="fas fa-search"></i><input type="text" id="cSearch" placeholder="Zoek in catalogus…"></div>' +
      '<select class="bp-filter-select" id="cStatus"><option value="">Alle statussen</option><option>Op voorraad</option><option>Laag</option><option>Uitverkocht</option></select>' +
      '</div>';
    html += '<div id="cList">' + renderCatalogus(cat) + '</div>';
    root.innerHTML = html;
    function filter() {
      const q = ($('#cSearch', root).value || '').toLowerCase();
      const st = $('#cStatus', root).value;
      const f = cat.filter(c => (!q || c.name.toLowerCase().includes(q)) && (!st || c.status === st));
      $('#cList', root).innerHTML = renderCatalogus(f);
    }
    $('#cSearch', root).addEventListener('input', filter);
    $('#cStatus', root).addEventListener('change', filter);
  });

  function renderCatalogus(cat) {
    if (cat.length === 0) return emptyState('fa-book', 'Geen producten', 'Voeg producten toe in de Producten-view', null, null).outerHTML;
    let html = '<div class="bp-card"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
      '<thead><tr><th>Product</th><th>Categorie</th><th class="num">Voorraad</th><th class="num">Inkoop</th><th class="num">Verkoop</th><th class="num">Verkocht</th><th class="num">Gerealiseerde Winst</th><th>Laatste Verkoop</th><th>Status</th></tr></thead><tbody>';
    cat.forEach(c => {
      html += '<tr>' +
        '<td class="strong">' + esc(c.name) + '</td>' +
        '<td class="muted">' + esc(c.category) + '</td>' +
        '<td class="num">' + D.fmtNum(c.stock) + '</td>' +
        '<td class="num muted">' + D.fmtEuro(c.costPrice) + '</td>' +
        '<td class="num strong">' + D.fmtEuro(c.avgSellPrice) + '</td>' +
        '<td class="num">' + D.fmtNum(c.totalSold) + '</td>' +
        '<td class="num" style="color:var(--bp-success);font-weight:600">' + D.fmtEuro(c.totalProfit) + '</td>' +
        '<td class="muted">' + esc(c.lastSale || '-') + '</td>' +
        '<td>' + statusBadge(c.status) + '</td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    return html;
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: KLANTEN
  // ═══════════════════════════════════════════════════════
  view('klanten', function (root) {
    const klanten = D.list('klanten');
    let html = '<div class="bp-filter-bar">' +
      '<div class="bp-search-inline"><i class="fas fa-search"></i><input type="text" id="kSearch" placeholder="Zoek klant…"></div>' +
      '<button class="bp-btn bp-btn-primary" id="kAdd"><i class="fas fa-plus"></i> Klant toevoegen</button>' +
      '</div>';
    html += '<div id="kList">' + renderKlantenList(klanten) + '</div>';
    root.innerHTML = html;
    $('#kAdd', root).addEventListener('click', () => editKlant());
    $('#kSearch', root).addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      $('#kList', root).innerHTML = renderKlantenList(klanten.filter(k => k.name.toLowerCase().includes(q)));
      wireK();
    });
    wireK();
    function wireK() {
      $$('.bp-row-action.edit', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        editKlant(D.get('klanten', id));
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        confirmModal('Verwijderen', 'Klant verwijderen?', () => { D.remove('klanten', id); toast('Verwijderd', '', 'success'); navigate('klanten'); });
      }));
    }
  });

  function renderKlantenList(klanten) {
    if (klanten.length === 0) return emptyState('fa-users', 'Geen klanten', 'Voeg je eerste klant toe', 'Toevoegen', () => editKlant()).outerHTML;
    let html = '<div class="bp-card"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
      '<thead><tr><th>Klant</th><th>Contact</th><th>Adres</th><th class="num">Orders</th><th class="num">Totaal besteed</th><th>Status</th><th class="num">Acties</th></tr></thead><tbody>';
    klanten.forEach(k => {
      const initials = (k.name || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();
      html += '<tr data-id="' + k.id + '">' +
        '<td><div style="display:flex;align-items:center;gap:0.6rem"><div class="bp-avatar">' + esc(initials) + '</div><div><div class="strong">' + esc(k.name) + '</div><div class="faint" style="font-size:0.75rem">' + esc(k.date) + '</div></div></div></td>' +
        '<td class="muted">' + esc(k.email || k.phone || '-') + '</td>' +
        '<td class="muted">' + esc(k.address || '-') + '</td>' +
        '<td class="num">' + D.fmtNum(k.orders || 0) + '</td>' +
        '<td class="num strong">' + D.fmtEuro(k.totalSpent || 0) + '</td>' +
        '<td>' + statusBadge(k.status || 'Actief') + '</td>' +
        '<td class="num"></td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    setTimeout(() => {
      $$('#kList tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        tr.querySelector('td:last-child').appendChild(actionBtns(
          () => editKlant(D.get('klanten', id)),
          () => confirmModal('Verwijderen', 'Klant verwijderen?', () => { D.remove('klanten', id); toast('Verwijderd', '', 'success'); navigate('klanten'); })
        ));
      });
    }, 0);
    return html;
  }

  function editKlant(k) {
    const isNew = !k;
    const fields = [
      { key: 'name', label: 'Naam', required: true, full: true },
      { key: 'email', label: 'E-mail', type: 'email' },
      { key: 'phone', label: 'Telefoon' },
      { key: 'address', label: 'Adres / Postcode' },
      { key: 'orders', label: 'Aantal orders', type: 'number', default: 0 },
      { key: 'totalSpent', label: 'Totaal besteed', type: 'euro' },
      { key: 'status', label: 'Status', type: 'select', options: ['Actief', 'Inactief', 'Geblokkeerd'] },
      { key: 'note', label: 'Notitie', type: 'textarea', full: true }
    ];
    formModal(isNew ? 'Nieuwe klant' : 'Klant bewerken', 'fa-user', fields, (data, close) => {
      if (!data.name) { toast('Fout', 'Naam is verplicht', 'error'); return; }
      if (isNew) { data.date = new Date().toISOString().slice(0, 10); D.add('klanten', data); }
      else D.update('klanten', k.id, data);
      toast('Opgeslagen', '', 'success'); close(); navigate('klanten');
    }, k || {});
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: TRACKING
  // ═══════════════════════════════════════════════════════
  view('tracking', function (root) {
    const tracking = D.list('tracking');
    let html = '<div class="bp-filter-bar">' +
      '<div class="bp-search-inline"><i class="fas fa-search"></i><input type="text" id="tSearch" placeholder="Zoek zending…"></div>' +
      '<button class="bp-btn bp-btn-primary" id="tAdd"><i class="fas fa-plus"></i> Zending toevoegen</button>' +
      '</div>';
    html += '<div id="tList">' + renderTrackingList(tracking) + '</div>';
    root.innerHTML = html;
    $('#tAdd', root).addEventListener('click', () => editTracking());
    $('#tSearch', root).addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      $('#tList', root).innerHTML = renderTrackingList(tracking.filter(t => JSON.stringify(t).toLowerCase().includes(q)));
      wireT();
    });
    wireT();
    function wireT() {
      $$('.bp-row-action.edit', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        editTracking(D.get('tracking', id));
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        confirmModal('Verwijderen', 'Zending verwijderen?', () => { D.remove('tracking', id); toast('Verwijderd', '', 'success'); navigate('tracking'); });
      }));
    }
  });

  function renderTrackingList(tracking) {
    if (tracking.length === 0) return emptyState('fa-truck', 'Geen zendingen', 'Voeg een zending toe om te tracken', 'Toevoegen', () => editTracking()).outerHTML;
    let html = '<div class="bp-card"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
      '<thead><tr><th>Datum</th><th>Product</th><th>Klant</th><th>Tracking</th><th>Status</th><th class="num">Acties</th></tr></thead><tbody>';
    tracking.forEach(t => {
      html += '<tr data-id="' + t.id + '">' +
        '<td>' + esc(t.date) + '</td>' +
        '<td class="strong">' + esc(t.product) + '</td>' +
        '<td class="muted">' + esc(t.customer) + '</td>' +
        '<td>' + (t.trackingUrl ? '<a href="' + esc(t.trackingUrl) + '" target="_blank" class="bp-link"><i class="fas fa-external-link-alt"></i> Volgen</a>' : '-') + '</td>' +
        '<td>' + statusBadge(t.status) + '</td>' +
        '<td class="num"></td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    setTimeout(() => {
      $$('#tList tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        tr.querySelector('td:last-child').appendChild(actionBtns(
          () => editTracking(D.get('tracking', id)),
          () => confirmModal('Verwijderen', 'Zending verwijderen?', () => { D.remove('tracking', id); toast('Verwijderd', '', 'success'); navigate('tracking'); })
        ));
      });
    }, 0);
    return html;
  }

  function editTracking(t) {
    const isNew = !t;
    const fields = [
      { key: 'date', label: 'Datum', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
      { key: 'product', label: 'Product', required: true, full: true },
      { key: 'customer', label: 'Klant', full: true },
      { key: 'trackingUrl', label: 'Tracking URL', full: true, placeholder: 'https://jouw.postnl.nl/...' },
      { key: 'status', label: 'Status', type: 'select', options: ['In verzending', 'Onderweg', 'Bezorgd', 'Retourneerd', 'Verloren'] }
    ];
    formModal(isNew ? 'Nieuwe zending' : 'Zending bewerken', 'fa-truck', fields, (data, close) => {
      if (!data.product) { toast('Fout', 'Product is verplicht', 'error'); return; }
      if (isNew) D.add('tracking', data);
      else D.update('tracking', t.id, data);
      toast('Opgeslagen', '', 'success'); close(); navigate('tracking');
    }, t || {});
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: MARKTPLAATS
  // ═══════════════════════════════════════════════════════
  view('marktplaats', function (root) {
    const mp = D.list('marktplaats');
    const sold = mp.filter(m => m.status === 'Verkocht');
    const revenue = sold.reduce((a, m) => a + D.parseNum(m.price) * D.parseNum(m.qty), 0);
    let html = '<div class="bp-kpi-grid" style="margin-bottom:1rem">';
    html += kpiCard('Advertenties', D.fmtNum(mp.length), 'fa-tag', 'primary');
    html += kpiCard('Verkocht', D.fmtNum(sold.length), 'fa-check-circle', 'success');
    html += kpiCard('Omzet Marktplaats', D.fmtEuro(revenue), 'fa-euro-sign', 'info');
    html += '</div>';
    html += '<div class="bp-filter-bar">' +
      '<button class="bp-btn bp-btn-primary" id="mAdd"><i class="fas fa-plus"></i> Advertentie toevoegen</button>' +
      '</div>';
    html += '<div id="mList">' + renderMpList(mp) + '</div>';
    root.innerHTML = html;
    $('#mAdd', root).addEventListener('click', () => editMp());
    wireM();
    function wireM() {
      $$('.bp-row-action.edit', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        editMp(D.get('marktplaats', id));
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        confirmModal('Verwijderen', 'Advertentie verwijderen?', () => { D.remove('marktplaats', id); toast('Verwijderd', '', 'success'); navigate('marktplaats'); });
      }));
    }
  });

  function renderMpList(mp) {
    if (mp.length === 0) return emptyState('fa-tag', 'Geen advertenties', 'Plaats je eerste Marktplaats advertentie', 'Toevoegen', () => editMp()).outerHTML;
    let html = '<div class="bp-card"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
      '<thead><tr><th>Datum</th><th>Product</th><th class="num">Prijs</th><th class="num">Aantal</th><th class="num">Totaal</th><th>URL</th><th>Status</th><th class="num">Acties</th></tr></thead><tbody>';
    mp.forEach(m => {
      const total = D.parseNum(m.price) * D.parseNum(m.qty);
      html += '<tr data-id="' + m.id + '">' +
        '<td>' + esc(m.date) + '</td>' +
        '<td class="strong">' + esc(m.product) + '</td>' +
        '<td class="num">' + D.fmtEuro(m.price) + '</td>' +
        '<td class="num">' + D.fmtNum(m.qty) + '</td>' +
        '<td class="num strong">' + D.fmtEuro(total) + '</td>' +
        '<td>' + (m.url ? '<a href="' + esc(m.url) + '" target="_blank" class="bp-link"><i class="fas fa-external-link-alt"></i></a>' : '-') + '</td>' +
        '<td>' + statusBadge(m.status) + '</td>' +
        '<td class="num"></td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    setTimeout(() => {
      $$('#mList tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        tr.querySelector('td:last-child').appendChild(actionBtns(
          () => editMp(D.get('marktplaats', id)),
          () => confirmModal('Verwijderen', 'Advertentie verwijderen?', () => { D.remove('marktplaats', id); toast('Verwijderd', '', 'success'); navigate('marktplaats'); })
        ));
      });
    }, 0);
    return html;
  }

  function editMp(m) {
    const isNew = !m;
    const fields = [
      { key: 'date', label: 'Datum', type: 'date', default: new Date().toISOString().slice(0, 10) },
      { key: 'product', label: 'Product', required: true, full: true },
      { key: 'price', label: 'Prijs', type: 'euro' },
      { key: 'qty', label: 'Aantal', type: 'number', default: 1 },
      { key: 'url', label: 'Advertentie URL', full: true, placeholder: 'https://www.marktplaats.nl/...' },
      { key: 'status', label: 'Status', type: 'select', options: ['Actief', 'Verkocht', 'Verlopen', 'Verwijderd'] }
    ];
    formModal(isNew ? 'Nieuwe advertentie' : 'Advertentie bewerken', 'fa-tag', fields, (data, close) => {
      if (!data.product) { toast('Fout', 'Product is verplicht', 'error'); return; }
      if (isNew) D.add('marktplaats', data);
      else D.update('marktplaats', m.id, data);
      toast('Opgeslagen', '', 'success'); close(); navigate('marktplaats');
    }, m || {});
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: BIEDINGEN (bids from customers)
  // ═══════════════════════════════════════════════════════
  view('biedingen', function (root) {
    // Read bids from Firebase (via LagencoDB cache)
    let bids = (window.LagencoDB && window.LagencoDB.isConfigured) ? window.LagencoDB.getBids() : [];

    // Sort: newest first
    bids.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = bids.length;
    const pending = bids.filter(b => (b.status || 'in_afwachting') === 'in_afwachting').length;
    const accepted = bids.filter(b => b.status === 'geaccepteerd').length;
    const rejected = bids.filter(b => b.status === 'afgewezen').length;
    const totalBidValue = bids.reduce((a, b) => a + D.parseNum(b.amount), 0);
    const highestBid = bids.reduce((a, b) => Math.max(a, D.parseNum(b.amount)), 0);

    let html = '<div class="bp-kpi-grid" style="margin-bottom:1rem">';
    html += kpiCard('Totaal biedingen', D.fmtNum(total), 'fa-gavel', 'primary');
    html += kpiCard('In afwachting', D.fmtNum(pending), 'fa-clock', pending > 0 ? 'warn' : 'success');
    html += kpiCard('Geaccepteerd', D.fmtNum(accepted), 'fa-check', 'success');
    html += kpiCard('Afgewezen', D.fmtNum(rejected), 'fa-times', 'danger');
    html += kpiCard('Totale bodwaarde', D.fmtEuro(totalBidValue), 'fa-euro-sign', 'info');
    html += kpiCard('Hoogste bod', D.fmtEuro(highestBid), 'fa-arrow-trend-up', 'violet');
    html += '</div>';

    // Filter buttons
    html += '<div class="bp-filter-bar">' +
      '<select class="bp-select" id="bidFilter" style="min-width:200px">' +
        '<option value="all">Alle biedingen (' + total + ')</option>' +
        '<option value="in_afwachting">In afwachting (' + pending + ')</option>' +
        '<option value="geaccepteerd">Geaccepteerd (' + accepted + ')</option>' +
        '<option value="afgewezen">Afgewezen (' + rejected + ')</option>' +
      '</select>' +
      '<input type="text" class="bp-input" id="bidSearch" placeholder="Zoek op naam, e-mail of product…" style="flex:1;max-width:400px">' +
      '</div>';

    html += '<div id="bidList">' + renderBidList(bids, 'all', '') + '</div>';
    root.innerHTML = html;

    // Wire filters
    function refilter() {
      const f = $('#bidFilter', root).value;
      const s = ($('#bidSearch', root).value || '').toLowerCase();
      $('#bidList', root).innerHTML = renderBidList(bids, f, s);
      wireBidActions();
    }
    $('#bidFilter', root).addEventListener('change', refilter);
    $('#bidSearch', root).addEventListener('input', refilter);
    wireBidActions();

    function wireBidActions() {
      $$('.bp-row-action.accept', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        const bid = bids.find(x => x.id === id);
        if (bid) openAcceptBidModal(bid);
      }));
      $$('.bp-row-action.reject', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        const bid = bids.find(x => x.id === id);
        if (bid) openRejectBidModal(bid);
      }));
      $$('.bp-row-action.view', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        const bid = bids.find(x => x.id === id);
        if (bid) showBidDetail(bid);
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        confirmModal('Verwijderen', 'Bod definitief verwijderen?', () => {
          removeBid(id);
          toast('Verwijderd', '', 'success');
          navigate('biedingen');
        });
      }));
    }

    // ─── Reject-bid flow: 2 choices (reject only / send rejection email) ───
    function openRejectBidModal(bid) {
      const body = '<div style="text-align:center;padding:.5rem 0 1rem">' +
        '<div style="width:3.5rem;height:3.5rem;margin:0 auto .875rem;background:var(--bp-danger-soft,#f8e4e1);border-radius:50%;display:flex;align-items:center;justify-content:center">' +
          '<i class="fas fa-times" style="font-size:1.3rem;color:var(--bp-danger,#b8453a)"></i>' +
        '</div>' +
        '<p style="font-size:.95rem;color:var(--bp-text,#1a1612);margin:0 0 .25rem">Je staat op het punt het bod van <strong>' + esc(bid.name) + '</strong> af te wijzen.</p>' +
        '<p style="font-size:.85rem;color:var(--bp-muted,#6b6258);margin:.25rem 0 0">Bedrag: <strong>€ ' + Number(bid.amount).toFixed(2) + '</strong> · ' + esc(bid.productTitle || '') + '</p>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:.625rem;margin-top:1rem">' +
          '<button class="bp-btn bp-btn-danger" data-action="email" style="padding:.875rem 1rem;justify-content:flex-start;text-align:left">' +
            '<i class="fas fa-envelope" style="margin-right:.625rem"></i>' +
            '<span><strong>Afwijzing mail sturen</strong><br><span style="font-size:.78rem;opacity:.85">Genereer een vriendelijke HTML e-mail met de afwijzing — direct in je mailprogramma te plakken</span></span>' +
          '</button>' +
          '<button class="bp-btn bp-btn-ghost" data-action="reject-only" style="padding:.875rem 1rem;justify-content:flex-start;text-align:left">' +
            '<i class="fas fa-times" style="margin-right:.625rem"></i>' +
            '<span><strong>Alleen afwijzen</strong><br><span style="font-size:.78rem;opacity:.85">Markeer als afgewezen zonder e-mail te sturen</span></span>' +
          '</button>' +
        '</div>';
      openModal({
        title: 'Bod afwijzen', icon: 'fa-times', large: true, body: body,
        footer: '<button class="bp-btn bp-btn-ghost" data-action="cancel">Annuleren</button>',
        onMount: (m, close) => {
          m.querySelector('[data-action="cancel"]').addEventListener('click', close);
          m.querySelector('[data-action="email"]').addEventListener('click', () => {
            close();
            openRejectionEmailModal(bid);
          });
          m.querySelector('[data-action="reject-only"]').addEventListener('click', () => {
            setBidStatus(bid.id, 'afgewezen');
            toast('Bod afgewezen', '', 'success');
            close();
            navigate('biedingen');
          });
        }
      });
    }

    // ─── Rejection email modal (similar to payment request modal) ───
    function openRejectionEmailModal(bid) {
      const body = '<div style="margin-bottom:1rem">' +
        '<label class="bp-label" style="display:block;margin-bottom:.4rem">Persoonlijke boodschap (optioneel)</label>' +
        '<textarea class="bp-textarea" id="rejectMsgInput" rows="3" placeholder="Bijv. Bedankt voor je bod. Helaas hebben we besloten het niet te accepteren. Blijf onze nieuwe producten volgen!" style="width:100%"></textarea>' +
        '<p style="font-size:.78rem;color:var(--bp-muted,#6b6258);margin:.4rem 0 0">Laat leeg om de standaardboodschap te gebruiken. De klant ontvangt een vriendelijke mail met de afwijzing.</p>' +
        '</div>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
          '<button class="bp-btn bp-btn-primary" id="genRejectEmailBtn"><i class="fas fa-magic"></i> Afwijzingsmail genereren</button>' +
        '</div>' +
        '<div id="emailPreviewWrap" style="display:none;margin-top:1.25rem">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;gap:.5rem;flex-wrap:wrap">' +
            '<p style="font-weight:600;margin:0;font-size:.875rem">E-mail preview</p>' +
            '<div style="display:flex;gap:.4rem;flex-wrap:wrap">' +
              '<button class="bp-btn bp-btn-success" id="copyRichBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-copy"></i> Kopieer (geformatteerd)</button>' +
              '<button class="bp-btn bp-btn-ghost" id="copyHtmlBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-code"></i> Kopieer HTML</button>' +
              '<button class="bp-btn bp-btn-ghost" id="downloadHtmlBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-download"></i> Download .html</button>' +
              '<button class="bp-btn bp-btn-ghost" id="mailtoBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-envelope"></i> Open in mail</button>' +
            '</div>' +
          '</div>' +
          '<div style="border:1px solid var(--bp-border,#e8dfcd);border-radius:.5rem;overflow:hidden;background:#fff">' +
            '<iframe id="emailPreviewIframe" style="width:100%;height:480px;border:0;display:block" sandbox="allow-same-origin"></iframe>' +
          '</div>' +
          '<p style="font-size:.78rem;color:var(--bp-muted,#6b6258);margin:.5rem 0 0"><i class="fas fa-info-circle"></i> Klik op "Kopieer (geformatteerd)" en plak (Ctrl+V) in Gmail/Outlook — opmaak blijft behouden.</p>' +
        '</div>';
      openModal({
        title: 'Afwijzingsmail sturen', icon: 'fa-envelope', large: true, body: body,
        footer:
          '<button class="bp-btn bp-btn-ghost" data-action="cancel">Annuleren</button>' +
          '<button class="bp-btn bp-btn-danger" data-action="reject-only"><i class="fas fa-times"></i> Toch alleen afwijzen</button>',
        onMount: (m, close) => {
          m.querySelector('[data-action="cancel"]').addEventListener('click', close);
          m.querySelector('[data-action="reject-only"]').addEventListener('click', () => {
            setBidStatus(bid.id, 'afgewezen');
            toast('Bod afgewezen', '', 'success');
            close();
            navigate('biedingen');
          });
          m.querySelector('#genRejectEmailBtn').addEventListener('click', () => {
            const rejectMsg = (m.querySelector('#rejectMsgInput').value || '').trim();
            const html = generateRejectionEmailHtml(bid, rejectMsg);

            const wrap = m.querySelector('#emailPreviewWrap');
            wrap.style.display = '';
            const iframe = m.querySelector('#emailPreviewIframe');
            iframe.srcdoc = html;

            m.querySelector('#copyRichBtn').addEventListener('click', () => copyRichHtml(html, rejectMsg, bid));
            m.querySelector('#copyHtmlBtn').addEventListener('click', () => copyPlainText(html));
            m.querySelector('#downloadHtmlBtn').addEventListener('click', () => downloadEmailHtml(html, bid));
            m.querySelector('#mailtoBtn').addEventListener('click', () => openRejectionMailto(bid, rejectMsg));

            setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
            toast('Afwijzingsmail gegenereerd', 'Klik op een knop om hem te kopiëren of te downloaden', 'success', 4000);
          });
        }
      });
    }

    // ─── Generate the REJECTION email HTML ───
    function generateRejectionEmailHtml(bid, customMsg) {
      const amountStr = '€ ' + Number(bid.amount).toFixed(2).replace('.', ',');
      const firstName = (bid.name || '').split(' ')[0] || 'erf';
      const msg = customMsg || 'Helaas is je bod dit keer niet geaccepteerd. Dit kan verschillende redenen hebben — mogelijk was er een hoger bod, of was de asking price hoger dan jouw bod. Blijf onze producten volgen, want er komen regelmatig nieuwe items bij!';

      return '' +
'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
'<html xmlns="http://www.w3.org/1999/xhtml">' +
'<head>' +
  '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
  '<title>Update over je bod — Lagenco</title>' +
'</head>' +
'<body style="margin:0;padding:0;background-color:#FFF8F0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Inter\',Roboto,Helvetica,Arial,sans-serif;color:#2D3A2E;">' +

  '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Update over je bod op ' + esc(bid.productTitle || 'ons product') + ' bij Lagenco.</div>' +

  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FFF8F0;padding:24px 12px;">' +
    '<tr>' +
      '<td align="center">' +

        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(26,22,18,0.05);">' +

          // Header
          '<tr>' +
            '<td style="background:linear-gradient(135deg,#6BBF7E 0%,#4A9D5E 100%);padding:28px 40px;text-align:center;">' +
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">' +
                '<tr>' +
                  '<td style="width:40px;height:40px;background:rgba(255,255,255,0.12);border-radius:12px;text-align:center;vertical-align:middle;">' +
                    '<span style="font-size:22px;line-height:40px;color:#FFFFFF;font-weight:700;font-family:Georgia,serif;">L</span>' +
                  '</td>' +
                  '<td style="padding-left:12px;vertical-align:middle;">' +
                    '<span style="font-family:Georgia,\'Times New Roman\',serif;font-size:24px;font-weight:600;color:#FFFFFF;letter-spacing:-0.020em;">Lagenco</span>' +
                  '</td>' +
                '</tr>' +
              '</table>' +
            '</td>' +
          '</tr>' +

          // Accent strip (soft red)
          '<tr><td style="background:#E06055;height:4px;line-height:4px;font-size:4px;">&nbsp;</td></tr>' +

          // Body
          '<tr>' +
            '<td style="padding:40px;">' +

              // Badge: helaas
              '<p style="margin:0 0 16px 0;text-align:center;">' +
                '<span style="display:inline-block;padding:6px 14px;background-color:#FFE0DC;color:#E06055;border-radius:100px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Update over je bod</span>' +
              '</p>' +

              '<h1 style="margin:0 0 12px 0;font-family:Georgia,\'Times New Roman\',serif;font-size:28px;font-weight:600;color:#2D3A2E;text-align:center;letter-spacing:-0.025em;line-height:1.2;">' +
                'Hoi ' + esc(firstName) + ',<br/>bedankt voor je bod' +
              '</h1>' +

              '<p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:#6B7A6C;text-align:center;">' +
                'Jammer genoeg hebben we besloten je bod op <strong style="color:#2D3A2E;">' + esc(bid.productTitle || 'dit product') + '</strong> niet te accepteren. ' +
                'We waarderen je interesse en hopen je snel terug te zien op Lagenco.' +
              '</p>' +

              // Personal message
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">' +
                '<tr>' +
                  '<td style="padding:16px 20px;background-color:#FFF8F0;border-left:4px solid #E06055;border-radius:8px;">' +
                    '<p style="margin:0;font-size:14px;line-height:1.6;color:#6B7A6C;font-style:italic;">"' + esc(msg) + '"</p>' +
                    '<p style="margin:8px 0 0 0;font-size:12px;color:#A5B5A7;">— Lagenco</p>' +
                  '</td>' +
                '</tr>' +
              '</table>' +

              // Summary card
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FFF8F0;border:1px solid #FFE0CC;border-radius:12px;margin-bottom:28px;">' +
                '<tr>' +
                  '<td style="padding:20px 24px;text-align:center;">' +
                    '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#A5B5A7;letter-spacing:0.08em;text-transform:uppercase;">Jouw bod op dit product</p>' +
                    '<p style="margin:0 0 12px 0;font-size:22px;font-weight:700;color:#E06055;font-family:Georgia,serif;letter-spacing:-0.02em;">' + amountStr + '</p>' +
                    '<p style="margin:0;font-size:13px;color:#A5B5A7;">Helaas niet geaccepteerd</p>' +
                  '</td>' +
                '</tr>' +
              '</table>' +

              // CTA: see other products
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px;">' +
                '<tr>' +
                  '<td align="center">' +
                    '<a href="https://lagenco.nl/assortiment.html" target="_blank" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#6BBF7E 0%,#4A9D5E 100%);color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Inter\',Roboto,sans-serif;font-size:15px;font-weight:700;text-decoration:none;border-radius:100px;box-shadow:0 6px 20px rgba(107,191,126,0.30);letter-spacing:0.02em;">' +
                      'Bekijk andere producten →' +
                    '</a>' +
                  '</td>' +
                '</tr>' +
              '</table>' +

              '<p style="margin:0 0 28px 0;font-size:13px;color:#A5B5A7;text-align:center;">' +
                'Er komen regelmatig nieuwe producten bij — houd onze website in de gaten!' +
              '</p>' +

              // Divider
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">' +
                '<tr><td style="border-top:1px solid #FFE0CC;line-height:1px;font-size:1px;">&nbsp;</td></tr>' +
              '</table>' +

              // Why rejected?
              '<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#2D3A2E;letter-spacing:0.04em;text-transform:uppercase;">Waarom is mijn bod niet geaccepteerd?</h2>' +
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
                '<tr>' +
                  '<td style="vertical-align:top;padding:0 12px 8px 0;width:24px;">' +
                    '<span style="color:#A5B5A7;">•</span>' +
                  '</td>' +
                  '<td style="vertical-align:top;padding-bottom:8px;">' +
                    '<p style="margin:0;font-size:14px;line-height:1.5;color:#6B7A6C;">Er is mogelijk een hoger bod geplaatst</p>' +
                  '</td>' +
                '</tr>' +
                '<tr>' +
                  '<td style="vertical-align:top;padding:0 12px 8px 0;width:24px;">' +
                    '<span style="color:#A5B5A7;">•</span>' +
                  '</td>' +
                  '<td style="vertical-align:top;padding-bottom:8px;">' +
                    '<p style="margin:0;font-size:14px;line-height:1.5;color:#6B7A6C;">Het bod lag onder onze asking price</p>' +
                  '</td>' +
                '</tr>' +
                '<tr>' +
                  '<td style="vertical-align:top;padding:0 12px 0 0;width:24px;">' +
                    '<span style="color:#A5B5A7;">•</span>' +
                  '</td>' +
                  '<td style="vertical-align:top;">' +
                    '<p style="margin:0;font-size:14px;line-height:1.5;color:#6B7A6C;">Het product is inmiddels aan iemand anders verkocht</p>' +
                  '</td>' +
                '</tr>' +
              '</table>' +

            '</td>' +
          '</tr>' +

          // Footer
          '<tr>' +
            '<td style="background-color:#FFF8F0;padding:28px 40px;border-top:1px solid #FFE0CC;">' +
              '<p style="margin:0 0 8px 0;font-size:13px;color:#6B7A6C;text-align:center;">' +
                'Vragen? Reply op deze mail of stuur een mail naar <a href="mailto:info@lagenco.nl" style="color:#6BBF7E;font-weight:600;">info@lagenco.nl</a>' +
              '</p>' +
              '<p style="margin:0 0 16px 0;font-size:12px;color:#A5B5A7;text-align:center;">' +
                'Lagenco · Kwaliteit verdient een tweede kans' +
              '</p>' +
              '<p style="margin:0;font-size:11px;color:#A5B5A7;text-align:center;line-height:1.5;">' +
                'Je ontvangt deze mail omdat je een bod hebt geplaatst op Lagenco.<br/>' +
                '<a href="#" style="color:#A5B5A7;">Algemene voorwaarden</a> · <a href="#" style="color:#A5B5A7;">Privacybeleid</a>' +
              '</p>' +
            '</td>' +
          '</tr>' +

        '</table>' +

        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">' +
          '<tr><td style="height:24px;line-height:24px;font-size:24px;">&nbsp;</td></tr>' +
        '</table>' +

      '</td>' +
    '</tr>' +
  '</table>' +
'</body>' +
'</html>';
    }

    function openRejectionMailto(bid, customMsg) {
      const subject = 'Update over je bod — ' + (bid.productTitle || 'Lagenco');
      const msg = customMsg || 'Helaas is je bod dit keer niet geaccepteerd. Blijf onze producten volgen!';
      const body = 'Beste ' + (bid.name || '') + ',\n\n' +
        'Bedankt voor je bod op ' + (bid.productTitle || 'ons product') + '.\n' +
        'Bedrag: € ' + Number(bid.amount).toFixed(2).replace('.', ',') + '\n\n' +
        msg + '\n\n' +
        'Bekijk onze andere producten op https://lagenco.nl/assortiment.html\n\n' +
        'Met vriendelijke groet,\nLagenco';
      const mailto = 'mailto:' + encodeURIComponent(bid.email || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      window.location.href = mailto;
    }

    // ─── Payment reminder email modal (for accepted bids) ───
    function openReminderEmailModal(bid) {
      const body = '<div style="margin-bottom:1rem;padding:.875rem 1rem;background:var(--bp-warn-soft,#f5e6d3);border:1px solid rgba(192,132,87,0.25);border-radius:.5rem">' +
        '<div style="display:flex;gap:.625rem;align-items:flex-start">' +
          '<i class="fas fa-info-circle" style="color:var(--bp-warn,#FFB088);font-size:1rem;margin-top:.125rem"></i>' +
          '<div>' +
            '<p style="margin:0 0 .25rem;font-size:.85rem;color:var(--bp-text,#1a1612);font-weight:600">Herinnering voor niet-betaald bod</p>' +
            '<p style="margin:0;font-size:.78rem;color:var(--bp-muted,#6b6258);line-height:1.5">Dit bod is geaccepteerd op ' + esc(fmtBidDateNL(bid.updatedAt || bid.createdAt)) + '. Verstuur een vriendelijke herinnering om de klant aan te zetten tot betaling.</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:1rem">' +
        '<label class="bp-label" style="display:block;margin-bottom:.4rem">Betaallink (URL) <span style="color:#dc2626">*</span></label>' +
        '<input type="url" class="bp-input" id="reminderPayUrlInput" placeholder="https://betaal.mollie.com/..." style="width:100%">' +
        '<p style="font-size:.78rem;color:var(--bp-muted,#6b6258);margin:.4rem 0 0">Vul dezelfde betaallink in als in de oorspronkelijke acceptatiemail.</p>' +
      '</div>' +
      '<div style="margin-bottom:1rem">' +
        '<label class="bp-label" style="display:block;margin-bottom:.4rem">Persoonlijke boodschap (optioneel)</label>' +
        '<textarea class="bp-textarea" id="reminderMsgInput" rows="2" placeholder="Bijv. We hebben je bod geaccepteerd, maar de betaling is nog niet ontvangen. Graag zo snel mogelijk betalen!" style="width:100%"></textarea>' +
      '</div>' +
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
        '<button class="bp-btn bp-btn-primary" id="genReminderEmailBtn"><i class="fas fa-magic"></i> Herinneringsmail genereren</button>' +
      '</div>' +
      '<div id="emailPreviewWrap" style="display:none;margin-top:1.25rem">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;gap:.5rem;flex-wrap:wrap">' +
          '<p style="font-weight:600;margin:0;font-size:.875rem">E-mail preview</p>' +
          '<div style="display:flex;gap:.4rem;flex-wrap:wrap">' +
            '<button class="bp-btn bp-btn-success" id="copyRichBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-copy"></i> Kopieer (geformatteerd)</button>' +
            '<button class="bp-btn bp-btn-ghost" id="copyHtmlBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-code"></i> Kopieer HTML</button>' +
            '<button class="bp-btn bp-btn-ghost" id="downloadHtmlBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-download"></i> Download .html</button>' +
            '<button class="bp-btn bp-btn-ghost" id="mailtoBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-envelope"></i> Open in mail</button>' +
          '</div>' +
        '</div>' +
        '<div style="border:1px solid var(--bp-border,#e8dfcd);border-radius:.5rem;overflow:hidden;background:#fff">' +
          '<iframe id="emailPreviewIframe" style="width:100%;height:480px;border:0;display:block" sandbox="allow-same-origin"></iframe>' +
        '</div>' +
        '<p style="font-size:.78rem;color:var(--bp-muted,#6b6258);margin:.5rem 0 0"><i class="fas fa-info-circle"></i> Klik op "Kopieer (geformatteerd)" en plak (Ctrl+V) in Gmail/Outlook — opmaak blijft behouden.</p>' +
      '</div>';
      openModal({
        title: 'Herinneringsmail sturen', icon: 'fa-bell', large: true, body: body,
        footer: '<button class="bp-btn bp-btn-ghost" data-action="cancel">Sluiten</button>',
        onMount: (m, close) => {
          m.querySelector('[data-action="cancel"]').addEventListener('click', close);
          m.querySelector('#genReminderEmailBtn').addEventListener('click', () => {
            const payUrl = (m.querySelector('#reminderPayUrlInput').value || '').trim();
            const reminderMsg = (m.querySelector('#reminderMsgInput').value || '').trim();
            if (!payUrl) { toast('Fout', 'Vul een betaallink in', 'error'); return; }
            if (!/^https?:\/\/.+/.test(payUrl)) { toast('Fout', 'Ongeldige URL — begin met http:// of https://', 'error'); return; }

            const html = generateReminderEmailHtml(bid, payUrl, reminderMsg);

            const wrap = m.querySelector('#emailPreviewWrap');
            wrap.style.display = '';
            const iframe = m.querySelector('#emailPreviewIframe');
            iframe.srcdoc = html;

            m.querySelector('#copyRichBtn').addEventListener('click', () => copyRichHtml(html, reminderMsg, bid));
            m.querySelector('#copyHtmlBtn').addEventListener('click', () => copyPlainText(html));
            m.querySelector('#downloadHtmlBtn').addEventListener('click', () => downloadEmailHtml(html, bid));
            m.querySelector('#mailtoBtn').addEventListener('click', () => openMailto(bid, payUrl, reminderMsg));

            setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
            toast('Herinneringsmail gegenereerd', 'Klik op een knop om hem te kopiëren of te downloaden', 'success', 4000);
          });
        }
      });
    }

    // ─── Generate the REMINDER email HTML ───
    function generateReminderEmailHtml(bid, payUrl, customMsg) {
      const amountStr = '€ ' + Number(bid.amount).toFixed(2).replace('.', ',');
      const firstName = (bid.name || '').split(' ')[0] || 'erf';
      const msg = customMsg || 'We hebben je bod geaccepteerd, maar we hebben nog geen betaling ontvangen. Graag vragen we je alsnog om de betaling te voltooien via de onderstaande knop. Bij vragen kun je altijd reageren op deze mail!';

      return '' +
'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
'<html xmlns="http://www.w3.org/1999/xhtml">' +
'<head>' +
  '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
  '<title>Vriendelijke herinnering — Lagenco</title>' +
'</head>' +
'<body style="margin:0;padding:0;background-color:#FFF8F0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Inter\',Roboto,Helvetica,Arial,sans-serif;color:#2D3A2E;">' +

  '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Vriendelijke herinnering: je bod op ' + esc(bid.productTitle || 'ons product') + ' is goedgekeurd — tijd om te betalen.</div>' +

  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FFF8F0;padding:24px 12px;">' +
    '<tr>' +
      '<td align="center">' +

        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(26,22,18,0.05);">' +

          // Header
          '<tr>' +
            '<td style="background:linear-gradient(135deg,#6BBF7E 0%,#4A9D5E 100%);padding:28px 40px;text-align:center;">' +
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">' +
                '<tr>' +
                  '<td style="width:40px;height:40px;background:rgba(255,255,255,0.12);border-radius:12px;text-align:center;vertical-align:middle;">' +
                    '<span style="font-size:22px;line-height:40px;color:#FFFFFF;font-weight:700;font-family:Georgia,serif;">L</span>' +
                  '</td>' +
                  '<td style="padding-left:12px;vertical-align:middle;">' +
                    '<span style="font-family:Georgia,\'Times New Roman\',serif;font-size:24px;font-weight:600;color:#FFFFFF;letter-spacing:-0.020em;">Lagenco</span>' +
                  '</td>' +
                '</tr>' +
              '</table>' +
            '</td>' +
          '</tr>' +

          // Accent strip (warm orange)
          '<tr><td style="background:#FFB088;height:4px;line-height:4px;font-size:4px;">&nbsp;</td></tr>' +

          // Body
          '<tr>' +
            '<td style="padding:40px;">' +

              // Badge: reminder
              '<p style="margin:0 0 16px 0;text-align:center;">' +
                '<span style="display:inline-block;padding:6px 14px;background-color:#FFF3CC;color:#FF8B5C;border-radius:100px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">⏰ Vriendelijke herinnering</span>' +
              '</p>' +

              '<h1 style="margin:0 0 12px 0;font-family:Georgia,\'Times New Roman\',serif;font-size:28px;font-weight:600;color:#2D3A2E;text-align:center;letter-spacing:-0.025em;line-height:1.2;">' +
                'Hoi ' + esc(firstName) + ',<br/>nog even betalen graag!' +
              '</h1>' +

              '<p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:#6B7A6C;text-align:center;">' +
                'We hebben je bod op <strong style="color:#2D3A2E;">' + esc(bid.productTitle || 'dit product') + '</strong> geaccepteerd, maar we hebben nog geen betaling ontvangen. ' +
                'Maak de betaling snel af, dan sturen we je product direct op weg.' +
              '</p>' +

              // Product summary card
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FFF8F0;border:1px solid #FFE0CC;border-radius:12px;margin-bottom:24px;">' +
                '<tr>' +
                  '<td style="padding:24px;text-align:center;">' +
                    '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#A5B5A7;letter-spacing:0.08em;text-transform:uppercase;">Product</p>' +
                    '<p style="margin:0 0 16px 0;font-size:16px;font-weight:600;color:#2D3A2E;line-height:1.4;">' + esc(bid.productTitle || 'Product') + '</p>' +
                    '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#A5B5A7;letter-spacing:0.08em;text-transform:uppercase;">Te betalen bedrag</p>' +
                    '<p style="margin:0;font-size:22px;font-weight:700;color:#FF8B5C;font-family:Georgia,serif;letter-spacing:-0.02em;">' + amountStr + '</p>' +
                  '</td>' +
                '</tr>' +
              '</table>' +

              // Personal message
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">' +
                '<tr>' +
                  '<td style="padding:16px 20px;background-color:#FFF3CC;border-left:4px solid #FFB088;border-radius:8px;">' +
                    '<p style="margin:0;font-size:14px;line-height:1.6;color:#FF8B5C;font-style:italic;">"' + esc(msg) + '"</p>' +
                    '<p style="margin:8px 0 0 0;font-size:12px;color:#A5B5A7;">— Lagenco</p>' +
                  '</td>' +
                '</tr>' +
              '</table>' +

              // CTA button
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px;">' +
                '<tr>' +
                  '<td align="center">' +
                    '<a href="' + esc(payUrl) + '" target="_blank" style="display:inline-block;padding:18px 48px;background:linear-gradient(135deg,#FFB088 0%,#FF8B5C 100%);color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Inter\',Roboto,sans-serif;font-size:16px;font-weight:700;text-decoration:none;border-radius:100px;box-shadow:0 6px 20px rgba(255,139,92,0.30);letter-spacing:0.02em;">' +
                      'Betaal nu ' + amountStr + ' →' +
                    '</a>' +
                  '</td>' +
                '</tr>' +
              '</table>' +

              '<p style="margin:0 0 28px 0;font-size:13px;color:#A5B5A7;text-align:center;">' +
                'Werkt de knop niet? Kopieer dan deze link in je browser:<br/>' +
                '<a href="' + esc(payUrl) + '" style="color:#FF8B5C;word-break:break-all;">' + esc(payUrl) + '</a>' +
              '</p>' +

              // Divider
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">' +
                '<tr><td style="border-top:1px solid #FFE0CC;line-height:1px;font-size:1px;">&nbsp;</td></tr>' +
              '</table>' +

              // Help section
              '<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#2D3A2E;letter-spacing:0.04em;text-transform:uppercase;">Vragen of hulp nodig?</h2>' +
              '<p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#6B7A6C;">' +
                'Liever toch afhalen? Of problemen met betalen? Reageer op deze mail of stuur een berichtje naar <a href="mailto:info@lagenco.nl" style="color:#6BBF7E;font-weight:600;">info@lagenco.nl</a> — we helpen je graag verder.' +
              '</p>' +

            '</td>' +
          '</tr>' +

          // Footer
          '<tr>' +
            '<td style="background-color:#FFF8F0;padding:28px 40px;border-top:1px solid #FFE0CC;">' +
              '<p style="margin:0 0 8px 0;font-size:13px;color:#6B7A6C;text-align:center;">' +
                'Vragen? Reply op deze mail of stuur een mail naar <a href="mailto:info@lagenco.nl" style="color:#6BBF7E;font-weight:600;">info@lagenco.nl</a>' +
              '</p>' +
              '<p style="margin:0 0 16px 0;font-size:12px;color:#A5B5A7;text-align:center;">' +
                'Lagenco · Kwaliteit verdient een tweede kans' +
              '</p>' +
              '<p style="margin:0;font-size:11px;color:#A5B5A7;text-align:center;line-height:1.5;">' +
                'Je ontvangt deze mail omdat je een bod hebt geplaatst op Lagenco.<br/>' +
                '<a href="#" style="color:#A5B5A7;">Algemene voorwaarden</a> · <a href="#" style="color:#A5B5A7;">Privacybeleid</a>' +
              '</p>' +
            '</td>' +
          '</tr>' +

        '</table>' +

        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">' +
          '<tr><td style="height:24px;line-height:24px;font-size:24px;">&nbsp;</td></tr>' +
        '</table>' +

      '</td>' +
    '</tr>' +
  '</table>' +
'</body>' +
'</html>';
    }

    // ─── Accept-bid flow: 2 choices (accept only / send payment request) ───
    function openAcceptBidModal(bid) {
      const body = '<div style="text-align:center;padding:.5rem 0 1rem">' +
        '<div style="width:3.5rem;height:3.5rem;margin:0 auto .875rem;background:var(--bp-success-soft,#dde9df);border-radius:50%;display:flex;align-items:center;justify-content:center">' +
          '<i class="fas fa-check" style="font-size:1.3rem;color:var(--bp-success,#0f3d2e)"></i>' +
        '</div>' +
        '<p style="font-size:.95rem;color:var(--bp-text,#1a1612);margin:0 0 .25rem">Je staat op het punt het bod van <strong>' + esc(bid.name) + '</strong> te accepteren.</p>' +
        '<p style="font-size:.85rem;color:var(--bp-muted,#6b6258);margin:.25rem 0 0">Bedrag: <strong style="color:var(--bp-success,#0f3d2e)">€ ' + Number(bid.amount).toFixed(2) + '</strong> · ' + esc(bid.productTitle || '') + '</p>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:.625rem;margin-top:1rem">' +
          '<button class="bp-btn bp-btn-success" data-action="pay" style="padding:.875rem 1rem;justify-content:flex-start;text-align:left">' +
            '<i class="fas fa-paper-plane" style="margin-right:.625rem"></i>' +
            '<span><strong>Betaalverzoek sturen</strong><br><span style="font-size:.78rem;opacity:.85">Genereer een mooie HTML e-mail met betaalknop die je direct in je mailprogramma kunt plakken</span></span>' +
          '</button>' +
          '<button class="bp-btn bp-btn-ghost" data-action="accept-only" style="padding:.875rem 1rem;justify-content:flex-start;text-align:left">' +
            '<i class="fas fa-check" style="margin-right:.625rem"></i>' +
            '<span><strong>Alleen accepteren</strong><br><span style="font-size:.78rem;opacity:.85">Markeer als geaccepteerd zonder e-mail te sturen</span></span>' +
          '</button>' +
        '</div>';
      openModal({
        title: 'Bod accepteren', icon: 'fa-check', large: true, body: body,
        footer: '<button class="bp-btn bp-btn-ghost" data-action="cancel">Annuleren</button>',
        onMount: (m, close) => {
          m.querySelector('[data-action="cancel"]').addEventListener('click', close);
          m.querySelector('[data-action="pay"]').addEventListener('click', () => {
            close();
            openPaymentRequestModal(bid);
          });
          m.querySelector('[data-action="accept-only"]').addEventListener('click', () => {
            setBidStatus(bid.id, 'geaccepteerd');
            toast('Bod geaccepteerd', '', 'success');
            close();
            navigate('biedingen');
          });
        }
      });
    }

    // ─── Payment request modal: enter payment URL, generate HTML email ───
    function openPaymentRequestModal(bid) {
      const body = '<div style="margin-bottom:1rem">' +
        '<label class="bp-label" style="display:block;margin-bottom:.4rem">Betaallink (URL) <span style="color:#dc2626">*</span></label>' +
        '<input type="url" class="bp-input" id="payUrlInput" placeholder="https://betaal.mollie.com/..." style="width:100%">' +
        '<p style="font-size:.78rem;color:var(--bp-muted,#6b6258);margin:.4rem 0 0">Plak hier de betaallink die je hebt aangemaakt bij je betaalprovider (Mollie, Stripe, etc.). Deze link komt in de e-mail als grote knop.</p>' +
        '</div>' +
        '<div style="margin-bottom:1rem">' +
        '<label class="bp-label" style="display:block;margin-bottom:.4rem">Persoonlijke boodschap (optioneel)</label>' +
        '<textarea class="bp-textarea" id="payMsgInput" rows="2" placeholder="Bijv. Bedankt voor je bod! Graag binnen 3 dagen betalen." style="width:100%"></textarea>' +
        '</div>' +
        '<div style="display:flex;gap:.5rem;flex-wrap:wrap">' +
          '<button class="bp-btn bp-btn-primary" id="genEmailBtn"><i class="fas fa-magic"></i> E-mail genereren</button>' +
        '</div>' +
        '<div id="emailPreviewWrap" style="display:none;margin-top:1.25rem">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;gap:.5rem;flex-wrap:wrap">' +
            '<p style="font-weight:600;margin:0;font-size:.875rem">E-mail preview</p>' +
            '<div style="display:flex;gap:.4rem;flex-wrap:wrap">' +
              '<button class="bp-btn bp-btn-success" id="copyRichBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-copy"></i> Kopieer (geformatteerd)</button>' +
              '<button class="bp-btn bp-btn-ghost" id="copyHtmlBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-code"></i> Kopieer HTML</button>' +
              '<button class="bp-btn bp-btn-ghost" id="downloadHtmlBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-download"></i> Download .html</button>' +
              '<button class="bp-btn bp-btn-ghost" id="mailtoBtn" style="padding:.5rem .75rem;font-size:.78rem"><i class="fas fa-envelope"></i> Open in mail</button>' +
            '</div>' +
          '</div>' +
          '<div style="border:1px solid var(--bp-border,#e8dfcd);border-radius:.5rem;overflow:hidden;background:#fff">' +
            '<iframe id="emailPreviewIframe" style="width:100%;height:480px;border:0;display:block" sandbox="allow-same-origin"></iframe>' +
          '</div>' +
          '<p style="font-size:.78rem;color:var(--bp-muted,#6b6258);margin:.5rem 0 0"><i class="fas fa-info-circle"></i> Klik op "Kopieer (geformatteerd)" en plak (Ctrl+V) in Gmail/Outlook — opmaak blijft behouden.</p>' +
        '</div>';
      openModal({
        title: 'Betaalverzoek sturen', icon: 'fa-paper-plane', large: true, body: body,
        footer:
          '<button class="bp-btn bp-btn-ghost" data-action="cancel">Annuleren</button>' +
          '<button class="bp-btn bp-btn-success" data-action="accept-only"><i class="fas fa-check"></i> Toch alleen accepteren</button>',
        onMount: (m, close) => {
          m.querySelector('[data-action="cancel"]').addEventListener('click', close);
          m.querySelector('[data-action="accept-only"]').addEventListener('click', () => {
            setBidStatus(bid.id, 'geaccepteerd');
            toast('Bod geaccepteerd', '', 'success');
            close();
            navigate('biedingen');
          });
          m.querySelector('#genEmailBtn').addEventListener('click', () => {
            const payUrl = (m.querySelector('#payUrlInput').value || '').trim();
            const payMsg = (m.querySelector('#payMsgInput').value || '').trim();
            if (!payUrl) { toast('Fout', 'Vul een betaallink in', 'error'); return; }
            if (!/^https?:\/\/.+/.test(payUrl)) { toast('Fout', 'Ongeldige URL — begin met http:// of https://', 'error'); return; }

            // Generate the HTML email
            const html = generatePaymentEmailHtml(bid, payUrl, payMsg);
            m._emailHtml = html;

            // Show preview
            const wrap = m.querySelector('#emailPreviewWrap');
            wrap.style.display = '';
            const iframe = m.querySelector('#emailPreviewIframe');
            iframe.srcdoc = html;

            // Wire copy/download/mailto buttons
            m.querySelector('#copyRichBtn').addEventListener('click', () => copyRichHtml(html, payMsg, bid));
            m.querySelector('#copyHtmlBtn').addEventListener('click', () => copyPlainText(html));
            m.querySelector('#downloadHtmlBtn').addEventListener('click', () => downloadEmailHtml(html, bid));
            m.querySelector('#mailtoBtn').addEventListener('click', () => openMailto(bid, payUrl, payMsg));

            // Scroll to preview
            setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
            toast('E-mail gegenereerd', 'Klik op een knop om hem te kopiëren of te downloaden', 'success', 4000);
          });
        }
      });
    }

    // ─── Generate the HTML email (inline styles, table-based for max compatibility) ───
    function generatePaymentEmailHtml(bid, payUrl, payMsg) {
      const amountStr = '€ ' + Number(bid.amount).toFixed(2).replace('.', ',');
      const askingStr = '€ ' + Number(bid.productPrice || 0).toFixed(2).replace('.', ',');
      const firstName = (bid.name || '').split(' ')[0] || 'erf';
      const personalMsg = payMsg ? payMsg : 'Bedankt voor je bod! We hebben hem goedgekeurd. Graag zo snel mogelijk betalen via de onderstaande knop, dan sturen we je product direct op weg.';

      return '' +
'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">' +
'<html xmlns="http://www.w3.org/1999/xhtml">' +
'<head>' +
  '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />' +
  '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
  '<title>Jouw bod is goedgekeurd — Lagenco</title>' +
'</head>' +
'<body style="margin:0;padding:0;background-color:#FFF8F0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Inter\',Roboto,Helvetica,Arial,sans-serif;color:#2D3A2E;">' +
  // Preheader (hidden)
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Goed nieuws! Je bod op ' + esc(bid.productTitle || 'ons product') + ' is goedgekeurd. Betaal nu via de link.</div>' +

  '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FFF8F0;padding:24px 12px;">' +
    '<tr>' +
      '<td align="center">' +
  // Email container
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(26,22,18,0.05);">' +
  // Header (logo)
          '<tr>' +
            '<td style="background:linear-gradient(135deg,#6BBF7E 0%,#4A9D5E 100%);padding:28px 40px;text-align:center;">' +
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
                '<tr>' +
                  '<td align="center" style="vertical-align:middle;">' +
                    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">' +
                      '<tr>' +
                        '<td style="width:40px;height:40px;background:rgba(255,255,255,0.12);border-radius:12px;text-align:center;vertical-align:middle;">' +
                          '<span style="font-size:22px;line-height:40px;color:#FFFFFF;font-weight:700;font-family:Georgia,serif;">L</span>' +
                        '</td>' +
                        '<td style="padding-left:12px;vertical-align:middle;">' +
                          '<span style="font-family:Georgia,\'Times New Roman\',serif;font-size:24px;font-weight:600;color:#FFFFFF;letter-spacing:-0.020em;">Lagenco</span>' +
                        '</td>' +
                      '</tr>' +
                    '</table>' +
                  '</td>' +
                '</tr>' +
              '</table>' +
            '</td>' +
          '</tr>' +
  // Top accent strip
          '<tr>' +
            '<td style="background:#FFB088;height:4px;line-height:4px;font-size:4px;">&nbsp;</td>' +
          '</tr>' +
  // Body
          '<tr>' +
            '<td style="padding:40px;">' +
  // Badge: goedgekeurd
              '<p style="margin:0 0 16px 0;text-align:center;">' +
                '<span style="display:inline-block;padding:6px 14px;background-color:#D5EDDA;color:#6BBF7E;border-radius:100px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">✓ Goedgekeurd</span>' +
              '</p>' +
  // Headline
              '<h1 style="margin:0 0 12px 0;font-family:Georgia,\'Times New Roman\',serif;font-size:28px;font-weight:600;color:#2D3A2E;text-align:center;letter-spacing:-0.025em;line-height:1.2;">' +
                'Hoi ' + esc(firstName) + ',<br/>je bod is goedgekeurd!' +
              '</h1>' +
  // Subtitle
              '<p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:#6B7A6C;text-align:center;">' +
                'Goed nieuws — de verkoper heeft je bod op <strong style="color:#2D3A2E;">' + esc(bid.productTitle || 'dit product') + '</strong> geaccepteerd. ' +
                'Maak de betaling af via de onderstaande knop en we sturen je product direct op weg.' +
              '</p>' +
  // Product card
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FFF8F0;border:1px solid #FFE0CC;border-radius:12px;margin-bottom:24px;">' +
                '<tr>' +
                  '<td style="padding:24px;">' +
                    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
                      '<tr>' +
                        '<td style="vertical-align:top;">' +
                          '<p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#A5B5A7;letter-spacing:0.08em;text-transform:uppercase;">Product</p>' +
                          '<p style="margin:0 0 16px 0;font-size:16px;font-weight:600;color:#2D3A2E;line-height:1.4;">' + esc(bid.productTitle || 'Product') + '</p>' +

                          '<table role="presentation" cellpadding="0" cellspacing="0" border="0">' +
                            '<tr>' +
                              '<td style="padding-right:24px;border-right:1px solid #FFD0B0;">' +
                                '<p style="margin:0 0 2px 0;font-size:11px;font-weight:700;color:#A5B5A7;letter-spacing:0.08em;text-transform:uppercase;">Jouw bod</p>' +
                                '<p style="margin:0;font-size:22px;font-weight:700;color:#6BBF7E;font-family:Georgia,serif;letter-spacing:-0.02em;">' + amountStr + '</p>' +
                              '</td>' +
                              '<td style="padding-left:24px;">' +
                                '<p style="margin:0 0 2px 0;font-size:11px;font-weight:700;color:#A5B5A7;letter-spacing:0.08em;text-transform:uppercase;">Asking price</p>' +
                                '<p style="margin:0;font-size:14px;color:#A5B5A7;text-decoration:line-through;">' + askingStr + '</p>' +
                              '</td>' +
                            '</tr>' +
                          '</table>' +

                        '</td>' +
                      '</tr>' +
                    '</table>' +
                  '</td>' +
                '</tr>' +
              '</table>' +
  // Personal message
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">' +
                '<tr>' +
                  '<td style="padding:16px 20px;background-color:#FFF3CC;border-left:4px solid #FFB088;border-radius:8px;">' +
                    '<p style="margin:0;font-size:14px;line-height:1.6;color:#FF8B5C;font-style:italic;">"' + esc(personalMsg) + '"</p>' +
                    '<p style="margin:8px 0 0 0;font-size:12px;color:#A5B5A7;">— Lagenco</p>' +
                  '</td>' +
                '</tr>' +
              '</table>' +
  // CTA button
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px;">' +
                '<tr>' +
                  '<td align="center">' +
                    '<a href="' + esc(payUrl) + '" target="_blank" style="display:inline-block;padding:18px 48px;background:linear-gradient(135deg,#FFB088 0%,#FF8B5C 100%);color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Inter\',Roboto,sans-serif;font-size:16px;font-weight:700;text-decoration:none;border-radius:100px;box-shadow:0 6px 20px rgba(255,139,92,0.30);letter-spacing:0.02em;">' +
                      'Betaal nu ' + amountStr + ' →' +
                    '</a>' +
                  '</td>' +
                '</tr>' +
              '</table>' +
  // Help text below button
              '<p style="margin:0 0 28px 0;font-size:13px;color:#A5B5A7;text-align:center;">' +
                'Werkt de knop niet? Kopieer dan deze link in je browser:<br/>' +
                '<a href="' + esc(payUrl) + '" style="color:#FF8B5C;word-break:break-all;">' + esc(payUrl) + '</a>' +
              '</p>' +
  // Divider
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">' +
                '<tr><td style="border-top:1px solid #FFE0CC;line-height:1px;font-size:1px;">&nbsp;</td></tr>' +
              '</table>' +
  // What is next
              '<h2 style="margin:0 0 14px 0;font-size:15px;font-weight:700;color:#2D3A2E;letter-spacing:0.04em;text-transform:uppercase;">Wat gebeurt er nu?</h2>' +
              '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
                '<tr>' +
                  '<td style="vertical-align:top;padding:0 12px 12px 0;width:24px;">' +
                    '<span style="display:inline-block;width:22px;height:22px;background-color:#D5EDDA;color:#6BBF7E;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;">1</span>' +
                  '</td>' +
                  '<td style="vertical-align:top;padding-bottom:12px;">' +
                    '<p style="margin:0;font-size:14px;line-height:1.5;color:#2D3A2E;"><strong>Betaal via de knop</strong> — liefst binnen 3 dagen</p>' +
                  '</td>' +
                '</tr>' +
                '<tr>' +
                  '<td style="vertical-align:top;padding:0 12px 12px 0;width:24px;">' +
                    '<span style="display:inline-block;width:22px;height:22px;background-color:#D5EDDA;color:#6BBF7E;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;">2</span>' +
                  '</td>' +
                  '<td style="vertical-align:top;padding-bottom:12px;">' +
                    '<p style="margin:0;font-size:14px;line-height:1.5;color:#2D3A2E;"><strong>Wij verzenden je product</strong> — ' + esc(bid.shippingMethod || 'Verzenden') + '</p>' +
                  '</td>' +
                '</tr>' +
                '<tr>' +
                  '<td style="vertical-align:top;padding:0 12px 0 0;width:24px;">' +
                    '<span style="display:inline-block;width:22px;height:22px;background-color:#D5EDDA;color:#6BBF7E;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;">3</span>' +
                  '</td>' +
                  '<td style="vertical-align:top;">' +
                    '<p style="margin:0;font-size:14px;line-height:1.5;color:#2D3A2E;"><strong>Track & trace</strong> — je ontvangt een e-mail met volgcode</p>' +
                  '</td>' +
                '</tr>' +
              '</table>' +

            '</td>' +
          '</tr>' +
  // Footer
          '<tr>' +
            '<td style="background-color:#FFF8F0;padding:28px 40px;border-top:1px solid #FFE0CC;">' +
              '<p style="margin:0 0 8px 0;font-size:13px;color:#6B7A6C;text-align:center;">' +
                'Vragen? Reply op deze mail of stuur een mail naar <a href="mailto:info@lagenco.nl" style="color:#6BBF7E;font-weight:600;">info@lagenco.nl</a>' +
              '</p>' +
              '<p style="margin:0 0 16px 0;font-size:12px;color:#A5B5A7;text-align:center;">' +
                'Lagenco · Kwaliteit verdient een tweede kans' +
              '</p>' +
              '<p style="margin:0;font-size:11px;color:#A5B5A7;text-align:center;line-height:1.5;">' +
                'Je ontvangt deze mail omdat je een bod hebt geplaatst op Lagenco.<br/>' +
                '<a href="#" style="color:#A5B5A7;">Algemene voorwaarden</a> · <a href="#" style="color:#A5B5A7;">Privacybeleid</a>' +
              '</p>' +
            '</td>' +
          '</tr>' +

        '</table>' +
  // Bottom spacer
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">' +
          '<tr><td style="height:24px;line-height:24px;font-size:24px;">&nbsp;</td></tr>' +
        '</table>' +

      '</td>' +
    '</tr>' +
  '</table>' +
'</body>' +
'</html>';
    }

    // ─── Copy rich HTML to clipboard (preserves formatting when pasted in Gmail/Outlook) ───
    function copyRichHtml(html, payMsg, bid) {
      try {
        const blob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob(['Beste ' + (bid.name || '') + ',\n\nJe bod op ' + (bid.productTitle || 'ons product') + ' is goedgekeurd.\nBetaal via deze link: ' + (payMsg || '') + '\n\nMet vriendelijke groet,\nLagenco'], { type: 'text/plain' });
        if (navigator.clipboard && window.ClipboardItem) {
          const item = new ClipboardItem({
            'text/html': blob,
            'text/plain': textBlob
          });
          navigator.clipboard.write([item]).then(() => {
            toast('Gekopieerd!', 'Plak nu in je mail (Ctrl+V) — opmaak blijft behouden', 'success', 5000);
          }).catch(() => fallbackCopyRich(html));
        } else {
          fallbackCopyRich(html);
        }
      } catch (e) {
        fallbackCopyRich(html);
      }
    }

    function fallbackCopyRich(html) {
      // Fallback: create a hidden div, select it, copy
      try {
        const div = document.createElement('div');
        div.innerHTML = html;
        div.style.position = 'fixed';
        div.style.left = '-9999px';
        div.style.top = '0';
        div.style.opacity = '0';
        document.body.appendChild(div);
        const range = document.createRange();
        range.selectNodeContents(div);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const ok = document.execCommand('copy');
        document.body.removeChild(div);
        if (ok) toast('Gekopieerd!', 'Plak nu in je mail (Ctrl+V) — opmaak blijft behouden', 'success', 5000);
        else toast('Kopiëren mislukt', 'Probeer de "Kopieer HTML" knop', 'error');
      } catch (e) {
        toast('Kopiëren mislukt', e.message, 'error');
      }
    }

    function copyPlainText(html) {
      try {
        navigator.clipboard.writeText(html).then(() => {
          toast('HTML gekopieerd', 'Broncode staat op je klembord — plak in een HTML-editor', 'success', 4000);
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = html;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast('HTML gekopieerd', 'Broncode staat op je klembord', 'success', 4000);
        });
      } catch (e) { toast('Kopiëren mislukt', e.message, 'error'); }
    }

    function downloadEmailHtml(html, bid) {
      try {
        const safeName = (bid.name || 'klant').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const safeProduct = (bid.productTitle || 'product').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const filename = 'betaalverzoek-' + safeName + '-' + safeProduct + '.html';
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('Gedownload', filename + ' opgeslagen', 'success', 4000);
      } catch (e) { toast('Download mislukt', e.message, 'error'); }
    }

    function openMailto(bid, payUrl, payMsg) {
      const subject = 'Jouw bod is goedgekeurd — ' + (bid.productTitle || 'Lagenco');
      const body = 'Beste ' + (bid.name || '') + ',\n\n' +
        'Goed nieuws! Je bod op ' + (bid.productTitle || 'ons product') + ' is goedgekeurd.\n' +
        'Bedrag: € ' + Number(bid.amount).toFixed(2).replace('.', ',') + '\n\n' +
        (payMsg ? payMsg + '\n\n' : '') +
        'Betaal via deze link:\n' + payUrl + '\n\n' +
        'Met vriendelijke groet,\nLagenco';
      const mailto = 'mailto:' + encodeURIComponent(bid.email || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      window.location.href = mailto;
    }

    function setBidStatus(id, status) {
      if (window.LagencoDB && window.LagencoDB.isConfigured) {
        window.LagencoDB.updateBidStatus(id, status);
      }
    }
    function removeBid(id) {
      if (window.LagencoDB && window.LagencoDB.isConfigured) {
        window.LagencoDB.deleteBid(id);
      }
    }

    function showBidDetail(bid) {
      const body = '<div class="bp-detail-grid">' +
        detailRow('Bieder', esc(bid.name)) +
        detailRow('E-mail', '<a href="mailto:' + esc(bid.email) + '">' + esc(bid.email) + '</a>') +
        detailRow('Telefoon', bid.phone ? esc(bid.phone) : '-') +
        detailRow('Product', esc(bid.productTitle || '-')) +
        detailRow('Asking price', D.fmtEuro(bid.productPrice || 0)) +
        detailRow('Bod', '<strong style="color:var(--green)">' + D.fmtEuro(bid.amount) + '</strong>') +
        detailRow('Verschil asking/bod', D.fmtEuro(D.parseNum(bid.amount) - D.parseNum(bid.productPrice))) +
        detailRow('Verzendmethode', esc(bid.shippingMethod || '-')) +
        detailRow('Adres', bid.fullAddress ? esc(bid.fullAddress) : '<em class="bp-muted">Alleen afhalen</em>') +
        detailRow('Bericht', bid.note ? esc(bid.note) : '<em class="bp-muted">Geen bericht</em>') +
        detailRow('Geplaatst op', esc(fmtBidDateNL(bid.createdAt))) +
        detailRow('Laatst bijgewerkt', bid.updatedAt ? esc(fmtBidDateNL(bid.updatedAt)) : '-') +
        detailRow('Status', statusBadge(bid.status === 'in_afwachting' ? 'In afwachting' : (bid.status === 'geaccepteerd' ? 'Goedgekeurd' : 'Afgewezen'))) +
        '</div>';
      openModal({
        title: 'Bod details', icon: 'fa-gavel', large: true, body: body,
        footer:
          '<button class="bp-btn bp-btn-ghost" data-action="close">Sluiten</button>' +
          (bid.status === 'geaccepteerd' ? '<button class="bp-btn bp-btn-primary" data-action="reminder"><i class="fas fa-bell"></i> Herinneringsmail</button>' : '') +
          (bid.status !== 'geaccepteerd' ? '<button class="bp-btn bp-btn-success" data-action="accept"><i class="fas fa-check"></i> Accepteren</button>' : '') +
          (bid.status !== 'afgewezen' ? '<button class="bp-btn bp-btn-danger" data-action="reject"><i class="fas fa-times"></i> Afwijzen</button>' : ''),
        onMount: (m, close) => {
          m.querySelector('[data-action="close"]').addEventListener('click', close);
          const acc = m.querySelector('[data-action="accept"]');
          if (acc) acc.addEventListener('click', () => { close(); openAcceptBidModal(bid); });
          const rej = m.querySelector('[data-action="reject"]');
          if (rej) rej.addEventListener('click', () => { close(); openRejectBidModal(bid); });
          const rem = m.querySelector('[data-action="reminder"]');
          if (rem) rem.addEventListener('click', () => { close(); openReminderEmailModal(bid); });
        }
      });
    }

    function detailRow(label, value) {
      return '<div class="bp-detail-row"><div class="bp-detail-label">' + esc(label) + '</div><div class="bp-detail-value">' + value + '</div></div>';
    }

    function fmtBidDateNL(iso) {
      try {
        const d = new Date(iso);
        return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) +
          ' · ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      } catch { return '-'; }
    }

    function renderBidList(allBids, filter, search) {
      let list = allBids;
      if (filter !== 'all') list = list.filter(b => (b.status || 'in_afwachting') === filter);
      if (search) {
        list = list.filter(b =>
          (b.name || '').toLowerCase().includes(search) ||
          (b.email || '').toLowerCase().includes(search) ||
          (b.productTitle || '').toLowerCase().includes(search) ||
          (b.city || '').toLowerCase().includes(search)
        );
      }
      if (!list.length) {
        return emptyState('fa-gavel', 'Geen biedingen', 'Er zijn nog geen biedingen geplaatst op je producten', '', null).outerHTML;
      }
      let h = '<div class="bp-card"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
        '<thead><tr><th>Datum</th><th>Product</th><th>Bieder</th><th>Contact</th><th class="num">Bod</th><th class="num">Asking</th><th>Verzend</th><th>Adres</th><th>Status</th><th class="num">Acties</th></tr></thead><tbody>';
      list.forEach(b => {
        const status = (b.status || 'in_afwachting');
        const statusLabel = status === 'geaccepteerd' ? 'Geaccepteerd' : status === 'afgewezen' ? 'Afgewezen' : 'In afwachting';
        const addrShort = b.fullAddress ? esc(b.fullAddress.length > 30 ? b.fullAddress.slice(0, 30) + '…' : b.fullAddress) : '<em class="bp-muted">Alleen afhalen</em>';
        h += '<tr data-id="' + esc(b.id) + '">' +
          '<td>' + esc(fmtBidDateNL(b.createdAt)) + '</td>' +
          '<td class="strong">' + esc(b.productTitle || '-') + '</td>' +
          '<td>' + esc(b.name) + '</td>' +
          '<td><div>' + esc(b.email) + '</div>' + (b.phone ? '<div class="bp-muted" style="font-size:.78rem">' + esc(b.phone) + '</div>' : '') + '</td>' +
          '<td class="num strong" style="color:var(--green)">' + D.fmtEuro(b.amount) + '</td>' +
          '<td class="num bp-muted">' + D.fmtEuro(b.productPrice || 0) + '</td>' +
          '<td><i class="fas ' + (b.shippingMethodKey === 'afhalen' ? 'fa-store' : 'fa-truck') + '"></i> ' + esc(b.shippingMethod || '-') + '</td>' +
          '<td style="max-width:200px">' + addrShort + '</td>' +
          '<td>' + statusBadge(statusLabel) + '</td>' +
          '<td class="num"></td></tr>';
      });
      h += '</tbody></table></div></div></div>';
      setTimeout(() => {
        $$('#bidList tr[data-id]').forEach(tr => {
          const id = tr.dataset.id;
          const bid = bids.find(x => x.id === id);
          if (!bid) return;
          const wrap = document.createElement('div');
          wrap.className = 'bp-row-actions';
          // View
          const vb = document.createElement('button');
          vb.className = 'bp-row-action view'; vb.title = 'Bekijken';
          vb.innerHTML = '<i class="fas fa-eye"></i>';
          vb.addEventListener('click', () => showBidDetail(bid));
          wrap.appendChild(vb);
          // Accept (only if not yet accepted)
          if (bid.status !== 'geaccepteerd') {
            const ab = document.createElement('button');
            ab.className = 'bp-row-action accept'; ab.title = 'Accepteren';
            ab.style.color = 'var(--green)';
            ab.innerHTML = '<i class="fas fa-check"></i>';
            ab.addEventListener('click', () => openAcceptBidModal(bid));
            wrap.appendChild(ab);
          }
          // Reject (only if not yet rejected)
          if (bid.status !== 'afgewezen') {
            const rb = document.createElement('button');
            rb.className = 'bp-row-action reject'; rb.title = 'Afwijzen';
            rb.style.color = '#dc2626';
            rb.innerHTML = '<i class="fas fa-times"></i>';
            rb.addEventListener('click', () => openRejectBidModal(bid));
            wrap.appendChild(rb);
          }
          // Reminder (only if accepted)
          if (bid.status === 'geaccepteerd') {
            const rmb = document.createElement('button');
            rmb.className = 'bp-row-action'; rmb.title = 'Herinneringsmail';
            rmb.style.color = 'var(--bp-warn,#FFB088)';
            rmb.innerHTML = '<i class="fas fa-bell"></i>';
            rmb.addEventListener('click', () => openReminderEmailModal(bid));
            wrap.appendChild(rmb);
          }
          // Delete
          const db = document.createElement('button');
          db.className = 'bp-row-action delete'; db.title = 'Verwijderen';
          db.innerHTML = '<i class="fas fa-trash"></i>';
          db.addEventListener('click', () => {
            confirmModal('Verwijderen', 'Bod definitief verwijderen?', () => {
              removeBid(id);
              toast('Verwijderd', '', 'success');
              navigate('biedingen');
            });
          });
          wrap.appendChild(db);
          tr.querySelector('td:last-child').appendChild(wrap);
        });
      }, 0);
      return h;
    }
  });

  // ═══════════════════════════════════════════════════════
  // VIEW: WHEEL SPIN COUPONS
  // ═══════════════════════════════════════════════════════
  view('coupons', function (root) {
    // Lees coupons uit Firebase (via LagencoDB cache)
    let coupons = (window.LagencoDB && window.LagencoDB.isConfigured) ? window.LagencoDB.getCoupons() : [];

    // Sorteer: nieuwste eerst
    coupons.sort((a, b) => new Date(b.wonAt) - new Date(a.wonAt));

    // Stats berekenen
    const total = coupons.length;
    const winners = coupons.filter(c => c.status !== 'geen_prijs');
    const used = coupons.filter(c => c.status === 'gebruikt');
    const unused = coupons.filter(c => c.status === 'ongebruikt');
    const noPrize = coupons.filter(c => c.status === 'geen_prijs');

    let html = '<div class="bp-kpi-grid" style="margin-bottom:1rem">';
    html += kpiCard('Totaal spins', D.fmtNum(total), 'fa-circle-notch', 'primary');
    html += kpiCard('Prijzen gewonnen', D.fmtNum(winners.length), 'fa-trophy', 'violet');
    html += kpiCard('Ongebruikt', D.fmtNum(unused.length), 'fa-circle', unused.length > 0 ? 'warn' : 'success');
    html += kpiCard('Gebruikt', D.fmtNum(used.length), 'fa-check-circle', 'success');
    html += kpiCard('Geen prijs', D.fmtNum(noPrize.length), 'fa-times-circle', 'info');
    html += '</div>';

    // Filter bar
    html += '<div class="bp-filter-bar">' +
      '<select class="bp-select" id="couponFilter" style="min-width:200px">' +
        '<option value="all">Alle coupons (' + total + ')</option>' +
        '<option value="ongebruikt">Ongebruikt (' + unused.length + ')</option>' +
        '<option value="gebruikt">Gebruikt (' + used.length + ')</option>' +
        '<option value="geen_prijs">Geen prijs (' + noPrize.length + ')</option>' +
      '</select>' +
      '<input type="text" class="bp-input" id="couponSearch" placeholder="Zoek op code, naam of e-mail…" style="flex:1;max-width:400px">' +
      '</div>';

    html += '<div id="couponList">' + renderCouponList(coupons, 'all', '') + '</div>';
    root.innerHTML = html;

    // Wire filters
    function refilter() {
      const f = $('#couponFilter', root).value;
      const s = ($('#couponSearch', root).value || '').toLowerCase();
      $('#couponList', root).innerHTML = renderCouponList(coupons, f, s);
      // Wire actions after a small delay (setTimeout 0 in renderCouponList adds buttons)
      setTimeout(() => wireCouponActions(), 50);
    }
    $('#couponFilter', root).addEventListener('change', refilter);
    $('#couponSearch', root).addEventListener('input', refilter);
    // Initial wire (after renderCouponList's setTimeout adds the buttons)
    setTimeout(() => wireCouponActions(), 50);

    function wireCouponActions() {
      // Mark as used / unmark
      $$('.coupon-mark-used', root).forEach(b => b.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const coupon = coupons.find(c => (c.code || c.id) === id);
        if (!coupon) return;
        if (coupon.status === 'ongebruikt') {
          coupon.status = 'gebruikt';
          coupon.usedAt = new Date().toISOString();
          if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.updateCouponStatus(coupon.code, 'gebruikt'); }
          toast('Coupon gemarkeerd als gebruikt', '', 'success');
          navigate('coupons');
        } else if (coupon.status === 'gebruikt') {
          coupon.status = 'ongebruikt';
          coupon.usedAt = null;
          if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.updateCouponStatus(coupon.code, 'ongebruikt'); }
          toast('Coupon teruggezet naar ongebruikt', '', 'success');
          navigate('coupons');
        }
      }));

      // Delete coupon
      $$('.coupon-delete', root).forEach(b => b.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const coupon = coupons.find(c => (c.code || c.id) === id);
        confirmModal('Verwijderen', 'Deze coupon definitief verwijderen?', () => {
          if (window.LagencoDB && window.LagencoDB.isConfigured && coupon) { window.LagencoDB.deleteCoupon(coupon.code); }
          toast('Coupon verwijderd', '', 'success');
          navigate('coupons');
        });
      }));

      // Copy code
      $$('.coupon-copy', root).forEach(b => b.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const code = e.currentTarget.dataset.code;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(code).then(() => toast('Code gekopieerd', '', 'success', 2000));
        } else {
          toast('Code: ' + code, 'info', 4000);
        }
      }));
    }

    function renderCouponList(allCoupons, filter, search) {
      let list = allCoupons;
      if (filter !== 'all') list = list.filter(c => c.status === filter);
      if (search) {
        list = list.filter(c =>
          (c.code || '').toLowerCase().includes(search) ||
          (c.winnerName || '').toLowerCase().includes(search) ||
          (c.winnerEmail || '').toLowerCase().includes(search) ||
          (c.label || '').toLowerCase().includes(search)
        );
      }
      if (!list.length) {
        return emptyState('fa-circle-notch', 'Nog geen spins', 'Bezoekers kunnen spins doen zodra je een wheel spin post plaatst in de community', '', null).outerHTML;
      }

      let h = '<div class="bp-card"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
        '<thead><tr><th>Datum</th><th>Prijs</th><th>Code</th><th>Winnaar</th><th>Contact</th><th>Status</th><th class="num">Acties</th></tr></thead><tbody>';
      list.forEach(c => {
        const code = c.code || '—';
        const codeDisplay = c.code
          ? '<code style="background:var(--bp-bg-2);padding:.2rem .5rem;border-radius:.25rem;font-family:monospace;font-size:.82rem;font-weight:700;color:var(--bp-primary)">' + esc(code) + '</code>'
          : '<span style="color:var(--bp-text-faint)">Geen code</span>';
        const winnerName = c.winnerName ? esc(c.winnerName) : '<span style="color:var(--bp-text-faint)">Onbekend</span>';
        const winnerContact = c.winnerEmail
          ? '<a href="mailto:' + esc(c.winnerEmail) + '" style="color:var(--bp-primary);text-decoration:none">' + esc(c.winnerEmail) + '</a>'
          : '<span style="color:var(--bp-text-faint)">—</span>';
        const statusLabel = c.status === 'ongebruikt' ? 'Ongebruikt' : c.status === 'gebruikt' ? 'Gebruikt' : 'Geen prijs';
        h += '<tr data-id="' + esc(c.code || c.id) + '">' +
          '<td>' + esc(fmtCouponDate(c.wonAt)) + '</td>' +
          '<td class="strong">' + esc(c.label || 'Onbekend') + '</td>' +
          '<td>' + codeDisplay + '</td>' +
          '<td>' + winnerName + '</td>' +
          '<td>' + winnerContact + '</td>' +
          '<td>' + statusBadge(statusLabel) + '</td>' +
          '<td class="num"></td></tr>';
      });
      h += '</tbody></table></div></div></div>';

      // Wire action buttons via setTimeout
      setTimeout(() => {
        $$('#couponList tr[data-id]').forEach(tr => {
          const id = tr.dataset.id;
          const coupon = coupons.find(c => (c.code || c.id) === id);
          if (!coupon) return;
          const wrap = document.createElement('div');
          wrap.className = 'bp-row-actions';

          // Copy code button (only if has code)
          if (coupon.code) {
            const cb = document.createElement('button');
            cb.className = 'bp-row-action coupon-copy'; cb.title = 'Kopieer code';
            cb.dataset.code = coupon.code;
            cb.style.color = 'var(--bp-info)';
            cb.innerHTML = '<i class="fas fa-copy"></i>';
            wrap.appendChild(cb);
          }

          // Mark as used / unused (only for prize coupons)
          if (coupon.status === 'ongebruikt' || coupon.status === 'gebruikt') {
            const mb = document.createElement('button');
            mb.className = 'bp-row-action coupon-mark-used';
            mb.dataset.id = id;
            mb.title = coupon.status === 'ongebruikt' ? 'Markeer als gebruikt' : 'Markeer als ongebruikt';
            mb.style.color = coupon.status === 'ongebruikt' ? 'var(--bp-success)' : 'var(--bp-warn)';
            mb.innerHTML = coupon.status === 'ongebruikt' ? '<i class="fas fa-check"></i>' : '<i class="fas fa-undo"></i>';
            wrap.appendChild(mb);
          }

          // Delete button
          const db = document.createElement('button');
          db.className = 'bp-row-action coupon-delete'; db.title = 'Verwijderen';
          db.dataset.id = id;
          db.innerHTML = '<i class="fas fa-trash"></i>';
          wrap.appendChild(db);

          tr.querySelector('td:last-child').appendChild(wrap);
        });
      }, 0);
      return h;
    }

    function fmtCouponDate(iso) {
      try {
        const d = new Date(iso);
        return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) +
          ' · ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      } catch { return '-'; }
    }
  });

  // ═══════════════════════════════════════════════════════
  // VIEW: WHEEL SPIN INSTELLINGEN
  // ═══════════════════════════════════════════════════════
  view('wheelsettings', function (root) {
    // Default wheel segments (matching website defaults)
    const DEFAULT_SEGMENTS = [
      { id: 'korting5', label: '€5 Korting', icon: '🎁', color: '#6BBF7E', textColor: '#fff', chance: 1, codePrefix: 'LAGENCO5-', title: 'Je hebt €5 korting gewonnen!', text: 'Gefeliciteerd! Je hebt een kortingscode van €5 gewonnen.', hasCode: true },
      { id: 'gratisretour', label: 'Gratis Retour', icon: '📦', color: '#FFB088', textColor: '#fff', chance: 0.5, codePrefix: 'GRATISRETOUR-', title: 'Je hebt een gratis retourproduct gewonnen!', text: 'Wow! Je hebt 1 gratis retourproduct van je keuze gewonnen.', hasCode: true },
      { id: 'gratisverzend', label: 'Gratis Verzending', icon: '🚚', color: '#FFD56B', textColor: '#2D3A2E', chance: 5, codePrefix: 'FREESHIP-', title: 'Je hebt gratis verzending gewonnen!', text: 'Leuk! Je hebt gratis verzending op je volgende bestelling gewonnen.', hasCode: true },
      { id: 'niks', label: 'Niks', icon: '😊', color: '#C5B6E5', textColor: '#fff', chance: 93.5, codePrefix: '', title: 'Helaas, geen prijs deze keer!', text: 'Geen zorgen — je kunt het altijd nog een keer proberen!', hasCode: false }
    ];

    // Load current settings from Firebase (via LagencoDB cache)
    let settings = (window.LagencoDB && window.LagencoDB.isConfigured) ? window.LagencoDB.getWheelSettings() : null;
    if (!settings || !settings.length) settings = JSON.parse(JSON.stringify(DEFAULT_SEGMENTS));

    // Stats
    const totalChance = settings.reduce((a, s) => a + (parseFloat(s.chance) || 0), 0);
    const totalSpins = (function() {
      try {
        const prizes = (window.LagencoDB && window.LagencoDB.isConfigured) ? window.LagencoDB.getCoupons() : [];
        return prizes.length;
      } catch (e) { return 0; }
    })();

    let html = '<div class="bp-kpi-grid" style="margin-bottom:1rem">';
    html += kpiCard('Totaal kansen', totalChance.toFixed(1) + '%', 'fa-percentage', totalChance === 100 ? 'success' : 'danger');
    html += kpiCard('Totaal spins', D.fmtNum(totalSpins), 'fa-circle-notch', 'info');
    html += kpiCard('Segmenten', D.fmtNum(settings.length), 'fa-pie-chart', 'primary');
    html += '</div>';

    if (Math.abs(totalChance - 100) > 0.1) {
      html += '<div style="background:var(--bp-danger-soft);border:1px solid rgba(224,96,85,0.30);border-radius:.5rem;padding:.75rem 1rem;margin-bottom:1rem;display:flex;gap:.625rem;align-items:flex-start">' +
        '<i class="fas fa-exclamation-triangle" style="color:var(--bp-danger);margin-top:.125rem"></i>' +
        '<div><p style="margin:0;font-size:.85rem;font-weight:600;color:var(--bp-danger)">Kansen tellen niet op tot 100%</p>' +
        '<p style="margin:.2rem 0 0;font-size:.78rem;color:var(--bp-text-muted)">Pas de kansen aan zodat ze samen exact 100% zijn. Nu: ' + totalChance.toFixed(1) + '%</p></div></div>';
    }

    // Reset section
    html += '<div class="bp-card" style="margin-bottom:1.25rem;padding:1.25rem">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">' +
        '<div>' +
          '<h3 style="margin:0 0 .25rem;font-size:1rem;font-weight:700;color:var(--bp-text)"><i class="fas fa-redo" style="margin-right:.5rem;color:var(--bp-warn)"></i>Alle spins resetten</h3>' +
          '<p style="margin:0;font-size:.82rem;color:var(--bp-text-muted)">Reset de spin-limiet voor alle bezoekers, zodat iedereen opnieuw kan draaien.</p>' +
        '</div>' +
        '<button class="bp-btn bp-btn-ghost" id="resetSpinsBtn" style="border-color:var(--bp-warn);color:var(--bp-warn)"><i class="fas fa-redo"></i> Reset alle spins</button>' +
      '</div>' +
    '</div>';

    // Settings form
    html += '<div class="bp-card" style="padding:1.5rem">';
    html += '<h3 style="margin:0 0 1rem;font-size:1rem;font-weight:700;color:var(--bp-text)"><i class="fas fa-sliders-h" style="margin-right:.5rem;color:var(--bp-primary)"></i>Prijzen en kansen aanpassen</h3>';
    html += '<div class="bp-form-grid">';

    settings.forEach((seg, i) => {
      const isLast = i === settings.length - 1;
      html += '<div class="bp-field" style="' + (isLast ? 'grid-column:1/-1' : '') + '">' +
        '<label class="bp-label">' + seg.icon + ' ' + esc(seg.label) + '</label>' +
        '<div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">' +
          '<div style="flex:0 0 auto;width:60px;height:40px;background:' + seg.color + ';border-radius:.375rem;display:flex;align-items:center;justify-content:center;color:' + seg.textColor + ';font-size:1.2rem">' + seg.icon + '</div>' +
          '<input type="text" class="bp-input segment-label" data-index="' + i + '" value="' + esc(seg.label) + '" placeholder="Label" style="flex:1;min-width:120px">' +
          '<div class="bp-input-group"><span class="bp-prefix">%</span><input type="number" class="bp-input segment-chance" data-index="' + i + '" value="' + seg.chance + '" step="0.1" min="0" max="100" placeholder="Kans %" style="width:80px"></div>' +
          (seg.hasCode ? '<input type="text" class="bp-input segment-prefix" data-index="' + i + '" value="' + esc(seg.codePrefix) + '" placeholder="Code prefix" style="width:140px">' : '<span style="font-size:.78rem;color:var(--bp-text-faint);padding:0 .5rem">Geen code</span>') +
        '</div>' +
      '</div>';
    });

    html += '</div>';
    html += '<div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1.25rem;flex-wrap:wrap">' +
      '<button class="bp-btn bp-btn-ghost" id="resetDefaultsBtn"><i class="fas fa-undo"></i> Reset naar standaard</button>' +
      '<button class="bp-btn bp-btn-primary" id="saveSettingsBtn"><i class="fas fa-save"></i> Opslaan</button>' +
    '</div>';
    html += '</div>';

    root.innerHTML = html;

    // Save settings
    $('#saveSettingsBtn', root).addEventListener('click', () => {
      const labels = $$('.segment-label', root);
      const chances = $$('.segment-chance', root);
      const prefixes = $$('.segment-prefix', root);
      let prefixIdx = 0;
      const newSettings = settings.map((seg, i) => {
        const updated = {
          ...seg,
          label: labels[i] ? labels[i].value.trim() : seg.label,
          chance: chances[i] ? parseFloat(chances[i].value) || 0 : seg.chance
        };
        if (seg.hasCode) {
          updated.codePrefix = prefixes[prefixIdx] ? prefixes[prefixIdx].value.trim() : seg.codePrefix;
          prefixIdx++;
        }
        return updated;
      });

      const total = newSettings.reduce((a, s) => a + (parseFloat(s.chance) || 0), 0);
      if (Math.abs(total - 100) > 0.1) {
        toast('Fout', 'Kansen tellen niet op tot 100% (nu: ' + total.toFixed(1) + '%)', 'error');
        return;
      }

      if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.saveWheelSettings(newSettings); }
      toast('Instellingen opgeslagen', '', 'success');
      navigate('wheelsettings');
    });

    // Reset to defaults
    $('#resetDefaultsBtn', root).addEventListener('click', () => {
      confirmModal('Reset naar standaard', 'Weet je zeker dat je alle instellingen wilt resetten naar de standaardwaarden?', () => {
        if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.saveWheelSettings(null); }
        toast('Standaardinstellingen hersteld', '', 'success');
        navigate('wheelsettings');
      });
    });

    // Reset all spins
    $('#resetSpinsBtn', root).addEventListener('click', () => {
      confirmModal('Alle spins resetten', 'Weet je zeker dat je de spin-limiet voor alle bezoekers wilt resetten? Iedereen kan daarna opnieuw draaien.', () => {
        // Generate a new reset token — visitors check this on page load
        const newToken = 'reset_' + Date.now().toString(36);
        if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.saveResetToken(newToken); }
        toast('Alle spins gereset!', 'Bezoekers kunnen nu opnieuw draaien', 'success', 4000);
      });
    });
  });

  // ═══════════════════════════════════════════════════════
  // VIEW: RESEARCH
  // ═══════════════════════════════════════════════════════
  view('research', function (root) {
    const r = D.list('research');
    const totalEst = r.reduce((a, x) => a + D.parseNum(x.estProfit), 0);
    let html = '<div class="bp-kpi-grid" style="margin-bottom:1rem">';
    html += kpiCard('Onderzochte producten', D.fmtNum(r.length), 'fa-lightbulb', 'violet');
    html += kpiCard('Potentiële winst', D.fmtEuro(totalEst), 'fa-arrow-trend-up', 'success');
    html += kpiCard('Goedgekeurd', D.fmtNum(r.filter(x => x.status === 'Goedgekeurd').length), 'fa-check', 'success');
    html += '</div>';
    html += '<div class="bp-filter-bar">' +
      '<button class="bp-btn bp-btn-primary" id="rAdd"><i class="fas fa-plus"></i> Research toevoegen</button>' +
      '</div>';
    html += '<div id="rList">' + renderResearchList(r) + '</div>';
    root.innerHTML = html;
    $('#rAdd', root).addEventListener('click', () => editResearch());
    wireR();
    function wireR() {
      $$('.bp-row-action.edit', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        editResearch(D.get('research', id));
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        confirmModal('Verwijderen', 'Research item verwijderen?', () => { D.remove('research', id); toast('Verwijderd', '', 'success'); navigate('research'); });
      }));
    }
  });

  function renderResearchList(r) {
    if (r.length === 0) return emptyState('fa-lightbulb', 'Geen research', 'Voeg een product toe om te onderzoeken', 'Toevoegen', () => editResearch()).outerHTML;
    let html = '<div class="bp-card"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
      '<thead><tr><th>Categorie</th><th>Product</th><th class="num">Inkoop</th><th class="num">Verkoop</th><th class="num">Winst</th><th>Bron</th><th>Status</th><th class="num">Acties</th></tr></thead><tbody>';
    r.forEach(x => {
      html += '<tr data-id="' + x.id + '">' +
        '<td><span class="bp-badge bp-badge-neutral">' + esc(x.category) + '</span></td>' +
        '<td class="strong">' + esc(x.product) + '</td>' +
        '<td class="num muted">' + D.fmtEuro(x.costPrice) + '</td>' +
        '<td class="num">' + D.fmtEuro(x.sellPrice) + '</td>' +
        '<td class="num" style="color:var(--bp-success);font-weight:600">' + D.fmtEuro(x.estProfit) + '</td>' +
        '<td>' + (x.source ? '<a href="' + esc(x.source) + '" target="_blank" class="bp-link"><i class="fas fa-external-link-alt"></i> Bron</a>' : '-') + '</td>' +
        '<td>' + statusBadge(x.status) + '</td>' +
        '<td class="num"></td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    setTimeout(() => {
      $$('#rList tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        tr.querySelector('td:last-child').appendChild(actionBtns(
          () => editResearch(D.get('research', id)),
          () => confirmModal('Verwijderen', 'Research item verwijderen?', () => { D.remove('research', id); toast('Verwijderd', '', 'success'); navigate('research'); })
        ));
      });
    }, 0);
    return html;
  }

  function editResearch(r) {
    const isNew = !r;
    const fields = [
      { key: 'product', label: 'Product', required: true, full: true },
      { key: 'category', label: 'Categorie', type: 'select', options: ['Microfoons', 'Gereedschap', 'Accessoires', 'Overigen'] },
      { key: 'costPrice', label: 'Inkoopprijs', type: 'euro' },
      { key: 'sellPrice', label: 'Verkoopprijs', type: 'euro' },
      { key: 'source', label: 'Bron URL', full: true, placeholder: 'https://...' },
      { key: 'status', label: 'Status', type: 'select', options: ['Onderzoek', 'Goedgekeurd', 'Misschien', 'Afgewezen', 'Ingekocht'] },
      { key: 'note', label: 'Notitie', type: 'textarea', full: true }
    ];
    formModal(isNew ? 'Nieuw research item' : 'Research bewerken', 'fa-lightbulb', fields, (data, close) => {
      if (!data.product) { toast('Fout', 'Product is verplicht', 'error'); return; }
      data.estProfit = D.parseNum(data.sellPrice) - D.parseNum(data.costPrice);
      if (isNew) D.add('research', data);
      else D.update('research', r.id, data);
      toast('Opgeslagen', '', 'success'); close(); navigate('research');
    }, r || {});
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: WERKNEMERS
  // ═══════════════════════════════════════════════════════
  view('werknemers', function (root) {
    const w = D.list('werknemers');
    const total = w.reduce((a, x) => a + D.parseNum(x.amount), 0);
    let html = '<div class="bp-kpi-grid" style="margin-bottom:1rem">';
    html += kpiCard('Betalingen', D.fmtNum(w.length), 'fa-user-tie', 'primary');
    html += kpiCard('Totaal uitbetaald', D.fmtEuro(total), 'fa-euro-sign', 'warn');
    html += '</div>';
    html += '<div class="bp-filter-bar"><button class="bp-btn bp-btn-primary" id="wAdd"><i class="fas fa-plus"></i> Betaling toevoegen</button></div>';
    html += '<div id="wList">' + renderWerknList(w) + '</div>';
    root.innerHTML = html;
    $('#wAdd', root).addEventListener('click', () => editWerkn());
    wireW();
    function wireW() {
      $$('.bp-row-action.edit', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        editWerkn(D.get('werknemers', id));
      }));
      $$('.bp-row-action.delete', root).forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.closest('tr').dataset.id;
        confirmModal('Verwijderen', 'Betaling verwijderen?', () => { D.remove('werknemers', id); toast('Verwijderd', '', 'success'); navigate('werknemers'); });
      }));
    }
  });

  function renderWerknList(w) {
    if (w.length === 0) return emptyState('fa-user-tie', 'Geen betalingen', 'Voeg een werknemer of uitkering toe', 'Toevoegen', () => editWerkn()).outerHTML;
    let html = '<div class="bp-card"><div class="bp-card-body-p0"><div class="bp-table-wrap"><table class="bp-table">' +
      '<thead><tr><th>Referentie</th><th>Werknemer</th><th class="num">Bedrag</th><th>Datum</th><th>Reden</th><th>Categorie</th><th>Status</th><th class="num">Acties</th></tr></thead><tbody>';
    w.forEach(x => {
      html += '<tr data-id="' + x.id + '">' +
        '<td class="strong">' + esc(x.reference || '-') + '</td>' +
        '<td>' + esc(x.employee) + '</td>' +
        '<td class="num strong">' + D.fmtEuro(x.amount) + '</td>' +
        '<td>' + esc(x.date) + '</td>' +
        '<td class="muted">' + esc(x.reason || '-') + '</td>' +
        '<td><span class="bp-badge bp-badge-neutral">' + esc(x.category || '-') + '</span></td>' +
        '<td>' + statusBadge(x.status) + '</td>' +
        '<td class="num"></td></tr>';
    });
    html += '</tbody></table></div></div></div>';
    setTimeout(() => {
      $$('#wList tr[data-id]').forEach(tr => {
        const id = tr.dataset.id;
        tr.querySelector('td:last-child').appendChild(actionBtns(
          () => editWerkn(D.get('werknemers', id)),
          () => confirmModal('Verwijderen', 'Betaling verwijderen?', () => { D.remove('werknemers', id); toast('Verwijderd', '', 'success'); navigate('werknemers'); })
        ));
      });
    }, 0);
    return html;
  }

  function editWerkn(w) {
    const isNew = !w;
    const fields = [
      { key: 'reference', label: 'Referentie', placeholder: 'bv. BET-001' },
      { key: 'employee', label: 'Werknemer', required: true },
      { key: 'amount', label: 'Bedrag', type: 'euro' },
      { key: 'date', label: 'Datum', type: 'date', default: new Date().toISOString().slice(0, 10) },
      { key: 'reason', label: 'Reden' },
      { key: 'category', label: 'Categorie', type: 'select', options: ['Salaris', 'Uitkering', 'Bonus', 'Vergoeding', 'Anders'] },
      { key: 'approver', label: 'Goedkeurder' },
      { key: 'status', label: 'Status', type: 'select', options: ['In afwachting', 'Goedgekeurd', 'Uitbetaald', 'Afgewezen'] },
      { key: 'note', label: 'Opmerkingen', type: 'textarea', full: true }
    ];
    formModal(isNew ? 'Nieuwe betaling' : 'Betaling bewerken', 'fa-user-tie', fields, (data, close) => {
      if (!data.employee) { toast('Fout', 'Werknemer is verplicht', 'error'); return; }
      if (isNew) D.add('werknemers', data);
      else D.update('werknemers', w.id, data);
      toast('Opgeslagen', '', 'success'); close(); navigate('werknemers');
    }, w || {});
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: RAPPORTEN
  // ═══════════════════════════════════════════════════════
  view('rapporten', function (root) {
    const s = D.dashboardStats();
    const cats = D.categoryBreakdown();

    // ── Weekrapport download-knop bovenaan ──
    let html = '<div class="bp-card" style="margin-bottom:1rem;background:linear-gradient(135deg,var(--bp-card),var(--bp-card-2))">' +
      '<div class="bp-card-body" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:200px">' +
      '<div style="font-family:Poppins,sans-serif;font-weight:700;font-size:1.05rem;color:var(--bp-text)"><i class="fas fa-file-pdf" style="color:var(--bp-danger);margin-right:0.4rem"></i> Wekelijks PDF-rapport</div>' +
      '<div style="font-size:0.82rem;color:var(--bp-text-muted);margin-top:0.2rem">Genereer een PDF met weekvergelijking, top-producten en herinneringen — ideaal om te archiveren of te delen.</div>' +
      '</div>' +
      '<button class="bp-btn bp-btn-primary" data-pdf-btn><i class="fas fa-download"></i> Download weekrapport (PDF)</button>' +
      '</div></div>';

    // ── Weekvergelijking widget (enkel zichtbaar in Rapporten, niet op dashboard) ──
    html += renderWeeklyComparisonWidget({ showPdfButton: false });

    html += '<div class="bp-grid-2" style="margin-bottom:1rem">';
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-chart-bar"></i> Winst per categorie</div></div><div class="bp-chart-wrap"><canvas id="repChart1"></canvas></div></div>';
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-chart-column"></i> Voorraadwaarde per categorie</div></div><div class="bp-chart-wrap"><canvas id="repChart2"></canvas></div></div>';
    html += '</div>';

    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-file-chart"></i> Bedrijfs rapport</div>' +
      '<button class="bp-btn bp-btn-secondary bp-btn-sm" id="repExport"><i class="fas fa-download"></i> Exporteer JSON</button></div>' +
      '<div class="bp-card-body"><div class="bp-grid-2">';
    html += '<div><div class="bp-section-title"><i class="fas fa-coins"></i> Financieel</div>';
    html += '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-warn-soft);color:var(--bp-warn)"><i class="fas fa-piggy-bank"></i></div><div style="flex:1"><div class="bp-stat-label">Geïnvesteerd (inkoop)</div><div class="bp-stat-value">' + D.fmtEuro(s.totalInvested) + '</div></div></div>';
    html += '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-info-soft);color:var(--bp-info)"><i class="fas fa-euro-sign"></i></div><div style="flex:1"><div class="bp-stat-label">Omzet</div><div class="bp-stat-value">' + D.fmtEuro(s.totalRevenue) + '</div></div></div>';
    html += '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-success-soft);color:var(--bp-success)"><i class="fas fa-arrow-trend-up"></i></div><div style="flex:1"><div class="bp-stat-label">Netto winst</div><div class="bp-stat-value">' + D.fmtEuro(s.totalProfit) + '</div></div></div>';
    html += '<div class="bp-list-item"><div class="bp-list-icon" style="background:#f3e8ff;color:var(--bp-violet)"><i class="fas fa-percent"></i></div><div style="flex:1"><div class="bp-stat-label">Gemiddelde marge</div><div class="bp-stat-value">' + D.fmtPct(s.avgMargin) + '</div></div></div>';
    html += '</div>';

    html += '<div><div class="bp-section-title"><i class="fas fa-boxes-stacked"></i> Voorraad</div>';
    html += '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-primary-soft);color:var(--bp-primary)"><i class="fas fa-warehouse"></i></div><div style="flex:1"><div class="bp-stat-label">Voorraadwaarde</div><div class="bp-stat-value">' + D.fmtEuro(s.totalStockValue) + '</div></div></div>';
    html += '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-info-soft);color:var(--bp-info)"><i class="fas fa-box"></i></div><div style="flex:1"><div class="bp-stat-label">Aantal eenheden</div><div class="bp-stat-value">' + D.fmtNum(s.totalUnits) + '</div></div></div>';
    html += '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-danger-soft);color:var(--bp-danger)"><i class="fas fa-triangle-exclamation"></i></div><div style="flex:1"><div class="bp-stat-label">Lage voorraad items</div><div class="bp-stat-value">' + D.fmtNum(s.lowStockCount) + '</div></div></div>';
    html += '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-success-soft);color:var(--bp-success)"><i class="fas fa-users"></i></div><div style="flex:1"><div class="bp-stat-label">Klanten</div><div class="bp-stat-value">' + D.fmtNum(s.customersCount) + '</div></div></div>';
    html += '</div></div></div></div>';

    root.innerHTML = html;
    $('#repExport', root).addEventListener('click', () => exportJson());
    // Wire alle PDF-knoppen (zowel de bovenste als eventueel in de widget)
    wirePdfButton(root);
    setTimeout(() => renderRapportCharts(cats), 100);
  });

  function renderRapportCharts(cats) {
    if (typeof Chart === 'undefined') { setTimeout(() => renderRapportCharts(cats), 200); return; }
    const c1 = document.getElementById('repChart1');
    if (c1) new Chart(c1, {
      type: 'bar',
      data: { labels: cats.map(c => c.category), datasets: [{ label: 'Gerealiseerde winst', data: cats.map(c => c.realizedProfit), backgroundColor: '#4f46e5', borderRadius: 8 }] },
      options: chartOpts()
    });
    const c2 = document.getElementById('repChart2');
    if (c2) new Chart(c2, {
      type: 'bar',
      data: { labels: cats.map(c => c.category), datasets: [{ label: 'Voorraadwaarde', data: cats.map(c => c.stockValue), backgroundColor: '#10b981', borderRadius: 8 }] },
      options: chartOpts()
    });
  }

  // ═══════════════════════════════════════════════════════
  // VIEW: INSTELLINGEN
  // ═══════════════════════════════════════════════════════
  view('instellingen', function (root) {
    let html = '<div class="bp-grid-2">';

    // ═══ Kaart 1: Statistieken aanpassen (NIEUW) ═══
    html += '<div class="bp-card" style="grid-column:1 / -1">' +
      '<div class="bp-card-head">' +
        '<div class="bp-card-title"><i class="fas fa-sliders"></i> Statistieken aanpassen</div>' +
        '<button class="bp-btn bp-btn-danger bp-btn-sm" id="setResetStats"><i class="fas fa-rotate-left"></i> Reset naar standaardwaarden</button>' +
      '</div>' +
      '<div class="bp-card-body">' +
        '<p class="bp-muted" style="margin-bottom:1rem;font-size:.85rem">Pas de dashboard-statistieken handmatig omhoog of omlaag aan. De correcties worden opgeteld bij de automatisch berekende waarden. Klik op "Reset naar standaardwaarden" om alle correcties terug te zetten naar 0.</p>' +
        '<div class="bp-stat-grid" id="statGrid"></div>' +
      '</div>' +
    '</div>';

    // ═══ Kaart 2: Data beheer ═══
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-database"></i> Data beheer</div></div><div class="bp-card-body bp-stack">' +
      '<button class="bp-btn bp-btn-secondary" id="setExport"><i class="fas fa-download"></i> Exporteer alle data (JSON)</button>' +
      '<button class="bp-btn bp-btn-secondary" id="setImport"><i class="fas fa-upload"></i> Importeer data (JSON)</button>' +
      '<input type="file" id="setImportFile" accept=".json" hidden>' +
      '<button class="bp-btn bp-btn-danger" id="setReset"><i class="fas fa-rotate-left"></i> Reset naar seed data</button>' +
      '</div></div>';

    // ═══ Kaart 3: Over ═══
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-info-circle"></i> Over</div></div><div class="bp-card-body bp-stack">' +
      '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-primary-soft);color:var(--bp-primary)"><i class="fas fa-chart-line"></i></div><div><div class="bp-strong">Lagenco Business Panel</div><div class="bp-muted">Versie 1.1 · Handelsadministratie</div></div></div>' +
      '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-success-soft);color:var(--bp-success)"><i class="fas fa-fire"></i></div><div><div class="bp-strong">Firebase Realtime Database</div><div class="bp-muted">Alle data wordt direct in Firebase opgeslagen en real-time gesynchroniseerd met de website</div></div></div>' +
      '<div class="bp-list-item"><div class="bp-list-icon" style="background:#f3e8ff;color:var(--bp-violet)"><i class="fas fa-bolt"></i></div><div><div class="bp-strong">Prestaties</div><div class="bp-muted">Dashboard wordt lazy-loaded · geen impact op website</div></div></div>' +
      '</div></div>';
    html += '</div>';

    root.innerHTML = html;

    // ── Statistieken-aanpassen grid renderen ──
    const STAT_DEFS = [
      { key: 'winst',         label: 'Winst',          icon: 'fa-arrow-trend-up', color: 'success', unit: 'euro',   step: 1 },
      { key: 'omzet',         label: 'Omzet',          icon: 'fa-euro-sign',       color: 'info',    unit: 'euro',   step: 1 },
      { key: 'geinvesteerd',  label: 'Geïnvesteerd',   icon: 'fa-piggy-bank',      color: 'warn',    unit: 'euro',   step: 1 },
      { key: 'voorraadwaarde',label: 'Voorraadwaarde', icon: 'fa-warehouse',       color: 'violet',  unit: 'euro',   step: 1 },
      { key: 'klanten',       label: 'Klanten',        icon: 'fa-users',           color: 'primary', unit: 'count',  step: 1 }
    ];

    function renderStatGrid() {
      const ms = D.getManualStats();
      const grid = $('#statGrid', root);
      if (!grid) return;
      let g = '';
      STAT_DEFS.forEach(def => {
        const val = ms[def.key] || 0;
        const isEuro = def.unit === 'euro';
        const display = isEuro ? D.fmtEuro(val) : D.fmtNum(val);
        g += '<div class="bp-stat-row" data-stat="' + def.key + '">' +
          '<div class="bp-stat-row-head">' +
            '<div class="bp-stat-icon bp-stat-' + def.color + '"><i class="fas ' + def.icon + '"></i></div>' +
            '<div class="bp-stat-row-info">' +
              '<div class="bp-stat-row-label">' + esc(def.label) + '</div>' +
              '<div class="bp-stat-row-sub bp-muted">Correctie t.o.v. berekende waarde</div>' +
            '</div>' +
          '</div>' +
          '<div class="bp-stat-row-controls">' +
            '<button class="bp-stat-btn dec" data-action="dec" data-stat="' + def.key + '" data-step="' + def.step + '" title="Omlaag"><i class="fas fa-minus"></i></button>' +
            '<input type="number" class="bp-stat-input" data-stat="' + def.key + '" step="' + (isEuro ? '0.01' : '1') + '" value="' + esc(val) + '">' +
            '<button class="bp-stat-btn inc" data-action="inc" data-stat="' + def.key + '" data-step="' + def.step + '" title="Omhoog"><i class="fas fa-plus"></i></button>' +
            '<div class="bp-stat-display">' + display + '</div>' +
          '</div>' +
        '</div>';
      });
      grid.innerHTML = g;

      // Wire +/- buttons
      $$('.bp-stat-btn', grid).forEach(btn => {
        btn.addEventListener('click', () => {
          const stat = btn.dataset.stat;
          const step = parseFloat(btn.dataset.step) || 1;
          const delta = btn.dataset.action === 'inc' ? step : -step;
          const newStats = D.adjustManualStat(stat, delta);
          toast(btn.dataset.action === 'inc' ? 'Verhoogd' : 'Verlaagd',
                STAT_DEFS.find(d => d.key === stat).label + ' correctie is nu ' +
                  (newStats[stat] >= 0 ? '+' : '') + (STAT_DEFS.find(d => d.key === stat).unit === 'euro' ? D.fmtEuro(newStats[stat]) : D.fmtNum(newStats[stat])),
                'success');
          renderStatGrid();
        });
      });

      // Wire direct input editing
      $$('.bp-stat-input', grid).forEach(input => {
        input.addEventListener('change', () => {
          const stat = input.dataset.stat;
          const newVal = D.parseNum(input.value);
          const current = D.getManualStats();
          current[stat] = newVal;
          D.setManualStats(current);
          toast('Opgeslagen', STAT_DEFS.find(d => d.key === stat).label + ' correctie ingesteld op ' +
                (newVal >= 0 ? '+' : '') + (STAT_DEFS.find(d => d.key === stat).unit === 'euro' ? D.fmtEuro(newVal) : D.fmtNum(newVal)),
                'success');
          renderStatGrid();
        });
      });
    }
    renderStatGrid();

    // ── Reset alle correcties naar 0 (standaardwaarden) ──
    $('#setResetStats', root).addEventListener('click', () => {
      confirmModal(
        'Reset statistieken',
        'Weet je zeker dat je alle handmatige correcties wilt terugzetten naar de standaardwaarden (0)? De automatisch berekende waarden blijven ongewijzigd.',
        () => {
          D.resetManualStats();
          toast('Reset voltooid', 'Alle correcties zijn teruggezet naar 0', 'success');
          renderStatGrid();
        }
      );
    });

    $('#setExport', root).addEventListener('click', exportJson);
    $('#setReset', root).addEventListener('click', () => {
      confirmModal('Reset data', 'Alle wijzigingen gaan verloren. Doorgaan?', () => {
        D.reset(); toast('Reset voltooid', 'Data is hersteld naar seed', 'success'); navigate('instellingen');
      });
    });
    $('#setImport', root).addEventListener('click', () => $('#setImportFile', root).click());
    $('#setImportFile', root).addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (D.importAll(data)) { toast('Geïmporteerd', 'Data is succesvol geïmporteerd', 'success'); navigate('instellingen'); }
          else toast('Fout', 'Kon data niet importeren', 'error');
        } catch (err) { toast('Fout', 'Ongeldig JSON bestand', 'error'); }
      };
      reader.readAsText(file);
    });
  });

  function exportJson() {
    const data = D.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lagenco-business-panel-export-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Geëxporteerd', 'JSON bestand gedownload', 'success');
  }

  // ═══════════════════════════════════════════════════════
  // GLOBAL SEARCH (top bar)
  // ═══════════════════════════════════════════════════════
  function handleGlobalSearch(q) {
    if (!q || q.length < 2) return;
    q = q.toLowerCase();
    // Search across all collections
    const collections = ['producten', 'verkoop', 'inkoop', 'klanten', 'tracking', 'marktplaats', 'research', 'werknemers'];
    for (const c of collections) {
      const items = D.list(c);
      const match = items.find(x => JSON.stringify(x).toLowerCase().includes(q));
      if (match) { navigate(c); return; }
    }
    toast('Geen resultaten', 'Niets gevonden voor "' + q + '"', 'info');
  }

  // ═══════════════════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════════════════
  // NOTE: The login gate is handled entirely by the INLINE script
  // in business-panel.html (window.__bpAuth). This file only
  // boots the dashboard when the user is already authenticated.

  function wireApp() {
    // Wire navigation
    $$('.bp-nav-item').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      navigate(a.dataset.view);
    }));

    // Topbar buttons
    $('#bpMobileMenu')?.addEventListener('click', () => {
      $('#bpSidebar').classList.toggle('open');
      $('#bpSidebarOverlay').classList.toggle('show');
    });
    $('#bpSidebarToggle')?.addEventListener('click', () => {
      $('#bpSidebar').classList.toggle('open');
      $('#bpSidebarOverlay').classList.toggle('show');
    });
    $('#bpSidebarOverlay')?.addEventListener('click', () => {
      $('#bpSidebar').classList.remove('open');
      $('#bpSidebarOverlay').classList.remove('show');
    });
    $('#bpLogoutBtn')?.addEventListener('click', () => {
      // Echt uitloggen: clear sessionStorage + redirect naar login
      if (window.__bpAuth && typeof window.__bpAuth.logout === 'function') {
        toast('Uitloggen', 'Je wordt doorgestuurd naar de login-pagina…', 'info');
        setTimeout(() => window.__bpAuth.logout(), 600);
      } else {
        // Fallback voor oudere code
        try { sessionStorage.removeItem('lagencoLoggedIn'); } catch (e) {}
        toast('Uitloggen', 'Je wordt doorgestuurd…', 'info');
        setTimeout(() => { window.location.href = 'login.html'; }, 600);
      }
    });
    $('#bpRefresh')?.addEventListener('click', () => {
      navigate(currentView);
      toast('Vernieuwd', '', 'success');
    });
    // ── Dark mode toggle ──
    // Pas toe op init en wire de knop.
    applyDarkMode(isDarkMode());
    $('#bpDarkToggle')?.addEventListener('click', () => {
      const next = !isDarkMode();
      applyDarkMode(next);
      toast(next ? 'Donker thema aan' : 'Licht thema aan',
            next ? 'Oogrustig voor avondshifts' : 'Standaard weergave',
            'info');
    });
    $('#bpExport')?.addEventListener('click', exportJson);
    $('#bpQuickAdd')?.addEventListener('click', () => {
      openModal({
        title: 'Snel toevoegen', icon: 'fa-plus',
        body: '<div class="bp-grid-2">' +
          ['agenda:Agenda-item:fa-calendar-day', 'producten:Product:fa-box', 'verkoop:Verkoop:fa-cash-register', 'inkoop:Inkoop:fa-shopping-cart', 'klanten:Klant:fa-user', 'tracking:Zending:fa-truck', 'research:Research:fa-lightbulb'].map(x => {
            const [v, l, i] = x.split(':');
            return '<button class="bp-card bp-card-hover bp-list-item" data-add="' + v + '"><div class="bp-list-icon" style="background:var(--bp-primary-soft);color:var(--bp-primary)"><i class="fas ' + i + '"></i></div><div class="bp-strong">' + l + '</div></button>';
          }).join('') +
          '</div>',
        onMount: (m, close) => {
          $$('[data-add]', m).forEach(b => b.addEventListener('click', () => {
            const target = b.dataset.add;
            close();
            if (target === 'agenda') {
              // Voor agenda: open direct het "nieuwe item" modal na korte delay
              // zodat de view eerst kan renderen.
              navigate('agenda');
              setTimeout(function () { editAgendaEvent(null, D.fmtDate(new Date())); }, 100);
            } else {
              navigate(target);
            }
          }));
        }
      });
    });

    // Global search
    $('#bpGlobalSearch')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleGlobalSearch(e.target.value);
    });

    // Handle hash routing
    window.addEventListener('hashchange', () => {
      const h = window.location.hash.replace('#', '');
      if (h && VIEWS[h]) navigate(h);
    });
  }

  function boot() {
    // No auth gate — always boot the dashboard directly.
    D.init();
    // Hide splash, show app
    const splash = $('#bpSplash');
    const app = $('#bpApp');
    setTimeout(() => {
      if (splash) { splash.classList.add('hide'); splash.style.display = 'none'; }
      if (app) app.hidden = false;
    }, 300);
    // Wire all navigation and buttons
    wireApp();
    // Route to default view
    function routeFromHash() {
      const h = window.location.hash.replace('#', '');
      if (h && VIEWS[h]) navigate(h);
      else navigate('dashboard');
    }

    // Wait for Firebase to finish initial sync before rendering the
    // first view — otherwise the dashboard would render with empty data.
    if (window.LagencoDB && window.LagencoDB.isConfigured) {
      // Show "loading" message in the splash while we wait
      const msg = $('#bpSplashMsg');
      if (msg) msg.textContent = 'Bezig met synchroniseren met Firebase…';
      window.LagencoDB.syncAll().then(() => {
        // After initial sync, start real-time listeners
        window.LagencoDB.startPolling({
          onProductsChange: function () {
            // Re-render the website producten view if it's currently active
            if (currentView === 'websiteproducten') navigate('websiteproducten');
          },
          onBidsChange: function () {
            if (currentView === 'biedingen') navigate('biedingen');
          },
          onPostsChange: function () {
            // community posts are not in the dashboard, but keep hook for completeness
          },
          onBpChange: function (collection) {
            // Re-render current view if its underlying collection changed.
            // The dashboard / catalogus / etc. read from multiple collections,
            // so the safest approach is to just re-render the current view.
            const relevantViews = {
              producten: ['producten'],
              voorraad: ['voorraad'],
              inkoop: ['inkoop'],
              verkoop: ['verkoop'],
              catalogus: ['producten', 'voorraad', 'verkoop'],
              klanten: ['klanten'],
              tracking: ['tracking'],
              marktplaats: ['marktplaats'],
              research: ['research'],
              werknemers: ['werknemers'],
              agenda: ['agenda'],
              notitieblok: ['notities'],
              dashboard: ['agenda', 'verkoop', 'voorraad']
            };
            const deps = relevantViews[currentView] || [];
            if (deps.indexOf(collection) !== -1) {
              navigate(currentView);
            }
          }
        });
        // Wait one more tick for BPData.init to finish seeding (if needed)
        D.onInit(function () {
          routeFromHash();
        });
        // Safety net: if onInit doesn't fire within 2s (e.g., LagencoDB not configured), route anyway
        setTimeout(function () { routeFromHash(); }, 2000);
      }).catch(function (e) {
        console.warn('[BP] syncAll failed', e);
        routeFromHash();
      });
    } else {
      routeFromHash();
    }
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
