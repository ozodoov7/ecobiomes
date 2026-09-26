const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) {
  console.error('SESSION_SECRET must be set in .env (at least 32 characters) in production.');
  process.exit(1);
}

module.exports = {
  root: ROOT,
  isProd,
  port: parseInt(env.PORT || '3000', 10),
  trustProxy: env.TRUST_PROXY === '1',
  sessionSecret: env.SESSION_SECRET || 'dev-only-secret-change-me-dev-only-secret',
  sessionHours: parseFloat(env.SESSION_HOURS || '8'),
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : isProd,
  dbPath: path.resolve(ROOT, env.DB_PATH || 'data/ecobiome.sqlite'),
  uploadsDir: path.resolve(ROOT, env.UPLOADS_DIR || 'uploads'),
  backupsDir: path.resolve(ROOT, env.BACKUPS_DIR || 'backups'),
  maxUploadMb: parseFloat(env.MAX_UPLOAD_MB || '10'),
  backup: {
    auto: env.BACKUP_AUTO !== '0',                          // daily backup inside the app (no cron needed)
    hour: Math.min(23, Math.max(0, parseInt(env.BACKUP_HOUR || '3', 10))),
    keep: Math.max(1, parseInt(env.BACKUP_KEEP || '14', 10)),   // local copies kept on the server
    offsiteRemote: (env.OFFSITE_REMOTE || '').trim(),       // rclone remote, e.g. gdrive:ecobiome-backups
    offsiteKeepDays: Math.max(1, parseInt(env.OFFSITE_KEEP_DAYS || '90', 10)),
    rcloneBin: env.RCLONE_BIN || 'rclone',
    rcloneConfig: env.RCLONE_CONFIG ? path.resolve(ROOT, env.RCLONE_CONFIG) : '',
  },
  maxImportMb: parseFloat(env.MAX_IMPORT_MB || '500'),
  login: {
    maxAccountAttempts: parseInt(env.LOGIN_MAX_ATTEMPTS || '5', 10),
    lockMinutes: parseInt(env.LOGIN_LOCK_MINUTES || '15', 10),
    maxIpAttempts: parseInt(env.LOGIN_MAX_IP_ATTEMPTS || '20', 10),
  },
};
