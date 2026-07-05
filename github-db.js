/* ═══════════════════════════════════════════════════════
   LAGENCO — Firebase Realtime Database
   Onbeperkt, real-time, gratis tot 1GB
   ═══════════════════════════════════════════════════════

   SETUP:
   1. Ga naar https://console.firebase.google.com
   2. Maak nieuw project: "lagenco"
   3. Add app → Web app → registreer
   4. Kopieer de config (apiKey, authDomain, etc.)
   5. Vul hieronder in
   6. Database → Realtime Database → Regels → zet op:
      { "rules": { ".read": true, ".write": true } }
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  console.log('🔥 Lagenco Firebase DB loaded...');

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
  let listeners = {};

  if (isConfigured) {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.database();
      console.log('🔥 Firebase connected!');
    } catch (e) {
      console.warn('🔥 Firebase init error:', e.message);
    }
  } else {
    console.log('🔥 Firebase not configured — using localStorage only');
  }

  const DB = {
    isConfigured: !!db,

    // ═══ Alle data ophalen ═══
    async syncAll() {
      if (!db) return;
      console.log('🔥 Syncing from Firebase...');
      try {
        const snapshot = await db.ref('/').once('value');
        const data = snapshot.val() || {};

        if (data.products) localStorage.setItem('lagencoProducts', JSON.stringify(data.products));
        if (data.bids) localStorage.setItem('lagencoBids', JSON.stringify(data.bids));
        if (data.posts) localStorage.setItem('lagencoCommunityPosts', JSON.stringify(data.posts));
        if (data.coupons) localStorage.setItem('lagencoWheelPrizes', JSON.stringify(data.coupons));
        if (data.wheelSettings) localStorage.setItem('lagencoWheelSettings', JSON.stringify(data.wheelSettings));
        if (data.resetToken) localStorage.setItem('lagencoWheelSpinResetToken', data.resetToken);

        console.log('🔥 Sync complete!', {
          products: (data.products || []).length,
          bids: (data.bids || []).length,
          posts: (data.posts || []).length,
          coupons: (data.coupons || []).length
        });
      } catch (e) {
        console.warn('🔥 Sync error:', e.message);
      }
    },

    // ═══ Producten ═══
    async saveProduct(product) {
      if (!db) return;
      try {
        await db.ref('products/' + product.id).set(product);
        console.log('🔥 Product saved:', product.title);
      } catch (e) { console.warn('🔥 SaveProduct error:', e.message); }
    },

    async deleteProduct(id) {
      if (!db) return;
      try {
        await db.ref('products/' + id).remove();
        console.log('🔥 Product deleted:', id);
      } catch (e) { console.warn('🔥 DeleteProduct error:', e.message); }
    },

    // ═══ Biedingen ═══
    async saveBid(bid) {
      if (!db) return;
      try {
        await db.ref('bids/' + bid.id).set(bid);
        console.log('🔥 Bid saved:', bid.name);
      } catch (e) { console.warn('🔥 SaveBid error:', e.message); }
    },

    async updateBidStatus(id, status) {
      if (!db) return;
      try {
        await db.ref('bids/' + id).update({ status: status, updatedAt: new Date().toISOString() });
        console.log('🔥 Bid updated:', id, status);
      } catch (e) { console.warn('🔥 UpdateBid error:', e.message); }
    },

    async deleteBid(id) {
      if (!db) return;
      try {
        await db.ref('bids/' + id).remove();
        console.log('🔥 Bid deleted:', id);
      } catch (e) { console.warn('🔥 DeleteBid error:', e.message); }
    },

    // ═══ Community Posts ═══
    async savePost(post) {
      if (!db) return;
      try {
        await db.ref('posts/' + post.id).set(post);
        console.log('🔥 Post saved:', post.title);
      } catch (e) { console.warn('🔥 SavePost error:', e.message); }
    },

    async deletePost(id) {
      if (!db) return;
      try {
        await db.ref('posts/' + id).remove();
        console.log('🔥 Post deleted:', id);
      } catch (e) { console.warn('🔥 DeletePost error:', e.message); }
    },

    async saveComment(postId, comment) {
      if (!db) return;
      try {
        await db.ref('posts/' + postId + '/comments/' + comment.id).set(comment);
        console.log('🔥 Comment saved');
      } catch (e) { console.warn('🔥 SaveComment error:', e.message); }
    },

    async deleteComment(postId, commentId) {
      if (!db) return;
      try {
        await db.ref('posts/' + postId + '/comments/' + commentId).remove();
        console.log('🔥 Comment deleted');
      } catch (e) { console.warn('🔥 DeleteComment error:', e.message); }
    },

    // ═══ Coupons ═══
    async saveCoupon(coupon) {
      if (!db) return;
      try {
        var key = coupon.code || ('noprize_' + Date.now());
        await db.ref('coupons/' + key).set(coupon);
        console.log('🔥 Coupon saved');
      } catch (e) { console.warn('🔥 SaveCoupon error:', e.message); }
    },

    async updateCouponStatus(code, status) {
      if (!db) return;
      try {
        await db.ref('coupons/' + code).update({
          status: status,
          usedAt: status === 'gebruikt' ? new Date().toISOString() : null
        });
        console.log('🔥 Coupon updated:', code, status);
      } catch (e) { console.warn('🔥 UpdateCoupon error:', e.message); }
    },

    async deleteCoupon(code) {
      if (!db) return;
      try {
        await db.ref('coupons/' + code).remove();
        console.log('🔥 Coupon deleted:', code);
      } catch (e) { console.warn('🔥 DeleteCoupon error:', e.message); }
    },

    // ═══ Wheel Settings ═══
    async saveWheelSettings(settings) {
      if (!db) return;
      try {
        await db.ref('wheelSettings').set(settings);
        console.log('🔥 Wheel settings saved');
      } catch (e) { console.warn('🔥 SaveWheelSettings error:', e.message); }
    },

    // ═══ Reset Token ═══
    async saveResetToken(token) {
      if (!db) return;
      try {
        await db.ref('resetToken').set(token);
        console.log('🔥 Reset token saved');
      } catch (e) { console.warn('🔥 SaveResetToken error:', e.message); }
    },

    // ═══ Real-time listeners (geen polling nodig!) ═══
    startPolling(callbacks) {
      if (!db) return;
      console.log('🔥 Starting real-time listeners...');

      // Products — real-time updates
      db.ref('products').on('value', function(snapshot) {
        var products = [];
        snapshot.forEach(function(child) {
          products.push(child.val());
        });
        localStorage.setItem('lagencoProducts', JSON.stringify(products));
        if (!listeners.productsFirst) {
          listeners.productsFirst = true;
          return; // Skip first load (already handled by syncAll)
        }
        console.log('🔥 Products changed (real-time)!');
        if (callbacks.onProductsChange) callbacks.onProductsChange();
      });

      // Bids — real-time updates
      db.ref('bids').on('value', function(snapshot) {
        var bids = [];
        snapshot.forEach(function(child) {
          bids.push(child.val());
        });
        localStorage.setItem('lagencoBids', JSON.stringify(bids));
        if (!listeners.bidsFirst) {
          listeners.bidsFirst = true;
          return;
        }
        console.log('🔥 Bids changed (real-time)!');
        if (callbacks.onBidsChange) callbacks.onBidsChange();
      });

      // Posts — real-time updates
      db.ref('posts').on('value', function(snapshot) {
        var posts = [];
        snapshot.forEach(function(child) {
          posts.push(child.val());
        });
        localStorage.setItem('lagencoCommunityPosts', JSON.stringify(posts));
        if (!listeners.postsFirst) {
          listeners.postsFirst = true;
          return;
        }
        console.log('🔥 Posts changed (real-time)!');
        if (callbacks.onPostsChange) callbacks.onPostsChange();
      });
    }
  };

  window.LagencoDB = DB;
  console.log('🔥 LagencoDB ready. Configured:', !!db);
})();
