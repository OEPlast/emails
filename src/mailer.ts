/**
 * SMTP transport.
 *
 * Lives here rather than in each service because the two copies were byte-identical apart
 * from the bugs: one injected the logo and one did not, one logged through winston and one
 * through console, and their subject lines had already diverged.
 *
 * A service supplies only what is genuinely service-specific: its already-resolved brand
 * values, and where to log. This package never resolves a brand itself.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { buildEmail } from './build';
import { isMarketingKind } from './subjects';
import type { EmailBrand } from './branding';
import type { BuiltEmail, EmailKind, EmailPayloadMap } from './types';

export interface MailerLogger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export interface MailerOptions {
  /**
   * Returns the host service's current, fully-resolved brand. Resolution, defaults and caching
   * are the host's responsibility; any object structurally compatible with `EmailBrand` works.
   */
  getBrand: () => Promise<EmailBrand>;
  logger?: MailerLogger;
  /** Attempts per email, including the first. Transient SMTP failures are common. */
  maxAttempts?: number;
  /**
   * Signs the unsubscribe link for marketing mail. Omit and marketing emails ship without
   * an opt-out link rather than with a dead one.
   */
  signUnsubscribe?: (email: string) => string;
  /**
   * Returns false when the recipient has opted out of marketing email. Transactional mail
   * never consults this. Omit and nothing is suppressed.
   */
  isMarketingAllowed?: (email: string) => Promise<boolean>;
}

const consoleLogger: MailerLogger = {
  info: (m, meta) => console.log(m, meta ?? ''),
  warn: (m, meta) => console.warn(m, meta ?? ''),
  error: (m, meta) => console.error(m, meta ?? ''),
};

/** SMTP errors worth retrying: connection problems and 4xx "try again later" responses. */
function isTransient(error: unknown): boolean {
  const code = (error as { responseCode?: number; code?: string } | null)?.responseCode;
  const errno = (error as { code?: string } | null)?.code ?? '';
  if (typeof code === 'number') return code >= 400 && code < 500;
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EAI_AGAIN'].includes(errno);
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class Mailer {
  private transporter: Transporter | null = null;
  private readonly log: MailerLogger;
  private readonly maxAttempts: number;

  constructor(private readonly options: MailerOptions) {
    this.log = options.logger ?? consoleLogger;
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  }

  async initialize(): Promise<void> {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER || process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });

    await this.transporter.verify();
    this.log.info('[email] transporter verified');
  }

  /**
   * Renders and sends one email.
   *
   * Never throws. A failed order confirmation used to bubble an exception into an event
   * handler's catch-all, where it was logged as a generic "error handling order event" with
   * no indication that a customer had silently not been told their order went through.
   * Failures are now reported with the email kind and recipient, and swallowed so they
   * cannot roll back the business operation that triggered them.
   */
  async send<K extends EmailKind>(kind: K, data: EmailPayloadMap[K]): Promise<boolean> {
    const marketing = isMarketingKind(kind);

    if (marketing && this.options.isMarketingAllowed) {
      try {
        if (!(await this.options.isMarketingAllowed(data.email))) {
          this.log.info(`[email] skipped "${kind}" — ${data.email} has opted out of marketing email`);
          return false;
        }
      } catch (error) {
        // Fail closed: if we cannot confirm consent, do not send marketing mail.
        this.log.error(`[email] could not check marketing consent for ${data.email}; skipping "${kind}"`, error);
        return false;
      }
    }

    let built: BuiltEmail;
    try {
      built = buildEmail(kind, data, await this.options.getBrand(), {
        unsubscribeToken: marketing ? this.options.signUnsubscribe?.(data.email) : undefined,
      });
    } catch (error) {
      this.log.error(`[email] failed to render "${kind}" for ${data.email}`, error);
      return false;
    }

    return this.deliver(kind, built);
  }

  /** `kind` is used for log context only, so `sendRaw` can pass a descriptive label. */
  private async deliver(kind: string, built: BuiltEmail): Promise<boolean> {
    if (!this.transporter) {
      this.log.error(`[email] transporter not initialised; dropped "${kind}" to ${built.to}`);
      return false;
    }

    const brand = await this.options.getBrand();
    const fromAddress = process.env.FROM_EMAIL ?? brand.supportEmail;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        await this.transporter.sendMail({
          // Named sender: a bare address looks like spam and gives the recipient no clue
          // who the mail is from before they open it.
          from: `"${brand.storeName}" <${fromAddress}>`,
          replyTo: brand.supportEmail,
          to: built.to,
          subject: built.subject,
          html: built.html,
          text: built.text,
          // One-click unsubscribe headers on marketing mail only. The mailto: is always
          // offered so there is a working opt-out even where no public API URL is set.
          headers: built.isMarketing
            ? {
                'List-Unsubscribe': [
                  built.unsubscribeUrl ? `<${built.unsubscribeUrl}>` : '',
                  `<mailto:${brand.supportEmail}?subject=unsubscribe>`,
                ]
                  .filter(Boolean)
                  .join(', '),
                ...(built.unsubscribeUrl ? { 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : {}),
              }
            : undefined,
        });

        this.log.info(`[email] sent "${kind}" to ${built.to}`);
        return true;
      } catch (error) {
        const last = attempt === this.maxAttempts;
        if (last || !isTransient(error)) {
          this.log.error(`[email] failed to send "${kind}" to ${built.to} after ${attempt} attempt(s)`, error);
          return false;
        }
        this.log.warn(`[email] transient failure sending "${kind}" to ${built.to}; retrying (${attempt}/${this.maxAttempts})`, error);
        await wait(attempt * 500);
      }
    }

    return false;
  }

  /**
   * Escape hatch for one-off admin sends that are not template-backed.
   * Prefer `send()` — anything recurring deserves a template in the registry.
   */
  async sendRaw(to: string, subject: string, html: string, text?: string): Promise<boolean> {
    return this.deliver('raw', { to, subject, html, text: text ?? '', unsubscribeUrl: '', isMarketing: false });
  }

  /** Sends the same template to many recipients, tolerating individual failures. */
  async sendBulk<K extends EmailKind>(
    kind: K,
    payloads: Array<EmailPayloadMap[K]>
  ): Promise<{ sent: number; failed: number }> {
    const results = await Promise.all(payloads.map((payload) => this.send(kind, payload)));
    const sent = results.filter(Boolean).length;
    return { sent, failed: results.length - sent };
  }
}
