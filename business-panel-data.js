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

    // Seed if Firebase bp/ is empty
    try {
      const fb = window.LagencoDB._cache.bp;
      const hasData = SEED_COLLECTIONS.some(k => {
        const v = fb[k];
        return v && (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0);
      });
      if (!hasData) {
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

    return {
      totalProducts: producten.length,
      totalUnits: totalUnits,
      totalInvested: totalInvested,
      totalRevenue: totalRevenue,
      totalProfit: totalProfit,
      totalStockValue: totalStockValue,
      avgMargin: avgMargin,
      salesCount: verkoop.length,
      purchasesCount: inkoop.length,
      lowStockCount: lowStock.length,
      lowStock: lowStock,
      customersCount: list('klanten').length,
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
    ['producten', 'voorraad', 'inkoop', 'verkoop', 'klanten', 'tracking', 'marktplaats', 'research', 'werknemers'].forEach(function (k) {
      data[k] = list(k);
    });
    return data;
  }
  function importAll(data) {
    if (!data || typeof data !== 'object') return false;
    try {
      ['producten', 'voorraad', 'inkoop', 'verkoop', 'klanten', 'tracking', 'marktplaats', 'research', 'werknemers'].forEach(function (k) {
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
    categoryBreakdown: categoryBreakdown,
    buildCatalogus: buildCatalogus,
    exportAll: exportAll,
    importAll: importAll,
    SEED: SEED
  };

  // Auto-init (async, fires callbacks when ready)
  init();
})(window);
