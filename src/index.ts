/**
 * @rawura/emails — templates, rendering and transport for Rawura email.
 *
 * Host services (`Main-server`, `event-bus`) own brand resolution and their own payload types.
 * This package owns the templates, the renderer, subjects, plain-text bodies and the SMTP
 * transport, and describes its render inputs structurally: a service passes any object whose
 * shape is compatible with what a template reads. No brand settings types and no types shared
 * with services are exported from here.
 */

export { buildEmail } from './build';
export { Mailer, type MailerOptions, type MailerLogger } from './mailer';
export { renderEmailTemplate, getAvailableTemplates } from './engine';
export { buildSubject, isMarketingKind } from './subjects';
export { buildText } from './text';
export { getCdnUrl, getCdnBaseUrl, getEmailImageUrl, isCdnUrl, extractPathFromCdnUrl } from './cdn-url';
export {
  formatToNaira,
  formatDateTime,
  formatDateOnly,
  pluralize,
  titleCase,
  greetingName,
} from './format';
