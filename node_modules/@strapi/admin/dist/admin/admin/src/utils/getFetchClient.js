'use strict';

var pipe = require('lodash/fp/pipe');
var qs = require('qs');
var cookies = require('./cookies.js');

const STORAGE_KEYS = {
    TOKEN: 'jwtToken',
    USER: 'userInfo'
};
/**
 * Module-level promise to ensure only one token refresh happens at a time
 */ let refreshPromise = null;
/**
 * Callback to notify the app when the token is updated (e.g., to update Redux state)
 */ let onTokenUpdate = null;
/**
 * Set the callback that will be called when the token is refreshed.
 * This allows the React layer to update Redux state when a token refresh occurs.
 *
 * @param callback - Function to call with the new token, or null to clear
 * @example
 * // In a React component
 * useEffect(() => {
 *   setOnTokenUpdate((token) => dispatch(setToken(token)));
 *   return () => setOnTokenUpdate(null);
 * }, [dispatch]);
 */ const setOnTokenUpdate = (callback)=>{
    onTokenUpdate = callback;
};
/**
 * Check if the URL is an auth path that should not trigger token refresh.
 * Note: No ^ anchor since the URL may include the baseURL prefix (e.g., "http://localhost:1337/admin/login").
 * This differs from baseQuery.ts which uses ^/admin since it receives normalized paths.
 */ const isAuthPath = (url)=>/\/admin\/(login|logout|access-token)\b/.test(url);
/**
 * Store the new token in the appropriate storage (localStorage or cookie)
 * and notify the app to update its state.
 *
 * Uses localStorage if the user selected "remember me" during login,
 * otherwise uses cookies for session-based storage.
 *
 * @param token - The JWT token to store
 * @internal Exported for testing purposes
 */ const storeToken = (token)=>{
    // Check if the original token was stored in localStorage (persist mode)
    const wasPersistedToLocalStorage = Boolean(localStorage.getItem(STORAGE_KEYS.TOKEN));
    if (wasPersistedToLocalStorage) {
        localStorage.setItem(STORAGE_KEYS.TOKEN, JSON.stringify(token));
    } else {
        cookies.setCookie(STORAGE_KEYS.TOKEN, token);
    }
    // Notify the app to update its state (e.g., Redux)
    if (onTokenUpdate) {
        onTokenUpdate(token);
    }
};
/**
 * Refresh the access token by calling the /admin/access-token endpoint.
 * This uses a low-level fetch to avoid recursion through the interceptor.
 * Returns the new token on success, or null on failure.
 */ const refreshAccessToken = async ()=>{
    const backendURL = window.strapi.backendURL;
    try {
        const response = await fetch(`${backendURL}/admin/access-token`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            console.warn('[Auth] Token refresh failed with status:', response.status);
            return null;
        }
        const result = await response.json();
        const token = result?.data?.token;
        if (!token) {
            console.warn('[Auth] Token refresh response missing token');
            return null;
        }
        storeToken(token);
        return token;
    } catch (error) {
        console.error('[Auth] Token refresh error:', error);
        return null;
    }
};
/**
 * Attempt to refresh the token if not already refreshing.
 * Uses a module-level promise to prevent concurrent refresh requests.
 *
 * @returns The new authentication token
 * @throws {Error} If the token refresh fails (e.g., refresh token expired)
 * @internal Exported for testing purposes
 */ const attemptTokenRefresh = async ()=>{
    if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(()=>{
            refreshPromise = null;
        });
    }
    const newToken = await refreshPromise;
    if (!newToken) {
        const error = new Error('Session expired. Please log in again.');
        error.name = 'TokenRefreshError';
        throw error;
    }
    return newToken;
};
class FetchError extends Error {
    constructor(message, response){
        super(message);
        this.name = 'FetchError';
        this.message = message;
        this.response = response;
        this.code = response?.data?.error?.status;
        this.status = response?.data?.error?.status;
        // Ensure correct stack trace in error object
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, FetchError);
        }
    }
}
const isFetchError = (error)=>{
    return error instanceof FetchError;
};
const getToken = ()=>{
    const fromLocalStorage = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (fromLocalStorage) {
        return JSON.parse(fromLocalStorage);
    }
    const fromCookie = cookies.getCookieValue(STORAGE_KEYS.TOKEN);
    return fromCookie ?? null;
};
/**
 * @public
 * @param {FetchConfig} [defaultOptions={}] - Fetch Configs.
 * @returns {FetchClient} A fetch client object with methods for making HTTP requests.
 * @description This is an abstraction around the native fetch exposed by a function. It provides a simple interface to handle API calls
 * to the Strapi backend.
 * @example
 * ```tsx
 * import { getFetchClient } from '@strapi/admin/admin';
 *
 * const myFunct = () => {
 *   const { get } = getFetchClient();
 *   const requestURL = "/some-endpoint";
 *
 *   const { data } = await get(requestURL);
 *
 *   return data;
 * };
 * ```
 */ const getFetchClient = (defaultOptions = {})=>{
    const backendURL = window.strapi.backendURL;
    /**
   * Create default headers with the current token.
   * This is a function so we can get a fresh token after refresh.
   */ const getDefaultHeaders = ()=>({
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`
        });
    const isFormDataRequest = (body)=>body instanceof FormData;
    const addPrependingSlash = (url)=>url.charAt(0) !== '/' ? `/${url}` : url;
    // This regular expression matches a string that starts with either "http://" or "https://" or any other protocol name in lower case letters, followed by "://" and ends with anything else
    const hasProtocol = (url)=>new RegExp('^(?:[a-z+]+:)?//', 'i').test(url);
    // Check if the url has a prepending slash, if not add a slash
    const normalizeUrl = (url)=>hasProtocol(url) ? url : addPrependingSlash(url);
    // Add a response interceptor to return the response
    const responseInterceptor = async (response, validateStatus)=>{
        try {
            const result = await response.json();
            /**
       * validateStatus allows us to customize when a response should throw an error
       * In native Fetch API, a response is considered "not ok"
       * when the status code falls in the 200 to 299 (inclusive) range
       */ if (!response.ok && result.error && !validateStatus?.(response.status)) {
                const fetchError = new FetchError(result.error.message, {
                    data: result
                });
                fetchError.status = response.status;
                throw fetchError;
            }
            if (!response.ok && !validateStatus?.(response.status)) {
                const fetchError = new FetchError('Unknown Server Error');
                fetchError.status = response.status;
                throw fetchError;
            }
            return {
                data: result
            };
        } catch (error) {
            if (error instanceof SyntaxError && response.ok) {
                // Making sure that a SyntaxError doesn't throw if it's successful
                return {
                    data: [],
                    status: response.status
                };
            } else {
                throw error;
            }
        }
    };
    /**
   * Execute a fetch request with automatic token refresh on 401 errors.
   * @param url - The request URL (used to check if it's an auth path)
   * @param executeRequest - Function that performs the fetch (called again on retry with fresh headers)
   */ const withTokenRefresh = async (url, executeRequest)=>{
        try {
            return await executeRequest();
        } catch (error) {
            // Only attempt refresh for 401 errors on non-auth paths
            if (isFetchError(error) && error.status === 401 && !isAuthPath(url)) {
                try {
                    await attemptTokenRefresh();
                    // Retry - executeRequest will call getDefaultHeaders() again, picking up the new token
                    return await executeRequest();
                } catch  {
                    // If refresh fails, throw the original error
                    throw error;
                }
            }
            throw error;
        }
    };
    const paramsSerializer = (params)=>(url)=>{
            if (params) {
                if (typeof params === 'string') {
                    return `${url}?${params}`;
                }
                /**
         * TODO V6: Encoding should be enabled in this step
         * So the rest of the app doesn't have to worry about it,
         * It's considered a breaking change because it impacts any API request, including the user's custom code
         */ const serializedParams = qs.stringify(params, {
                    encode: false
                });
                return `${url}?${serializedParams}`;
            }
            return url;
        };
    const addBaseUrl = (url)=>{
        return `${backendURL}${url}`;
    };
    /**
   * We use the factory method because the options
   * are unique to the individual request
   */ const makeCreateRequestUrl = (options)=>pipe(normalizeUrl, addBaseUrl, paramsSerializer(options?.params));
    const fetchClient = {
        get: async (url, options)=>{
            const createRequestUrl = makeCreateRequestUrl(options);
            const executeRequest = async ()=>{
                const headers = new Headers({
                    ...getDefaultHeaders(),
                    ...options?.headers
                });
                const response = await fetch(createRequestUrl(url), {
                    signal: options?.signal ?? defaultOptions.signal,
                    method: 'GET',
                    headers
                });
                return responseInterceptor(response, options?.validateStatus);
            };
            return withTokenRefresh(url, executeRequest);
        },
        post: async (url, data, options)=>{
            const createRequestUrl = makeCreateRequestUrl(options);
            const executeRequest = async ()=>{
                const headers = new Headers({
                    ...getDefaultHeaders(),
                    ...options?.headers
                });
                /**
         * we have to remove the Content-Type value if it was a formData request
         * the browser will automatically set the header value
         */ if (isFormDataRequest(data)) {
                    headers.delete('Content-Type');
                }
                const response = await fetch(createRequestUrl(url), {
                    signal: options?.signal ?? defaultOptions.signal,
                    method: 'POST',
                    headers,
                    body: isFormDataRequest(data) ? data : JSON.stringify(data)
                });
                return responseInterceptor(response, options?.validateStatus);
            };
            return withTokenRefresh(url, executeRequest);
        },
        put: async (url, data, options)=>{
            const createRequestUrl = makeCreateRequestUrl(options);
            const executeRequest = async ()=>{
                const headers = new Headers({
                    ...getDefaultHeaders(),
                    ...options?.headers
                });
                /**
         * we have to remove the Content-Type value if it was a formData request
         * the browser will automatically set the header value
         */ if (isFormDataRequest(data)) {
                    headers.delete('Content-Type');
                }
                const response = await fetch(createRequestUrl(url), {
                    signal: options?.signal ?? defaultOptions.signal,
                    method: 'PUT',
                    headers,
                    body: isFormDataRequest(data) ? data : JSON.stringify(data)
                });
                return responseInterceptor(response, options?.validateStatus);
            };
            return withTokenRefresh(url, executeRequest);
        },
        del: async (url, options)=>{
            const createRequestUrl = makeCreateRequestUrl(options);
            const executeRequest = async ()=>{
                const headers = new Headers({
                    ...getDefaultHeaders(),
                    ...options?.headers
                });
                const response = await fetch(createRequestUrl(url), {
                    signal: options?.signal ?? defaultOptions.signal,
                    method: 'DELETE',
                    headers
                });
                return responseInterceptor(response, options?.validateStatus);
            };
            return withTokenRefresh(url, executeRequest);
        }
    };
    return fetchClient;
};

exports.FetchError = FetchError;
exports.attemptTokenRefresh = attemptTokenRefresh;
exports.getFetchClient = getFetchClient;
exports.isFetchError = isFetchError;
exports.setOnTokenUpdate = setOnTokenUpdate;
exports.storeToken = storeToken;
//# sourceMappingURL=getFetchClient.js.map
