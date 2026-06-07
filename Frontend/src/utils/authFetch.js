// Module-level callback so any 401 response triggers logout without a page reload.
// App.jsx registers the handler once on mount via setUnauthorizedHandler().
let unauthorizedHandler = null;

export const setUnauthorizedHandler = (handler) => {
    unauthorizedHandler = handler;
};

const authFetch = async (url, options = {}) => {
    const token = localStorage.getItem("token");

    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    });

    if (response.status === 401) {
        localStorage.removeItem("token");
        if (unauthorizedHandler) unauthorizedHandler();
    }

    return response;
};

export default authFetch;
