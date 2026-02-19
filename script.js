// ==UserScript==
// @name         Bazoš Infinite Scroll (inzeráty)
// @namespace    https://github.com/gloglas/Bazos.cz_infinite_scroll
// @version      1.0.0
// @description  Infinite scroll for Bazoš listing page
// @author       gloglas
//
// @match        https://*.bazos.cz/*
// @match        http://*.bazos.cz/*
//
// @include      https://*.bazos.cz/*/??*/?*
// @include      https://*.bazos.cz/*/?*
//
// @run-at       document-idle
// @grant        none
//
// Update/install links (Tampermonkey uses these to update)
// @downloadURL  https://raw.githubusercontent.com/gloglas/Bazos.cz_infinite_scroll/main/script.js
// @updateURL    https://raw.githubusercontent.com/gloglas/Bazos.cz_infinite_scroll/main/script.js
// @homepageURL  https://github.com/gloglas/Bazos.cz_infinite_scroll
// @supportURL   https://github.com/gloglas/Bazos.cz_infinite_scroll/issues
// ==/UserScript==

(() => {
  'use strict';
  const ITEM_SELECTOR = 'div.inzeraty.inzeratyflex';
  const PAGINATION_SELECTOR = 'div.strankovani';
  const UPDATE_URL_TO_LATEST_LOADED_PAGE = true; 
  const pagination = document.querySelector(PAGINATION_SELECTOR);
  const firstItem = document.querySelector(ITEM_SELECTOR);
  if (!firstItem) return;
  const insertParent =
    (pagination && pagination.parentNode) ? pagination.parentNode : firstItem.parentNode;
  const status = document.createElement('div');
  status.style.cssText = 'padding:12px 0;text-align:center;font:14px/1.3 sans-serif;opacity:.75;';
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
    const nextA = Array.from(pag.querySelectorAll('a'))
      .find(a => a.textContent.trim().includes('Další'));
    const href = nextA?.getAttribute('href');
    return href ? new URL(href, location.href).toString() : null;
  }
  function getCurrentPageUrlFromDoc(doc) {
    const pag = doc.querySelector(PAGINATION_SELECTOR);
    if (!pag) return null;
    const links = Array.from(pag.querySelectorAll('a[href]'));
    const prev = links.find(a => a.textContent.trim().includes('Předchozí'));
    const next = links.find(a => a.textContent.trim().includes('Další'));
    if (next) {
      return null;
    }
    if (prev) return null;
    return null;
  }
  const seen = new Set(
    Array.from(document.querySelectorAll(`${ITEM_SELECTOR} h2 a[href]`))
      .map(a => a.getAttribute('href'))
      .filter(Boolean)
  );
  let nextUrl = getNextUrlFromDoc(document);
  let loading = false;
  async function loadMore() {
    if (loading || !nextUrl) return;
    loading = true;
    status.textContent = 'Načítám další inzeráty…';
    const loadedPageUrl = nextUrl;
    try {
      const res = await fetch(loadedPageUrl, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const items = Array.from(doc.querySelectorAll(ITEM_SELECTOR));
      if (!items.length) {
        nextUrl = null;
        status.textContent = 'Konec (žádné další položky).';
        observer.disconnect();
        return;
      }
      let appended = 0;
      for (const node of items) {
        const link = node.querySelector('h2 a[href]')?.getAttribute('href') || '';
        if (link && seen.has(link)) continue;
        if (link) seen.add(link);
        insertParent.insertBefore(document.importNode(node, true), sentinel);
        appended++;
      }
      const newPagination = doc.querySelector(PAGINATION_SELECTOR);
      if (pagination && newPagination) {
        pagination.innerHTML = newPagination.innerHTML;
      }
      if (UPDATE_URL_TO_LATEST_LOADED_PAGE) {
        history.replaceState(null, '', loadedPageUrl);
      }
      const newNext = getNextUrlFromDoc(doc);
      nextUrl = (newNext && newNext !== loadedPageUrl) ? newNext : null;
      if (!nextUrl) {
        status.textContent = 'Konec (žádné další položky).';
        observer.disconnect();
      } else {
        status.textContent = appended ? '' : 'Načítám další…';
      }
    } catch (err) {
      console.error('Infinite scroll error:', err);
      status.textContent = 'Chyba při načítání. Scrollněte znovu.';
    } finally {
      loading = false;
    }
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some(e => e.isIntersecting)) loadMore();
    },
    { root: null, rootMargin: '800px 0px', threshold: 0 }
  );
  if (!nextUrl) {
    status.textContent = 'Konec (žádné další položky).';
    return;
  }
  observer.observe(sentinel);
})();
