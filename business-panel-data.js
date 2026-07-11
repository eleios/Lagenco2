/* ═══════════════════════════════════════════════════════
   LAGENCO BUSINESS PANEL — Data Layer (v2)
   • Firebase Realtime Database is de enige source-of-truth
   • Geen localStorage meer — alle data leeft in Firebase
   • Sync API: leest van in-memory cache (gevuld door real-time listeners)
   • Async writes: fire-and-forget naar Firebase (optimistic updates)
   • Seed data wordt éénmalig naar Firebase gepusht indien leeg
   ═══════════════════════════════════════════════════════ */
(function (window) {
  'use strict';

  const VERSION = 2;

  // ────────────────────────────────────────────────────────
  // Number parsing (Dutch format: 32,99)
  // ────────────────────────────────────────────────────────
  function parseNum(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    var s = String(v).trim().replace(/[^\d,.-]/g, '');
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.indexOf(',') > -1) {
      s = s.replace(',', '.');
    }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function fmtEuro(v) {
    const n = Number(v) || 0;
    return '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtEuro0(v) {
    const n = Number(v) || 0;
    return '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function fmtNum(v) {
    const n = Number(v) || 0;
    return n.toLocaleString('nl-NL');
  }
  function fmtPct(v) {
    const n = Number(v) || 0;
    return n.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function nowISO() { return new Date().toISOString(); }
  function todayNL() {
    return new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ────────────────────────────────────────────────────────
  // Seed data — used ONLY when Firebase is empty (one-time)
  // ────────────────────────────────────────────────────────
  const SEED = {
    meta: {
      version: VERSION,
      companyName: 'Lagenco',
      owner: 'Bart van Lagen',
      createdAt: nowISO(),
      currency: 'EUR'
    },

    producten: [
      { id: 'p_e604',  category: 'Microfoons',  name: 'Sennheiser E604',  costPrice: 32.99, sellPrice: 80,  sold: 1, status: 'actief' },
      { id: 'p_sm58',  category: 'Microfoons',  name: 'Shure SM58',       costPrice: 11.59, sellPrice: 70,  sold: 0, status: 'actief' },
      { id: 'p_e945',  category: 'Microfoons',  name: 'Sennheiser E945',  costPrice: 14.89, sellPrice: 90,  sold: 0, status: 'actief' },
      { id: 'p_dtw700',category: 'Gereedschap', name: 'DTW700',           costPrice: 26.59, sellPrice: 140, sold: 0, status: 'actief' },
      { id: 'p_dga504',category: 'Gereedschap', name: 'DGA504',           costPrice: 21.07, sellPrice: 100, sold: 0, status: 'actief' },
      { id: 'p_duc150',category: 'Gereedschap', name: 'DUC150Z',          costPrice: 28.98, sellPrice: 110, sold: 0, status: 'actief' },
      { id: 'p_dtd173',category: 'Gereedschap', name: 'DTD173',           costPrice: 24.98, sellPrice: 90,  sold: 0, status: 'actief' },
      { id: 'p_dtw300',category: 'Gereedschap', name: 'DTW300',           costPrice: 22.91, sellPrice: 114, sold: 0, status: 'actief' },
      { id: 'p_dch263',category: 'Gereedschap', name: 'DCH263',           costPrice: 37.63, sellPrice: 150, sold: 0, status: 'actief' },
      { id: 'p_e914',  category: 'Microfoons',  name: 'Sennheiser E914',  costPrice: 69.12, sellPrice: 200, sold: 0, status: 'actief' },
      { id: 'p_md431', category: 'Microfoons',  name: 'Sennheiser MD431-2', costPrice: 19.87, sellPrice: 250, sold: 0, status: 'actief' }
    ],

    voorraad: [
      { id: 'v_e604',  productId: 'p_e604',  category: 'Microfoons',  name: 'Sennheiser E604',    stock: 2,  minStock: 1, location: 'Magazijn A' },
      { id: 'v_sm58',  productId: 'p_sm58',  category: 'Microfoons',  name: 'Shure SM58',         stock: 1,  minStock: 2, location: 'Magazijn A' },
      { id: 'v_e945',  productId: 'p_e945',  category: 'Microfoons',  name: 'Sennheiser E945',    stock: 1,  minStock: 2, location: 'Magazijn A' },
      { id: 'v_dtw700',productId: 'p_dtw700',category: 'Gereedschap', name: 'DTW700',             stock: 2,  minStock: 1, location: 'Magazijn B' },
      { id: 'v_dga504',productId: 'p_dga504',category: 'Gereedschap', name: 'DGA504',             stock: 2,  minStock: 1, location: 'Magazijn B' },
      { id: 'v_duc150',productId: 'p_duc150',category: 'Gereedschap', name: 'DUC150Z',            stock: 1,  minStock: 1, location: 'Magazijn B' },
      { id: 'v_dtd173',productId: 'p_dtd173',category: 'Gereedschap', name: 'DTD173',             stock: 2,  minStock: 1, location: 'Magazijn B' },
      { id: 'v_dtw300',productId: 'p_dtw300',category: 'Gereedschap', name: 'DTW300',             stock: 2,  minStock: 1, location: 'Magazijn B' },
      { id: 'v_dch263',productId: 'p_dch263',category: 'Gereedschap', name: 'DCH263',             stock: 1,  minStock: 1, location: 'Magazijn B' },
      { id: 'v_e914',  productId: 'p_e914',  category: 'Microfoons',  name: 'Sennheiser E914',    stock: 1,  minStock: 1, location: 'Magazijn A' },
      { id: 'v_md431', productId: 'p_md431', category: 'Microfoons',  name: 'Sennheiser MD431-2', stock: 1,  minStock: 1, location: 'Magazijn A' }
    ],

    inkoop: [
      { id: 'i_1', date: '2026-05-19', items: [{ name: 'Sennheiser E604', qty: 1, cost: 32.99 }], totalCost: 32.99, status: 'Compleet', note: 'Eerste inkoop' },
      { id: 'i_2', date: '2026-06-07', items: [
          { name: 'Sennheiser E604', qty: 2, cost: 51.98 },
          { name: 'Shure SM58',      qty: 1, cost: 11.59 },
          { name: 'Sennheiser E945', qty: 1, cost: 14.89 }
        ], totalCost: 68.58, status: 'Verzonden', note: '' },
      { id: 'i_3', date: '2026-06-09', items: [
          { name: 'DTW700',  qty: 2, cost: 53.18 },
          { name: 'DGA504',  qty: 2, cost: 42.14 },
          { name: 'DUC150Z', qty: 1, cost: 28.98 },
          { name: 'DTD173',  qty: 2, cost: 49.96 },
          { name: 'DTW300',  qty: 2, cost: 45.82 },
          { name: 'DCH263',  qty: 1, cost: 37.63 }
        ], totalCost: 350.00, status: 'Verzonden', note: 'Gedeeld met broer — ieder €175,00' }
    ],

    verkoop: [
      { id: 's_1', date: '2026-06-03', product: 'Sennheiser E604', costPrice: 32.99, sellPrice: 76, profit: 43.01, period: '27 mei tot 3 juni', channel: 'Marktplaats', note: '' },
      { id: 's_2', date: '2026-06-15', product: 'Sennheiser E604', costPrice: 32.99, sellPrice: 80, profit: 47.01, channel: 'Marktplaats', note: 'Verkocht aan Geert', customer: 'Geert' },
      { id: 's_3', date: '2026-06-23', product: 'Sennheiser E604', costPrice: 32.99, sellPrice: 60, profit: 20.66, costs: 6.35, channel: 'Marktplaats', note: 'Via Tikkie betaald', customer: 'Pascal' }
    ],

    klanten: [
      { id: 'k_1', date: '2026-06-15', name: 'Geert Klijnstra', email: '', phone: '', address: '8443BZ', orders: 1, totalSpent: 80, status: 'Actief', note: 'Marktplaats koper' },
      { id: 'k_2', date: '2026-06-23', name: 'Pascal Noël',     email: '', phone: '', address: '6467ER', orders: 1, totalSpent: 60, status: 'Actief', note: 'Marktplaats koper — retourmelding' }
    ],

    tracking: [
      { id: 't_1', product: 'Sennheiser E604', customer: 'Geert Klijnstra', trackingUrl: 'https://jouw.postnl.nl/track-and-trace/3SMKPL271070043-NL-8443BZ', status: 'Retourneerd', date: '2026-06-15' },
      { id: 't_2', product: 'Sennheiser E604 Instrumentmicrofoon', customer: 'Pascal Noël', trackingUrl: 'https://jouw.postnl.nl/track-and-trace/3SOPKA485638817/NL/6467ER', status: 'In verzending', date: '2026-06-23' }
    ],

    marktplaats: [
      { id: 'm_1', product: 'Sennheiser E604', price: 80, qty: 2, url: 'https://www.marktplaats.nl/v/muziek-en-instrumenten/microfoons/m2410977221-sennheiser-e604-dynamische-instrumentmicrofoon', status: 'Verkocht', date: '2026-06-15' },
      { id: 'm_2', product: 'Sennheiser E604 Instrumentmicrofoon', price: 60, qty: 1, url: 'https://www.marktplaats.nl/v/muziek-en-instrumenten/microfoons/m2413180087-sennheiser-e604-instrumentmicrofoon', status: 'Verkocht', date: '2026-06-23' }
    ],

    research: [
      { id: 'r_1', category: 'Microfoons', product: 'Sennheiser E965',                       costPrice: 34.03, sellPrice: 295, estProfit: 260.97, source: 'https://sanpusen.en.alibaba.com', status: 'Goedgekeurd', note: '' },
      { id: 'r_2', category: 'Microfoons', product: 'AT4040',                                costPrice: 90,    sellPrice: 200, estProfit: 110,    source: 'Ingekocht', status: 'Misschien', note: '' },
      { id: 'r_3', category: 'Microfoons', product: 'DT900',                                 costPrice: 53,    sellPrice: 100, estProfit: 50,     source: '', status: 'Misschien', note: '' },
      { id: 'r_4', category: 'Microfoons', product: 'Sennheiser 914',                        costPrice: 95,    sellPrice: 200, estProfit: 105,    source: 'https://dutch.alibaba.com', status: 'Onderzoek', note: '' },
      { id: 'r_5', category: 'Microfoons', product: 'Sennheiser Md431-2',                    costPrice: 40,    sellPrice: 250, estProfit: 110,    source: 'https://gdszyhs.m.en.alibaba.com', status: 'Onderzoek', note: '' },
      { id: 'r_6', category: 'Microfoons', product: 'Sennheiser E 600 Drumcase Microfoonset',costPrice: 140,   sellPrice: 600, estProfit: 460,    source: 'https://gdszyhs.m.en.alibaba.com', status: 'Onderzoek', note: 'Hoge marge — microfoonset' }
    ],

    werknemers: [
      { id: 'w_1', reference: 'BET-001', employee: 'Bart van Lagen', amount: 175, date: '2026-06-09', reason: 'Aandeel inkoop bestelling', category: 'Uitkering', approver: 'Bart van Lagen', note: 'Gedeeld met broer — ieder €175', status: 'Goedgekeurd' }
    ],

    // ═══ Agenda / Kalender ═══
    // Een agenda-item kan een eenmalige afspraak zijn, een herhalend item
    // (weekly/monthly), of een vrije notitie op een specifieke datum.
    // Velden:
    //   id, title, date (YYYY-MM-DD), time (HH:MM|null), endtime (HH:MM|null),
    //   type ('afspraak'|'persoonlijk'|'notitie'),
    //   location, customerId, customerName (cache voor display),
    //   note, recurrence ('none'|'weekly'|'monthly'),
    //   recurrenceEndDate (YYYY-MM-DD|null), reminder (bool), completed (bool),
    //   createdAt, updatedAt
    agenda: [
      { id: 'a_1', title: 'Voorraad check Magazijn A', date: '2026-07-14', time: '09:00', endtime: '09:30',
        type: 'afspraak', location: 'Magazijn A', customerId: '', customerName: '',
        note: 'Wekelijkse controle van microfoon-voorraad.', recurrence: 'weekly', recurrenceEndDate: '',
        reminder: true, completed: false },
      { id: 'a_2', title: 'Bel terug — Geert Klijnstra', date: '2026-07-15', time: '14:00', endtime: '14:15',
        type: 'afspraak', location: '', customerId: 'k_1', customerName: 'Geert Klijnstra',
        note: 'Vragen of hij nog interesse heeft in een tweede Sennheiser E604.', recurrence: 'none', recurrenceEndDate: '',
        reminder: true, completed: false },
      { id: 'a_3', title: 'Marktplaats advertenties vernieuwen', date: '2026-07-16', time: null, endtime: null,
        type: 'notitie', location: '', customerId: '', customerName: '',
        note: 'Alle "Verkocht" advertenties verwijderen, nieuwe listings online zetten.', recurrence: 'none', recurrenceEndDate: '',
        reminder: false, completed: false },
      { id: 'a_4', title: 'Verjaardag Bart', date: '2026-07-18', time: null, endtime: null,
        type: 'persoonlijk', location: '', customerId: '', customerName: '',
        note: 'Cadeau regelen.', recurrence: 'yearly', recurrenceEndDate: '',
        reminder: true, completed: false },
      { id: 'a_5', title: 'Belasting aangifte BTW Q2', date: '2026-07-31', time: null, endtime: null,
        type: 'afspraak', location: '', customerId: '', customerName: '',
        note: 'Indienen voor 31 juli.', recurrence: 'none', recurrenceEndDate: '',
        reminder: true, completed: false }
    ],

    // ═══ Handmatige statistiek-correcties ═══
    // Deze waarden worden door de gebruiker in Instellingen → Statistieken
    // aanpassen opgeteld bij de berekende dashboard-statistieken.
    // Standaardwaarde = 0 (geen correctie → originele berekende waarden).
    manualStats: {
      winst:          0,   // opgeteld bij totale winst
      omzet:          0,   // opgeteld bij omzet
      geinvesteerd:   0,   // opgeteld bij geïnvesteerd
      voorraadwaarde: 0,   // opgeteld bij voorraadwaarde
      klanten:        0    // opgeteld bij klanten-aantal
    },

    // ═══ Admin-gebruikers (login) ═══
    // Worden door login.js uitgelezen om inloggen te valideren.
    // passwordHash wordt bij init() berekend via SHA-256 van 'lagenco123'
    // (asynchroon, vandaar dat het hier nog niet staat — init() vult het in).
    // In productie: verander het wachtwoord via Instellingen → Beheer.
    adminUsers: [
      { uid: 'admin_1', email: 'admin@lagenco.nl', name: 'Bart van Lagen', passwordHash: '', role: 'owner' }
    ],

    catalogus: [] // computed dynamically from producten + voorraad + verkoop
  };

  const SEED_COLLECTIONS = Object.keys(SEED);

  // ────────────────────────────────────────────────────────
  // Initialize — push seed to Firebase if bp/ is empty
  // ────────────────────────────────────────────────────────
  let initialized = false;
  const initCallbacks = [];
  function onInit(cb) {
    if (initialized) cb();
    else initCallbacks.push(cb);
  }

  async function init() {
    if (initialized) return;
    if (!window.LagencoDB || !window.LagencoDB.isConfigured) {
      console.warn('[BP] LagencoDB not configured — running with empty cache');
      initialized = true;
      initCallbacks.forEach(cb => { try { cb(); } catch (e) {} });
      return;
    }

    // Wait for LagencoDB.syncAll to populate cache
    if (typeof window.LagencoDB.syncAll === 'function') {
      try { await window.LagencoDB.syncAll(); } catch (e) { console.warn('[BP] syncAll failed', e); }
    }

    // ── Voor seeding: bereken passwordHash voor adminUsers asynchroon ──
    // Dit gebeurt alleen bij initiële seeding (als Firebase nog leeg is).
    // We gebruiken de Web Crypto API (SHA-256). De hash van 'lagenco123' wordt
    // éénmalig berekend en in de SEED gezet vóór pushen naar Firebase.
    try {
      const fb = window.LagencoDB._cache.bp;
      const hasData = SEED_COLLECTIONS.some(k => {
        const v = fb[k];
        return v && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0);
      });
      if (!hasData) {
        // Vul passwordHash in vóór seeden (alleen als deze nog leeg is)
        if (SEED.adminUsers && SEED.adminUsers.length && !SEED.adminUsers[0].passwordHash) {
          try {
            const buf = new TextEncoder().encode('lagenco123');
            const hashBuf = await crypto.subtle.digest('SHA-256', buf);
            const hash = Array.from(new Uint8Array(hashBuf))
              .map(function (b) { return b.toString(16).padStart(2, '0'); })
              .join('');
            SEED.adminUsers.forEach(function (u) { u.passwordHash = hash; });
          } catch (e) {
            console.warn('[BP] Kon passwordHash niet berekenen:', e.message);
          }
        }
        console.log('[BP] Seeding Firebase bp/ with initial data...');
        // Push each collection to Firebase
        for (const k of SEED_COLLECTIONS) {
          await window.LagencoDB.bpSave(k, SEED[k]);
        }
        console.log('[BP] Seed complete');
      }
    } catch (e) {
      console.warn('[BP] Seed failed', e);
    }

    initialized = true;
    initCallbacks.forEach(cb => { try { cb(); } catch (e) {} });
  }

  function reset() {
    if (!window.LagencoDB || !window.LagencoDB.isConfigured) return;
    SEED_COLLECTIONS.forEach(k => {
      window.LagencoDB.bpSave(k, SEED[k]);
    });
  }

  // ────────────────────────────────────────────────────────
  // Generic collection CRUD — sync API backed by LagencoDB cache
  // ────────────────────────────────────────────────────────
  function list(collection) {
    if (window.LagencoDB) {
      const v = window.LagencoDB.bpList(collection);
      if (v && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)) return v;
    }
    // Fallback to SEED if cache is empty (e.g., Firebase not yet synced)
    return SEED[collection] ? (Array.isArray(SEED[collection]) ? SEED[collection].slice() : SEED[collection]) : [];
  }
  function save(collection, items) {
    if (window.LagencoDB && window.LagencoDB.isConfigured) {
      window.LagencoDB.bpSave(collection, items);
    }
    return true;
  }
  function get(collection, id) {
    return list(collection).find(function (x) { return x.id === id; });
  }
  function add(collection, item) {
    const items = list(collection);
    const newItem = Object.assign({ id: uid(collection.slice(0, 2)), createdAt: nowISO() }, item);
    items.unshift(newItem);
    save(collection, items);
    return newItem;
  }
  function update(collection, id, patch) {
    const items = list(collection);
    const idx = items.findIndex(function (x) { return x.id === id; });
    if (idx === -1) return null;
    items[idx] = Object.assign({}, items[idx], patch, { updatedAt: nowISO() });
    save(collection, items);
    return items[idx];
  }
  function remove(collection, id) {
    const items = list(collection).filter(function (x) { return x.id !== id; });
    save(collection, items);
    return true;
  }

  // ────────────────────────────────────────────────────────
  // Computed metrics (unchanged from v1)
  // ────────────────────────────────────────────────────────
  function computeProductMetrics(p) {
    const cost = parseNum(p.costPrice);
    const sell = parseNum(p.sellPrice);
    const sold = parseNum(p.sold);
    const profit = sell - cost;
    const margin = sell > 0 ? (profit / sell) * 100 : 0;
    const rom = cost > 0 ? (profit / cost) * 100 : 0;
    const totalRealized = profit * sold;
    return {
      cost: cost, sell: sell, sold: sold,
      profit: profit, margin: margin, rom: rom,
      totalRealized: totalRealized
    };
  }

  function dashboardStats() {
    const producten = list('producten');
    const voorraad = list('voorraad');
    const verkoop = list('verkoop');
    const inkoop = list('inkoop');

    let totalInvested = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalStockValue = 0;
    let totalUnits = 0;

    inkoop.forEach(function (i) { totalInvested += parseNum(i.totalCost); });
    verkoop.forEach(function (s) {
      totalRevenue += parseNum(s.sellPrice);
      totalProfit += parseNum(s.profit);
    });
    voorraad.forEach(function (v) {
      const p = producten.find(function (x) { return x.id === v.productId; });
      const cost = p ? parseNum(p.costPrice) : 0;
      totalStockValue += cost * parseNum(v.stock);
      totalUnits += parseNum(v.stock);
    });

    const avgMargin = verkoop.length > 0
      ? (verkoop.reduce(function (a, s) { return a + (parseNum(s.profit) / Math.max(parseNum(s.sellPrice), 1)) * 100; }, 0) / verkoop.length)
      : 0;

    const lowStock = voorraad.filter(function (v) { return parseNum(v.stock) <= parseNum(v.minStock); });

    // ── Handmatige correcties ophalen (standaard 0) ──
    const ms = getManualStats();

    return {
      totalProducts: producten.length,
      totalUnits: totalUnits,
      totalInvested: totalInvested + ms.geinvesteerd,
      totalRevenue: totalRevenue + ms.omzet,
      totalProfit: totalProfit + ms.winst,
      totalStockValue: totalStockValue + ms.voorraadwaarde,
      avgMargin: avgMargin,
      salesCount: verkoop.length,
      purchasesCount: inkoop.length,
      lowStockCount: lowStock.length,
      lowStock: lowStock,
      customersCount: list('klanten').length + ms.klanten,
      activeListings: list('marktplaats').filter(function (m) { return m.status !== 'Verkocht'; }).length
    };
  }

  function salesOverTime() {
    const verkoop = list('verkoop');
    const map = {};
    verkoop.forEach(function (s) {
      const d = new Date(s.date);
      if (isNaN(d)) return;
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!map[key]) map[key] = { revenue: 0, profit: 0, count: 0 };
      map[key].revenue += parseNum(s.sellPrice);
      map[key].profit += parseNum(s.profit);
      map[key].count += 1;
    });
    return Object.keys(map).sort().map(function (k) {
      return Object.assign({ month: k }, map[k]);
    });
  }

  // ────────────────────────────────────────────────────────
  // Periode-filter voor de dashboard-winst
  // Ondersteunde perioden: 'today' | '7weeks' | '1month' | 'always'
  // ────────────────────────────────────────────────────────
  function profitInPeriod(period) {
    const verkoop = list('verkoop');
    const now = new Date();
    let since = null;

    if (period === 'today') {
      // Begin van vandaag (00:00 uur, locale NL)
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === '7weeks') {
      // 7 weken = 49 dagen geleden
      since = new Date(now.getTime() - 49 * 24 * 60 * 60 * 1000);
    } else if (period === '1month') {
      // 1 kalendermaand geleden
      since = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    } else {
      // 'always' of onbekend → geen filter
      since = null;
    }

    let revenue = 0;
    let profit = 0;
    let count = 0;
    verkoop.forEach(function (s) {
      const d = new Date(s.date);
      if (isNaN(d)) return;
      if (since && d < since) return;
      revenue += parseNum(s.sellPrice);
      profit += parseNum(s.profit);
      count += 1;
    });

    return { revenue: revenue, profit: profit, count: count, period: period || 'always' };
  }

  // ────────────────────────────────────────────────────────
  // Handmatige statistiek-correcties (manualStats)
  // — opgeslagen als bp/manualStats in Firebase
  // — standaardwaarden: alle 0 (= originele berekende waarden)
  // ────────────────────────────────────────────────────────
  const MANUAL_KEYS = ['winst', 'omzet', 'geinvesteerd', 'voorraadwaarde', 'klanten'];

  function getManualStats() {
    // Lees uit Firebase cache (via LagencoDB.bpList) of fallback op SEED
    if (window.LagencoDB) {
      const v = window.LagencoDB.bpList('manualStats');
      // bpList geeft array terug; voor een objectwaarde moeten we het anders uitlezen
      if (Array.isArray(v) && v.length === 0) {
        //-cache leeg → fallback
      } else if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
        return normalizeManualStats(v[0]);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        return normalizeManualStats(v);
      }
    }
    // Fallback op SEED
    const seed = SEED.manualStats;
    return normalizeManualStats(seed);
  }

  function normalizeManualStats(obj) {
    const o = obj || {};
    const out = {};
    MANUAL_KEYS.forEach(function (k) {
      out[k] = parseNum(o[k]);
    });
    return out;
  }

  function setManualStats(stats) {
    const clean = normalizeManualStats(stats);
    if (window.LagencoDB && window.LagencoDB.isConfigured) {
      // Sla op als array met één object — consistent met de rest van bp/{collection}
      window.LagencoDB.bpSave('manualStats', [clean]);
    }
    return clean;
  }

  function adjustManualStat(key, delta) {
    if (MANUAL_KEYS.indexOf(key) === -1) return null;
    const current = getManualStats();
    current[key] = current[key] + parseNum(delta);
    return setManualStats(current);
  }

  function resetManualStats() {
    const reset = {};
    MANUAL_KEYS.forEach(function (k) { reset[k] = 0; });
    return setManualStats(reset);
  }

  function categoryBreakdown() {
    const producten = list('producten');
    const map = {};
    producten.forEach(function (p) {
      const cat = p.category || 'Overig';
      if (!map[cat]) map[cat] = { count: 0, stockValue: 0, realizedProfit: 0 };
      const m = computeProductMetrics(p);
      map[cat].count += 1;
      map[cat].realizedProfit += m.totalRealized;
      const v = list('voorraad').find(function (x) { return x.productId === p.id; });
      if (v) map[cat].stockValue += m.cost * parseNum(v.stock);
    });
    return Object.keys(map).map(function (k) {
      return Object.assign({ category: k }, map[k]);
    });
  }

  function buildCatalogus() {
    const producten = list('producten');
    const voorraad = list('voorraad');
    const verkoop = list('verkoop');
    return producten.map(function (p) {
      const v = voorraad.find(function (x) { return x.productId === p.id; });
      const stock = v ? parseNum(v.stock) : 0;
      const sales = verkoop.filter(function (s) { return s.product === p.name; });
      const totalSold = sales.length;
      const totalProfit = sales.reduce(function (a, s) { return a + parseNum(s.profit); }, 0);
      const m = computeProductMetrics(p);
      const lastSale = sales.length > 0
        ? sales.sort(function (a, b) { return new Date(b.date) - new Date(a.date); })[0].date
        : null;
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        stock: stock,
        costPrice: m.cost,
        avgSellPrice: m.sell,
        totalSold: totalSold,
        totalProfit: totalProfit,
        lastSale: lastSale,
        status: stock === 0 ? 'Uitverkocht' : (stock <= 1 ? 'Laag' : 'Op voorraad')
      };
    });
  }

  // ────────────────────────────────────────────────────────
  // Import / Export
  // ────────────────────────────────────────────────────────
  function exportAll() {
    const data = { meta: list('meta'), version: VERSION, exportedAt: nowISO() };
    ['producten', 'voorraad', 'inkoop', 'verkoop', 'klanten', 'tracking', 'marktplaats', 'research', 'werknemers', 'agenda'].forEach(function (k) {
      data[k] = list(k);
    });
    return data;
  }
  function importAll(data) {
    if (!data || typeof data !== 'object') return false;
    try {
      ['producten', 'voorraad', 'inkoop', 'verkoop', 'klanten', 'tracking', 'marktplaats', 'research', 'werknemers', 'agenda'].forEach(function (k) {
        if (Array.isArray(data[k])) save(k, data[k]);
      });
      if (data.meta) save('meta', data.meta);
      return true;
    } catch (e) {
      console.warn('[BP] import failed', e);
      return false;
    }
  }

  // ────────────────────────────────────────────────────────
  // WEEKVERGELIJKING — deze week vs vorige week
  // Geeft een object met metrics voor beide weken + delta's,
  // zodat het dashboard en het PDF-rapport dezelfde data gebruiken.
  // Week = 7 dagen, eindigend op vandaag (dus "deze week" = laatste 7
  // dagen incl. vandaag, "vorige week" = de 7 dagen daarvoor).
  // ────────────────────────────────────────────────────────

  /**
   * Bereken alle week-statistieken voor één 7-daagse periode.
   * @param {Date} start  - Startdatum (inclusief, middernacht)
   * @param {Date} end    - Einddatum (exclusief, dus start + 7 dagen)
   * @returns {Object}    - { revenue, profit, salesCount, newCustomers, lowStockCount, topProducts[] }
   */
  function computeWeekStats(start, end) {
    const verkoop = list('verkoop') || [];
    const klanten = list('klanten') || [];
    const voorraad = list('voorraad') || [];
    const producten = list('producten') || [];

    const startMs = start.getTime();
    const endMs = end.getTime();

    // Verkopen in deze periode
    const periodSales = verkoop.filter(function (s) {
      const d = parseDate(s.date);
      return d && d.getTime() >= startMs && d.getTime() < endMs;
    });

    let revenue = 0, profit = 0;
    periodSales.forEach(function (s) {
      revenue += parseNum(s.sellPrice);
      profit += parseNum(s.profit);
    });

    // Nieuwe klanten in deze periode
    const newCustomers = klanten.filter(function (k) {
      const d = parseDate(k.date);
      return d && d.getTime() >= startMs && d.getTime() < endMs;
    }).length;

    // Lage-voorraad-meldingen (snapshot op nu — we kunnen niet terugkijken
    // in de tijd, dus we gebruiken de huidige voorraad-status als proxy)
    const lowStockCount = voorraad.filter(function (v) {
      return parseNum(v.stock) <= parseNum(v.minStock);
    }).length;

    // Top 3 bestverkochte producten in deze periode
    const productCounts = {};
    periodSales.forEach(function (s) {
      const name = s.product || '(onbekend)';
      if (!productCounts[name]) productCounts[name] = { name: name, count: 0, revenue: 0, profit: 0 };
      productCounts[name].count += 1;
      productCounts[name].revenue += parseNum(s.sellPrice);
      productCounts[name].profit += parseNum(s.profit);
    });
    const topProducts = Object.values(productCounts)
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 3);

    return {
      revenue: revenue,
      profit: profit,
      salesCount: periodSales.length,
      newCustomers: newCustomers,
      lowStockCount: lowStockCount,
      topProducts: topProducts,
      sales: periodSales  // ruwe verkopen voor eventueel extra analyse
    };
  }

  /** Percentage verandering, veilig tegen deling door nul. */
  function pctChange(curr, prev) {
    if (prev === 0) return curr === 0 ? 0 : 100; // 0 → X = +100% (of 0 → 0 = 0%)
    return ((curr - prev) / Math.abs(prev)) * 100;
  }

  /**
   * Hoofdfunctie: geef vergelijking deze-week vs vorige-week.
   * @param {Date} [refDate]  - Referentiedatum (default: vandaag)
   * @returns {Object} { current: {...}, previous: {...}, deltas: {...}, period: { currentStart, currentEnd, ... } }
   */
  function weeklyComparison(refDate) {
    const now = refDate ? new Date(refDate) : new Date();
    // "Deze week" = afgelopen 7 dagen (vandaag incl. 6 dagen terug)
    const currentEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1); // exclusief (middernacht morgen)
    const currentStart = new Date(currentEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    // "Vorige week" = 7 dagen daarvoor
    const previousEnd = currentStart;
    const previousStart = new Date(previousEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const current = computeWeekStats(currentStart, currentEnd);
    const previous = computeWeekStats(previousStart, previousEnd);

    return {
      period: {
        currentStart: fmtDate(currentStart),
        currentEnd: fmtDate(new Date(currentEnd.getTime() - 1)),
        previousStart: fmtDate(previousStart),
        previousEnd: fmtDate(new Date(previousEnd.getTime() - 1))
      },
      current: current,
      previous: previous,
      deltas: {
        revenue: { abs: current.revenue - previous.revenue, pct: pctChange(current.revenue, previous.revenue) },
        profit:  { abs: current.profit - previous.profit,  pct: pctChange(current.profit, previous.profit) },
        salesCount: { abs: current.salesCount - previous.salesCount, pct: pctChange(current.salesCount, previous.salesCount) },
        newCustomers: { abs: current.newCustomers - previous.newCustomers, pct: pctChange(current.newCustomers, previous.newCustomers) },
        lowStockCount: { abs: current.lowStockCount - previous.lowStockCount, pct: pctChange(current.lowStockCount, previous.lowStockCount) }
      }
    };
  }

  // ────────────────────────────────────────────────────────
  // AGENDA — recurrence-expansie + kleur-mapping
  // Een "raw" agenda-item heeft één vaste datum + optionele recurrence.
  // De view-laag krijgt via expandAgendaEvents() een platte lijst van
  // "voorkomens" (occurrences) voor een opgegeven periode, zodat de
  // kalender-grid alleen maar hoeft te tekenen wat er in beeld is.
  // ────────────────────────────────────────────────────────

  /**
   * @typedef {Object} AgendaEvent
   * @property {string} id           - Origineel item-id
   * @property {string} occurrenceId - Unieke id voor dit voorkomen (id + datum)
   * @property {string} title
   * @property {string} date         - YYYY-MM-DD van dit voorkomen
   * @property {string|null} time
   * @property {string|null} endtime
   * @property {string} type         - 'afspraak' | 'persoonlijk' | 'notitie'
   * @property {string} location
   * @property {string} customerId
   * @property {string} customerName
   * @property {string} note
   * @property {string} recurrence   - 'none' | 'weekly' | 'monthly' | 'yearly'
   * @property {boolean} reminder
   * @property {boolean} completed
   * @property {boolean} isOccurrence - true als dit een herhalings-exemplaar is
   */

  /** Map type → CSS-kleur-token (wordt door de view-laag opgepikt). */
  const AGENDA_TYPE_META = {
    afspraak:   { color: 'primary',   icon: 'fa-handshake',     label: 'Afspraak'   },
    persoonlijk:{ color: 'lavender',  icon: 'fa-user',          label: 'Persoonlijk'},
    notitie:    { color: 'warn',      icon: 'fa-note-sticky',   label: 'Notitie'    }
  };

  /** Toegestane recurrence-soorten — centraal gedefinieerd i.v.m. codekwaliteit. */
  const AGENDA_RECURRENCE_TYPES = ['none', 'weekly', 'monthly', 'yearly'];

  /** Lees agenda-items als array (altijd array, zelfs als Firebase nog leeg is). */
  function listAgenda() {
    const v = list('agenda');
    return Array.isArray(v) ? v : [];
  }

  /** Parse een YYYY-MM-DD string als lokale Date (middernacht). */
  function parseDate(s) {
    if (!s || typeof s !== 'string') return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }

  /** Format een Date naar YYYY-MM-DD (lokaal, geen UTC-shift). */
  function fmtDate(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  /**
   * Expandeer een enkel raw agenda-item tot een lijst voorkomens binnen [start, end].
   * Een eenmalig item (recurrence === 'none') levert maximaal 1 voorkomen op.
   * Herhalende items worden uitgerold tot aan recurrenceEndDate of de einddatum
   * van de opgevraagde periode (wat het eerst komt).
   * @param {Object} item
   * @param {Date} start
   * @param {Date} end
   * @returns {AgendaEvent[]}
   */
  function expandAgendaItem(item, start, end) {
    if (!item || !item.date) return [];
    const baseDate = parseDate(item.date);
    if (!baseDate) return [];

    const recurrence = item.recurrence || 'none';
    const recurrenceEnd = item.recurrenceEndDate ? parseDate(item.recurrenceEndDate) : null;

    const occurrences = [];
    const cap = 500; // veiligheids-limit tegen oneindige loops bij fouten
    let cur = new Date(baseDate);
    let n = 0;

    while (cur <= end && n < cap) {
      n++;
      // Stoppen als dit voorkomen voor de opgevraagde periode ligt → ga door naar volgende
      if (cur >= start) {
        occurrences.push({
          id: item.id,
          occurrenceId: item.id + '_' + fmtDate(cur),
          title: item.title || '(zonder titel)',
          date: fmtDate(cur),
          time: item.time || null,
          endtime: item.endtime || null,
          type: item.type || 'afspraak',
          location: item.location || '',
          customerId: item.customerId || '',
          customerName: item.customerName || '',
          note: item.note || '',
          recurrence: recurrence,
          reminder: !!item.reminder,
          completed: !!item.completed,
          isOccurrence: cur.getTime() !== baseDate.getTime()
        });
      }

      if (recurrence === 'none') break;
      if (recurrenceEnd && cur > recurrenceEnd) break;

      if (recurrence === 'weekly') {
        cur.setDate(cur.getDate() + 7);
      } else if (recurrence === 'monthly') {
        // Behoud dag-van-de-maand waar mogelijk (accepteer 28+ → einde maand)
        const day = baseDate.getDate();
        const nextMonth = cur.getMonth() + 1;
        const nextMonthDate = new Date(cur.getFullYear(), nextMonth, day);
        if (isNaN(nextMonthDate) || nextMonthDate.getMonth() !== (nextMonth % 12)) {
          // Dag bestaat niet in volgende maand → val terug op laatste dag
          cur = new Date(cur.getFullYear(), nextMonth + 1, 0);
        } else {
          cur = nextMonthDate;
        }
      } else if (recurrence === 'yearly') {
        cur.setFullYear(cur.getFullYear() + 1);
      } else {
        break;
      }
    }
    return occurrences;
  }

  /**
   * Geef alle agenda-voorkomens binnen een periode, gesorteerd op datum+tijd.
   * @param {Date} start
   * @param {Date} end
   * @returns {AgendaEvent[]}
   */
  function expandAgendaEvents(start, end) {
    if (!(start instanceof Date) || !(end instanceof Date)) return [];
    const all = [];
    listAgenda().forEach(function (item) {
      Array.prototype.push.apply(all, expandAgendaItem(item, start, end));
    });
    all.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const at = a.time || 'zz';
      const bt = b.time || 'zz';
      return at < bt ? -1 : (at > bt ? 1 : 0);
    });
    return all;
  }

  /**
   * Voorkomens voor één specifieke datum (YYYY-MM-DD).
   * @param {string} yyyy_mm_dd
   * @returns {AgendaEvent[]}
   */
  function agendaEventsOnDay(yyyy_mm_dd) {
    const d = parseDate(yyyy_mm_dd);
    if (!d) return [];
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    return expandAgendaEvents(start, end);
  }

  /**
   * Agendastatistieken voor het dashboard-widget "komende afspraken":
   * telt items waarvan de datum+tijd binnen `daysAhead` dagen valt,
   * 'reminder' aan staat, en 'completed' uit staat.
   * @param {number} daysAhead
   * @returns {{ total: number, items: AgendaEvent[] }}
   */
  function upcomingAgenda(daysAhead) {
    const days = Math.max(0, Math.min(60, Number(daysAhead) || 7));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    const items = expandAgendaEvents(start, end).filter(function (e) {
      if (e.completed) return false;
      if (!e.reminder) return false;
      // Verberg notities zonder tijd NIET — ze mogen wel in de herinnering
      // verschijnen, maar alleen op de huidige/direct toekomstige datum.
      return true;
    });
    return { total: items.length, items: items };
  }

  /**
   * Toggle het 'completed' veld van een raw agenda-item.
   * Werkt op het originele item (niet op een voorkomen) — bij herhalende items
   * wordt het hele item gemarkeerd. Dit is een bewuste keuze voor eenvoud;
   * een "uitzondering op één voorkomen" toevoegen kan in een latere iteratie.
   * @param {string} id
   * @returns {Object|null}
   */
  function toggleAgendaCompleted(id) {
    const item = get('agenda', id);
    if (!item) return null;
    return update('agenda', id, { completed: !item.completed });
  }

  // ────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────
  window.BPData = {
    init: init,
    onInit: onInit,
    reset: reset,
    list: list,
    save: save,
    get: get,
    add: add,
    update: update,
    remove: remove,
    uid: uid,
    parseNum: parseNum,
    fmtEuro: fmtEuro,
    fmtEuro0: fmtEuro0,
    fmtNum: fmtNum,
    fmtPct: fmtPct,
    computeProductMetrics: computeProductMetrics,
    dashboardStats: dashboardStats,
    salesOverTime: salesOverTime,
    profitInPeriod: profitInPeriod,
    getManualStats: getManualStats,
    setManualStats: setManualStats,
    adjustManualStat: adjustManualStat,
    resetManualStats: resetManualStats,
    MANUAL_STATS_KEYS: MANUAL_KEYS,
    categoryBreakdown: categoryBreakdown,
    buildCatalogus: buildCatalogus,
    exportAll: exportAll,
    importAll: importAll,
    // ── Agenda API ──
    parseDate: parseDate,
    fmtDate: fmtDate,
    expandAgendaEvents: expandAgendaEvents,
    agendaEventsOnDay: agendaEventsOnDay,
    upcomingAgenda: upcomingAgenda,
    toggleAgendaCompleted: toggleAgendaCompleted,
    AGENDA_TYPE_META: AGENDA_TYPE_META,
    AGENDA_RECURRENCE_TYPES: AGENDA_RECURRENCE_TYPES,
    // ── Weekvergelijking API ──
    weeklyComparison: weeklyComparison,
    computeWeekStats: computeWeekStats,
    pctChange: pctChange,
    SEED: SEED
  };

  // Auto-init (async, fires callbacks when ready)
  init();
})(window);
