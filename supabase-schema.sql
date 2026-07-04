-- ═══════════════════════════════════════════════════════
-- LAGENCO — Supabase Database Schema
-- Voer dit uit in Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════

-- ═══ PRODUCTEN ═══
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  old_price NUMERIC,
  badge TEXT DEFAULT 'Uitgelicht',
  condition INTEGER DEFAULT 0,
  image TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ═══ BIEDINGEN ═══
CREATE TABLE IF NOT EXISTS bids (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_title TEXT,
  product_price NUMERIC DEFAULT 0,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  amount NUMERIC NOT NULL,
  shipping_method TEXT,
  shipping_method_key TEXT,
  street TEXT,
  house_number TEXT,
  house_number_add TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'Nederland',
  full_address TEXT,
  note TEXT,
  status TEXT DEFAULT 'in_afwachting',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

-- ═══ COMMUNITY POSTS ═══
CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author TEXT DEFAULT 'Lagenco',
  image TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══ COMMUNITY COMMENTS ═══
CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══ WHEEL SPIN COUPONS ═══
CREATE TABLE IF NOT EXISTS wheel_coupons (
  id TEXT PRIMARY KEY,
  code TEXT,
  type TEXT NOT NULL,
  label TEXT,
  winner_name TEXT DEFAULT '',
  winner_email TEXT DEFAULT '',
  status TEXT DEFAULT 'ongebruikt',
  won_at TIMESTAMP DEFAULT NOW(),
  used_at TIMESTAMP
);

-- ═══ WHEEL SPIN SETTINGS ═══
CREATE TABLE IF NOT EXISTS wheel_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  settings JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- ═══ WHEEL SPIN RESET TOKEN ═══
CREATE TABLE IF NOT EXISTS wheel_reset_token (
  id INTEGER PRIMARY KEY DEFAULT 1,
  token TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- ═══ Enable Row Level Security ═══
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheel_reset_token ENABLE ROW LEVEL SECURITY;

-- ═══ Policies: iedereen mag LEZEN ═══
CREATE POLICY "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Public read bids" ON bids FOR SELECT USING (true);
CREATE POLICY "Public read posts" ON community_posts FOR SELECT USING (true);
CREATE POLICY "Public read comments" ON community_comments FOR SELECT USING (true);
CREATE POLICY "Public read coupons" ON wheel_coupons FOR SELECT USING (true);
CREATE POLICY "Public read settings" ON wheel_settings FOR SELECT USING (true);
CREATE POLICY "Public read token" ON wheel_reset_token FOR SELECT USING (true);

-- ═══ Policies: iedereen mag SCHRIJVEN (anoniem + authenticated) ═══
-- Note: Voor productie kun je dit beperken tot authenticated admins
CREATE POLICY "Public insert products" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update products" ON products FOR UPDATE USING (true);
CREATE POLICY "Public delete products" ON products FOR DELETE USING (true);

CREATE POLICY "Public insert bids" ON bids FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update bids" ON bids FOR UPDATE USING (true);
CREATE POLICY "Public delete bids" ON bids FOR DELETE USING (true);

CREATE POLICY "Public insert posts" ON community_posts FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update posts" ON community_posts FOR UPDATE USING (true);
CREATE POLICY "Public delete posts" ON community_posts FOR DELETE USING (true);

CREATE POLICY "Public insert comments" ON community_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete comments" ON community_comments FOR DELETE USING (true);

CREATE POLICY "Public insert coupons" ON wheel_coupons FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update coupons" ON wheel_coupons FOR UPDATE USING (true);
CREATE POLICY "Public delete coupons" ON wheel_coupons FOR DELETE USING (true);

CREATE POLICY "Public upsert settings" ON wheel_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update settings" ON wheel_settings FOR UPDATE USING (true);

CREATE POLICY "Public upsert token" ON wheel_reset_token FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update token" ON wheel_reset_token FOR UPDATE USING (true);

-- ═══ Insert default wheel settings ═══
INSERT INTO wheel_settings (id, settings) VALUES (1, '[
  {"id":"korting5","label":"€5 Korting","icon":"🎁","color":"#6BBF7E","textColor":"#fff","chance":1,"codePrefix":"LAGENCO5-","title":"Je hebt €5 korting gewonnen!","text":"Gefeliciteerd! Je hebt een kortingscode van €5 gewonnen.","hasCode":true},
  {"id":"gratisretour","label":"Gratis Retour","icon":"📦","color":"#FFB088","textColor":"#fff","chance":0.5,"codePrefix":"GRATISRETOUR-","title":"Je hebt een gratis retourproduct gewonnen!","text":"Wow! Je hebt 1 gratis retourproduct van je keuze gewonnen.","hasCode":true},
  {"id":"gratisverzend","label":"Gratis Verzending","icon":"🚚","color":"#FFD56B","textColor":"#2D3A2E","chance":5,"codePrefix":"FREESHIP-","title":"Je hebt gratis verzending gewonnen!","text":"Leuk! Je hebt gratis verzending op je volgende bestelling gewonnen.","hasCode":true},
  {"id":"niks","label":"Helaas!","icon":"😊","color":"#C5B6E5","textColor":"#fff","chance":93.5,"codePrefix":"","title":"Helaas, geen prijs deze keer!","text":"Geen zorgen — je kunt het altijd nog een keer proberen!","hasCode":false}
]'::jsonb) ON CONFLICT (id) DO NOTHING;

-- ═══ Insert default reset token ═══
INSERT INTO wheel_reset_token (id, token) VALUES (1, 'reset_initial') ON CONFLICT (id) DO NOTHING;

-- ═══ Realtime subscriptions (live updates) ═══
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE bids;
ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE community_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE wheel_coupons;
