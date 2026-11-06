import { createHandler, json, readJson } from '@/lib/api/handler';
import { getProvider } from '@/lib/mail';
import { folderPath, folderName } from '@/lib/api/validate';
import { errors } from '@/lib/api/errors';

/** GET /api/folders — folder tree with unread counts and role mapping. */
export const GET = createHandler(async ({ session }) => {
  const provider = await getProvider(session);
  const result = await provider.listFolders();
  return json(result);
});

/** POST /api/folders — body { name, parent? } creates a folder. */
export const POST = createHandler(async ({ session, request }) => {
  const body = await readJson(request);
  const name = folderName(body.name);
  const parent = folderPath(body.parent, { required: false });
  const provider = await getProvider(session);
  let path = name;
  if (parent) {
    const { folders } = await provider.listFolders();
    const parentFolder = folders.find((f) => f.path === parent);
    if (!parentFolder) throw errors.notFound('Parent folder not found.');
    path = `${parent}${parentFolder.delimiter || '/'}${name}`;
  }
  const created = await provider.createFolder(path);
  return json({ path: created }, { status: 201 });
});

/** PATCH /api/folders — body { path, name } renames a folder. */
export const PATCH = createHandler(async ({ session, request }) => {
  const body = await readJson(request);
  const path = folderPath(body.path);
  const name = folderName(body.name);
  if (path.toUpperCase() === 'INBOX') throw errors.badRequest('The Inbox cannot be renamed.');
  const provider = await getProvider(session);
  const { folders } = await provider.listFolders();
  const folder = folders.find((f) => f.path === path);
  if (!folder) throw errors.notFound('Folder not found.');
  if (folder.role) throw errors.badRequest('System folders cannot be renamed.');
  const newPath = folder.parentPath ? `${folder.parentPath}${folder.delimiter}${name}` : name;
  const renamed = await provider.renameFolder(path, newPath);
  return json({ path: renamed });
});

/** DELETE /api/folders — body { path } deletes a custom folder. */
export const DELETE = createHandler(async ({ session, request }) => {
  const body = await readJson(request);
  const path = folderPath(body.path);
  const provider = await getProvider(session);
  const { folders } = await provider.listFolders();
  const folder = folders.find((f) => f.path === path);
  if (!folder) throw errors.notFound('Folder not found.');
  if (folder.role) throw errors.badRequest('System folders cannot be deleted.');
  await provider.deleteFolder(path);
  return json({ ok: true });
});
