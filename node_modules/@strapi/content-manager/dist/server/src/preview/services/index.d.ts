export declare const services: {
    preview: ({ strapi }: {
        strapi: import("@strapi/types/dist/core").Strapi;
    }) => {
        getPreviewUrl(uid: import("@strapi/types/dist/uid").ContentType, params: import("./preview-config").HandlerParams): Promise<string | null | undefined>;
    };
    'preview-config': ({ strapi }: {
        strapi: import("@strapi/types/dist/core").Strapi;
    }) => {
        register(): void;
        isConfigured(): boolean;
        isEnabled(): boolean;
        validate(): void;
        getPreviewHandler(): (uid: string, params: import("@strapi/types/dist/core/config/admin").PreviewHandlerParams) => string | null | undefined;
    };
};
//# sourceMappingURL=index.d.ts.map