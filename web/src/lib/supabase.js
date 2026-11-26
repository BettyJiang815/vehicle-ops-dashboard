import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 没配数据库时不要在模块加载阶段就 createClient（会直接抛错），
// 交给页面走演示数据模式。
export const hasSupabase = Boolean(url && anonKey);

export const supabase = hasSupabase ? createClient(url, anonKey) : null;
