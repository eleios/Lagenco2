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
  // ────────────────────────────────────────────────────────
  const LOGIN_KEY = 'lagencoLoggedIn';
  function isLoggedIn() {
    if (window.__bpAuth && typeof window.__bpAuth.isLoggedIn === 'function') {
      return window.__bpAuth.isLoggedIn();
    }
    // Fallback (in case inline script hasn't loaded yet)
    try {
      const raw = localStorage.getItem(LOGIN_KEY);
      if (raw === null || raw === undefined) return false;
      try {
        const parsed = JSON.parse(raw);
        if (parsed === true || parsed === 1) return true;
        if (parsed === false || parsed === 0 || parsed === null) return false;
      } catch (e) {}
      const s = String(raw).trim().toLowerCase();
      return s === 'true' || s === '1' || s === 'yes' || s === 'ingelogd';
    } catch (e) { return false; }
  }
  // Live re-check: if the login state changes while the panel is open
  // (e.g. user logs out in another tab), react immediately.
  window.addEventListener('storage', function (e) {
    if (e.key === LOGIN_KEY) {
      if (!isLoggedIn()) {
        window.location.href = 'index.html';
      }
    }
  });
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
  // Modal
  // ────────────────────────────────────────────────────────
  function openModal(opts) {
    closeModal();
    const root = $('#bpModalRoot');
    const back = document.createElement('div');
    back.className = 'bp-modal-backdrop';
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
    const close = () => closeModal();
    back.addEventListener('click', e => { if (e.target === back) close(); });
    modal.querySelector('.bp-modal-close').addEventListener('click', close);
    if (opts.onMount) opts.onMount(modal, close);
    return { modal, close };
  }
  function closeModal() {
    const root = $('#bpModalRoot');
    if (root) root.innerHTML = '';
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
    dashboard:    { title: 'Dashboard',         sub: 'Overzicht van je handelsadministratie' },
    producten:    { title: 'Producten',          sub: 'Beheer je productcatalogus en prijzen' },
    voorraad:     { title: 'Voorraad',           sub: 'Voorraadniveaus en magazijnbeheer' },
    inkoop:       { title: 'Inkoop',             sub: 'Inkooporders en leveranciers' },
    verkoop:      { title: 'Verkoop',            sub: 'Verkooplog en winstberekening' },
    catalogus:    { title: 'Catalogus',          sub: 'Gecombineerd productoverzicht met stats' },
    klanten:      { title: 'Klanten',            sub: 'Klantendatabase en orderhistorie' },
    tracking:     { title: 'Tracking',           sub: 'Zendingen volgen en status beheren' },
    marktplaats:  { title: 'Marktplaats',        sub: 'Actieve advertenties en verkopen' },
    research:     { title: 'Research',           sub: 'Onderzoek nieuwe producten om in te kopen' },
    werknemers:   { title: 'Werknemers',         sub: 'Uitkeringen en werknemersbetalingen' },
    rapporten:    { title: 'Rapporten',          sub: 'Inzichten en bedrijfsanalytics' },
    instellingen: { title: 'Instellingen',       sub: 'Data beheer en configuratie' }
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
  view('dashboard', function (root) {
    const s = D.dashboardStats();
    let html = '<div class="bp-kpi-grid">';
    html += kpiCard('Totale Winst', D.fmtEuro(s.totalProfit), 'fa-arrow-trend-up', 'success', { up: true, text: s.salesCount + ' verkopen' });
    html += kpiCard('Omzet', D.fmtEuro(s.totalRevenue), 'fa-euro-sign', 'info');
    html += kpiCard('Geïnvesteerd', D.fmtEuro(s.totalInvested), 'fa-piggy-bank', 'warn');
    html += kpiCard('Voorraadwaarde', D.fmtEuro(s.totalStockValue), 'fa-warehouse', 'violet', { up: true, text: s.totalUnits + ' eenheden' });
    html += kpiCard('Producten', D.fmtNum(s.totalProducts), 'fa-box', 'primary');
    html += kpiCard('Gem. Marge', D.fmtPct(s.avgMargin), 'fa-percent', 'info');
    html += kpiCard('Lage Voorraad', D.fmtNum(s.lowStockCount), 'fa-triangle-exclamation', s.lowStockCount > 0 ? 'danger' : 'success');
    html += kpiCard('Klanten', D.fmtNum(s.customersCount), 'fa-users', 'success');
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
    html += '</div></div></div>';

    root.innerHTML = html;

    // Render charts (after DOM is in place)
    setTimeout(() => renderDashboardCharts(), 50);

    // Wire navigation buttons
    $$('[data-goto]', root).forEach(b => b.addEventListener('click', () => navigate(b.dataset.goto)));
  });

  function renderDashboardCharts() {
    if (typeof Chart === 'undefined') {
      // Chart.js not yet loaded — retry shortly
      setTimeout(renderDashboardCharts, 200);
      return;
    }
    // Chart 1: Revenue & profit over time
    const c1 = document.getElementById('dashChart1');
    if (c1) {
      const data = D.salesOverTime();
      const labels = data.map(d => {
        const [y, m] = d.month.split('-');
        return new Date(y, m - 1).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' });
      });
      new Chart(c1, {
        type: 'line',
        data: {
          labels: labels.length ? labels : ['Geen data'],
          datasets: [
            { label: 'Omzet', data: data.map(d => d.revenue), borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.1)', fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#4f46e5' },
            { label: 'Winst', data: data.map(d => d.profit), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.35, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: '#10b981' }
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
            backgroundColor: ['#4f46e5', '#7c3aed', '#2563eb', '#0891b2', '#10b981', '#f59e0b'],
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
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: opts.legend ? { display: true, position: 'top', align: 'end', labels: { padding: 14, font: { size: 11 }, usePointStyle: true, pointStyle: 'circle' } } : { display: false },
        tooltip: { backgroundColor: '#0f172a', padding: 12, cornerRadius: 8, titleFont: { size: 12 }, bodyFont: { size: 12 } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#e2e8f0', drawBorder: false }, ticks: { font: { size: 11 }, callback: v => '€ ' + v } }
      }
    };
  }

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
      { key: 'category', label: 'Categorie', type: 'select', options: ['Microfoons', 'Gereedschap', 'Accessoires', 'Overigen', 'Overig'], default: 'Microfoons' },
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
    let html = '<div class="bp-grid-2" style="margin-bottom:1rem">';
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
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-database"></i> Data beheer</div></div><div class="bp-card-body bp-stack">' +
      '<button class="bp-btn bp-btn-secondary" id="setExport"><i class="fas fa-download"></i> Exporteer alle data (JSON)</button>' +
      '<button class="bp-btn bp-btn-secondary" id="setImport"><i class="fas fa-upload"></i> Importeer data (JSON)</button>' +
      '<input type="file" id="setImportFile" accept=".json" hidden>' +
      '<button class="bp-btn bp-btn-danger" id="setReset"><i class="fas fa-rotate-left"></i> Reset naar seed data</button>' +
      '</div></div>';
    html += '<div class="bp-card"><div class="bp-card-head"><div class="bp-card-title"><i class="fas fa-info-circle"></i> Over</div></div><div class="bp-card-body bp-stack">' +
      '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-primary-soft);color:var(--bp-primary)"><i class="fas fa-chart-line"></i></div><div><div class="bp-strong">Lagenco Business Panel</div><div class="bp-muted">Versie 1.0 · Handelsadministratie</div></div></div>' +
      '<div class="bp-list-item"><div class="bp-list-icon" style="background:var(--bp-success-soft);color:var(--bp-success)"><i class="fas fa-database"></i></div><div><div class="bp-strong">Locale opslag</div><div class="bp-muted">Data wordt opgeslagen in je browser (localStorage)</div></div></div>' +
      '<div class="bp-list-item"><div class="bp-list-icon" style="background:#f3e8ff;color:var(--bp-violet)"><i class="fas fa-bolt"></i></div><div><div class="bp-strong">Prestaties</div><div class="bp-muted">Dashboard wordt lazy-loaded · geen impact op website</div></div></div>' +
      '</div></div>';
    html += '</div>';
    root.innerHTML = html;
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
      // No auth — just go back to the main website
      toast('Terug naar website', 'Je wordt doorgestuurd…', 'info');
      setTimeout(() => { window.location.href = 'index.html'; }, 600);
    });
    $('#bpRefresh')?.addEventListener('click', () => {
      navigate(currentView);
      toast('Vernieuwd', '', 'success');
    });
    $('#bpExport')?.addEventListener('click', exportJson);
    $('#bpQuickAdd')?.addEventListener('click', () => {
      openModal({
        title: 'Snel toevoegen', icon: 'fa-plus',
        body: '<div class="bp-grid-2">' +
          ['producten:Product:fa-box', 'verkoop:Verkoop:fa-cash-register', 'inkoop:Inkoop:fa-shopping-cart', 'klanten:Klant:fa-user', 'tracking:Zending:fa-truck', 'research:Research:fa-lightbulb'].map(x => {
            const [v, l, i] = x.split(':');
            return '<button class="bp-card bp-card-hover bp-list-item" data-add="' + v + '"><div class="bp-list-icon" style="background:var(--bp-primary-soft);color:var(--bp-primary)"><i class="fas ' + i + '"></i></div><div class="bp-strong">' + l + '</div></button>';
          }).join('') +
          '</div>',
        onMount: (m, close) => {
          $$('[data-add]', m).forEach(b => b.addEventListener('click', () => { close(); navigate(b.dataset.add); }));
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
    routeFromHash();
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
