import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Shared test environment: mock mail provider, isolated SQLite database and
 * upload directory per test run so tests never touch real servers or data.
 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webmail-test-'));
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.MAIL_PROVIDER = 'mock';
process.env.SESSION_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
process.env.APP_URL = 'http://localhost:3000';
process.env.DATABASE_PATH = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.LOG_LEVEL = 'silent';
process.env.LOG_FORMAT = 'json';
process.env.ADMIN_EMAILS = 'test@example.com';
process.env.MAIL_IMAP_HOST = 'imap.test';
process.env.MAIL_SMTP_HOST = 'smtp.test';
