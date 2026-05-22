import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// null when env vars are absent (local dev without auth configured)
export const supabase = url && key ? createClient(url, key) : null;
