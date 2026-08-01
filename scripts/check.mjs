import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'dist');
const BASE = normaliseBase(process.env.BASE_PATH || '');
const errors = [];
const warnings = [];

for (const file of [
  'index.html',
  'work/index.html',
  'services/index.html',
  'about/index.html',
  'journal/index.html',
  'contact/index.html',
  '404.html',
  'assets/styles.css',
  'assets/site.js',
  'images/social-card.png',
  'favicon.svg',
  'rss.xml',
  'sitemap.xml',
  'robots.txt',
]) {
  if (!(await exists(path.join(OUT, file)))) errors.push(`Missing required output: ${file}`);
}

for (const file of ['content/settings/site.json', 'content/services.json', 'content/process.json', 'package.json']) {
  try {
    JSON.parse(await fs.readFile(path.join(ROOT, file), 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${file}: ${error.message}`);
  }
}

const htmlFiles = await findFiles(OUT, (file) => file.endsWith('.html'));
if (htmlFiles.length < 2) errors.push(`Expected at least 10 HTML pages, found ${htmlFiles.length}`);

for (const file of htmlFiles) {
  const html = await fs.readFile(file, 'utf8');
  const relative = path.relative(OUT, file).replaceAll('\\', '/');
  for (const marker of ['undefined', '[object Object]', '>NaN<']) {
    if (html.includes(marker)) errors.push(`${relative} contains ${marker}`);
  }
  if (!/<title>[^<]+<\/title>/.test(html)) errors.push(`${relative} has no title`);
  if (!/<meta name="description" content="[^"]+">/.test(html)) errors.push(`${relative} has no meta description`);

  const references = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const reference of references) {
    const problem = await checkReference(reference);
    if (problem) errors.push(`${relative}: ${problem}`);
  }
}

const pagesConfig = await fs.readFile(path.join(ROOT, '.pages.yml'), 'utf8');
for (const required of ['content/writing', 'content/settings/site.json', 'type: rich-text', 'public/images/uploads']) {
  if (!pagesConfig.includes(required)) errors.push(`.pages.yml is missing expected setting: ${required}`);
}

const settings = JSON.parse(await fs.readFile(path.join(ROOT, 'content/settings/site.json'), 'utf8'));
if (String(settings.email).includes('example.com') || String(settings.email).includes('your-email')) {
  warnings.push('The contact email is still a placeholder. Change it in Pages CMS before sharing the site.');
}
if (String(settings.linkedin).includes('your-profile')) {
  warnings.push('The LinkedIn URL is still a placeholder. Change it in Pages CMS before sharing the site.');
}

if (errors.length) {
  console.error(`Website check failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Website check passed: ${htmlFiles.length} HTML pages verified.`);
if (warnings.length) {
  console.log('Setup reminders:');
  warnings.forEach((warning) => console.log(`- ${warning}`));
}

async function checkReference(reference) {
  if (!reference || /^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(reference)) return '';
  const clean = decodeURIComponent(reference.split('#')[0].split('?')[0]);
  let internal = clean;
  if (BASE && internal.startsWith(BASE)) internal = internal.slice(BASE.length) || '/';
  if (!internal.startsWith('/')) return '';

  const relative = internal.replace(/^\//, '');
  const candidates = [];
  if (!relative) candidates.push(path.join(OUT, 'index.html'));
  else if (relative.endsWith('/')) candidates.push(path.join(OUT, relative, 'index.html'));
  else {
    candidates.push(path.join(OUT, relative));
    candidates.push(path.join(OUT, relative, 'index.html'));
  }

  for (const candidate of candidates) {
    if (await exists(candidate)) return '';
  }
  return `broken internal reference ${reference}`;
}

async function findFiles(directory, predicate) {
  const found = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await findFiles(full, predicate));
    else if (predicate(full)) found.push(full);
  }
  return found;
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

function normaliseBase(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === '/') return '';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}
