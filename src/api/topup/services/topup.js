'use strict';

/**
 * topup service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::topup.topup');
