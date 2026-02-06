'use strict';

var index = require('../utils/index.js');
var user = require('../validation/user.js');
var sessionAuth = require('../../../shared/utils/session-auth.js');

var authenticatedUser = {
    async getMe (ctx) {
        const userInfo = index.getService('user').sanitizeUser(ctx.state.user);
        ctx.body = {
            data: userInfo
        };
    },
    async updateMe (ctx) {
        const input = ctx.request.body;
        await user.validateProfileUpdateInput(input);
        const userService = index.getService('user');
        const authServer = index.getService('auth');
        const { currentPassword, ...userInfo } = input;
        if (currentPassword && userInfo.password) {
            const isValid = await authServer.validatePassword(currentPassword, ctx.state.user.password);
            if (!isValid) {
                return ctx.badRequest('ValidationError', {
                    currentPassword: [
                        'Invalid credentials'
                    ]
                });
            }
            // Invalidate all sessions when password changes for security
            const sessionManager = sessionAuth.getSessionManager();
            if (sessionManager && sessionManager.hasOrigin('admin')) {
                await sessionManager('admin').invalidateRefreshToken(String(ctx.state.user.id));
            }
        }
        const updatedUser = await userService.updateById(ctx.state.user.id, userInfo);
        ctx.body = {
            data: userService.sanitizeUser(updatedUser)
        };
    },
    async getOwnPermissions (ctx) {
        const { findUserPermissions, sanitizePermission } = index.getService('permission');
        const { user } = ctx.state;
        const userPermissions = await findUserPermissions(user);
        ctx.body = {
            // @ts-expect-error - transform response type to sanitized permission
            data: userPermissions.map(sanitizePermission)
        };
    }
};

module.exports = authenticatedUser;
//# sourceMappingURL=authenticated-user.js.map
