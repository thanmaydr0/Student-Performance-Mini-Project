// ============================================================
// Scholarly Monograph — API & Auth Configuration
// Uses Supabase JS SDK for authentication
// ============================================================

const SUPABASE_URL = "https://urfpepugxvbcxxcdxicp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZnBlcHVneHZiY3h4Y2R4aWNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NzM3ODgsImV4cCI6MjA5MjE0OTc4OH0.jYKnQIfQvGCLYIRRyXhmAkzYZ1cFgtDplcGZ_9bO9hU";
const BACKEND_URL = "https://scholarly-backend-p201.onrender.com";

// --- Supabase Client (loaded from CDN in HTML) ---
// The global `supabase` object is created after the SDK script loads.
let _supabaseClient = null;

function getSupabaseClient() {
  if (!_supabaseClient) {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      _supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      console.error("Supabase JS SDK not loaded. Make sure the CDN script is included before api-config.js");
      return null;
    }
  }
  return _supabaseClient;
}

// --- API Endpoints (non-auth, e.g. backend proxy for AI chat) ---
const API = {
  base: `${SUPABASE_URL}/functions/v1`,

  chat: {
    jarvis: `${SUPABASE_URL}/functions/v1/jarvis-chat`,
    aria: `${SUPABASE_URL}/functions/v1/aria-chat`,
  },

  uploads: {
    analyze: `${BACKEND_URL}/api/uploads/analyze`,
    recent: `${BACKEND_URL}/api/uploads/recent`,
    get: (id) => `${BACKEND_URL}/api/uploads/${id}`,
  },

  marks: `${SUPABASE_URL}/functions/v1/marks`,
  students: `${SUPABASE_URL}/functions/v1/students`,
};

// --- Headers for non-auth API calls ---
async function getHeaders(includeAuth = true) {
  const headers = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_ANON_KEY,
  };

  if (includeAuth) {
    const sb = getSupabaseClient();
    if (sb) {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
    }
  }

  return headers;
}

// --- Helper function for non-auth API calls ---
async function apiCall(url, options = {}) {
  const defaultHeaders = await getHeaders();

  const mergedOptions = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
  };

  try {
    const response = await fetch(url, mergedOptions);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API call failed [${url}]:`, error.message);
    throw error;
  }
}

// --- Auth Helpers (Supabase-based) ---

async function isAuthenticated() {
  const sb = getSupabaseClient();
  if (!sb) return false;
  const { data: { session } } = await sb.auth.getSession();
  return !!session;
}

async function getAuth() {
  const sb = getSupabaseClient();
  if (!sb) return { user: null, role: null, name: null };

  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { user: null, role: null, name: null };

  const user = session.user;
  return {
    user: user,
    token: session.access_token,
    role: user.user_metadata?.role || 'student',
    name: user.user_metadata?.full_name || 'User',
    email: user.email,
  };
}

async function signOut() {
  const sb = getSupabaseClient();
  if (sb) {
    await sb.auth.signOut();
  }
  window.location.href = 'index.html';
}
