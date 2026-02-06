import type { errors } from '@strapi/utils';
export type ApiError = errors.ApplicationError | errors.ForbiddenError | errors.NotFoundError | errors.NotImplementedError | errors.PaginationError | errors.PayloadTooLargeError | errors.PolicyError | errors.RateLimitError | errors.UnauthorizedError | errors.ValidationError | errors.YupValidationError;
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
 */
declare const setOnTokenUpdate: (callback: ((token: string) => void) | null) => void;
/**
 * Store the new token in the appropriate storage (localStorage or cookie)
 * and notify the app to update its state.
 *
 * Uses localStorage if the user selected "remember me" during login,
 * otherwise uses cookies for session-based storage.
 *
 * @param token - The JWT token to store
 * @internal Exported for testing purposes
 */
declare const storeToken: (token: string) => void;
/**
 * Attempt to refresh the token if not already refreshing.
 * Uses a module-level promise to prevent concurrent refresh requests.
 *
 * @returns The new authentication token
 * @throws {Error} If the token refresh fails (e.g., refresh token expired)
 * @internal Exported for testing purposes
 */
declare const attemptTokenRefresh: () => Promise<string>;
type FetchResponse<TData = any> = {
    data: TData;
    status?: number;
};
type FetchOptions = {
    params?: any;
    signal?: AbortSignal;
    headers?: Record<string, string>;
    validateStatus?: ((status: number) => boolean) | null;
};
type FetchConfig = {
    signal?: AbortSignal;
};
interface ErrorResponse {
    data: {
        data?: any;
        error: ApiError & {
            status?: number;
        };
    };
}
declare class FetchError extends Error {
    name: string;
    message: string;
    response?: ErrorResponse;
    code?: number;
    status?: number;
    constructor(message: string, response?: ErrorResponse);
}
declare const isFetchError: (error: unknown) => error is FetchError;
type FetchClient = {
    get: <TData = any>(url: string, config?: FetchOptions) => Promise<FetchResponse<TData>>;
    put: <TData = any, TSend = any>(url: string, data?: TSend, config?: FetchOptions) => Promise<FetchResponse<TData>>;
    post: <TData = any, TSend = any>(url: string, data?: TSend, config?: FetchOptions) => Promise<FetchResponse<TData>>;
    del: <TData = any>(url: string, config?: FetchOptions) => Promise<FetchResponse<TData>>;
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
 */
declare const getFetchClient: (defaultOptions?: FetchConfig) => FetchClient;
export { getFetchClient, isFetchError, FetchError, attemptTokenRefresh, storeToken, setOnTokenUpdate, };
export type { FetchOptions, FetchResponse, FetchConfig, FetchClient, ErrorResponse };
