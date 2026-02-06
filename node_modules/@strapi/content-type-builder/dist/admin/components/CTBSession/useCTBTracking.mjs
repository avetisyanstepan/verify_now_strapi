import { useCallback } from 'react';
import { useTracking } from '@strapi/admin/strapi-admin';
import { useCTBSession } from './useCTBSession.mjs';

/**
 * Hook that provides tracking functionality with automatic CTB session ID inclusion.
 * This version accepts arbitrary event names (string) to allow feature-specific
 * events that are not yet declared in the central tracking typings.
 *
 * Note: this intentionally relaxes TypeScript restrictions so callers can
 * emit new tracking event names without needing to update the upstream
 * tracking type definitions. The session ID is merged into the properties
 * object before forwarding to the original tracking implementation.
 */ const useCTBTracking = ()=>{
    const { trackUsage: originalTrackUsage } = useTracking();
    const { sessionId } = useCTBSession();
    const trackUsage = useCallback((event, properties)=>{
        const enhancedProperties = {
            ...properties ?? {},
            ctbSessionId: sessionId
        };
        // Forward to original implementation. Casts are necessary because
        // originalTrackUsage has strict overloads for known event names.
        return originalTrackUsage(event, enhancedProperties);
    }, [
        originalTrackUsage,
        sessionId
    ]);
    return {
        trackUsage
    };
};

export { useCTBTracking };
//# sourceMappingURL=useCTBTracking.mjs.map
