// @ts-check

export const API_BASE = '/api/v1';

let isAuthenticated = false;

export function setIsAuthenticated(val) {
    isAuthenticated = Boolean(val);
}

export function getIsAuthenticated() {
    return isAuthenticated;
}

const CACHE_TTL_MS = 3 * 60 * 1000;
const apiCache = new Map();

export const api = {
    /**
     * Cookies-only auth: tokens live in HttpOnly cookies managed by the browser.
     * No tokens are stored in JS memory or localStorage.
     * All requests use credentials: 'include' so the browser sends cookies automatically.
     */
    headers(json = true) {
        const h = {};
        if (json) h['Content-Type'] = 'application/json';
        return h;
    },
    async refreshAccessToken() {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        });
        return res.ok;
    },
    async request(method, path, body = null, allowRefresh = true) {
        const cacheKey = `${method}:${path}`;

        if (method === 'GET') {
            const cached = apiCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
                // If it's cached, we return a clone or exactly the same object
                // returning exactly the same object is fast, but just clone it if state mutants break it.
                // The prompt says caching is to prevent refetching. 
                return cached.data;
            }
        } else if (method !== 'GET') {
            apiCache.clear(); // invalidate cache on mutations
        }

        const opts = { method, headers: this.headers(), credentials: 'include' };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${API_BASE}${path}`, opts);

        if (res.status === 401) {
            const shouldTryRefresh = allowRefresh && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh') && !path.startsWith('/auth/me');
            if (shouldTryRefresh) {
                const refreshed = await this.refreshAccessToken().catch(() => false);
                if (refreshed) return this.request(method, path, body, false);
            }
            window.dispatchEvent(new CustomEvent('api:unauthorized'));
            throw new Error('No autorizado');
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Error ${res.status}`);
        }

        const data = res.status === 204 ? null : await res.json();

        if (method === 'GET' && data !== null) {
            apiCache.set(cacheKey, { data, timestamp: Date.now() });
        }

        return data;
    },
    get: (path) => api.request('GET', path),
    post: (path, body) => api.request('POST', path, body),
    put: (path, body) => api.request('PUT', path, body),
    del: (path, body = null) => api.request('DELETE', path, body),
};
