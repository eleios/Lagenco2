/* ═══════════════════════════════════════════════════════
   LAGENCO — Premium Script (v2)
   Features: dark mode, search, filters, sort, wishlist, compare,
   share, toast notifications, drag-reorder gallery, edit products,
   skeleton loaders, related products, scroll reveal, carousel,
   interactive timeline, image zoom, back-to-top, breadcrumbs,
   contact form validation, recently viewed, accessibility.
   ═══════════════════════════════════════════════════════ */

'use strict';

// ────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────
const PLACEHOLDER_IMAGE = 'https://images.unsplash.net/photo-1503602642458-232111445657?w=500&q=80';
const AUTH = { email: 'admin@lagenco.nl', password: 'lagenco123' };
const PAGE = document.body.dataset.page;
const MAX_IMAGES = 8;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// ────────────────────────────────────────────────────────
// Storage helpers — Firebase is de enige source-of-truth.
// In-memory cache wordt gevuld door LagencoDB.startPolling()
// (real-time listeners). Visitor-specifieke data (wishlist,
// compare, recent) leeft onder /visitors/{visitorId}/{key}.
// Auth-state zit in sessionStorage (geen localStorage).
// ────────────────────────────────────────────────────────
const storage = {
  get: (key, fallback = null) => {
    // Legacy localStorage reads — returns fallback because we no
    // longer persist anything in localStorage. Real reads happen
    // through the dedicated getters below.
    return fallback;
  },
  set: (key, value) => {
    // No-op — all persistence goes through LagencoDB (Firebase).
    return true;
  }
};

// ── Producten (website) ──
const getProducts    = ()        => (window.LagencoDB ? window.LagencoDB.getProducts() : []);
const saveProducts   = products  => {
  // Batch-save: write every product to Firebase individually.
  // Used by cleanup flows that filter the entire list.
  if (window.LagencoDB && window.LagencoDB.isConfigured) {
    products.forEach(p => { window.LagencoDB.saveProduct(p); });
  }
};

// ── Auth state (sessionStorage, NOT localStorage, NOT Firebase) ──
const isLoggedIn     = ()        => (window.LagencoDB ? window.LagencoDB.getAuth() : false);
const setLoggedIn    = v         => {
  if (window.LagencoDB) window.LagencoDB.setAuth(v);
  try { window.dispatchEvent(new CustomEvent('lagenco:auth-change', { detail: { logged: v } })); } catch(e){}
};

// ── Visitor data (wishlist / compare / recent) — Firebase ──
const getWishlist    = ()        => { const v = window.LagencoDB ? window.LagencoDB.getVisitor('wishlist') : null; return Array.isArray(v) ? v : []; };
const saveWishlist   = list      => { if (window.LagencoDB) window.LagencoDB.setVisitor('wishlist', list); };
const getCompare     = ()        => { const v = window.LagencoDB ? window.LagencoDB.getVisitor('compare') : null; return Array.isArray(v) ? v : []; };
const saveCompare    = list      => { if (window.LagencoDB) window.LagencoDB.setVisitor('compare', list); };
const getRecent      = ()        => { const v = window.LagencoDB ? window.LagencoDB.getVisitor('recent') : null; return Array.isArray(v) ? v : []; };
const saveRecent     = list      => { if (window.LagencoDB) window.LagencoDB.setVisitor('recent', list); };

// ── Condition grades (Back Market style) ──
const CONDITION_GRADES = [
  { value: 'excellent',  stars: 5, label: 'Excellent',  desc: 'Als nieuw',            short: 'Exc.' },
  { value: 'goed',       stars: 4, label: 'Goed',       desc: 'Lichte gebruikssporen', short: 'Goed' },
  { value: 'redelijk',   stars: 3, label: 'Redelijk',   desc: 'Zichtbare slijtage',    short: 'Red.' },
  { value: 'beschadigd', stars: 2, label: 'Beschadigd',  desc: 'Functioneel, met cosmetische schade', short: 'Besch.' }
];
const getConditionGrade = (value) => CONDITION_GRADES.find(g => g.value === value) || CONDITION_GRADES[0];
const renderConditionStars = (value, opts = {}) => {
  const g = getConditionGrade(value);
  const showLabel = opts.showLabel !== false;
  const compact = opts.compact === true;
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<i class="fa${i < g.stars ? 's' : 'r'} fa-star" aria-hidden="true"></i>`
  ).join('');
  return `<span class="condition-grade condition-grade--${g.value}" data-grade="${g.value}" title="${g.label} — ${g.desc}">
    <span class="condition-grade__stars" aria-hidden="true">${stars}</span>
    ${showLabel ? `<span class="condition-grade__label">${compact ? g.short : g.label}</span>` : ''}
  </span>`;
};

// ────────────────────────────────────────────────────────
// Toast notifications (improved with aria-live)
// ────────────────────────────────────────────────────────
const toast = (() => {
  const icons = { success: 'fa-check', error: 'fa-times', info: 'fa-info', warn: 'fa-exclamation' };

  return (message, type = 'success', duration = 3200) => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.style.position = 'relative';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="toast-icon"><i class="fas ${icons[type] || icons.info}"></i></div>
      <span>${message}</span>
      <button class="toast-close" aria-label="Sluiten"><i class="fas fa-times"></i></button>
      <div class="toast-progress"></div>`;
    container.appendChild(el);

    const closeBtn = el.querySelector('.toast-close');
    let timer = setTimeout(() => dismiss(), duration);
    const dismiss = () => {
      clearTimeout(timer);
      el.classList.add('hide');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    };
    closeBtn.addEventListener('click', dismiss);

    requestAnimationFrame(() => { el.classList.add('show'); });
  };
})();

// ────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────
const fmt = (v) => `€ ${Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const getImg = (p) => (p.images?.length ? p.images[0] : p.image) || PLACEHOLDER_IMAGE;
const discountPct = (p) => p.oldPrice && p.price < p.oldPrice
  ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100)
  : null;

const badgeClass = (badge = '') => {
  const b = badge.toLowerCase();
  if (b.includes('nieuw'))    return 'badge-new';
  if (b.includes('retour'))   return 'badge-retour';
  if (b.includes('tweede') || b.includes('tweedehands')) return 'badge-used';
  if (b.includes('sale') || b.includes('aanbieding'))    return 'badge-sale';
  return 'badge-new';
};

const escapeHtml = (str = '') => String(str)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// ────────────────────────────────────────────────────────
// Image processing — downscale + compress via Canvas
// Reduces multi-megabyte uploads to ~150-200KB before storing in localStorage.
// Tries WEBP first (much smaller), falls back to JPEG.
// Uses createImageBitmap when available (off-main-thread decode).
// Falls back to FileReader.readAsDataURL for very old browsers.
// ────────────────────────────────────────────────────────
const PROC_MAX_DIM   = 1200;   // Max width or height in pixels
const PROC_QUALITY   = 0.85;   // JPEG/WEBP quality (0-1)
const PROC_TARGET_KB = 200;    // Soft target — used to log warnings if exceeded

const supportsWebp = (() => {
  try {
    const c = document.createElement('canvas');
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch { return false; }
})();

const processImage = (file, maxDim = PROC_MAX_DIM, quality = PROC_QUALITY) => {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('not-image'));
      return;
    }

    // Fallback: very old browsers without createImageBitmap or Image
    const fallback = () => {
      try {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('read-fail'));
        r.readAsDataURL(file);
      } catch (e) { reject(e); }
    };

    // Use createImageBitmap when available (off-main-thread decode, faster)
    const bitmapToDataUrl = (bitmap) => {
      let { width, height } = bitmap;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height / width) * maxDim);
          width = maxDim;
        } else {
          width = Math.round((width / height) * maxDim);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      // imageSmoothingEnabled + high quality for nicer downscaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // drawImage accepts ImageBitmap — preserves EXIF orientation
      ctx.drawImage(bitmap, 0, 0, width, height);
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      const mime = supportsWebp ? 'image/webp' : 'image/jpeg';
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL(mime, quality);
      } catch {
        // Some browsers refuse WEBP on canvas.toDataURL despite feature detection
        try { dataUrl = canvas.toDataURL('image/jpeg', quality); }
        catch (e2) { reject(e2); return; }
      }
      resolve(dataUrl);
    };

    if (typeof createImageBitmap === 'function') {
      createImageBitmap(file, { imageOrientation: 'from-image' })
        .then(bitmapToDataUrl)
        .catch(() => {
          // Fallback to Image element
          const img = new Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            // Wrap in a fake "bitmap-like" object for bitmapToDataUrl
            bitmapToDataUrl(img);
            URL.revokeObjectURL(url);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            fallback();
          };
          img.src = url;
        });
    } else {
      // No createImageBitmap — use Image element + Canvas
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        bitmapToDataUrl(img);
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        fallback();
      };
      img.src = url;
    }
  });
};

const approxDataUrlKb = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  // base64 portion length * 0.75 ≈ byte count (4 chars = 3 bytes)
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  return Math.round((b64.length * 0.75) / 1024);
};

// ────────────────────────────────────────────────────────
// Wishlist
// ────────────────────────────────────────────────────────
const updateWishlistCounter = () => {
  const count = getWishlist().length;
  document.querySelectorAll('[data-wishlist-count]').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
};

const toggleWishlist = (id) => {
  const list = getWishlist();
  const idx  = list.indexOf(id);
  if (idx === -1) {
    list.push(id);
    toast('Toegevoegd aan verlanglijst', 'success');
  } else {
    list.splice(idx, 1);
    toast('Verwijderd van verlanglijst', 'info');
  }
  saveWishlist(list);
  updateWishlistCounter();
  document.querySelectorAll(`[data-wishlist="${id}"]`).forEach(btn => {
    btn.classList.toggle('active', list.includes(id));
    if (list.includes(id)) {
      btn.classList.add('heart-pop');
      setTimeout(() => btn.classList.remove('heart-pop'), 400);
    }
  });
};

const isWishlisted = (id) => getWishlist().includes(id);

// ────────────────────────────────────────────────────────
// Compare products
// ────────────────────────────────────────────────────────
const updateCompareCounter = () => {
  const count = getCompare().length;
  document.querySelectorAll('[data-compare-count]').forEach(el => {
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
  const bar = document.getElementById('compareBar');
  if (bar) {
    bar.style.display = count > 0 ? 'flex' : 'none';
    const list = document.getElementById('compareList');
    if (list) {
      list.innerHTML = getCompare().map(id => {
        const p = getProducts().find(x => x.id === id);
        if (!p) return '';
        return `<div class="compare-item"><img src="${getImg(p)}" alt="${escapeHtml(p.title)}"><span>${escapeHtml(p.title)}</span><button data-action="rm-compare" data-id="${id}" aria-label="Verwijder"><i class="fas fa-times"></i></button></div>`;
      }).join('');
    }
  }
};

const toggleCompare = (id) => {
  const list = getCompare();
  const idx = list.indexOf(id);
  if (idx === -1) {
    if (list.length >= 3) { toast('Maximaal 3 producten vergelijken', 'warn'); return; }
    list.push(id);
    toast('Toegevoegd aan vergelijking', 'success');
  } else {
    list.splice(idx, 1);
    toast('Verwijderd uit vergelijking', 'info');
  }
  saveCompare(list);
  updateCompareCounter();
};

// ────────────────────────────────────────────────────────
// Recently viewed
// ────────────────────────────────────────────────────────
const addRecent = (id) => {
  let list = getRecent().filter(x => x !== id);
  list.unshift(id);
  if (list.length > 8) list = list.slice(0, 8);
  saveRecent(list);
};

// ────────────────────────────────────────────────────────
// Product Card HTML builders
// ────────────────────────────────────────────────────────
const buildCarouselCard = (product, admin = false) => {
  const img    = getImg(product);
  const disc   = discountPct(product);
  const bClass = badgeClass(product.badge);
  const wished = isWishlisted(product.id);
  const inCompare = getCompare().includes(product.id);
  const bidCount = (typeof getBids === 'function' ? getBidsForProduct(product.id).length : 0);
  const bidBadge = bidCount > 0
    ? `<span class="bid-count-badge" title="${bidCount} ${bidCount === 1 ? 'bod' : 'biedingen'} geplaatst"><i class="fas fa-gavel"></i> ${bidCount}</span>`
    : '';
  const discTag = disc
    ? `<span class="tag" style="background:#fef3c7;color:#92400e">-${disc}%</span>`
    : `<span class="tag" style="background:var(--green-light);color:var(--green)">Uitgelicht</span>`;

  return `
  <article class="card product-card carousel-item" data-product-id="${product.id}">
    <div class="card-img" data-action="view" data-id="${product.id}" style="cursor:pointer">
      <img src="${img}" alt="${escapeHtml(product.title)}" loading="lazy" decoding="async">
      <span class="badge ${bClass}"><i class="fas fa-tag"></i>${escapeHtml(product.badge || 'Uitgelicht')}</span>
      ${bidBadge}
      <div class="card-actions">
        <button class="action-btn ${wished ? 'active' : ''}" data-wishlist="${product.id}" title="Verlanglijst" aria-label="Toevoegen aan verlanglijst"><i class="fas fa-heart"></i></button>
        <button class="action-btn ${inCompare ? 'active' : ''}" data-action="compare" data-id="${product.id}" title="Vergelijken" aria-label="Toevoegen aan vergelijking"><i class="fas fa-balance-scale"></i></button>
        <button class="action-btn" data-action="share" data-id="${product.id}" title="Delen" aria-label="Product delen"><i class="fas fa-share-alt"></i></button>
      </div>
    </div>
    <div class="p-5">
      <h3 class="font-semibold text-lg mb-1" style="color:var(--text)">${escapeHtml(product.title)}</h3>
      <div class="mb-2">${renderConditionStars(product.conditionGrade, { compact: true })}</div>
      <p class="text-sm mb-3" style="color:var(--text-muted)">${escapeHtml(product.description)}</p>
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div>
          ${product.oldPrice ? `<span class="text-xs line-through" style="color:var(--text-faint)">${fmt(product.oldPrice)}</span>` : ''}
          <span class="text-xl font-bold ml-1" style="color:var(--text)">${fmt(product.price)}</span>
        </div>
        ${discTag}
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <button class="btn btn-ghost" style="font-size:.8rem;padding:.5rem 1rem" data-action="view" data-id="${product.id}">Details</button>
        ${admin ? `<button class="btn" style="font-size:.8rem;padding:.5rem 1rem;background:#fee2e2;color:#ef4444" data-action="delete" data-id="${product.id}">Verwijderen</button>
                   <button class="btn" style="font-size:.8rem;padding:.5rem 1rem;background:var(--green-light);color:var(--green)" data-action="edit" data-id="${product.id}">Bewerken</button>` : ''}
      </div>
    </div>
  </article>`;
};

const buildGridCard = (product, admin = false) => {
  const img    = getImg(product);
  const disc   = discountPct(product);
  const bClass = badgeClass(product.badge);
  const wished = isWishlisted(product.id);
  const inCompare = getCompare().includes(product.id);
  const bidCount = (typeof getBids === 'function' ? getBidsForProduct(product.id).length : 0);
  const bidBadge = bidCount > 0
    ? `<span class="bid-count-badge" title="${bidCount} ${bidCount === 1 ? 'bod' : 'biedingen'} geplaatst"><i class="fas fa-gavel"></i> ${bidCount}</span>`
    : '';

  return `
  <article class="card product-card reveal" data-reveal data-product-id="${product.id}">
    <div class="card-img" data-action="view" data-id="${product.id}" style="cursor:pointer">
      <img src="${img}" alt="${escapeHtml(product.title)}" loading="lazy" decoding="async">
      <span class="badge ${bClass}"><i class="fas fa-tag"></i>${escapeHtml(product.badge || 'Uitgelicht')}</span>
      ${disc ? `<span class="badge" style="top:.75rem;right:.75rem;left:auto;background:var(--warm);color:white">-${disc}%</span>` : ''}
      ${bidBadge}
      <div class="card-actions">
        <button class="action-btn ${wished ? 'active' : ''}" data-wishlist="${product.id}" aria-label="Verlanglijst"><i class="fas fa-heart"></i></button>
        <button class="action-btn ${inCompare ? 'active' : ''}" data-action="compare" data-id="${product.id}" aria-label="Vergelijken"><i class="fas fa-balance-scale"></i></button>
        <button class="action-btn" data-action="share" data-id="${product.id}" aria-label="Delen"><i class="fas fa-share-alt"></i></button>
      </div>
    </div>
    <div class="p-6 flex flex-col" style="flex:1">
      <h3 class="text-xl font-semibold mb-2" style="color:var(--text)">${escapeHtml(product.title)}</h3>
      <div class="mb-2">${renderConditionStars(product.conditionGrade)}</div>
      <p class="text-sm mb-4" style="color:var(--text-muted);flex:1">${escapeHtml(product.description)}</p>
      <div class="flex items-center justify-between gap-3 flex-wrap mt-auto">
        <div>
          ${product.oldPrice ? `<div class="text-sm line-through" style="color:var(--text-faint)">${fmt(product.oldPrice)}</div>` : ''}
          <div class="text-2xl font-bold" style="color:var(--text)">${fmt(product.price)}</div>
        </div>
        <button class="btn btn-primary" data-action="view" data-id="${product.id}">Details</button>
      </div>
      ${admin ? `<div class="flex gap-2 mt-3">
        <button class="btn" style="font-size:.8rem;padding:.5rem 1rem;background:#fee2e2;color:#ef4444;flex:1" data-action="delete" data-id="${product.id}">Verwijderen</button>
        <button class="btn" style="font-size:.8rem;padding:.5rem 1rem;background:var(--green-light);color:var(--green);flex:1" data-action="edit" data-id="${product.id}">Bewerken</button>
      </div>` : ''}
    </div>
  </article>`;
};

const buildSkeletonCards = (n = 3) => Array(n).fill(`
  <div class="card" style="overflow:hidden">
    <div class="skeleton" style="aspect-ratio:4/3;border-radius:0"></div>
    <div class="p-5 space-y-3">
      <div class="skeleton" style="height:1.25rem;width:70%;border-radius:.5rem"></div>
      <div class="skeleton" style="height:.875rem;width:90%;border-radius:.5rem"></div>
      <div class="skeleton" style="height:.875rem;width:60%;border-radius:.5rem"></div>
      <div class="skeleton" style="height:2.5rem;width:40%;border-radius:100px;margin-top:.5rem"></div>
    </div>
  </div>`).join('');

const buildEmptyProductsCTA = (context = 'featured') => {
  const isAdmin = isLoggedIn();
  const loginAction = isAdmin
    ? ''
    : `<button type="button" class="btn btn-ghost" onclick="openModal('loginModal')"><i class="fas fa-sign-in-alt text-xs"></i> Admin login</button>`;
  const primaryBtn = context === 'assortiment'
    ? `<a href="index.html" class="btn btn-ghost"><i class="fas fa-home text-xs"></i> Terug naar home</a>`
    : `<a href="assortiment.html" class="btn btn-ghost"><i class="fas fa-th text-xs"></i> Bekijk assortiment</a>`;
  return `
    <div class="empty-state-cta">
      <div class="leaf-icon"><i class="fas fa-leaf"></i></div>
      <h3>Binnenkort producten hier</h3>
      <p>Wij werken momenteel aan het samenstellen van ons assortiment. Kom snel terug of log in als beheerder om zelf producten toe te voegen.</p>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;margin-top:.25rem">
        ${primaryBtn}
        ${loginAction}
      </div>
    </div>`;
};

// ────────────────────────────────────────────────────────
// Render Featured Carousel
// ────────────────────────────────────────────────────────
const renderFeatured = () => {
  const track   = document.getElementById('carouselTrack');
  const message = document.getElementById('featuredProductMessage');
  if (!track) return;

  const products = getProducts();
  if (!products.length) {
    track.innerHTML = '';
    // Replace track content with a centered empty-state CTA (one carousel "card" that spans full width)
    const wrapper = document.createElement('div');
    wrapper.style.flex = '0 0 100%';
    wrapper.style.maxWidth = '100%';
    wrapper.innerHTML = buildEmptyProductsCTA('featured');
    track.appendChild(wrapper);
    if (message) message.textContent = 'Nog geen producten — voeg er een toe via het adminpaneel.';
    if (typeof featuredCarousel.update === 'function') featuredCarousel.update();
    return;
  }
  if (message) message.textContent = `${products.length} uitgelichte producten`;
  track.innerHTML = products.map(p => buildCarouselCard(p, isLoggedIn())).join('');
  if (typeof featuredCarousel.update === 'function') featuredCarousel.update();
  if (typeof refreshPremiumEffects === 'function') refreshPremiumEffects();
};

// ────────────────────────────────────────────────────────
// Render Assortment Grid
// ────────────────────────────────────────────────────────
let assortState = { search: '', category: 'all', sort: 'featured', minPrice: 0, maxPrice: 99999 };

const badgeRank = (b = '') => {
  const bl = b.toLowerCase();
  if (bl.includes('nieuw'))  return 0;
  if (bl.includes('retour')) return 1;
  if (bl.includes('tweede')) return 2;
  return 3;
};

const getFilteredProducts = () => {
  let list = getProducts();
  const { search, category, sort, minPrice, maxPrice } = assortState;

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }
  if (category !== 'all') {
    list = list.filter(p => (p.badge || '').toLowerCase().includes(category));
  }
  list = list.filter(p => Number(p.price) >= minPrice && Number(p.price) <= maxPrice);

  switch (sort) {
    case 'price-asc':  list.sort((a,b) => a.price - b.price); break;
    case 'price-desc': list.sort((a,b) => b.price - a.price); break;
    case 'alpha':      list.sort((a,b) => a.title.localeCompare(b.title)); break;
    case 'newest':     list.sort((a,b) => (b.id > a.id ? 1 : -1)); break;
    default:           list.sort((a,b) => { const r = badgeRank(a.badge) - badgeRank(b.badge); return r !== 0 ? r : a.price - b.price; });
  }
  return list;
};

const renderAssortment = () => {
  const grid    = document.getElementById('productGrid');
  const counter = document.getElementById('productCollectionMessage');
  if (!grid) return;

  grid.innerHTML = buildSkeletonCards(6);

  setTimeout(() => {
    const allProducts = getProducts();
    const products = getFilteredProducts();
    if (counter) counter.textContent = `${products.length} ${products.length === 1 ? 'product' : 'producten'} gevonden`;

    // No products at all yet — show friendly CTA empty state
    if (!allProducts.length) {
      grid.innerHTML = `<div style="grid-column:1/-1">${buildEmptyProductsCTA('assortiment')}</div>`;
      return;
    }
    // Products exist, but filter yields nothing
    if (!products.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-box-open"></i><p class="text-lg font-medium mt-3" style="color:var(--text)">Geen producten gevonden</p><p class="text-sm mt-1" style="color:var(--text-muted)">Pas de filters aan of voeg producten toe via het adminpaneel.</p><button class="btn btn-ghost mt-4" onclick="resetFilters()">Filters resetten</button></div>`;
      return;
    }
    grid.innerHTML = products.map(p => buildGridCard(p, isLoggedIn())).join('');
    initScrollReveal();
    if (typeof refreshPremiumEffects === 'function') refreshPremiumEffects();
  }, 350);
};

window.resetFilters = () => {
  assortState = { search: '', category: 'all', sort: 'featured', minPrice: 0, maxPrice: 99999 };
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.value = 'featured';
  const priceRange = document.getElementById('priceRange');
  if (priceRange) { priceRange.value = priceRange.max; }
  const priceLabel = document.getElementById('priceLabel');
  if (priceLabel) priceLabel.textContent = fmt(priceRange.max);
  document.querySelectorAll('.filter-pill[data-category]').forEach(b => b.classList.remove('active'));
  document.querySelector('.filter-pill[data-category="all"]')?.classList.add('active');
  renderAssortment();
  toast('Filters gereset', 'info');
};

// ────────────────────────────────────────────────────────
// Search & Filters
// ────────────────────────────────────────────────────────
const initSearch = () => {
  const input = document.getElementById('searchInput');
  if (!input) return;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      assortState.search = input.value.trim();
      renderAssortment();
    }, 280);
  });
};

const initFilters = () => {
  document.querySelectorAll('.filter-pill[data-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill[data-category]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      assortState.category = btn.dataset.category;
      renderAssortment();
    });
  });

  const sortSel = document.getElementById('sortSelect');
  if (sortSel) sortSel.addEventListener('change', () => { assortState.sort = sortSel.value; renderAssortment(); });

  const priceRange = document.getElementById('priceRange');
  const priceLabel = document.getElementById('priceLabel');
  if (priceRange) {
    priceRange.addEventListener('input', () => {
      assortState.maxPrice = Number(priceRange.value);
      if (priceLabel) priceLabel.textContent = fmt(priceRange.value);
    });
    priceRange.addEventListener('change', () => renderAssortment());
  }
};

// ────────────────────────────────────────────────────────
// Delete product
// ────────────────────────────────────────────────────────
const deleteProduct = (id) => {
  if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.deleteProduct(id); }
  // also clean wishlist/recent/compare
  saveWishlist(getWishlist().filter(x => x !== id));
  saveRecent(getRecent().filter(x => x !== id));
  saveCompare(getCompare().filter(x => x !== id));
  updateWishlistCounter();
  updateCompareCounter();
  renderFeatured();
  if (PAGE === 'assortiment') renderAssortment();
  toast('Product verwijderd', 'error');
};

// ────────────────────────────────────────────────────────
// Product Detail Modal (FIXED TYPO + zoom + recent)
// ────────────────────────────────────────────────────────
let modalImgs = [];
let modalIdx  = 0;
let modalProduct = null;

const updateModalImage = () => {
  const main = document.getElementById('pmMainImage');
  const ctr  = document.getElementById('pmCounter');
  if (main && modalImgs[modalIdx] !== undefined) {
    main.src = modalImgs[modalIdx];
    main.alt = `Afbeelding ${modalIdx + 1} van ${modalProduct?.title || 'product'}`;
  }
  if (ctr) ctr.textContent = `${modalIdx + 1} / ${modalImgs.length}`;
  document.querySelectorAll('.pm-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === modalIdx);
  });
  // prev/next disabled state
  const prev = document.getElementById('pmPrev');
  const next = document.getElementById('pmNext');
  if (prev) prev.style.opacity = modalIdx === 0 ? '.4' : '1';
  if (next) next.style.opacity = modalIdx === modalImgs.length - 1 ? '.4' : '1';
};

const openProductModal = (id) => {
  const product = getProducts().find(p => p.id === id);
  if (!product) { toast('Product niet gevonden', 'error'); return; }

  modalProduct = product;
  modalImgs = product.images?.length ? product.images : [getImg(product)];
  modalIdx  = 0;
  addRecent(id);

  const q = (sel) => document.querySelector(sel);

  const title = q('#pmTitle');         if (title)     title.textContent    = product.title;
  const desc  = q('#pmDesc');          if (desc)      desc.textContent     = product.description;
  const price = q('#pmPrice');         if (price)     price.textContent    = fmt(product.price);
  const oldPr = q('#pmOldPrice');
  if (oldPr) oldPr.innerHTML = product.oldPrice ? `<span class="line-through text-sm" style="color:var(--text-faint)">${fmt(product.oldPrice)}</span>` : '';
  const status = q('#pmStatus');
  if (status) {
    const b   = (product.badge || '').toLowerCase();
    const lbl = b.includes('retour') ? 'Retour' : b.includes('tweede') ? 'Tweedehands' : b.includes('nieuw') ? 'Nieuw' : product.badge || 'Uitgelicht';
    const cls = b.includes('retour') ? 'badge-retour' : b.includes('tweede') ? 'badge-used' : 'badge-new';
    status.className = `badge ${cls}`;
    status.textContent = lbl;
    status.style.position = 'static';
  }
  const disc = discountPct(product);
  const discEl = q('#pmDiscount');
  if (discEl) { discEl.textContent = disc ? `-${disc}%` : ''; discEl.style.display = disc ? '' : 'none'; }

  // Product Condition Grade (Back Market style)
  const condEl = q('#pmConditionGrade');
  if (condEl) {
    const g = getConditionGrade(product.conditionGrade);
    const stars = Array.from({ length: 5 }, (_, i) =>
      `<i class="fa${i < g.stars ? 's' : 'r'} fa-star" aria-hidden="true"></i>`
    ).join('');
    condEl.innerHTML = `
      <div class="condition-grade condition-grade--lg condition-grade--${g.value}" data-grade="${g.value}" title="${g.label} — ${g.desc}">
        <span class="condition-grade__stars" aria-hidden="true">${stars}</span>
        <span class="condition-grade__label">${g.label}</span>
        <span class="condition-grade__desc">— ${g.desc}</span>
      </div>`;
  }

  // Gallery
  const gallery = q('#pmGallery');
  if (gallery) {
    gallery.innerHTML = modalImgs.map((src, i) => `
      <button class="pm-thumb ${i===0?'active':''}" data-idx="${i}" aria-label="Afbeelding ${i+1}">
        <img src="${src}" alt="Thumbnail ${i+1}" loading="lazy" decoding="async">
      </button>`).join('');
  }
  updateModalImage();

  // Contact link
  const contactBtn = q('#pmContactBtn');
  if (contactBtn) contactBtn.href = `mailto:info@lagenco.nl?subject=${encodeURIComponent('Interesse in: ' + product.title)}`;

  // WhatsApp share
  const waBtn = q('#pmShareWA');
  if (waBtn) waBtn.onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent(product.title + ' – ' + fmt(product.price) + ' bij Lagenco: info@lagenco.nl')}`, '_blank', 'noopener');

  // Wishlist state in modal
  const wmBtn = q('#pmWishlist');
  if (wmBtn) {
    wmBtn.classList.toggle('active', isWishlisted(id));
    wmBtn.dataset.wishlist = id;
  }

  renderRelated(product);
  renderRecent();
  renderBidsSection(id);

  // Wire up the "Place bid" button in product modal
  const bidBtn = q('#pmBidBtn');
  if (bidBtn) {
    bidBtn.onclick = () => openBidModal(id);
  }

  openModal('productModal');
};

const renderRelated = (product) => {
  const container = document.getElementById('pmRelated');
  if (!container) return;
  const related = getProducts().filter(p => p.id !== product.id && p.badge === product.badge).slice(0, 4);
  const wrap = document.getElementById('pmRelatedWrap');
  if (!related.length) { wrap?.classList.add('hidden'); return; }
  wrap?.classList.remove('hidden');
  container.innerHTML = related.map(p => `
    <div class="card product-card cursor-pointer" data-action="view" data-id="${p.id}" style="flex:0 0 180px">
      <div class="card-img">
        <img src="${getImg(p)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async" style="pointer-events:none">
      </div>
      <div style="padding:.75rem">
        <p class="font-semibold text-sm" style="color:var(--text)">${escapeHtml(p.title)}</p>
        <p class="text-sm font-bold mt-1" style="color:var(--text)">${fmt(p.price)}</p>
      </div>
    </div>`).join('');
};

const renderRecent = () => {
  const wrap = document.getElementById('pmRecentWrap');
  const container = document.getElementById('pmRecent');
  if (!wrap || !container) return;
  const recent = getRecent()
    .filter(id => id !== modalProduct?.id)
    .map(id => getProducts().find(p => p.id === id))
    .filter(Boolean)
    .slice(0, 4);
  if (!recent.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  container.innerHTML = recent.map(p => `
    <div class="card product-card cursor-pointer" data-action="view" data-id="${p.id}" style="flex:0 0 180px">
      <div class="card-img">
        <img src="${getImg(p)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async" style="pointer-events:none">
      </div>
      <div style="padding:.75rem">
        <p class="font-semibold text-sm" style="color:var(--text)">${escapeHtml(p.title)}</p>
        <p class="text-sm font-bold mt-1" style="color:var(--text)">${fmt(p.price)}</p>
      </div>
    </div>`).join('');
};

// ────────────────────────────────────────────────────────
// BID SYSTEM — place bids on products (marktplaats-style)
// ────────────────────────────────────────────────────────
const getBids = ()        => (window.LagencoDB ? window.LagencoDB.getBids() : []);
const saveBids = (bids)   => {
  // No-op for batch saves — individual bid mutations go through LagencoDB.saveBid / deleteBid.
  // Kept for backwards-compat with code that re-saves the full list.
  if (window.LagencoDB && window.LagencoDB.isConfigured) {
    bids.forEach(b => { window.LagencoDB.saveBid(b); });
  }
};
const getBidsForProduct = (productId) => getBids().filter(b => b.productId === productId).sort((a, b) => b.amount - a.amount);

const addBid = (bid) => {
  bid.id = 'bid_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  bid.createdAt = new Date().toISOString();
  bid.status = bid.status || 'in_afwachting'; // in_afwachting | geaccepteerd | afgewezen
  if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.saveBid(bid); }
  return bid;
};

const updateBidStatus = (bidId, status) => {
  if (window.LagencoDB && window.LagencoDB.isConfigured) {
    window.LagencoDB.updateBidStatus(bidId, status);
  }
};

const deleteBid = (bidId) => {
  if (window.LagencoDB && window.LagencoDB.isConfigured) {
    window.LagencoDB.deleteBid(bidId);
  }
};

// Format bid status for display
const bidStatusInfo = (status) => {
  switch (status) {
    case 'geaccepteerd':  return { label: 'Geaccepteerd',  cls: 'bid-status-success', icon: 'fa-check' };
    case 'afgewezen':     return { label: 'Afgewezen',     cls: 'bid-status-danger',  icon: 'fa-times' };
    case 'in_afwachting':
    default:              return { label: 'In afwachting', cls: 'bid-status-warn',    icon: 'fa-clock' };
  }
};

// Format Dutch date for bid display
const fmtBidDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

// ─── Render the bid history section inside the product modal ───
const renderBidsSection = (productId) => {
  const container = document.getElementById('pmBidsSection');
  if (!container) return;

  const bids = getBidsForProduct(productId);
  const product = getProducts().find(p => p.id === productId);
  const askingPrice = product ? parseFloat(product.price) || 0 : 0;
  const highestBid = bids.length ? bids[0].amount : 0;
  const bidCount = bids.length;

  let html = `
    <div class="bids-header">
      <div>
        <span class="bids-title"><i class="fas fa-gavel"></i> Biedingen</span>
        <span class="bids-count">${bidCount} ${bidCount === 1 ? 'bod' : 'biedingen'}</span>
      </div>
      ${bidCount > 0 ? `
        <div class="bids-summary">
          <div class="bid-summary-item">
            <span class="bid-summary-label">Hoogste bod</span>
            <span class="bid-summary-value">€ ${highestBid.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div class="bid-summary-item">
            <span class="bid-summary-label">Asking price</span>
            <span class="bid-summary-value">€ ${askingPrice.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>` : ''}
    </div>`;

  if (bidCount === 0) {
    html += `
      <div class="bids-empty">
        <i class="fas fa-gavel"></i>
        <p>Nog geen biedingen geplaatst. Wees de eerste!</p>
      </div>`;
  } else {
    html += `<div class="bids-list">`;
    bids.forEach((bid, i) => {
      const status = bidStatusInfo(bid.status);
      const isHighest = i === 0;
      const initials = bid.name.split(' ').map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase();
      html += `
        <div class="bid-item ${isHighest ? 'bid-item-highest' : ''}">
          <div class="bid-item-avatar">${escapeHtml(initials)}</div>
          <div class="bid-item-main">
            <div class="bid-item-top">
              <span class="bid-item-name">${escapeHtml(bid.name)}</span>
              ${isHighest ? '<span class="bid-badge-highest">Hoogste bod</span>' : ''}
              <span class="bid-status ${status.cls}"><i class="fas ${status.icon}"></i> ${status.label}</span>
            </div>
            <div class="bid-item-meta">
              <i class="fas fa-clock"></i> ${fmtBidDate(bid.createdAt)} ·
              <i class="fas fa-truck"></i> ${escapeHtml(bid.shippingMethod)}
            </div>
          </div>
          <div class="bid-item-amount">€ ${bid.amount.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>`;
    });
    html += `</div>`;
  }

  // Privacy notice — let visitors know their address is only visible to admin
  html += `
    <div class="bids-privacy-notice">
      <i class="fas fa-shield-alt"></i>
      <span>Uw adresgegevens zijn alleen zichtbaar voor de verkoper en worden niet getoond aan andere bezoekers.</span>
    </div>`;

  container.innerHTML = html;
};

// ─── Open the bid form modal for a product ───
let bidModalProductId = null;

const openBidModal = (productId) => {
  const product = getProducts().find(p => p.id === productId);
  if (!product) { toast('Product niet gevonden', 'error'); return; }

  bidModalProductId = productId;
  const askingPrice = parseFloat(product.price) || 0;
  const minBid = Math.max(1, Math.round(askingPrice * 0.5 * 100) / 100);

  // Set product preview
  const previewImg = document.getElementById('bidProductImg');
  const previewTitle = document.getElementById('bidProductTitle');
  const previewPrice = document.getElementById('bidProductPrice');
  const previewBadge = document.getElementById('bidProductBadge');
  if (previewImg) previewImg.src = getImg(product);
  if (previewTitle) previewTitle.textContent = product.title;
  if (previewPrice) previewPrice.textContent = 'Asking price: € ' + askingPrice.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (previewBadge) {
    previewBadge.textContent = product.badge || 'Uitgelicht';
    previewBadge.className = 'badge ' + badgeClass(product.badge);
  }

  // Set min attribute on amount field
  const amountInput = document.getElementById('bidAmount');
  if (amountInput) {
    amountInput.min = minBid;
    amountInput.placeholder = 'Min. € ' + minBid.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Reset form
  const form = document.getElementById('bidForm');
  if (form) form.reset();

  // Show shipping address fieldset based on shipping method
  toggleBidAddressFields();

  openModal('bidModal');
};

// Show/hide address fields based on selected shipping method
const toggleBidAddressFields = () => {
  const method = document.querySelector('input[name="bidShippingMethod"]:checked');
  const addrFieldset = document.getElementById('bidAddressFieldset');
  if (!addrFieldset) return;
  if (!method) { addrFieldset.style.display = 'none'; return; }
  // Show address for "verzenden" (shipping) and "beide" (both). Hide for "afhalen" (pickup).
  if (method.value === 'afhalen') {
    addrFieldset.style.display = 'none';
  } else {
    addrFieldset.style.display = '';
  }
};

// ─── Handle bid form submission ───
const handleBidSubmit = (e) => {
  e.preventDefault();
  if (!bidModalProductId) { toast('Geen product geselecteerd', 'error'); return; }

  const product = getProducts().find(p => p.id === bidModalProductId);
  if (!product) { toast('Product niet gevonden', 'error'); return; }

  const name = (document.getElementById('bidName')?.value || '').trim();
  const email = (document.getElementById('bidEmail')?.value || '').trim();
  const amountStr = document.getElementById('bidAmount')?.value || '';
  const amount = parseFloat(amountStr.replace(',', '.'));
  const shippingMethod = document.querySelector('input[name="bidShippingMethod"]:checked')?.value || '';
  const street = (document.getElementById('bidStreet')?.value || '').trim();
  const houseNumber = (document.getElementById('bidHouseNumber')?.value || '').trim();
  const houseNumberAdd = (document.getElementById('bidHouseNumberAdd')?.value || '').trim();
  const postalCode = (document.getElementById('bidPostalCode')?.value || '').trim();
  const city = (document.getElementById('bidCity')?.value || '').trim();
  const country = (document.getElementById('bidCountry')?.value || 'Nederland').trim();
  const phone = (document.getElementById('bidPhone')?.value || '').trim();
  const note = (document.getElementById('bidNote')?.value || '').trim();

  // Validations
  if (name.length < 2) { toast('Vul je volledige naam in', 'error'); document.getElementById('bidName')?.focus(); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Vul een geldig e-mailadres in', 'error'); document.getElementById('bidEmail')?.focus(); return; }
  if (!amount || isNaN(amount) || amount <= 0) { toast('Vul een geldig bod in', 'error'); document.getElementById('bidAmount')?.focus(); return; }

  const askingPrice = parseFloat(product.price) || 0;
  const minBid = Math.max(1, Math.round(askingPrice * 0.5 * 100) / 100);
  if (amount < minBid) { toast('Bod moet minimaal € ' + minBid.toLocaleString('nl-NL') + ' zijn', 'error'); document.getElementById('bidAmount')?.focus(); return; }

  if (!shippingMethod) { toast('Kies een verzendmethode', 'error'); return; }

  // Address required if not pickup-only
  if (shippingMethod !== 'afhalen') {
    if (street.length < 2) { toast('Vul je straatnaam in', 'error'); document.getElementById('bidStreet')?.focus(); return; }
    if (houseNumber.length < 1) { toast('Vul je huisnummer in', 'error'); document.getElementById('bidHouseNumber')?.focus(); return; }
    if (postalCode.length < 4) { toast('Vul een geldige postcode in', 'error'); document.getElementById('bidPostalCode')?.focus(); return; }
    if (city.length < 2) { toast('Vul je woonplaats in', 'error'); document.getElementById('bidCity')?.focus(); return; }
  }

  // Terms checkbox must be checked
  const termsChecked = document.getElementById('bidTerms')?.checked;
  if (!termsChecked) { toast('Accepteer de algemene voorwaarden om je bod te plaatsen', 'error'); document.getElementById('bidTerms')?.focus(); return; }

  // Build shipping method label
  const shippingLabels = { verzenden: 'Verzenden', afhalen: 'Afhalen', beide: 'Verzenden of afhalen' };
  const shippingLabel = shippingLabels[shippingMethod] || shippingMethod;

  // Build full address (empty if pickup)
  const fullAddress = shippingMethod === 'afhalen'
    ? ''
    : `${street} ${houseNumber}${houseNumberAdd ? ' ' + houseNumberAdd : ''}, ${postalCode} ${city}${country && country !== 'Nederland' ? ', ' + country : ''}`;

  // Save the bid
  const bid = addBid({
    productId: bidModalProductId,
    productTitle: product.title,
    productPrice: askingPrice,
    name,
    email,
    phone,
    amount,
    shippingMethod: shippingLabel,
    shippingMethodKey: shippingMethod,
    street,
    houseNumber,
    houseNumberAdd,
    postalCode,
    city,
    country,
    fullAddress,
    note,
    status: 'in_afwachting'
  });

  toast('Bod van € ' + amount.toLocaleString('nl-NL', { minimumFractionDigits: 2 }) + ' geplaatst!', 'success', 4000);

  // Close the bid modal
  closeModal('bidModal');

  // Refresh the bids section in the product modal
  renderBidsSection(bidModalProductId);

  // Refresh the live bids section on homepage (if present)
  renderLiveBids();

  bidModalProductId = null;
};

// Expose for inline onclick handlers
window.openBidModal = openBidModal;
window.toggleBidAddressFields = toggleBidAddressFields;

// ────────────────────────────────────────────────────────
// Modal open/close helpers (FIXED CENTERING + body scroll lock)
// ────────────────────────────────────────────────────────
let scrollLockPadding = 0;

const openModal = (id) => {
  const backdrop = document.getElementById(id);
  if (!backdrop) return;
  // lock scroll & remember position
  const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = 'hidden';
  if (scrollbarW > 0) document.body.style.paddingRight = scrollbarW + 'px';
  backdrop.style.display = 'flex';
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    // focus first interactive element
    const focusable = backdrop.querySelector('input, button, a, textarea, select');
    if (focusable) setTimeout(() => focusable.focus(), 100);
  });
};

const closeModal = (id) => {
  const backdrop = document.getElementById(id);
  if (!backdrop) return;
  backdrop.classList.remove('open');
  setTimeout(() => {
    backdrop.style.display = 'none';
    // only release scroll if no other modal open
    if (!document.querySelector('.modal-backdrop.open')) {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  }, 300);
};

window.closeModal = closeModal; // expose for inline handlers

const initModals = () => {
  // Initialize all backdrops hidden
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.style.display = 'none';
    // Close on backdrop click
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
    backdrop.addEventListener('mousedown', e => {
      // ensure click outside panel registers as backdrop click
      if (e.target === backdrop) backdrop._clickedBackdrop = true;
    });
    // Close on X button (any .modal-close-btn within)
    backdrop.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => closeModal(backdrop.id));
    });
  });

  // Product modal navigation
  document.getElementById('pmPrev')?.addEventListener('click', () => {
    if (modalIdx > 0) { modalIdx--; updateModalImage(); }
  });
  document.getElementById('pmNext')?.addEventListener('click', () => {
    if (modalIdx < modalImgs.length - 1) { modalIdx++; updateModalImage(); }
  });

  // Gallery thumb click
  document.addEventListener('click', e => {
    const thumb = e.target.closest('.pm-thumb');
    if (thumb) { modalIdx = Number(thumb.dataset.idx); updateModalImage(); }
  });

  // Keyboard nav (global)
  document.addEventListener('keydown', e => {
    const pm = document.getElementById('productModal');
    if (pm?.classList.contains('open')) {
      if (e.key === 'ArrowRight' && modalIdx < modalImgs.length - 1) { modalIdx++; updateModalImage(); }
      if (e.key === 'ArrowLeft'  && modalIdx > 0) { modalIdx--; updateModalImage(); }
      if (e.key === 'Escape') closeModal('productModal');
    }
    // any open modal closes on Escape
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach(m => closeModal(m.id));
    }
  });
};

// ────────────────────────────────────────────────────────
// Share modal / quick share
// ────────────────────────────────────────────────────────
const openShareSheet = (id) => {
  const p = getProducts().find(x => x.id === id);
  if (!p) return;
  const text = `${p.title} – ${fmt(p.price)} bij Lagenco`;
  const sharePanel = document.getElementById('shareModal');
  if (sharePanel) {
    document.getElementById('shareWA')?.setAttribute('href', `https://wa.me/?text=${encodeURIComponent(text)}`);
    document.getElementById('shareFB')?.setAttribute('href', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://lagenco.nl')}&quote=${encodeURIComponent(text)}`);
    document.getElementById('shareEM')?.setAttribute('href', `mailto:?subject=${encodeURIComponent('Bekijk dit bij Lagenco')}&body=${encodeURIComponent(text)}`);
    openModal('shareModal');
  }
};

// ────────────────────────────────────────────────────────
// Compare Modal — generate side-by-side comparison table
// ────────────────────────────────────────────────────────
const buildCompareRow = (label, cells) => `
  <div class="compare-row-label" data-label="${escapeHtml(label)}">${escapeHtml(label)}</div>
  ${cells.join('')}
`;

window.openCompareModal = () => {
  const ids = getCompare();
  if (ids.length < 2) {
    toast('Voeg minimaal 2 producten toe om te vergelijken', 'warn');
    // Close the modal if it was open and now has too few items
    const openModalEl = document.getElementById('compareModal');
    if (openModalEl?.classList.contains('open')) closeModal('compareModal');
    return;
  }
  const products = ids
    .map(id => getProducts().find(p => p.id === id))
    .filter(Boolean)
    .slice(0, 3);

  if (products.length < 2) {
    toast('Minimaal 2 geldige producten nodig om te vergelijken', 'warn');
    const openModalEl = document.getElementById('compareModal');
    if (openModalEl?.classList.contains('open')) closeModal('compareModal');
    return;
  }

  const container = document.getElementById('compareTableContainer');
  if (!container) return;

  // Build header row (image + title + price)
  const headerCells = products.map(p => {
    const disc = discountPct(p);
    return `
      <div class="compare-head">
        <div class="compare-head-img">
          <img src="${getImg(p)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async">
        </div>
        <h3 style="font-family:'Sora',sans-serif;font-weight:700;font-size:.95rem;margin:0 0 .25rem;color:var(--text)">${escapeHtml(p.title)}</h3>
        <p style="font-weight:800;font-size:1.25rem;color:var(--green);margin:.25rem 0 0">${fmt(p.price)}</p>
        ${p.oldPrice ? `<p style="font-size:.75rem;text-decoration:line-through;color:var(--text-faint);margin:.1rem 0 0">${fmt(p.oldPrice)}</p>` : ''}
        ${disc ? `<span class="tag" style="background:#fef3c7;color:#92400e;margin-top:.4rem;display:inline-block">-${disc}%</span>` : ''}
      </div>`;
  });

  // Build per-row data
  const descCells   = products.map(p => `<div class="compare-cell">${escapeHtml(p.description || '-')}</div>`);
  const badgeCells  = products.map(p => `<div class="compare-cell"><span class="badge ${badgeClass(p.badge)}">${escapeHtml(p.badge || 'Uitgelicht')}</span></div>`);
  const priceCells  = products.map(p => `<div class="compare-cell" style="font-weight:700;color:var(--text)">${fmt(p.price)}</div>`);
  const oldPrCells  = products.map(p => `<div class="compare-cell">${p.oldPrice ? `<span style="text-decoration:line-through">${fmt(p.oldPrice)}</span>` : '<span style="color:var(--text-faint)">—</span>'}</div>`);
  const discCells   = products.map(p => {
    const disc = discountPct(p);
    return `<div class="compare-cell">${disc ? `<span class="tag" style="background:#fef3c7;color:#92400e">-${disc}%</span>` : '<span style="color:var(--text-faint)">Geen</span>'}</div>`;
  });
  const actionCells = products.map(p => `
    <div class="compare-cell">
      <div class="compare-actions">
        <button class="btn btn-green" onclick="closeModal('compareModal');openProductModal('${p.id}')"><i class="fas fa-eye"></i> Bekijk</button>
        <button class="btn btn-ghost" onclick="toggleCompare('${p.id}');openCompareModal()"><i class="fas fa-times"></i> Verwijder</button>
      </div>
    </div>`);

  container.innerHTML = `
    <div class="compare-grid">
      <div></div>
      ${headerCells.join('')}
      ${buildCompareRow('Beschrijving', descCells)}
      ${buildCompareRow('Categorie', badgeCells)}
      ${buildCompareRow('Prijs', priceCells)}
      ${buildCompareRow('Oude prijs', oldPrCells)}
      ${buildCompareRow('Korting', discCells)}
      ${buildCompareRow('Acties', actionCells)}
    </div>
  `;

  openModal('compareModal');
};

// ────────────────────────────────────────────────────────
// Global action delegation
// ────────────────────────────────────────────────────────
const initActions = () => {
  document.addEventListener('click', e => {
    // If user clicked on an action button (wishlist/compare/share), don't trigger view
    if (e.target.closest('.action-btn')) return;

    const viewBtn = e.target.closest('[data-action="view"]');
    if (viewBtn) { openProductModal(viewBtn.dataset.id); return; }

    const delBtn = e.target.closest('[data-action="delete"]');
    if (delBtn) {
      if (confirm('Weet je zeker dat je dit product wilt verwijderen?')) deleteProduct(delBtn.dataset.id);
      return;
    }

    const editBtn = e.target.closest('[data-action="edit"]');
    if (editBtn) { openEditModal(editBtn.dataset.id); return; }

    const shareBtn = e.target.closest('[data-action="share"]');
    if (shareBtn) { openShareSheet(shareBtn.dataset.id); return; }

    const compareBtn = e.target.closest('[data-action="compare"]');
    if (compareBtn) { toggleCompare(compareBtn.dataset.id); return; }

    const rmCompare = e.target.closest('[data-action="rm-compare"]');
    if (rmCompare) { toggleCompare(rmCompare.dataset.id); return; }

    const wBtn = e.target.closest('[data-wishlist]');
    if (wBtn) { toggleWishlist(wBtn.dataset.wishlist); return; }

    const timelineStep = e.target.closest('[data-timeline-step]');
    if (timelineStep) { openTimelineStep(Number(timelineStep.dataset.timelineStep)); return; }
  });
};

// ────────────────────────────────────────────────────────
// Login
// ────────────────────────────────────────────────────────
const updateAuthUI = () => {
  const logged = isLoggedIn();
  document.getElementById('loginBtn')?.classList.toggle('hidden', logged);
  document.getElementById('logoutBtn')?.classList.toggle('hidden', !logged);
  const status = document.getElementById('loginStatus');
  if (status) {
    status.style.display = logged ? '' : 'none';
    status.textContent = logged ? '✓ admin@lagenco.nl' : '';
  }
  document.getElementById('adminPanel')?.classList.toggle('hidden', !logged);
  renderFeatured();
  if (PAGE === 'assortiment') renderAssortment();
  if (PAGE === 'index') renderCommunityPosts();
};

const initLogin = () => {
  const loginBtn  = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const form      = document.getElementById('loginForm');
  const msg       = document.getElementById('loginMessage');
  const submitBtn = document.getElementById('loginSubmitBtn');

  loginBtn?.addEventListener('click', () => openModal('loginModal'));

  logoutBtn?.addEventListener('click', () => {
    setLoggedIn(false);
    updateAuthUI();
    toast('Uitgelogd', 'info');
  });

  form?.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value.trim();
    const pass  = document.getElementById('loginPassword')?.value;
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Laden…'; }

    setTimeout(() => {
      if (email === AUTH.email && pass === AUTH.password) {
        setLoggedIn(true);
        updateAuthUI();
        if (msg) { msg.textContent = '✓ Inloggen gelukt!'; msg.style.color = 'var(--green)'; }
        toast('Welkom terug, admin!', 'success');
        setTimeout(() => {
          closeModal('loginModal');
          form.reset();
          if (msg) msg.textContent = '';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Inloggen'; }
        }, 600);
      } else {
        if (msg) { msg.textContent = 'Ongeldig e-mailadres of wachtwoord.'; msg.style.color = '#ef4444'; }
        toast('Inloggen mislukt', 'error');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Inloggen'; }
      }
    }, 500);
  });
};

// ────────────────────────────────────────────────────────
// Add Product Form (FIXED IMAGE UPLOAD + drag reorder + set main + delete)
// ────────────────────────────────────────────────────────
let uploadedImages = [];

const initAddProduct = () => {
  const form      = document.getElementById('addProductForm');
  const fileInput = document.getElementById('productImages');
  const dropZone  = document.getElementById('imageDropZone');
  const preview   = document.getElementById('imagePreviewContainer');
  const urlInput  = document.getElementById('productImageURL');
  if (!form) return;

  const showProcessingIndicator = (visible, count = 0) => {
    let indicator = document.getElementById('imageProcessingIndicator');
    if (visible) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'imageProcessingIndicator';
        indicator.className = 'image-processing';
        dropZone?.parentNode?.insertBefore(indicator, dropZone.nextSibling);
      }
      indicator.innerHTML = `<i class="fas fa-spinner"></i> Bezig met verwerken${count > 1 ? ` van ${count} afbeeldingen` : ''}…`;
      indicator.style.display = 'flex';
    } else if (indicator) {
      indicator.style.display = 'none';
    }
  };

  const readFiles = (files) => {
    const fileArr = Array.from(files || []);
    const valid = fileArr.filter(f =>
      f.type.startsWith('image/') && f.size <= MAX_IMAGE_SIZE
    );
    const skipped = fileArr.length - valid.length;

    if (!valid.length) {
      toast('Geen geldige afbeeldingen (JPG/PNG/WEBP, max 5MB)', 'warn');
      return;
    }

    const remaining = MAX_IMAGES - uploadedImages.length;
    if (remaining <= 0) {
      toast(`Max ${MAX_IMAGES} afbeeldingen bereikt`, 'warn');
      return;
    }
    const toRead = valid.slice(0, remaining);
    const overflow = valid.length - toRead.length;

    showProcessingIndicator(true, toRead.length);

    // Process each image through the canvas pipeline (downscale + compress)
    Promise.all(toRead.map(f => processImage(f).catch(err => {
      console.warn('Image processing failed, falling back to raw read', err);
      // Last-resort fallback to raw base64 (better than losing the image entirely)
      return new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => res(null);
        r.readAsDataURL(f);
      });
    }))).then(results => {
      showProcessingIndicator(false);
      const ok = results.filter(Boolean);
      // APPEND instead of replace — preserves previously uploaded images
      uploadedImages = uploadedImages.concat(ok);
      renderPreviews();
      let msg = `${ok.length} afbeelding(en) toegevoegd`;
      if (skipped > 0) msg += ` (${skipped} overgeslagen)`;
      if (overflow > 0) msg += ` — ${overflow} niet toegevoegd i.v.m. maximum`;
      // Warn if any single image is still unusually large after compression
      const bigOnes = ok.filter(u => approxDataUrlKb(u) > PROC_TARGET_KB * 2);
      if (bigOnes.length) {
        msg += ` · ${bigOnes.length} afbeelding(en) is nog steeds groot`;
      }
      toast(msg, overflow > 0 || skipped > 0 || bigOnes.length ? 'warn' : 'success');
    }).catch(() => {
      showProcessingIndicator(false);
      toast('Afbeeldingen konden niet worden verwerkt', 'error');
    });
  };

  const renderPreviews = () => {
    if (!preview) return;
    if (!uploadedImages.length) {
      preview.innerHTML = '';
      updateImageCounter();
      return;
    }
    preview.innerHTML = uploadedImages.map((src, i) => `
      <div class="img-preview" draggable="true" data-img-idx="${i}">
        <img src="${src}" alt="Afbeelding ${i+1}" draggable="false" decoding="async">
        ${i === 0 ? '<span class="img-main-badge">HOOFD</span>' : ''}
        <div class="img-actions">
          ${i !== 0 ? `<button type="button" data-action="set-main" data-idx="${i}" title="Stel in als hoofd" aria-label="Hoofdafbeelding"><i class="fas fa-star"></i></button>` : ''}
          <button type="button" data-action="move-left" data-idx="${i}" ${i===0?'disabled':''} title="Naar links" aria-label="Naar links"><i class="fas fa-arrow-left"></i></button>
          <button type="button" data-action="move-right" data-idx="${i}" ${i===uploadedImages.length-1?'disabled':''} title="Naar rechts" aria-label="Naar rechts"><i class="fas fa-arrow-right"></i></button>
          <button type="button" data-action="rm-img" data-idx="${i}" title="Verwijderen" aria-label="Verwijderen" style="background:rgba(254,226,226,.95);color:#ef4444"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('');

    // Remove image
    preview.querySelectorAll('[data-action="rm-img"]').forEach(btn => {
      btn.addEventListener('click', () => {
        uploadedImages.splice(Number(btn.dataset.idx), 1);
        renderPreviews();
        toast('Afbeelding verwijderd', 'info');
      });
    });

    // Set main
    preview.querySelectorAll('[data-action="set-main"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        const [item] = uploadedImages.splice(idx, 1);
        uploadedImages.unshift(item);
        renderPreviews();
        toast('Hoofdafbeelding ingesteld', 'success');
      });
    });

    // Move left/right
    preview.querySelectorAll('[data-action="move-left"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        if (idx > 0) {
          [uploadedImages[idx-1], uploadedImages[idx]] = [uploadedImages[idx], uploadedImages[idx-1]];
          renderPreviews();
        }
      });
    });
    preview.querySelectorAll('[data-action="move-right"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        if (idx < uploadedImages.length - 1) {
          [uploadedImages[idx+1], uploadedImages[idx]] = [uploadedImages[idx], uploadedImages[idx+1]];
          renderPreviews();
        }
      });
    });

    // Drag-to-reorder (HTML5 drag API)
    let dragSrc = null;
    preview.querySelectorAll('[data-img-idx]').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        dragSrc = Number(el.dataset.imgIdx);
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        preview.querySelectorAll('.img-preview').forEach(x => x.classList.remove('drag-over'));
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const target = Number(el.dataset.imgIdx);
        if (dragSrc !== null && dragSrc !== target) {
          const [moved] = uploadedImages.splice(dragSrc, 1);
          uploadedImages.splice(target, 0, moved);
          renderPreviews();
        }
      });
    });

    updateImageCounter();
  };

  const updateImageCounter = () => {
    const counter = document.getElementById('imageCounter');
    if (counter) {
      counter.textContent = `${uploadedImages.length} / ${MAX_IMAGES} afbeeldingen`;
      counter.style.color = uploadedImages.length >= MAX_IMAGES ? 'var(--warm)' : 'var(--text-muted)';
    }
  };

  if (dropZone) {
    dropZone.addEventListener('click', () => fileInput?.click());
    ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, e => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }));
    ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, e => {
      e.preventDefault();
      if (ev === 'dragleave' && e.target !== dropZone) return;
      dropZone.classList.remove('dragover');
    }));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) readFiles(e.dataTransfer.files);
    });
  }

  fileInput?.addEventListener('change', e => {
    readFiles(e.target.files);
    // reset value so user can pick same file again
    e.target.value = '';
  });

  // Allow URL "Add" button to add image by URL
  const addUrlBtn = document.getElementById('addImageUrlBtn');
  if (addUrlBtn && urlInput) {
    addUrlBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) { toast('Vul een afbeeldings-URL in', 'warn'); return; }
      if (uploadedImages.length >= MAX_IMAGES) { toast(`Max ${MAX_IMAGES} afbeeldingen`, 'warn'); return; }
      uploadedImages.push(url);
      renderPreviews();
      urlInput.value = '';
      toast('Afbeelding via URL toegevoegd', 'success');
    });
  }

  // Delegated handlers for img-preview actions (alternative binding)
  preview?.addEventListener('click', (e) => {
    // already handled by direct bindings above
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const titleEl = document.getElementById('productTitle');
    const descEl  = document.getElementById('productDescription');
    const priceEl = document.getElementById('productPrice');
    const oldPrEl = document.getElementById('productOldPrice');
    const badgeEl = document.getElementById('productBadge');

    const title = titleEl?.value.trim() || '';
    const desc  = descEl?.value.trim() || '';
    const price = Number(priceEl?.value);
    const oldPr = Number(oldPrEl?.value) || null;
    const badge = badgeEl?.value.trim() || 'Uitgelicht';

    // Validation with field-level feedback
    if (!title) { toast('Vul een productnaam in', 'warn'); titleEl?.focus(); return; }
    if (!desc)  { toast('Vul een beschrijving in', 'warn'); descEl?.focus(); return; }
    if (!price || isNaN(price) || price <= 0) {
      toast('Vul een geldige prijs in (groter dan 0)', 'warn');
      priceEl?.focus();
      return;
    }
    if (oldPr !== null && oldPr > 0 && oldPr <= price) {
      toast('De oude prijs moet hoger zijn dan de nieuwe prijs (anders is er geen korting)', 'warn');
      oldPrEl?.focus();
      return;
    }

    // Use uploaded images, or fall back to URL field, or placeholder
    const images = uploadedImages.length ? uploadedImages.slice() : [PLACEHOLDER_IMAGE];
    const conditionGrade = document.getElementById('productConditionGrade')?.value || 'goed';
    const product = {
      id: `p-${Date.now()}`,
      title, description: desc,
      price, oldPrice: (oldPr && oldPr > 0) ? oldPr : null,
      badge, conditionGrade,
      image: images[0], images,
      createdAt: Date.now()
    };

    // Save directly to Firebase (source-of-truth).
    if (window.LagencoDB && window.LagencoDB.isConfigured) {
      window.LagencoDB.saveProduct(product);
    } else {
      toast('Firebase niet geconfigureerd — kan product niet opslaan.', 'error');
      return;
    }

    renderFeatured();
    if (PAGE === 'assortiment') renderAssortment();
    form.reset();
    uploadedImages = [];
    renderPreviews();
    if (urlInput) urlInput.value = '';
    toast('Product toegevoegd!', 'success');
    // Scroll to first product
    setTimeout(() => {
      const el = document.querySelector(`[data-product-id="${product.id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
  });
};

// ────────────────────────────────────────────────────────
// Edit Product Modal
// ────────────────────────────────────────────────────────
const openEditModal = (id) => {
  const product = getProducts().find(p => p.id === id);
  if (!product) return;

  document.getElementById('editProductId').value      = product.id;
  document.getElementById('editTitle').value          = product.title;
  document.getElementById('editDescription').value    = product.description;
  document.getElementById('editPrice').value          = product.price;
  document.getElementById('editOldPrice').value       = product.oldPrice || '';
  document.getElementById('editBadge').value          = product.badge || '';
  const cgEl = document.getElementById('editConditionGrade');
  if (cgEl) cgEl.value = product.conditionGrade || 'goed';

  openModal('editModal');
};

const initEditProduct = () => {
  const form = document.getElementById('editProductForm');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const id    = document.getElementById('editProductId').value;
    const title = document.getElementById('editTitle')?.value.trim();
    const desc  = document.getElementById('editDescription')?.value.trim();
    const price = Number(document.getElementById('editPrice')?.value);
    const oldPr = Number(document.getElementById('editOldPrice')?.value) || null;
    const badge = document.getElementById('editBadge')?.value.trim() || 'Uitgelicht';
    const conditionGrade = document.getElementById('editConditionGrade')?.value || 'goed';
    if (!title || !price) { toast('Vul naam en prijs in', 'warn'); return; }

    const existing = getProducts().find(p => p.id === id);
    if (!existing) { toast('Product niet gevonden', 'error'); return; }
    const updated = { ...existing, title, description: desc, price, oldPrice: oldPr, badge, conditionGrade };
    if (window.LagencoDB && window.LagencoDB.isConfigured) {
      window.LagencoDB.saveProduct(updated);
    }
    renderFeatured();
    if (PAGE === 'assortiment') renderAssortment();
    closeModal('editModal');
    toast('Product bijgewerkt!', 'success');
  });
};

// ────────────────────────────────────────────────────────
// Carousel
// ────────────────────────────────────────────────────────
const featuredCarousel = { update: null };

const initCarousel = () => {
  const track  = document.getElementById('carouselTrack');
  const prev   = document.getElementById('prevBtn');
  const next   = document.getElementById('nextBtn');
  if (!track || !prev || !next) return;

  let idx = 0;
  let resizeTimer = null;

  const getPerView = () => window.innerWidth >= 1024 ? 3 : window.innerWidth >= 768 ? 2 : 1;

  const update = () => {
    const items    = track.querySelectorAll('.carousel-item');
    const total    = items.length;
    const perView  = getPerView();
    const maxIdx   = Math.max(0, total - perView);
    if (idx > maxIdx) idx = maxIdx;
    if (idx < 0) idx = 0;
    const w   = items[0]?.offsetWidth || 0;
    const gap = 24;
    track.style.transform = `translateX(-${idx * (w + gap)}px)`;
    prev.disabled = idx === 0;
    next.disabled = idx >= maxIdx || total === 0;
    prev.style.opacity = idx === 0 ? '.35' : '1';
    next.style.opacity = idx >= maxIdx || total === 0 ? '.35' : '1';
  };

  next.addEventListener('click', () => { const maxIdx = Math.max(0, track.querySelectorAll('.carousel-item').length - getPerView()); if (idx < maxIdx) { idx++; update(); } });
  prev.addEventListener('click', () => { if (idx > 0) { idx--; update(); } });

  // Touch / swipe support
  let startX = 0, isDown = false;
  track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; isDown = true; }, { passive: true });
  track.addEventListener('touchend',   e => {
    if (!isDown) return;
    isDown = false;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) {
      if (dx < 0) next.click(); else prev.click();
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(update, 150);
  });
  featuredCarousel.update = update;

  // Shuffle
  document.getElementById('assortimentShuffleBtn')?.addEventListener('click', () => {
    const products = [...getProducts()].sort(() => Math.random() - .5);
    track.innerHTML = products.map(p => buildCarouselCard(p, isLoggedIn())).join('');
    idx = 0; update();
    toast('Producten gemengd', 'info');
  });

  // Reset
  document.getElementById('assortimentResetBtn')?.addEventListener('click', () => { renderFeatured(); idx = 0; update(); });

  update();
};

// ────────────────────────────────────────────────────────
// Scroll Reveal
// ────────────────────────────────────────────────────────
let revealObserver = null;
const initScrollReveal = () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });
  }
  document.querySelectorAll('.reveal:not(.is-visible)').forEach(el => revealObserver.observe(el));
};

// ────────────────────────────────────────────────────────
// Reading progress bar
// ────────────────────────────────────────────────────────
const initProgressBar = () => {
  const bar = document.getElementById('readingProgress');
  if (!bar) return;
  let ticking = false;
  const update = () => {
    const h = document.documentElement;
    const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
    bar.style.width = `${Math.min(Math.max(pct, 0), 100)}%`;
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
};

// ────────────────────────────────────────────────────────
// Back-to-top button
// ────────────────────────────────────────────────────────
const initBackToTop = () => {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  let visible = false;
  let ticking = false;
  const toggle = () => {
    const show = window.scrollY > 600;
    if (show !== visible) {
      visible = show;
      btn.classList.toggle('show', show);
    }
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(toggle);
      ticking = true;
    }
  }, { passive: true });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  toggle();
};

// ────────────────────────────────────────────────────────
// Interactive timeline (Onze werkwijze)
// ────────────────────────────────────────────────────────
const TIMELINE_STEPS = [
  {
    icon: 'fa-shopping-cart',
    title: 'Inkoop',
    short: 'Restpartijen & overstock opkopen',
    long: 'Wij kopen restpartijen, overstock en overtollige voorraad op bij leveranciers, groothandels en bedrijven. Hierdoor kunnen wij producten scherp inkopen en tegen aantrekkelijke prijzen aanbieden. We screenen elke partij zorgvuldig op kwaliteit, herkomst en verwachte marges, zodat we alleen partijen opkopen die we met vertrouwen kunnen doorverkopen.'
  },
  {
    icon: 'fa-filter',
    title: 'Selectie',
    short: 'Zorgvuldige selectie van de beste producten',
    long: 'Na inkomst wordt elke partij gesorteerd en geselecteerd. Ons team beoordeelt producten op staat, functionaliteit, merkbekendheid en verwachte vraag. Wat niet aan onze eisen voldoet, gaan we niet verkopen. Zo garanderen we dat alleen de meest waardevolle en betrouwbare producten in ons assortiment terechtkomen.'
  },
  {
    icon: 'fa-clipboard-check',
    title: 'Controle',
    short: 'Kwaliteitscontrole en testen',
    long: 'Elk product wordt individueel gecontroleerd. We testen functionaliteit, controleren op beschadigingen, ontbrekende onderdelen en cosmetische gebreken. Producten die defect zijn, worden hersteld of uitgesorteerd. Voor elke partij maken we een controleverslag, zodat we de herkomst en kwaliteit altijd kunnen traceren.'
  },
  {
    icon: 'fa-tag',
    title: 'Verkoop',
    short: 'Via diverse platforms aangeboden',
    long: 'De goedgekeurde producten worden via meerdere kanalen aangeboden: onze eigen website, marktplaatsen, Bol.com, Amazon en B2B-partners. Voor elk product kiezen we het kanaal waar het de beste prijs en zichtbaarheid krijgt. Onze logistiek is ingericht voor snelle verwerking en levering, zodat kopers snel hun aankoop ontvangen.'
  },
  {
    icon: 'fa-leaf',
    title: 'Tweede leven',
    short: 'Product krijgt een nieuw doel',
    long: 'Door elk product een tweede leven te geven, dragen we bij aan een circulaire economie. We verminderen verspilling, besparen grondstoffen en bieden klanten betaalbare kwaliteitsproducten. Voor ons is dit meer dan handel — het is een missie om duurzaam ondernemen de norm te maken en tegelijk waarde te creëren voor kopers, verkopers en de planeet.'
  }
];

let currentTimelineStep = 0;

const openTimelineStep = (n) => {
  currentTimelineStep = Math.max(0, Math.min(TIMELINE_STEPS.length - 1, n));
  const step = TIMELINE_STEPS[currentTimelineStep];
  const modal = document.getElementById('timelineModal');
  if (!modal) return;
  const titleEl    = modal.querySelector('[data-tl-title]');
  const longEl     = modal.querySelector('[data-tl-long]');
  const counterEl  = modal.querySelector('[data-tl-counter]');
  const iconEl     = modal.querySelector('[data-tl-icon]');
  const prevBtn    = modal.querySelector('[data-tl-prev]');
  const nextBtn    = modal.querySelector('[data-tl-next]');

  if (titleEl)   titleEl.textContent = `${currentTimelineStep + 1}. ${step.title}`;
  if (longEl)    longEl.textContent  = step.long;
  if (counterEl) counterEl.textContent = `Stap ${currentTimelineStep + 1} van ${TIMELINE_STEPS.length}`;
  if (iconEl)    iconEl.innerHTML = `<i class="fas ${step.icon}"></i>`;
  if (prevBtn)   prevBtn.disabled = currentTimelineStep === 0;
  if (nextBtn)   nextBtn.disabled = currentTimelineStep === TIMELINE_STEPS.length - 1;

  // Highlight active step in timeline
  document.querySelectorAll('[data-timeline-step]').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.timelineStep) === currentTimelineStep);
  });

  openModal('timelineModal');
};

const initTimeline = () => {
  const container = document.getElementById('timelineContainer');
  if (!container) return;

  // Color per step (matching concept 3 palette)
  const stepColors = [
    { bg: 'linear-gradient(135deg, var(--green), var(--green-mid))', shadow: 'rgba(107, 191, 126, 0.30)' },     // Inkoop - groen
    { bg: 'linear-gradient(135deg, var(--peach), var(--peach-deep))', shadow: 'rgba(255, 139, 92, 0.30)' },     // Selectie - perzik
    { bg: 'linear-gradient(135deg, var(--yellow), var(--yellow-deep))', shadow: 'rgba(212, 162, 78, 0.30)' },   // Controle - geel
    { bg: 'linear-gradient(135deg, var(--lavender), var(--lavender-deep))', shadow: 'rgba(159, 138, 201, 0.30)' }, // Verkoop - lavendel
    { bg: 'linear-gradient(135deg, var(--blue), var(--blue-deep))', shadow: 'rgba(91, 168, 201, 0.30)' }        // Tweede leven - blauw
  ];

  // Build timeline nodes dynamically — Concept 3 stijl: witte cards met gekleurde nummer-cirkels
  container.innerHTML = TIMELINE_STEPS.map((s, i) => {
    const color = stepColors[i] || stepColors[0];
    return `
    <button class="timeline-node" data-timeline-step="${i}" style="background:white;border:1.5px solid var(--border);border-radius:1.5rem;padding:1.75rem 1.25rem;box-shadow:var(--shadow-sm);transition:all .25s;cursor:pointer;text-align:center;font-family:inherit;display:flex;flex-direction:column;align-items:center;gap:.875rem;position:relative;z-index:1">
      <div class="timeline-num" style="width:4rem;height:4rem;border-radius:50%;background:${color.bg};color:white;display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-size:1.5rem;font-weight:800;box-shadow:0 8px 20px ${color.shadow};border:none;transition:all .25s">${i + 1}</div>
      <div class="timeline-info" style="text-align:center">
        <p class="timeline-title" style="font-family:'Poppins',sans-serif;font-size:1rem;font-weight:700;color:var(--text);margin:0 0 .5rem">${s.title}</p>
        <p class="timeline-short" style="font-size:.85rem;color:var(--text-muted);line-height:1.6;margin:0">${s.short}</p>
      </div>
    </button>`;
  }).join('');

  // Add hover effect via JS (since we use inline styles)
  container.querySelectorAll('.timeline-node').forEach((node, i) => {
    const color = stepColors[i] || stepColors[0];
    node.addEventListener('mouseenter', () => {
      node.style.transform = 'translateY(-4px)';
      node.style.boxShadow = 'var(--shadow-md)';
      node.style.borderColor = 'var(--peach)';
    });
    node.addEventListener('mouseleave', () => {
      node.style.transform = '';
      node.style.boxShadow = 'var(--shadow-sm)';
      node.style.borderColor = 'var(--border)';
    });
  });

  // Wire prev/next buttons inside modal
  const modal = document.getElementById('timelineModal');
  if (modal) {
    modal.querySelector('[data-tl-prev]')?.addEventListener('click', () => openTimelineStep(currentTimelineStep - 1));
    modal.querySelector('[data-tl-next]')?.addEventListener('click', () => openTimelineStep(currentTimelineStep + 1));
  }
};

// ────────────────────────────────────────────────────────
// Contact form validation
// ────────────────────────────────────────────────────────
const initContactForm = () => {
  const form = document.getElementById('contactForm');
  if (!form) return;

  const setError = (input, msg) => {
    input.classList.add('input-error');
    const err = input.parentElement.querySelector('.field-error');
    if (err) err.textContent = msg;
  };
  const clearError = (input) => {
    input.classList.remove('input-error');
    const err = input.parentElement.querySelector('.field-error');
    if (err) err.textContent = '';
  };

  const validators = {
    contactName: (v) => v.trim().length >= 2 || 'Vul uw naam in (min. 2 tekens)',
    contactEmail: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Vul een geldig e-mailadres in',
    contactSubject: (v) => v.trim().length >= 3 || 'Vul een onderwerp in',
    contactMessage: (v) => v.trim().length >= 10 || 'Uw bericht is te kort (min. 10 tekens)'
  };

  Object.keys(validators).forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('blur', () => {
        const r = validators[id](input.value);
        if (r !== true) setError(input, r); else clearError(input);
      });
      input.addEventListener('input', () => clearError(input));
    }
  });

  // Optional phone validation if present
  const phone = document.getElementById('contactPhone');
  if (phone) {
    phone.addEventListener('blur', () => {
      if (phone.value.trim() && !/^[+0-9\s\-()]{8,}$/.test(phone.value.trim())) {
        setError(phone, 'Ongeldig telefoonnummer');
      } else clearError(phone);
    });
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    Object.keys(validators).forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        const r = validators[id](input.value);
        if (r !== true) { setError(input, r); ok = false; }
      }
    });
    if (!ok) { toast('Corrigeer de gemarkeerde velden', 'error'); return; }

    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Versturen…'; }

    setTimeout(() => {
      toast('Bericht verzonden! We nemen spoedig contact op.', 'success');
      form.reset();
      if (btn) { btn.disabled = false; btn.textContent = 'Verstuur bericht'; }
    }, 800);
  });
};

// ────────────────────────────────────────────────────────
// Cleanup old demo products (one-time, flagged via localStorage)
// Removes the 6 demo products that were seeded in earlier versions
// plus any leftover test products ("sdadsada" etc.)
// ────────────────────────────────────────────────────────
const OLD_DEMO_TITLES = [
  'draadloze koptelefoon',
  'ergonomische kantoorstoel',
  'smartwatch series 6',
  'premium espressomachine',
  'houten bureau 140cm',
  'espresso bonen 1kg',
  'sdadsada'
];

const isOldDemoProduct = (p) => {
  if (!p) return false;
  if (typeof p.id === 'string' && p.id.startsWith('p-demo-')) return true;
  const title = (p.title || '').trim().toLowerCase();
  return OLD_DEMO_TITLES.includes(title);
};

const cleanupOldDemoProducts = () => {
  // Once-only cleanup of legacy demo products. The "has this run" flag
  // is stored per-visitor in Firebase (visitor data), so it still runs
  // exactly once per visitor across all their devices.
  if (window.LagencoDB && window.LagencoDB.getVisitor('cleanedV1')) return;
  const products = getProducts();
  if (products.length === 0) {
    if (window.LagencoDB) window.LagencoDB.setVisitor('cleanedV1', true);
    return;
  }
  const filtered = products.filter(p => !isOldDemoProduct(p));
  const removedIds = products.filter(p => isOldDemoProduct(p)).map(p => p.id);
  const removedCount = removedIds.length;
  if (removedCount > 0) {
    // Delete each removed product from Firebase
    if (window.LagencoDB && window.LagencoDB.isConfigured) {
      removedIds.forEach(id => { window.LagencoDB.deleteProduct(id); });
    }
    // Also clean references in wishlist/recent/compare
    saveWishlist(getWishlist().filter(id => !removedIds.includes(id)));
    saveRecent(getRecent().filter(id => !removedIds.includes(id)));
    saveCompare(getCompare().filter(id => !removedIds.includes(id)));
    console.info(`[Lagenco] ${removedCount} oud demo-product(en) verwijderd.`);
  }
  if (window.LagencoDB) window.LagencoDB.setVisitor('cleanedV1', true);
};

// ────────────────────────────────────────────────────────
// Premium v3 enhancements
// Magnetic buttons, card tilt, hero parallax,
// animated counters.
// All respect prefers-reduced-motion and pointer: fine.
// ────────────────────────────────────────────────────────
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isFinePointer = () => window.matchMedia('(pointer: fine)').matches;

// Magnetic buttons: primary call-to-action buttons subtly follow the cursor (max 6px).
// Throttled via requestAnimationFrame and using translate3d for GPU acceleration.
const initMagneticButtons = () => {
  if (prefersReducedMotion() || !isFinePointer()) return;
  // Limit magnetic effect to primary CTA buttons only — lighter and snappier than all-buttons approach.
  const buttons = document.querySelectorAll('.btn-green, .btn-primary');
  buttons.forEach(btn => {
    if (btn.dataset.premiumMagnetic === '1') return;
    btn.dataset.premiumMagnetic = '1';
    btn.classList.add('magnetic-ready');
    const strength = 0.3; // multiplier; max 6px at ~20px from center
    let rafId = null;
    let pendingEvent = null;
    let currentX = 0, currentY = 0;
    let targetX = 0, targetY = 0;

    const animate = () => {
      currentX += (targetX - currentX) * 0.22;
      currentY += (targetY - currentY) * 0.22;
      btn.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;
      if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
        rafId = requestAnimationFrame(animate);
      } else {
        btn.style.transform = '';
        btn.style.willChange = '';
        rafId = null;
      }
    };

    const onMove = (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      targetX = Math.max(-6, Math.min(6, x * strength));
      targetY = Math.max(-6, Math.min(6, y * strength));
      if (!rafId) {
        btn.style.willChange = 'transform';
        rafId = requestAnimationFrame(animate);
      }
    };

    const onLeave = () => {
      targetX = 0; targetY = 0;
      if (!rafId) rafId = requestAnimationFrame(animate);
    };

    btn.addEventListener('mousemove', onMove, { passive: true });
    btn.addEventListener('mouseleave', onLeave);
  });
};

// Card 3D tilt: subtle rotateX/rotateY based on cursor position (max 4deg).
// Only applied to product cards in the assortment grid. Uses requestAnimationFrame
// and CSS custom properties for transform — cheap to repaint.
const initCardTilt = () => {
  if (prefersReducedMotion() || !isFinePointer()) return;
  // Limit tilt to product cards in the assortment grid only (not all .card elements).
  const cards = document.querySelectorAll('.product-card');
  cards.forEach(card => {
    if (card.dataset.premiumTilt === '1') return;
    card.dataset.premiumTilt = '1';
    let rafId = null;
    let pendingEvent = null;
    const onMove = (e) => {
      pendingEvent = e;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const rect = card.getBoundingClientRect();
        const px = (pendingEvent.clientX - rect.left) / rect.width;  // 0..1
        const py = (pendingEvent.clientY - rect.top) / rect.height;  // 0..1
        const rotateY = (px - 0.5) * 8;   // -4..4 deg
        const rotateX = -(py - 0.5) * 8;  // -4..4 deg (inverted)
        card.classList.add('tilt-active');
        card.style.setProperty('--tilt-x', `${rotateX.toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${rotateY.toFixed(2)}deg`);
      });
    };
    const onLeave = () => {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      card.classList.remove('tilt-active');
      card.style.removeProperty('--tilt-x');
      card.style.removeProperty('--tilt-y');
    };
    card.addEventListener('mousemove', onMove, { passive: true });
    card.addEventListener('mouseleave', onLeave);
  });
};

// Animated counters: count up statistics when scrolled into view
const initCounters = () => {
  const counters = document.querySelectorAll('[data-counter]');
  if (!counters.length) return;

  const animate = (el) => {
    const target = Number(el.dataset.counter) || 0;
    const suffix = el.dataset.counterSuffix || '';
    const duration = 1600;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const val = Math.round(target * eased);
      el.textContent = val.toLocaleString('nl-NL') + suffix;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target.toLocaleString('nl-NL') + suffix;
    };
    requestAnimationFrame(step);
  };

  if (prefersReducedMotion()) {
    counters.forEach(el => {
      const target = Number(el.dataset.counter) || 0;
      el.textContent = target.toLocaleString('nl-NL') + (el.dataset.counterSuffix || '');
    });
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animate(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });

  counters.forEach(el => io.observe(el));
};

// Re-init premium effects after dynamic content render
// (called from renderFeatured / renderAssortment via existing hooks)
const refreshPremiumEffects = () => {
  if (prefersReducedMotion()) return;
  // Re-bind magnetic + tilt to any newly rendered buttons/cards
  setTimeout(() => {
    initMagneticButtons();
    initCardTilt();
  }, 50);
};
window.refreshPremiumEffects = refreshPremiumEffects;


// ────────────────────────────────────────────────────────
// REVIEWS PAGE — Reviews & Trust / Social Proof
// ────────────────────────────────────────────────────────
const REVIEWS_DATA = [
  { id: 1,  name: 'Sanne K.',     date: '12 juni 2024',  rating: 5, text: 'Snel geleverd en precies zoals beschreven. Je merkt echt dat de producten gecontroleerd worden.', product: 'Ergonomische Kantoorstoel',  hasPhoto: false },
  { id: 2,  name: 'Mohammed L.',  date: '10 juni 2024',  rating: 5, text: 'Smartwatch besteld als retourproduct en hij is inderdaad bijna nieuw. Werkt verder perfect, batterij gewoon goed.', product: 'Smartwatch Series 6', hasPhoto: true, photo: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80' },
  { id: 3,  name: 'Jessica V.',   date: '9 juni 2024',   rating: 4, text: 'Espressomachine besteld, levering was snel. Werkt goed, alleen de doos was wat beschadigd. Stond overigens eerlijk in de beschrijving.', product: 'Premium Espressomachine', hasPhoto: false },
  { id: 4,  name: 'Pieter D.',    date: '8 juni 2024',   rating: 5, text: 'Koptelefoon ziet eruit als nieuw en klinkt fantastisch. Voor de prijs echt een topdeal.', product: 'Draadloze Koptelefoon', hasPhoto: false },
  { id: 5,  name: 'Fatima E.',    date: '7 juni 2024',   rating: 5, text: 'Bureau netjes geleverd en in elkaar gezet. Geen krassen of beschadigingen. Echt blij mee.', product: 'Houten Bureau 140cm', hasPhoto: false },
  { id: 6,  name: 'Tom B.',       date: '6 juni 2024',   rating: 4, text: 'Retourproduct besteld en het was bijna nieuw. Alleen het doosje was open geweest. Voor de rest geen punt.', product: 'Premium Espressomachine', hasPhoto: true, photo: 'https://images.unsplash.com/photo-1495837174058-6d84671df836?w=600&q=80' },
  { id: 7,  name: 'Linda M.',     date: '5 juni 2024',   rating: 5, text: 'Betrouwbare webshop, alles duidelijk en snelle levering. Krijg je niet vaak genoeg.', product: 'Draadloze Koptelefoon', hasPhoto: false },
  { id: 8,  name: 'Daan S.',      date: '4 juni 2024',   rating: 5, text: 'Verwachting was niet zo hoog, maar positief verrast. Smartwatch ziet er echt als nieuw uit.', product: 'Smartwatch Series 6', hasPhoto: true, photo: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600&q=80' },
  { id: 9,  name: 'Maria G.',     date: '3 juni 2024',   rating: 4, text: 'Goede prijs voor een product dat eigenlijk nieuw aanvoelt. Wel even wennen aan het idee dat het retour was, maar verder top.', product: 'Ergonomische Kantoorstoel', hasPhoto: false },
  { id: 10, name: 'Hans V.',      date: '2 juni 2024',   rating: 5, text: 'Espresso bonen zijn vers en smakelijk. Snel geleverd, goed verpakt. Niets op aan te merken.', product: 'Espresso Bonen 1kg', hasPhoto: false },
  { id: 11, name: 'Aylin T.',     date: '1 juni 2024',   rating: 5, text: 'Vriendelijke klantenservice toen ik een vraag had over de garantie. Snel antwoord gekregen en het product is ook nog eens goed.', product: 'Premium Espressomachine', hasPhoto: false },
  { id: 12, name: 'Bram W.',      date: '30 mei 2024',   rating: 4, text: 'Bureau is stevig en ziet er netjes uit. Wel een klein krasje op de hoek, maar dat stond ook aangegeven. Voor de prijs prima.', product: 'Houten Bureau 140cm', hasPhoto: true, photo: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&q=80' },
  { id: 13, name: 'Nadia R.',     date: '28 mei 2024',   rating: 5, text: 'Bestelling binnen 2 dagen, product ziet er nieuw uit. Echt blij mee, ga zeker vaker bestellen hier.', product: 'Smartwatch Series 6', hasPhoto: false },
  { id: 14, name: 'Jeroen P.',    date: '26 mei 2024',   rating: 5, text: 'Tweedehands maar je merkt er niks van. Battery was zelfs 98%. Top service van Lagenco.', product: 'Draadloze Koptelefoon', hasPhoto: true, photo: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=600&q=80' },
  { id: 15, name: 'Emma D.',      date: '24 mei 2024',   rating: 4, text: 'Bureau is mooi, alleen de montage-instructie was wat onduidelijk. Verder geen klachten, prima product voor een goede prijs.', product: 'Houten Bureau 140cm', hasPhoto: false },
  { id: 16, name: 'Karim H.',     date: '22 mei 2024',   rating: 5, text: 'Geen reclame gemaakt, gewoon goed geleverd wat beloofd was. Zo hoort het.', product: 'Premium Espressomachine', hasPhoto: false },
  { id: 17, name: 'Sophie T.',    date: '20 mei 2024',   rating: 5, text: 'Stoel is comfortabel en ziet er netjes uit. Levering was sneller dan verwacht. Aanrader voor wie duurzaam wil inkopen.', product: 'Ergonomische Kantoorstoel', hasPhoto: true, photo: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=600&q=80' },
  { id: 18, name: 'Rick M.',      date: '18 mei 2024',   rating: 4, text: 'Espresso bonen zijn lekker, alleen de verpakking was iets krom. Smaak maakt het goed. Levering weer snel.', product: 'Espresso Bonen 1kg', hasPhoto: false },
  { id: 19, name: 'Anouk B.',     date: '16 mei 2024',   rating: 5, text: 'Smartwatch was binnen 2 dagen in huis en werkt perfect. Eerlijk over de staat van het product, dat waardeer ik.', product: 'Smartwatch Series 6', hasPhoto: false },
  { id: 20, name: 'Yusuf K.',     date: '14 mei 2024',   rating: 5, text: 'Koptelefoon is geluidstechnisch echt goed. Voor de prijs kan je dit niet beter krijgen. Goed gecontroleerd.', product: 'Draadloze Koptelefoon', hasPhoto: true, photo: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80' },
  { id: 21, name: 'Lars H.',      date: '12 mei 2024',   rating: 5, text: 'Eerst getwijfeld of ik via een site als deze zou bestellen, maar het is heel goed gegaan. Bureau is mooi en stevig.', product: 'Houten Bureau 140cm', hasPhoto: false },
  { id: 22, name: 'Esmee B.',     date: '10 mei 2024',   rating: 4, text: 'Eerlijk over de staat van het product. Klein krasje op de bodem maar dat zag je pas bij heel goed zoeken. Voor de rest perfect.', product: 'Premium Espressomachine', hasPhoto: false }
];

const REVIEWS_INITIAL = 9;       // aantal bij eerste render
const REVIEWS_INCREMENT = 6;     // aantal per 'meer laden'
const REVIEWS_PHOTO_URLS = {
  // Fallback foto's per product indien een review hasPhoto maar geen photo veld heeft
  'Smartwatch Series 6':       'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80',
  'Draadloze Koptelefoon':     'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
  'Ergonomische Kantoorstoel': 'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=600&q=80',
  'Houten Bureau 140cm':       'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&q=80',
  'Premium Espressomachine':   'https://images.unsplash.com/photo-1495837174058-6d84671df836?w=600&q=80'
};

// Render stars as HTML string
const renderStars = (rating) => {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<i class="fas fa-star${i > r ? ' empty' : ''}"></i>`;
  }
  return `<span class="stars" aria-label="${r} van 5 sterren">${html}</span>`;
};

// Initials for avatar
const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Build single review card HTML
const buildReviewCard = (r) => {
  const photoHtml = r.hasPhoto
    ? `<div class="review-card-photo">
         <img src="${r.photo || REVIEWS_PHOTO_URLS[r.product] || 'https://images.unsplash.com/photo-1503602642458-232111445657?w=600&q=80'}" alt="Foto bij review van ${escapeHtml(r.name)}" loading="lazy" decoding="async">
       </div>`
    : '';
  return `
    <article class="review-card" data-rating="${r.rating}" data-has-photo="${r.hasPhoto ? '1' : '0'}">
      <div class="review-card-head">
        <div class="review-card-avatar">${escapeHtml(initials(r.name))}</div>
        <div class="review-card-name-block">
          <p class="review-card-name">
            ${escapeHtml(r.name)}
            <span class="review-card-verified"><i class="fas fa-check"></i> Geverifieerd</span>
          </p>
          <p class="review-card-date">${escapeHtml(r.date)}</p>
        </div>
      </div>
      <div class="review-card-rating">${renderStars(r.rating)}</div>
      <p class="review-card-text">${escapeHtml(r.text)}</p>
      ${photoHtml}
      <p class="review-card-product">
        <i class="fas fa-shopping-bag"></i>
        Gekocht: <strong>${escapeHtml(r.product)}</strong>
      </p>
    </article>`;
};

const initReviewsPage = () => {
  const grid = document.getElementById('reviewsGrid');
  if (!grid) return;

  let currentFilter = 'all';
  let visibleCount = REVIEWS_INITIAL;
  let liveTimers = [];

  const getFiltered = () => {
    if (currentFilter === 'all')   return REVIEWS_DATA;
    if (currentFilter === 'photo') return REVIEWS_DATA.filter(r => r.hasPhoto);
    return REVIEWS_DATA.filter(r => Number(r.rating) === Number(currentFilter));
  };

  const renderReviews = () => {
    const filtered = getFiltered();
    const shown = filtered.slice(0, visibleCount);
    grid.innerHTML = shown.map(buildReviewCard).join('');

    // Update count text
    const countEl = document.getElementById('reviewsCount');
    if (countEl) {
      countEl.innerHTML = `Toont <strong>${shown.length}</strong> van <strong>${filtered.length}</strong> reviews`;
    }

    // Toggle load-more button visibility
    const loadBtn = document.getElementById('loadMoreReviews');
    if (loadBtn) {
      if (shown.length >= filtered.length) {
        loadBtn.style.display = 'none';
      } else {
        loadBtn.style.display = '';
      }
      loadBtn.classList.remove('loading');
      loadBtn.innerHTML = '<i class="fas fa-arrow-down"></i> Meer reviews laden';
    }
  };

  // ── Filter buttons ──
  document.querySelectorAll('.review-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.review-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter || 'all';
      visibleCount = REVIEWS_INITIAL;
      renderReviews();
    });
  });

  // ── Load more ──
  const loadBtn = document.getElementById('loadMoreReviews');
  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      // Subtle loading animation
      loadBtn.classList.add('loading');
      loadBtn.innerHTML = '<i class="fas fa-spinner"></i> Laden...';
      const delay = prefersReducedMotion() ? 0 : 350;
      setTimeout(() => {
        visibleCount += REVIEWS_INCREMENT;
        renderReviews();
      }, delay);
    });
  }

  // ── FAQ accordion ──
  document.querySelectorAll('.faq-item').forEach(item => {
    const btn = item.querySelector('.faq-q');
    const ans = item.querySelector('.faq-a');
    if (!btn || !ans) return;
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      // Sluit alle andere FAQ items
      document.querySelectorAll('.faq-item.open').forEach(other => {
        if (other !== item) {
          other.classList.remove('open');
          other.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
          const otherAns = other.querySelector('.faq-a');
          if (otherAns) otherAns.style.maxHeight = '0';
        }
      });
      if (isOpen) {
        item.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        ans.style.maxHeight = '0';
      } else {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        ans.style.maxHeight = ans.scrollHeight + 'px';
      }
    });
  });

  // ── Verification progress bars (animate on scroll) ──
  const bars = document.querySelectorAll('.verification-bar-fill[data-fill]');
  if (bars.length) {
    const animateBars = () => {
      bars.forEach(bar => {
        const target = bar.dataset.fill + '%';
        bar.style.width = target;
      });
    };
    if (prefersReducedMotion()) {
      animateBars();
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animateBars();
            io.disconnect();
          }
        });
      }, { threshold: 0.25 });
      // Observe the verification progress card
      const progressCard = document.querySelector('.verification-progress-card');
      if (progressCard) io.observe(progressCard);
      else animateBars();
    }
  }

  // ── Live trust indicators ──
  const viewersEl = document.getElementById('liveViewers');
  const ordersEl  = document.getElementById('liveOrders');
  const productEl = document.getElementById('liveProduct');

  // Meest gekozen product: pak eerste product uit localStorage, anders fallback
  if (productEl) {
    try {
      const products = getProducts();
      if (Array.isArray(products) && products.length > 0 && products[0].title) {
        productEl.textContent = products[0].title;
      } else {
        productEl.textContent = 'Smartwatch Series 6';
      }
    } catch {
      productEl.textContent = 'Smartwatch Series 6';
    }
  }

  let viewers = 12;
  let orders = 38;

  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // Viewers: fluctueert elke 4-6 sec tussen 8-23
  const tickViewers = () => {
    if (!viewersEl) return;
    const next = randomInt(8, 23);
    // Stuur naar de nieuwe waarde met 1-3 stappen voor een natuurlijker effect
    if (prefersReducedMotion()) {
      viewers = next;
      viewersEl.textContent = viewers;
    } else {
      const steps = randomInt(1, 3);
      let step = 0;
      const stepInterval = setInterval(() => {
        if (viewers < next) viewers++;
        else if (viewers > next) viewers--;
        viewersEl.textContent = viewers;
        step++;
        if (step >= steps || viewers === next) clearInterval(stepInterval);
      }, 300);
    }
  };

  // Orders: stijgt met 1 elke 12-20 sec
  const tickOrders = () => {
    if (!ordersEl) return;
    orders++;
    ordersEl.textContent = orders;
  };

  if (!prefersReducedMotion()) {
    // Stagger de eerste ticks zodat ze niet synchroon lopen
    const scheduleViewers = () => {
      const delay = randomInt(4000, 6000);
      const t = setTimeout(() => { tickViewers(); scheduleViewers(); }, delay);
      liveTimers.push(t);
    };
    const scheduleOrders = () => {
      const delay = randomInt(12000, 20000);
      const t = setTimeout(() => { tickOrders(); scheduleOrders(); }, delay);
      liveTimers.push(t);
    };
    scheduleViewers();
    scheduleOrders();
  } else {
    // Bij reduced motion: 1x een waarde zetten, verder niet blijven updaten
    viewersEl && (viewersEl.textContent = viewers);
    ordersEl  && (ordersEl.textContent  = orders);
  }

  // ── Smooth scroll voor interne anchor links ──
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const reduce = prefersReducedMotion();
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      // Verplaats focus voor screen readers
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  // Cleanup bij page hide (voorkomt timers die doorlopen in bfcache)
  window.addEventListener('pagehide', () => {
    liveTimers.forEach(t => clearTimeout(t));
    liveTimers = [];
  }, { once: true });

  // Initiele render
  renderReviews();
};

// ─── Initialize bid form (event listeners) ───
const initBidForm = () => {
  const form = document.getElementById('bidForm');
  if (form) {
    form.addEventListener('submit', handleBidSubmit);
  }

  // Wire up shipping method radio buttons to toggle address fields
  document.querySelectorAll('input[name="bidShippingMethod"]').forEach(radio => {
    radio.addEventListener('change', toggleBidAddressFields);
  });
};

// ─── Render Live Bids section (on homepage) ───
const renderLiveBids = () => {
  const grid = document.getElementById('liveBidsGrid');
  const empty = document.getElementById('liveBidsEmpty');
  if (!grid) return; // only on index page

  const products = getProducts();
  if (!products.length) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  // Build map of product -> bids (sorted by amount desc, highest first)
  const productBids = products.map(p => ({
    product: p,
    bids: getBidsForProduct(p.id),
    highestBid: (() => {
      const list = getBidsForProduct(p.id);
      return list.length ? list[0].amount : 0;
    })()
  })).filter(x => x.bids.length > 0); // only products WITH bids

  if (!productBids.length) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }

  // Sort: most bids first, then by highest bid
  productBids.sort((a, b) => {
    if (b.bids.length !== a.bids.length) return b.bids.length - a.bids.length;
    return b.highestBid - a.highestBid;
  });

  if (empty) empty.classList.add('hidden');

  grid.innerHTML = productBids.map(({ product, bids, highestBid }) => {
    const img = getImg(product);
    const askingPrice = parseFloat(product.price) || 0;
    const bidCount = bids.length;
    const minNextBid = Math.round((highestBid + 1) * 100) / 100;
    const initials = bids[0].name.split(' ').map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase();
    const timeAgo = (() => {
      try {
        const diff = Date.now() - new Date(bids[0].createdAt).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'zojuist';
        if (mins < 60) return mins + ' min geleden';
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + ' uur geleden';
        const days = Math.floor(hrs / 24);
        return days + ' dag' + (days > 1 ? 'en' : '') + ' geleden';
      } catch { return ''; }
    })();
    // Product badge (RETOURPRODUCT / Tweedehands / Nieuw / etc.)
    const productBadge = product.badge ? `<span class="badge ${badgeClass(product.badge)} live-bid-product-badge"><i class="fas fa-tag"></i>${escapeHtml(product.badge)}</span>` : '';

    return `
    <article class="card live-bid-card reveal" data-reveal data-product-id="${product.id}">
      <div class="live-bid-img-wrap" data-action="view" data-id="${product.id}" style="cursor:pointer">
        <img src="${img}" alt="${escapeHtml(product.title)}" loading="lazy" decoding="async">
        ${productBadge}
        <span class="live-bid-pulse">
          <span class="pulse-dot"></span>
          ${bidCount} ${bidCount === 1 ? 'bod' : 'biedingen'}
        </span>
      </div>
      <div class="live-bid-body">
        <h3 class="live-bid-title">${escapeHtml(product.title)}</h3>

        <div class="live-bid-current">
          <div class="live-bid-current-label">Hoogste bod nu</div>
          <div class="live-bid-current-amount">€ ${highestBid.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>

        <div class="live-bid-bidder">
          <div class="live-bid-avatar">${escapeHtml(initials)}</div>
          <div class="live-bid-bidder-info">
            <div class="live-bid-bidder-name">${escapeHtml(bids[0].name)}</div>
            <div class="live-bid-time"><i class="far fa-clock"></i> ${timeAgo}</div>
          </div>
        </div>

        <div class="live-bid-asking">
          Asking price: <strong>€ ${askingPrice.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>

        <div class="live-bid-actions">
          <button class="btn btn-warm live-bid-cta" data-action="view" data-id="${product.id}">
            <i class="fas fa-gavel"></i> Bied meer (vanaf € ${minNextBid.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
          </button>
          <button class="btn btn-ghost live-bid-details" data-action="view" data-id="${product.id}">
            Productdetails <i class="fas fa-arrow-right text-xs"></i>
          </button>
        </div>
      </div>
    </article>`;
  }).join('');

  // Trigger scroll reveal animation on newly added cards
  setTimeout(() => {
    if (typeof initScrollReveal === 'function') initScrollReveal();
  }, 50);
};

// ═══════════════════════════════════════════════════════
// COMMUNITY POSTS — admin posts + user reactions
// ═══════════════════════════════════════════════════════
const getCommunityPosts = ()  => (window.LagencoDB ? window.LagencoDB.getPosts() : []);
const saveCommunityPosts = (posts) => {
  // Batch re-save — used by cleanup flows. Writes each post individually.
  if (window.LagencoDB && window.LagencoDB.isConfigured) {
    posts.forEach(p => { window.LagencoDB.savePost(p); });
  }
};

const addCommunityPost = (post) => {
  post.id = 'post_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  post.createdAt = new Date().toISOString();
  post.comments = post.comments || [];
  if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.savePost(post); }
  return post;
};

const addCommunityComment = (postId, comment) => {
  const post = getCommunityPosts().find(p => p.id === postId);
  if (post) {
    comment.id = 'cmt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    comment.createdAt = new Date().toISOString();
    post.comments = post.comments || [];
    post.comments.push(comment);
    if (window.LagencoDB && window.LagencoDB.isConfigured) {
      window.LagencoDB.savePost(post); // re-save full post so comments array stays in sync
      window.LagencoDB.saveComment(postId, comment);
    }
    return comment;
  }
  return null;
};

const deleteCommunityPost = (postId) => {
  if (window.LagencoDB && window.LagencoDB.isConfigured) {
    window.LagencoDB.deletePost(postId);
  }
};

const deleteCommunityComment = (postId, commentId) => {
  const post = getCommunityPosts().find(p => p.id === postId);
  if (post) {
    post.comments = (post.comments || []).filter(c => c.id !== commentId);
    if (window.LagencoDB && window.LagencoDB.isConfigured) {
      window.LagencoDB.savePost(post); // re-save full post so the comments array is updated
      window.LagencoDB.deleteComment(postId, commentId);
    }
  }
};

// Format relative time
const fmtRelativeTime = (iso) => {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'zojuist';
    if (mins < 60) return mins + ' min geleden';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' uur geleden';
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + ' dag' + (days > 1 ? 'en' : '') + ' geleden';
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return weeks + ' week' + (weeks > 1 ? 'en' : '') + ' geleden';
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
};

// Get initials from username/name
const getInitials = (name = '') => {
  return name.trim().split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase() || '?';
};

// Generate a stable color from a string (for avatar backgrounds)
const colorFromString = (str = '') => {
  const colors = [
    ['#0F3D2E', '#1E5A42'], // green
    ['#C08457', '#9A6534'], // warm
    ['#2C5F8D', '#1e4a72'], // blue
    ['#7A4F8D', '#5c3a72'], // purple
    ['#8D4F4F', '#6e3a3a'], // red-brown
    ['#4F8D6F', '#3a6e54'], // emerald
    ['#8D7A4F', '#6e5c3a']  // gold
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

// Parse community post body to render quick links as clickable buttons
// Format: [[LINK|LABEL]]  →  <a href="LINK" class="community-quicklink-rendered">LABEL</a>
// Special: [[wheelspin|LABEL]]  →  wheel spin button
const parseCommunityBody = (text) => {
  if (!text) return '';
  // First escape HTML
  let html = escapeHtml(text);
  // Preserve newlines
  html = html.replace(/\n/g, '<br>');
  // Replace [[LINK|LABEL]] pattern with styled link or wheel spin button
  html = html.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (match, link, label) => {
    const safeLink = escapeHtml(link.trim());
    const safeLabel = escapeHtml(label.trim());
    // Special: wheel spin button
    if (safeLink === 'wheelspin') {
      return `<button class="community-wheelspin-btn" onclick="openWheelSpin()"><i class="fas fa-circle-notch"></i> ${safeLabel} 🎡</button>`;
    }
    // Only allow relative links to internal pages (security)
    if (/^[\w-]+\.html(#.*)?$/.test(safeLink) || safeLink.startsWith('mailto:') || safeLink.startsWith('tel:')) {
      return `<a href="${safeLink}" class="community-quicklink-rendered"><i class="fas fa-arrow-right"></i> ${safeLabel}</a>`;
    }
    return safeLabel;
  });
  return html;
};

// Render a single community post
const renderCommunityPost = (post, admin = false) => {
  const [c1, c2] = colorFromString('Lagenco');
  const postTime = fmtRelativeTime(post.createdAt);
  const commentCount = (post.comments || []).length;

  // Comments HTML
  const commentsHtml = (post.comments || []).map(c => {
    const [bc1, bc2] = colorFromString(c.username || 'Anoniem');
    const cmtTime = fmtRelativeTime(c.createdAt);
    return `
      <div class="community-comment" data-comment-id="${c.id}">
        <div class="community-comment-avatar" style="background:linear-gradient(135deg,${bc1},${bc2})">${escapeHtml(getInitials(c.username))}</div>
        <div class="community-comment-body">
          <div class="community-comment-header">
            <span class="community-comment-name">${escapeHtml(c.username || 'Anoniem')}</span>
            <span class="community-comment-time"><i class="far fa-clock"></i> ${cmtTime}</span>
            ${admin ? `<button class="community-comment-delete" data-delete-comment="${post.id}|${c.id}" title="Reactie verwijderen"><i class="fas fa-times"></i></button>` : ''}
          </div>
          <p class="community-comment-text">${escapeHtml(c.text)}</p>
        </div>
      </div>`;
  }).join('');

  // Image HTML (if post has an image)
  const imageHtml = post.image
    ? `<div class="community-post-image" style="margin:.5rem 0 1.25rem;border-radius:1rem;overflow:hidden;border:1px solid var(--border);box-shadow:var(--shadow-sm)"><img src="${post.image}" alt="Bericht afbeelding" style="width:100%;max-height:400px;object-fit:cover;display:block" loading="lazy"></div>`
    : '';

  return `
  <article class="community-post reveal" data-reveal data-post-id="${post.id}">
    <div class="community-post-header">
      <div class="community-post-avatar" style="background:linear-gradient(135deg,${c1},${c2})">
        <i class="fas fa-leaf"></i>
      </div>
      <div class="community-post-meta">
        <div class="community-post-author">
          <span class="community-post-author-name">Lagenco</span>
          <span class="community-post-author-badge"><i class="fas fa-check-circle"></i> Officieel</span>
        </div>
        <div class="community-post-time"><i class="far fa-clock"></i> ${postTime}</div>
      </div>
      ${admin ? `<button class="community-post-delete" data-delete-post="${post.id}" title="Bericht verwijderen"><i class="fas fa-trash"></i></button>` : ''}
    </div>

    <h3 class="community-post-title">${escapeHtml(post.title)}</h3>
    <p class="community-post-body">${parseCommunityBody(post.body)}</p>
    ${imageHtml}

    <div class="community-post-stats">
      <span class="community-post-stat"><i class="far fa-comment"></i> ${commentCount} ${commentCount === 1 ? 'reactie' : 'reacties'}</span>
    </div>

    <div class="community-comments" id="comments_${post.id}">
      ${commentsHtml}
    </div>

    <form class="community-comment-form" data-post-id="${post.id}" onsubmit="return false;">
      <input type="text" class="community-comment-username" placeholder="Jouw gebruikersnaam" maxlength="30" required>
      <input type="text" class="community-comment-text-input" placeholder="Schrijf een reactie..." maxlength="500" required>
      <button type="submit" class="community-comment-submit"><i class="fas fa-paper-plane"></i></button>
    </form>
  </article>`;
};

// Render all community posts
const renderCommunityPosts = () => {
  const list = document.getElementById('communityPostsList');
  const empty = document.getElementById('communityEmpty');
  if (!list) return; // only on index page

  const posts = getCommunityPosts();
  const admin = isLoggedIn();

  // Show/hide admin controls
  const adminToggle = document.getElementById('communityAdminToggle');
  if (adminToggle) {
    if (admin) adminToggle.classList.remove('hidden');
    else adminToggle.classList.add('hidden');
  }
  // Hide the admin form by default (only show when clicking "nieuw bericht")
  const adminForm = document.getElementById('communityAdminForm');
  if (adminForm) adminForm.classList.add('hidden');

  if (!posts.length) {
    list.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  list.innerHTML = posts.map(p => renderCommunityPost(p, admin)).join('');

  // Trigger scroll reveal on new posts
  setTimeout(() => {
    if (typeof initScrollReveal === 'function') initScrollReveal();
  }, 50);
};

// Initialize community events
const initCommunity = () => {
  // "Nieuw bericht" button — open form
  const newBtn = document.getElementById('communityNewPostBtn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      const form = document.getElementById('communityAdminForm');
      const toggle = document.getElementById('communityAdminToggle');
      if (form) form.classList.remove('hidden');
      if (toggle) toggle.classList.add('hidden');
      const titleInput = document.getElementById('communityPostTitle');
      if (titleInput) titleInput.focus();
    });
  }

  // Cancel button
  const cancelBtn = document.getElementById('communityPostCancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      const form = document.getElementById('communityAdminForm');
      const toggle = document.getElementById('communityAdminToggle');
      if (form) form.classList.add('hidden');
      if (toggle) toggle.classList.remove('hidden');
      const titleInput = document.getElementById('communityPostTitle');
      const bodyInput = document.getElementById('communityPostBody');
      if (titleInput) titleInput.value = '';
      if (bodyInput) bodyInput.value = '';
      // Reset image preview
      const imageInput = document.getElementById('communityPostImage');
      const imagePreview = document.getElementById('communityImagePreview');
      if (imageInput) imageInput.value = '';
      if (imagePreview) imagePreview.classList.add('hidden');
      window._communityImage = null;
    });
  }

  // Quick link buttons — voegt [[link|label]] toe aan body
  document.querySelectorAll('.community-quicklink').forEach(btn => {
    btn.addEventListener('click', () => {
      const link = btn.dataset.link;
      const label = btn.dataset.label;
      const bodyInput = document.getElementById('communityPostBody');
      if (!bodyInput) return;
      // Voeg snelkoppeling marker toe op cursor positie
      const start = bodyInput.selectionStart;
      const end = bodyInput.selectionEnd;
      const text = bodyInput.value;
      const insert = ` [[${link}|${label}]] `;
      bodyInput.value = text.slice(0, start) + insert + text.slice(end);
      bodyInput.focus();
      bodyInput.setSelectionRange(start + insert.length, start + insert.length);
      toast('Snelkoppeling toegevoegd', 'success', 1500);
    });
    // Hover effect
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-1px) scale(1.05)';
      btn.style.borderColor = 'var(--green)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
      btn.style.borderColor = 'var(--border)';
    });
  });

  // Image upload handler
  const uploadArea = document.getElementById('communityImageUploadArea');
  const imageInput = document.getElementById('communityPostImage');
  const imagePreview = document.getElementById('communityImagePreview');
  const imagePreviewImg = document.getElementById('communityImagePreviewImg');
  const imageRemoveBtn = document.getElementById('communityImageRemove');

  if (uploadArea && imageInput) {
    uploadArea.addEventListener('click', () => imageInput.click());
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--green)';
      uploadArea.style.background = 'var(--green-light)';
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.borderColor = 'var(--border-2)';
      uploadArea.style.background = 'var(--bg-2)';
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'var(--border-2)';
      uploadArea.style.background = 'var(--bg-2)';
      if (e.dataTransfer.files.length) {
        imageInput.files = e.dataTransfer.files;
        imageInput.dispatchEvent(new Event('change'));
      }
    });
    imageInput.addEventListener('change', () => {
      const file = imageInput.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast('Selecteer een afbeelding', 'error');
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast('Afbeelding te groot (max 2MB)', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        window._communityImage = e.target.result;
        if (imagePreviewImg) imagePreviewImg.src = e.target.result;
        if (imagePreview) imagePreview.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    });
  }
  if (imageRemoveBtn) {
    imageRemoveBtn.addEventListener('click', () => {
      if (imageInput) imageInput.value = '';
      if (imagePreview) imagePreview.classList.add('hidden');
      window._communityImage = null;
    });
  }

  // Submit post button
  const submitBtn = document.getElementById('communityPostSubmit');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const titleInput = document.getElementById('communityPostTitle');
      const bodyInput = document.getElementById('communityPostBody');
      const title = (titleInput?.value || '').trim();
      const body = (bodyInput?.value || '').trim();

      if (title.length < 3) { toast('Titel moet minimaal 3 tekens zijn', 'error'); titleInput?.focus(); return; }
      if (body.length < 5) { toast('Bericht moet minimaal 5 tekens zijn', 'error'); bodyInput?.focus(); return; }
      if (!isLoggedIn()) { toast('Alleen admins kunnen berichten plaatsen', 'error'); return; }

      // Save post with optional image
      const postData = { title, body, author: 'Lagenco' };
      if (window._communityImage) postData.image = window._communityImage;
      addCommunityPost(postData);
      toast('Bericht geplaatst!', 'success');
      if (titleInput) titleInput.value = '';
      if (bodyInput) bodyInput.value = '';
      if (imageInput) imageInput.value = '';
      if (imagePreview) imagePreview.classList.add('hidden');
      window._communityImage = null;
      const form = document.getElementById('communityAdminForm');
      const toggle = document.getElementById('communityAdminToggle');
      if (form) form.classList.add('hidden');
      if (toggle) toggle.classList.remove('hidden');
      renderCommunityPosts();
    });
  }

  // Event delegation for post interactions
  document.addEventListener('click', e => {
    // Submit comment via button click
    const submitCommentBtn = e.target.closest('.community-comment-submit');
    if (submitCommentBtn) {
      const form = submitCommentBtn.closest('.community-comment-form');
      if (form) handleCommentSubmit(form);
      return;
    }
    // Delete post
    const deletePostBtn = e.target.closest('[data-delete-post]');
    if (deletePostBtn) {
      const postId = deletePostBtn.dataset.deletePost;
      if (confirm('Weet je zeker dat je dit bericht wilt verwijderen?')) {
        deleteCommunityPost(postId);
        toast('Bericht verwijderd', 'success');
        renderCommunityPosts();
      }
      return;
    }
    // Delete comment
    const deleteCommentBtn = e.target.closest('[data-delete-comment]');
    if (deleteCommentBtn) {
      const [postId, commentId] = deleteCommentBtn.dataset.deleteComment.split('|');
      if (confirm('Reactie verwijderen?')) {
        deleteCommunityComment(postId, commentId);
        toast('Reactie verwijderd', 'success');
        renderCommunityPosts();
      }
      return;
    }
  });

  // Event delegation for Enter key in comment form
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target.classList.contains('community-comment-text-input') || e.target.classList.contains('community-comment-username'))) {
      if (e.target.classList.contains('community-comment-username')) {
        const form = e.target.closest('.community-comment-form');
        const textInput = form?.querySelector('.community-comment-text-input');
        if (textInput) textInput.focus();
        e.preventDefault();
        return;
      }
      if (e.target.classList.contains('community-comment-text-input')) {
        const form = e.target.closest('.community-comment-form');
        if (form) handleCommentSubmit(form);
        e.preventDefault();
      }
    }
  });
};

// Handle comment form submission
const handleCommentSubmit = (form) => {
  const postId = form.dataset.postId;
  const usernameInput = form.querySelector('.community-comment-username');
  const textInput = form.querySelector('.community-comment-text-input');
  const username = (usernameInput?.value || '').trim();
  const text = (textInput?.value || '').trim();

  if (username.length < 2) { toast('Vul een gebruikersnaam in (min. 2 tekens)', 'error'); usernameInput?.focus(); return; }
  if (text.length < 1) { toast('Schrijf eerst een reactie', 'error'); textInput?.focus(); return; }

  addCommunityComment(postId, { username, text });
  toast('Reactie geplaatst!', 'success', 2000);
  if (textInput) textInput.value = '';
  renderCommunityPosts();
};

// Expose for inline use
window.renderCommunityPosts = renderCommunityPosts;

// ═══════════════════════════════════════════════════════
// WHEEL SPIN — kansberekening + animatie + prijs
// ═══════════════════════════════════════════════════════

// Default wheel segments (matching website palette)
const DEFAULT_WHEEL_SEGMENTS = [
  {
    id: 'korting5', label: '€5 Korting', short: '€5 Korting', chance: 0.01,
    color: '#6BBF7E', textColor: '#fff', icon: '🎁',
    title: 'Je hebt €5 korting gewonnen!',
    text: 'Gefeliciteerd! Je hebt een kortingscode van €5 gewonnen. Gebruik deze code bij je volgende aankoop:',
    hasCode: true, codePrefix: 'LAGENCO5-'
  },
  {
    id: 'gratisretour', label: 'Gratis Retour', short: 'Gratis Retour', chance: 0.005,
    color: '#FFB088', textColor: '#fff', icon: '📦',
    title: 'Je hebt een gratis retourproduct gewonnen!',
    text: 'Wow! Je hebt 1 gratis retourproduct van je keuze gewonnen. Gebruik deze code bij het afrekenen:',
    hasCode: true, codePrefix: 'GRATISRETOUR-'
  },
  {
    id: 'gratisverzend', label: 'Gratis Verzending', short: 'Gratis Verzend', chance: 0.05,
    color: '#FFD56B', textColor: '#2D3A2E', icon: '🚚',
    title: 'Je hebt gratis verzending gewonnen!',
    text: 'Leuk! Je hebt gratis verzending op je volgende bestelling gewonnen. Gebruik deze code bij het afrekenen:',
    hasCode: true, codePrefix: 'FREESHIP-'
  },
  {
    id: 'niks', label: 'Helaas!', short: 'Niks', chance: 0.935,
    color: '#C5B6E5', textColor: '#fff', icon: '😊',
    title: 'Helaas, geen prijs deze keer!',
    text: 'Geen zorgen — je kunt het altijd nog een keer proberen als er een nieuwe wheel spin is! Bedankt voor het meedoen.',
    hasCode: false, codePrefix: null
  }
];

// Load wheel settings from Firebase (admin can adjust via dashboard)
const getWheelSegments = () => {
  try {
    if (window.LagencoDB) {
      const settings = window.LagencoDB.getWheelSettings();
      if (settings && Array.isArray(settings) && settings.length) {
        // Convert percentage (1-100) to decimal (0-1) and add 'short' field
        return settings.map(s => ({
          ...s,
          short: s.label,
          chance: (parseFloat(s.chance) || 0) / 100
        }));
      }
    }
  } catch (e) {}
  return DEFAULT_WHEEL_SEGMENTS;
};

// Check if spins have been reset (via dashboard reset token)
// Reset token lives in Firebase; visitor's last-seen token in sessionStorage.
const checkSpinReset = () => {
  try {
    const currentToken = window.LagencoDB ? window.LagencoDB.getResetToken() : null;
    const visitorToken = sessionStorage.getItem('lagencoWheelSpinResetToken');
    if (currentToken && currentToken !== visitorToken) {
      // Token changed → reset visitor's spin flag
      sessionStorage.removeItem('lagencoWheelSpinDone');
      sessionStorage.setItem('lagencoWheelSpinResetToken', currentToken);
    }
  } catch (e) {}
};

let wheelSpinning = false;
let wheelCurrentRotation = 0;

// Generate the wheel SVG with 4 colored segments
const buildWheelSVG = () => {
  const svg = document.getElementById('wheelSvg');
  if (!svg) return;

  const cx = 100, cy = 100, r = 90;
  // Calculate segment angles based on chances (but for visual balance, give each equal visual size)
  // Visual: equal segments (4 x 90°), but chance is calculated separately
  const segments = getWheelSegments();
  const segmentAngle = 360 / segments.length;
  let startAngle = -90; // start at top

  let svgContent = '';
  segments.forEach((seg, i) => {
    const endAngle = startAngle + segmentAngle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = segmentAngle > 180 ? 1 : 0;

    // Path for segment
    svgContent += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${seg.color}" stroke="white" stroke-width="2"/>`;

    // Label position (midpoint of segment)
    const midAngle = startAngle + segmentAngle / 2;
    const midRad = (midAngle * Math.PI) / 180;
    const labelR = r * 0.6;
    const labelX = cx + labelR * Math.cos(midRad);
    const labelY = cy + labelR * Math.sin(midRad);

    // Icon + label text
    svgContent += `<text x="${labelX}" y="${labelY - 5}" text-anchor="middle" font-size="14" fill="${seg.textColor}" font-family="Poppins, sans-serif" font-weight="700">${seg.icon}</text>`;
    svgContent += `<text x="${labelX}" y="${labelY + 12}" text-anchor="middle" font-size="7" fill="${seg.textColor}" font-family="Poppins, sans-serif" font-weight="700" letter-spacing="0.5">${seg.short.toUpperCase()}</text>`;

    startAngle = endAngle;
  });

  svg.innerHTML = svgContent;
};

// Pick a winning segment based on chances
const pickWinningSegment = () => {
  const segments = getWheelSegments();
  const rand = Math.random();
  let cumulative = 0;
  for (const seg of segments) {
    cumulative += seg.chance;
    if (rand < cumulative) return seg;
  }
  return segments[segments.length - 1]; // fallback
};

// Generate a unique prize code
const generatePrizeCode = (prefix) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = prefix;
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Open the wheel spin modal
const openWheelSpin = () => {
  // Check if spins have been reset (via dashboard)
  checkSpinReset();

  // Check if user already spun (1x per session)
  try {
    const alreadySpun = sessionStorage.getItem('lagencoWheelSpinDone');
    if (alreadySpun === '1') {
      toast('Je hebt al een keer gedraaid!', 'Kom terug bij de volgende wheel spin.', 'info', 4000);
      return;
    }
  } catch (e) {}

  // Reset state
  wheelSpinning = false;
  wheelCurrentRotation = 0;
  const wheelEl = document.getElementById('wheelEl');
  if (wheelEl) wheelEl.style.transition = 'none';
  if (wheelEl) wheelEl.style.transform = 'rotate(0deg)';
  const result = document.getElementById('wheelResult');
  if (result) result.classList.add('hidden');
  const spinBtn = document.getElementById('wheelSpinBtn');
  if (spinBtn) {
    spinBtn.classList.remove('hidden');
    spinBtn.disabled = false;
    spinBtn.innerHTML = '<i class="fas fa-circle-notch"></i> Draaien maar!';
  }

  // Build wheel
  buildWheelSVG();
  openModal('wheelSpinModal');
};

// Spin the wheel
const spinWheel = () => {
  if (wheelSpinning) return;
  wheelSpinning = true;

  const spinBtn = document.getElementById('wheelSpinBtn');
  if (spinBtn) {
    spinBtn.disabled = true;
    spinBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Draaien...';
  }

  // Pick winning segment
  const winner = pickWinningSegment();
  const segments = getWheelSegments();
  const segmentIndex = segments.indexOf(winner);
  const segmentAngle = 360 / segments.length;

  // Calculate target rotation: pointer at top (0°), need winning segment centered at top
  // Segments start at -90° (top), so segment i center is at: -90 + (i + 0.5) * 90 = -90 + i*90 + 45
  // To bring segment i to top (0°), rotate by: 360 - (i * 90 + 45) + full spins
  const segmentCenterOffset = segmentIndex * segmentAngle + segmentAngle / 2;
  const fullSpins = 5 + Math.floor(Math.random() * 3); // 5-7 full spins
  const targetRotation = wheelCurrentRotation + fullSpins * 360 + (360 - segmentCenterOffset);

  // Animate
  const wheelEl = document.getElementById('wheelEl');
  if (wheelEl) {
    wheelEl.style.transition = 'transform 4s cubic-bezier(0.16, 1, 0.3, 1)';
    wheelEl.style.transform = `rotate(${targetRotation}deg)`;
  }
  wheelCurrentRotation = targetRotation;

  // Show result after animation
  setTimeout(() => {
    showWheelResult(winner);
    wheelSpinning = false;
    // Mark as spun (1x per session)
    try { sessionStorage.setItem('lagencoWheelSpinDone', '1'); } catch (e) {}
  }, 4200);
};

// Show the result
const showWheelResult = (winner) => {
  const result = document.getElementById('wheelResult');
  const resultIcon = document.getElementById('wheelResultIcon');
  const resultTitle = document.getElementById('wheelResultTitle');
  const resultText = document.getElementById('wheelResultText');
  const resultCode = document.getElementById('wheelResultCode');
  const spinBtn = document.getElementById('wheelSpinBtn');

  if (spinBtn) spinBtn.classList.add('hidden');

  if (resultIcon) resultIcon.textContent = winner.icon;
  if (resultTitle) resultTitle.textContent = winner.title;
  if (resultText) resultText.textContent = winner.text;

  // Build result HTML based on whether won or not
  if (winner.hasCode) {
    // WINNER — toon naam/email formulier + gegenereerde code
    const code = generatePrizeCode(winner.codePrefix);

    // Sla de coupon op met status 'ongebruikt' — direct in Firebase
    try {
      const coupon = {
        code,
        type: winner.id,
        label: winner.label,
        wonAt: new Date().toISOString(),
        status: 'ongebruikt',  // ongebruikt | gebruikt
        usedAt: null,
        winnerName: '',
        winnerEmail: ''
      };
      if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.saveCoupon(coupon); }
    } catch (e) {}

    // Toon het resultaat met naam/email veld EN de code
    if (result) {
      result.innerHTML = `
        <div class="wheel-result-icon" id="wheelResultIcon">${winner.icon}</div>
        <h3 class="wheel-result-title" id="wheelResultTitle">${winner.title}</h3>
        <p class="wheel-result-text" id="wheelResultText">${winner.text}</p>
        <div style="margin:1rem 0">
          <label style="display:block;font-size:.78rem;font-weight:700;color:var(--text);margin-bottom:.4rem;font-family:'Poppins',sans-serif">Jouw naam (optioneel)</label>
          <input type="text" id="wheelWinnerName" placeholder="Bijv. Jan Jansen" style="width:100%;padding:.65rem .875rem;border:1.5px solid var(--border);border-radius:.75rem;font-family:'Nunito',sans-serif;font-size:.875rem;background:white;color:var(--text);box-sizing:border-box;margin-bottom:.625rem">
        </div>
        <div style="margin:1rem 0">
          <label style="display:block;font-size:.78rem;font-weight:700;color:var(--text);margin-bottom:.4rem;font-family:'Poppins',sans-serif">E-mail (optioneel — voor verificatie)</label>
          <input type="email" id="wheelWinnerEmail" placeholder="naam@voorbeeld.nl" style="width:100%;padding:.65rem .875rem;border:1.5px solid var(--border);border-radius:.75rem;font-family:'Nunito',sans-serif;font-size:.875rem;background:white;color:var(--text);box-sizing:border-box;margin-bottom:.625rem">
        </div>
        <p style="font-size:.72rem;color:var(--text-muted);margin:.5rem 0 .25rem;font-family:'Poppins',sans-serif;font-weight:600">Jouw kortingscode:</p>
        <p id="wheelResultCode" class="wheel-result-code">${code}</p>
        <button class="btn btn-green" style="margin-top:1rem;padding:.75rem 1.5rem" id="wheelSaveWinner">
          <i class="fas fa-check"></i> Code opslaan
        </button>
        <button class="btn btn-ghost" style="margin-top:.5rem;padding:.65rem 1.25rem;font-size:.85rem" onclick="closeModal('wheelSpinModal')">Sluiten</button>
      `;
      result.classList.remove('hidden');

      // Wire save button
      const saveBtn = document.getElementById('wheelSaveWinner');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const nameInput = document.getElementById('wheelWinnerName');
          const emailInput = document.getElementById('wheelWinnerEmail');
          const name = (nameInput?.value || '').trim();
          const email = (emailInput?.value || '').trim();

          // Update the stored coupon with name + email — direct in Firebase
          try {
            const coupon = window.LagencoDB ? window.LagencoDB.getCoupons().find(p => p.code === code) : null;
            if (coupon) {
              coupon.winnerName = name;
              coupon.winnerEmail = email;
              if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.saveCoupon(coupon); }
            }
          } catch (e) {}

          toast('Code opgeslagen! Bewaar hem goed.', 'success', 4000);
          setTimeout(() => closeModal('wheelSpinModal'), 800);
        });
      }
    }
  } else {
    // GEEN PRIJS — toon gewoon het resultaat, sla op als 'geen prijs'
    try {
      const coupon = {
        code: null,
        type: winner.id,
        label: winner.label,
        wonAt: new Date().toISOString(),
        status: 'geen_prijs',
        usedAt: null,
        winnerName: '',
        winnerEmail: ''
      };
      if (window.LagencoDB && window.LagencoDB.isConfigured) { window.LagencoDB.saveCoupon(coupon); }
    } catch (e) {}

    if (result) {
      result.innerHTML = `
        <div class="wheel-result-icon" id="wheelResultIcon">${winner.icon}</div>
        <h3 class="wheel-result-title" id="wheelResultTitle">${winner.title}</h3>
        <p class="wheel-result-text" id="wheelResultText">${winner.text}</p>
        <button class="btn btn-ghost" style="margin-top:1rem;padding:.75rem 1.5rem" onclick="closeModal('wheelSpinModal')">Sluiten</button>
      `;
      result.classList.remove('hidden');
    }
  }

  // Show toast
  if (winner.id !== 'niks') {
    toast('🎉 ' + winner.title, 'success', 5000);
  }
};

// Initialize wheel spin events
const initWheelSpin = () => {
  const spinBtn = document.getElementById('wheelSpinBtn');
  if (spinBtn) {
    spinBtn.addEventListener('click', spinWheel);
  }
};

// Expose for inline onclick
window.openWheelSpin = openWheelSpin;

// Open kopersbescherming info modal
const openBuyerProtectionModal = () => {
  openModal('buyerProtectionModal');
};
window.openBuyerProtectionModal = openBuyerProtectionModal;

// ═══════════════════════════════════════════════════════
// LIVE BOD NOTIFICATIE — toon popup na 15s met laatste bod (1x per bezoeker)
// ═══════════════════════════════════════════════════════
const initLiveBidNotification = () => {
  // Only on homepage and assortiment pages
  if (PAGE !== 'index' && PAGE !== 'assortiment') return;

  // Check if visitor already saw the notification (1x per bezoeker)
  try {
    const alreadyShown = sessionStorage.getItem('lagencoBidNotifShown');
    if (alreadyShown === '1') return; // already shown this session, don't show again
  } catch (e) { /* sessionStorage might fail, continue anyway */ }

  // Wait 15 seconds before showing notification
  setTimeout(() => {
    // Double-check: maybe shown in another tab
    try {
      if (sessionStorage.getItem('lagencoBidNotifShown') === '1') return;
    } catch (e) {}
    const shown = showLiveBidNotification();
    if (shown) {
      // Mark as shown so it doesn't appear again this session
      try { sessionStorage.setItem('lagencoBidNotifShown', '1'); } catch (e) {}
    }
  }, 15000);
};

const showLiveBidNotification = () => {
  // Get all bids
  const bids = getBids();
  if (!bids.length) return false; // no bids → no notification, return false so flag isn't set

  // Get most recent bid
  const sorted = [...bids].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const latestBid = sorted[0];

  // Find the product
  const product = getProducts().find(p => p.id === latestBid.productId);
  if (!product) return false;

  // Calculate time ago
  const timeAgo = (() => {
    try {
      const diff = Date.now() - new Date(latestBid.createdAt).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'zojuist';
      if (mins < 60) return mins + ' min geleden';
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + ' uur geleden';
      const days = Math.floor(hrs / 24);
      return days + ' dag' + (days > 1 ? 'en' : '') + ' geleden';
    } catch { return 'recentelijk'; }
  })();

  // Get bidder first name
  const firstName = (latestBid.name || 'Iemand').split(' ')[0];

  // Remove existing notification if any
  const existing = document.querySelector('.live-bid-notification');
  if (existing) existing.remove();

  // Create notification element
  const notif = document.createElement('div');
  notif.className = 'live-bid-notification';
  notif.innerHTML = `
    <div class="live-bid-notification-icon">
      <i class="fas fa-gavel"></i>
    </div>
    <div class="live-bid-notification-content">
      <p class="live-bid-notification-title">Nieuw bod geplaatst</p>
      <p class="live-bid-notification-text">
        <strong>${escapeHtml(firstName)}</strong> heeft ${timeAgo} een bod gedaan op <strong>${escapeHtml(product.title)}</strong>: <span class="bid-amount">€ ${Number(latestBid.amount).toFixed(2).replace('.', ',')}</span>
      </p>
    </div>
    <button class="live-bid-notification-close" aria-label="Sluiten"><i class="fas fa-times"></i></button>
  `;
  document.body.appendChild(notif);

  // Animate in
  setTimeout(() => notif.classList.add('show'), 50);

  // Close button
  notif.querySelector('.live-bid-notification-close').addEventListener('click', () => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 500);
  });

  // Auto-dismiss after 8 seconds
  const dismissTimer = setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 500);
  }, 8000);

  // Pause auto-dismiss on hover
  notif.addEventListener('mouseenter', () => clearTimeout(dismissTimer));

  return true; // successfully shown
};

// ═══════════════════════════════════════════════════════
// WHEEL SPIN NOTIFICATIE — toon popup als er een wheel spin post is
// ═══════════════════════════════════════════════════════
const initWheelSpinNotification = () => {
  // Only on homepage
  if (PAGE !== 'index') return;

  // Wait 8 seconds before checking
  setTimeout(() => {
    showWheelSpinNotification();
  }, 8000);
};

const showWheelSpinNotification = () => {
  // Check if there's a community post with a wheel spin
  const posts = getCommunityPosts();
  const wheelSpinPost = posts.find(p => p.body && p.body.includes('[[wheelspin|'));
  if (!wheelSpinPost) return; // no wheel spin post

  // Check if user already saw this notification (1x per session)
  try {
    const shown = sessionStorage.getItem('lagencoWheelSpinNotifShown');
    if (shown === wheelSpinPost.id) return; // already notified about this post
  } catch (e) {}

  // Check if user already spun (don't show notification if already spun)
  try {
    const alreadySpun = sessionStorage.getItem('lagencoWheelSpinDone');
    if (alreadySpun === '1') return;
  } catch (e) {}

  // Remove existing notification
  const existing = document.querySelector('.wheel-spin-notification');
  if (existing) existing.remove();

  // Create notification
  const notif = document.createElement('div');
  notif.className = 'wheel-spin-notification';
  notif.innerHTML = `
    <div class="wheel-spin-notification-icon">
      <i class="fas fa-circle-notch"></i>
    </div>
    <div class="wheel-spin-notification-content">
      <p class="wheel-spin-notification-title">🎉 Wheel Spin beschikbaar!</p>
      <p class="wheel-spin-notification-text">Hey! Er is een nieuwe mededeling — je kunt nu een <strong>wheel spin</strong> doen voor een kans op een gratis product, korting of gratis verzending!</p>
    </div>
    <button class="wheel-spin-notification-action" aria-label="Open wheel spin"><i class="fas fa-arrow-right"></i></button>
    <button class="wheel-spin-notification-close" aria-label="Sluiten"><i class="fas fa-times"></i></button>
  `;
  document.body.appendChild(notif);

  // Animate in
  setTimeout(() => notif.classList.add('show'), 50);

  // Click on action button → scroll to community + open wheel spin
  notif.querySelector('.wheel-spin-notification-action').addEventListener('click', () => {
    // Scroll to community section
    const communitySection = document.getElementById('community');
    if (communitySection) {
      communitySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Mark as seen
    try { sessionStorage.setItem('lagencoWheelSpinNotifShown', wheelSpinPost.id); } catch (e) {}
    // Dismiss notification
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 500);
  });

  // Close button
  notif.querySelector('.wheel-spin-notification-close').addEventListener('click', () => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 500);
    // Mark as seen so it doesn't reappear
    try { sessionStorage.setItem('lagencoWheelSpinNotifShown', wheelSpinPost.id); } catch (e) {}
  });

  // Auto-dismiss after 10 seconds
  const dismissTimer = setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 500);
    try { sessionStorage.setItem('lagencoWheelSpinNotifShown', wheelSpinPost.id); } catch (e) {}
  }, 10000);

  // Pause auto-dismiss on hover
  notif.addEventListener('mouseenter', () => clearTimeout(dismissTimer));
};


// ═══════════════════════════════════════════════════════
// NOTIFICATION STACK — meerdere notificaties stapelen
// ═══════════════════════════════════════════════════════
const getNotificationStack = () => {
  let stack = document.getElementById('notificationStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'notificationStack';
    stack.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:95;display:flex;flex-direction:column-reverse;gap:.75rem;pointer-events:none;max-width:360px;';
    document.body.appendChild(stack);
  }
  return stack;
};
const addToNotificationStack = (notif) => {
  const stack = getNotificationStack();
  notif.style.position = 'relative';
  notif.style.bottom = 'auto';
  notif.style.right = 'auto';
  notif.style.opacity = '1';
  notif.style.transform = 'translateX(120%)';
  notif.style.transition = 'transform .5s cubic-bezier(0.34,1.56,0.64,1)';
  stack.appendChild(notif);
  setTimeout(() => { notif.style.transform = 'translateX(0)'; }, 50);
};
const removeFromNotificationStack = (notif, delay = 500) => {
  notif.style.transform = 'translateX(120%)';
  notif.style.opacity = '0';
  setTimeout(() => {
    notif.remove();
    const stack = document.getElementById('notificationStack');
    if (stack && stack.children.length === 0) stack.remove();
  }, delay);
};

const init = () => {
  cleanupOldDemoProducts();
  initScrollReveal();
  initModals();
  initActions();
  initLogin();
  initBackToTop();
  initTimeline();
  initContactForm();
  initBidForm();
  initCommunity();
  initWheelSpin();
  initLiveBidNotification();
  initWheelSpinNotification();
  updateAuthUI();
  updateWishlistCounter();
  updateCompareCounter();
  initProgressBar();

  // Premium v3 enhancements (performance-optimized)
  initMagneticButtons();
  initCardTilt();
  initCounters();

  if (window.LagencoDB && window.LagencoDB.isConfigured) {
    window.LagencoDB.syncAll().then(function() {
      if (PAGE === 'index') { renderFeatured(); renderLiveBids(); renderCommunityPosts(); }
      if (PAGE === 'assortiment') renderAssortment();
      updateWishlistCounter();
      updateCompareCounter();
    });
    window.LagencoDB.startPolling({
      onProductsChange: function() {
        if (PAGE === 'index') { renderFeatured(); renderLiveBids(); }
        if (PAGE === 'assortiment') renderAssortment();
      },
      onBidsChange: function() { if (PAGE === 'index') renderLiveBids(); },
      onPostsChange: function() { if (PAGE === 'index') renderCommunityPosts(); }
    });
  }

  if (PAGE === 'index') {
    renderFeatured();
    initCarousel();
    initAddProduct();
    initEditProduct();
    renderLiveBids();
    renderCommunityPosts();
  }

  if (PAGE === 'assortiment') {
    renderAssortment();
    initSearch();
    initFilters();
    initEditProduct();
    initAddProduct();
  }

  if (PAGE === 'reviews') {
    initReviewsPage();
  }

  // Page-enter animation: remove class after animation
  setTimeout(() => document.body.classList.remove('page-enter'), 600);
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
