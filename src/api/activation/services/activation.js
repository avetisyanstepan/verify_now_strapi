'use strict';

/**
 * activation service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::activation.activation');
