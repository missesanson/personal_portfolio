(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  setupReveal();
  setupHeader();
  setupTheme();
  setupMenu();
  setupWorkFilters();
  setupContactForm();
  setupArticleTools();
  setupBackToTop();
  setupReadingProgress();

  function setupReveal() {
    const elements = [...document.querySelectorAll('.reveal')];
    if (!elements.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });

    elements.forEach((element, index) => {
      element.style.transitionDelay = `${Math.min(index % 4, 3) * 55}ms`;
      observer.observe(element);
    });
  }

  function setupHeader() {
    const header = document.querySelector('[data-header]');
    if (!header) return;
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function setupTheme() {
    const button = document.querySelector('.theme-toggle');
    if (!button) return;

    const updateLabel = () => {
      const dark = root.dataset.theme === 'dark';
      button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    };

    updateLabel();
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('anson-theme', next); } catch (_) { /* Storage may be blocked. */ }
      updateLabel();
    });
  }

  function setupMenu() {
    const button = document.querySelector('.menu-toggle');
    const menu = document.getElementById('mobile-menu');
    if (!button || !menu) return;

    const close = () => {
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Open menu');
      menu.hidden = true;
    };

    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      button.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
      menu.hidden = open;
    });

    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) close();
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 1050) close();
    });
  }

  function setupWorkFilters() {
    const grid = document.getElementById('work-grid');
    if (!grid) return;

    const cards = [...grid.querySelectorAll('[data-category]')];
    const buttons = [...document.querySelectorAll('[data-filter]')];
    const search = document.getElementById('work-search');
    const status = document.getElementById('results-status');
    const empty = document.getElementById('empty-state');
    const clear = document.getElementById('clear-filters');
    let active = 'all';

    const apply = () => {
      const query = (search?.value || '').trim().toLowerCase();
      let count = 0;
      cards.forEach((card) => {
        const categoryMatch = active === 'all' || card.dataset.category === active;
        const searchMatch = !query || (card.dataset.search || '').includes(query);
        const visible = categoryMatch && searchMatch;
        card.hidden = !visible;
        if (visible) count += 1;
      });
      if (status) status.textContent = `${count} ${count === 1 ? 'piece' : 'pieces'} shown`;
      if (empty) empty.hidden = count !== 0;
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        active = button.dataset.filter || 'all';
        buttons.forEach((item) => item.classList.toggle('is-active', item === button));
        apply();
      });
    });

    search?.addEventListener('input', apply);
    clear?.addEventListener('click', () => {
      active = 'all';
      if (search) search.value = '';
      buttons.forEach((button) => button.classList.toggle('is-active', button.dataset.filter === 'all'));
      apply();
      search?.focus();
    });

    apply();
  }

  function setupContactForm() {
    const form = document.getElementById('project-form');
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const target = form.dataset.email || window.__ANSON_SITE__?.email || '';
      if (!target || target.includes('example.com') || target.includes('your-email')) {
        window.alert('The site owner needs to replace the example email address in Website settings before this form can send enquiries.');
        return;
      }

      const data = new FormData(form);
      const name = clean(data.get('name'));
      const sender = clean(data.get('email'));
      const type = clean(data.get('projectType'));
      const deadline = clean(data.get('deadline'));
      const details = clean(data.get('details'));
      const budget = clean(data.get('budget'));
      const subject = `Writing enquiry: ${type || 'New project'} from ${name || 'Website visitor'}`;
      const body = [
        `Hello ${window.__ANSON_SITE__?.name || 'Anson'},`,
        '',
        `My name: ${name}`,
        `My email: ${sender}`,
        `Type of work: ${type}`,
        `Target deadline: ${deadline || 'Not specified'}`,
        `Budget or scope: ${budget || 'Not specified'}`,
        '',
        'Project details:',
        details,
        '',
        'Thank you.',
      ].join('\n');

      window.location.href = `mailto:${encodeURIComponent(target)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }

  function setupArticleTools() {
    const copyButton = document.querySelector('[data-copy-link]');
    const printButton = document.querySelector('[data-print]');

    copyButton?.addEventListener('click', async () => {
      const original = copyButton.textContent.trim();
      try {
        await navigator.clipboard.writeText(window.location.href);
        copyButton.lastChild.textContent = ' Copied';
      } catch (_) {
        const input = document.createElement('textarea');
        input.value = window.location.href;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        copyButton.lastChild.textContent = ' Copied';
      }
      window.setTimeout(() => {
        const textNode = [...copyButton.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
        if (textNode) textNode.textContent = ` ${original.replace(/^\s*/, '')}`;
      }, 1800);
    });

    printButton?.addEventListener('click', () => window.print());
  }

  function setupBackToTop() {
    const button = document.querySelector('.back-to-top');
    if (!button) return;
    const update = () => button.classList.toggle('is-visible', window.scrollY > 700);
    update();
    window.addEventListener('scroll', update, { passive: true });
    button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }));
  }

  function setupReadingProgress() {
    const bar = document.querySelector('.page-article .reading-progress span');
    if (!bar) return;
    const update = () => {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      const progress = height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0;
      bar.style.width = `${progress * 100}%`;
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  function clean(value) {
    return String(value || '').trim();
  }
})();
