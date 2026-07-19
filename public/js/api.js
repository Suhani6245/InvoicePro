/* global window */
(function () {
  const TOKEN_KEY = 'invoicepro_token';
  const USER_KEY = 'invoicepro_user';

  const Auth = {
    getToken: () => localStorage.getItem(TOKEN_KEY),
    setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
    clearToken: () => localStorage.removeItem(TOKEN_KEY),
    getUser: () => {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    setUser: (user) => localStorage.setItem(USER_KEY, JSON.stringify(user)),
    clearUser: () => localStorage.removeItem(USER_KEY),
    isLoggedIn: () => !!localStorage.getItem(TOKEN_KEY),
    logoutLocal: () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },
  };

  /**
   * Core fetch wrapper. Attaches the JWT, parses JSON, and throws a
   * normalized Error (with .status and .data) on any non-2xx response.
   */
  async function apiRequest(path, { method = 'GET', body, params, rawResponse = false } = {}) {
    let url = path.startsWith('http') ? path : path;
    if (params) {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ).toString();
      if (query) url += (url.includes('?') ? '&' : '?') + query;
    }

    const headers = {};
    const token = Auth.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let fetchBody;
    if (body instanceof FormData) {
      fetchBody = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(body);
    }

    const res = await fetch(url, { method, headers, body: fetchBody });

    if (rawResponse) return res;

    let json = null;
    try {
      json = await res.json();
    } catch (e) {
      // non-JSON response (shouldn't normally happen on this API)
    }

    if (!res.ok) {
      const err = new Error((json && json.message) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = json;
      if (res.status === 401 && token) {
        // Only a *previously valid* session can "expire" - a 401 on a request
        // that never had a token (e.g. a failed login/register attempt) is
        // just a normal auth error and should be shown inline instead.
        Auth.logoutLocal();
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      throw err;
    }

    return json;
  }

  window.Auth = Auth;
  window.api = apiRequest;
})();
