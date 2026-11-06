import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getConfig } from '@/lib/config/env';
import { sanitizeFilename } from '@/lib/security/filename';
import { detectContentType, isBlockedExtension } from '@/lib/security/mime';
import { errors } from '@/lib/api/errors';
import { logger } from '@/lib/logger';

/**
 * Temporary storage for compose attachments. Files are written under
 * UPLOAD_DIR/<session id>/<random id> so that one session can never address
 * another session's uploads, and are removed after sending or after 24h.
 */

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const ID_RE = /^[a-f0-9]{32}$/;

function uploadRoot() {
  return path.resolve(process.cwd(), getConfig().storage.uploadDir);
}

function sessionDir(sessionId) {
  if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) throw errors.badRequest();
  return path.join(uploadRoot(), sessionId);
}

/**
 * Stores an uploaded file, validating its size and detected content type.
 * @param {string} sessionId
 * @param {{ name: string, declaredType: string, stream: ReadableStream | null, size: number }} file
 */
export async function storeUpload(sessionId, file) {
  const { maxAttachmentBytes } = getConfig().limits;
  const filename = sanitizeFilename(file.name);
  if (isBlockedExtension(filename)) {
    throw errors.badRequest(`Files of type ".${filename.split('.').pop()}" cannot be attached.`);
  }
  if (file.size > maxAttachmentBytes) {
    throw errors.tooLarge(
      `Attachments must be smaller than ${Math.round(maxAttachmentBytes / 1024 / 1024)} MB.`
    );
  }

  const dir = sessionDir(sessionId);
  await fsp.mkdir(dir, { recursive: true });
  const id = crypto.randomBytes(16).toString('hex');
  const filePath = path.join(dir, id);

  let written = 0;
  let head = Buffer.alloc(0);
  const out = fs.createWriteStream(filePath, { flags: 'wx', mode: 0o600 });
  try {
    if (!file.stream) throw errors.badRequest('Empty upload.');
    const reader = file.stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      written += value.byteLength;
      if (written > maxAttachmentBytes) {
        reader.cancel().catch(() => {});
        throw errors.tooLarge(
          `Attachments must be smaller than ${Math.round(maxAttachmentBytes / 1024 / 1024)} MB.`
        );
      }
      if (head.length < 4100) head = Buffer.concat([head, Buffer.from(value)]).subarray(0, 4100);
      if (!out.write(Buffer.from(value))) {
        await new Promise((resolve) => out.once('drain', resolve));
      }
    }
    await new Promise((resolve, reject) => {
      out.end(resolve);
      out.on('error', reject);
    });
  } catch (error) {
    out.destroy();
    await fsp.unlink(filePath).catch(() => {});
    throw error;
  }

  const contentType = await detectContentType(head, file.declaredType);
  const meta = { id, filename, contentType, size: written, createdAt: Date.now() };
  await fsp.writeFile(`${filePath}.json`, JSON.stringify(meta), { mode: 0o600 });
  return meta;
}

/** Returns metadata + a readable stream for a stored upload. */
export async function openUpload(sessionId, id) {
  if (!ID_RE.test(id)) throw errors.notFound('Attachment not found.');
  const filePath = path.join(sessionDir(sessionId), id);
  let meta;
  try {
    meta = JSON.parse(await fsp.readFile(`${filePath}.json`, 'utf8'));
  } catch {
    throw errors.notFound('Attachment not found. It may have expired — please attach it again.');
  }
  return { meta, stream: fs.createReadStream(filePath), path: filePath };
}

export async function deleteUpload(sessionId, id) {
  if (!ID_RE.test(id)) return false;
  const filePath = path.join(sessionDir(sessionId), id);
  await Promise.all([
    fsp.unlink(filePath).catch(() => {}),
    fsp.unlink(`${filePath}.json`).catch(() => {}),
  ]);
  return true;
}

/** Removes expired uploads. Called opportunistically from upload requests. */
export async function cleanupUploads() {
  const root = uploadRoot();
  let removed = 0;
  let dirs = [];
  try {
    dirs = await fsp.readdir(root);
  } catch {
    return 0;
  }
  const now = Date.now();
  for (const dir of dirs) {
    const full = path.join(root, dir);
    let files = [];
    try {
      files = await fsp.readdir(full);
    } catch {
      continue;
    }
    for (const file of files) {
      const p = path.join(full, file);
      try {
        const stat = await fsp.stat(p);
        if (now - stat.mtimeMs > UPLOAD_TTL_MS) {
          await fsp.unlink(p);
          removed += 1;
        }
      } catch {
        // ignore
      }
    }
    const remaining = await fsp.readdir(full).catch(() => ['x']);
    if (remaining.length === 0) await fsp.rmdir(full).catch(() => {});
  }
  if (removed) logger.info({ operation: 'uploads.cleanup', removed }, 'removed expired uploads');
  return removed;
}
