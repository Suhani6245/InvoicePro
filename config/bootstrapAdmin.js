const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * On server startup, ensures at least one admin account exists.
 * Uses ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD from .env.
 * Safe to run every time the server starts - it's a no-op if an admin already exists.
 */
const bootstrapAdmin = async () => {
  try {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount > 0) return;

    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
      logger.warn(
        'No admin account exists and ADMIN_NAME/ADMIN_EMAIL/ADMIN_PASSWORD are not set. ' +
          'Register the first admin via POST /api/auth/register.'
      );
      return;
    }

    await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
    });

    logger.info(`Bootstrap admin account created for ${ADMIN_EMAIL}. Please log in and change the password.`);
  } catch (err) {
    logger.error(`Failed to bootstrap admin account: ${err.message}`);
  }
};

module.exports = bootstrapAdmin;
