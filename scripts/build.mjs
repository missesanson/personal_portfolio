import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const CONTENT = path.join(ROOT, 'content');
const PUBLIC = path.join(ROOT, 'public');

const site = JSON.parse(await fs.readFile(path.join(CONTENT, 'settings', 'site.json'), 'utf8'));
const services = JSON.parse(await fs.readFile(path.join(CONTENT, 'services.json'), 'utf8'));
const processSteps = JSON.parse(await fs.readFile(path.join(CONTENT, 'process.json'), 'utf8'));

const BASE = normaliseBase(process.env.BASE_PATH || '');
const envOrigin = trimSlash(process.env.SITE_URL || 'https://example.github.io');
const configuredSite = trimSlash(site.siteUrl || '');
const SITE_BASE = configuredSite || `${envOrigin}${BASE}`;
const showDrafts = process.env.PREVIEW_DRAFTS === 'true';

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await copyDir(PUBLIC, OUT);

const writingDir = path.join(CONTENT, 'writing');
const writingFiles = (await fs.readdir(writingDir)).filter((file) => file.endsWith('.md')).sort();
const allArticles = [];

for (const file of writingFiles) {
  const raw = await fs.readFile(path.join(writingDir, file), 'utf8');
  const parsed = parseFrontmatter(raw);
  const slug = slugify(path.basename(file, '.md'));
  const bodyText = parsed.body.trim();
  const rendered = markdownToHtml(bodyText);
  const date = normaliseDate(parsed.data.date);
  const article = {
    slug,
    title: String(parsed.data.title || titleFromSlug(slug)),
    description: String(parsed.data.description || ''),
    date,
    category: String(parsed.data.category || 'Articles'),
    project: String(parsed.data.project || ''),
    role: String(parsed.data.role || ''),
    audience: String(parsed.data.audience || ''),
    featured: toBoolean(parsed.data.featured),
    draft: toBoolean(parsed.data.draft),
    cover: String(parsed.data.cover || ''),
    body: bodyText,
    html: rendered.html,
    headings: rendered.headings,
    readingMinutes: Math.max(1, Math.ceil(wordCount(bodyText) / 220)),
  };
  if (!article.draft || showDrafts) allArticles.push(article);
}

allArticles.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
const featuredArticles = allArticles
  .filter((article) => article.featured)
  .slice(0, clamp(Number(site.featuredLimit) || 4, 1, 8));
const journalArticles = allArticles.filter((article) => ['Articles', 'Research', 'Essays'].includes(article.category));
const categories = [...new Set(allArticles.map((article) => article.category))].sort();

const pages = [
  { path: '/', html: renderHome() },
  { path: '/work/', html: renderWork() },
  { path: '/services/', html: renderServices() },
  { path: '/about/', html: renderAbout() },
  { path: '/journal/', html: renderJournal() },
  { path: '/contact/', html: renderContact() },
];

for (const [index, article] of allArticles.entries()) {
  pages.push({
    path: `/writing/${article.slug}/`,
    html: renderArticle(article, index),
  });
}

for (const page of pages) await writePage(page.path, page.html);
await fs.writeFile(path.join(OUT, '404.html'), render404(), 'utf8');
await fs.writeFile(path.join(OUT, 'sitemap.xml'), renderSitemap(pages), 'utf8');
await fs.writeFile(path.join(OUT, 'rss.xml'), renderRss(journalArticles), 'utf8');
await fs.writeFile(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_BASE}/sitemap.xml\n`, 'utf8');
await fs.writeFile(path.join(OUT, 'site.webmanifest'), JSON.stringify({
  name: `${site.name} — ${site.role}`,
  short_name: site.name,
  start_url: url('/'),
  display: 'standalone',
  background_color: safeColour(site.paper, '#f4efe7'),
  theme_color: safeColour(site.ink, '#1d1d1b'),
  icons: [{ src: url('/favicon.svg'), sizes: 'any', type: 'image/svg+xml' }],
}, null, 2), 'utf8');

console.log(`Built ${pages.length} pages and ${allArticles.length} writing entries in ${OUT}`);
console.log(`Base path: ${BASE || '/'} | Site base: ${SITE_BASE}`);

function renderHome() {
  const work = featuredArticles.length ? featuredArticles : allArticles.slice(0, 4);
  const heroWords = splitTagline(site.tagline || 'Complex ideas, made clear.');
  const principles = Array.isArray(site.principles) ? site.principles.slice(0, 4) : [];
  return layout({
    title: '',
    description: site.siteDescription,
    path: '/',
    active: 'home',
    bodyClass: 'page-home',
    content: `
      <main id="main">
        <section class="hero shell" aria-labelledby="hero-title">
          <div class="hero-copy reveal">
            <p class="availability"><span aria-hidden="true"></span>${escapeHtml(site.availability)}</p>
            <h1 id="hero-title">${escapeHtml(heroWords.first)} <em>${escapeHtml(heroWords.second)}</em></h1>
            <p class="hero-intro">${escapeHtml(site.subheading)}</p>
            <div class="button-row">
              <a class="button button-primary" href="${url('/work/')}">View selected work ${arrowIcon()}</a>
              <a class="button button-quiet" href="${url('/contact/')}">Discuss a project</a>
            </div>
            <div class="hero-proof" aria-label="Writing approach">
              <span>Research-led</span><span>Reader-first</span><span>Voice-aware</span><span>Carefully revised</span>
            </div>
          </div>
          <aside class="hero-note reveal" aria-label="Writer introduction">
            <div class="hero-note-top">
              <span>01 / Profile</span>
              <span class="hero-note-status"><i aria-hidden="true"></i> Open</span>
            </div>
            <div class="monogram-stage">
              <div class="monogram-large" aria-hidden="true">${escapeHtml(site.monogram || initials(site.name))}</div>
              <span class="monogram-ring ring-one" aria-hidden="true"></span>
              <span class="monogram-ring ring-two" aria-hidden="true"></span>
            </div>
            <p class="hero-note-kicker">${escapeHtml(site.studentLabel)}</p>
            <p>${escapeHtml(site.shortBio)}</p>
            <div class="hero-note-meta">
              <span>${pinIcon()} ${escapeHtml(site.location)}</span>
              <a href="${safeExternalUrl(site.linkedin)}" target="_blank" rel="noreferrer">LinkedIn ${externalIcon()}</a>
            </div>
          </aside>
        </section>

        <section class="practice-rail" aria-label="Writing disciplines">
          <div class="practice-track">
            ${['Research writing', 'Editorial articles', 'Website copy', 'Ghostwriting', 'Essays', 'Editing'].concat(['Research writing', 'Editorial articles', 'Website copy', 'Ghostwriting', 'Essays', 'Editing']).map((label) => `<span>${escapeHtml(label)} <i aria-hidden="true">✦</i></span>`).join('')}
          </div>
        </section>

        <section class="section shell" aria-labelledby="featured-title">
          ${sectionHeading('Selected work', 'Writing that explains, persuades and sounds human.', 'featured-title', url('/work/'), 'View all work')}
          <div class="featured-grid">
            ${work.map((article, index) => articleCard(article, index, index === 0)).join('')}
          </div>
        </section>

        <section class="section section-ink" aria-labelledby="services-title">
          <div class="shell">
            ${sectionHeading('Services', 'From rough idea to publishable language.', 'services-title', url('/services/'), 'Explore services', true)}
            <div class="service-preview-grid">
              ${services.slice(0, 4).map((service, index) => `
                <article class="service-preview reveal">
                  <span class="service-number">0${index + 1}</span>
                  <p class="eyebrow">${escapeHtml(service.kicker)}</p>
                  <h3>${escapeHtml(service.name)}</h3>
                  <p>${escapeHtml(service.description)}</p>
                </article>`).join('')}
            </div>
          </div>
        </section>

        <section class="section shell" aria-labelledby="principles-title">
          <div class="principles-layout">
            <div class="sticky-heading reveal">
              <p class="eyebrow">How I approach the work</p>
              <h2 id="principles-title">Good writing begins before the first sentence.</h2>
              <p>It begins with the reader, the purpose and the one idea that must survive the page.</p>
            </div>
            <div class="principles-list">
              ${principles.map((principle, index) => `
                <article class="principle reveal">
                  <span>0${index + 1}</span>
                  <div><h3>${escapeHtml(principle.title)}</h3><p>${escapeHtml(principle.text)}</p></div>
                </article>`).join('')}
            </div>
          </div>
        </section>

        ${ctaSection('Have an idea that deserves clearer words?', 'Share the brief, the audience and the result you need. I will tell you honestly whether I am a good fit.', 'Start a conversation')}
      </main>`,
  });
}

function renderWork() {
  return layout({
    title: 'Selected work',
    description: `Articles, copywriting, ghostwriting, editing and essays by ${site.name}.`,
    path: '/work/',
    active: 'work',
    content: `
      <main id="main">
        ${pageHero('Selected work', 'Different forms. The same standard: make the idea clear enough to matter.', 'Portfolio')}
        <section class="section shell work-browser" aria-label="Writing portfolio">
          <div class="filter-bar reveal">
            <div class="filter-buttons" role="group" aria-label="Filter by category">
              <button class="filter-button is-active" type="button" data-filter="all">All</button>
              ${categories.map((category) => `<button class="filter-button" type="button" data-filter="${escapeAttr(category)}">${escapeHtml(category)}</button>`).join('')}
            </div>
            <label class="search-field">
              <span class="sr-only">Search writing</span>
              ${searchIcon()}
              <input id="work-search" type="search" placeholder="Search the portfolio" autocomplete="off">
            </label>
          </div>
          <p class="results-status" id="results-status" aria-live="polite"></p>
          <div class="work-grid" id="work-grid">
            ${allArticles.map((article, index) => articleCard(article, index, false, true)).join('')}
          </div>
          <div class="empty-state" id="empty-state" hidden>
            <p>No pieces match that search yet.</p>
            <button class="text-button" type="button" id="clear-filters">Clear filters</button>
          </div>
        </section>
        ${ctaSection('Looking for a specific kind of sample?', 'Send me the subject, format and audience. A relevant short test piece may be possible for a serious brief.', 'Contact me')}
      </main>`,
  });
}

function renderServices() {
  return layout({
    title: 'Services',
    description: `Writing and editing services from ${site.name}.`,
    path: '/services/',
    active: 'services',
    content: `
      <main id="main">
        ${pageHero('Writing with a clear purpose.', 'A focused set of services for people who know what they want to say—or know they need help finding it.', 'Services')}
        <section class="section shell service-list" aria-label="Writing services">
          ${services.map((service, index) => `
            <article class="service-row reveal">
              <div class="service-row-number">0${index + 1}</div>
              <div class="service-row-main">
                <p class="eyebrow">${escapeHtml(service.kicker)}</p>
                <h2>${escapeHtml(service.name)}</h2>
                <p class="service-description">${escapeHtml(service.description)}</p>
              </div>
              <div class="service-row-detail">
                <div><h3>Possible deliverables</h3><p>${escapeHtml(service.deliverables)}</p></div>
                <div><h3>Best suited to</h3><p>${escapeHtml(service.idealFor)}</p></div>
              </div>
            </article>`).join('')}
        </section>

        <section class="section section-paper-deep" aria-labelledby="process-title">
          <div class="shell">
            ${sectionHeading('Process', 'A simple path from brief to clean copy.', 'process-title')}
            <div class="process-grid">
              ${processSteps.map((step) => `
                <article class="process-card reveal">
                  <span>${escapeHtml(step.number)}</span>
                  <h3>${escapeHtml(step.title)}</h3>
                  <p>${escapeHtml(step.text)}</p>
                </article>`).join('')}
            </div>
          </div>
        </section>

        <section class="section shell note-section">
          <div class="note-card reveal">
            <p class="eyebrow">A note on ghostwriting</p>
            <h2>Your name belongs on work that genuinely represents your thinking.</h2>
            <p>I can shape interviews, notes and rough ideas into a coherent piece, but I will not invent achievements, expertise or personal experiences for a client. Confidential work stays confidential unless permission to display it is given.</p>
          </div>
        </section>
        ${ctaSection('Ready to turn the brief into a piece?', 'Include the goal, audience, approximate length, deadline and any source material you already have.', 'Send the project details')}
      </main>`,
  });
}

function renderAbout() {
  const about = Array.isArray(site.about) ? site.about : [site.shortBio];
  const interests = Array.isArray(site.interests) ? site.interests : [];
  const principles = Array.isArray(site.principles) ? site.principles : [];
  return layout({
    title: 'About',
    description: `About ${site.name}, a ${site.role.toLowerCase()} based in Malaysia.`,
    path: '/about/',
    active: 'about',
    content: `
      <main id="main">
        <section class="about-hero shell">
          <div class="about-title reveal">
            <p class="eyebrow">About</p>
            <h1>I care about the moment an idea becomes understandable.</h1>
          </div>
          <div class="about-mark reveal" aria-hidden="true">
            <span>${escapeHtml(site.monogram || initials(site.name))}</span>
            <small>${escapeHtml(site.role)}</small>
          </div>
        </section>

        <section class="section shell about-body">
          <div class="about-intro reveal">
            <p class="lead">${escapeHtml(site.shortBio)}</p>
            <div class="about-meta">
              <span>${pinIcon()} ${escapeHtml(site.location)}</span>
              <span>${sparkIcon()} ${escapeHtml(site.availability)}</span>
            </div>
          </div>
          <div class="prose about-prose reveal">
            ${about.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
          </div>
        </section>

        <section class="section section-ink" aria-labelledby="interests-title">
          <div class="shell about-columns">
            <div>
              <p class="eyebrow">Subjects I return to</p>
              <h2 id="interests-title">Curiosity gives the writing somewhere to go.</h2>
            </div>
            <ul class="interest-list">
              ${interests.map((interest, index) => `<li><span>0${index + 1}</span>${escapeHtml(interest)}</li>`).join('')}
            </ul>
          </div>
        </section>

        <section class="section shell" aria-labelledby="values-title">
          ${sectionHeading('Principles', 'The standards I want the work to meet.', 'values-title')}
          <div class="value-grid">
            ${principles.map((principle) => `<article class="value-card reveal"><h3>${escapeHtml(principle.title)}</h3><p>${escapeHtml(principle.text)}</p></article>`).join('')}
          </div>
        </section>
        ${ctaSection('The portfolio is the best introduction.', 'Read a few pieces, notice the range, then get in touch with the kind of work you need.', 'Read selected work', '/work/')}
      </main>`,
  });
}

function renderJournal() {
  return layout({
    title: 'Journal',
    description: `Articles, research explainers and essays by ${site.name}.`,
    path: '/journal/',
    active: 'journal',
    content: `
      <main id="main">
        ${pageHero('Notes, arguments and useful questions.', 'Longer writing on research, learning, technology and the discipline of making things clear.', 'Journal')}
        <section class="section shell journal-list" aria-label="Journal entries">
          ${journalArticles.length ? journalArticles.map((article, index) => journalRow(article, index)).join('') : `<p>No journal entries have been published yet.</p>`}
        </section>
        ${ctaSection('Prefer new writing in one place?', 'The RSS feed contains every published journal entry and works with most feed readers.', 'Open the RSS feed', '/rss.xml')}
      </main>`,
  });
}

function renderContact() {
  const emailReady = site.email && !site.email.includes('example.com') && !site.email.includes('your-email');
  return layout({
    title: 'Contact',
    description: `Contact ${site.name} about writing, ghostwriting, copywriting or editing work.`,
    path: '/contact/',
    active: 'contact',
    content: `
      <main id="main">
        <section class="contact-hero shell">
          <div class="reveal">
            <p class="eyebrow">Contact</p>
            <h1>Tell me what the words need to accomplish.</h1>
            <p class="lead">${escapeHtml(site.contactIntro)}</p>
          </div>
          <div class="contact-direct reveal">
            <p class="eyebrow">Direct contact</p>
            <a class="contact-link" href="mailto:${escapeAttr(site.email)}">${escapeHtml(site.email)} ${arrowIcon()}</a>
            <a class="contact-link" href="${safeExternalUrl(site.linkedin)}" target="_blank" rel="noreferrer">LinkedIn ${externalIcon()}</a>
            <p>${escapeHtml(site.location)}</p>
          </div>
        </section>

        <section class="section shell contact-layout">
          <form class="project-form reveal" id="project-form" data-email="${escapeAttr(site.email)}">
            ${!emailReady ? `<div class="setup-notice" role="note"><strong>Before publishing:</strong> replace the example email in Pages CMS under Website settings.</div>` : ''}
            <div class="form-grid">
              <label><span>Your name</span><input name="name" required autocomplete="name" placeholder="Name"></label>
              <label><span>Your email</span><input name="email" type="email" required autocomplete="email" placeholder="name@example.com"></label>
            </div>
            <div class="form-grid">
              <label><span>Type of work</span>
                <select name="projectType" required>
                  <option value="">Choose one</option>
                  ${services.map((service) => `<option>${escapeHtml(service.name)}</option>`).join('')}
                  <option>Something else</option>
                </select>
              </label>
              <label><span>Target deadline</span><input name="deadline" placeholder="For example: 15 August"></label>
            </div>
            <label><span>Project details</span><textarea name="details" required rows="8" placeholder="What are you making, who is it for, and what do you already have?"></textarea></label>
            <label><span>Budget or expected scope</span><input name="budget" placeholder="A range, word count or number of pieces is helpful"></label>
            <div class="form-submit">
              <button class="button button-primary" type="submit">Prepare email ${arrowIcon()}</button>
              <p>This form opens your email app. It does not store your information.</p>
            </div>
          </form>
          <aside class="brief-guide reveal">
            <p class="eyebrow">A useful brief includes</p>
            <ol>
              <li><span>01</span><div><strong>The reader</strong><p>Who needs to understand or act?</p></div></li>
              <li><span>02</span><div><strong>The purpose</strong><p>What should the writing change?</p></div></li>
              <li><span>03</span><div><strong>The material</strong><p>Notes, links, interviews or an existing draft.</p></div></li>
              <li><span>04</span><div><strong>The limits</strong><p>Length, deadline, platform and tone.</p></div></li>
            </ol>
            <p class="small-note">${escapeHtml(site.guardianNotice)}</p>
          </aside>
        </section>
      </main>`,
  });
}

function renderArticle(article, index) {
  const next = allArticles[index + 1];
  const previous = allArticles[index - 1];
  const toc = article.headings.filter((heading) => heading.level === 2 || heading.level === 3);
  const articleUrl = `${SITE_BASE}/writing/${article.slug}/`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    author: { '@type': 'Person', name: site.name },
    mainEntityOfPage: articleUrl,
  };
  return layout({
    title: article.title,
    description: article.description,
    path: `/writing/${article.slug}/`,
    active: '',
    bodyClass: 'page-article',
    ogType: 'article',
    extraHead: `<meta property="article:published_time" content="${escapeAttr(article.date)}"><meta property="article:section" content="${escapeAttr(article.category)}"><script type="application/ld+json">${jsonForHtml(structuredData)}</script>`,
    content: `
      <main id="main">
        <article class="article-shell">
          <header class="article-header shell reveal">
            <a class="back-link" href="${url('/work/')}">${backIcon()} Back to work</a>
            <div class="article-meta-top">
              <span>${escapeHtml(article.category)}</span>
              <time datetime="${escapeAttr(article.date)}">${formatDate(article.date)}</time>
              <span>${article.readingMinutes} min read</span>
            </div>
            <h1>${escapeHtml(article.title)}</h1>
            <p class="article-deck">${escapeHtml(article.description)}</p>
            ${article.project ? `<div class="project-facts">
              <div><span>Project</span><strong>${escapeHtml(article.project)}</strong></div>
              ${article.role ? `<div><span>Role</span><strong>${escapeHtml(article.role)}</strong></div>` : ''}
              ${article.audience ? `<div><span>Audience</span><strong>${escapeHtml(article.audience)}</strong></div>` : ''}
            </div>` : ''}
          </header>

          ${article.cover ? `<figure class="article-cover shell-wide reveal"><img src="${mediaUrl(article.cover)}" alt="" loading="eager"></figure>` : `<div class="article-divider shell" aria-hidden="true"><span>${escapeHtml(site.monogram || initials(site.name))}</span></div>`}

          <div class="article-layout shell">
            <aside class="article-aside" aria-label="Article tools">
              ${toc.length >= 2 ? `<nav class="toc"><p>In this piece</p><ol>${toc.map((heading) => `<li class="toc-level-${heading.level}"><a href="#${escapeAttr(heading.id)}">${escapeHtml(heading.text)}</a></li>`).join('')}</ol></nav>` : ''}
              <div class="article-tools">
                <button type="button" data-copy-link>${linkIcon()} Copy link</button>
                <button type="button" data-print>${printIcon()} Save as PDF</button>
              </div>
            </aside>
            <div class="prose article-prose reveal">
              ${article.html}
            </div>
          </div>

          <footer class="article-footer shell">
            <div class="article-author reveal">
              <div class="author-mark">${escapeHtml(site.monogram || initials(site.name))}</div>
              <div><p>Written by</p><h2>${escapeHtml(site.name)}</h2><p>${escapeHtml(site.shortBio)}</p></div>
            </div>
            <nav class="article-pagination" aria-label="More writing">
              ${previous ? `<a href="${url(`/writing/${previous.slug}/`)}"><span>Newer</span><strong>${escapeHtml(previous.title)}</strong></a>` : '<span></span>'}
              ${next ? `<a href="${url(`/writing/${next.slug}/`)}"><span>Older</span><strong>${escapeHtml(next.title)}</strong></a>` : '<span></span>'}
            </nav>
          </footer>
        </article>
        ${ctaSection('Need writing with this level of care?', 'Send a concise brief and I will reply with the questions that matter.', 'Discuss a project')}
      </main>`,
  });
}

function render404() {
  return layout({
    title: 'Page not found',
    description: 'The requested page could not be found.',
    path: '/404.html',
    content: `<main id="main" class="not-found shell"><p class="eyebrow">404</p><h1>This sentence leads nowhere.</h1><p>The page may have moved, or the link may be incomplete.</p><a class="button button-primary" href="${url('/')}">Return home ${arrowIcon()}</a></main>`,
  });
}

function layout({ title, description, path: pagePath, active = '', content, bodyClass = '', ogType = 'website', extraHead = '' }) {
  const fullTitle = title ? `${title} — ${site.name}` : `${site.name} — ${site.role}`;
  const canonical = canonicalUrl(pagePath);
  const colours = {
    accent: safeColour(site.accent, '#c95732'),
    accentDark: safeColour(site.accentDark, '#ff8b64'),
    paper: safeColour(site.paper, '#f4efe7'),
    ink: safeColour(site.ink, '#1d1d1b'),
  };
  const personData = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: site.name,
    jobTitle: site.role,
    url: SITE_BASE,
    sameAs: isRealUrl(site.linkedin) ? [site.linkedin] : [],
    address: { '@type': 'PostalAddress', addressLocality: site.location },
  };
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeAttr(description || site.siteDescription)}">
  <meta name="author" content="${escapeAttr(site.name)}">
  <meta name="theme-color" content="${colours.ink}">
  <link rel="canonical" href="${escapeAttr(canonical)}">
  <link rel="icon" href="${url('/favicon.svg')}" type="image/svg+xml">
  <link rel="manifest" href="${url('/site.webmanifest')}">
  <link rel="alternate" type="application/rss+xml" title="${escapeAttr(site.name)} journal" href="${url('/rss.xml')}">
  <meta property="og:type" content="${escapeAttr(ogType)}">
  <meta property="og:title" content="${escapeAttr(fullTitle)}">
  <meta property="og:description" content="${escapeAttr(description || site.siteDescription)}">
  <meta property="og:url" content="${escapeAttr(canonical)}">
  <meta property="og:image" content="${escapeAttr(`${SITE_BASE}/images/social-card.png`)}">
  <meta property="og:site_name" content="${escapeAttr(site.name)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(fullTitle)}">
  <meta name="twitter:description" content="${escapeAttr(description || site.siteDescription)}">
  <meta name="twitter:image" content="${escapeAttr(`${SITE_BASE}/images/social-card.png`)}">
  <style>:root{--accent:${colours.accent};--accent-dark:${colours.accentDark};--paper:${colours.paper};--ink:${colours.ink}}</style>
  <script>(function(){document.documentElement.classList.add('js');try{var t=localStorage.getItem('anson-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.dataset.theme='dark'}catch(e){}})();</script>
  <link rel="stylesheet" href="${url('/assets/styles.css')}">
  ${extraHead}
  <script type="application/ld+json">${jsonForHtml(personData)}</script>
</head>
<body class="${escapeAttr(bodyClass)}">
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="reading-progress" aria-hidden="true"><span></span></div>
  ${header(active)}
  ${content}
  ${footer()}
  <button class="back-to-top" type="button" aria-label="Back to top">${upIcon()}</button>
  <script>window.__ANSON_SITE__=${jsonForHtml({ email: site.email, base: BASE, name: site.name })};</script>
  <script src="${url('/assets/site.js')}" defer></script>
</body>
</html>`;
}

function header(active) {
  const nav = [
    ['work', 'Work', '/work/'],
    ['services', 'Services', '/services/'],
    ['about', 'About', '/about/'],
    ['journal', 'Journal', '/journal/'],
  ];
  return `<header class="site-header" data-header>
    <div class="header-inner shell-wide">
      <a class="brand" href="${url('/')}" aria-label="${escapeAttr(site.name)} home">
        <span class="brand-mark">${escapeHtml(site.monogram || initials(site.name))}</span>
        <span class="brand-text"><strong>${escapeHtml(site.name)}</strong><small>${escapeHtml(site.role)}</small></span>
      </a>
      <nav class="desktop-nav" aria-label="Primary navigation">
        ${nav.map(([key, label, href]) => `<a ${active === key ? 'aria-current="page"' : ''} href="${url(href)}">${label}</a>`).join('')}
      </nav>
      <div class="header-actions">
        <button class="icon-button theme-toggle" type="button" aria-label="Switch colour theme">${sunIcon()}${moonIcon()}</button>
        <a class="header-contact" href="${url('/contact/')}">Contact ${arrowIcon()}</a>
        <button class="icon-button menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu">${menuIcon()}</button>
      </div>
    </div>
    <nav class="mobile-menu" id="mobile-menu" aria-label="Mobile navigation" hidden>
      ${nav.map(([key, label, href]) => `<a ${active === key ? 'aria-current="page"' : ''} href="${url(href)}">${label}</a>`).join('')}
      <a href="${url('/contact/')}">Contact</a>
    </nav>
  </header>`;
}

function footer() {
  const year = new Date().getUTCFullYear();
  return `<footer class="site-footer">
    <div class="shell-wide footer-main">
      <div>
        <a class="footer-brand" href="${url('/')}">${escapeHtml(site.name)}</a>
        <p>${escapeHtml(site.footerLine)}</p>
      </div>
      <div class="footer-links">
        <div><p>Explore</p><a href="${url('/work/')}">Work</a><a href="${url('/services/')}">Services</a><a href="${url('/journal/')}">Journal</a></div>
        <div><p>Connect</p><a href="mailto:${escapeAttr(site.email)}">Email</a><a href="${safeExternalUrl(site.linkedin)}" target="_blank" rel="noreferrer">LinkedIn</a><a href="${url('/rss.xml')}">RSS</a></div>
      </div>
    </div>
    <div class="shell-wide footer-bottom"><span>© ${year} ${escapeHtml(site.name)}</span><span>Built for GitHub Pages · No tracking cookies</span></div>
  </footer>`;
}

function pageHero(title, intro, eyebrow) {
  return `<section class="page-hero shell">
    <p class="eyebrow reveal">${escapeHtml(eyebrow)}</p>
    <div class="page-hero-grid">
      <h1 class="reveal">${escapeHtml(title)}</h1>
      <p class="lead reveal">${escapeHtml(intro)}</p>
    </div>
  </section>`;
}

function sectionHeading(eyebrow, title, id, href = '', linkLabel = '', dark = false) {
  return `<div class="section-heading reveal ${dark ? 'section-heading-dark' : ''}">
    <div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2 id="${escapeAttr(id)}">${escapeHtml(title)}</h2></div>
    ${href ? `<a class="text-link" href="${href}">${escapeHtml(linkLabel)} ${arrowIcon()}</a>` : ''}
  </div>`;
}

function ctaSection(title, text, label, destination = '/contact/') {
  return `<section class="cta-section"><div class="shell cta-inner reveal"><div><p class="eyebrow">Next step</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></div><a class="button button-light" href="${url(destination)}">${escapeHtml(label)} ${arrowIcon()}</a></div></section>`;
}

function articleCard(article, index, large = false, filterable = false) {
  const searchable = `${article.title} ${article.description} ${article.category} ${article.project}`.toLowerCase();
  const data = filterable ? ` data-category="${escapeAttr(article.category)}" data-search="${escapeAttr(searchable)}"` : '';
  return `<article class="writing-card reveal ${large ? 'writing-card-large' : ''}"${data}>
    <a class="writing-card-link" href="${url(`/writing/${article.slug}/`)}" aria-label="Read ${escapeAttr(article.title)}"></a>
    <div class="card-visual category-${slugify(article.category)}">
      ${article.cover ? `<img src="${mediaUrl(article.cover)}" alt="" loading="lazy">` : `<span class="card-index">${String(index + 1).padStart(2, '0')}</span><span class="card-letter">${escapeHtml(article.title.charAt(0))}</span>`}
    </div>
    <div class="card-content">
      <div class="card-meta"><span>${escapeHtml(article.category)}</span><span>${article.readingMinutes} min read</span></div>
      <h3>${escapeHtml(article.title)}</h3>
      <p>${escapeHtml(article.description)}</p>
      <div class="card-footer"><time datetime="${escapeAttr(article.date)}">${formatDate(article.date, true)}</time><span>Read ${arrowIcon()}</span></div>
    </div>
  </article>`;
}

function journalRow(article, index) {
  return `<article class="journal-row reveal">
    <a class="journal-row-link" href="${url(`/writing/${article.slug}/`)}" aria-label="Read ${escapeAttr(article.title)}"></a>
    <span class="journal-number">${String(index + 1).padStart(2, '0')}</span>
    <div><div class="card-meta"><span>${escapeHtml(article.category)}</span><time datetime="${escapeAttr(article.date)}">${formatDate(article.date, true)}</time></div><h2>${escapeHtml(article.title)}</h2><p>${escapeHtml(article.description)}</p></div>
    <span class="journal-arrow">${arrowIcon()}</span>
  </article>`;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  const headings = [];
  const usedIds = new Map();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    if (/^```/.test(line.trim())) {
      const language = line.trim().slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(lines[i]); i += 1; }
      if (i < lines.length) i += 1;
      html.push(`<pre><code${language ? ` class="language-${escapeAttr(language)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawText = headingMatch[2].trim();
      const plain = stripMarkdown(rawText);
      const baseId = slugify(plain) || 'section';
      const count = usedIds.get(baseId) || 0;
      usedIds.set(baseId, count + 1);
      const id = count ? `${baseId}-${count + 1}` : baseId;
      headings.push({ level, text: plain, id });
      html.push(`<h${level} id="${escapeAttr(id)}">${renderInline(rawText)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*(---|___|\*\*\*)\s*$/.test(line)) {
      html.push('<hr>');
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      html.push(`<blockquote>${markdownToHtml(quote.join('\n')).html}</blockquote>`);
      continue;
    }

    if (/^\s*[-+*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-+*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-+*]\s+/, '')); i += 1; }
      html.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i += 1; }
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraph = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return { html: html.join('\n'), headings };
}

function renderInline(value) {
  const tokens = [];
  const tokenise = (html) => {
    const token = `@@TOKEN${tokens.length}@@`;
    tokens.push(html);
    return token;
  };

  let text = String(value);
  text = text.replace(/`([^`]+)`/g, (_, code) => tokenise(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g, (_, alt, src, title) => {
    const safe = mediaUrl(src);
    return tokenise(`<img src="${escapeAttr(safe)}" alt="${escapeAttr(alt)}"${title ? ` title="${escapeAttr(title)}"` : ''} loading="lazy">`);
  });
  text = text.replace(/\[([^\]]+)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g, (_, label, href, title) => {
    const safe = linkUrl(href);
    const external = /^https?:\/\//i.test(safe);
    return tokenise(`<a href="${escapeAttr(safe)}"${title ? ` title="${escapeAttr(title)}"` : ''}${external ? ' target="_blank" rel="noreferrer"' : ''}>${escapeHtml(label)}</a>`);
  });

  text = escapeHtml(text);
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  text = text.replace(/@@TOKEN(\d+)@@/g, (_, index) => tokens[Number(index)] || '');
  return text;
}

function parseFrontmatter(source) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { data: {}, body: source };
  return { data: parseSimpleYaml(match[1]), body: source.slice(match[0].length) };
}

function parseSimpleYaml(source) {
  const result = {};
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) { i += 1; continue; }
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) { i += 1; continue; }
    const key = match[1];
    let raw = match[2] ?? '';

    if (['|', '|-', '>', '>-'].includes(raw)) {
      const block = [];
      i += 1;
      while (i < lines.length && (lines[i].startsWith('  ') || !lines[i].trim())) {
        block.push(lines[i].replace(/^ {2}/, ''));
        i += 1;
      }
      result[key] = raw.startsWith('>') ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim();
      continue;
    }

    if (!raw && i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
      const values = [];
      i += 1;
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        values.push(parseScalar(lines[i].replace(/^\s+-\s+/, '')));
        i += 1;
      }
      result[key] = values;
      continue;
    }

    result[key] = parseScalar(raw);
    i += 1;
  }
  return result;
}

function parseScalar(raw) {
  const value = String(raw).trim();
  if (!value) return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map((item) => parseScalar(item)).filter((item) => item !== '');
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value.replace(/\s+#.*$/, '').trim();
}

function renderSitemap(pages) {
  const entries = pages.map((page) => {
    const article = page.path.startsWith('/writing/') ? allArticles.find((item) => page.path === `/writing/${item.slug}/`) : null;
    return `  <url><loc>${xmlEscape(canonicalUrl(page.path))}</loc>${article ? `<lastmod>${article.date}</lastmod>` : ''}</url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function renderRss(articles) {
  const items = articles.map((article) => `
    <item>
      <title>${xmlEscape(article.title)}</title>
      <description>${xmlEscape(article.description)}</description>
      <link>${xmlEscape(`${SITE_BASE}/writing/${article.slug}/`)}</link>
      <guid isPermaLink="true">${xmlEscape(`${SITE_BASE}/writing/${article.slug}/`)}</guid>
      <pubDate>${new Date(`${article.date}T00:00:00Z`).toUTCString()}</pubDate>
      <category>${xmlEscape(article.category)}</category>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(`${site.name} Journal`)}</title>
    <description>${xmlEscape(site.siteDescription)}</description>
    <link>${xmlEscape(SITE_BASE)}</link>
    <language>en</language>${items}
  </channel>
</rss>\n`;
}

async function writePage(route, html) {
  if (route === '/') {
    await fs.writeFile(path.join(OUT, 'index.html'), html, 'utf8');
    return;
  }
  if (route.endsWith('.html')) {
    await fs.writeFile(path.join(OUT, route.replace(/^\//, '')), html, 'utf8');
    return;
  }
  const directory = path.join(OUT, route.replace(/^\//, '').replace(/\/$/, ''));
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'index.html'), html, 'utf8');
}

async function copyDir(source, destination) {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(destination, { recursive: true });
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}

function canonicalUrl(route) {
  if (route === '/404.html') return `${SITE_BASE}/404.html`;
  return `${SITE_BASE}${route === '/' ? '/' : route}`;
}

function url(route) {
  if (/^(https?:|mailto:|tel:|#)/i.test(route)) return route;
  const clean = `/${String(route).replace(/^\/+/, '')}`;
  return `${BASE}${clean}` || '/';
}

function mediaUrl(value) {
  const src = String(value || '').trim();
  if (!src) return '';
  if (/^(https?:|data:)/i.test(src)) return src;
  if (src.startsWith('/')) return url(src);
  return url(`/${src.replace(/^\.\//, '')}`);
}

function linkUrl(value) {
  const href = String(value || '').trim();
  if (/^(https?:|mailto:|tel:|#)/i.test(href)) return href;
  if (href.startsWith('/')) return url(href);
  if (/^\.\.\//.test(href) || /^\.\//.test(href)) return href;
  return '#';
}

function safeExternalUrl(value) {
  return isRealUrl(value) ? escapeAttr(value) : '#';
}

function isRealUrl(value) {
  try {
    const parsed = new URL(String(value));
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.hostname.includes('your-profile');
  } catch { return false; }
}

function safeColour(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
}

function normaliseBase(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === '/') return '';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function trimSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normaliseDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function formatDate(value, short = false) {
  const date = new Date(`${normaliseDate(value)}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', short ? { month: 'short', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function splitTagline(value) {
  const text = String(value || '').trim();
  const comma = text.indexOf(',');
  if (comma >= 0) return { first: text.slice(0, comma + 1), second: text.slice(comma + 1).trim() };
  const words = text.split(/\s+/);
  const midpoint = Math.max(1, Math.floor(words.length / 2));
  return { first: words.slice(0, midpoint).join(' '), second: words.slice(midpoint).join(' ') };
}

function initials(value) {
  return String(value || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function titleFromSlug(value) {
  return String(value).split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function wordCount(value) {
  return (String(value).replace(/[`*_>#\[\]()!-]/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;
}

function stripMarkdown(value) {
  return String(value).replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, '').trim();
}

function isBlockStart(line) {
  const value = line.trim();
  return /^```/.test(value) || /^(#{1,4})\s+/.test(value) || /^(---|___|\*\*\*)$/.test(value) || /^>\s?/.test(value) || /^[-+*]\s+/.test(value) || /^\d+[.)]\s+/.test(value);
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function xmlEscape(value) {
  return escapeHtml(value);
}

function jsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function arrowIcon() { return '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11M11 5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function backIcon() { return '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M16 10H5m4-5-5 5 5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function externalIcon() { return '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M7 5h8v8M15 5 6 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function pinIcon() { return '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 17s5-4.6 5-9a5 5 0 1 0-10 0c0 4.4 5 9 5 9Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="8" r="1.7" fill="currentColor"/></svg>'; }
function sparkIcon() { return '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="m10 2 1.6 5.4L17 9l-5.4 1.6L10 16l-1.6-5.4L3 9l5.4-1.6L10 2Z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'; }
function searchIcon() { return '<svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'; }
function sunIcon() { return '<svg class="icon-sun" aria-hidden="true" viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M16 4l-1.4 1.4M5.4 14.6 4 16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'; }
function moonIcon() { return '<svg class="icon-moon" aria-hidden="true" viewBox="0 0 20 20"><path d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'; }
function menuIcon() { return '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 6h14M3 14h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'; }
function upIcon() { return '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 12 5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function linkIcon() { return '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="m8.2 11.8 3.6-3.6M6.1 13.9l-1 1a3 3 0 0 1-4.2-4.2l3.2-3.2a3 3 0 0 1 4.2 0M13.9 6.1l1-1a3 3 0 0 1 4.2 4.2l-3.2 3.2a3 3 0 0 1-4.2 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'; }
function printIcon() { return '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 7V2h10v5M5 14H3V8h14v6h-2M5 11h10v7H5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="14.5" cy="10" r=".7" fill="currentColor"/></svg>'; }
