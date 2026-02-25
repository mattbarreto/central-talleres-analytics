export const API_BASE = '/api/v1';

let isAuthenticated = false;

export function setIsAuthenticated(val) {
    isAuthenticated = Boolean(val);
}

export function getIsAuthenticated() {
    return isAuthenticated;
}

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
        return res.status === 204 ? null : res.json();
    },
    get: (path) => api.request('GET', path),
    post: (path, body) => api.request('POST', path, body),
    put: (path, body) => api.request('PUT', path, body),
    del: (path) => api.request('DELETE', path),
};
