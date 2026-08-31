import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let currentUrl: string | null = null;
let currentKey: string | null = null;

export const getSupabaseClient = (url?: string, anonKey?: string): SupabaseClient | null => {
  const targetUrl = url || currentUrl || (typeof window !== 'undefined' && window.localStorage ? localStorage.getItem('snap_supabase_url') : null);
  const targetKey = anonKey || currentKey || (typeof window !== 'undefined' && window.localStorage ? localStorage.getItem('snap_supabase_anon_key') : null);

  if (!targetUrl || !targetKey) {
    return null;
  }

  const cleanUrl = targetUrl.trim().replace(/\/$/, '');
  const cleanKey = targetKey.trim();

  if (cachedClient && currentUrl === cleanUrl && currentKey === cleanKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(cleanUrl, cleanKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    currentUrl = cleanUrl;
    currentKey = cleanKey;
    return cachedClient;
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
    return null;
  }
};

export const setSupabaseCredentials = (url: string, anonKey: string): void => {
  const cleanUrl = url.trim().replace(/\/$/, '');
  const cleanKey = anonKey.trim();
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('snap_supabase_url', cleanUrl);
    localStorage.setItem('snap_supabase_anon_key', cleanKey);
  }
  currentUrl = cleanUrl;
  currentKey = cleanKey;
  cachedClient = null;
};

export const clearSupabaseCredentials = (): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem('snap_supabase_url');
    localStorage.removeItem('snap_supabase_anon_key');
  }
  currentUrl = null;
  currentKey = null;
  cachedClient = null;
};
