/**
 * Handlebars rendering for email templates.
 *
 * Two changes from the per-service copies this replaces:
 *  - partials are registered from `templates/partials`, so the header, footer, button and
 *    product row exist once instead of being pasted into eighteen files;
 *  - templates and partials are compiled once and cached. The old comment claimed no caching
 *    was "for development flexibility", but it meant every order confirmation re-read and
 *    re-compiled ~300 lines of HTML from disk on the hot path.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { formatToNaira, formatDateTime, formatDateOnly, pluralize, titleCase, greetingName } from './format';
import { getCdnUrl } from './cdn-url';

const TEMPLATE_DIR = path.join(__dirname, 'templates');
const PARTIAL_DIR = path.join(TEMPLATE_DIR, 'partials');

/** Set to '1' to recompile on every render while iterating on templates locally. */
const noCache = process.env.EMAIL_TEMPLATE_NO_CACHE === '1';

const compiled = new Map<string, HandlebarsTemplateDelegate>();
let bootstrapped = false;

function registerHelpers(): void {
  Handlebars.registerHelper('currency', (amount: unknown) =>
    formatToNaira(typeof amount === 'number' ? amount : Number(amount))
  );
  Handlebars.registerHelper('formatDate', (date: unknown) => formatDateTime(date as Date | string));
  Handlebars.registerHelper('formatDateOnly', (date: unknown) => formatDateOnly(date as Date | string));
  Handlebars.registerHelper('cdnUrl', (imagePath: unknown) => getCdnUrl(imagePath as string));
  Handlebars.registerHelper('titleCase', (value: unknown) => titleCase(value as string));
  Handlebars.registerHelper('greetingName', (value: unknown) => greetingName(value as string));

  Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  Handlebars.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
  Handlebars.registerHelper('gt', (a: unknown, b: unknown) => Number(a) > Number(b));
  Handlebars.registerHelper('gte', (a: unknown, b: unknown) => Number(a) >= Number(b));
  Handlebars.registerHelper('and', (...args: unknown[]) => args.slice(0, -1).every(Boolean));
  Handlebars.registerHelper('or', (...args: unknown[]) => args.slice(0, -1).some(Boolean));

  Handlebars.registerHelper('pluralize', (count: unknown, singular: unknown, plural?: unknown) =>
    pluralize(Number(count), String(singular), typeof plural === 'string' ? plural : undefined)
  );

  /** `{{concat "-" (currency x)}}` — joins arguments, dropping Handlebars' options object. */
  Handlebars.registerHelper('concat', (...args: unknown[]) =>
    args
      .slice(0, -1)
      .map((value) => (value === undefined || value === null ? '' : String(value)))
      .join('')
  );

  /**
   * `{{fallback a b "—"}}` — first non-empty argument.
   * Guards the optional fields that used to render as a bare blank cell.
   */
  Handlebars.registerHelper('fallback', (...args: unknown[]) => {
    for (const value of args.slice(0, -1)) {
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return '';
  });
}

function registerPartials(): void {
  if (!fs.existsSync(PARTIAL_DIR)) return;

  for (const file of fs.readdirSync(PARTIAL_DIR)) {
    if (!file.endsWith('.hbs')) continue;
    const name = file.replace(/\.hbs$/, '');
    Handlebars.registerPartial(name, fs.readFileSync(path.join(PARTIAL_DIR, file), 'utf-8'));
  }
}

function bootstrap(): void {
  if (bootstrapped && !noCache) return;
  registerHelpers();
  registerPartials();
  bootstrapped = true;
}

function loadTemplate(templateName: string): HandlebarsTemplateDelegate {
  const cached = compiled.get(templateName);
  if (cached && !noCache) return cached;

  const templatePath = path.join(TEMPLATE_DIR, `${templateName}.html`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Email template not found: ${templateName} (looked in ${TEMPLATE_DIR})`);
  }

  const template = Handlebars.compile(fs.readFileSync(templatePath, 'utf-8'), { compat: false });
  compiled.set(templateName, template);
  return template;
}

/**
 * Compiles and renders a template.
 *
 * @param templateName file name without the .html extension
 * @param data view model; must already include a resolved `brand`
 */
export function renderEmailTemplate(templateName: string, data: unknown): string {
  bootstrap();
  return loadTemplate(templateName)(data);
}

/** Template names present on disk. Used by the preview harness to catch orphaned files. */
export function getAvailableTemplates(): string[] {
  if (!fs.existsSync(TEMPLATE_DIR)) return [];
  return fs
    .readdirSync(TEMPLATE_DIR)
    .filter((file) => file.endsWith('.html'))
    .map((file) => file.replace(/\.html$/, ''))
    .sort();
}
