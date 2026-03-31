// ==UserScript==
// @name         Bazoš Infinite Scroll (inzeráty a bany) 
// @namespace    https://github.com/gloglas/Bazos.cz_infinite_scroll
// @version      3.0.0
// @description  Infinite loading, URL bans, favorites, import/export, and multi-search on bazos.cz/sk.
// @match        *://*.bazos.cz/*
// @match        *://*.bazos.sk/*
// @exclude      *://*.bazos.cz/inzerat/*
// @exclude      *://*.bazos.sk/inzerat/*
// @grant        none
// @run-at       document-idle

// @downloadURL  https://raw.githubusercontent.com/gloglas/Bazos.cz_infinite_scroll/refs/heads/bans/script.js
// @updateURL    https://raw.githubusercontent.com/gloglas/Bazos.cz_infinite_scroll/refs/heads/bans/script.js
// @homepageURL  https://github.com/gloglas/Bazos.cz_infinite_scroll
// @supportURL   https://github.com/gloglas/Bazos.cz_infinite_scroll/issues
// ==/UserScript==

(function () {
  "use strict";
  if (/\/inzerat\/\d+/i.test(location.pathname)) return;

  const ROOT = location.hostname.endsWith(".bazos.sk") || location.hostname === "bazos.sk" ? "bazos.sk" : "bazos.cz";
  const KEY = `bzx_v4_${ROOT}`;
  const SETTINGS_KEY = `${KEY}_settings`;
  const EUR_RATE_KEY = `${KEY}_eur_czk_rate`;
  const state = {
    bans: new Map(),
    favs: new Map(),
    cards: new Map(),
    streams: new Map(),
    order: [],
    cursor: 0,
    primary: "__primary__",
    currentTerm: "",
    loading: false,
    ensuring: false,
    review: false,
    busy: 0,
    includeSk: false,
    eurToCzk: 25,
    reviewLimits: { fav: 10, ban: 10 },
    minVisible: window.innerWidth <= 768 ? 6 : 12,
    dom: {}
  };

  if (resetToPage1()) return;
  injectCss();
  loadData();
  const initial = scanCards(document);
  if (!initial.length && !hasPager(document) && !hasSearchContext()) return;
  initStreams();
  buildPanel();
  buildReview();
  buildPagingStatus();
  applyFilters();
  setupInfinite();
  ensureVisible();

  function resetToPage1() {
    const u = new URL(location.href);
    if (!u.searchParams.has("crz")) return false;
    u.searchParams.delete("crz");
    const t = u.toString();
    if (t !== location.href) { location.replace(t); return true; }
    return false;
  }

  function hasSearchContext() {
    return !!document.querySelector("#hledat, input[name='hledat'], form[action*='search.php']");
  }

  function hasPager(doc) {
    return !!doc.querySelector(".strankovani a, a[href*='crz=']");
  }

  function injectCss() {
    const s = document.createElement("style");
    s.textContent = `
    .bzx-hide{display:none!important}.bzx-review{opacity:.45;outline:2px dashed #b13c3c}.bzx-fav-card{outline:2px solid #ff9b3d;background:#fff8ef}
    .bzx-pos{position:relative!important}.bzx-actions{position:absolute;top:6px;right:6px;display:flex;gap:4px;z-index:12}
    .bzx-btn{font-size:11px;line-height:1;padding:4px 6px;border-radius:999px;border:1px solid #c4c4c4;background:#fff;cursor:pointer;color:#000}
    .bzx-ban{border-color:#c74f1b;color:#000;background:#fff2ec}.bzx-fav{border-color:#e6a630;color:#000;background:#fff7e8}.bzx-btn:disabled{opacity:.65;cursor:not-allowed}
    #bzx-panel{margin:10px 0 12px;border:1px solid #f2b27b;border-radius:12px;background:linear-gradient(180deg,#fffefc,#fff4e8);box-shadow:0 8px 20px rgba(146,74,19,.12);font:12px/1.35 Arial,sans-serif;color:#2a2a2a;overflow:hidden}
    #bzx-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:linear-gradient(180deg,#ff8a2d,#ff6b00);color:#fff}
    #bzx-head strong{font-size:13px}#bzx-body{padding:8px 10px}.bzx-row{display:flex;gap:6px;align-items:center;margin:6px 0;flex-wrap:wrap}.bzx-row label{display:inline-flex;align-items:center;gap:6px;color:#000}
    #bzx-panel input[type=text]{min-width:0;padding:5px 7px;border:1px solid #d8b89d;border-radius:8px;flex:1}
    #bzx-panel button{padding:5px 8px;border:1px solid #ce8d58;border-radius:8px;background:#fff;color:#000;cursor:pointer}#bzx-panel button:hover{background:#fff3e7}
    .bzx-meta{color:#5b3e2b;font-size:11px}#bzx-status{font-size:11px;color:#5b3e2b;min-height:14px}
    .bzx-spin{width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.55);border-top-color:#fff;display:none;animation:bzxSpin .85s linear infinite}.bzx-spin.on{display:inline-block}
    #bzx-empty{margin:10px 0;padding:8px;border:1px solid #e1a23b;background:#fff9df;color:#5f4700;font-size:13px;border-radius:8px;display:none}
    #bzx-modal{position:fixed;inset:0;z-index:1000000;background:rgba(0,0,0,.58);display:none}#bzx-modal.on{display:block}
    #bzx-card{width:min(1020px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;margin:12px auto;background:#fff;border-radius:10px;border:1px solid #868686;padding:12px;font:13px/1.4 Arial,sans-serif}
    .bzx-title{margin:12px 0 6px;font-size:14px}.bzx-grid{display:grid;grid-template-columns:1fr;gap:8px}.bzx-item{display:grid;grid-template-columns:84px 1fr auto;gap:8px;align-items:center;border:1px solid #d0d0d0;border-radius:8px;padding:6px}
    .bzx-thumb{width:80px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #bbb;background:#f2f2f2}.bzx-wrap{min-width:0}.bzx-tt{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bzx-url{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bzx-sm{color:#444;font-size:11px}#bzx-sentinel{width:100%;height:1px}
    #bzx-paging-status{display:flex;align-items:center;gap:6px;margin:6px 0;color:#000;font:12px/1.3 Arial,sans-serif}
    .bzx-pager-spin{width:14px;height:14px;border-radius:50%;border:2px solid #ffccab;border-top-color:#ff6b00;display:none;animation:bzxSpin .85s linear infinite}
    .bzx-pager-spin.on{display:inline-block}
    .bzx-pager-done{display:none;color:#0a7d2d;font-weight:700}
    .bzx-pager-done.on{display:inline}
    @keyframes bzxSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    @media (max-width:768px){.bzx-actions{top:4px;right:4px;gap:3px}.bzx-btn{font-size:10px;padding:3px 5px}.bzx-item{grid-template-columns:72px 1fr;gap:6px}}
    `;
    document.head.appendChild(s);
  }

  function loadData() {
    loadMap("bans", (x) => normBan(x));
    loadMap("favs", (x) => normFav(x));
    for (const u of state.favs.keys()) state.bans.delete(u);
    saveBans();
    loadSettings();
  }

  function loadMap(type, norm) {
    try {
      const raw = JSON.parse(localStorage.getItem(`${KEY}_${type}`) || "[]");
      if (!Array.isArray(raw)) return;
      for (const it of raw) {
        const n = norm(it);
        if (!n) continue;
        (type === "bans" ? state.bans : state.favs).set(n.url, n);
      }
    } catch (_) {}
  }

  function saveBans() { localStorage.setItem(`${KEY}_bans`, JSON.stringify([...state.bans.values()])); }
  function saveFavs() { localStorage.setItem(`${KEY}_favs`, JSON.stringify([...state.favs.values()])); }
  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ includeSk: !!state.includeSk }));
  }

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      state.includeSk = ROOT === "bazos.cz" ? !!raw.includeSk : false;
    } catch (_) {
      state.includeSk = false;
    }
    try {
      const rawRate = JSON.parse(localStorage.getItem(EUR_RATE_KEY) || "{}");
      const rate = Number(rawRate.rate);
      if (Number.isFinite(rate) && rate > 0) {
        state.eurToCzk = rate;
      }
    } catch (_) {}
  }

  function todayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function getDailyEurToCzkRate() {
    const today = todayIsoDate();
    try {
      const cached = JSON.parse(localStorage.getItem(EUR_RATE_KEY) || "{}");
      const cachedRate = Number(cached.rate);
      if (cached.date === today && Number.isFinite(cachedRate) && cachedRate > 0) {
        state.eurToCzk = cachedRate;
        return cachedRate;
      }
    } catch (_) {}

    try {
      const txt = await fetchTextSmart("https://www.cnb.cz/en/financial-markets/foreign-exchange-market/exchange-rate-fixing/daily.txt");
      const lines = txt.split(/\r?\n/);
      let parsedRate = null;
      for (const line of lines) {
        const m = line.trim().match(/^EUR\|(\d+)\|([0-9,]+)$/i);
        if (!m) continue;
        const amount = parseInt(m[1], 10);
        const raw = Number(String(m[2]).replace(",", "."));
        if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(raw) || raw <= 0) {
          continue;
        }
        parsedRate = raw / amount;
        break;
      }
      if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
        throw new Error("Nelze načíst kurz EUR.");
      }
      state.eurToCzk = parsedRate;
      localStorage.setItem(EUR_RATE_KEY, JSON.stringify({ date: today, rate: parsedRate }));
      return parsedRate;
    } catch (_) {
      return state.eurToCzk;
    }
  }

  function isCrossOriginUrl(url) {
    try {
      return new URL(url, location.href).origin !== location.origin;
    } catch (_) {
      return false;
    }
  }

  async function fetchTextSmart(url) {
    const full = abs(url, location.href);
    const cross = isCrossOriginUrl(full);

    if (!cross) {
      const res = await fetch(full, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    }

    if (typeof GM_xmlhttpRequest !== "function") {
      throw new Error("CROSS_ORIGIN_BLOCK");
    }

    return await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: full,
        onload: (resp) => {
          if (resp.status >= 200 && resp.status < 400) {
            resolve(String(resp.responseText || ""));
            return;
          }
          reject(new Error(`HTTP ${resp.status}`));
        },
        onerror: () => reject(new Error("CROSS_ORIGIN_BLOCK")),
        ontimeout: () => reject(new Error("CROSS_ORIGIN_TIMEOUT"))
      });
    });
  }

  function normBan(it) {
    if (!it || typeof it !== "object") return null;
    const url = normUrl(it.url); if (!url) return null;
    return { url, title: clean(it.title), image: normImg(it.image), priceText: clean(it.priceText), reason: clean(it.reason || "ručně"), bannedAt: it.bannedAt || new Date().toISOString() };
  }

  function normFav(it) {
    if (!it || typeof it !== "object") return null;
    const url = normUrl(it.url); if (!url) return null;
    return { url, title: clean(it.title), image: normImg(it.image), priceText: clean(it.priceText), favoritedAt: it.favoritedAt || new Date().toISOString() };
  }

  function initStreams() {
    state.currentTerm = currentTerm();
    const p = { key: state.primary, term: state.currentTerm, next: nextPage(document, location.href), seen: new Set([offset(location.href)]), done: false, failCount: 0 };
    if (!p.next) p.done = true;
    state.streams.set(p.key, p);
    state.order = [p.key];
    if (shouldIncludeSkMirror() && clean(state.currentTerm)) {
      const key = skMirrorKey(state.currentTerm);
      state.streams.set(key, { key, term: state.currentTerm, next: searchUrl(state.currentTerm, "https://www.bazos.sk"), seen: new Set(), done: false, isSkMirror: true, failCount: 0 });
      state.order.push(key);
    }
  }

  function shouldIncludeSkMirror() {
    return ROOT === "bazos.cz" && !!state.includeSk;
  }

  function skMirrorKey(term) {
    return `sk:${normTxt(term || "")}`;
  }

  function isSkListingUrl(url) {
    try {
      const h = new URL(url).hostname.toLowerCase();
      return h === "bazos.sk" || h.endsWith(".bazos.sk");
    } catch (_) {
      return false;
    }
  }

  function currentTerm() {
    const i = document.querySelector("#hledat, input[name='hledat']")?.value || "";
    const q = new URL(location.href).searchParams.get("hledat") || "";
    return clean(i || q);
  }

  function scanCards(doc) {
    const cards = cardsFromDoc(doc, location.href);
    for (const c of cards) regCard(c);
    if (cards.length) state.last = cards[cards.length - 1];
    return cards;
  }

  function cardsFromDoc(doc, baseHref) {
    const direct = [...doc.querySelectorAll("div.inzeraty")].filter(hasLink);
    if (direct.length) return uniqCards(direct, baseHref);
    const out = [];
    for (const a of [...doc.querySelectorAll('a[href*="/inzerat/"]')]) {
      let c = a.closest(".inzeraty, article, li, div[class*='inzer'], div[class*='item'], tr") || a.closest("div,article,li,tr");
      if (c && c.matches(".inzeratynadpis,.inzeratycena,.inzeratylok,.inzeratyview,.inzeratyakce")) c = c.closest(".inzeraty,article,li,tr");
      if (c && hasLink(c)) out.push(c);
    }
    return uniqCards(out, baseHref);
  }

  function uniqCards(arr, baseHref) {
    const out = [], seen = new Set();
    for (const c of arr) {
      const u = cardUrl(c, baseHref);
      if (!u || seen.has(u)) continue;
      seen.add(u); out.push(c);
    }
    return out;
  }

  function hasLink(el) { return !!el.querySelector('a[href*="/inzerat/"]'); }
  function cardAnchor(el) { return el?.querySelector("h2 a[href*='/inzerat/'], .nadpis a[href*='/inzerat/'], a[href*='/inzerat/']") || null; }
  function normUrl(raw) {
    if (!raw) return null;
    try {
      const u = new URL(raw, location.href);
      if (!/\/inzerat\/\d+/i.test(u.pathname)) return null;
      u.hash = ""; u.search = "";
      return u.origin + u.pathname.replace(/\/+$/, "");
    } catch (_) { return null; }
  }

  function cardUrl(el, baseHref) {
    if (el?.dataset?.bzxUrl) return normUrl(el.dataset.bzxUrl) || null;
    const href = cardAnchor(el)?.getAttribute("href") || "";
    return normUrl(abs(href, baseHref || location.href));
  }
  function titleOf(c) { return clean(c.querySelector("h2 a,.nadpis a,a[href*='/inzerat/']")?.textContent || c.querySelector("h2,.nadpis")?.textContent || ""); }
  function normImg(src) { try { return src ? new URL(src, location.href).toString() : ""; } catch (_) { return ""; } }
  function imgOf(c) { return normImg(c.querySelector("img")?.getAttribute("src") || ""); }

  function priceText(c) {
    const sels = [".inzeratycena", ".inzeratycena span[translate='no']", "[class*='cena']", "span[translate='no']"];
    const ns = [];
    for (const s of sels) for (const n of c.querySelectorAll(s)) ns.push(n);
    for (const n of ns) {
      const t = clean(n.textContent || "");
      if (looksPrice(t)) return t;
    }
    return "";
  }

  function looksPrice(t) {
    if (!t) return false;
    const n = normTxt(t);
    if (n.includes("dohod") || n.includes("v textu") || n.includes("zdarma") || /(kc|czk|eur|€)/i.test(t)) return true;
    const d = t.replace(/[^\d]/g, "");
    return d.length >= 3 && d.length <= 9;
  }

  function priceVal(txt) {
    const t = clean(txt);
    if (!t) return 0;
    const n = normTxt(t);
    if (n.includes("dohod") || n.includes("v textu") || n.includes("zdarma") || n.includes("nabid")) return 0;
    const m = t.match(/([0-9][0-9\s.,]{0,15})\s*(k[cč]|czk|eur|€)/i) || t.match(/([0-9][0-9\s.,]{2,})/);
    if (!m) return 0;
    const d = (m[1] || "").replace(/[^\d]/g, "");
    if (!d) return 0;
    const v = parseInt(d, 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }

  function formatCzkPrice(v) {
    const n = Number(v);
    const safe = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    return `${safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kč`;
  }

  function setDisplayedPrice(card, valueCzk) {
    if (!card) return;
    const priceText = formatCzkPrice(valueCzk);
    const direct = card.querySelector(".inzeratycena");
    if (direct) {
      const noTranslate = direct.querySelector("span[translate='no']");
      if (noTranslate) noTranslate.textContent = priceText;
      else direct.textContent = priceText;
      return;
    }
    const anyPrice = card.querySelector("[class*='cena'], span[translate='no']");
    if (anyPrice) anyPrice.textContent = priceText;
  }

  function regCard(c) {
    const u = cardUrl(c, location.href);
    if (!u || state.cards.has(u)) return false;
    const ptxt = priceText(c);
    let pval = priceVal(ptxt);
    let finalPriceText = ptxt;
    if (pval != null && ROOT === "bazos.cz" && isSkListingUrl(u) && !/(k[cč]|czk)/i.test(ptxt)) {
      pval = Math.round(pval * state.eurToCzk);
      c.dataset.bzxConverted = "1";
      finalPriceText = formatCzkPrice(pval);
      setDisplayedPrice(c, pval);
    }
    c.dataset.bzxUrl = u;
    c.dataset.bzxTitle = titleOf(c);
    c.dataset.bzxImage = imgOf(c);
    c.dataset.bzxPriceText = finalPriceText;
    c.dataset.bzxPrice = pval == null ? "" : String(pval);
    state.cards.set(u, c);
    attachCardActions(c, u);
    return true;
  }

  function attachCardActions(c, u) {
    if (c.querySelector(".bzx-actions")) return;
    if (getComputedStyle(c).position === "static") c.classList.add("bzx-pos");
    const w = document.createElement("div");
    w.className = "bzx-actions";
    const f = document.createElement("button");
    f.type = "button"; f.className = "bzx-btn bzx-fav"; f.textContent = "Favorite";
    f.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleFav(u, c); };
    const b = document.createElement("button");
    b.type = "button"; b.className = "bzx-btn bzx-ban"; b.textContent = "Blokovat URL";
    b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (state.favs.has(u)) return status("Favorite je chráněné a nelze ho blokovat.");
      if (state.bans.has(u)) {
        if (state.review) {
          const ok = unbanUrl(u);
          status(ok ? "URL bylo odblokováno." : "URL se nepodařilo odblokovat.");
          return;
        }
        return status("URL už je blokované. Použijte Odblokovat URL.");
      }
      banUrl(u, c, "button");
    };
    w.append(f, b); c.appendChild(w);
  }

  function syncCardButtons(c, u, fav, banned) {
    const f = c.querySelector(".bzx-fav"), b = c.querySelector(".bzx-ban");
    if (f) f.textContent = "Favorite";
    if (b) {
      if (fav) { b.textContent = "Chráněno"; b.disabled = true; }
      else if (banned) { b.textContent = state.review ? "Blokováno (odblokovat)" : "Blokováno"; b.disabled = false; }
      else { b.textContent = "Blokovat URL"; b.disabled = false; }
    }
  }

  function metaFor(u, c) {
    const src = c || state.cards.get(u);
    if (src) return { title: src.dataset.bzxTitle || titleOf(src), image: src.dataset.bzxImage || imgOf(src), priceText: src.dataset.bzxPriceText || priceText(src) };
    if (state.bans.has(u)) return state.bans.get(u);
    if (state.favs.has(u)) return state.favs.get(u);
    return { title: "", image: "", priceText: "" };
  }

  function toggleFav(u, c) {
    const n = normUrl(u); if (!n) return;
    if (state.favs.has(n)) {
      state.favs.delete(n); saveFavs(); applyFilters(); renderReviewBody(); status("Odebráno z Favorite."); return;
    }
    const m = metaFor(n, c);
    state.favs.set(n, { url: n, title: clean(m.title), image: normImg(m.image), priceText: clean(m.priceText), favoritedAt: new Date().toISOString() });
    if (state.bans.delete(n)) saveBans();
    saveFavs(); applyFilters(); renderReviewBody(); ensureVisible(); status("Přidáno do Favorite a chráněno před blokací.");
  }

  function banUrl(u, c, reason) {
    const n = normUrl(u); if (!n) return false;
    if (state.favs.has(n)) { status("Favorite je chráněné a nelze ho blokovat."); return false; }
    if (state.bans.has(n)) return false;
    const m = metaFor(n, c);
    state.bans.set(n, { url: n, title: clean(m.title), image: normImg(m.image), priceText: clean(m.priceText), reason: clean(reason || "ručně"), bannedAt: new Date().toISOString() });
    saveBans(); applyFilters(); renderReviewBody(); ensureVisible(); return true;
  }

  function unbanUrl(u) {
    const n = normUrl(u); if (!n) return false;
    if (!state.bans.delete(n)) return false;
    saveBans(); applyFilters(); renderReviewBody(); ensureVisible(); return true;
  }

  function banLoadedRange(min, max) {
    let added = 0, nonNum = 0, favSkip = 0, already = 0;
    for (const [u, c] of state.cards.entries()) {
      if (state.favs.has(u)) { favSkip++; continue; }
      const p = cardPrice(c);
      if (p == null) { nonNum++; continue; }
      if (!inRange(p, min, max)) continue;
      if (state.bans.has(u)) { already++; continue; }
      if (banUrl(u, c, `range:${fmtRange(min, max)}`)) added++;
    }
    return { added, nonNum, favSkip, already };
  }

  function cardPrice(c) {
    const v = c.dataset.bzxPrice || "";
    if (v !== "") {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
    const p = priceVal(c.dataset.bzxPriceText || priceText(c));
    c.dataset.bzxPrice = String(p);
    return p;
  }

  function inRange(p, min, max) { if (min != null && p < min) return false; if (max != null && p > max) return false; return true; }
  function fmtRange(min, max) { return `${min == null ? "-inf" : min}..${max == null ? "+inf" : max}`; }

  function buildPanel() {
    const p = document.createElement("div");
    p.id = "bzx-panel";
    const skRow = ROOT === "bazos.cz"
      ? `<div class="bzx-row"><label><input type="checkbox" id="bzx-include-sk"> Zahrnout hledání i na bazos.sk (EUR → Kč podle ČNB)</label></div>`
      : "";
    p.innerHTML = `<div id="bzx-head"><strong>Bazos pomocník</strong><span class="bzx-spin" id="bzx-spin"></span></div><div id="bzx-body"><div class="bzx-row bzx-meta" id="bzx-count"></div><div class="bzx-row"><input type="text" id="bzx-url" placeholder="URL inzerátu pro blokaci / odblokaci"><button type="button" id="bzx-ban">Blokovat URL</button><button type="button" id="bzx-unban">Odblokovat URL</button></div><div class="bzx-row"><input type="text" id="bzx-min" placeholder="Cena od"><input type="text" id="bzx-max" placeholder="Cena do"><button type="button" id="bzx-range">Zablokovat načtené v rozsahu</button></div><div class="bzx-row"><input type="text" id="bzx-terms" placeholder="Další #hledat výrazy (čárka/středník)"><button type="button" id="bzx-loadterms">Načíst výrazy</button><button type="button" id="bzx-clearterms">Vyčistit</button></div>${skRow}<div class="bzx-row"><button type="button" id="bzx-export">Export blokací</button><button type="button" id="bzx-import">Import blokací</button><input type="file" id="bzx-file" accept=".json,application/json" style="display:none"></div><div class="bzx-row"><label><input type="checkbox" id="bzx-review"> Režim kontroly (zobrazit skryté)</label><button type="button" id="bzx-open">Přehled</button><button type="button" id="bzx-clear">Smazat blokace</button></div><div id="bzx-status"></div></div>`;
    mountPanel(p);
    state.dom = {
      ...state.dom,
      panel: p,
      spin: p.querySelector("#bzx-spin"),
      count: p.querySelector("#bzx-count"),
      status: p.querySelector("#bzx-status"),
      review: p.querySelector("#bzx-review"),
      terms: p.querySelector("#bzx-terms"),
      file: p.querySelector("#bzx-file"),
      includeSk: p.querySelector("#bzx-include-sk")
    };

    if (state.dom.includeSk) {
      state.dom.includeSk.checked = !!state.includeSk;
    }

    p.querySelector("#bzx-ban").onclick = () => {
      const u = normUrl((p.querySelector("#bzx-url").value || "").trim());
      if (!u) return status("Zadejte platné URL inzerátu (/inzerat/...).");
      status(banUrl(u, state.cards.get(u) || null, "ručně") ? "URL zablokováno." : "URL nebylo zablokováno (už blokované nebo Favorite).");
    };

    p.querySelector("#bzx-unban").onclick = () => {
      const u = normUrl((p.querySelector("#bzx-url").value || "").trim());
      if (!u) return status("Zadejte platné URL inzerátu (/inzerat/...).");
      status(unbanUrl(u) ? "URL odblokováno." : "URL není v seznamu blokací.");
    };

    p.querySelector("#bzx-range").onclick = () => {
      const min = numOrNull(p.querySelector("#bzx-min").value), max = numOrNull(p.querySelector("#bzx-max").value);
      if (min == null && max == null) return status("Zadejte cenu od a/nebo cenu do.");
      let lo = min, hi = max; if (lo != null && hi != null && lo > hi) { const t = lo; lo = hi; hi = t; }
      busy(true, "Používám cenový filtr...");
      try {
        const r = banLoadedRange(lo, hi);
        applyFilters(); renderReviewBody(); ensureVisible();
        status(`Hotovo: přidáno ${r.added}, nenumerických cen ${r.nonNum}, přeskočeno Favorite ${r.favSkip}, už blokováno ${r.already}.`);
      } finally { busy(false); }
    };

    p.querySelector("#bzx-loadterms").onclick = async () => { await setTerms(parseTerms(state.dom.terms.value || "")); };
    p.querySelector("#bzx-clearterms").onclick = async () => { state.dom.terms.value = ""; await setTerms([]); };
    p.querySelector("#bzx-export").onclick = () => exportBans();
    p.querySelector("#bzx-import").onclick = () => { state.dom.file.value = ""; state.dom.file.click(); };
    state.dom.file.onchange = async () => { if (state.dom.file.files?.length) await importBans(state.dom.file.files[0]); };
    state.dom.review.onchange = () => { state.review = state.dom.review.checked; applyFilters(); status(state.review ? "Režim kontroly zapnut." : "Režim kontroly vypnut."); };
    if (state.dom.includeSk) {
      state.dom.includeSk.onchange = async () => {
        state.includeSk = !!state.dom.includeSk.checked;
        saveSettings();
        if (state.includeSk) {
          busy(true, "Načítám denní kurz ČNB...");
          try {
            const rate = await getDailyEurToCzkRate();
            status(`Kurz EUR/CZK (ČNB): ${rate.toFixed(4)}`);
          } finally {
            busy(false);
          }
        } else {
          applyFilters();
          ensureVisible();
        }
        await setTerms(parseTerms(state.dom.terms.value || ""));
      };
    }
    p.querySelector("#bzx-open").onclick = () => openReview();
    p.querySelector("#bzx-clear").onclick = () => { state.bans.clear(); saveBans(); applyFilters(); renderReviewBody(); ensureVisible(); status("Všechny blokace smazány."); };
  }

  function mountPanel(p) {
    const r = document.querySelector(".listah .rubriky");
    if (r?.parentElement) { r.insertAdjacentElement("afterend", p); return; }
    const m = document.querySelector(".maincontent");
    if (m) { m.prepend(p); return; }
    document.body.prepend(p);
  }

  function buildPagingStatus() {
    const indicator = document.createElement("div");
    indicator.id = "bzx-paging-status";
    indicator.innerHTML = `<span class="bzx-pager-spin" id="bzx-pager-spin"></span><span class="bzx-pager-done" id="bzx-pager-done">✔</span><span id="bzx-pager-text">Připraveno</span>`;
    const pager = document.querySelector(".strankovani");
    if (pager && pager.parentElement) {
      pager.insertAdjacentElement("beforebegin", indicator);
    } else if (document.querySelector(".maincontent")) {
      document.querySelector(".maincontent").appendChild(indicator);
    } else {
      document.body.appendChild(indicator);
    }
    state.dom.pager = indicator;
    state.dom.pagerSpin = indicator.querySelector("#bzx-pager-spin");
    state.dom.pagerDone = indicator.querySelector("#bzx-pager-done");
    state.dom.pagerText = indicator.querySelector("#bzx-pager-text");
    updatePagingStatus();
  }

  function updatePagingStatus() {
    if (!state.dom.pager) return;
    const done = !hasLoadable() && !state.loading && !state.ensuring;
    const busyNow = state.loading || state.busy > 0;
    if (state.dom.pagerSpin) state.dom.pagerSpin.classList.toggle("on", busyNow && !done);
    if (state.dom.pagerDone) state.dom.pagerDone.classList.toggle("on", done);
    if (!state.dom.pagerText) return;
    if (done) state.dom.pagerText.textContent = "Vše načteno";
    else if (busyNow) state.dom.pagerText.textContent = "Načítání...";
    else state.dom.pagerText.textContent = "Připraveno";
  }

  function buildReview() {
    const empty = document.createElement("div");
    empty.id = "bzx-empty";
    empty.textContent = "Momentálně nejsou viditelné nabídky (načtené položky jsou blokované). Automaticky načítám další stránky.";
    (document.querySelector(".maincontent") || document.body).prepend(empty);
    state.dom.empty = empty;

    const modal = document.createElement("div");
    modal.id = "bzx-modal";
    modal.innerHTML = `<div id="bzx-card"><div class="bzx-row" style="justify-content:space-between"><strong>Přehled blokací a Favorite</strong><button type="button" id="bzx-close">Zavřít</button></div><div id="bzx-review-body"></div></div>`;
    document.body.appendChild(modal);
    state.dom.modal = modal;
    state.dom.reviewBody = modal.querySelector("#bzx-review-body");
    modal.querySelector("#bzx-close").onclick = () => closeReview();
    modal.onclick = (e) => { if (e.target === modal) closeReview(); };
    renderReviewBody();
  }

  function openReview() {
    state.reviewLimits.fav = 10;
    state.reviewLimits.ban = 10;
    renderReviewBody();
    state.dom.modal.classList.add("on");
  }
  function closeReview() { state.dom.modal.classList.remove("on"); }

  function renderReviewBody() {
    if (!state.dom.reviewBody) return;
    const bans = [...state.bans.values()].reverse();
    const favs = [...state.favs.values()].reverse();
    const favLimit = Math.max(1, Number(state.reviewLimits?.fav || 10));
    const banLimit = Math.max(1, Number(state.reviewLimits?.ban || 10));
    const shownFavs = favs.slice(0, favLimit);
    const shownBans = bans.slice(0, banLimit);

    let h = `<div class="bzx-title">Favorite (${favs.length})</div>`;
    if (!favs.length) {
      h += `<div class="bzx-sm">Žádné Favorite položky.</div>`;
    } else {
      h += `<div class="bzx-grid">`;
      for (const f of shownFavs) {
        const t = f.title || "(bez uloženého názvu)";
        const i = f.image || "";
        const p = f.priceText || "";
        const tm = f.favoritedAt ? new Date(f.favoritedAt).toLocaleString() : "";
        h += `<div class="bzx-item">${i ? `<img class="bzx-thumb" src="${esc(i)}" alt="">` : `<div class="bzx-thumb"></div>`}<div class="bzx-wrap"><div class="bzx-tt">${esc(t)}</div><div class="bzx-url">${esc(f.url)}</div><div class="bzx-sm">Chráněné Favorite${p ? ` | Cena: ${esc(p)}` : ""}${tm ? ` | ${esc(tm)}` : ""}</div></div><div><button type="button" data-unfav="${esc(f.url)}">Odebrat Favorite</button></div></div>`;
      }
      h += `</div>`;
      if (shownFavs.length < favs.length) {
        h += `<div class="bzx-row"><button type="button" data-more="fav">Načíst další Favorite (+10)</button></div>`;
      }
    }

    h += `<div class="bzx-title">Blokované URL (${bans.length})</div>`;
    if (!bans.length) {
      h += `<div class="bzx-sm">Žádné blokované URL.</div>`;
    } else {
      h += `<div class="bzx-grid">`;
      for (const b of shownBans) {
        const t = b.title || "(bez uloženého názvu)";
        const i = b.image || "";
        const p = b.priceText || "";
        const tm = b.bannedAt ? new Date(b.bannedAt).toLocaleString() : "";
        h += `<div class="bzx-item">${i ? `<img class="bzx-thumb" src="${esc(i)}" alt="">` : `<div class="bzx-thumb"></div>`}<div class="bzx-wrap"><div class="bzx-tt">${esc(t)}</div><div class="bzx-url">${esc(b.url)}</div><div class="bzx-sm">Důvod: ${esc(b.reason || "ručně")}${p ? ` | Cena: ${esc(p)}` : ""}${tm ? ` | ${esc(tm)}` : ""}</div></div><div><button type="button" data-unban="${esc(b.url)}">Odblokovat</button><button type="button" data-fav="${esc(b.url)}">Favorite</button></div></div>`;
      }
      h += `</div>`;
      if (shownBans.length < bans.length) {
        h += `<div class="bzx-row"><button type="button" data-more="ban">Načíst další blokace (+10)</button></div>`;
      }
    }

    state.dom.reviewBody.innerHTML = h;
    state.dom.reviewBody.querySelectorAll("button[data-more]").forEach((b) => {
      b.onclick = () => {
        const kind = b.getAttribute("data-more");
        if (kind === "fav") state.reviewLimits.fav += 10;
        if (kind === "ban") state.reviewLimits.ban += 10;
        requestAnimationFrame(renderReviewBody);
      };
    });
    state.dom.reviewBody.querySelectorAll("button[data-unban]").forEach((b) => b.onclick = () => unbanUrl(b.getAttribute("data-unban")));
    state.dom.reviewBody.querySelectorAll("button[data-fav]").forEach((b) => b.onclick = () => toggleFav(b.getAttribute("data-fav"), state.cards.get(b.getAttribute("data-fav")) || null));
    state.dom.reviewBody.querySelectorAll("button[data-unfav]").forEach((b) => b.onclick = () => {
      const u = b.getAttribute("data-unfav");
      if (state.favs.delete(u)) { saveFavs(); applyFilters(); renderReviewBody(); ensureVisible(); }
    });
  }

  function applyFilters() {
    for (const u of state.favs.keys()) state.bans.delete(u);
    saveBans();
    let hidden = 0, visible = 0;
    for (const [u, c] of state.cards.entries()) {
      const fav = state.favs.has(u), banned = state.bans.has(u) && !fav;
      const skHiddenBySource = isHiddenBySource(u);
      c.classList.toggle("bzx-fav-card", fav);
      syncCardButtons(c, u, fav, banned);
      if (banned || skHiddenBySource) {
        hidden++;
        c.classList.add("bzx-hide");
        c.classList.remove("bzx-review");
      } else {
        visible++;
        c.classList.remove("bzx-hide");
        if (state.review) c.classList.add("bzx-review");
        else c.classList.remove("bzx-review");
      }
    }
    updateCounts(visible, hidden);
    if (state.dom.empty) state.dom.empty.style.display = visible <= 0 && state.cards.size > 0 && !state.review ? "block" : "none";
  }

  function isHiddenBySource(url) {
    return ROOT === "bazos.cz" && !state.includeSk && isSkListingUrl(url);
  }

  function updateCounts(visible, hidden) {
    if (!state.dom.count) return;
    state.dom.count.textContent = `Načteno: ${state.cards.size} | Viditelné: ${visible} | Skryté: ${hidden} | Blokace: ${state.bans.size} | Favorite: ${state.favs.size} | Hledání: ${Math.max(state.order.length, 1)}`;
  }

  function status(msg) { if (state.dom.status) state.dom.status.textContent = msg || ""; }

  function busy(on, msg) {
    if (on) state.busy++; else state.busy = Math.max(0, state.busy - 1);
    if (msg) status(msg);
    if (state.dom.spin) state.dom.spin.classList.toggle("on", state.busy > 0);
    updatePagingStatus();
  }

  function setTerms(terms) {
    return (async () => {
      busy(true, "Nastavuji hledání...");
      try {
        if (shouldIncludeSkMirror()) {
          await getDailyEurToCzkRate();
        }
        const old = state.streams;
        const next = new Map(), order = [];
        const p = old.get(state.primary);
        if (p) { next.set(state.primary, p); order.push(state.primary); }

        for (const t of terms) {
          const k = `term:${normTxt(t)}`;
          if (!k || next.has(k)) continue;
          let s = old.get(k);
          if (!s) s = { key: k, term: t, next: searchUrl(t), seen: new Set(), done: false, failCount: 0 };
          next.set(k, s); order.push(k);
        }

        if (shouldIncludeSkMirror()) {
          const mirroredTerms = parseTerms([state.currentTerm, ...terms].join(","));
          for (const t of mirroredTerms) {
            const k = skMirrorKey(t);
            if (!k || next.has(k)) continue;
            let s = old.get(k);
            if (!s) s = { key: k, term: t, next: searchUrl(t, "https://www.bazos.sk"), seen: new Set(), done: false, isSkMirror: true, failCount: 0 };
            next.set(k, s); order.push(k);
          }
        }

        state.streams = next;
        state.order = order;
        state.cursor = 0;

        const extras = order.filter((k) => k !== state.primary);
        for (const k of extras) {
          const s = state.streams.get(k);
          if (!s || s.done || !s.next) continue;
          await loadStream(s);
        }

        applyFilters();
        status(`Aktivní hledání: ${labels().join(", ") || "(pouze hlavní)"}`);
        ensureVisible();
      } finally {
        busy(false);
      }
    })();
  }

  function labels() {
    const out = [];
    for (const k of state.order) {
      const s = state.streams.get(k);
      if (!s) continue;
      if (k === state.primary) {
        out.push(s.term ? `hlavní:${s.term}` : "hlavní");
      } else if (s.isSkMirror) {
        out.push(`${s.term || "výraz"} (SK)`);
      } else {
        out.push(s.term || k);
      }
    }
    return out;
  }

  function searchUrl(term, baseOrigin) {
    const u = new URL(location.href);
    if (baseOrigin) {
      u.protocol = "https:";
      u.host = new URL(baseOrigin).host;
      u.pathname = "/search.php";
    } else if (!/search\.php$/i.test(u.pathname)) {
      u.pathname = "/search.php";
    }
    u.searchParams.set("hledat", term);
    u.searchParams.delete("crz");
    return u.toString();
  }

  function setupInfinite() {
    const s = document.createElement("div");
    s.id = "bzx-sentinel";
    (document.querySelector(".maincontent") || document.body).appendChild(s);
    state.dom.sentinel = s;

    new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) loadNext();
    }, { root: null, rootMargin: "1200px 0px", threshold: 0.01 }).observe(s);

    window.addEventListener("scroll", throttle(() => {
      const rem = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      if (rem < 1200) loadNext();
      if (visibleCount() < state.minVisible) ensureVisible();
    }, 200), { passive: true });
  }

  function pickStream() {
    if (!state.order.length) return null;
    for (let i = 0; i < state.order.length; i++) {
      const idx = (state.cursor + i) % state.order.length;
      const s = state.streams.get(state.order[idx]);
      if (s && !s.done && s.next) {
        state.cursor = (idx + 1) % state.order.length;
        return s;
      }
    }
    return null;
  }

  function hasLoadable() {
    for (const k of state.order) {
      const s = state.streams.get(k);
      if (s && !s.done && s.next) return true;
    }
    return false;
  }

  function disableAllSkStreams() {
    for (const s of state.streams.values()) {
      if (s && s.isSkMirror) {
        s.done = true;
        s.next = null;
      }
    }
  }

  async function loadNext() {
    if (state.loading) return false;
    const s = pickStream();
    if (!s) { updatePagingStatus(); return false; }
    return loadStream(s);
  }

  async function loadStream(s) {
    if (state.loading || !s || s.done || !s.next) return false;
    const target = s.next, off = offset(target);
    if (s.seen.has(off)) { s.done = true; s.next = null; updatePagingStatus(); return false; }

    if (s.isSkMirror && ROOT === "bazos.cz") {
      await getDailyEurToCzkRate();
    }

    state.loading = true;
    busy(true, `Načítám ${s.term ? `"${s.term}"` : "výsledky"}...`);
    try {
      const html = await fetchTextSmart(target);
      const doc = new DOMParser().parseFromString(html, "text/html");

      let added = 0;
      for (const src of cardsFromDoc(doc, target)) {
        const u = cardUrl(src, target);
        if (!u || state.cards.has(u)) continue;
        const cl = document.importNode(src, true);
        cl.dataset.bzxUrl = u;
        absolutizeCardLinks(cl, target);
        appendCard(cl);
        added++;
      }

      s.seen.add(off);
      s.failCount = 0;
      const n = nextPage(doc, target);
      if (!n || s.seen.has(offset(n))) { s.next = null; s.done = true; }
      else s.next = n;

      applyFilters();
      renderReviewBody();

      if (added > 0) status(`Načteno ${added} nabídek${s.term ? ` pro "${s.term}"` : ""}.`);
      else if (s.done) status(`Další nabídky nejsou${s.term ? ` pro "${s.term}"` : ""}.`);
      else status(`Stránka načtena${s.term ? ` pro "${s.term}"` : ""}, bez nových unikátních nabídek.`);

      if (visibleCount() < state.minVisible) ensureVisible();
      return added > 0;
    } catch (e) {
      const msg = String(e?.message || e || "");
      s.failCount = Number(s.failCount || 0) + 1;
      const corsLike = /cross_origin|cors|failed to fetch|networkerror/i.test(msg);

      if (corsLike && s.isSkMirror) {
        disableAllSkStreams();
        if (state.includeSk) {
          state.includeSk = false;
          saveSettings();
          if (state.dom.includeSk) state.dom.includeSk.checked = false;
        }
        status("Blokace mezi doménami (CORS) pro bazos.sk. SK hledání bylo vypnuto. Pro povolení použijte GM_xmlhttpRequest + @connect bazos.sk.");
      } else if (s.failCount >= 2) {
        s.done = true;
        s.next = null;
        status(`Načítání selhalo (${msg}). Tento zdroj byl po 2 pokusech zastaven.`);
      } else {
        status(`Načítání selhalo (${msg}). Zkusím to ještě jednou.`);
      }
      updatePagingStatus();
      return false;
    } finally {
      state.loading = false;
      busy(false);
      updatePagingStatus();
    }
  }

  function appendCard(c) {
    let a = state.last;
    if (!a || !a.isConnected) {
      const cur = cardsFromDoc(document, location.href);
      a = cur.length ? cur[cur.length - 1] : null;
    }
    if (a?.parentElement) a.insertAdjacentElement("afterend", c);
    else (document.querySelector(".maincontent") || document.body).appendChild(c);
    state.last = c;
    regCard(c);
  }

  async function ensureVisible() {
    if (state.ensuring || state.loading) return;
    state.ensuring = true;
    try {
      let guard = 0;
      let failStreak = 0;
      while (visibleCount() < state.minVisible && hasLoadable() && guard < 20) {
        guard++;
        const ok = await loadNext();
        if (!ok) {
          failStreak++;
          if (!hasLoadable() || failStreak >= 3) break;
        } else {
          failStreak = 0;
        }
      }
    } finally {
      state.ensuring = false;
      if (state.dom.empty) state.dom.empty.style.display = visibleCount() <= 0 && state.cards.size > 0 && !state.review ? "block" : "none";
      updatePagingStatus();
    }
  }

  function visibleCount() {
    let c = 0;
    for (const u of state.cards.keys()) {
      if (state.favs.has(u)) { c++; continue; }
      if (state.bans.has(u)) continue;
      if (isHiddenBySource(u)) continue;
      c++;
    }
    return c;
  }

  function nextPage(doc, base) {
    const links = [...doc.querySelectorAll(".strankovani a, a[rel='nofollow']")];
    const by = links.find((a) => /\b(dalsi|dalsia|dalsie|dalej|next)\b/.test(normTxt(a.textContent || "")));
    if (by?.getAttribute("href")) return abs(by.getAttribute("href"), base);

    const cur = offset(base);
    let best = null, bo = Number.POSITIVE_INFINITY;
    for (const a of links) {
      const h = a.getAttribute("href");
      if (!h) continue;
      const u = abs(h, base), o = offset(u);
      if (o > cur && o < bo) { bo = o; best = u; }
    }
    return best;
  }

  function offset(u) {
    try {
      const x = new URL(u, location.href);
      const r = x.searchParams.get("crz");
      const n = r == null ? 0 : parseInt(r, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (_) { return 0; }
  }

  function abs(h, b) { return new URL(h, b || location.href).toString(); }

  function absolutizeCardLinks(card, baseHref) {
    if (!card) return;
    for (const a of card.querySelectorAll("a[href]")) {
      const h = a.getAttribute("href");
      if (!h) continue;
      try { a.setAttribute("href", abs(h, baseHref)); } catch (_) {}
    }
    for (const img of card.querySelectorAll("img[src]")) {
      const s = img.getAttribute("src");
      if (!s) continue;
      try { img.setAttribute("src", abs(s, baseHref)); } catch (_) {}
    }
  }

  async function importBans(file) {
    if (!file) return;
    busy(true, "Importuji data...");
    try {
      const txt = await readFile(file);
      const obj = JSON.parse(txt);
      const arrBans = Array.isArray(obj)
        ? obj
        : (obj && Array.isArray(obj.bans) ? obj.bans : null);
      const arrFavs = obj && !Array.isArray(obj) && Array.isArray(obj.favorites) ? obj.favorites : [];
      if (!arrBans) throw new Error("Nepodporovaný JSON formát.");

      let add = 0, skip = 0, favAdd = 0, favSkip = 0;
      for (const it of arrBans) {
        const n = normBan(it);
        if (!n) { skip++; continue; }
        if (state.favs.has(n.url) || state.bans.has(n.url)) { skip++; continue; }
        state.bans.set(n.url, n);
        add++;
      }

      for (const it of arrFavs) {
        const n = normFav(it);
        if (!n) { favSkip++; continue; }
        if (state.favs.has(n.url)) { favSkip++; continue; }
        state.favs.set(n.url, n);
        state.bans.delete(n.url);
        favAdd++;
      }

      saveBans();
      saveFavs();
      applyFilters();
      renderReviewBody();
      ensureVisible();
      status(`Import hotov: blokace +${add} (přeskočeno ${skip}), Favorite +${favAdd} (přeskočeno ${favSkip}).`);
    } catch (e) {
      status(`Import selhal: ${String(e?.message || e)}`);
    } finally {
      busy(false);
    }
  }

  function exportBans() {
    const payload = { version: 1, site: ROOT, exportedAt: new Date().toISOString(), bans: [...state.bans.values()], favorites: [...state.favs.values()] };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const name = `bazos-bans-${ROOT}-${new Date().toISOString().slice(0, 10)}.json`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
    status("Export hotov (blokace + Favorite).");
  }

  function readFile(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result || ""));
      r.onerror = () => rej(new Error("Nepodařilo se načíst soubor."));
      r.readAsText(file);
    });
  }

  function numOrNull(v) {
    if (v == null || v === "") return null;
    const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }

  function clean(v) { return String(v || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim(); }
  function normTxt(v) { return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
  function esc(v) { return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }

  function parseTerms(raw) {
    const parts = String(raw || "").split(/[,;\n]+/g).map((s) => clean(s)).filter(Boolean);
    const out = [], seen = new Set();
    for (const p of parts) {
      const k = normTxt(p);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }

  function throttle(fn, ms) {
    let last = 0, t = null;
    return function (...args) {
      const now = Date.now(), rem = ms - (now - last);
      if (rem <= 0) { last = now; fn.apply(this, args); return; }
      if (t) return;
      t = setTimeout(() => { t = null; last = Date.now(); fn.apply(this, args); }, rem);
    };
  }
})();

