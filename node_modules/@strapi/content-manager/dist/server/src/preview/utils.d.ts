import type { Core } from '@strapi/types';
type PreviewServices = typeof import('./services').services;
declare function getService<T extends keyof PreviewServices>(strapi: Core.Strapi, name: T): ReturnType<{
    preview: ({ strapi }: {
        strapi: Core.Strapi;
    }) => {
        getPreviewUrl(uid: import("@strapi/types/dist/uid").ContentType, params: import("./services/preview-config").HandlerParams): Promise<string | null | undefined>;
    };
    'preview-config': ({ strapi }: {
        strapi: Core.Strapi;
    }) => {
        register(): void;
        isConfigured(): boolean;
        isEnabled(): boolean;
        validate(): void;
        getPreviewHandler(): (uid: string, params: import("@strapi/types/dist/core/config/admin").PreviewHandlerParams) => string | null | undefined;
    };
}[T]>;
export { getService };
//# sourceMappingURL=utils.d.ts.map