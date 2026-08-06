/**
 * @rawura/emails — the single source of truth for transactional email.
 *
 * Consumed by both `Main-server` and `event-bus`. Neither service should own templates, a
 * renderer, or payload types of its own; they own only an SMTP transport and a brand
 * resolver.
 */

export * from './types';
export * from './branding';
export * from './build';
export { Mailer, type MailerOptions, type MailerLogger } from './mailer';
export { renderEmailTemplate, getAvailableTemplates } from './engine';
export { buildSubject, isMarketingKind } from './subjects';
export { buildText } from './text';
export { getCdnUrl, getCdnBaseUrl, isCdnUrl, extractPathFromCdnUrl } from './cdn-url';
export {
  formatToNaira,
  formatDateTime,
  formatDateOnly,
  pluralize,
  titleCase,
  greetingName,
} from './format';
