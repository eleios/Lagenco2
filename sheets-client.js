/* ═══════════════════════════════════════════════════════
   LAGENCO — Google Sheets Database Sync (V2)
   ═══════════════════════════════════════════════════════

   SETUP:
   1. Maak een Google Spreadsheet
   2. Ga naar Extensions → Apps Script
   3. Plak de code uit google-apps-script.js
   4. Deploy → New deployment → Web app
   5. Execute as: Me | Who has access: Anyone
   6. Kopieer de URL en vul hieronder in
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  console.log('📋 Lagenco Sheets Client loaded...');

  // ═══ CONFIG — Vul hier je URL in ═══
  const SHEETS_URL = 'VUL_HIER_JE_GOOGLE_APPS_SCRIPT_URL_IN';

  const isConfigured = SHEETS_URL.startsWith('https://script.google.com') ||
                       SHEETS_URL.startsWith('https://script.googleusercontent.com');

  console.log('📋 Sheets configured:', isConfigured);
  console.log('📋 Sheets URL:', SHEETS_URL.substring(0, 50) + '...');

  const DB = {
    isConfigured: isConfigured,
    url: SHEETS_URL,

    // ═══ GET request helper ═══
    async _get(action) {
      try {
        const url = SHEETS_URL + '?action=' + action;
        console.log('📋 GET:', action);
        const response = await fetch(url, { method: 'GET' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        console.log('📋 GET ' + action + ' OK:', Object.keys(data));
        return data;
      } catch (e) {
        console.warn('📋 GET ' + action + ' failed:', e.message);
        return null;
      }
    },

    // ═══ POST request helper (text/plain om CORS te voorkomen) ═══
    async _post(payload) {
      try {
        console.log('📋 POST:', payload.action);
        const response = await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        console.log('📋 POST ' + payload.action + ' OK');
        return data;
      } catch (e) {
        console.warn('📋 POST ' + payload.action + ' failed:', e.message);
        return null;
      }
    },

    // ═══ PRODUCTEN ═══
    async fetchProducts() {
      if (!isConfigured) return null;
      const data = await this._get('getProducts');
      if (data && data.products) {
        localStorage.setItem('lagencoProducts', JSON.stringify(data.products));
        return data.products;
      }
      return null;
    },

    async saveProduct(product) {
      if (!isConfigured) return;
      await this._post({ action: 'saveProduct', product: product });
    },

    async deleteProduct(id) {
      if (!isConfigured) return;
      await this._post({ action: 'deleteProduct', id: id });
    },

    // ═══ BIEDINGEN ═══
    async fetchBids() {
      if (!isConfigured) return null;
      const data = await this._get('getBids');
      if (data && data.bids) {
        localStorage.setItem('lagencoBids', JSON.stringify(data.bids));
        return data.bids;
      }
      return null;
    },

    async saveBid(bid) {
      if (!isConfigured) return;
      await this._post({ action: 'saveBid', bid: bid });
    },

    async updateBidStatus(id, status) {
      if (!isConfigured) return;
      await this._post({ action: 'updateBidStatus', id: id, status: status });
    },

    async deleteBid(id) {
      if (!isConfigured) return;
      await this._post({ action: 'deleteBid', id: id });
    },

    // ═══ COMMUNITY ═══
    async fetchPosts() {
      if (!isConfigured) return null;
      const data = await this._get('getPosts');
      if (data && data.posts) {
        localStorage.setItem('lagencoCommunityPosts', JSON.stringify(data.posts));
        return data.posts;
      }
      return null;
    },

    async savePost(post) {
      if (!isConfigured) return;
      await this._post({ action: 'savePost', post: post });
    },

    async deletePost(id) {
      if (!isConfigured) return;
      await this._post({ action: 'deletePost', id: id });
    },

    async saveComment(postId, comment) {
      if (!isConfigured) return;
      await this._post({ action: 'saveComment', postId: postId, comment: comment });
    },

    async deleteComment(commentId) {
      if (!isConfigured) return;
      await this._post({ action: 'deleteComment', commentId: commentId });
    },

    // ═══ COUPONS ═══
    async fetchCoupons() {
      if (!isConfigured) return null;
      const data = await this._get('getCoupons');
      if (data && data.coupons) {
        localStorage.setItem('lagencoWheelPrizes', JSON.stringify(data.coupons));
        return data.coupons;
      }
      return null;
    },

    async saveCoupon(coupon) {
      if (!isConfigured) return;
      await this._post({ action: 'saveCoupon', coupon: coupon });
    },

    async updateCouponStatus(code, status) {
      if (!isConfigured) return;
      await this._post({ action: 'updateCouponStatus', code: code, status: status });
    },

    // ═══ WHEEL SETTINGS ═══
    async fetchWheelSettings() {
      if (!isConfigured) return null;
      const data = await this._get('getWheelSettings');
      if (data && data.settings) {
        localStorage.setItem('lagencoWheelSettings', JSON.stringify(data.settings));
        return data.settings;
      }
      return null;
    },

    async saveWheelSettings(settings) {
      if (!isConfigured) return;
      await this._post({ action: 'saveWheelSettings', settings: settings });
    },

    // ═══ RESET TOKEN ═══
    async fetchResetToken() {
      if (!isConfigured) return null;
      const data = await this._get('getResetToken');
      if (data && data.token) {
        localStorage.setItem('lagencoWheelSpinResetToken', data.token);
        return data.token;
      }
      return null;
    },

    async saveResetToken(token) {
      if (!isConfigured) return;
      await this._post({ action: 'saveResetToken', token: token });
    },

    // ═══ ALLES SYNCEN ═══
    async syncAll() {
      if (!isConfigured) {
        console.log('📋 Sheets not configured — skipping sync');
        return;
      }
      console.log('📋 Syncing from Google Sheets...');
      await Promise.all([
        this.fetchProducts(),
        this.fetchBids(),
        this.fetchPosts(),
        this.fetchCoupons(),
        this.fetchWheelSettings(),
        this.fetchResetToken()
      ]);
      console.log('📋 Sync complete!');
    },

    // ═══ POLLING — check elke 30s ═══
    startPolling(callbacks) {
      if (!isConfigured) return;
      console.log('📋 Starting polling (every 30s)...');
      setInterval(async () => {
        const oldProducts = localStorage.getItem('lagencoProducts') || '[]';
        const oldBids = localStorage.getItem('lagencoBids') || '[]';
        const oldPosts = localStorage.getItem('lagencoCommunityPosts') || '[]';

        const newProducts = await this.fetchProducts();
        const newBids = await this.fetchBids();
        const newPosts = await this.fetchPosts();

        if (newProducts && JSON.stringify(newProducts) !== oldProducts) {
          console.log('📋 Products changed!');
          if (callbacks.onProductsChange) callbacks.onProductsChange();
        }
        if (newBids && JSON.stringify(newBids) !== oldBids) {
          console.log('📋 Bids changed!');
          if (callbacks.onBidsChange) callbacks.onBidsChange();
        }
        if (newPosts && JSON.stringify(newPosts) !== oldPosts) {
          console.log('📋 Posts changed!');
          if (callbacks.onPostsChange) callbacks.onPostsChange();
        }
      }, 30000);
    }
  };

  window.LagencoDB = DB;
  console.log('📋 LagencoDB ready. Configured:', isConfigured);
})();
