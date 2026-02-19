// ==UserScript==
// @name         Bazos Infinite Scroll (inzeraty)
// @namespace    local
// @version      1.0
// @match        *://*.bazos.cz/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const ITEM_SELECTOR = 'div.inzeraty.inzeratyflex';
  const PAGINATION_SELECTOR = 'div.strankovani';

  const pagination = document.querySelector(PAGINATION_SELECTOR);
  const firstItem = document.querySelector(ITEM_SELECTOR);
  if (!firstItem) return;

  const insertParent = (pagination && pagination.parentNode) ? pagination.parentNode : firstItem.parentNode;

  const status = document.createElement('div');
  status.style.cssText = 'padding:12px 0; text-align:center; font:14px/1.3 sans-serif; opacity:.75;';
  const sentinel = document.createElement('div');
  sentinel.style.cssText = 'height:1px;';

  if (pagination) {
    insertParent.insertBefore(status, pagination);
    insertParent.insertBefore(sentinel, pagination);
  } else {
    insertParent.appendChild(status);
    insertParent.appendChild(sentinel);
  }

  function getNextUrlFromDoc(doc) {
    const pag = doc.querySelector(PAGINATION_SELECTOR);
    if (!pag) return null;
    const nextA = Array.from(pag.querySelectorAll('a')).find(a => a.textContent.trim().includes('Další'));
    if (!nextA) return null;
    const href = nextA.getAttribute('href');
    return href ? new URL(href, location.href).toString() : null;
  }

  let nextUrl = getNextUrlFromDoc(document);
  let loading = false;

  const seen = new Set(
    Array.from(document.querySelectorAll(`${ITEM_SELECTOR} h2 a[href]`))
      .map(a => a.getAttribute('href'))
      .filter(Boolean)
  );

  async function loadMore() {
    if (loading || !nextUrl) return;
    loading = true;
    status.textContent = 'Načítám další inzeráty…';

    try {
      const res = await fetch(nextUrl, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const items = Array.from(doc.querySelectorAll(ITEM_SELECTOR));
      if (!items.length) {
        nextUrl = null;
        status.textContent = 'Konec.';
        observer.disconnect();
        return;
      }

      for (const node of items) {
        const link = node.querySelector('h2 a[href]')?.getAttribute('href') || '';
        if (link && seen.has(link)) continue;
        if (link) seen.add(link);

        insertParent.insertBefore(document.importNode(node, true), sentinel);
      }

      const newNext = getNextUrlFromDoc(doc);
      nextUrl = (newNext && newNext !== nextUrl) ? newNext : null;

      if (!nextUrl) {
        status.textContent = 'Konec.';
        observer.disconnect();
      } else {
        status.textContent = '';
      }
    } catch (e) {
      console.error(e);
      status.textContent = 'Chyba při načítání. Scrollněte znovu.';
    } finally {
      loading = false;
    }
  }

  const observer = new IntersectionObserver(
    (entries) => entries.some(e => e.isIntersecting) && loadMore(),
    { rootMargin: '800px 0px' }
  );

  if (nextUrl) observer.observe(sentinel);
  else status.textContent = 'Konec.';
})();
