/**
 * Copies the Handlebars template tree into dist so the compiled engine can read it.
 *
 * Replaces the per-service `gulp copy:mails` tasks: templates now travel with the
 * package instead of being duplicated into every consumer's dist.
 */
const fs = require('fs');
const path = require('path');

const from = path.join(__dirname, '..', 'src', 'templates');
const to = path.join(__dirname, '..', 'dist', 'src', 'templates');

fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
fs.cpSync(from, to, { recursive: true });

const count = fs.readdirSync(to).filter((f) => f.endsWith('.html')).length;
console.log(`[emails] copied ${count} templates -> ${path.relative(process.cwd(), to)}`);
