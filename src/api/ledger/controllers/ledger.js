'use strict';

/**
 * ledger controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::ledger.ledger');
