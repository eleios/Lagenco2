/* ═══════════════════════════════════════════════════════
   LAGENCO — Firebase Realtime Database (v2)
   Enige source-of-truth. Geen localStorage meer.

   • In-memory cache (snel sync lezen)
   • Real-time listeners (alleen Firebase)
   • Website producten  → /products/{id}
   • Biedingen           → /bids/{id}
   • Community posts     → /posts/{id}
   • Coupons             → /coupons/{code}
   • Wheel settings      → /wheelSettings
   • Reset token         → /resetToken
   • Business panel data → /bp/{collection}
   • Visitor data        → /visitors/{visitorId}/{key}
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  console.log('🔥 Lagenco Firebase DB v2 loaded...');

  // ═══ CONFIG ═══
  const firebaseConfig = {
    apiKey: "AIzaSyChPDa7a0wP9AwdBMUwxTFvOG45MO31l3g",
    authDomain: "lagenco-9c79e.firebaseapp.com",
    databaseURL: "https://lagenco-9c79e-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "lagenco-9c79e",
    storageBucket: "lagenco-9c79e.firebasestorage.app",
    messagingSenderId: "743324926023",
    appId: "1:743324926023:web:f8f7092f05d243ed467162"
  };

  const isConfigured = firebaseConfig.apiKey !== 'VUL_API_KEY_IN' && typeof firebase !== 'undefined';

  let db = null;
  const cache = {
    products: [],
    bids: [],
    posts: [],
    coupons: [],
    wheelSettings: null,
    resetToken: null,
    bp: {}            // { producten: [...], voorraad: [...], ... }
  };
  const listeners = {
    onProductsChange: null,
    onBidsChange: null,
    onPostsChange: null,
    onBpChange: null,        // fired for ANY bp collection change
    onVisitorChange: null
  };
  const subscriptions = {
    productsFirst: true,
    bidsFirst: true,
    postsFirst: true,
    bpFirst: {},
    visitorFirst: {}
  };

  // ═══ Visitor ID (for wishlist / compare / recent — NOT stored in localStorage) ═══
  // Use a cookie so it survives browser restarts without using localStorage
  function getCookie(name) {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function setCookie(name, value, days) {
    try {
      const d = new Date();
      d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
      document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
    } catch (e) {}
  }
  function getVisitorId() {
    let id = getCookie('lagencoVisitor');
    if (!id) {
      id = 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      setCookie('lagencoVisitor', id, 365);
    }
    return id;
  }
  const VISITOR_ID = getVisitorId();
  const visitorCache = {};      // in-memory cache of visitor data

  // ═══ Init Firebase ═══
  if (isConfigured) {
    try {
      // Guard against double init (in case multiple scripts load this)
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.database();
      console.log('🔥 Firebase connected!');
    } catch (e) {
      console.warn('🔥 Firebase init error:', e.message);
    }
  } else {
    console.error('🔥 Firebase NOT configured — data will not persist!');
  }

  // ═══ Helper: Firebase object → array ═══
  function toArray(obj) {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj;
    return Object.values(obj);
  }

  // ═══ One-time migration from localStorage → Firebase ═══
  // Only runs if Firebase is empty AND localStorage has old data
  async function migrateFromLocalStorage() {
    if (!db) return;
    try {
      // ── Website products ──
      const productsSnap = await db.ref('products').once('value');
      if (!productsSnap.exists() || !productsSnap.val()) {
        const raw = localStorage.getItem('lagencoProducts');
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) {
            console.log('🔥 Migrating', arr.length, 'products from localStorage → Firebase');
            const updates = {};
            arr.forEach(p => { if (p && p.id) updates['products/' + p.id] = p; });
            await db.ref().update(updates);
          }
          localStorage.removeItem('lagencoProducts');
        }
      }

      // ── Bids ──
      const bidsSnap = await db.ref('bids').once('value');
      if (!bidsSnap.exists() || !bidsSnap.val()) {
        const raw = localStorage.getItem('lagencoBids');
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) {
            const updates = {};
            arr.forEach(b => { if (b && b.id) updates['bids/' + b.id] = b; });
            await db.ref().update(updates);
          }
          localStorage.removeItem('lagencoBids');
        }
      }

      // ── Community posts ──
      const postsSnap = await db.ref('posts').once('value');
      if (!postsSnap.exists() || !postsSnap.val()) {
        const raw = localStorage.getItem('lagencoCommunityPosts');
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) {
            const updates = {};
            arr.forEach(p => { if (p && p.id) updates['posts/' + p.id] = p; });
            await db.ref().update(updates);
          }
          localStorage.removeItem('lagencoCommunityPosts');
        }
      }

      // ── Coupons ──
      const couponsSnap = await db.ref('coupons').once('value');
      if (!couponsSnap.exists() || !couponsSnap.val()) {
        const raw = localStorage.getItem('lagencoWheelPrizes');
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length) {
            const updates = {};
            arr.forEach(c => {
              if (!c) return;
              const key = c.code || ('noprize_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
              updates['coupons/' + key] = c;
            });
            await db.ref().update(updates);
          }
          localStorage.removeItem('lagencoWheelPrizes');
        }
      }

      // ── Wheel settings ──
      const wsSnap = await db.ref('wheelSettings').once('value');
      if (!wsSnap.exists()) {
        const raw = localStorage.getItem('lagencoWheelSettings');
        if (raw) {
          await db.ref('wheelSettings').set(JSON.parse(raw));
          localStorage.removeItem('lagencoWheelSettings');
        }
      }

      // ── Reset token ──
      const rtSnap = await db.ref('resetToken').once('value');
      if (!rtSnap.exists()) {
        const raw = localStorage.getItem('lagencoWheelSpinResetToken');
        if (raw) {
          await db.ref('resetToken').set(raw);
          localStorage.removeItem('lagencoWheelSpinResetToken');
        }
      }

      // ── Business panel data (lagencoBP_*) ──
      const bpSnap = await db.ref('bp').once('value');
      const bpExisting = bpSnap.val() || {};
      const bpUpdates = {};
      let bpMigrated = false;
      const bpKeys = ['producten', 'voorraad', 'inkoop', 'verkoop', 'klanten', 'tracking', 'marktplaats', 'research', 'werknemers', 'meta', 'version'];
      bpKeys.forEach(k => {
        if (bpExisting[k]) return; // already in Firebase
        const raw = localStorage.getItem('lagencoBP_' + k);
        if (raw === null) return;
        try {
          const val = JSON.parse(raw);
          bpUpdates['bp/' + k] = val;
          bpMigrated = true;
        } catch (e) {}
      });
      if (bpMigrated) {
        console.log('🔥 Migrating business panel data from localStorage → Firebase');
        await db.ref().update(bpUpdates);
        // Clean up old localStorage keys
        bpKeys.forEach(k => localStorage.removeItem('lagencoBP_' + k));
      }

      // ── Visitor data (wishlist, compare, recent) ──
      const visitorSnap = await db.ref('visitors/' + VISITOR_ID).once('value');
      const visitorExisting = visitorSnap.val() || {};
      const visitorUpdates = {};
      let visitorMigrated = false;
      const visitorKeys = [
        ['lagencoWishlist', 'wishlist'],
        ['lagencoCompare', 'compare'],
        ['lagencoRecent', 'recent']
      ];
      visitorKeys.forEach(([lsKey, fbKey]) => {
        if (visitorExisting[fbKey]) return;
        const raw = localStorage.getItem(lsKey);
        if (raw === null) return;
        try {
          const val = JSON.parse(raw);
          visitorUpdates['visitors/' + VISITOR_ID + '/' + fbKey] = val;
          visitorMigrated = true;
        } catch (e) {}
      });
      if (visitorMigrated) {
        console.log('🔥 Migrating visitor data from localStorage → Firebase');
        await db.ref().update(visitorUpdates);
        visitorKeys.forEach(([lsKey]) => localStorage.removeItem(lsKey));
      }

      // ── Auth state: keep in sessionStorage (cleared on tab close) ──
      // Move from localStorage to sessionStorage
      const authRaw = localStorage.getItem('lagencoLoggedIn');
      if (authRaw !== null) {
        try { sessionStorage.setItem('lagencoLoggedIn', authRaw); } catch (e) {}
        localStorage.removeItem('lagencoLoggedIn');
      }
    } catch (e) {
      console.warn('🔥 Migration error:', e.message);
    }
  }

  // ═══ Real-time listeners ═══
  function startListeners(callbacks) {
    if (!db) return;
    Object.assign(listeners, callbacks || {});
    console.log('🔥 Starting real-time listeners...');

    // Products
    db.ref('products').on('value', function (snapshot) {
      const products = [];
      snapshot.forEach(function (child) { products.push(child.val()); });
      cache.products = products;
      if (subscriptions.productsFirst) { subscriptions.productsFirst = false; return; }
      console.log('🔥 Products changed (real-time)!', products.length);
      if (listeners.onProductsChange) listeners.onProductsChange();
    });

    // Bids
    db.ref('bids').on('value', function (snapshot) {
      const bids = [];
      snapshot.forEach(function (child) { bids.push(child.val()); });
      cache.bids = bids;
      if (subscriptions.bidsFirst) { subscriptions.bidsFirst = false; return; }
      console.log('🔥 Bids changed (real-time)!', bids.length);
      if (listeners.onBidsChange) listeners.onBidsChange();
    });

    // Posts
    db.ref('posts').on('value', function (snapshot) {
      const posts = [];
      snapshot.forEach(function (child) { posts.push(child.val()); });
      cache.posts = posts;
      if (subscriptions.postsFirst) { subscriptions.postsFirst = false; return; }
      console.log('🔥 Posts changed (real-time)!', posts.length);
      if (listeners.onPostsChange) listeners.onPostsChange();
    });

    // BP data — listen to the entire /bp tree
    db.ref('bp').on('value', function (snapshot) {
      const bpData = snapshot.val() || {};
      Object.keys(bpData).forEach(k => {
        const v = bpData[k];
        cache.bp[k] = Array.isArray(v) ? v : (v && typeof v === 'object' ? v : []);
      });
      // Fire per-collection callbacks (only after first load)
      Object.keys(bpData).forEach(k => {
        if (subscriptions.bpFirst[k]) { subscriptions.bpFirst[k] = false; return; }
        if (listeners.onBpChange) listeners.onBpChange(k);
      });
    });

    // Wheel settings
    db.ref('wheelSettings').on('value', function (snapshot) {
      cache.wheelSettings = snapshot.val();
    });

    // Reset token
    db.ref('resetToken').on('value', function (snapshot) {
      cache.resetToken = snapshot.val();
    });

    // Coupons
    db.ref('coupons').on('value', function (snapshot) {
      const coupons = [];
      snapshot.forEach(function (child) { coupons.push(child.val()); });
      cache.coupons = coupons;
    });

    // Visitor data (current visitor)
    db.ref('visitors/' + VISITOR_ID).on('value', function (snapshot) {
      const v = snapshot.val() || {};
      Object.keys(v).forEach(k => {
        const oldVal = JSON.stringify(visitorCache[k]);
        const newVal = JSON.stringify(v[k]);
        if (oldVal === newVal) return;
        visitorCache[k] = v[k];
        if (subscriptions.visitorFirst[k]) { subscriptions.visitorFirst[k] = false; return; }
        if (listeners.onVisitorChange) listeners.onVisitorChange(k);
      });
    });
  }

  // ═══ Sync helper — initial pull (returns promise) ═══
  async function syncAll() {
    if (!db) return;
    console.log('🔥 Syncing from Firebase...');
    try {
      // Run migration first (one-time, idempotent)
      await migrateFromLocalStorage();

      const snapshot = await db.ref('/').once('value');
      const data = snapshot.val() || {};

      cache.products = toArray(data.products);
      cache.bids = toArray(data.bids);
      cache.posts = toArray(data.posts);
      cache.coupons = toArray(data.coupons);
      cache.wheelSettings = data.wheelSettings || null;
      cache.resetToken = data.resetToken || null;

      if (data.bp && typeof data.bp === 'object') {
        Object.keys(data.bp).forEach(k => {
          const v = data.bp[k];
          cache.bp[k] = Array.isArray(v) ? v : (v && typeof v === 'object' ? v : []);
        });
      }

      if (data.visitors && data.visitors[VISITOR_ID]) {
        Object.keys(data.visitors[VISITOR_ID]).forEach(k => {
          visitorCache[k] = data.visitors[VISITOR_ID][k];
        });
      }

      console.log('🔥 Sync complete!', {
        products: cache.products.length,
        bids: cache.bids.length,
        posts: cache.posts.length,
        coupons: cache.coupons.length,
        bp: Object.keys(cache.bp).length
      });
    } catch (e) {
      console.warn('🔥 Sync error:', e.message);
    }
  }

  // ═══ Public API ═══
  const DB = {
    isConfigured: !!db,
    visitorId: VISITOR_ID,

    // ── Sync ──
    syncAll: syncAll,
    startPolling: startListeners,    // keep old name for compat

    // ═══ Products ═══
    getProducts: function () { return cache.products.slice(); },
    getProduct: function (id) { return cache.products.find(p => p.id === id) || null; },
    saveProduct: async function (product) {
      if (!db) { console.warn('🔥 Firebase not configured — cannot save product'); return; }
      try {
        await db.ref('products/' + product.id).set(product);
        console.log('🔥 Product saved:', product.title);
      } catch (e) { console.warn('🔥 SaveProduct error:', e.message); }
    },
    deleteProduct: async function (id) {
      if (!db) return;
      try {
        await db.ref('products/' + id).remove();
        console.log('🔥 Product deleted:', id);
      } catch (e) { console.warn('🔥 DeleteProduct error:', e.message); }
    },

    // ═══ Bids ═══
    getBids: function () { return cache.bids.slice(); },
    saveBid: async function (bid) {
      if (!db) return;
      try {
        await db.ref('bids/' + bid.id).set(bid);
        console.log('🔥 Bid saved:', bid.name);
      } catch (e) { console.warn('🔥 SaveBid error:', e.message); }
    },
    updateBidStatus: async function (id, status) {
      if (!db) return;
      try {
        await db.ref('bids/' + id).update({ status: status, updatedAt: new Date().toISOString() });
      } catch (e) { console.warn('🔥 UpdateBid error:', e.message); }
    },
    deleteBid: async function (id) {
      if (!db) return;
      try { await db.ref('bids/' + id).remove(); } catch (e) { console.warn('🔥 DeleteBid error:', e.message); }
    },

    // ═══ Community Posts ═══
    getPosts: function () { return cache.posts.slice(); },
    savePost: async function (post) {
      if (!db) return;
      try { await db.ref('posts/' + post.id).set(post); } catch (e) { console.warn('🔥 SavePost error:', e.message); }
    },
    deletePost: async function (id) {
      if (!db) return;
      try { await db.ref('posts/' + id).remove(); } catch (e) { console.warn('🔥 DeletePost error:', e.message); }
    },
    saveComment: async function (postId, comment) {
      if (!db) return;
      try { await db.ref('posts/' + postId + '/comments/' + comment.id).set(comment); } catch (e) { console.warn('🔥 SaveComment error:', e.message); }
    },
    deleteComment: async function (postId, commentId) {
      if (!db) return;
      try { await db.ref('posts/' + postId + '/comments/' + commentId).remove(); } catch (e) { console.warn('🔥 DeleteComment error:', e.message); }
    },

    // ═══ Coupons ═══
    getCoupons: function () { return cache.coupons.slice(); },
    saveCoupon: async function (coupon) {
      if (!db) return;
      try {
        var key = coupon.code || ('noprize_' + Date.now());
        await db.ref('coupons/' + key).set(coupon);
      } catch (e) { console.warn('🔥 SaveCoupon error:', e.message); }
    },
    updateCouponStatus: async function (code, status) {
      if (!db) return;
      try {
        await db.ref('coupons/' + code).update({
          status: status,
          usedAt: status === 'gebruikt' ? new Date().toISOString() : null
        });
      } catch (e) { console.warn('🔥 UpdateCoupon error:', e.message); }
    },
    deleteCoupon: async function (code) {
      if (!db) return;
      try { await db.ref('coupons/' + code).remove(); } catch (e) { console.warn('🔥 DeleteCoupon error:', e.message); }
    },

    // ═══ Wheel Settings ═══
    getWheelSettings: function () { return cache.wheelSettings; },
    saveWheelSettings: async function (settings) {
      if (!db) return;
      try { await db.ref('wheelSettings').set(settings); } catch (e) { console.warn('🔥 SaveWheelSettings error:', e.message); }
    },

    // ═══ Reset Token ═══
    getResetToken: function () { return cache.resetToken; },
    saveResetToken: async function (token) {
      if (!db) return;
      try { await db.ref('resetToken').set(token); } catch (e) { console.warn('🔥 SaveResetToken error:', e.message); }
    },

    // ═══ Business Panel Data (bp/{collection}) ═══
    // Sync API — reads from in-memory cache
    bpList: function (collection) {
      const v = cache.bp[collection];
      return Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? v : []);
    },
    bpGet: function (collection, key) {
      const v = cache.bp[collection];
      if (Array.isArray(v)) return v.find(x => x && x.id === key);
      if (v && typeof v === 'object') return v[key];
      return null;
    },
    bpSave: async function (collection, items) {
      if (!db) return;
      try {
        await db.ref('bp/' + collection).set(items);
        // Optimistic cache update
        cache.bp[collection] = items;
      } catch (e) { console.warn('🔥 bpSave error:', e.message); }
    },
    bpAdd: async function (collection, item) {
      const items = DB.bpList(collection);
      items.unshift(item);
      await DB.bpSave(collection, items);
      return item;
    },
    bpUpdate: async function (collection, id, patch) {
      const items = DB.bpList(collection);
      const idx = items.findIndex(x => x && x.id === id);
      if (idx === -1) return null;
      items[idx] = Object.assign({}, items[idx], patch, { updatedAt: new Date().toISOString() });
      await DB.bpSave(collection, items);
      return items[idx];
    },
    bpRemove: async function (collection, id) {
      const items = DB.bpList(collection).filter(x => x && x.id !== id);
      await DB.bpSave(collection, items);
      return true;
    },

    // ═══ Visitor Data (wishlist / compare / recent) ═══
    getVisitor: function (key) {
      const v = visitorCache[key];
      return v === undefined ? null : v;
    },
    setVisitor: async function (key, value) {
      visitorCache[key] = value;
      if (!db) return;
      try { await db.ref('visitors/' + VISITOR_ID + '/' + key).set(value); } catch (e) { console.warn('🔥 setVisitor error:', e.message); }
    },

    // ═══ Auth state — sessionStorage only (NOT localStorage, NOT Firebase) ═══
    // Auth state is intentionally ephemeral — cleared when the browser tab closes.
    getAuth: function () {
      try {
        const raw = sessionStorage.getItem('lagencoLoggedIn');
        return raw !== null ? JSON.parse(raw) : false;
      } catch (e) { return false; }
    },
    setAuth: function (val) {
      try { sessionStorage.setItem('lagencoLoggedIn', JSON.stringify(val)); } catch (e) {}
    },
    clearAuth: function () {
      try { sessionStorage.removeItem('lagencoLoggedIn'); } catch (e) {}
    },

    // ═══ Internal — for testing / debugging ═══
    _cache: cache,
    _visitorCache: visitorCache
  };

  window.LagencoDB = DB;
  console.log('🔥 LagencoDB v2 ready. Configured:', !!db, 'Visitor:', VISITOR_ID);
})();
