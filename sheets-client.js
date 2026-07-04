/* ═══════════════════════════════════════════════════════
   LAGENCO — Google Sheets Database Sync
   ═══════════════════════════════════════════════════════

   HOE WERKT DIT?
   1. Maak een Google Sheet aan met tabbladen voor elk datatype
   2. Publiceer de sheet als "Web App" (via Google Apps Script)
   3. Vul hieronder de URL in
   4. De website leest producten uit de sheet en toont ze aan alle bezoekers

   SETUP STAPPEN:
   1. Ga naar https://sheets.google.com en maak een nieuwe spreadsheet
   2. Noem de tabbladen: "Producten", "Biedingen", "Community", "Coupons"
   3. Ga naar Extensions → Apps Script
   4. Plak de code uit google-apps-script.js (in de zip)
   5. Klik Deploy → New deployment → Web app
   6. Execute as: Me
   7. Who has access: Anyone
   8. Kopieer de URL en vul hieronder in
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ═══ CONFIG — Vul hier je Google Apps Script Web App URL in ═══
  const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbztEXdwaqZrOsxHmQovhJEYwEBdkTN9oYaXmPnUIx_B37U7DaRh4Fvo1wh10Dt_5bQ/exec';

  const isConfigured = SHEETS_URL !== 'https://script.google.com/macros/s/AKfycbztEXdwaqZrOsxHmQovhJEYwEBdkTN9oYaXmPnUIx_B37U7DaRh4Fvo1wh10Dt_5bQ/exec' &&
                       SHEETS_URL.startsWith('https://');

  const DB = {
    isConfigured: isConfigured,
    url: SHEETS_URL,

    // ═══ Producten ophalen ═══
    async fetchProducts() {
      if (!isConfigured) return null;
      try {
        const response = await fetch(SHEETS_URL + '?action=getProducts');
        const data = await response.json();
        if (data && data.products) {
          localStorage.setItem('lagencoProducts', JSON.stringify(data.products));
          return data.products;
        }
        return null;
      } catch (e) {
        console.warn('Sheets fetchProducts error:', e);
        return null;
      }
    },

    // ═══ Product opslaan ═══
    async saveProduct(product) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'saveProduct', product: product })
        });
      } catch (e) {
        console.warn('Sheets saveProduct error:', e);
      }
    },

    // ═══ Product verwijderen ═══
    async deleteProduct(id) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deleteProduct', id: id })
        });
      } catch (e) {
        console.warn('Sheets deleteProduct error:', e);
      }
    },

    // ═══ Biedingen ophalen ═══
    async fetchBids() {
      if (!isConfigured) return null;
      try {
        const response = await fetch(SHEETS_URL + '?action=getBids');
        const data = await response.json();
        if (data && data.bids) {
          localStorage.setItem('lagencoBids', JSON.stringify(data.bids));
          return data.bids;
        }
        return null;
      } catch (e) {
        console.warn('Sheets fetchBids error:', e);
        return null;
      }
    },

    // ═══ Bod opslaan ═══
    async saveBid(bid) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'saveBid', bid: bid })
        });
      } catch (e) {
        console.warn('Sheets saveBid error:', e);
      }
    },

    // ═══ Bod status updaten ═══
    async updateBidStatus(id, status) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'updateBidStatus', id: id, status: status })
        });
      } catch (e) {
        console.warn('Sheets updateBidStatus error:', e);
      }
    },

    // ═══ Bod verwijderen ═══
    async deleteBid(id) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deleteBid', id: id })
        });
      } catch (e) {
        console.warn('Sheets deleteBid error:', e);
      }
    },

    // ═══ Community posts ophalen ═══
    async fetchPosts() {
      if (!isConfigured) return null;
      try {
        const response = await fetch(SHEETS_URL + '?action=getPosts');
        const data = await response.json();
        if (data && data.posts) {
          localStorage.setItem('lagencoCommunityPosts', JSON.stringify(data.posts));
          return data.posts;
        }
        return null;
      } catch (e) {
        console.warn('Sheets fetchPosts error:', e);
        return null;
      }
    },

    // ═══ Community post opslaan ═══
    async savePost(post) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'savePost', post: post })
        });
      } catch (e) {
        console.warn('Sheets savePost error:', e);
      }
    },

    // ═══ Community post verwijderen ═══
    async deletePost(id) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deletePost', id: id })
        });
      } catch (e) {
        console.warn('Sheets deletePost error:', e);
      }
    },

    // ═══ Reactie opslaan ═══
    async saveComment(postId, comment) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'saveComment', postId: postId, comment: comment })
        });
      } catch (e) {
        console.warn('Sheets saveComment error:', e);
      }
    },

    // ═══ Reactie verwijderen ═══
    async deleteComment(postId, commentId) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deleteComment', commentId: commentId })
        });
      } catch (e) {
        console.warn('Sheets deleteComment error:', e);
      }
    },

    // ═══ Coupons ophalen ═══
    async fetchCoupons() {
      if (!isConfigured) return null;
      try {
        const response = await fetch(SHEETS_URL + '?action=getCoupons');
        const data = await response.json();
        if (data && data.coupons) {
          localStorage.setItem('lagencoWheelPrizes', JSON.stringify(data.coupons));
          return data.coupons;
        }
        return null;
      } catch (e) {
        console.warn('Sheets fetchCoupons error:', e);
        return null;
      }
    },

    // ═══ Coupon opslaan ═══
    async saveCoupon(coupon) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'saveCoupon', coupon: coupon })
        });
      } catch (e) {
        console.warn('Sheets saveCoupon error:', e);
      }
    },

    // ═══ Coupon status updaten ═══
    async updateCouponStatus(code, status) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'updateCouponStatus', code: code, status: status })
        });
      } catch (e) {
        console.warn('Sheets updateCouponStatus error:', e);
      }
    },

    // ═══ Wheel settings ophalen ═══
    async fetchWheelSettings() {
      if (!isConfigured) return null;
      try {
        const response = await fetch(SHEETS_URL + '?action=getWheelSettings');
        const data = await response.json();
        if (data && data.settings) {
          localStorage.setItem('lagencoWheelSettings', JSON.stringify(data.settings));
          return data.settings;
        }
        return null;
      } catch (e) {
        console.warn('Sheets fetchWheelSettings error:', e);
        return null;
      }
    },

    // ═══ Wheel settings opslaan ═══
    async saveWheelSettings(settings) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'saveWheelSettings', settings: settings })
        });
      } catch (e) {
        console.warn('Sheets saveWheelSettings error:', e);
      }
    },

    // ═══ Reset token ophalen ═══
    async fetchResetToken() {
      if (!isConfigured) return null;
      try {
        const response = await fetch(SHEETS_URL + '?action=getResetToken');
        const data = await response.json();
        if (data && data.token) {
          localStorage.setItem('lagencoWheelSpinResetToken', data.token);
          return data.token;
        }
        return null;
      } catch (e) {
        console.warn('Sheets fetchResetToken error:', e);
        return null;
      }
    },

    // ═══ Reset token opslaan ═══
    async saveResetToken(token) {
      if (!isConfigured) return;
      try {
        await fetch(SHEETS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'saveResetToken', token: token })
        });
      } catch (e) {
        console.warn('Sheets saveResetToken error:', e);
      }
    },

    // ═══ Alles synchroniseren ═══
    async syncAll() {
      if (!isConfigured) return;
      console.log('🔄 Syncing from Google Sheets...');
      await Promise.all([
        this.fetchProducts(),
        this.fetchBids(),
        this.fetchPosts(),
        this.fetchCoupons(),
        this.fetchWheelSettings(),
        this.fetchResetToken()
      ]);
      console.log('✅ Sync complete');
    },

    // ═══ Polling — check elke 30 seconden voor updates ═══
    startPolling(callbacks) {
      if (!isConfigured) return;
      console.log('👂 Starting Google Sheets polling (every 30s)...');
      
      setInterval(async () => {
        const changed = {};
        
        // Check products
        const oldProducts = localStorage.getItem('lagencoProducts') || '[]';
        const newProducts = await this.fetchProducts();
        if (newProducts && JSON.stringify(newProducts) !== oldProducts) {
          changed.products = true;
        }
        
        // Check bids
        const oldBids = localStorage.getItem('lagencoBids') || '[]';
        const newBids = await this.fetchBids();
        if (newBids && JSON.stringify(newBids) !== oldBids) {
          changed.bids = true;
        }
        
        // Check posts
        const oldPosts = localStorage.getItem('lagencoCommunityPosts') || '[]';
        const newPosts = await this.fetchPosts();
        if (newPosts && JSON.stringify(newPosts) !== oldPosts) {
          changed.posts = true;
        }
        
        // Call callbacks
        if (changed.products && callbacks.onProductsChange) callbacks.onProductsChange();
        if (changed.bids && callbacks.onBidsChange) callbacks.onBidsChange();
        if (changed.posts && callbacks.onPostsChange) callbacks.onPostsChange();
        
      }, 30000); // 30 seconden
    }
  };

  window.LagencoDB = DB;
})();
