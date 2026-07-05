/* ═══════════════════════════════════════════════════════
   LAGENCO — GitHub API Database (geen externe service nodig)
   ═══════════════════════════════════════════════════════

   HOE WERKT DIT?
   - Data wordt opgeslagen als JSON bestanden in je GitHub repo
   - De website leest/schrijft via de GitHub API
   - Geen externe service, geen CORS, geen kosten
   - Werkt op alle browsers (Safari, Chrome, etc.)

   SETUP:
   1. Ga naar GitHub → Settings → Developer settings → Personal access tokens
   2. Generate new token (classic) → vink "repo" aan → Generate
   3. Kopieer de token (begint met ghp_...)
   4. Vul GITHUB_TOKEN en GITHUB_REPO hieronder in
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  console.log('🐙 Lagenco GitHub DB loaded...');

  // ═══ CONFIG — Vul hier je gegevens in ═══
  const GITHUB_TOKEN = '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';
  const GITHUB_REPO = 'eleios/lagenco2';
  const GITHUB_BRANCH = 'main';
  const DATA_FILE = 'data/database.json';

  const isConfigured = GITHUB_TOKEN.startsWith('ghp_') && GITHUB_REPO.includes('/');

  console.log('🐙 GitHub DB configured:', isConfigured);

  // Cache voor data (voorkomt te veel API calls)
  let cache = {};
  let lastFetch = 0;
  const CACHE_TTL = 10000; // 10 seconden

  const DB = {
    isConfigured: isConfigured,

    // ═══ GitHub API: Bestand lezen ═══
    async _readFile() {
      if (!isConfigured) return null;
      
      // Gebruik cache als vers
      if (Date.now() - lastFetch < CACHE_TTL && cache.database) {
        return cache.database;
      }

      try {
        const url = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + DATA_FILE + '?ref=' + GITHUB_BRANCH;
        console.log('🐙 Reading from GitHub...');
        const response = await fetch(url, {
          headers: {
            'Authorization': 'token ' + GITHUB_TOKEN,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (response.status === 404) {
          // Bestand bestaat nog niet — maak leeg database
          console.log('🐙 Database file not found, creating new...');
          const emptyDb = {
            products: [],
            bids: [],
            posts: [],
            coupons: [],
            wheelSettings: null,
            resetToken: 'reset_initial'
          };
          await this._writeFile(emptyDb);
          cache.database = emptyDb;
          lastFetch = Date.now();
          return emptyDb;
        }

        if (!response.ok) throw new Error('HTTP ' + response.status);
        
        const data = await response.json();
        // GitHub API returned base64 encoded content
        const content = atob(data.content.replace(/\n/g, ''));
        const db = JSON.parse(content);
        
        cache.database = db;
        cache.sha = data.sha; // Bewaar SHA voor updates
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

    // ═══ GitHub API: Bestand schrijven ═══
    async _writeFile(data) {
      if (!isConfigured) return;
      try {
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
        const url = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + DATA_FILE;
        
        const body = {
          message: 'Lagenco DB update ' + new Date().toISOString(),
          content: content,
          branch: GITHUB_BRANCH
        };
        
        // Voeg SHA toe als we het bestand eerder lazen (voor updates)
        if (cache.sha) {
          body.sha = cache.sha;
        }

        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': 'token ' + GITHUB_TOKEN,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error('HTTP ' + response.status + ': ' + (errData.message || 'Unknown'));
        }

        const result = await response.json();
        cache.sha = result.content.sha; // Update SHA voor volgende update
        cache.database = data;
        console.log('🐙 Database saved to GitHub');
      } catch (e) {
        console.warn('🐙 Write error:', e.message);
      }
    },

    // ═══ Alle data ophalen ═══
    async syncAll() {
      if (!isConfigured) {
        console.log('🐙 GitHub DB not configured — using localStorage only');
        return;
      }
      console.log('🐙 Syncing from GitHub...');
      const db = await this._readFile();
      if (!db) {
        console.warn('🐙 Sync failed — using localStorage');
        return;
      }

      // Update localStorage met GitHub data
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
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.products = db.products || [];
      const idx = db.products.findIndex(p => p.id === product.id);
      if (idx >= 0) db.products[idx] = product;
      else db.products.push(product);
      await this._writeFile(db);
    },

    async deleteProduct(id) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.products = (db.products || []).filter(p => p.id !== id);
      await this._writeFile(db);
    },

    // ═══ Biedingen ═══
    async saveBid(bid) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.bids = db.bids || [];
      db.bids.push(bid);
      await this._writeFile(db);
    },

    async updateBidStatus(id, status) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      const bid = (db.bids || []).find(b => b.id === id);
      if (bid) {
        bid.status = status;
        bid.updatedAt = new Date().toISOString();
        await this._writeFile(db);
      }
    },

    async deleteBid(id) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.bids = (db.bids || []).filter(b => b.id !== id);
      await this._writeFile(db);
    },

    // ═══ Community Posts ═══
    async savePost(post) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.posts = db.posts || [];
      const idx = db.posts.findIndex(p => p.id === post.id);
      if (idx >= 0) db.posts[idx] = post;
      else db.posts.unshift(post);
      await this._writeFile(db);
    },

    async deletePost(id) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.posts = (db.posts || []).filter(p => p.id !== id);
      await this._writeFile(db);
    },

    async saveComment(postId, comment) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.posts = db.posts || [];
      const post = db.posts.find(p => p.id === postId);
      if (post) {
        post.comments = post.comments || [];
        post.comments.push(comment);
        await this._writeFile(db);
      }
    },

    async deleteComment(postId, commentId) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.posts = db.posts || [];
      const post = db.posts.find(p => p.id === postId);
      if (post && post.comments) {
        post.comments = post.comments.filter(c => c.id !== commentId);
        await this._writeFile(db);
      }
    },

    // ═══ Coupons ═══
    async saveCoupon(coupon) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.coupons = db.coupons || [];
      db.coupons.push(coupon);
      await this._writeFile(db);
    },

    async updateCouponStatus(code, status) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      const coupon = (db.coupons || []).find(c => c.code === code);
      if (coupon) {
        coupon.status = status;
        coupon.usedAt = status === 'gebruikt' ? new Date().toISOString() : null;
        await this._writeFile(db);
      }
    },

    async deleteCoupon(code) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.coupons = (db.coupons || []).filter(c => c.code !== code);
      await this._writeFile(db);
    },

    // ═══ Wheel Settings ═══
    async saveWheelSettings(settings) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.wheelSettings = settings;
      await this._writeFile(db);
    },

    // ═══ Reset Token ═══
    async saveResetToken(token) {
      if (!isConfigured) return;
      const db = await this._readFile();
      if (!db) return;
      db.resetToken = token;
      await this._writeFile(db);
    },

    // ═══ Polling — check elke 30s voor updates ═══
    startPolling(callbacks) {
      if (!isConfigured) return;
      console.log('🐙 Starting polling (every 30s)...');
      setInterval(async () => {
        // Forceer cache refresh
        lastFetch = 0;
        const db = await this._readFile();
        if (!db) return;

        const oldProducts = localStorage.getItem('lagencoProducts') || '[]';
        const oldBids = localStorage.getItem('lagencoBids') || '[]';
        const oldPosts = localStorage.getItem('lagencoCommunityPosts') || '[]';

        if (JSON.stringify(db.products || []) !== oldProducts) {
          localStorage.setItem('lagencoProducts', JSON.stringify(db.products || []));
          console.log('🐙 Products changed!');
          if (callbacks.onProductsChange) callbacks.onProductsChange();
        }
        if (JSON.stringify(db.bids || []) !== oldBids) {
          localStorage.setItem('lagencoBids', JSON.stringify(db.bids || []));
          console.log('🐙 Bids changed!');
          if (callbacks.onBidsChange) callbacks.onBidsChange();
        }
        if (JSON.stringify(db.posts || []) !== oldPosts) {
          localStorage.setItem('lagencoCommunityPosts', JSON.stringify(db.posts || []));
          console.log('🐙 Posts changed!');
          if (callbacks.onPostsChange) callbacks.onPostsChange();
        }
      }, 30000);
    }
  };

  window.LagencoDB = DB;
  console.log('🐙 LagencoDB ready. Configured:', isConfigured);
})();
