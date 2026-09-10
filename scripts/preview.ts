/**
 * Renders every email to `preview/` and fails the build if any output looks broken.
 *
 * The assertions matter more than the previews. The entire class of bug this package exists
 * to fix — `{{invoiceNumber}}` against a payload that has no invoiceNumber, `orderNumber`
 * against a schema that has no orderNumber, `description_images[0]` against an array of
 * objects — is invisible in code review and obvious the moment you scan rendered output for
 * `undefined`, `[object Object]` and empty interpolations.
 *
 * Run with: npm --prefix shared/emails run preview
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildEmail } from '../src/build';
import { getAvailableTemplates } from '../src/engine';
import type { EmailBrand } from '../src/branding';
import type { EmailKind, EmailPayloadMap } from '../src/types';
import { fixtures, variants } from './fixtures';

const OUT_DIR = path.join(__dirname, '..', '..', 'preview');

/** A brand with everything populated, so the header, socials and address all get exercised. */
const brand: EmailBrand = {
  storeName: 'Rawura',
  companyName: 'Rawura Stores Limited',
  logoUrl: '',
  storefrontUrl: 'https://www.rawura.com',
  apiUrl: 'https://api.rawura.com',
  supportEmail: 'support@rawura.com',
  supportPhone: '+234 809 555 0110',
  addressLine: '7 Kudirat Abiola Way, Ikeja, Lagos, Nigeria',
  social: [
    {
      name: 'Instagram',
      url: 'https://instagram.com/rawura',
      iconUrl: 'https://res.cloudinary.com/dau2gxgbw/image/upload/v1676965510/email-template/images/ig-icon_lyd5yy.png',
    },
    {
      name: 'Facebook',
      url: 'https://facebook.com/rawura',
      iconUrl: 'https://res.cloudinary.com/dau2gxgbw/image/upload/v1676965509/email-template/images/fb-icon_jdwajr.png',
    },
    {
      name: 'X',
      url: 'https://x.com/rawura',
      iconUrl: 'https://res.cloudinary.com/dau2gxgbw/image/upload/v1676965510/email-template/images/twitter-icon_irb5ks.png',
    },
  ],
  hasSocial: true,
  year: new Date().getFullYear(),
};

interface Problem {
  file: string;
  issue: string;
  excerpt: string;
}

/**
 * Patterns that mean a value never made it into the template. Checked against the HTML body
 * and the plain-text body, since the text part is where the old one-line fallbacks hid.
 */
const BAD_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'literal "undefined"', re: /\bundefined\b/ },
  { label: 'literal "null"', re: /(^|[\s>"(])null([\s<".,)]|$)/ },
  { label: 'literal "NaN"', re: /\bNaN\b/ },
  { label: 'object stringified into output', re: /\[object Object\]/ },
  { label: 'unrendered Handlebars expression', re: /\{\{|\}\}/ },
  { label: 'placeholder href', re: /href="#"/ },
  { label: 'stale hardcoded domain', re: /plasticsnmore\.com/ },
  { label: 'currency formatting failure', re: /₦\s*(NaN|undefined)/ },
];

function inspect(file: string, body: string, problems: Problem[]): void {
  for (const { label, re } of BAD_PATTERNS) {
    const match = re.exec(body);
    if (!match) continue;
    const start = Math.max(0, match.index - 70);
    problems.push({
      file,
      issue: label,
      excerpt: body.slice(start, match.index + match[0].length + 70).replace(/\s+/g, ' ').trim(),
    });
  }
}

/**
 * Dark-mode contrast guard.
 *
 * An `!important` rule in the <style> block beats a plain inline style, so `p { color: … }`
 * recolours correctly in dark mode. Elements the dark block does NOT name — <strong>, <span>,
 * <td>, <div> — keep their inline colour instead, and a near-black inline colour then renders
 * black-on-black. That shipped in order-delivered ("Something not right?" was invisible).
 *
 * Any element carrying a dark inline colour must therefore either be named by a tag selector
 * in the dark block, or carry a class that is.
 */
const DARK_INK = /#(1B1B1B|1b1b1b|000000)\b/;
const DARK_SAFE_TAGS = /^(h1|h2|h3|strong|b)$/;
const DARK_SAFE_CLASSES = /\b(ink|kv-value|strong-figure|code|footer|a-warn)\b/;

function inspectDarkMode(file: string, html: string, problems: Problem[]): void {
  const tagRe = /<(\w+)([^>]*\bstyle="[^"]*")[^>]*>/g;

  for (const [, tag, attrs] of html.matchAll(tagRe)) {
    // background-color:#1B1B1B is the footer's dark panel — correct, and not a text colour.
    const styleMatch = /style="([^"]*)"/.exec(attrs);
    const style = styleMatch?.[1] ?? '';
    const colour = /(^|;)\s*color:\s*([^;]+)/.exec(style)?.[2] ?? '';
    if (!DARK_INK.test(colour)) continue;

    if (DARK_SAFE_TAGS.test(tag)) continue;
    if (DARK_SAFE_CLASSES.test(/class="([^"]*)"/.exec(attrs)?.[1] ?? '')) continue;

    problems.push({
      file,
      issue: `<${tag}> has a near-black inline colour the dark-mode block cannot override — add class="ink"`,
      excerpt: `<${tag}${attrs}>`.replace(/\s+/g, ' ').slice(0, 180),
    });
  }
}

function render(name: string, kind: EmailKind, data: EmailPayloadMap[EmailKind], problems: Problem[]): void {
  // Stand-in for the HMAC the host service signs, so the marketing footer and the
  // List-Unsubscribe path are exercised rather than silently skipped.
  const built = buildEmail(kind, data as never, brand, { unsubscribeToken: 'preview-token' });

  fs.writeFileSync(path.join(OUT_DIR, `${name}.html`), built.html, 'utf-8');
  fs.writeFileSync(path.join(OUT_DIR, `${name}.txt`), `Subject: ${built.subject}\n\n${built.text}`, 'utf-8');

  inspect(`${name}.html`, built.html, problems);
  inspectDarkMode(`${name}.html`, built.html, problems);
  inspect(`${name}.txt`, built.text, problems);
  inspect(`${name} [subject]`, built.subject, problems);

  if (built.text.trim().length < 120) {
    problems.push({ file: `${name}.txt`, issue: 'plain-text body is too thin to be useful', excerpt: built.text.trim() });
  }
}

function main(): void {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const problems: Problem[] = [];
  const kinds = Object.keys(fixtures) as EmailKind[];

  for (const kind of kinds) {
    render(kind, kind, fixtures[kind], problems);
  }
  for (const variant of variants) {
    render(variant.name, variant.kind, variant.data, problems);
  }

  // A template on disk with no fixture is a template nobody has ever seen rendered.
  const orphans = getAvailableTemplates().filter((t) => !kinds.includes(t as EmailKind));
  const missing = kinds.filter((k) => !getAvailableTemplates().includes(k));

  writeIndex(kinds);

  console.log(`\nRendered ${kinds.length + variants.length} emails -> ${path.relative(process.cwd(), OUT_DIR)}`);

  if (orphans.length) console.error(`\nTemplates with no fixture: ${orphans.join(', ')}`);
  if (missing.length) console.error(`\nEmail kinds with no template file: ${missing.join(', ')}`);

  if (problems.length) {
    console.error(`\n${problems.length} problem(s) found:\n`);
    for (const problem of problems) {
      console.error(`  [${problem.file}] ${problem.issue}`);
      console.error(`      …${problem.excerpt}…\n`);
    }
  }

  if (problems.length || orphans.length || missing.length) process.exit(1);
  console.log('All emails rendered clean — no missing values, no dead links.\n');
}

function writeIndex(kinds: EmailKind[]): void {
  const links = [...kinds.map((k) => ({ name: k, kind: k })), ...variants.map((v) => ({ name: v.name, kind: v.kind }))]
    .map(
      (entry) =>
        `<li><a href="${entry.name}.html">${entry.name}</a> &middot; <a href="${entry.name}.txt">text</a></li>`
    )
    .join('\n');

  fs.writeFileSync(
    path.join(OUT_DIR, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Email previews</title>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px}li{margin:4px 0}</style>
<h1>Email previews</h1>
<p>Resize the window to 320px to check the phone layout; switch your OS to dark mode to check the dark palette.</p>
<ul>\n${links}\n</ul>`,
    'utf-8'
  );
}

main();
