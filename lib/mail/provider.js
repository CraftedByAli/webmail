/**
 * MailProvider — the contract the API layer and UI depend on.
 *
 * Implementations: {@link ImapSmtpProvider} (generic IMAP/SMTP, used for
 * Mailcow) and {@link MockMailProvider} (in-memory, tests only). Adding a
 * Google Workspace / Microsoft 365 provider later means implementing this
 * class; nothing in the frontend needs to change.
 *
 * All methods are bound to a single authenticated mailbox. Every method may
 * throw an {@link AppError}; anything else is treated as an internal error.
 */
export class MailProvider {
  /** @param {{ user: string, pass: string }} credentials */
  constructor(credentials) {
    this.credentials = credentials;
    this.email = credentials.user.toLowerCase();
  }

  /** Verifies credentials. Static because no session exists yet. */

  static async authenticate(credentials) {
    throw new Error('not implemented');
  }

  async listFolders() {
    throw new Error('not implemented');
  }

  async createFolder(path) {
    throw new Error('not implemented');
  }

  async renameFolder(path, newPath) {
    throw new Error('not implemented');
  }

  async deleteFolder(path) {
    throw new Error('not implemented');
  }

  /**
   * @param {string} folder
   * @param {{ page?: number, pageSize?: number, conversation?: boolean, query?: string }} options
   */

  async listMessages(folder, options) {
    throw new Error('not implemented');
  }

  async getThread(folder, uids) {
    throw new Error('not implemented');
  }

  async getMessage(folder, uid, options) {
    throw new Error('not implemented');
  }

  async getAttachment(folder, uid, part) {
    throw new Error('not implemented');
  }

  async sendMessage(payload) {
    throw new Error('not implemented');
  }

  async saveDraft(payload, existingUid) {
    throw new Error('not implemented');
  }

  async markRead(folder, uids, read) {
    throw new Error('not implemented');
  }

  async star(folder, uids, starred) {
    throw new Error('not implemented');
  }

  async moveMessage(folder, uids, destination) {
    throw new Error('not implemented');
  }

  async deleteMessage(folder, uids, { permanent } = {}) {
    throw new Error('not implemented');
  }

  async search(query, options) {
    throw new Error('not implemented');
  }
  async status() {
    throw new Error('not implemented');
  }

  /** Server-side forwarding rule of this mailbox. */
  async getForwarding() {
    throw new Error('not implemented');
  }

  /** @param {{ enabled: boolean, addresses: string[], keepCopy: boolean, skipSpam: boolean }} config */
  async setForwarding(config) {
    throw new Error('not implemented');
  }
}
