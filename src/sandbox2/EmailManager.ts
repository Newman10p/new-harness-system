// ─── M.A.I. Email Manager ──────────────────────────────────────────────
// IMAP-based email reading and SMTP-based email sending.
// Supports Gmail, Outlook, and generic IMAP/SMTP servers.
// No external dependencies — uses Node.js native TLS sockets for IMAP
// and Node.js native net for SMTP.
//
// Note: Gmail requires an App Password (not the account password).
//       Generate one at: https://myaccount.google.com/apppasswords

import net from "node:net";
import tls from "node:tls";
import { createHash } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────

export interface EmailAccount {
  id: string;
  label: string;            // e.g. "Gmail", "Outlook"
  imapHost: string;
  imapPort: number;         // 993 for TLS
  smtpHost: string;
  smtpPort: number;         // 465 for TLS
  username: string;
  password: string;         // App password for Gmail
  tls: boolean;
}

export interface EmailMessage {
  uid: string;
  account: string;          // account id
  folder: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: EmailAttachment[];
  flags: string[];
  size: number;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  disposition: string;
}

export interface EmailFolder {
  name: string;
  delimiter: string;
  totalMessages: number;
  recentMessages: number;
  flags: string[];
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  accountId?: string;
}

export interface EmailStats {
  totalAccounts: number;
  connectedAccounts: number;
  totalMessagesFetched: number;
  totalSent: number;
  accounts: Array<{ id: string; label: string; connected: boolean }>;
}

// ─── IMAP Client (minimal, no dependencies) ──────────────────────────────

class ImapClient {
  private socket: tls.TLSSocket | null = null;
  private tag = 0;
  private dataBuffer = "";
  private responseResolvers = new Map<string, {
    resolve: (data: string) => void;
    reject: (err: Error) => void;
  }>();
  private untaggedHandlers = new Map<string, Array<(data: string) => void>>();
  private connected = false;

  connect(host: string, port: number, timeoutMs = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`IMAP connection to ${host}:${port} timed out`));
      }, timeoutMs);

      const socket = tls.connect({ host, port, rejectUnauthorized: false }, () => {
        clearTimeout(timer);
        this.socket = socket;
        this.connected = true;
        // Wait for server greeting
        socket.once("data", (data: Buffer) => {
          this.dataBuffer += data.toString();
          const greeting = this.readLine();
          resolve(greeting);
        });
        socket.on("data", (d: Buffer) => this.onData(d));
        socket.on("error", (err: Error) => {
          this.connected = false;
        });
        socket.on("close", () => {
          this.connected = false;
        });
      });

      socket.on("error", (err: Error) => {
        clearTimeout(timer);
        reject(new Error(`IMAP connection error: ${err.message}`));
      });
    });
  }

  async authenticate(username: string, password: string): Promise<boolean> {
    try {
      const result = await this.command(`LOGIN ${this.escape(username)} ${this.escape(password)}`);
      return result.includes("OK");
    } catch {
      return false;
    }
  }

  async listFolders(): Promise<EmailFolder[]> {
    const response = await this.command('LIST "" "*"');
    const folders: EmailFolder[] = [];
    const lines = response.split("\n");

    for (const line of lines) {
      // Parse: * LIST (\HasNoChildren) "/" "INBOX"
      const match = line.match(/^\*\s+LIST\s+\(([^)]*)\)\s+"([^"]*)"\s+"?([^"]*?)"?$/i);
      if (match) {
        const flags = match[1].trim().split(/\s+/);
        const delimiter = match[2];
        const name = match[3];
        if (name) {
          folders.push({
            name,
            delimiter,
            totalMessages: 0,
            recentMessages: 0,
            flags,
          });
        }
      }
    }

    // Fetch message counts for each folder
    for (const folder of folders) {
      try {
        const status = await this.command(`STATUS "${this.escape(folder.name)}" (MESSAGES RECENT)`);
        const msgMatch = status.match(/MESSAGES\s+(\d+)/);
        const recentMatch = status.match(/RECENT\s+(\d+)/);
        folder.totalMessages = msgMatch ? parseInt(msgMatch[1], 10) : 0;
        folder.recentMessages = recentMatch ? parseInt(recentMatch[1], 10) : 0;
      } catch {
        // skip
      }
    }

    return folders;
  }

  async selectFolder(folder: string): Promise<{ total: number; recent: number }> {
    const response = await this.command(`SELECT "${this.escape(folder)}"`);
    const existsMatch = response.match(/\*\s+(\d+)\s+EXISTS/);
    const recentMatch = response.match(/\*\s+(\d+)\s+RECENT/);
    return {
      total: existsMatch ? parseInt(existsMatch[1], 10) : 0,
      recent: recentMatch ? parseInt(recentMatch[1], 10) : 0,
    };
  }

  async search(criteria: string): Promise<string[]> {
    const response = await this.command(`UID SEARCH ${criteria}`);
    const uids: string[] = [];
    const match = response.match(/\*\s+SEARCH\s+(.*)/);
    if (match) {
      uids.push(...match[1].trim().split(/\s+/).filter(Boolean));
    }
    return uids;
  }

  async fetchHeaders(uids: string[]): Promise<Array<{
    uid: string;
    from: string;
    to: string;
    subject: string;
    date: string;
    flags: string[];
    size: number;
  }>> {
    const results: Array<{
      uid: string; from: string; to: string; subject: string;
      date: string; flags: string[]; size: number;
    }> = [];

    // Fetch in batches of 20
    for (let i = 0; i < uids.length; i += 20) {
      const batch = uids.slice(i, i + 20);
      const uidSet = batch.join(",");
      const response = await this.command(`UID FETCH ${uidSet} (UID ENVELOPE FLAGS RFC822.SIZE)`);

      // Parse responses
      const blocks = response.split(/(?=\*\s+\d+\s+FETCH)/);
      for (const block of blocks) {
        if (!block.includes("FETCH")) continue;
        const uidMatch = block.match(/UID\s+(\d+)/);
        const sizeMatch = block.match(/RFC822\.SIZE\s+(\d+)/);
        const fromMatch = block.match(/\(\("?([^"(\s]+)"?[^)]*"?([^"\s@]+@[^"\s@]+)"?[^)]*\)/);
        const toMatch = block.match(/TO\s+\([^)]*\(([^)]*)\)/);
        const subjectMatch = block.match(/SUBJECT\s+"?([^"{]*?)"?\s*(?:\(|$)/);
        const dateMatch = block.match(/DATE\s+"?([^"\)]+)"?/);
        const flagsMatch = block.match(/FLAGS\s+\(([^)]*)\)/);

        results.push({
          uid: uidMatch?.[1] || "",
          from: fromMatch ? `${fromMatch[2]}` : "",
          to: toMatch?.[1] || "",
          subject: this.decodeImapUtf7(subjectMatch?.[1] || ""),
          date: dateMatch?.[1] || "",
          flags: flagsMatch?.[1]?.trim().split(/\s+/) || [],
          size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
        });
      }
    }

    return results;
  }

  async fetchBody(uid: string): Promise<{ text: string; html?: string }> {
    const response = await this.command(`UID FETCH ${uid} (BODY[TEXT] BODY[1.MIME] BODY[1])`);
    // Extract body content from the response
    // The body is in a literal ({size}\r\n...)
    const bodies: string[] = [];
    const regex = /BODY\[([^[\]]*)\]\s*\{\d+\}\r\n([\s\S]*?)(?=\r\n\*|\r\n[A-Z0-9]+\s+UID\s|$)/g;
    let m;
    while ((m = regex.exec(response)) !== null) {
      bodies.push(m[2]);
    }

    // Also try a simpler extraction
    if (bodies.length === 0) {
      // Find everything after the last FETCH line up to the tag response
      const fetchIndex = response.lastIndexOf("FETCH");
      if (fetchIndex >= 0) {
        const afterFetch = response.slice(fetchIndex);
        const literalMatch = afterFetch.match(/\{\d+\}\r\n([\s\S]+?)(?=\r\n[A-Z0-9]+\s|$)/);
        if (literalMatch) {
          bodies.push(literalMatch[1].trim());
        }
      }
    }

    const text = bodies.join("\n").trim();
    return { text };
  }

  async fetchMessage(uid: string): Promise<EmailMessage | null> {
    const headers = await this.fetchHeaders([uid]);
    if (headers.length === 0) return null;

    const header = headers[0];
    const body = await this.fetchBody(uid);

    return {
      uid: header.uid,
      account: "",
      folder: "",
      from: header.from,
      to: header.to ? [header.to] : [],
      cc: [],
      bcc: [],
      subject: header.subject,
      date: header.date,
      bodyText: body.text,
      bodyHtml: body.html,
      attachments: [],
      flags: header.flags,
      size: header.size,
    };
  }

  async moveMessage(uid: string, destFolder: string): Promise<boolean> {
    try {
      const result = await this.command(`UID COPY ${uid} "${this.escape(destFolder)}"`);
      if (!result.includes("OK")) return false;
      // Mark as deleted in current folder
      await this.command(`UID STORE ${uid} +FLAGS (\Deleted)`);
      await this.command("EXPUNGE");
      return true;
    } catch {
      return false;
    }
  }

  async markAsRead(uid: string): Promise<boolean> {
    try {
      const result = await this.command(`UID STORE ${uid} +FLAGS (\Seen)`);
      return result.includes("OK");
    } catch {
      return false;
    }
  }

  async deleteMessage(uid: string): Promise<boolean> {
    try {
      await this.command(`UID STORE ${uid} +FLAGS (\Deleted)`);
      await this.command("EXPUNGE");
      return true;
    } catch {
      return false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.socket !== null;
  }

  disconnect(): void {
    if (this.socket) {
      try { this.socket.end(); } catch { /* ignore */ }
      this.socket = null;
    }
    this.connected = false;
    this.responseResolvers.clear();
  }

  // ─── Private ───────────────────────────────────────────────────────

  private onData(data: Buffer): void {
    this.dataBuffer += data.toString();
    this.processBuffer();
  }

  private processBuffer(): void {
    // Process complete lines
    let idx: number;
    while ((idx = this.dataBuffer.indexOf("\r\n")) !== -1) {
      const line = this.dataBuffer.slice(0, idx);
      this.dataBuffer = this.dataBuffer.slice(idx + 2);

      // Check for untagged responses
      if (line.startsWith("* ")) {
        for (const [, handlers] of this.untaggedHandlers) {
          for (const h of handlers) {
            try { h(line); } catch { /* handler error */ }
          }
        }
        continue;
      }

      // Check for tagged response
      const tagMatch = line.match(/^(A\d+)\s+(OK|NO|BAD)/);
      if (tagMatch) {
        const tag = tagMatch[1];
        const resolver = this.responseResolvers.get(tag);
        if (resolver) {
          this.responseResolvers.delete(tag);
          // Return the accumulated response including this line
          resolver.resolve(line);
        }
      }
    }
  }

  private readLine(): string {
    const idx = this.dataBuffer.indexOf("\r\n");
    if (idx !== -1) {
      const line = this.dataBuffer.slice(0, idx);
      this.dataBuffer = this.dataBuffer.slice(idx + 2);
      return line;
    }
    return this.dataBuffer;
  }

  private command(cmd: string, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected"));
        return;
      }

      const tag = `A${this.tag++}`;
      let accumulated = "";

      const timer = setTimeout(() => {
        this.responseResolvers.delete(tag);
        reject(new Error(`IMAP command timed out: ${cmd.slice(0, 80)}`));
      }, timeoutMs);

      // Collect all data until we get the tagged response
      const originalOnData = this.socket.on;
      const collector = (data: Buffer) => {
        accumulated += data.toString();
      };

      this.socket.prependListener("data", collector);

      this.responseResolvers.set(tag, {
        resolve: (responseLine: string) => {
          clearTimeout(timer);
          this.socket?.removeListener("data", collector);
          resolve(accumulated + "\r\n" + responseLine);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          this.socket?.removeListener("data", collector);
          reject(err);
        },
      });

      // For commands that produce multi-line output, we need to collect
      // the full response including literals
      const fullCmd = `${tag} ${cmd}\r\n`;
      this.socket.write(fullCmd);
    });
  }

  private escape(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  private decodeImapUtf7(str: string): string {
    // Basic IMAP UTF-7 decoding
    if (!str.includes("&")) return str;
    try {
      return str
        .replace(/&([^&]*)-/g, (_, encoded) => {
          if (encoded === "") return "&";
          // Convert to base64 then decode
          const b64 = (encoded + "==").replace(/,/g, "/");
          try {
            return Buffer.from(b64, "base64").toString("utf16le");
          } catch {
            return _;
          }
        });
    } catch {
      return str;
    }
  }
}

// ─── SMTP Client (minimal, no dependencies) ──────────────────────────────

class SmtpClient {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private connected = false;
  private useTls = false;

  connect(host: string, port: number, useTls = true, timeoutMs = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`SMTP connection to ${host}:${port} timed out`));
      }, timeoutMs);

      const onConnect = () => {
        clearTimeout(timer);
        this.connected = true;
        this.useTls = useTls;
        socket.once("data", (data: Buffer) => {
          resolve(data.toString().trim());
        });
      };

      const socket = useTls
        ? tls.connect({ host, port, rejectUnauthorized: false }, onConnect)
        : net.connect({ host, port }, onConnect);

      this.socket = socket as any;

      socket.on("error", (err: Error) => {
        clearTimeout(timer);
        reject(new Error(`SMTP connection error: ${err.message}`));
      });
    });
  }

  async authenticate(username: string, password: string): Promise<boolean> {
    // Try AUTH LOGIN
    try {
      const loginResp = await this.readResponse();
      await this.sendCommand("AUTH LOGIN");
      await this.sendCommand(Buffer.from(username).toString("base64"));
      await this.sendCommand(Buffer.from(password).toString("base64"));
      return true;
    } catch {
      return false;
    }
  }

  async sendEmail(params: {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    html?: string;
  }): Promise<boolean> {
    if (!this.socket || !this.connected) return false;

    try {
      const allRecipients = [...params.to, ...(params.cc || []), ...(params.bcc || [])];
      const msgId = `${Date.now()}@mai`;
      const date = new Date().toUTCString();

      // Build the email message
      const recipients = allRecipients.join(", ");
      let email = `From: ${params.from}\r\n`;
      email += `To: ${params.to.join(", ")}\r\n`;
      if (params.cc?.length) {
        email += `Cc: ${params.cc.join(", ")}\r\n`;
      }
      email += `Subject: =?utf-8?B?${Buffer.from(params.subject).toString("base64")}?=\r\n`;
      email += `Date: ${date}\r\n`;
      email += `Message-ID: <${msgId}>\r\n`;
      email += `MIME-Version: 1.0\r\n`;

      if (params.html) {
        const boundary = `mai-boundary-${Date.now()}`;
        email += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
        email += `--${boundary}\r\n`;
        email += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
        email += `${params.body}\r\n\r\n`;
        email += `--${boundary}\r\n`;
        email += `Content-Type: text/html; charset=utf-8\r\n\r\n`;
        email += `${params.html}\r\n\r\n`;
        email += `--${boundary}--\r\n`;
      } else {
        email += `Content-Type: text/plain; charset=utf-8\r\n\r\n`;
        email += `${params.body}\r\n`;
      }

      // SMTP commands
      await this.sendCommand(`MAIL FROM:<${params.from}>`);
      for (const rcpt of allRecipients) {
        await this.sendCommand(`RCPT TO:<${rcpt}>`);
      }
      await this.sendCommand("DATA");
      await this.sendRaw(email + "\r\n.");

      return true;
    } catch {
      return false;
    }
  }

  disconnect(): void {
    if (this.socket) {
      try {
        this.socket.write("QUIT\r\n");
        this.socket.end();
      } catch { /* ignore */ }
      this.socket = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.socket !== null;
  }

  // ─── Private ───────────────────────────────────────────────────────

  private sendCommand(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected"));
        return;
      }

      const onData = (data: Buffer) => {
        const response = data.toString();
        const code = response.slice(0, 3);
        if (code.startsWith("2") || code.startsWith("3")) {
          this.socket?.removeListener("data", onData);
          resolve(response.trim());
        } else {
          this.socket?.removeListener("data", onData);
          reject(new Error(`SMTP error: ${response.trim()}`));
        }
      };

      this.socket.once("data", onData);
      this.socket.write(`${cmd}\r\n`);

      setTimeout(() => {
        this.socket?.removeListener("data", onData);
        reject(new Error(`SMTP command timed out: ${cmd.slice(0, 60)}`));
      }, 30000);
    });
  }

  private sendRaw(data: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected"));
        return;
      }

      const onData = (d: Buffer) => {
        const response = d.toString();
        if (response.startsWith("250") || response.startsWith("354")) {
          this.socket?.removeListener("data", onData);
          resolve(response.trim());
        }
      };

      this.socket.once("data", onData);
      this.socket.write(data);

      setTimeout(() => {
        this.socket?.removeListener("data", onData);
        reject(new Error("SMTP DATA command timed out"));
      }, 60000);
    });
  }

  private readResponse(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Not connected"));
        return;
      }
      this.socket.once("data", (d: Buffer) => {
        resolve(d.toString().trim());
      });
      setTimeout(() => {
        reject(new Error("Read response timed out"));
      }, 10000);
    });
  }
}

// ─── EmailManager ────────────────────────────────────────────────────────

export class EmailManager {
  private accounts = new Map<string, { config: EmailAccount; imap: ImapClient; smtp: SmtpClient; connected: boolean }>();
  private config: EmailControlConfig;
  private initialized = false;

  // Stats
  private totalMessagesFetched = 0;
  private totalSent = 0;

  constructor(config?: Partial<EmailControlConfig>) {
    this.config = {
      enabled: true,
      accounts: [],
      maxMessagesPerFetch: 20,
      bodyFetchLimit: 50,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Register configured accounts
    for (const acct of this.config.accounts || []) {
      this.registerAccount(acct);
    }

    // Try to connect to all registered accounts
    for (const [, entry] of this.accounts) {
      await this.connectAccount(entry.config.id);
    }

    this.initialized = true;
    console.log(
      `[EmailManager] Initialized. ${this.accounts.size} accounts configured, ` +
      `${Array.from(this.accounts.values()).filter(e => e.connected).length} connected.`
    );
  }

  registerAccount(account: EmailAccount): void {
    if (!account.id) {
      account.id = `email_${Date.now().toString(36)}`;
    }
    this.accounts.set(account.id, {
      config: account,
      imap: new ImapClient(),
      smtp: new SmtpClient(),
      connected: false,
    });
  }

  async connectAccount(accountId: string): Promise<boolean> {
    const entry = this.accounts.get(accountId);
    if (!entry) return false;

    try {
      // Connect IMAP
      await entry.imap.connect(
        entry.config.imapHost,
        entry.config.imapPort,
        10000
      );

      // Authenticate
      const ok = await entry.imap.authenticate(
        entry.config.username,
        entry.config.password
      );

      if (!ok) {
        console.warn(`[EmailManager] Authentication failed for ${entry.config.label}`);
        return false;
      }

      entry.connected = true;
      console.log(`[EmailManager] Connected to ${entry.config.label}`);
      return true;
    } catch (err) {
      console.warn(
        `[EmailManager] Failed to connect to ${entry.config.label}:`, 
        err instanceof Error ? err.message : err
      );
      return false;
    }
  }

  // ─── Read Operations ───────────────────────────────────────────────

  async listFolders(accountId?: string): Promise<Array<{ accountId: string; folder: EmailFolder }>> {
    const results: Array<{ accountId: string; folder: EmailFolder }> = [];

    const targetIds = accountId ? [accountId] : Array.from(this.accounts.keys());
    for (const id of targetIds) {
      const entry = this.accounts.get(id);
      if (!entry?.connected) continue;

      try {
        const folders = await entry.imap.listFolders();
        for (const f of folders) {
          results.push({ accountId: id, folder: f });
        }
      } catch { /* skip */ }
    }

    return results;
  }

  async listMessages(
    folder = "INBOX",
    accountId?: string,
    limit?: number,
    offset = 0
  ): Promise<EmailMessage[]> {
    const results: EmailMessage[] = [];
    const maxFetch = limit || this.config.maxMessagesPerFetch || 20;

    const targetIds = accountId ? [accountId] : Array.from(this.accounts.keys());

    for (const id of targetIds) {
      const entry = this.accounts.get(id);
      if (!entry?.connected) continue;

      try {
        await entry.imap.selectFolder(folder);
        const uids = await entry.imap.search("ALL");

        // Get the most recent messages (highest UIDs)
        const sortedUids = uids
          .map(Number)
          .sort((a, b) => b - a)
          .slice(offset, offset + maxFetch)
          .map(String);

        if (sortedUids.length === 0) continue;

        const headers = await entry.imap.fetchHeaders(sortedUids);

        for (const h of headers) {
          results.push({
            uid: h.uid,
            account: id,
            folder,
            from: h.from,
            to: h.to ? [h.to] : [],
            cc: [],
            bcc: [],
            subject: h.subject,
            date: h.date,
            bodyText: "",
            attachments: [],
            flags: h.flags,
            size: h.size,
          });
          this.totalMessagesFetched++;
        }
      } catch { /* skip */ }
    }

    return results;
  }

  async getMessage(uid: string, accountId?: string): Promise<EmailMessage | null> {
    const targetIds = accountId ? [accountId] : Array.from(this.accounts.keys());

    for (const id of targetIds) {
      const entry = this.accounts.get(id);
      if (!entry?.connected) continue;

      try {
        const msg = await entry.imap.fetchMessage(uid);
        if (msg) {
          msg.account = id;
          return msg;
        }
      } catch { /* skip */ }
    }

    return null;
  }

  async searchMessages(
    query: string,
    folder = "INBOX",
    accountId?: string
  ): Promise<EmailMessage[]> {
    // Try IMAP SEARCH with common criteria
    const results: EmailMessage[] = [];
    const searchCriteria = [
      `SUBJECT "${query}"`,
      `FROM "${query}"`,
      `TO "${query}"`,
      `BODY "${query}"`,
    ];

    const targetIds = accountId ? [accountId] : Array.from(this.accounts.keys());

    for (const id of targetIds) {
      const entry = this.accounts.get(id);
      if (!entry?.connected) continue;

      try {
        await entry.imap.selectFolder(folder);

        // Try each criterion and combine unique results
        const foundUids = new Set<string>();
        for (const criterion of searchCriteria) {
          try {
            const uids = await entry.imap.search(criterion);
            for (const uid of uids) {
              foundUids.add(uid);
            }
          } catch { /* skip this criterion */ }
        }

        const uidArray = Array.from(foundUids)
          .map(Number)
          .sort((a, b) => b - a)
          .slice(0, 20)
          .map(String);

        if (uidArray.length > 0) {
          const headers = await entry.imap.fetchHeaders(uidArray);
          for (const h of headers) {
            results.push({
              uid: h.uid,
              account: id,
              folder,
              from: h.from,
              to: h.to ? [h.to] : [],
              cc: [],
              bcc: [],
              subject: h.subject,
              date: h.date,
              bodyText: "",
              attachments: [],
              flags: h.flags,
              size: h.size,
            });
          }
        }
      } catch { /* skip */ }
    }

    return results;
  }

  async getUnreadMessages(
    folder = "INBOX",
    accountId?: string,
    limit = 10
  ): Promise<EmailMessage[]> {
    const results: EmailMessage[] = [];
    const targetIds = accountId ? [accountId] : Array.from(this.accounts.keys());

    for (const id of targetIds) {
      const entry = this.accounts.get(id);
      if (!entry?.connected) continue;

      try {
        await entry.imap.selectFolder(folder);
        const uids = await entry.imap.search("UNSEEN");
        const sortedUids = uids
          .map(Number)
          .sort((a, b) => b - a)
          .slice(0, limit)
          .map(String);

        if (sortedUids.length > 0) {
          const headers = await entry.imap.fetchHeaders(sortedUids);
          for (const h of headers) {
            results.push({
              uid: h.uid,
              account: id,
              folder,
              from: h.from,
              to: h.to ? [h.to] : [],
              cc: [],
              bcc: [],
              subject: h.subject,
              date: h.date,
              bodyText: "",
              attachments: [],
              flags: h.flags,
              size: h.size,
            });
          }
        }
      } catch { /* skip */ }
    }

    return results;
  }

  // ─── Send Operations ───────────────────────────────────────────────

  async sendEmail(params: SendEmailParams): Promise<boolean> {
    // Find the sending account
    let entry: { config: EmailAccount; smtp: SmtpClient; connected: boolean } | undefined;

    if (params.accountId) {
      entry = this.accounts.get(params.accountId);
    } else {
      // Use first connected account
      for (const [, e] of this.accounts) {
        if (e.connected) { entry = e; break; }
      }
    }

    if (!entry) {
      console.warn("[EmailManager] No connected account available for sending");
      return false;
    }

    try {
      // Connect SMTP if not connected
      if (!entry.smtp.isConnected()) {
        await entry.smtp.connect(
          entry.config.smtpHost,
          entry.config.smtpPort,
          entry.config.tls
        );
        await entry.smtp.authenticate(
          entry.config.username,
          entry.config.password
        );
      }

      const toList = typeof params.to === "string" ? [params.to] : params.to;
      const ccList = params.cc
        ? typeof params.cc === "string" ? [params.cc] : params.cc
        : undefined;
      const bccList = params.bcc
        ? typeof params.bcc === "string" ? [params.bcc] : params.bcc
        : undefined;

      const result = await entry.smtp.sendEmail({
        from: entry.config.username,
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject: params.subject,
        body: params.body,
        html: params.html,
      });

      if (result) {
        this.totalSent++;
        console.log(`[EmailManager] Email sent to ${toList.join(", ")}`);
      }

      return result;
    } catch (err) {
      console.error(
        `[EmailManager] Failed to send email:`, 
        err instanceof Error ? err.message : err
      );
      return false;
    }
  }

  // ─── Utility ──────────────────────────────────────────────────────

  async deleteMessage(uid: string, accountId?: string): Promise<boolean> {
    const targetIds = accountId ? [accountId] : Array.from(this.accounts.keys());
    for (const id of targetIds) {
      const entry = this.accounts.get(id);
      if (!entry?.connected) continue;
      try {
        return await entry.imap.deleteMessage(uid);
      } catch { /* skip */ }
    }
    return false;
  }

  async markAsRead(uid: string, accountId?: string): Promise<boolean> {
    const targetIds = accountId ? [accountId] : Array.from(this.accounts.keys());
    for (const id of targetIds) {
      const entry = this.accounts.get(id);
      if (!entry?.connected) continue;
      try {
        return await entry.imap.markAsRead(uid);
      } catch { /* skip */ }
    }
    return false;
  }

  listAccounts(): Array<{ id: string; label: string; connected: boolean }> {
    return Array.from(this.accounts.entries()).map(([id, entry]) => ({
      id,
      label: entry.config.label,
      connected: entry.connected,
    }));
  }

  getStats(): EmailStats {
    const entries = Array.from(this.accounts.values());
    return {
      totalAccounts: entries.length,
      connectedAccounts: entries.filter((e) => e.connected).length,
      totalMessagesFetched: this.totalMessagesFetched,
      totalSent: this.totalSent,
      accounts: entries.map((e) => ({
        id: e.config.id,
        label: e.config.label,
        connected: e.connected,
      })),
    };
  }

  shutdown(): void {
    for (const [, entry] of this.accounts) {
      entry.imap.disconnect();
      entry.smtp.disconnect();
    }
    this.accounts.clear();
    this.initialized = false;
    console.log("[EmailManager] Shut down.");
  }
}

// ─── Config Type ──────────────────────────────────────────────────────────

export interface EmailControlConfig {
  enabled?: boolean;
  accounts: EmailAccount[];
  maxMessagesPerFetch?: number;
  bodyFetchLimit?: number;
}

// ─── Singleton ────────────────────────────────────────────────────────────

let _instance: EmailManager | null = null;

export function getEmailManager(
  config?: Partial<EmailControlConfig>
): EmailManager {
  if (!_instance) {
    _instance = new EmailManager(config);
  }
  return _instance;
}
