import { NextResponse } from 'next/server';
import net from 'node:net';
import { getConfig } from '@/lib/config/env';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

function probe(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/**
 * GET /api/ready — readiness. Verifies the database opens and the IMAP/SMTP
 * ports are reachable. Reports only booleans, never configuration values.
 */
export async function GET() {
  const checks = { database: false, imap: false, smtp: false };
  try {
    const config = getConfig();
    getDb().prepare('SELECT 1').get();
    checks.database = true;
    if (config.provider === 'mock') {
      checks.imap = true;
      checks.smtp = true;
    } else {
      [checks.imap, checks.smtp] = await Promise.all([
        probe(config.imap.host, config.imap.port),
        probe(config.smtp.host, config.smtp.port),
      ]);
    }
  } catch {
    // reported below
  }
  const ready = Object.values(checks).every(Boolean);
  return NextResponse.json(
    { status: ready ? 'ready' : 'degraded', checks },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
