/* Auslan Tutor — shared runtime.
 *
 * Provides:
 *   <auslan-sign sign="hello">tips…</auslan-sign>      sign card with inline Signbank video
 *   <auslan-quiz sign="hello" options="a|b|c|d">        "which sign is this?" card
 *   <fingerspell-drill words="cat,dog">                 fingerspelling reader / player
 *   Mirror panel (camera mirror + record & compare)     toggle with M
 *   Site header, lesson prev/next, "mark complete"
 *   window.AuslanTutor = { ROOT, loadSigns, loadLessons, progress, saveProgress, Mirror }
 */
(() => {
  "use strict";

  const ROOT = new URL("..", document.currentScript.src).href;
  const PROGRESS_KEY = "auslan.progress.v1";

  /* ---------- storage (never throws) ---------- */
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
    },
  };

  const progress = Object.assign({ lessons: {}, signs: {} }, store.get(PROGRESS_KEY, {}));
  const saveProgress = () => store.set(PROGRESS_KEY, progress);

  /* ---------- the visitor's name (personalises fingerspelling examples) ---------- */
  const NAME_KEY = "auslan.user.name";
  const FALLBACK_NAME = "Alex";
  const userName = () => store.get(NAME_KEY, "");
  const nameLetters = () => (userName() || FALLBACK_NAME).toLowerCase().replace(/[^a-z]/g, "") || FALLBACK_NAME.toLowerCase();
  const spelled = (word) => word.toUpperCase().split("").join("-");
  // <span class="user-name"> → "Sam" · <span class="user-name" data-format="spelled"> → "S-A-M"
  function applyUserName(root = document) {
    const name = userName();
    root.querySelectorAll(".user-name").forEach((el) => {
      if (el.dataset.format === "spelled") el.textContent = spelled(nameLetters());
      else el.textContent = name || "your name";
    });
  }
  function setUserName(name) {
    store.set(NAME_KEY, name.trim().slice(0, 30));
    applyUserName();
  }

  /* ---------- progress file: save / load / merge ---------- */
  const EXTRA_KEYS = [NAME_KEY, "auslan.user.state", "auslan.spell.best", "auslan.spell.level", "auslan.spell.speed", "auslan.speed"];

  function exportProgress() {
    const data = { app: "auslan-tutor", version: 1, exported: new Date().toISOString(), progress, settings: {} };
    for (const k of EXTRA_KEYS) data.settings[k] = store.get(k, null);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    h("a", { href: url, download: `auslan-progress-${new Date().toISOString().slice(0, 10)}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Merges a progress file into this browser. Nothing is lost: completed lessons are combined,
  // and for each sign the most recently reviewed record wins.
  async function importProgress(file) {
    const data = JSON.parse(await file.text());
    if (data.app !== "auslan-tutor" || !data.progress) throw new Error("That isn't an Auslan Tutor progress file.");
    let lessons = 0, signs = 0;
    for (const [id, when] of Object.entries(data.progress.lessons || {})) {
      if (!progress.lessons[id]) { progress.lessons[id] = when; lessons++; }
    }
    for (const [key, rec] of Object.entries(data.progress.signs || {})) {
      const mine = progress.signs[key];
      if (!mine || (rec.seen || 0) > (mine.seen || 0)) { progress.signs[key] = rec; signs++; }
    }
    saveProgress();
    const s = data.settings || {};
    if (s[NAME_KEY] && !userName()) store.set(NAME_KEY, s[NAME_KEY]);
    if (s["auslan.user.state"] && !store.get("auslan.user.state", "")) store.set("auslan.user.state", s["auslan.user.state"]);
    if ((s["auslan.spell.best"] || 0) > store.get("auslan.spell.best", 0)) store.set("auslan.spell.best", s["auslan.spell.best"]);
    for (const k of ["auslan.spell.level", "auslan.spell.speed", "auslan.speed"]) if (s[k] != null) store.set(k, s[k]);
    return { lessons, signs };
  }

  const isAuthor = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);

  /* ---------- data ---------- */
  let signsPromise, lessonsPromise;
  const loadJSON = (path) =>
    fetch(ROOT + path, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    });
  const loadSigns = () => (signsPromise ||= loadJSON("data/signs.json").then(applyRegions));

  /* ---------- regions: prefer the visitor's state, then dialect, then Australia-wide ---------- */
  const STATE_KEY = "auslan.user.state";
  const STATES = {
    WA: "Western Australia", SA: "South Australia", VIC: "Victoria", TAS: "Tasmania",
    NSW: "New South Wales", QLD: "Queensland", ACT: "Australian Capital Territory", NT: "Northern Territory",
  };
  // Auslan's two main dialects. NT isn't clearly either, so it just gets state matches and Australia-wide.
  const DIALECT = { WA: "Southern", SA: "Southern", VIC: "Southern", TAS: "Southern", NSW: "Northern", QLD: "Northern", ACT: "Northern" };
  // Signbank region tags (from its map images) → short labels.
  const REGION_ABBR = {
    WesternAustralia: "WA", SouthAustralia: "SA", Victoria: "VIC", Tasmania: "TAS", NewSouthWales: "NSW",
    Queensland: "QLD", AustralianCapitalTerritory: "ACT", NorthernTerritory: "NT",
    SouthernDialect: "Southern", NorthernDialect: "Northern", AustraliaWide: "Australia-wide",
  };
  const userState = () => store.get(STATE_KEY, "");
  const regionLabel = (region) => {
    const base = (region || "").replace(/-.*$/, "");
    return REGION_ABBR[base] || base.replace(/([a-z])([A-Z])/g, "$1 $2") || "Australia-wide";
  };
  // Higher = better match for this visitor.
  function regionScore(region, state = userState()) {
    const label = regionLabel(region);
    if (state && label === state) return 3;
    if (state && DIALECT[state] && label === DIALECT[state]) return 2;
    if (label === "Australia-wide") return 1;
    return 0;
  }
  const bestVariant = (variants) =>
    variants.reduce((best, v) => (regionScore(v.region) > regionScore(best.region) ? v : best), variants[0]);
  // For signs with regional variants, copy the best variant's video/poster/entry/region onto the sign,
  // so every component (cards, quizzes, phrases, review) uses the visitor's version.
  function applyRegions(signs) {
    for (const s of Object.values(signs)) {
      if (s.variants?.length) Object.assign(s, bestVariant(s.variants));
    }
    return signs;
  }
  const setUserState = (state) => store.set(STATE_KEY, state);
  const loadLessons = () => (lessonsPromise ||= loadJSON("data/lessons.json"));

  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const isTyping = (e) =>
    e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const SPEEDS = [0.25, 0.5, 0.75, 1];
  const defaultSpeed = () => store.get("auslan.speed", 1);

  /* =====================================================================
   * Mirror panel
   * ===================================================================== */
  const Mirror = {
    el: null,
    stream: null,
    recorder: null,
    takeUrl: null,
    takeType: "",
    refCard: null,
    flipped: store.get("auslan.mirror.flip", true),

    build() {
      if (this.el) return;
      this.live = h("video", { autoplay: true, muted: true, playsInline: true, class: this.flipped ? "flip" : "" });
      this.camMsg = h("div", { class: "cam-msg" });
      this.countdown = h("div", { class: "countdown" });
      this.refVideo = h("video", { muted: true, loop: true, playsInline: true });
      this.refLabel = h("div", { class: "label" }, "Reference");
      this.takeVideo = h("video", { muted: true, loop: true, playsInline: true, class: this.flipped ? "flip" : "" });

      this.refTile = h("div", { class: "mirror-tile ref", hidden: true }, this.refVideo, this.refLabel);
      this.liveTile = h("div", { class: "mirror-tile" }, this.live, h("div", { class: "label" }, "You · live"), this.camMsg, this.countdown);
      this.takeTile = h("div", { class: "mirror-tile", hidden: true }, this.takeVideo, h("div", { class: "label" }, "Your take"));

      this.dot = h("span", { class: "rec-dot" });
      this.flipBtn = h("button", { class: "btn small" + (this.flipped ? " on" : ""), title: "Mirror image (flip horizontally)", onclick: () => this.toggleFlip() }, "⇋ Flip");
      this.refBtn = h("button", { class: "btn small", title: "Show/hide the reference sign", hidden: true, onclick: () => this.toggleRef() }, "Reference");
      const bar = h("div", { class: "mirror-bar" },
        h("div", { class: "title" }, this.dot, "Mirror"),
        this.refBtn, this.flipBtn,
        h("button", { class: "btn small", title: "Close (M)", "aria-label": "Close mirror", onclick: () => this.close() }, "✕"));

      this.recBtn = h("button", { class: "btn small primary", title: "Record (R)", onclick: () => this.record() }, "● Record");
      this.durSel = h("select", { title: "Recording length" },
        [3, 5, 8, 12].map((s) => h("option", { value: s, selected: s === store.get("auslan.rec.dur", 5) }, `${s}s`)));
      this.durSel.addEventListener("change", () => store.set("auslan.rec.dur", +this.durSel.value));
      this.speedSel = h("select", { title: "Playback speed for reference and your take" },
        SPEEDS.map((s) => h("option", { value: s, selected: s === 1 }, `${s}×`)));
      this.speedSel.addEventListener("change", () => this.applySpeed());
      this.replayBtn = h("button", { class: "btn small", title: "Restart reference and take together", onclick: () => this.replayBoth() }, "↺ Sync");
      this.dlBtn = h("button", { class: "btn small", hidden: true, onclick: () => this.download() }, "⬇");
      this.clearBtn = h("button", { class: "btn small", hidden: true, title: "Discard take", onclick: () => this.clearTake() }, "🗑");
      const tools = h("div", { class: "mirror-tools" },
        this.recBtn, this.durSel, h("span", { class: "grow" }), this.speedSel, this.replayBtn, this.dlBtn, this.clearBtn);

      this.el = h("section", { class: "mirror-panel", "aria-label": "Camera mirror" },
        bar, h("div", { class: "mirror-stage" }, this.refTile, this.liveTile, this.takeTile), tools);
      document.body.append(this.el);
      this.makeDraggable(bar);
    },

    makeDraggable(handle) {
      let sx, sy, ox, oy;
      handle.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button, select")) return;
        const r = this.el.getBoundingClientRect();
        sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        handle.setPointerCapture(e.pointerId);
      });
      handle.addEventListener("pointermove", (e) => {
        if (sx == null) return;
        const x = Math.min(Math.max(0, ox + e.clientX - sx), innerWidth - 80);
        const y = Math.min(Math.max(0, oy + e.clientY - sy), innerHeight - 40);
        Object.assign(this.el.style, { left: x + "px", top: y + "px", right: "auto", bottom: "auto" });
      });
      const end = () => { sx = null; };
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    },

    get isOpen() { return !!this.el && this.el.classList.contains("open"); },

    async open() {
      this.build();
      this.el.classList.add("open");
      store.set("auslan.mirror.open", true);
      document.querySelectorAll(".mirror-toggle").forEach((b) => b.classList.add("on"));
      if (this.stream) return;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        this.camMsg.textContent = "The camera needs the page served from localhost. Run ./serve.sh and open http://localhost:8000.";
        return;
      }
      this.camMsg.textContent = "Starting camera…";
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (!this.isOpen) return this.stopCamera(); // closed while the prompt was up
        this.live.srcObject = this.stream;
        this.camMsg.textContent = "";
      } catch (err) {
        this.camMsg.textContent =
          err.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it for this browser in System Settings → Privacy & Security → Camera, and for localhost in the browser's site settings, then press M twice."
            : `Couldn't start the camera (${err.name}). Is another app using it?`;
      }
    },

    stopCamera() {
      if (this.recorder && this.recorder.state === "recording") this.recorder.stop();
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      if (this.live) this.live.srcObject = null;
    },

    close() {
      if (!this.el) return;
      this.el.classList.remove("open");
      store.set("auslan.mirror.open", false);
      document.querySelectorAll(".mirror-toggle").forEach((b) => b.classList.remove("on"));
      this.stopCamera(); // camera light goes off
      this.refVideo.pause();
      this.takeVideo.pause();
    },

    toggle() { this.isOpen ? this.close() : this.open(); },

    toggleFlip() {
      this.flipped = !this.flipped;
      store.set("auslan.mirror.flip", this.flipped);
      this.live.classList.toggle("flip", this.flipped);
      this.takeVideo.classList.toggle("flip", this.flipped);
      this.flipBtn.classList.toggle("on", this.flipped);
    },

    setReference({ label, video, card }) {
      this.build();
      this.refCard?.classList.remove("active");
      this.refCard = card || null;
      this.refCard?.classList.add("active");
      this.refVideo.src = video;
      this.refLabel.textContent = label;
      this.refTile.hidden = false;
      this.refBtn.hidden = false;
      this.refBtn.classList.add("on");
      this.applySpeed();
      this.refVideo.play().catch(() => {});
    },

    toggleRef() {
      this.refTile.hidden = !this.refTile.hidden;
      this.refBtn.classList.toggle("on", !this.refTile.hidden);
      if (this.refTile.hidden) this.refVideo.pause(); else this.refVideo.play().catch(() => {});
    },

    applySpeed() {
      const r = +this.speedSel.value;
      this.refVideo.playbackRate = r;
      this.takeVideo.playbackRate = r;
    },

    replayBoth() {
      for (const v of [this.refVideo, this.takeVideo]) {
        if (!v.src || v.closest("[hidden]")) continue;
        v.currentTime = 0;
        v.play().catch(() => {});
      }
    },

    pickMime() {
      const options = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
      return options.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
    },

    async record() {
      if (!this.isOpen) await this.open();
      if (!this.stream || this.recorder?.state === "recording" || this.counting) return;
      if (!window.MediaRecorder) { alert("This browser can't record video."); return; }

      this.counting = true;
      this.recBtn.disabled = true;
      for (const n of [3, 2, 1]) {
        this.countdown.textContent = n;
        this.countdown.classList.add("show");
        await new Promise((r) => setTimeout(r, 800));
      }
      this.countdown.classList.remove("show");
      this.counting = false;

      const mime = this.pickMime();
      const chunks = [];
      this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
      this.takeType = this.recorder.mimeType || mime || "video/webm";
      this.recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      this.recorder.onstop = () => {
        this.dot.classList.remove("live");
        this.recBtn.disabled = false;
        this.recBtn.textContent = "● Record";
        if (!chunks.length) return;
        if (this.takeUrl) URL.revokeObjectURL(this.takeUrl);
        this.takeUrl = URL.createObjectURL(new Blob(chunks, { type: this.takeType }));
        this.takeVideo.src = this.takeUrl;
        this.takeTile.hidden = false;
        this.dlBtn.hidden = false;
        this.clearBtn.hidden = false;
        this.applySpeed();
        this.replayBoth();
      };

      // Start the reference from the top so the two line up roughly on playback.
      if (!this.refTile.hidden && this.refVideo.src) { this.refVideo.currentTime = 0; this.refVideo.play().catch(() => {}); }
      this.recorder.start();
      this.dot.classList.add("live");
      this.recBtn.textContent = "Recording…";
      const secs = +this.durSel.value;
      setTimeout(() => this.recorder?.state === "recording" && this.recorder.stop(), secs * 1000);
    },

    clearTake() {
      if (this.takeUrl) URL.revokeObjectURL(this.takeUrl);
      this.takeUrl = null;
      this.takeVideo.removeAttribute("src");
      this.takeVideo.load();
      this.takeTile.hidden = true;
      this.dlBtn.hidden = true;
      this.clearBtn.hidden = true;
    },

    download() {
      if (!this.takeUrl) return;
      const ext = this.takeType.includes("mp4") ? "mp4" : "webm";
      const name = (this.refLabel.textContent || "take").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      h("a", { href: this.takeUrl, download: `auslan-${name}-${stamp}.${ext}` }).click();
    },
  };

  /* =====================================================================
   * <auslan-sign>
   * ===================================================================== */
  async function resolveSign(el) {
    const d = {
      key: el.getAttribute("sign"),
      label: el.getAttribute("label"),
      english: el.getAttribute("english"),
      video: el.getAttribute("video"),
      poster: el.getAttribute("poster"),
      entry: el.getAttribute("entry"),
      region: el.getAttribute("region"),
    };
    if (d.key && !d.video) {
      const all = await loadSigns().catch(() => ({}));
      const s = all[d.key];
      if (!s) console.warn(`auslan-sign: "${d.key}" is not in data/signs.json`);
      for (const k of ["label", "english", "video", "poster", "entry", "region", "variants"]) d[k] ||= s?.[k];
    }
    d.label ||= (d.key || "").toUpperCase();
    return d;
  }

  class AuslanSign extends HTMLElement {
    async connectedCallback() {
      if (this._built) return;
      this._built = true;
      const tips = [...this.childNodes];
      const d = await resolveSign(this);
      this.data = d;

      const video = h("video", {
        muted: true, loop: true, playsInline: true, preload: "none",
        poster: d.poster || null, src: d.video || null,
      });
      video.playbackRate = defaultSpeed();
      const wrap = h("div", { class: "sign-video-wrap", tabindex: "0", title: "Click to play/pause · ←/→ step when paused" },
        video,
        h("div", { class: "play-badge" }, h("span", {}, "▶")),
        h("div", { class: "err" }, h("div", {}, "Video didn't load. ", d.entry ? h("a", { href: d.entry, target: "_blank", rel: "noopener" }, "Open on Signbank ↗") : null)));

      const playBtn = h("button", { class: "btn small", "aria-label": "Play" }, "▶");
      const toggle = () => (video.paused ? video.play().catch(() => {}) : video.pause());
      wrap.addEventListener("click", toggle);
      playBtn.addEventListener("click", toggle);
      wrap.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); }
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          video.pause();
          video.currentTime = Math.max(0, video.currentTime + (e.key === "ArrowRight" ? 1 : -1) / 25);
        }
      });
      video.addEventListener("play", () => { wrap.classList.add("playing"); playBtn.textContent = "❚❚"; });
      video.addEventListener("pause", () => { wrap.classList.remove("playing"); playBtn.textContent = "▶"; });
      video.addEventListener("error", () => wrap.classList.add("failed"));

      const compact = this.hasAttribute("compact");
      const speeds = compact ? [0.5, 1] : SPEEDS;
      const speedChips = speeds.map((s) => {
        const chip = h("button", {
          class: "chip" + (s === video.playbackRate ? " on" : ""),
          title: `Play at ${s}× speed`,
          onclick: () => {
            video.playbackRate = s;
            store.set("auslan.speed", s);
            speedChips.forEach((c) => c.classList.toggle("on", c === chip));
            if (video.paused) video.play().catch(() => {});
          },
        }, s === 1 ? "1×" : `${s}`);
        return chip;
      });

      const card = h("article", { class: "sign-card" });
      const practise = h("button", {
        class: "btn small", title: "Practise: open the mirror with this sign beside you",
        onclick: () => { Mirror.setReference({ label: d.label, video: d.video, card }); Mirror.open(); },
      }, compact ? "🪞" : "🪞 Practise");

      const credit = d.entry
        ? h("a", { class: "sign-credit", href: d.entry, target: "_blank", rel: "noopener", title: "View on Auslan Signbank" }, "Signbank ↗")
        : null;
      const regionTag = h("span", { class: "tag teal" });
      const showRegion = () => {
        const label = regionLabel(d.region);
        regionTag.hidden = !d.region || label === "Australia-wide";
        regionTag.textContent = label;
      };
      showRegion();

      // Regional versions: chips to switch between them. The visitor's best match is shown first.
      let variantRow = null;
      if (d.variants?.length > 1) {
        const ordered = [...d.variants].sort((a, b) => regionScore(b.region) - regionScore(a.region));
        const chips = ordered.map((v) => {
          const label = regionLabel(v.region);
          const yours = regionScore(v.region) >= 2;
          const chip = h("button", {
            class: "chip" + (v.video === d.video ? " on" : ""),
            title: `Show the ${label} version`,
            onclick: () => {
              Object.assign(d, v);
              video.poster = v.poster || "";
              video.src = v.video;
              video.play().catch(() => {});
              if (credit) credit.href = v.entry;
              chips.forEach((c) => c.classList.toggle("on", c === chip));
              showRegion();
            },
          }, label + (yours ? " · yours" : ""));
          return chip;
        });
        variantRow = h("div", { class: "sign-variants" }, h("span", { class: "muted" }, "Regional versions:"), chips);
      }

      card.append(
        h("div", { class: "sign-head" },
          h("span", { class: "sign-label" }, d.label),
          !compact && d.english ? h("span", { class: "sign-english" }, d.english) : null,
          regionTag,
          compact ? h("span", { class: "grow" }) : null,
          compact ? credit : null),
        wrap,
        h("div", { class: "sign-controls" },
          playBtn,
          h("div", { class: "speeds" }, speedChips),
          h("span", { class: "grow" }),
          practise,
          compact ? null : credit),
        variantRow || "", // native append() would print a null as the text "null"
        h("div", { class: "sign-tips" }, tips));
      this.replaceChildren(card);
    }
  }

  /* =====================================================================
   * <auslan-quiz sign="hello" options="hello|name|what|nice">
   * The answer is the sign's key; options are keys too (labels shown).
   * ===================================================================== */
  class AuslanQuiz extends HTMLElement {
    async connectedCallback() {
      if (this._built) return;
      this._built = true;
      const all = await loadSigns().catch(() => ({}));
      const key = this.getAttribute("sign");
      const s = all[key] || {};
      const labelOf = (k) => all[k]?.label || k.toUpperCase();
      const opts = shuffle([...new Set([key, ...(this.getAttribute("options") || "").split("|").map((x) => x.trim()).filter(Boolean)])]);

      const video = h("video", { muted: true, loop: true, playsInline: true, preload: "none", poster: s.poster || null, src: s.video || null });
      const wrap = h("div", { class: "sign-video-wrap", onclick: () => (video.paused ? video.play() : video.pause()) },
        video, h("div", { class: "play-badge" }, h("span", {}, "▶")));
      video.addEventListener("play", () => wrap.classList.add("playing"));
      video.addEventListener("pause", () => wrap.classList.remove("playing"));
      const feedback = h("div", { class: "quiz-feedback" });
      let solved = false;
      const buttons = opts.map((k) =>
        h("button", {
          onclick: (e) => {
            if (solved) return;
            if (k === key) {
              solved = true;
              e.currentTarget.classList.add("right");
              feedback.textContent = `✓ ${labelOf(k)}${s.english ? ` — ${s.english}` : ""}`;
            } else {
              e.currentTarget.classList.add("wrong");
              feedback.textContent = "Not that one. Watch again (try 0.5×) and have another go.";
            }
          },
        }, labelOf(k)));
      const slow = h("button", { class: "chip", onclick: () => { video.playbackRate = video.playbackRate === 1 ? 0.5 : 1; slow.classList.toggle("on", video.playbackRate !== 1); video.play(); } }, "0.5×");
      this.replaceChildren(h("div", { class: "quiz-card" },
        h("div", { class: "q" }, this.getAttribute("prompt") || "Which sign is this? ", slow),
        wrap, h("div", { class: "quiz-options" }, buttons), feedback));
    }
  }

  /* =====================================================================
   * Sequence player: plays several Signbank clips back-to-back in `stage`, smoothly.
   * clips: [{ video, trim: [start, end] | undefined }] (or plain URL strings).
   * Each clip plays only its trimmed window (skipping the signer standing still), and the next clip
   * starts `overlap` seconds before the current one ends, with a crossfade, so the hands-down/hands-up
   * between signs blends instead of stopping. Returns a cancel function.
   * onStep(i) fires as clip i starts, onStep(-1) at the end.
   * ===================================================================== */
  // A fingerspelled letter as a sequence clip: just ~0.7 s of its held handshape, so letters run
  // together like real fingerspelling (hands stay up between letters).
  const letterClip = (s) => s.hold
    ? { video: s.video, trim: [s.hold[0], Math.min(s.hold[1], s.hold[0] + 0.7)], overlap: 0.1 }
    // Letters with no still hold either move (H brushes, J and Z trace) or are very short (P):
    // play them right through before the next letter starts.
    : { video: s.video, trim: s.trim, overlap: 0 };

  function playSequence(stage, clips, rate, onStep, { overlap = 0.3, fade = 0.18 } = {}) {
    let cancelled = false;
    const items = clips.map((c) => (typeof c === "string" ? { video: c } : c));
    stage.classList.add("seq-stage");
    const vids = items.map((c) => {
      const v = h("video", { muted: true, playsInline: true, preload: "auto", src: c.video, class: "seq-clip" });
      v.style.transition = `opacity ${fade}s linear`;
      const t0 = c.trim?.[0] || 0;
      const seek = () => { if (v.currentTime < t0 - 0.05 || v.currentTime > t0 + 0.05) v.currentTime = t0; };
      if (v.readyState >= 1) seek(); else v.addEventListener("loadedmetadata", seek, { once: true });
      return v;
    });
    stage.replaceChildren(...vids);

    // Resolve when a clip can play (or give up after a few seconds so a slow clip can't freeze the sequence).
    const ready = (v) => v.readyState >= 3 ? Promise.resolve() : new Promise((res) => {
      const done = () => { clearTimeout(t); res(); };
      const t = setTimeout(done, 4000);
      v.addEventListener("canplay", done, { once: true });
      v.addEventListener("error", done, { once: true });
    });
    // Resolve when clip i reaches `at` seconds before its end (or ends / errors / is cancelled).
    const reach = (v, endT, before) => new Promise((res) => {
      const tick = () => {
        if (cancelled || v.error || v.ended || v.currentTime >= endT - before * v.playbackRate) return res();
        requestAnimationFrame(tick);
      };
      tick();
    });

    (async () => {
      let prev = null;
      for (let i = 0; i < vids.length; i++) {
        if (cancelled) return;
        const v = vids[i], c = items[i];
        await ready(v);
        if (cancelled) return;
        const t0 = c.trim?.[0] || 0;
        const t1 = Math.min(c.trim?.[1] || v.duration || Infinity, v.duration || Infinity);
        v.currentTime = t0;
        v.playbackRate = rate;
        v.style.zIndex = String(i + 1);
        v.style.opacity = "1";
        v.play().catch(() => {});
        onStep?.(i);
        if (prev) { // fade the previous clip out underneath, then stop it
          const p = prev;
          setTimeout(() => { p.style.opacity = "0"; setTimeout(() => p.pause(), fade * 1000); }, fade * 1000);
        }
        const last = i === vids.length - 1;
        // Never let the overlap eat more than a quarter of a short clip.
        const ov = Math.min(c.overlap ?? overlap, Math.max(0, (t1 - t0) * 0.25));
        await reach(v, t1, last ? 0 : ov);
        prev = v;
      }
      if (cancelled) return;
      prev?.pause();
      onStep?.(-1);
    })();
    return () => { cancelled = true; vids.forEach((v) => v.pause()); };
  }

  /* =====================================================================
   * <sign-phrase signs="my name fs:@name" english="My name is {name}." face="…"></sign-phrase>
   * "fs:word" fingerspells a word using the letter clips. "fs:@name" spells the visitor's name,
   * and {name} in english/face is replaced with it.
   * ===================================================================== */
  class SignPhrase extends HTMLElement {
    async connectedCallback() {
      if (this._built) return;
      this._built = true;
      const all = await loadSigns().catch(() => ({}));
      const tokens = (this.getAttribute("signs") || "").split(/\s+/).filter(Boolean);
      const clips = []; // { url, token index }
      const labels = tokens.map((t, ti) => {
        if (t.startsWith("fs:")) {
          const word = t === "fs:@name" ? nameLetters() : t.slice(3).toLowerCase();
          [...word].forEach((c) => all[`letter-${c}`] && clips.push({ ...letterClip(all[`letter-${c}`]), ti }));
          return word.toUpperCase().split("").join("-");
        }
        if (all[t]) clips.push({ video: all[t].video, trim: all[t].trim, ti });
        else console.warn(`sign-phrase: "${t}" is not in data/signs.json`);
        return all[t]?.label || t.toUpperCase();
      });

      const glossEl = h("div", { class: "gloss" });
      const spans = labels.map((l) => h("span", {}, l));
      spans.forEach((s, i) => glossEl.append(s, i < spans.length - 1 ? " " : ""));
      const stage = h("div", { class: "fs-stage phrase-stage", hidden: true });
      const rate = h("select", { class: "chip", title: "Speed" }, [0.5, 0.75, 1].map((s) => h("option", { value: s, selected: s === 1 }, `${s}×`)));
      let cancel = null;
      const btn = h("button", { class: "btn small" }, "▶ Watch");
      const highlight = (i) => spans.forEach((s, si) => s.classList.toggle("now", i >= 0 && clips[i].ti === si));
      btn.addEventListener("click", () => {
        cancel?.();
        stage.hidden = false;
        cancel = playSequence(stage, clips, +rate.value, highlight);
      });

      const displayName = userName() || FALLBACK_NAME;
      const english = this.getAttribute("english")?.replaceAll("{name}", displayName);
      const face = this.getAttribute("face")?.replaceAll("{name}", displayName);
      this.replaceChildren(h("div", { class: "phrase" },
        glossEl,
        english ? h("div", { class: "english" }, english) : null,
        face ? h("div", { class: "face" }, "Face: ", face) : null,
        h("div", { class: "phrase-btns" }, rate, btn),
        stage));
    }
  }

  /* =====================================================================
   * <fingerspell-drill words="cat,dog,...">
   * Letter videos come from data/signs.json keys "letter-a" … "letter-z".
   * ===================================================================== */
  class FingerspellDrill extends HTMLElement {
    async connectedCallback() {
      if (this._built) return;
      this._built = true;
      this.all = await loadSigns().catch(() => ({}));
      this.words = (this.getAttribute("words") || "cat,dog,sun").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
      // Optional big word bank (data/spelling-words.json) → enables the difficulty picker.
      const bankPath = this.getAttribute("bank");
      this.bank = bankPath ? await loadJSON(bankPath).catch(() => null) : null;
      this.level = store.get("auslan.spell.level", "mixed");
      this.mode = "read";

      this.stage = h("div", { class: "fs-stage" });
      this.letters = h("div", { class: "fs-letters" });
      const savedSpeed = store.get("auslan.spell.speed", 1);
      this.speed = h("select", {}, [0.5, 0.75, 1, 1.25, 1.5].map((s) => h("option", { value: s, selected: s === savedSpeed }, `${s}×`)));
      this.speed.addEventListener("change", () => store.set("auslan.spell.speed", +this.speed.value));
      this.side = h("div", { class: "fs-side" });
      this.tabs = h("div", { class: "fs-tabs" },
        h("button", { class: "on", onclick: (e) => this.setMode("read", e.currentTarget) }, "👀 Read it"),
        h("button", { onclick: (e) => this.setMode("spell", e.currentTarget) }, "✍️ Spell any word"));
      this.replaceChildren(h("div", { class: "fs-drill" }, this.tabs,
        h("div", { class: "fs-body" }, h("div", {}, this.stage, this.letters), this.side)));
      this.setMode("read");
    }

    static LEVELS = {
      easy: "Easy · 3–4 letters",
      medium: "Medium · 5–6 letters",
      hard: "Hard · 7+ letters",
      mixed: "Mixed lengths",
      names: "Names & places",
      letters: "Random letters (no guessing!)",
    };

    // Pick a word for the current level, avoiding the ~300 most recently seen.
    pickWord() {
      if (!this.bank) {
        const pool = this.words.filter((w) => w !== this.word);
        return pool[Math.floor(Math.random() * pool.length)] || this.words[0];
      }
      if (this.level === "letters") {
        const n = 3 + Math.floor(Math.random() * 3);
        return Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
      }
      const len = (min, max) => (w) => w.length >= min && w.length <= max;
      const everyday = [...this.bank.common, ...this.words];
      const pool = {
        easy: everyday.filter(len(3, 4)),
        medium: everyday.filter(len(5, 6)),
        hard: everyday.filter(len(7, 99)),
        names: [...this.bank.names, ...this.bank.places],
      }[this.level] || everyday;
      const recent = new Set(store.get("auslan.spell.recent", []));
      const fresh = pool.filter((w) => !recent.has(w) && w !== this.word);
      const choices = fresh.length ? fresh : pool;
      const word = choices[Math.floor(Math.random() * choices.length)];
      store.set("auslan.spell.recent", [...recent, word].slice(-300));
      return word;
    }

    setMode(mode, btn) {
      this.mode = mode;
      if (btn) [...this.tabs.children].forEach((b) => b.classList.toggle("on", b === btn));
      this.stop();
      this.side.replaceChildren();
      const speedRow = h("div", { class: "fs-row" }, h("span", { class: "muted" }, "Speed"), this.speed);

      if (mode === "read") {
        const input = h("input", { placeholder: "What word was that?", autocomplete: "off", spellcheck: false });
        const result = h("div", { class: "fs-result" });
        // Score: only the first answer (or a reveal) for each word counts.
        const score = (this.score ||= { right: 0, total: 0, streak: 0, best: store.get("auslan.spell.best", 0) });
        const scoreEl = h("div", { class: "muted" });
        const renderScore = () => {
          scoreEl.textContent = score.total
            ? `Score ${score.right}/${score.total} · streak ${score.streak} · best ${score.best}`
            : `Best streak: ${score.best}`;
        };
        let scored = false;
        const tally = (ok) => {
          if (scored) return;
          scored = true;
          score.total++;
          if (ok) {
            score.right++;
            score.streak++;
            if (score.streak > score.best) { score.best = score.streak; store.set("auslan.spell.best", score.best); }
          } else score.streak = 0;
          renderScore();
        };
        let finished = false; // solved or revealed: Enter now moves on
        const refocus = () => input.focus({ preventScroll: true });
        const check = () => {
          if (!input.value.trim()) return;
          const ok = input.value.trim().toLowerCase() === this.word;
          tally(ok);
          result.textContent = ok ? `✓ Yes — ${this.word.toUpperCase()}  ·  Enter for the next word` : "Not quite. Space to replay, Shift+Enter to reveal.";
          result.className = "fs-result " + (ok ? "ok" : "no");
          if (ok) { finished = true; this.showLetters(this.word, -1, true); }
        };
        const replay = () => this.play(this.word, false);
        const reveal = () => {
          tally(false);
          finished = true;
          this.showLetters(this.word, -1, true);
          result.textContent = `${this.word.toUpperCase()}  ·  Enter for the next word`;
          result.className = "fs-result";
        };
        const next = (focus = true) => {
          this.word = this.pickWord();
          input.value = ""; result.textContent = ""; result.className = "fs-result";
          scored = false;
          finished = false;
          if (focus) refocus();
          this.showLetters(this.word, -1, false);
          this.play(this.word, false);
        };
        const skip = () => { if (!finished) tally(false); next(); }; // skipping counts as a miss
        const nudgeSpeed = (dir) => {
          const opts = [...this.speed.options];
          const i = Math.min(opts.length - 1, Math.max(0, this.speed.selectedIndex + dir));
          this.speed.selectedIndex = i;
          this.speed.dispatchEvent(new Event("change"));
        };

        // Keyboard: answers never contain spaces, so Space is free for Replay.
        input.addEventListener("keydown", (e) => {
          if (e.metaKey || e.ctrlKey || e.altKey) return;
          const k = e.key;
          if (k === "Enter" && e.shiftKey) reveal();
          else if (k === "Enter") finished ? next() : check();
          else if (k === " ") replay();
          else if (k === "Escape") skip();
          else if (k === "ArrowUp") nudgeSpeed(1);
          else if (k === "ArrowDown") nudgeSpeed(-1);
          else return;
          e.preventDefault();
          e.stopPropagation();
        });

        const key = (label) => h("kbd", { style: "margin-left:6px;opacity:.75" }, label);
        const btn = (cls, label, hint, fn) =>
          h("button", { class: cls, onclick: () => { fn(); refocus(); } }, label, key(hint));
        this.side.append(
          h("p", { class: "muted", style: "margin:0" }, "Watch the word being fingerspelled, then type what you read."),
          this.bank ? (() => {
            const sel = h("select", { title: "Difficulty" }, Object.entries(FingerspellDrill.LEVELS).map(([v, label]) =>
              h("option", { value: v, selected: v === this.level }, label)));
            sel.addEventListener("change", () => { this.level = sel.value; store.set("auslan.spell.level", sel.value); next(); });
            return sel;
          })() : "",
          input,
          h("div", { class: "fs-row" },
            btn("btn primary", "Check", "↵", check),
            btn("btn", "↺ Replay", "Space", replay),
            btn("btn", "Reveal", "⇧↵", reveal),
            btn("btn", "Next word →", "Esc", skip)),
          result, scoreEl, speedRow,
          h("p", { class: "muted", style: "margin:0;font-size:.8rem" }, "Speed: ↑ faster · ↓ slower"));
        renderScore();
        this.word = null;
        next(this.hasAttribute("autofocus"));
      } else {
        const input = h("input", { placeholder: "Type a word, e.g. your name", autocomplete: "off", spellcheck: false, value: "" });
        const go = () => {
          const w = input.value.toLowerCase().replace(/[^a-z]/g, "");
          if (!w) return;
          this.showLetters(w, -1, true);
          this.play(w, true);
        };
        input.addEventListener("keydown", (e) => e.key === "Enter" && go());
        this.side.append(
          h("p", { class: "muted", style: "margin:0" }, "Type any word and watch it fingerspelled letter by letter. Then copy it in the mirror (press M)."),
          input,
          h("div", { class: "fs-row" },
            h("button", { class: "btn primary", onclick: go }, "▶ Show me"),
            h("button", { class: "btn", onclick: () => Mirror.open() }, "🪞 Mirror")),
          speedRow);
        this.showLetters("", -1, true);
      }
    }

    // In "read" mode the letters stay hidden (•) — only the position is highlighted.
    showLetters(word, current, visible) {
      this.letters.replaceChildren(...[...word].map((c, i) =>
        h("span", { class: i === current ? "now" : visible ? "done" : "" }, visible ? c.toUpperCase() : "•")));
    }

    stop() {
      this.cancel?.();
      this.cancel = null;
      this.stage.replaceChildren();
    }

    play(word, showLetters) {
      this.stop();
      word = [...word].filter((c) => this.all[`letter-${c}`]).join("");
      const clips = [...word].map((c) => letterClip(this.all[`letter-${c}`]));
      // Letters flow into each other more tightly than whole signs, like real fingerspelling.
      this.cancel = playSequence(this.stage, clips, +this.speed.value, (i) => this.showLetters(word, i, showLetters), { fade: 0.1 });
    }
  }

  /* =====================================================================
   * Page chrome: header, lesson nav, completion
   * ===================================================================== */
  function renderHeader() {
    if (document.body.hasAttribute("data-no-header")) return;
    const here = location.pathname.replace(/\/index\.html$/, "/");
    const link = (path, label) => {
      const href = ROOT + path;
      const p = new URL(href).pathname.replace(/\/index\.html$/, "/");
      const current = p === here || (path === "index.html" && here.includes("/lessons/"));
      return h("a", { href, "aria-current": current ? "page" : null }, label);
    };
    const mirrorBtn = h("button", { class: "btn small mirror-toggle", title: "Camera mirror (M)", onclick: () => Mirror.toggle() }, "🪞", h("span", { class: "hide-narrow" }, " Mirror ", h("kbd", {}, "M")));
    document.body.prepend(h("header", { class: "site-header" },
      h("div", { class: "wrap" },
        h("a", { class: "brand", href: ROOT + "index.html" }, h("span", { class: "brand-mark" }, "🤟"), h("span", { class: "brand-text" }, "Auslan Tutor")),
        h("nav", { class: "site-nav" }, link("index.html", "Lessons"), link("glossary.html", "Glossary"), link("review.html", "Review")),
        h("span", { class: "header-spacer" }),
        mirrorBtn)));
  }

  function renderFooter() {
    if (document.body.hasAttribute("data-no-header")) return;
    document.body.append(h("footer", { class: "site-footer" }, h("div", { class: "wrap" },
      h("p", {},
        "Sign videos and dictionary entries from ",
        h("a", { href: "https://auslan.org.au", target: "_blank", rel: "noopener" }, "Auslan Signbank"),
        ", licensed ",
        h("a", { href: "https://creativecommons.org/licenses/by-nc-nd/4.0/", target: "_blank", rel: "noopener" }, "CC BY-NC-ND 4.0"),
        ". Each sign links to its Signbank entry. Auslan Tutor is a free, non-commercial learning aid and isn't affiliated with Auslan Signbank."),
      h("p", {},
        "This site supplements, and doesn't replace, learning from Deaf people. Look for classes taught by Deaf teachers and get involved in your local Deaf community."),
      h("p", { class: "muted" },
        "Your progress and camera stay in this browser. Nothing is uploaded. ",
        h("a", { href: ROOT + "index.html#progress" }, "Save or load your progress"), "."))));
  }

  async function enhanceLesson() {
    const id = Number(document.body.dataset.lesson);
    if (!id) return;

    const actions = document.querySelector(".lesson-actions");
    if (actions) {
      const btn = h("button", { class: "btn" });
      const sync = () => {
        const done = !!progress.lessons[id];
        btn.textContent = done ? "✓ Completed" : "Mark lesson complete";
        btn.classList.toggle("on", done);
      };
      btn.addEventListener("click", () => {
        if (progress.lessons[id]) delete progress.lessons[id];
        else progress.lessons[id] = new Date().toISOString();
        saveProgress();
        sync();
      });
      sync();
      actions.append(btn);
    }

    const navs = document.querySelectorAll(".lesson-nav");
    if (!navs.length) return;
    const lessons = await loadLessons().catch(() => []);
    const i = lessons.findIndex((l) => l.id === id);
    const prev = lessons[i - 1], next = lessons[i + 1];
    navs.forEach((nav) => nav.replaceChildren(
      prev ? h("a", { class: "btn", href: `${ROOT}lessons/${prev.slug}.html` }, `← ${prev.id}. ${prev.title}`) : h("span"),
      next ? h("a", { class: "btn primary", href: `${ROOT}lessons/${next.slug}.html` }, `${next.id}. ${next.title} →`)
        : h("a", { class: "btn", href: ROOT + "index.html" }, "All lessons")));
  }

  document.addEventListener("keydown", (e) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "m" || e.key === "M") { e.preventDefault(); Mirror.toggle(); }
    else if ((e.key === "r" || e.key === "R") && Mirror.isOpen) { e.preventDefault(); Mirror.record(); }
    else if (e.key === "Escape" && Mirror.isOpen) Mirror.close();
  });
  addEventListener("pagehide", () => Mirror.stopCamera());

  customElements.define("auslan-sign", AuslanSign);
  customElements.define("auslan-quiz", AuslanQuiz);
  customElements.define("fingerspell-drill", FingerspellDrill);
  customElements.define("sign-phrase", SignPhrase);

  window.AuslanTutor = {
    ROOT, h, store, shuffle, loadSigns, loadLessons, progress, saveProgress, Mirror,
    userName, setUserName, applyUserName, exportProgress, importProgress, isAuthor,
    STATES, DIALECT, userState, setUserState, regionLabel,
  };

  renderHeader();
  renderFooter();
  applyUserName();
  // Things only the site's author needs (e.g. "ask Claude for a lesson") show only on localhost.
  if (isAuthor) document.querySelectorAll(".author-only").forEach((el) => (el.hidden = false));
  enhanceLesson();
  if (store.get("auslan.mirror.open", false)) Mirror.open();
})();
