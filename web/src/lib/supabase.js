import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // 构建期就报出来，别等页面白屏才发现没配 env
  console.error("缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，请参考 .env.example");
}

export const supabase = createClient(url || "", anonKey || "");
