/**
 * AIX Nova - Admin Seed Script
 *
 * Usage: node scripts/seedAdmin.js
 *
 * Creates a default super admin account using values from config.
 * If no values are set in .env, secure random values are auto-generated.
 * Run this after setting up your .env file.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const crypto = require('crypto');
const Admin = require('../models/Admin');
const logger = require('../services/logger');

const seedAdmin = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || mongoUri === 'YOUR_MONGODB_URI') {
    console.error('ERROR: MONGODB_URI is not configured.');
    console.error('Set it in server/.env before running this script.');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');

    // Use env values or auto-generate secure defaults
    const username = process.env.ADMIN_USERNAME || `admin_${crypto.randomBytes(4).toString('hex')}`;
    const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(24).toString('base64url');
    const email = process.env.ADMIN_EMAIL || 'admin@aixnova.com';

    // Check if any admin already exists
    const existing = await Admin.findOne({ username });
    if (existing) {
      logger.info(`Admin '${username}' already exists.`);
      await mongoose.connection.close();
      process.exit(0);
    }

    // Create super admin
    const admin = await Admin.create({
      username,
      password,
      email,
      role: 'super',
      permissions: {
        canManageUsers: true,
        canManageAdmins: true,
        canBroadcast: true,
        canViewLogs: true,
        canViewAnalytics: true,
        canManageSettings: true,
      },
    });

    logger.info('──────────────────────────────────────────────');
    logger.info('  Super admin created successfully!');
    logger.info('  Username: ' + admin.username);
    logger.info('  Password: ' + password);
    logger.info('  Email:    ' + admin.email);
    logger.info('  Role:     ' + admin.role);
    logger.info('──────────────────────────────────────────────');
    logger.warn('  SAVE THESE CREDENTIALS somewhere safe!');
    logger.warn('  You will need them to log into the admin panel.');
    logger.info('──────────────────────────────────────────────');

    await mongoose.connection.close();
    logger.info('MongoDB connection closed.');
    process.exit(0);
  } catch (error) {
    logger.error('Failed to seed admin:', error);
    process.exit(1);
  }
};

seedAdmin();
