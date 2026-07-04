/* ═══════════════════════════════════════════════════════
   LAGENCO — Supabase Client + Data Sync Layer
   ═══════════════════════════════════════════════════════

   HOE WERKT DIT?
   1. Bij het laden van de pagina: haal alle data uit Supabase
      en cache het in localStorage (voor snelle weergave)
   2. Bij wijzigingen: update localStorage EN push naar Supabase
   3. Realtime: als een andere bezoeker iets wijzigt, update
      automatisch de pagina

   SETUP:
   1. Maak een account aan op supabase.com
   2. Maak een nieuw project
   3. Ga naar Settings → API
   4. Kopieer je "Project URL" en "anon public" key
   5. Vul ze hieronder in
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════
  // CONFIG — Vul hier je Supabase gegevens in
  // ═══════════════════════════════════════════════════════
  const SUPABASE_URL = 'https://cjamegkxiuazyaqadgqn.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqYW1lZ2t4aXVhenlhcWFkZ3FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTczODcsImV4cCI6MjA5ODc3MzM4N30.fQvSkCg94sxYYYRNtXHF2vWgGaMC3BKGNTpAnbJholk';

  // Check if Supabase is configured
  const isConfigured = SUPABASE_URL !== 'https://cjamegkxiuazyaqadgqn.supabase.co' &&
                       SUPABASE_KEY !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqYW1lZ2t4aXVhenlhcWFkZ3FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxOTczODcsImV4cCI6MjA5ODc3MzM4N30.fQvSkCg94sxYYYRNtXHF2vWgGaMC3BKGNTpAnbJholk' &&
                       typeof window.supabase !== 'undefined';

  let sb = null;

  if (isConfigured) {
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('✅ Supabase verbonden');
    } catch (e) {
      console.warn('⚠️ Supabase kon niet verbinden, valt terug op localStorage', e);
    }
  } else {
    console.log('ℹ️ Supabase niet geconfigureerd — website gebruikt localStorage. Zie supabase-client.js voor setup instructies.');
  }

  // ═══════════════════════════════════════════════════════
  // DATA SYNC — haal data uit Supabase en cache in localStorage
  // ═══════════════════════════════════════════════════════

  const DB = {
    supabase: sb,
    isConfigured: !!sb,

    // ═══ PRODUCTEN ═══
    async fetchProducts() {
      if (!sb) return null;
      try {
        const { data, error } = await sb.from('products').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        // Convert DB format to website format
        const products = (data || []).map(p => ({
          id: p.id,
          title: p.title,
          description: p.description || '',
          price: parseFloat(p.price) || 0,
          oldPrice: p.old_price ? parseFloat(p.old_price) : null,
          badge: p.badge || 'Uitgelicht',
          condition: p.condition || 0,
          image: p.image || '',
          images: p.images || [],
          createdAt: p.created_at || Date.now()
        }));
        // Cache in localStorage
        localStorage.setItem('lagencoProducts', JSON.stringify(products));
        return products;
      } catch (e) {
        console.warn('Supabase fetchProducts error:', e);
        return null;
      }
    },

    async saveProduct(product) {
      if (!sb) return;
      try {
        const dbProduct = {
          id: product.id,
          title: product.title,
          description: product.description || '',
          price: product.price,
          old_price: product.oldPrice || null,
          badge: product.badge || 'Uitgelicht',
          condition: product.condition || 0,
          image: product.image || null,
          images: product.images || [],
          created_at: product.createdAt || Date.now()
        };
        const { error } = await sb.from('products').upsert(dbProduct);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase saveProduct error:', e);
      }
    },

    async deleteProduct(id) {
      if (!sb) return;
      try {
        const { error } = await sb.from('products').delete().eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase deleteProduct error:', e);
      }
    },

    // ═══ BIEDINGEN ═══
    async fetchBids() {
      if (!sb) return null;
      try {
        const { data, error } = await sb.from('bids').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        const bids = (data || []).map(b => ({
          id: b.id,
          productId: b.product_id,
          productTitle: b.product_title,
          productPrice: parseFloat(b.product_price) || 0,
          name: b.name,
          email: b.email,
          phone: b.phone || '',
          amount: parseFloat(b.amount) || 0,
          shippingMethod: b.shipping_method || '',
          shippingMethodKey: b.shipping_method_key || '',
          street: b.street || '',
          houseNumber: b.house_number || '',
          houseNumberAdd: b.house_number_add || '',
          postalCode: b.postal_code || '',
          city: b.city || '',
          country: b.country || 'Nederland',
          fullAddress: b.full_address || '',
          note: b.note || '',
          status: b.status || 'in_afwachting',
          createdAt: b.created_at || new Date().toISOString(),
          updatedAt: b.updated_at || null
        }));
        localStorage.setItem('lagencoBids', JSON.stringify(bids));
        return bids;
      } catch (e) {
        console.warn('Supabase fetchBids error:', e);
        return null;
      }
    },

    async saveBid(bid) {
      if (!sb) return;
      try {
        const dbBid = {
          id: bid.id,
          product_id: bid.productId,
          product_title: bid.productTitle,
          product_price: bid.productPrice,
          name: bid.name,
          email: bid.email,
          phone: bid.phone || '',
          amount: bid.amount,
          shipping_method: bid.shippingMethod || '',
          shipping_method_key: bid.shippingMethodKey || '',
          street: bid.street || '',
          house_number: bid.houseNumber || '',
          house_number_add: bid.houseNumberAdd || '',
          postal_code: bid.postalCode || '',
          city: bid.city || '',
          country: bid.country || 'Nederland',
          full_address: bid.fullAddress || '',
          note: bid.note || '',
          status: bid.status || 'in_afwachting',
          created_at: bid.createdAt
        };
        const { error } = await sb.from('bids').insert(dbBid);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase saveBid error:', e);
      }
    },

    async updateBidStatus(id, status) {
      if (!sb) return;
      try {
        const { error } = await sb.from('bids')
          .update({ status: status, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase updateBidStatus error:', e);
      }
    },

    async deleteBid(id) {
      if (!sb) return;
      try {
        const { error } = await sb.from('bids').delete().eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase deleteBid error:', e);
      }
    },

    // ═══ COMMUNITY POSTS ═══
    async fetchPosts() {
      if (!sb) return null;
      try {
        const { data: posts, error: postsError } = await sb.from('community_posts')
          .select('*').order('created_at', { ascending: false });
        if (postsError) throw postsError;

        // Fetch comments for all posts
        const { data: comments, error: commentsError } = await sb.from('community_comments')
          .select('*').order('created_at', { ascending: true });
        if (commentsError) throw commentsError;

        const result = (posts || []).map(p => ({
          id: p.id,
          title: p.title,
          body: p.body,
          author: p.author || 'Lagenco',
          image: p.image || null,
          createdAt: p.created_at || new Date().toISOString(),
          comments: (comments || []).filter(c => c.post_id === p.id).map(c => ({
            id: c.id,
            username: c.username,
            text: c.text,
            createdAt: c.created_at || new Date().toISOString()
          }))
        }));

        localStorage.setItem('lagencoCommunityPosts', JSON.stringify(result));
        return result;
      } catch (e) {
        console.warn('Supabase fetchPosts error:', e);
        return null;
      }
    },

    async savePost(post) {
      if (!sb) return;
      try {
        const dbPost = {
          id: post.id,
          title: post.title,
          body: post.body,
          author: post.author || 'Lagenco',
          image: post.image || null,
          created_at: post.createdAt
        };
        const { error } = await sb.from('community_posts').insert(dbPost);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase savePost error:', e);
      }
    },

    async deletePost(id) {
      if (!sb) return;
      try {
        const { error } = await sb.from('community_posts').delete().eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase deletePost error:', e);
      }
    },

    async saveComment(postId, comment) {
      if (!sb) return;
      try {
        const dbComment = {
          id: comment.id,
          post_id: postId,
          username: comment.username,
          text: comment.text,
          created_at: comment.createdAt
        };
        const { error } = await sb.from('community_comments').insert(dbComment);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase saveComment error:', e);
      }
    },

    async deleteComment(postId, commentId) {
      if (!sb) return;
      try {
        const { error } = await sb.from('community_comments').delete().eq('id', commentId);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase deleteComment error:', e);
      }
    },

    // ═══ WHEEL SPIN COUPONS ═══
    async fetchCoupons() {
      if (!sb) return null;
      try {
        const { data, error } = await sb.from('wheel_coupons')
          .select('*').order('won_at', { ascending: false });
        if (error) throw error;
        const coupons = (data || []).map(c => ({
          code: c.code,
          type: c.type,
          label: c.label,
          wonAt: c.won_at || new Date().toISOString(),
          status: c.status || 'ongebruikt',
          usedAt: c.used_at || null,
          winnerName: c.winner_name || '',
          winnerEmail: c.winner_email || ''
        }));
        localStorage.setItem('lagencoWheelPrizes', JSON.stringify(coupons));
        return coupons;
      } catch (e) {
        console.warn('Supabase fetchCoupons error:', e);
        return null;
      }
    },

    async saveCoupon(coupon) {
      if (!sb) return;
      try {
        const dbCoupon = {
          code: coupon.code,
          type: coupon.type,
          label: coupon.label,
          winner_name: coupon.winnerName || '',
          winner_email: coupon.winnerEmail || '',
          status: coupon.status || 'ongebruikt',
          won_at: coupon.wonAt
        };
        const { error } = await sb.from('wheel_coupons').insert(dbCoupon);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase saveCoupon error:', e);
      }
    },

    async updateCouponStatus(code, status) {
      if (!sb) return;
      try {
        const updateData = { status: status };
        if (status === 'gebruikt') {
          updateData.used_at = new Date().toISOString();
        } else {
          updateData.used_at = null;
        }
        const { error } = await sb.from('wheel_coupons').update(updateData).eq('code', code);
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase updateCouponStatus error:', e);
      }
    },

    // ═══ WHEEL SETTINGS ═══
    async fetchWheelSettings() {
      if (!sb) return null;
      try {
        const { data, error } = await sb.from('wheel_settings').select('settings').eq('id', 1).single();
        if (error) throw error;
        if (data && data.settings) {
          localStorage.setItem('lagencoWheelSettings', JSON.stringify(data.settings));
          return data.settings;
        }
        return null;
      } catch (e) {
        console.warn('Supabase fetchWheelSettings error:', e);
        return null;
      }
    },

    async saveWheelSettings(settings) {
      if (!sb) return;
      try {
        const { error } = await sb.from('wheel_settings')
          .upsert({ id: 1, settings: settings, updated_at: new Date().toISOString() });
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase saveWheelSettings error:', e);
      }
    },

    // ═══ WHEEL RESET TOKEN ═══
    async fetchResetToken() {
      if (!sb) return null;
      try {
        const { data, error } = await sb.from('wheel_reset_token').select('token').eq('id', 1).single();
        if (error) throw error;
        if (data && data.token) {
          localStorage.setItem('lagencoWheelSpinResetToken', data.token);
          return data.token;
        }
        return null;
      } catch (e) {
        console.warn('Supabase fetchResetToken error:', e);
        return null;
      }
    },

    async saveResetToken(token) {
      if (!sb) return;
      try {
        const { error } = await sb.from('wheel_reset_token')
          .upsert({ id: 1, token: token, updated_at: new Date().toISOString() });
        if (error) throw error;
      } catch (e) {
        console.warn('Supabase saveResetToken error:', e);
      }
    },

    // ═══ INITIAL SYNC — haal alles op bij page load ═══
    async syncAll() {
      if (!sb) return;
      console.log('🔄 Syncing data from Supabase...');
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

    // ═══ REALTIME — luister naar veranderingen ═══
    subscribeRealtime(callbacks) {
      if (!sb) return;
      console.log('👂 Starting realtime subscriptions...');

      // Products
      sb.channel('products-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
          console.log('📦 Product change:', payload.eventType);
          this.fetchProducts().then(() => callbacks.onProductsChange && callbacks.onProductsChange());
        })
        .subscribe();

      // Bids
      sb.channel('bids-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bids' }, (payload) => {
          console.log('🔨 Bid change:', payload.eventType);
          this.fetchBids().then(() => callbacks.onBidsChange && callbacks.onBidsChange());
        })
        .subscribe();

      // Community posts
      sb.channel('posts-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'community_posts' }, (payload) => {
          console.log('💬 Post change:', payload.eventType);
          this.fetchPosts().then(() => callbacks.onPostsChange && callbacks.onPostsChange());
        })
        .subscribe();

      // Community comments
      sb.channel('comments-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'community_comments' }, (payload) => {
          console.log('💬 Comment change:', payload.eventType);
          this.fetchPosts().then(() => callbacks.onPostsChange && callbacks.onPostsChange());
        })
        .subscribe();

      // Wheel coupons
      sb.channel('coupons-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_coupons' }, (payload) => {
          console.log('🎫 Coupon change:', payload.eventType);
          this.fetchCoupons().then(() => callbacks.onCouponsChange && callbacks.onCouponsChange());
        })
        .subscribe();

      // Wheel settings
      sb.channel('settings-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_settings' }, (payload) => {
          console.log('⚙️ Settings change:', payload.eventType);
          this.fetchWheelSettings().then(() => callbacks.onSettingsChange && callbacks.onSettingsChange());
        })
        .subscribe();

      // Reset token
      sb.channel('token-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wheel_reset_token' }, (payload) => {
          console.log('🔄 Token change:', payload.eventType);
          this.fetchResetToken().then(() => callbacks.onTokenChange && callbacks.onTokenChange());
        })
        .subscribe();
    }
  };

  // Expose globally
  window.LagencoDB = DB;
})();
