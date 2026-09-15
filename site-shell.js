/* Site shell: header, tabs, left navigation panel, "On this page" panel, breadcrumb, mobile drawer and footer.
 * Every page shares the navigation list below. Pages provide empty mount points
 * (#site-header, #site-nav, #site-toc, #site-breadcrumb, #site-footer) and load this script last. */
(function () {
  'use strict';

  const SITE_TITLE = 'Danish Us-Salam';
  const SITE_SUBTITLE = 'Economist';
  const NAV = [
    { label: 'Home', href: 'index.html' },
    { label: 'Research', children: [
      { label: 'Publications', href: 'publications.html' },
      { label: 'Work in Progress', href: 'wip.html' }
    ] },
    { label: 'Consultancy', href: 'consultancy.html' },
    { label: 'Research Tools', href: 'research-tools.html', children: [
      { label: 'Search Term Generator', href: 'search-term-generator.html' },
      { label: 'Prompt Generator', href: 'prompt-generator.html' },
      { label: 'Survey Design Assistant', href: 'survey-design.html' },
      { label: 'Power Calculator', href: 'power-calculator.html' }
    ] }
  ];
  const TABS = [
    { label: 'Home', href: 'index.html', pages: ['index.html', ''] },
    { label: 'Publications', href: 'publications.html', pages: ['publications.html'] },
    { label: 'Work in Progress', href: 'wip.html', pages: ['wip.html'] },
    { label: 'Consultancy', href: 'consultancy.html', pages: ['consultancy.html'] },
    { label: 'Research Tools', href: 'research-tools.html', pages: ['research-tools.html', 'search-term-generator.html', 'prompt-generator.html', 'survey-design.html', 'power-calculator.html'] }
  ];
  const CONTACT = [
    { label: 'ussalamd@tcd.ie', href: 'mailto:ussalamd@tcd.ie' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/danishussalam/' },
    { label: 'Twitter / X', href: 'https://twitter.com/DanishUsSalam2' },
    { label: 'Google Scholar', href: 'https://scholar.google.com/citations?user=danishussalam' }
  ];
  const MENU_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg>';
  const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>';

  const current = document.body.dataset.current || location.pathname.split('/').pop() || 'index.html';
  const $ = id => document.getElementById(id);

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v);
    });
    (children || []).forEach(c => { if (c) e.appendChild(c); });
    return e;
  }

  function navLink(item) {
    const a = el('a', { class: 'site-nav__link', href: item.href, text: item.label });
    if (item.href === current) a.setAttribute('aria-current', 'page');
    return a;
  }

  function navList() {
    return el('ul', { class: 'site-nav__list' }, NAV.map(item => el('li', { class: 'site-nav__item' }, [
      item.href ? navLink(item) : el('span', { class: 'site-nav__group', text: item.label }),
      item.children ? el('ul', { class: 'site-nav__sublist' }, item.children.map(c => el('li', { class: 'site-nav__item' }, [navLink(c)]))) : null
    ])));
  }

  function renderHeader() {
    const mount = $('site-header');
    if (!mount) return;
    mount.classList.add('site-header');
    const menuBtn = el('button', { class: 'site-menu-btn', type: 'button', 'aria-label': 'Open navigation', 'aria-controls': 'site-drawer', 'aria-expanded': 'false' });
    menuBtn.innerHTML = MENU_ICON;
    const title = el('a', { class: 'site-header__title', href: 'index.html' }, [
      document.createTextNode(SITE_TITLE),
      el('span', { class: 'site-header__subtitle', text: ' · ' + SITE_SUBTITLE })
    ]);
    const tabs = el('nav', { class: 'site-tabs', 'aria-label': 'Main' }, TABS.map(t => {
      const a = el('a', { class: 'site-tabs__link', href: t.href, text: t.label });
      if (t.pages.includes(current)) a.setAttribute('aria-current', 'page');
      return a;
    }));
    mount.append(
      el('a', { class: 'skip-link', href: '#main', text: 'Skip to content' }),
      el('div', { class: 'site-header__row' }, [menuBtn, title]),
      el('div', { class: 'site-tabs-bar' }, [tabs])
    );

    const closeBtn = el('button', { class: 'site-drawer__close', type: 'button', 'aria-label': 'Close navigation' });
    closeBtn.innerHTML = CLOSE_ICON;
    const scrim = el('div', { class: 'site-drawer__scrim' });
    const drawer = el('div', { class: 'site-drawer', id: 'site-drawer', 'data-open': 'false' }, [
      scrim,
      el('nav', { class: 'site-drawer__panel', 'aria-label': 'Site' }, [
        el('div', { class: 'site-drawer__head' }, [el('span', { class: 'site-drawer__title', text: SITE_TITLE }), closeBtn]),
        navList()
      ])
    ]);
    document.body.appendChild(drawer);
    const setOpen = open => {
      drawer.dataset.open = String(open);
      menuBtn.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) closeBtn.focus(); else menuBtn.focus();
    };
    menuBtn.addEventListener('click', () => setOpen(true));
    closeBtn.addEventListener('click', () => setOpen(false));
    scrim.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.dataset.open === 'true') setOpen(false); });
  }

  function renderNav() {
    const mount = $('site-nav');
    if (mount) mount.appendChild(el('nav', { 'aria-label': 'Site sections' }, [navList()]));
  }

  const slug = s => s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);

  function renderToc() {
    const mount = $('site-toc');
    if (!mount) return;
    const heads = [...document.querySelectorAll('#main .section-title')];
    if (!heads.length) { mount.style.visibility = 'hidden'; return; }
    const links = heads.map(h => {
      if (!h.id) h.id = slug(h.textContent);
      return el('a', { class: 'site-toc__link', href: '#' + h.id, text: h.textContent.trim() });
    });
    mount.appendChild(el('nav', { 'aria-label': 'On this page' }, [
      el('p', { class: 'site-toc__title', text: 'On this page' }),
      el('ul', { class: 'site-toc__list' }, links.map(a => el('li', {}, [a])))
    ]));
    if (!('IntersectionObserver' in window)) return;
    const visible = new Set();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) visible.add(en.target.id); else visible.delete(en.target.id); });
      const first = heads.find(h => visible.has(h.id));
      if (!first) return;
      links.forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + first.id));
      links.forEach(a => { if (a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'true'); });
    }, { rootMargin: '-100px 0px -55% 0px' });
    heads.forEach(h => observer.observe(h));
  }

  function renderBreadcrumb() {
    const mount = $('site-breadcrumb');
    if (!mount) return;
    let trail = [];
    NAV.forEach(item => {
      if (item.href === current) trail = [item];
      (item.children || []).forEach(c => { if (c.href === current) trail = [item, c]; });
    });
    const parts = [{ label: 'Home', href: 'index.html' }].concat(trail.filter(t => t.href !== 'index.html'));
    mount.classList.add('site-breadcrumb');
    mount.setAttribute('aria-label', 'Breadcrumb');
    mount.appendChild(el('ol', {}, parts.map((p, i) => {
      const last = i === parts.length - 1;
      return el('li', {}, [last || !p.href ? el('span', { text: p.label, 'aria-current': last ? 'page' : null }) : el('a', { href: p.href, text: p.label })]);
    })));
  }

  function renderFooter() {
    const mount = $('site-footer');
    if (!mount) return;
    mount.classList.add('site-footer');
    mount.appendChild(el('div', { class: 'site-footer__row' }, [
      el('div', {}, [
        el('p', { class: 'site-footer__name', text: SITE_TITLE }),
        el('p', { text: 'Economist · Central Bank of Ireland · Dublin, Ireland' })
      ]),
      el('ul', { class: 'site-footer__links' }, CONTACT.map(c => el('li', {}, [
        el('a', { href: c.href, text: c.label, target: c.href.startsWith('http') ? '_blank' : null, rel: c.href.startsWith('http') ? 'noopener' : null })
      ])))
    ]));
  }

  renderHeader();
  renderNav();
  renderToc();
  renderBreadcrumb();
  renderFooter();
  window.SiteShell = { NAV, TABS, current };
})();
