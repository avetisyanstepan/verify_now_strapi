'use strict';

/**
 * activation controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::activation.activation');
