declare const getTokenOptions: () => {
    secret: string;
    options: {
        expiresIn: string;
    } & {
        [key: string]: unknown;
        expiresIn?: string | number | undefined;
    };
};
/**
 * Create a random token
 */
declare const createToken: () => string;
declare const checkSecretIsDefined: () => void;
export { createToken, getTokenOptions, checkSecretIsDefined };
/**
 * Convert an expiresIn value (string or number) into seconds.
 * Supported formats:
 * - number: treated as seconds
 * - numeric string (e.g. "180"): treated as seconds
 * - shorthand string: "Xs", "Xm", "Xh", "Xd", "Xw" (case-insensitive)
 * Returns undefined when value is not set or invalid.
 */
export declare const expiresInToSeconds: (expiresIn: unknown) => number | undefined;
//# sourceMappingURL=token.d.ts.map