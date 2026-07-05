/* ═══════════════════════════════════════════════════════
   LAGENCO — JSONBin.io Database (werkt overal, geen CORS)
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  console.log('📦 Lagenco DB loaded...');

  const BIN_URL = 'https://api.jsonbin.io/v3/b/6a4a5280f5f4af5e29624f2b';
  const API_KEY = '$2a$10$EhTnqR7HBpMRljzhLxnOOOoL5juZgZOCkAJg5kMlcExkyU7ao5BDu';

  let cache = { database: null };
  let lastFetch = 0;
  const CACHE_TTL = 5000; // 5s

  const DB = {
    isConfigured: true,

    async _read() {
      if (Date.now() - lastFetch < CACHE_TTL && cache.database) return cache.database;
      try {
        console.log('📦 Reading from JSONBin...');
        const res = await fetch(BIN_URL + '/latest', {
          headers: { 'X-Master-Key': API_KEY }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const db = data.record || data;
        cache.database = db;
        lastFetch = Date.now();
        console.log('📦 Loaded:', { products: (db.products||[]).length, bids: (db.bids||[]).length, posts: (db.posts||[]).length, coupons: (db.coupons||[]).length });
        return db;
      } catch (e) {
        console.warn('📦 Read error:', e.message);
        return null;
      }
    },

    async _write(data) {
      try {
        console.log('📦 Writing to JSONBin...');
        const res = await fetch(BIN_URL, {
          method: 'PUT',
          headers: { 'X-Master-Key': API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        cache.database = data;
        lastFetch = Date.now();
        console.log('📦 Saved!');
      } catch (e) {
        console.warn('📦 Write error:', e.message);
      }
    },

    async syncAll() {
      console.log('📦 Syncing...');
      const db = await this._read();
      if (!db) { console.warn('📦 Sync failed'); return; }
      if (db.products) localStorage.setItem('lagencoProducts', JSON.stringify(db.products));
      if (db.bids) localStorage.setItem('lagencoBids', JSON.stringify(db.bids));
      if (db.posts) localStorage.setItem('lagencoCommunityPosts', JSON.stringify(db.posts));
      if (db.coupons) localStorage.setItem('lagencoWheelPrizes', JSON.stringify(db.coupons));
      if (db.wheelSettings) localStorage.setItem('lagencoWheelSettings', JSON.stringify(db.wheelSettings));
      if (db.resetToken) localStorage.setItem('lagencoWheelSpinResetToken', db.resetToken);
      console.log('📦 Sync complete!');
    },

    async saveProduct(product) {
      const db = await this._read(); if (!db) return;
      db.products = db.products || [];
      const i = db.products.findIndex(p => p.id === product.id);
      if (i >= 0) db.products[i] = product; else db.products.push(product);
      await this._write(db);
    },
    async deleteProduct(id) {
      const db = await this._read(); if (!db) return;
      db.products = (db.products || []).filter(p => p.id !== id);
      await this._write(db);
    },

    async saveBid(bid) {
      const db = await this._read(); if (!db) return;
      db.bids = db.bids || []; db.bids.push(bid);
      await this._write(db);
    },
    async updateBidStatus(id, status) {
      const db = await this._read(); if (!db) return;
      const b = (db.bids || []).find(x => x.id === id);
      if (b) { b.status = status; b.updatedAt = new Date().toISOString(); await this._write(db); }
    },
    async deleteBid(id) {
      const db = await this._read(); if (!db) return;
      db.bids = (db.bids || []).filter(x => x.id !== id);
      await this._write(db);
    },

    async savePost(post) {
      const db = await this._read(); if (!db) return;
      db.posts = db.posts || [];
      const i = db.posts.findIndex(p => p.id === post.id);
      if (i >= 0) db.posts[i] = post; else db.posts.unshift(post);
      await this._write(db);
    },
    async deletePost(id) {
      const db = await this._read(); if (!db) return;
      db.posts = (db.posts || []).filter(p => p.id !== id);
      await this._write(db);
    },
    async saveComment(postId, comment) {
      const db = await this._read(); if (!db) return;
      db.posts = db.posts || [];
      const post = db.posts.find(p => p.id === postId);
      if (post) { post.comments = post.comments || []; post.comments.push(comment); await this._write(db); }
    },
    async deleteComment(postId, commentId) {
      const db = await this._read(); if (!db) return;
      db.posts = db.posts || [];
      const post = db.posts.find(p => p.id === postId);
      if (post && post.comments) { post.comments = post.comments.filter(c => c.id !== commentId); await this._write(db); }
    },

    async saveCoupon(coupon) {
      const db = await this._read(); if (!db) return;
      db.coupons = db.coupons || []; db.coupons.push(coupon);
      await this._write(db);
    },
    async updateCouponStatus(code, status) {
      const db = await this._read(); if (!db) return;
      const c = (db.coupons || []).find(x => x.code === code);
      if (c) { c.status = status; c.usedAt = status === 'gebruikt' ? new Date().toISOString() : null; await this._write(db); }
    },
    async deleteCoupon(code) {
      const db = await this._read(); if (!db) return;
      db.coupons = (db.coupons || []).filter(c => c.code !== code);
      await this._write(db);
    },

    async saveWheelSettings(settings) {
      const db = await this._read(); if (!db) return;
      db.wheelSettings = settings;
      await this._write(db);
    },
    async saveResetToken(token) {
      const db = await this._read(); if (!db) return;
      db.resetToken = token;
      await this._write(db);
    },

    startPolling(cb) {
      console.log('📦 Polling (30s)...');
      setInterval(async () => {
        const oP = localStorage.getItem('lagencoProducts') || '[]';
        const oB = localStorage.getItem('lagencoBids') || '[]';
        const oPo = localStorage.getItem('lagencoCommunityPosts') || '[]';
        cache.database = null;
        const db = await this._read();
        if (!db) return;
        if (JSON.stringify(db.products||[]) !== oP) { localStorage.setItem('lagencoProducts', JSON.stringify(db.products||[])); if (cb.onProductsChange) cb.onProductsChange(); }
        if (JSON.stringify(db.bids||[]) !== oB) { localStorage.setItem('lagencoBids', JSON.stringify(db.bids||[])); if (cb.onBidsChange) cb.onBidsChange(); }
        if (JSON.stringify(db.posts||[]) !== oPo) { localStorage.setItem('lagencoCommunityPosts', JSON.stringify(db.posts||[])); if (cb.onPostsChange) cb.onPostsChange(); }
      }, 30000);
    }
  };

  window.LagencoDB = DB;
  console.log('📦 LagencoDB ready');
})();
