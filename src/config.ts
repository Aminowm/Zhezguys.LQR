// Cloud accounts (Supabase). Both values are public by design: the publishable key
// only works together with the Row Level Security rules in supabase/schema.sql.
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time override them.
export const SUPABASE = {
  url: "https://zsxtsbsdczeqhcebuwwq.supabase.co",
  publishableKey: "sb_publishable_qjHInsxblGmMRWYqrzvA2A_5IoP6fJ9",
};

// Team links shown in the footer.
export const SOCIAL = {
  instagram: "https://www.instagram.com/first.zhezguys/",
  tiktok: "https://www.tiktok.com/@zhez_guys",
};
