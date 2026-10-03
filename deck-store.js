/* ThunderStudy flashcards — shared deck store (deck-store.js)
 * Used by: index, home, pdf, img, url, youtube, card, save.
 *
 * Every generated deck is stored in localStorage under ts_flashcard_saved_decks:
 *   { id: "abcde", no: 3, title, cards: [{front, back}], savedAt, source, pinned? }
 * Deck link format:  /card?card{no}{id}      e.g. /card?card3kqzmw
 *   no = running deck number (1, 2, 3 …), id = 5 random lowercase letters.
 */
(function (w) {
  "use strict";

  var KEY = "ts_flashcard_saved_decks";
  var CNT = "ts_flashcard_counter";
  var MAX = 50;
  var ID_RE = /^[a-z]{5}$/;

  function read() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function write(a) {
    try { localStorage.setItem(KEY, JSON.stringify(a)); return true; }
    catch (e) { return false; }
  }
  function getCounter() { try { return parseInt(localStorage.getItem(CNT), 10) || 0; } catch (e) { return 0; } }
  function setCounter(n) { try { localStorage.setItem(CNT, String(n)); } catch (e) { /* ignore */ } }

  function randId(used) {
    var s, i;
    do {
      s = "";
      for (i = 0; i < 5; i++) s += String.fromCharCode(97 + Math.floor(Math.random() * 26));
    } while (used[s]);
    used[s] = 1;
    return s;
  }

  function cleanCards(cards) {
    return (cards || []).filter(function (c) {
      return c && typeof c.front === "string" && typeof c.back === "string" && c.front && c.back;
    }).map(function (c) { return { front: c.front, back: c.back }; });
  }

  /* Make every stored deck have a unique 5-letter id and a unique running number. */
  function normalize(arr) {
    var changed = false;
    var decks = arr.filter(function (d) { return d && Array.isArray(d.cards); });
    if (decks.length !== arr.length) changed = true;

    var usedId = {}, usedNo = {}, maxNo = getCounter();

    decks.forEach(function (d) {
      var before = d.cards.length;
      d.cards = cleanCards(d.cards);
      if (d.cards.length !== before) changed = true;
      if (typeof d.title !== "string" || !d.title.trim()) { d.title = "Flashcard deck"; changed = true; }
      if (!d.savedAt || isNaN(new Date(d.savedAt).getTime())) { d.savedAt = new Date().toISOString(); changed = true; }

      if (typeof d.id === "string" && ID_RE.test(d.id) && !usedId[d.id]) usedId[d.id] = 1; else d.id = null;
      if (typeof d.no === "number" && d.no > 0 && d.no % 1 === 0 && !usedNo[d.no]) { usedNo[d.no] = 1; if (d.no > maxNo) maxNo = d.no; } else d.no = null;
    });

    decks.forEach(function (d) { if (!d.id) { d.id = randId(usedId); changed = true; } });

    // legacy decks without a number: oldest first, so numbers rise with time
    decks.filter(function (d) { return !d.no; })
      .sort(function (a, b) { return new Date(a.savedAt) - new Date(b.savedAt); })
      .forEach(function (d) { d.no = ++maxNo; changed = true; });

    if (maxNo !== getCounter()) { setCounter(maxNo); }
    return { decks: decks, changed: changed };
  }

  function load() {
    var r = normalize(read());
    if (r.changed) write(r.decks);
    return r.decks;
  }

  function trim(arr) {
    while (arr.length > MAX) {
      var i = arr.length - 1;
      while (i > 0 && arr[i].pinned) i--;
      arr.splice(i, 1);
    }
  }

  /* Add a deck. Returns the stored deck, or null if storage is unavailable. */
  function add(o) {
    var cards = cleanCards(o && o.cards);
    if (!cards.length) return null;
    var arr = load();
    var used = {}, maxNo = getCounter();
    arr.forEach(function (d) { used[d.id] = 1; if (d.no > maxNo) maxNo = d.no; });
    var deck = {
      id: randId(used),
      no: maxNo + 1,
      title: String((o && o.title) || "Flashcard deck").trim().slice(0, 120) || "Flashcard deck",
      cards: cards,
      savedAt: (o && o.savedAt) || new Date().toISOString(),
      source: (o && o.source) || ""
    };
    arr.unshift(deck);
    trim(arr);
    if (!write(arr)) return null;
    setCounter(deck.no);
    return deck;
  }

  function save(arr) { return write(arr); }

  function url(d) { return "/card?card" + d.no + d.id; }

  /* Read the deck token from a query string: ?card3kqzmw  (a dash between is tolerated) */
  function token(search) {
    var m = /[?&]card(\d+)-?([a-z]{5})(?=&|$)/.exec(search || "");
    return m ? { no: parseInt(m[1], 10), id: m[2] } : null;
  }

  function find(tok, arr) {
    arr = arr || load();
    if (!tok) return null;
    var byId = arr.filter(function (d) { return d.id === tok.id; })[0];
    if (byId) return byId;
    return arr.filter(function (d) { return d.no === tok.no; })[0] || null;
  }

  /* ---------- export helpers ---------- */
  function slug(s) {
    return String(s || "deck").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "deck";
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function download(name, mime, text, bom) {
    var blob = new Blob([(bom ? "\ufeff" : "") + text], { type: mime + ";charset=utf-8" });
    var u = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = u; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 1500);
  }
  function csvCell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }
  function csv(d) {
    return "Question,Answer\r\n" + d.cards.map(function (c) { return csvCell(c.front) + "," + csvCell(c.back); }).join("\r\n");
  }
  function anki(d) {
    return d.cards.map(function (c) {
      return c.front.replace(/\s*[\r\n\t]+\s*/g, " ") + "\t" + c.back.replace(/\s*[\r\n\t]+\s*/g, " ");
    }).join("\n");
  }
  function json(d) {
    return JSON.stringify({ title: d.title, no: d.no, cards: d.cards, savedAt: d.savedAt }, null, 2);
  }
  function text(d) {
    return d.title + "\n\n" + d.cards.map(function (c, i) {
      return (i + 1) + ". Q: " + c.front + "\n   A: " + c.back;
    }).join("\n\n") + "\n\nMade with ThunderStudy AI — " + location.origin;
  }
  /* Returns false if the pop-up was blocked */
  function print(d) {
    var win = window.open("", "_blank");
    if (!win) return false;
    var rows = d.cards.map(function (c, i) {
      return "<tr><td>" + (i + 1) + "</td><td>" + esc(c.front) + "</td><td>" + esc(c.back) + "</td></tr>";
    }).join("");
    win.document.write("<!doctype html><meta charset=utf-8><title>" + esc(d.title) + "</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#222}h1{font-size:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:8px 10px;text-align:left;vertical-align:top}th{background:#f0eefc}td:first-child{width:36px;color:#777}</style><h1>" + esc(d.title) + "</h1><table><tr><th>#</th><th>Question</th><th>Answer</th></tr>" + rows + "</table>");
    win.document.close();
    win.focus();
    setTimeout(function () { win.print(); }, 250);
    return true;
  }

  /* ---------- import helpers (JSON backup, CSV, Anki/TSV text) ---------- */
  function parseCsv(src) {
    var rows = [], row = [], cell = "", q = false, i, ch;
    src = src.replace(/^\ufeff/, "");
    for (i = 0; i < src.length; i++) {
      ch = src[i];
      if (q) {
        if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && src[i + 1] === "\n") i++;
        row.push(cell); cell = ""; rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function pairToCard(a, b) {
    a = String(a == null ? "" : a).trim(); b = String(b == null ? "" : b).trim();
    return a && b ? { front: a, back: b } : null;
  }
  function objToCard(o) {
    if (!o || typeof o !== "object") return null;
    return pairToCard(o.front != null ? o.front : (o.question != null ? o.question : o.q),
                      o.back != null ? o.back : (o.answer != null ? o.answer : o.a));
  }
  /* Returns [{title, cards, savedAt?}] or throws Error with a readable message. */
  function parseImport(name, content) {
    var base = String(name || "Imported deck").replace(/\.[^.]+$/, "") || "Imported deck";
    var trimmed = content.replace(/^\ufeff/, "").trim();
    var out = [];
    if (/\.json$/i.test(name) || /^[\[{]/.test(trimmed)) {
      var data;
      try { data = JSON.parse(trimmed); } catch (e) { throw new Error("That file is not valid JSON."); }
      var list = Array.isArray(data) ? data : (data && Array.isArray(data.decks) ? data.decks : [data]);
      list.forEach(function (d) {
        if (!d || !Array.isArray(d.cards)) return;
        var cards = d.cards.map(objToCard).filter(Boolean);
        if (cards.length) out.push({ title: d.title || base, cards: cards, savedAt: d.savedAt });
      });
    } else if (/\.csv$/i.test(name)) {
      var rows = parseCsv(trimmed);
      if (rows.length && /^question$/i.test((rows[0][0] || "").trim()) && /^answer$/i.test((rows[0][1] || "").trim())) rows.shift();
      var cc = rows.map(function (r) { return pairToCard(r[0], r[1]); }).filter(Boolean);
      if (cc.length) out.push({ title: base, cards: cc });
    } else {
      var tc = trimmed.split(/\r?\n/).map(function (line) {
        var p = line.split("\t");
        return p.length >= 2 ? pairToCard(p[0], p.slice(1).join(" ")) : null;
      }).filter(Boolean);
      if (tc.length) out.push({ title: base, cards: tc });
    }
    if (!out.length) throw new Error("No flashcards found in that file.");
    return out;
  }

  w.TSDecks = {
    KEY: KEY, load: load, add: add, save: save, url: url, token: token, find: find,
    slug: slug, esc: esc, download: download, csv: csv, anki: anki, json: json, text: text, print: print,
    parseImport: parseImport
  };
})(window);
