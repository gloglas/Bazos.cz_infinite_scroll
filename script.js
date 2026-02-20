(() => {
  const STORAGE_KEY = "bazosTinder:v3";
  const LAUNCHER_ID = "bazos-tinder-launcher";
  const STYLE_ID = "bazos-tinder-style";
  const OVERLAY_ID = "bazos-tinder-overlay";
  const SENTINEL_ID = "bazos-tinder-sentinel";

  const safeParse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
  const now = () => Date.now();

  let state = safeParse(localStorage.getItem(STORAGE_KEY), null) || { banned: {}, liked: {} };
  const saveState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  // ----------------------------
  // Overlay (declare early!)
  // ----------------------------
  let overlay = null;

  // ----------------------------
  // Listings store (dynamic)
  // ----------------------------
  let items = [];
  let itemsById = new Map();

  const getIdFromHref = (href) => {
    const s = String(href || "");
    const m = s.match(/\/inzerat\/(\d+)\b/);
    return m?.[1] || null;
  };

  const collectListingEls = (root = document) =>
    Array.from(root.querySelectorAll("div.inzeraty.inzeratyflex"));

  const buildItemFromEl = (el, iHint = 0) => {
    const titleA = el.querySelector("h2.nadpis a, .nadpis a");
    const href = titleA?.href || "";
    const id = getIdFromHref(href) || el.dataset.btFallbackId || `idx_${iHint}`;
    const title = (titleA?.textContent || "Inzerát").trim();
    const img = el.querySelector("img.obrazek")?.src || "";
    const price = (el.querySelector(".inzeratycena")?.innerText || "").trim();
    const loc = (el.querySelector(".inzeratylok")?.innerText || "").trim();
    const desc = (el.querySelector(".popis")?.innerText || "").trim();
    return { id, title, href, img, price, loc, desc, el };
  };

  const applyStateToListingEl = (it) => {
    if (state.banned[it.id]) it.el.style.display = "none";
    else it.el.style.display = "";
  };

  const ingestListingEls = (els) => {
    let added = 0;
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (!(el instanceof HTMLElement)) continue;
      if (el.dataset.btIngested === "1") continue;
      el.dataset.btIngested = "1";

      const tmp = buildItemFromEl(el, items.length + i);
      el.dataset.btFallbackId = tmp.id;
      el.dataset.btId = tmp.id;

      if (!itemsById.has(tmp.id)) {
        items.push(tmp);
        itemsById.set(tmp.id, tmp);
        added++;
      } else {
        // Even for duplicates, enforce ban visibility.
        applyStateToListingEl(tmp);
        continue;
      }

      applyStateToListingEl(tmp);
    }
    return added;
  };

  // Initial ingest
  const initialEls = collectListingEls(document);
  if (!initialEls.length) {
    console.warn("[bazos-tinder] No listings found (are you on search results?).");
    return;
  }
  ingestListingEls(initialEls);

  // ---------------------------------------
  // Infinite scroll: load next page + append
  // ---------------------------------------
  let nextUrl = null;
  let isLoadingMore = false;

  // Track loaded pages to prevent accidentally fetching the same page forever
  const loadedPageUrls = new Set();
  const normalizeUrl = (u) => {
    try {
      const url = new URL(u, window.location.href);
      url.hash = "";
      return url.href;
    } catch {
      return String(u || "");
    }
  };
  loadedPageUrls.add(normalizeUrl(window.location.href));

  const absUrl = (href) => {
    try { return new URL(href, window.location.href).href; }
    catch { return null; }
  };

  const getPagerEl = (doc) => {
    const pagers = doc.querySelectorAll(".strankovani");
    return pagers.length ? pagers[pagers.length - 1] : null; // bottom pager
  };

  const getNextPageUrlFromDoc = (doc) => {
    const pager = getPagerEl(doc);
    if (!pager) return null;

    const links = Array.from(pager.querySelectorAll("a"));
    const aNext = links.find(a => /další/i.test((a.textContent || "").trim()));
    if (!aNext) return null;

    return absUrl(aNext.getAttribute("href"));
  };

  const parseOffsetFromUrl = (u) => {
    try {
      const url = new URL(u, window.location.href);
      const m = url.pathname.match(/\/(\d+)\/?$/);
      return m ? parseInt(m[1], 10) : null;
    } catch {
      return null;
    }
  };

  const buildUrlWithOffset = (offset) => {
    const url = new URL(window.location.href);
    // Bazos search pages are like /0/, /20/, /40/, ...
    url.pathname = `/${offset}/`;
    return url.href;
  };

  // Fallback offset-based paging (in case pager isn't present / detected)
  const PAGE_STEP = 20;
  let nextOffset = (() => {
    const cur = parseOffsetFromUrl(window.location.href);
    return (Number.isFinite(cur) ? cur : 0) + PAGE_STEP;
  })();

  const bumpNextOffsetFromUrl = (u) => {
    const off = parseOffsetFromUrl(u);
    if (Number.isFinite(off)) nextOffset = off + PAGE_STEP;
  };

  // (Fix) Re-check nextUrl on-demand + fallback offset-based next URL
  const ensureNextUrl = () => {
    // First: if we have a nextUrl but already loaded, advance it (offset fallback)
    if (nextUrl) {
      const n = normalizeUrl(nextUrl);
      if (loadedPageUrls.has(n)) {
        bumpNextOffsetFromUrl(nextUrl);
        nextUrl = null;
      } else {
        return nextUrl;
      }
    }

    // Second: try pager detection from current DOM
    const fromDom = getNextPageUrlFromDoc(document);
    if (fromDom) {
      const n = normalizeUrl(fromDom);
      if (!loadedPageUrls.has(n)) {
        nextUrl = fromDom;
        bumpNextOffsetFromUrl(fromDom);
        return nextUrl;
      }
      // If it's already loaded, advance offset fallback
      bumpNextOffsetFromUrl(fromDom);
    }

    // Third: offset-based fallback URL
    const candidate = buildUrlWithOffset(nextOffset);
    const nn = normalizeUrl(candidate);
    if (!loadedPageUrls.has(nn)) {
      nextUrl = candidate;
      return nextUrl;
    }

    // If even candidate is loaded, advance once more and try again
    nextOffset += PAGE_STEP;
    const candidate2 = buildUrlWithOffset(nextOffset);
    const nn2 = normalizeUrl(candidate2);
    if (!loadedPageUrls.has(nn2)) {
      nextUrl = candidate2;
      return nextUrl;
    }

    nextUrl = null;
    return null;
  };

  nextUrl = getNextPageUrlFromDoc(document);
  if (nextUrl) bumpNextOffsetFromUrl(nextUrl);

  const findInsertBeforeNode = () => getPagerEl(document) || null;

  const ensureSentinel = () => {
    let s = document.getElementById(SENTINEL_ID);
    if (s) return s;

    s = document.createElement("div");
    s.id = SENTINEL_ID;
    s.style.cssText = "height:1px; width:100%;";

    const before = findInsertBeforeNode();
    if (before?.parentNode) before.parentNode.insertBefore(s, before);
    else document.body.appendChild(s);

    return s;
  };

  const fetchAndAppendNextPage = async () => {
    ensureNextUrl();
    if (!nextUrl || isLoadingMore) return false;

    const thisUrl = normalizeUrl(nextUrl);
    if (loadedPageUrls.has(thisUrl)) {
      // Already loaded; advance and try again next time.
      nextUrl = null;
      ensureNextUrl();
      return false;
    }

    isLoadingMore = true;
    try {
      const res = await fetch(nextUrl, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      loadedPageUrls.add(thisUrl);

      const doc = new DOMParser().parseFromString(html, "text/html");
      const newEls = collectListingEls(doc);
      if (!newEls.length) {
        // No listings -> assume no more pages
        nextUrl = null;
        return false;
      }

      const sentinel = ensureSentinel();
      const before = findInsertBeforeNode();

      // Import and append listing nodes before sentinel
      const imported = newEls.map(el => document.importNode(el, true));
      const parent = before?.parentNode || sentinel.parentNode || document.body;
      for (const node of imported) parent.insertBefore(node, sentinel);

      ingestListingEls(imported);

      // Update nextUrl from fetched document (preferred), else keep offset fallback
      const docNext = getNextPageUrlFromDoc(doc);
      if (docNext) {
        nextUrl = docNext;
        bumpNextOffsetFromUrl(docNext);
      } else {
        nextUrl = null; // will be rebuilt from nextOffset by ensureNextUrl()
        nextOffset += PAGE_STEP;
      }

      return true;
    } catch (e) {
      console.warn("[bazos-tinder] load more failed:", e);
      // Don't permanently brick it; allow retry.
      nextUrl = null;
      return false;
    } finally {
      isLoadingMore = false;
      if (overlay) updateCounter();
    }
  };

  // IntersectionObserver infinite scroll (preferred)
  let io = null;
  const startInfiniteScroll = () => {
    const sentinel = ensureSentinel();
    if ("IntersectionObserver" in window) {
      if (io) io.disconnect();
      io = new IntersectionObserver((entries) => {
        for (const ent of entries) {
          if (ent.isIntersecting) fetchAndAppendNextPage();
        }
      }, { root: null, rootMargin: "1200px 0px 1200px 0px", threshold: 0.01 });
      io.observe(sentinel);
    } else {
      const onScroll = () => {
        const nearBottom = (window.innerHeight + window.scrollY) >
          (document.documentElement.scrollHeight - 1400);
        if (nearBottom) fetchAndAppendNextPage();
      };
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  };

  // MutationObserver: if anything adds listings, ingest + apply bans
  const mo = new MutationObserver((mutations) => {
    const added = [];
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.matches?.("div.inzeraty.inzeratyflex")) added.push(n);
        const inner = n.querySelectorAll?.("div.inzeraty.inzeratyflex");
        if (inner?.length) added.push(...inner);
      }
    }
    if (added.length) ingestListingEls(added);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  startInfiniteScroll();

  // ----------------------------------------
  // Launcher button
  // ----------------------------------------
  const findEmailButton = () =>
    Array.from(document.querySelectorAll("button"))
      .find(b => (b.textContent || "").trim().includes("Nové inzeráty e-mailem"));

  const ensureLauncher = () => {
    if (document.getElementById(LAUNCHER_ID)) return;

    const launcher = document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.textContent = "✖❤ Tinder";
    launcher.style.marginLeft = "8px";
    launcher.style.cursor = "pointer";
    launcher.addEventListener("click", () => openOverlay());

    const emailBtn = findEmailButton();
    if (emailBtn && emailBtn.parentElement) {
      emailBtn.insertAdjacentElement("afterend", launcher);
    } else {
      launcher.style.position = "fixed";
      launcher.style.right = "14px";
      launcher.style.bottom = "14px";
      launcher.style.zIndex = "2147483647";
      document.body.appendChild(launcher);
      console.warn("[bazos-tinder] Could not find email button; placed launcher bottom-right.");
    }
  };

  ensureLauncher();

  // ----------------------------
  // Tinder mode
  // ----------------------------
  let actionStack = [];
  let queue = [];
  let idx = 0;

  const applyStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID}{
        position:fixed; inset:0; z-index:2147483647;
        background:rgba(0,0,0,.75);
        display:flex; align-items:center; justify-content:center;
        font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      }
      .bt-shell{ width:min(520px,92vw); display:grid; gap:10px; }
      .bt-topbar{
        display:flex; align-items:center; justify-content:space-between;
        color:#fff; opacity:.95; font-size:13px;
      }
      .bt-topbar .bt-counter{ font-variant-numeric:tabular-nums; }
      .bt-topbar .bt-buttons{ display:flex; gap:8px; align-items:center; }
      .bt-topbar button{
        background:rgba(255,255,255,.12);
        color:#fff; border:1px solid rgba(255,255,255,.20);
        border-radius:10px; padding:8px 10px; cursor:pointer;
      }
      .bt-topbar button:disabled{ opacity:.45; cursor:not-allowed; }

      .bt-card{
        position:relative; background:#fff;
        border-radius:18px; overflow:hidden;
        box-shadow:0 18px 60px rgba(0,0,0,.45);
        touch-action:pan-y; user-select:none;
      }
      .bt-img{
        width:100%; aspect-ratio:4/3;
        background:#f1f1f1; display:block; object-fit:cover;
      }
      .bt-body{ padding:14px 14px 12px; display:grid; gap:8px; }
      .bt-title{ font-weight:800; font-size:16px; line-height:1.25; margin:0; }
      .bt-meta{ display:flex; gap:10px; flex-wrap:wrap; font-size:13px; color:#333; opacity:.9; }
      .bt-desc{ font-size:13px; color:#222; opacity:.9; max-height:6.2em; overflow:hidden; }

      .bt-actions{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
      .bt-actions button{
        padding:12px 12px;
        border-radius:14px;
        border:1px solid rgba(255,255,255,.22);
        cursor:pointer;
        font-weight:900;
        font-size:22px;
        line-height:1;
      }
      .bt-actions button:disabled{ opacity:.4; cursor:not-allowed; }
      .bt-cross{ background:rgba(255,70,70,.90); color:#fff; }
      .bt-open{ background:rgba(255,255,255,.16); color:#fff; border-color:rgba(255,255,255,.25); font-size:14px; font-weight:750; }
      .bt-heart{ background:rgba(60,200,120,.92); color:#fff; }

      .bt-badge{
        position:absolute; top:14px; left:14px;
        padding:10px 12px; border-radius:12px;
        font-weight:1000; font-size:22px;
        background:rgba(0,0,0,.65); color:#fff;
        transform:scale(.95); opacity:0;
        transition:opacity .12s ease, transform .12s ease;
        pointer-events:none;
      }
      .bt-badge.show{ opacity:1; transform:scale(1); }

      .bt-empty{
        padding:26px 18px; color:#111;
        display:grid; gap:10px; text-align:center;
      }
      .bt-empty button{
        padding:10px 12px;
        border-radius:12px; border:1px solid #ddd;
        cursor:pointer; font-weight:700; background:#fff;
      }
      .bt-hint{
        margin-top:8px;
        color:rgba(255,255,255,.85);
        font-size:12px; line-height:1.3;
        text-align:center;
      }
    `;
    document.head.appendChild(style);
  };

  const refreshQueue = () => {
    queue = items.filter(it => !state.banned[it.id] && !state.liked[it.id]);
    if (idx >= queue.length) idx = Math.max(0, queue.length - 1);
  };

  const updateCounter = () => {
    const c = overlay?.querySelector(".bt-counter");
    if (!c) return;
    const loading = isLoadingMore ? " • loading…" : "";
    c.textContent = queue.length ? `${idx + 1} / ${queue.length}${loading}` : `0 / 0${loading}`;
  };

  const updateUndoButton = () => {
    const u = overlay?.querySelector(".bt-undo");
    if (u) u.disabled = actionStack.length === 0;
  };

  const setBadge = (text) => {
    const b = overlay?.querySelector(".bt-badge");
    if (!b) return;
    b.textContent = text || "";
    if (text) b.classList.add("show");
    clearTimeout(setBadge._t);
    setBadge._t = setTimeout(() => b.classList.remove("show"), 450);
  };

  const recordAction = (a) => {
    actionStack.push(a);
    updateUndoButton();
  };

  // Pump loader: if a page is "all banned", keep loading next pages until we find something (or stop).
  let pumpRunning = false;
  const pumpUntilNonEmpty = async (maxPages = 6) => {
    if (pumpRunning) return;
    pumpRunning = true;
    try {
      for (let i = 0; i < maxPages; i++) {
        refreshQueue();
        if (queue.length) break;

        ensureNextUrl();
        if (!nextUrl) break;

        const ok = await fetchAndAppendNextPage();
        if (!ok) break;
      }
    } finally {
      pumpRunning = false;
      if (overlay) render(true); // skip re-entering pump
    }
  };

  let lastPrefetch = 0;
  const maybePrefetchMore = () => {
    if (!overlay) return;
    ensureNextUrl();
    if (!nextUrl) return;
    if (isLoadingMore) return;

    const remaining = queue.length - (idx + 1);
    if (queue.length === 0 || remaining <= 5) {
      const t = now();
      if (t - lastPrefetch < 500) return;
      lastPrefetch = t;
      fetchAndAppendNextPage().then(() => overlay && render(true));
    }
  };

  const render = (skipPump = false) => {
    ensureNextUrl();
    refreshQueue();
    updateCounter();
    updateUndoButton();

    const card = overlay.querySelector(".bt-card");
    const btnCross = overlay.querySelector(".bt-cross");
    const btnHeart = overlay.querySelector(".bt-heart");
    const btnOpen = overlay.querySelector(".bt-open");

    const has = !!queue.length;
    btnCross.disabled = !has;
    btnHeart.disabled = !has;
    btnOpen.disabled = !has;

    if (!has) {
      if (ensureNextUrl()) {
        card.innerHTML = `
          <div class="bt-badge"></div>
          <div class="bt-empty">
            <div style="font-weight:900; font-size:16px;">Loading more listings…</div>
            <div>If this page is fully banned/liked, it will keep fetching next pages.</div>
            <button class="bt-retry">Retry now</button>
          </div>
        `;
        card.querySelector(".bt-retry")?.addEventListener("click", () => pumpUntilNonEmpty(8));
        updateCounter();

        // IMPORTANT: don’t just “wait”; actively pump until something appears.
        if (!skipPump) pumpUntilNonEmpty(6);
        return;
      }

      card.innerHTML = `
        <div class="bt-badge"></div>
        <div class="bt-empty">
          <div style="font-weight:900; font-size:16px;">No more listings</div>
          <div>✖ banned are hidden (saved). ❤ liked are skipped in Tinder but stay in the list.</div>
          <button class="bt-reset2">Reset bans/likes</button>
        </div>
      `;
      card.querySelector(".bt-reset2")?.addEventListener("click", resetAll);
      return;
    }

    const it = queue[idx];
    const imgHtml = it.img
      ? `<img class="bt-img" src="${it.img}" alt="">`
      : `<div class="bt-img" style="display:flex;align-items:center;justify-content:center;color:#555;">No image</div>`;

    card.innerHTML = `
      <div class="bt-badge"></div>
      ${imgHtml}
      <div class="bt-body">
        <h3 class="bt-title">${escapeHtml(it.title)}</h3>
        <div class="bt-meta">
          <span><b>${escapeHtml(it.price)}</b></span>
          <span>${escapeHtml(it.loc)}</span>
        </div>
        <div class="bt-desc">${escapeHtml(it.desc)}</div>
      </div>
    `;

    maybePrefetchMore();
  };

  // --- State mutations ---
  const banItem = (it, reason) => {
    if (state.banned[it.id]) return;
    state.banned[it.id] = { ts: now(), reason };
    it.el.style.display = "none"; // hide in normal list
    saveState();
  };

  const unbanItem = (id) => {
    const it = itemsById.get(id);
    if (!it) return;
    delete state.banned[id];
    it.el.style.display = "";
    saveState();
  };

  const likeItem = (it) => {
    if (state.liked[it.id]) return;
    state.liked[it.id] = { ts: now() };
    saveState();
  };

  const unlikeItem = (id) => {
    delete state.liked[id];
    saveState();
  };

  // --- Actions ---
  const crossCurrent = (reason = "cross") => {
    if (!queue.length) return;
    const it = queue[idx];
    recordAction({ type: "ban", id: it.id, prevIdx: idx });
    setBadge("✖");
    banItem(it, reason);
    render();
  };

  const heartCurrent = () => {
    if (!queue.length) return;
    const it = queue[idx];
    recordAction({ type: "like", id: it.id, prevIdx: idx });
    setBadge("❤");
    likeItem(it);
    render();
  };

  const openCurrent = () => {
    if (!queue.length) return;
    window.open(queue[idx].href, "_blank", "noopener,noreferrer");
  };

  const undo = () => {
    const a = actionStack.pop();
    updateUndoButton();
    if (!a) return;

    if (a.type === "ban") {
      unbanItem(a.id);
      refreshQueue();
      const pos = queue.findIndex(x => x.id === a.id);
      idx = pos >= 0 ? pos : Math.min(a.prevIdx ?? 0, Math.max(0, queue.length - 1));
      setBadge("↩ ✖");
      render();
      return;
    }

    if (a.type === "like") {
      unlikeItem(a.id);
      refreshQueue();
      const pos = queue.findIndex(x => x.id === a.id);
      idx = pos >= 0 ? pos : Math.min(a.prevIdx ?? 0, Math.max(0, queue.length - 1));
      setBadge("↩ ❤");
      render();
      return;
    }
  };

  const resetAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    state = { banned: {}, liked: {} };
    actionStack = [];
    items.forEach(it => (it.el.style.display = ""));
    render();
    console.log("[bazos-tinder] reset done.");
  };

  const closeOverlay = () => {
    overlay?.remove();
    overlay = null;
    window.removeEventListener("keydown", onKey, true);
    console.log("[bazos-tinder] closed. State remains in localStorage.");
  };

  // --- Inputs ---
  let lastWheelAction = 0;
  const onWheel = (e) => {
    if (!overlay) return;

    // wheel down => ✖ (throttled)
    if (e.deltaY > 18) {
      const t = now();
      if (t - lastWheelAction < 550) return;
      lastWheelAction = t;
      e.preventDefault();
      crossCurrent("wheel");
      maybePrefetchMore();
    } else {
      maybePrefetchMore();
    }
  };

  const onKey = (e) => {
    if (!overlay) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); crossCurrent("key"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); heartCurrent(); }
    else if (e.key === "Enter") { e.preventDefault(); openCurrent(); }
    else if (e.key === "Escape") { e.preventDefault(); closeOverlay(); }
    else if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); }
  };

  // Swipe
  let dragging = false, startX = 0, startY = 0;

  const onDown = (e) => {
    if (!queue.length) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    overlay.querySelector(".bt-card")?.setPointerCapture?.(e.pointerId);
  };

  const onMove = (e) => {
    if (!dragging) return;
    const card = overlay.querySelector(".bt-card");
    if (!card) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    card.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx * 0.05}deg)`;
    if (dx > 40) setBadge("❤");
    else if (dx < -40) setBadge("✖");
    else setBadge("");
  };

  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    const card = overlay.querySelector(".bt-card");
    if (card) card.style.transform = "";
    const dx = e.clientX - startX;
    if (dx > 110) heartCurrent();
    else if (dx < -110) crossCurrent("swipe");
    else render();
    maybePrefetchMore();
  };

  const onCancel = () => {
    dragging = false;
    const card = overlay?.querySelector(".bt-card");
    if (card) card.style.transform = "";
    setBadge("");
  };

  const openOverlay = () => {
    if (overlay) return;
    applyStyles();

    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="bt-shell">
        <div class="bt-topbar">
          <div>
            <div><b>✖❤ Bazoš Tinder</b> (saved in localStorage)</div>
            <div class="bt-counter">—</div>
          </div>
          <div class="bt-buttons">
            <button class="bt-undo" title="Undo (Ctrl/Cmd+Z)">Undo</button>
            <button class="bt-reset" title="Clear local bans/likes">Reset</button>
            <button class="bt-close" title="Close">Close</button>
          </div>
        </div>

        <div class="bt-card">
          <div class="bt-badge"></div>
          <div class="bt-body">Loading…</div>
        </div>

        <div class="bt-actions">
          <button class="bt-cross" title="✖ (← / scroll down)">✖</button>
          <button class="bt-open" title="Open (Enter)">OPEN</button>
          <button class="bt-heart" title="❤ (→)">❤</button>
        </div>

        <div class="bt-hint">
          Scroll/wheel down = ✖ • Swipe left ✖ / right ❤ • ←/→ • Enter open • Esc close • Ctrl/Cmd+Z undo
          <br>❤ liked are skipped here but remain in the normal listing.
          <br><span style="opacity:.9;">Infinite: bottom of page loads more; Tinder auto-loads next pages near the end (and also skips fully-banned pages).</span>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector(".bt-cross").addEventListener("click", () => crossCurrent("button"));
    overlay.querySelector(".bt-heart").addEventListener("click", () => heartCurrent());
    overlay.querySelector(".bt-open").addEventListener("click", () => openCurrent());
    overlay.querySelector(".bt-close").addEventListener("click", closeOverlay);
    overlay.querySelector(".bt-reset").addEventListener("click", resetAll);
    overlay.querySelector(".bt-undo").addEventListener("click", undo);

    overlay.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey, true);

    const card = overlay.querySelector(".bt-card");
    card.addEventListener("pointerdown", onDown);
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", onUp);
    card.addEventListener("pointercancel", onCancel);

    idx = 0;
    ensureNextUrl();
    render(); // render will pump if empty
  };

  // Convenience helpers
  window.bazosTinder = {
    open: () => openOverlay(),
    close: () => closeOverlay(),
    undo: () => undo(),
    reset: () => resetAll(),
    dump: () => safeParse(localStorage.getItem(STORAGE_KEY), { banned: {}, liked: {} }),
    loadMore: () => fetchAndAppendNextPage(),
    getNextUrl: () => ensureNextUrl(),
  };

  console.log("[bazos-tinder] ready. Click '✖❤ Tinder' next to 'Nové inzeráty e-mailem'.");
  console.log("[bazos-tinder] infinite scroll enabled (auto-load next pages on bottom).");
})();
