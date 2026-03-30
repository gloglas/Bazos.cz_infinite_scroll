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

  const STORAGE_KEY = 'bazosInfiniteScrollState_v2';

  const pagination = document.querySelector(PAGINATION_SELECTOR);
  const firstItem = document.querySelector(ITEM_SELECTOR);
  if (!firstItem) return;

  const insertParent = (pagination && pagination.parentNode)
    ? pagination.parentNode
    : firstItem.parentNode;

  const status = document.createElement('div');
  status.style.cssText = 'padding:12px 0;text-align:center;font:14px/1.3 sans-serif;opacity:.75;';

  const sentinel = document.createElement('div');
  sentinel.style.cssText = 'height:1px;';

  // ---------- storage ----------

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeJsonParse(raw, {});
    const state = (parsed && typeof parsed === 'object') ? parsed : {};

    return {
      bannedItems: state.bannedItems && typeof state.bannedItems === 'object' ? state.bannedItems : {},
      bannedPriceRanges: Array.isArray(state.bannedPriceRanges) ? state.bannedPriceRanges : []
    };
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- helpers ----------

  function buttonStyle(extra = '') {
    return [
      'padding:4px 8px',
      'border:1px solid #bbb',
      'background:#f7f7f7',
      'cursor:pointer',
      'border-radius:4px',
      extra
    ].join(';');
  }

  function inputStyle(extra = '') {
    return [
      'padding:4px 6px',
      'border:1px solid #bbb',
      'border-radius:4px',
      'font:13px sans-serif',
      extra
    ].join(';');
  }

  function banButtonStyle() {
    return [
      'margin-left:8px',
      'padding:2px 6px',
      'font-size:12px',
      'line-height:1.2',
      'border:1px solid #c66',
      'background:#fff0f0',
      'color:#900',
      'cursor:pointer',
      'border-radius:4px'
    ].join(';');
  }

  function normalizeUrl(url) {
    if (!url) return '';
    try {
      return new URL(url, location.href).toString();
    } catch {
      return String(url).trim();
    }
  }

  function getItemLink(node) {
    return node.querySelector('h2 a[href]')?.getAttribute('href') || '';
  }

  function getAbsoluteItemUrl(nodeOrHref) {
    if (!nodeOrHref) return '';
    const href = typeof nodeOrHref === 'string' ? nodeOrHref : getItemLink(nodeOrHref);
    return normalizeUrl(href);
  }

  function getItemTitle(node) {
    return node.querySelector('h2')?.textContent?.trim() || 'Bez názvu';
  }

  function getItemImage(node) {
    const img = node.querySelector('img');
    const src = img?.getAttribute('src') || img?.getAttribute('data-src') || '';
    return src ? normalizeUrl(src) : '';
  }

  function findPriceContainer(node) {
    return node.querySelector('.inzeratycena') ||
      Array.from(node.querySelectorAll('div,span,b,strong'))
        .find(el => /Kč|CZK|,-/.test(el.textContent || '')) ||
      null;
  }

  function parsePriceTextToNumber(text) {
    if (!text) return null;
    const cleaned = String(text)
      .replace(/\u00a0/g, ' ')
      .replace(/[^\d]/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function getItemPrice(node) {
    const priceNode = findPriceContainer(node);
    if (!priceNode) return null;
    return parsePriceTextToNumber(priceNode.textContent || '');
  }

  function getNextUrlFromDoc(doc) {
    const pag = doc.querySelector(PAGINATION_SELECTOR);
    if (!pag) return null;
    const nextA = Array.from(pag.querySelectorAll('a'))
      .find(a => a.textContent.trim().includes('Další'));
    return nextA ? normalizeUrl(nextA.getAttribute('href')) : null;
  }

  function isPriceInRange(price, range) {
    if (price == null) return false;
    const min = Number.isFinite(range.min) ? range.min : null;
    const max = Number.isFinite(range.max) ? range.max : null;

    if (min != null && price < min) return false;
    if (max != null && price > max) return false;
    return true;
  }

  function isBannedByPrice(price) {
    return state.bannedPriceRanges.some(range => isPriceInRange(price, range));
  }

  function isItemBanned(url) {
    return !!(url && state.bannedItems[url]);
  }

  function shouldHideItem(node) {
    const url = getAbsoluteItemUrl(node);
    const price = getItemPrice(node);
    return isItemBanned(url) || isBannedByPrice(price);
  }

  // ---------- panel ----------

  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:relative',
    'z-index:10',
    'background:#fff',
    'border:1px solid #ddd',
    'padding:10px',
    'margin:10px 0',
    'font:14px/1.4 sans-serif',
    'box-shadow:0 2px 8px rgba(0,0,0,.08)'
  ].join(';');

  const panelTitle = document.createElement('div');
  panelTitle.textContent = 'BAN tools';
  panelTitle.style.cssText = 'font-weight:bold;margin-bottom:8px;';

  const controlsRow = document.createElement('div');
  controlsRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;';

  const reviewBtn = document.createElement('button');
  reviewBtn.type = 'button';
  reviewBtn.textContent = 'Review bans';
  reviewBtn.style.cssText = buttonStyle();

  const clearAllBtn = document.createElement('button');
  clearAllBtn.type = 'button';
  clearAllBtn.textContent = 'Clear all bans';
  clearAllBtn.style.cssText = buttonStyle();

  const counts = document.createElement('span');
  counts.style.cssText = 'opacity:.75;';

  controlsRow.appendChild(reviewBtn);
  controlsRow.appendChild(clearAllBtn);
  controlsRow.appendChild(counts);

  const unbanUrlRow = document.createElement('div');
  unbanUrlRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;';

  const unbanUrlLabel = document.createElement('span');
  unbanUrlLabel.textContent = 'Unban by URL:';

  const unbanUrlInput = document.createElement('input');
  unbanUrlInput.type = 'text';
  unbanUrlInput.placeholder = 'Paste listing URL here';
  unbanUrlInput.style.cssText = inputStyle('min-width:320px;flex:1 1 320px;');

  const unbanUrlBtn = document.createElement('button');
  unbanUrlBtn.type = 'button';
  unbanUrlBtn.textContent = 'Unban URL';
  unbanUrlBtn.style.cssText = buttonStyle();

  unbanUrlRow.appendChild(unbanUrlLabel);
  unbanUrlRow.appendChild(unbanUrlInput);
  unbanUrlRow.appendChild(unbanUrlBtn);

  const priceBanRow = document.createElement('div');
  priceBanRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;';

  const priceBanLabel = document.createElement('span');
  priceBanLabel.textContent = 'Ban price range:';

  const minPriceInput = document.createElement('input');
  minPriceInput.type = 'number';
  minPriceInput.placeholder = 'Min';
  minPriceInput.min = '0';
  minPriceInput.style.cssText = inputStyle('width:110px;');

  const maxPriceInput = document.createElement('input');
  maxPriceInput.type = 'number';
  maxPriceInput.placeholder = 'Max';
  maxPriceInput.min = '0';
  maxPriceInput.style.cssText = inputStyle('width:110px;');

  const addPriceRangeBtn = document.createElement('button');
  addPriceRangeBtn.type = 'button';
  addPriceRangeBtn.textContent = 'Add price ban';
  addPriceRangeBtn.style.cssText = buttonStyle();

  const applyPriceRangeBtn = document.createElement('button');
  applyPriceRangeBtn.type = 'button';
  applyPriceRangeBtn.textContent = 'Ban loaded in range';
  applyPriceRangeBtn.style.cssText = buttonStyle();

  priceBanRow.appendChild(priceBanLabel);
  priceBanRow.appendChild(minPriceInput);
  priceBanRow.appendChild(maxPriceInput);
  priceBanRow.appendChild(addPriceRangeBtn);
  priceBanRow.appendChild(applyPriceRangeBtn);

  const reviewBox = document.createElement('div');
  reviewBox.style.cssText = 'display:none;border-top:1px solid #eee;padding-top:10px;';

  panel.appendChild(panelTitle);
  panel.appendChild(controlsRow);
  panel.appendChild(unbanUrlRow);
  panel.appendChild(priceBanRow);
  panel.appendChild(reviewBox);

  insertParent.insertBefore(panel, insertParent.firstChild);

  if (pagination) {
    insertParent.insertBefore(status, pagination);
    insertParent.insertBefore(sentinel, pagination);
  } else {
    insertParent.appendChild(status);
    insertParent.appendChild(sentinel);
  }

  // ---------- ban/unban ----------

  function hideItem(node) {
    node.style.display = 'none';
  }

  function showItem(node) {
    node.style.display = '';
  }

  function applyBanState(node) {
    if (shouldHideItem(node)) {
      hideItem(node);
      return true;
    }
    showItem(node);
    return false;
  }

  function banItem(node) {
    const url = getAbsoluteItemUrl(node);
    if (!url) return;

    state.bannedItems[url] = {
      title: getItemTitle(node),
      image: getItemImage(node),
      price: getItemPrice(node),
      bannedAt: Date.now()
    };
    saveState();

    hideItem(node);
    updateReviewBox();
  }

  function unbanItem(url) {
    const normalized = normalizeUrl(url);
    if (!normalized || !state.bannedItems[normalized]) return false;

    delete state.bannedItems[normalized];
    saveState();

    const item = Array.from(document.querySelectorAll(ITEM_SELECTOR))
      .find(n => getAbsoluteItemUrl(n) === normalized);

    if (item && !isBannedByPrice(getItemPrice(item))) {
      showItem(item);
    }

    updateReviewBox();
    return true;
  }

  function addPriceRangeBan(min, max) {
    const minVal = Number.isFinite(min) ? min : null;
    const maxVal = Number.isFinite(max) ? max : null;

    if (minVal == null && maxVal == null) return false;
    if (minVal != null && maxVal != null && minVal > maxVal) return false;

    const exists = state.bannedPriceRanges.some(r => r.min === minVal && r.max === maxVal);
    if (exists) return true;

    state.bannedPriceRanges.push({
      min: minVal,
      max: maxVal,
      createdAt: Date.now()
    });
    saveState();
    updateReviewBox();
    return true;
  }

  function removePriceRangeBan(index) {
    if (index < 0 || index >= state.bannedPriceRanges.length) return;
    state.bannedPriceRanges.splice(index, 1);
    saveState();

    document.querySelectorAll(ITEM_SELECTOR).forEach(node => {
      if (!isItemBanned(getAbsoluteItemUrl(node))) {
        applyBanState(node);
      }
    });

    updateReviewBox();
  }

  function banLoadedItemsInRange(min, max) {
    let count = 0;
    document.querySelectorAll(ITEM_SELECTOR).forEach(node => {
      const price = getItemPrice(node);
      if (!isPriceInRange(price, { min, max })) return;

      const url = getAbsoluteItemUrl(node);
      if (!url) return;

      state.bannedItems[url] = {
        title: getItemTitle(node),
        image: getItemImage(node),
        price,
        bannedAt: Date.now()
      };
      hideItem(node);
      count++;
    });

    saveState();
    updateReviewBox();
    return count;
  }

  function formatRange(range) {
    const parts = [];
    if (range.min != null) parts.push(`min ${range.min}`);
    if (range.max != null) parts.push(`max ${range.max}`);
    return parts.length ? parts.join(', ') : 'all';
  }

  // ---------- review UI ----------

  function updateReviewBox() {
    const bannedEntries = Object.entries(state.bannedItems);
    counts.textContent = `${bannedEntries.length} item bans, ${state.bannedPriceRanges.length} price bans`;

    reviewBox.innerHTML = '';

    const itemSection = document.createElement('div');
    const itemHeader = document.createElement('div');
    itemHeader.textContent = 'Banned items';
    itemHeader.style.cssText = 'font-weight:bold;margin-bottom:8px;';
    itemSection.appendChild(itemHeader);

    if (!bannedEntries.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No banned items.';
      empty.style.cssText = 'opacity:.7;margin-bottom:12px;';
      itemSection.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:16px;';

      bannedEntries
        .sort((a, b) => (b[1]?.bannedAt || 0) - (a[1]?.bannedAt || 0))
        .forEach(([url, meta]) => {
          const row = document.createElement('div');
          row.style.cssText = [
            'display:flex',
            'gap:10px',
            'align-items:flex-start',
            'border:1px solid #eee',
            'padding:8px',
            'border-radius:6px'
          ].join(';');

          const thumbWrap = document.createElement('div');
          thumbWrap.style.cssText = 'width:84px;flex:0 0 84px;';

          if (meta?.image) {
            const img = document.createElement('img');
            img.src = meta.image;
            img.alt = meta?.title || '';
            img.style.cssText = 'width:84px;height:64px;object-fit:cover;border:1px solid #ddd;border-radius:4px;';
            thumbWrap.appendChild(img);
          }

          const content = document.createElement('div');
          content.style.cssText = 'flex:1 1 auto;min-width:0;';

          const title = document.createElement('div');
          title.textContent = meta?.title || 'Bez názvu';
          title.style.cssText = 'font-weight:bold;margin-bottom:4px;';

          const link = document.createElement('a');
          link.href = url;
          link.textContent = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.style.cssText = 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px;';

          const price = document.createElement('div');
          price.textContent = meta?.price != null ? `Price: ${meta.price}` : 'Price: unknown';
          price.style.cssText = 'font-size:12px;opacity:.75;margin-bottom:6px;';

          const actions = document.createElement('div');
          actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.textContent = 'Remove ban';
          removeBtn.style.cssText = buttonStyle();
          removeBtn.addEventListener('click', () => unbanItem(url));

          const fillUrlBtn = document.createElement('button');
          fillUrlBtn.type = 'button';
          fillUrlBtn.textContent = 'Copy URL to unban box';
          fillUrlBtn.style.cssText = buttonStyle();
          fillUrlBtn.addEventListener('click', () => {
            unbanUrlInput.value = url;
            unbanUrlInput.focus();
          });

          actions.appendChild(removeBtn);
          actions.appendChild(fillUrlBtn);

          content.appendChild(title);
          content.appendChild(link);
          content.appendChild(price);
          content.appendChild(actions);

          row.appendChild(thumbWrap);
          row.appendChild(content);
          list.appendChild(row);
        });

      itemSection.appendChild(list);
    }

    const rangeSection = document.createElement('div');
    const rangeHeader = document.createElement('div');
    rangeHeader.textContent = 'Banned price ranges';
    rangeHeader.style.cssText = 'font-weight:bold;margin-bottom:8px;';
    rangeSection.appendChild(rangeHeader);

    if (!state.bannedPriceRanges.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No banned price ranges.';
      empty.style.cssText = 'opacity:.7;';
      rangeSection.appendChild(empty);
    } else {
      const rangeList = document.createElement('div');
      rangeList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

      state.bannedPriceRanges
        .slice()
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .forEach((range) => {
          const realIndex = state.bannedPriceRanges.findIndex(r =>
            r.min === range.min && r.max === range.max && r.createdAt === range.createdAt
          );

          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid #eee;padding:8px;border-radius:6px;';

          const text = document.createElement('div');
          text.textContent = formatRange(range);

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.textContent = 'Remove price ban';
          removeBtn.style.cssText = buttonStyle();
          removeBtn.addEventListener('click', () => removePriceRangeBan(realIndex));

          row.appendChild(text);
          row.appendChild(removeBtn);
          rangeList.appendChild(row);
        });

      rangeSection.appendChild(rangeList);
    }

    reviewBox.appendChild(itemSection);
    reviewBox.appendChild(rangeSection);
  }

  reviewBtn.addEventListener('click', () => {
    reviewBox.style.display = reviewBox.style.display === 'none' ? 'block' : 'none';
  });

  clearAllBtn.addEventListener('click', () => {
    state = {
      bannedItems: {},
      bannedPriceRanges: []
    };
    saveState();

    document.querySelectorAll(ITEM_SELECTOR).forEach(node => showItem(node));
    updateReviewBox();
  });

  unbanUrlBtn.addEventListener('click', () => {
    const value = normalizeUrl(unbanUrlInput.value.trim());
    if (!value) return;
    const ok = unbanItem(value);
    if (ok) {
      unbanUrlInput.value = '';
    } else {
      alert('URL not found in banned items.');
    }
  });

  function readRangeInputs() {
    const minRaw = minPriceInput.value.trim();
    const maxRaw = maxPriceInput.value.trim();

    const min = minRaw === '' ? null : Number(minRaw);
    const max = maxRaw === '' ? null : Number(maxRaw);

    if (minRaw !== '' && !Number.isFinite(min)) return { ok: false };
    if (maxRaw !== '' && !Number.isFinite(max)) return { ok: false };
    if (min != null && max != null && min > max) return { ok: false };

    return { ok: true, min, max };
  }

  addPriceRangeBtn.addEventListener('click', () => {
    const range = readRangeInputs();
    if (!range.ok) {
      alert('Invalid price range.');
      return;
    }

    const added = addPriceRangeBan(range.min, range.max);
    if (!added) {
      alert('Invalid price range.');
      return;
    }

    document.querySelectorAll(ITEM_SELECTOR).forEach(node => applyBanState(node));
  });

  applyPriceRangeBtn.addEventListener('click', () => {
    const range = readRangeInputs();
    if (!range.ok) {
      alert('Invalid price range.');
      return;
    }

    addPriceRangeBan(range.min, range.max);
    const count = banLoadedItemsInRange(range.min, range.max);
    alert(`Banned ${count} loaded offering(s) in selected range.`);
  });

  // ---------- item enhancement ----------

  function addBanButton(node) {
    if (node.dataset.banEnhanced === '1') return;
    node.dataset.banEnhanced = '1';

    const priceContainer = findPriceContainer(node);
    if (!priceContainer) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'BAN';
    btn.style.cssText = banButtonStyle();
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      banItem(node);
    });

    priceContainer.appendChild(btn);
  }

  function enhanceItem(node) {
    addBanButton(node);
    applyBanState(node);
  }

  updateReviewBox();

  // ---------- initial items ----------

  const seen = new Set(
    Array.from(document.querySelectorAll(`${ITEM_SELECTOR} h2 a[href]`))
      .map(a => normalizeUrl(a.getAttribute('href')))
      .filter(Boolean)
  );

  document.querySelectorAll(ITEM_SELECTOR).forEach(enhanceItem);

  // ---------- infinite scroll ----------

  let nextUrl = getNextUrlFromDoc(document);
  let loading = false;

  async function loadMore() {
    if (loading || !nextUrl) return;
    loading = true;

    let pagesTried = 0;

    try {
      while (nextUrl) {
        pagesTried++;
        status.textContent = 'Načítám další inzeráty…';

        const loadedPageUrl = nextUrl;
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

        let visibleAppended = 0;
        let totalAppended = 0;

        for (const node of items) {
          const absLink = getAbsoluteItemUrl(node);
          if (absLink && seen.has(absLink)) continue;
          if (absLink) seen.add(absLink);

          const imported = document.importNode(node, true);
          enhanceItem(imported);
          insertParent.insertBefore(imported, sentinel);
          totalAppended++;

          if (imported.style.display !== 'none') {
            visibleAppended++;
          }
        }

        const newPagination = doc.querySelector(PAGINATION_SELECTOR);
        if (pagination && newPagination) {
          pagination.innerHTML = newPagination.innerHTML;
        }

        const newNext = getNextUrlFromDoc(doc);
        nextUrl = (newNext && newNext !== loadedPageUrl) ? newNext : null;

        if (visibleAppended > 0) {
          status.textContent = '';
          break;
        }

        if (!nextUrl) {
          status.textContent = totalAppended
            ? 'Konec (vše nové bylo odfiltrováno / zabanned).'
            : 'Konec (žádné další položky).';
          observer.disconnect();
          return;
        }

        status.textContent = 'Načítám další… (aktuální stránka nepřidala žádné viditelné položky)';
        if (pagesTried >= 20) {
          status.textContent = 'Zastaveno po více stránkách bez viditelných nových položek.';
          break;
        }
      }

      if (!nextUrl) {
        observer.disconnect();
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
      if (entries.some(e => e.isIntersecting)) {
        loadMore();
      }
    },
    { root: null, rootMargin: '800px 0px', threshold: 0 }
  );

  if (!nextUrl) {
    status.textContent = 'Konec (žádné další položky).';
    return;
  }

  observer.observe(sentinel);
})();
