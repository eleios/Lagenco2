/* ═══════════════════════════════════════════════════════
   LAGENCO — GitHub API Database V2
   Leest via Raw URL (geen auth nodig), schrijft via API
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  console.log('🐙 Lagenco GitHub DB loaded...');

  // ═══ CONFIG ═══
  const GITHUB_TOKEN = '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';
  const GITHUB_REPO = 'eleios/lagenco2';
  const GITHUB_BRANCH = 'main';
  const DATA_FILE = 'data/database.json';
  const RAW_URL = 'https://raw.githubusercontent.com/' + GITHUB_REPO + '/' + GITHUB_BRANCH + '/' + DATA_FILE;
  const API_URL = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + DATA_FILE;

  const isConfigured = true; // Altijd proberen

  let cache = { database: null, sha: null };
  let lastFetch = 0;
  const CACHE_TTL = 10000; // 10s

  const DB = {
    isConfigured: true,

    // ═══ Lezen via Raw URL (GEEN auth nodig!) ═══
    async _readFile() {
      if (Date.now() - lastFetch < CACHE_TTL && cache.database) {
        return cache.database;
      }

      try {
        console.log('🐙 Reading from GitHub (raw URL)...');
        // Voeg cache-buster toe om verse data te krijgen
        const response = await fetch(RAW_URL + '?t=' + Date.now(), {
          cache: 'no-store'
        });

        if (response.status === 404) {
          console.log('🐙 Database not found, creating...');
          const emptyDb = { products: [], bids: [], posts: [], coupons: [], wheelSettings: null, resetToken: 'reset_initial' };
          await this._writeFile(emptyDb);
          cache.database = emptyDb;
          lastFetch = Date.now();
          return emptyDb;
        }

        if (!response.ok) throw new Error('HTTP ' + response.status);
        
        const text = await response.text();
        const db = JSON.parse(text);
        
        cache.database = db;
        lastFetch = Date.now();
        
        console.log('🐙 Database loaded:', {
          products: (db.products || []).length,
          bids: (db.bids || []).length,
          posts: (db.posts || []).length,
          coupons: (db.coupons || []).length
        });
        
        return db;
      } catch (e) {
        console.warn('🐙 Read error:', e.message);
        return null;
      }
    },

    // ═══ SHA ophalen (nodig voor updates) ═══
    async _getSha() {
      try {
        const response = await fetch(API_URL + '?ref=' + GITHUB_BRANCH, {
          headers: {
            'Authorization': 'Bearer ' + GITHUB_TOKEN,
            'Accept': 'application/vnd.github.v3+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.sha;
      } catch (e) {
        console.warn('🐙 SHA fetch error:', e.message);
        return null;
      }
    },

    // ═══ Schrijven via GitHub API ═══
    async _writeFile(data) {
      try {
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
        
        // Haal eerst de SHA op (nodig voor update)
        const sha = await this._getSha();
        
        const body = {
          message: 'Lagenco DB update ' + new Date().toISOString(),
          content: content,
          branch: GITHUB_BRANCH
        };
        if (sha) body.sha = sha;

        console.log('🐙 Writing to GitHub...');
        const response = await fetch(API_URL, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + GITHUB_TOKEN,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
          body: JSON.stringify(body)
        });

        if (response.status === 401) {
          console.warn('🐙 Write auth failed (401) — token may need "repo" scope');
          return;
        }
        if (response.status === 409) {
          // Conflict — SHA is verouderd, probeer opnieuw
          console.warn('🐙 Conflict, retrying...');
          const newSha = await this._getSha();
          if (newSha) {
            body.sha = newSha;
            const retry = await fetch(API_URL, {
              method: 'PUT',
              headers: {
                'Authorization': 'Bearer ' + GITHUB_TOKEN,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(body)
            });
            if (retry.ok) {
              const result = await retry.json();
              cache.sha = result.content.sha;
              cache.database = data;
              console.log('🐙 Database saved (retry)');
            }
          }
          return;
        }
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error('HTTP ' + response.status + ': ' + (errData.message || ''));
        }

        const result = await response.json();
        cache.sha = result.content.sha;
        cache.database = data;
        console.log('🐙 Database saved!');
      } catch (e) {
        console.warn('🐙 Write error:', e.message);
      }
    },

    // ═══ Alle data ophalen ═══
    async syncAll() {
      console.log('🐙 Syncing from GitHub...');
      const db = await this._readFile();
      if (!db) {
        console.warn('🐙 Sync failed — using localStorage');
        return;
      }
      if (db.products) localStorage.setItem('lagencoProducts', JSON.stringify(db.products));
      if (db.bids) localStorage.setItem('lagencoBids', JSON.stringify(db.bids));
      if (db.posts) localStorage.setItem('lagencoCommunityPosts', JSON.stringify(db.posts));
      if (db.coupons) localStorage.setItem('lagencoWheelPrizes', JSON.stringify(db.coupons));
      if (db.wheelSettings) localStorage.setItem('lagencoWheelSettings', JSON.stringify(db.wheelSettings));
      if (db.resetToken) localStorage.setItem('lagencoWheelSpinResetToken', db.resetToken);
      console.log('🐙 Sync complete!');
    },

    // ═══ Producten ═══
    async saveProduct(product) {
      const db = await this._readFile(); if (!db) return;
      db.products = db.products || [];
      const idx = db.products.findIndex(p => p.id === product.id);
      if (idx >= 0) db.products[idx] = product; else db.products.push(product);
      await this._writeFile(db);
    },
    async deleteProduct(id) {
      const db = await this._readFile(); if (!db) return;
      db.products = (db.products || []).filter(p => p.id !== id);
      await this._writeFile(db);
    },

    // ═══ Biedingen ═══
    async saveBid(bid) {
      const db = await this._readFile(); if (!db) return;
      db.bids = db.bids || []; db.bids.push(bid);
      await this._writeFile(db);
    },
    async updateBidStatus(id, status) {
      const db = await this._readFile(); if (!db) return;
      const bid = (db.bids || []).find(b => b.id === id);
      if (bid) { bid.status = status; bid.updatedAt = new Date().toISOString(); await this._writeFile(db); }
    },
    async deleteBid(id) {
      const db = await this._readFile(); if (!db) return;
      db.bids = (db.bids || []).filter(b => b.id !== id);
      await this._writeFile(db);
    },

    // ═══ Community ═══
    async savePost(post) {
      const db = await this._readFile(); if (!db) return;
      db.posts = db.posts || [];
      const idx = db.posts.findIndex(p => p.id === post.id);
      if (idx >= 0) db.posts[idx] = post; else db.posts.unshift(post);
      await this._writeFile(db);
    },
    async deletePost(id) {
      const db = await this._readFile(); if (!db) return;
      db.posts = (db.posts || []).filter(p => p.id !== id);
      await this._writeFile(db);
    },
    async saveComment(postId, comment) {
      const db = await this._readFile(); if (!db) return;
      db.posts = db.posts || [];
      const post = db.posts.find(p => p.id === postId);
      if (post) { post.comments = post.comments || []; post.comments.push(comment); await this._writeFile(db); }
    },
    async deleteComment(postId, commentId) {
      const db = await this._readFile(); if (!db) return;
      db.posts = db.posts || [];
      const post = db.posts.find(p => p.id === postId);
      if (post && post.comments) { post.comments = post.comments.filter(c => c.id !== commentId); await this._writeFile(db); }
    },

    // ═══ Coupons ═══
    async saveCoupon(coupon) {
      const db = await this._readFile(); if (!db) return;
      db.coupons = db.coupons || []; db.coupons.push(coupon);
      await this._writeFile(db);
    },
    async updateCouponStatus(code, status) {
      const db = await this._readFile(); if (!db) return;
      const c = (db.coupons || []).find(x => x.code === code);
      if (c) { c.status = status; c.usedAt = status === 'gebruikt' ? new Date().toISOString() : null; await this._writeFile(db); }
    },
    async deleteCoupon(code) {
      const db = await this._readFile(); if (!db) return;
      db.coupons = (db.coupons || []).filter(c => c.code !== code);
      await this._writeFile(db);
    },

    // ═══ Wheel Settings ═══
    async saveWheelSettings(settings) {
      const db = await this._readFile(); if (!db) return;
      db.wheelSettings = settings;
      await this._writeFile(db);
    },

    // ═══ Reset Token ═══
    async saveResetToken(token) {
      const db = await this._readFile(); if (!db) return;
      db.resetToken = token;
      await this._writeFile(db);
    },

    // ═══ Polling ═══
    startPolling(callbacks) {
      console.log('🐙 Polling started (30s)...');
      setInterval(async () => {
        const oldP = localStorage.getItem('lagencoProducts') || '[]';
        const oldB = localStorage.getItem('lagencoBids') || '[]';
        const oldPo = localStorage.getItem('lagencoCommunityPosts') || '[]';
        cache.database = null; // Force refresh
        const db = await this._readFile();
        if (!db) return;
        if (JSON.stringify(db.products || []) !== oldP) {
          localStorage.setItem('lagencoProducts', JSON.stringify(db.products || []));
          if (callbacks.onProductsChange) callbacks.onProductsChange();
        }
        if (JSON.stringify(db.bids || []) !== oldB) {
          localStorage.setItem('lagencoBids', JSON.stringify(db.bids || []));
          if (callbacks.onBidsChange) callbacks.onBidsChange();
        }
        if (JSON.stringify(db.posts || []) !== oldPo) {
          localStorage.setItem('lagencoCommunityPosts', JSON.stringify(db.posts || []));
          if (callbacks.onPostsChange) callbacks.onPostsChange();
        }
      }, 30000);
    }
  };

  window.LagencoDB = DB;
  console.log('🐙 LagencoDB ready');
})();
