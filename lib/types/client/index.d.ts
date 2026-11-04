/**
 * Browser half of dsh-session-tabs. The runtime loads `lib/client.js` through
 * the client module loader; these declarations only document its exports.
 */
/** Services required before the tab strip mounts. */
export declare const inject: string[];
/** Mount the session tab strip. */
export declare function apply(ctx: unknown): void;
