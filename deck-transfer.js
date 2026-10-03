(function () {
  "use strict";
  const STORAGE_KEY = "ts_flashcard_saved_decks";
  function cleanCards(cards) {
    if (!Array.isArray(cards)) return [];
    return cards.map(function (card) {
      if (Array.isArray(card)) return { front: String(card[0] || ""), back: String(card[1] || "") };
      return { front: String(card && (card.front ?? card.question ?? card[0]) || "").trim(), back: String(card && (card.back ?? card.answer ?? card[1]) || "").trim() };
    }).filter(function (card) { return card.front || card.back; });
  }
  function slug(value) { return String(value || "flashcards").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "flashcards"; }
  function download(name, content, type) {
    const blob = new Blob([content], { type: type || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function csvCell(value) { return '"' + String(value || "").replace(/"/g, '""').replace(/\r?\n/g, " ") + '"'; }
  function escapeHtml(value) { return String(value || "").replace(/[&<>\"']/g, function (ch) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]; }); }
  function exportDeck(cards, title, format) {
    cards = cleanCards(cards); if (!cards.length) return false;
    const safeTitle = slug(title);
    if (format === "json") download(safeTitle + ".json", JSON.stringify({ title: title || "Flashcard Deck", cards: cards }, null, 2), "application/json;charset=utf-8");
    else if (format === "csv") download(safeTitle + ".csv", "Front,Back\n" + cards.map(function (c) { return csvCell(c.front) + "," + csvCell(c.back); }).join("\n"), "text/csv;charset=utf-8");
    else if (format === "anki") download(safeTitle + ".txt", cards.map(function (c) { return c.front.replace(/[\r\n]+/g, "<br>") + "\t" + c.back.replace(/[\r\n]+/g, "<br>"); }).join("\n"), "text/tab-separated-values;charset=utf-8");
    else if (format === "print") {
      const win = window.open("", "_blank"); if (!win) return false;
      win.document.write("<!doctype html><html><head><title>" + escapeHtml(title || "Flashcard Deck") + "</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#222}h1{font-size:24px;margin:0 0 20px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.card{border:1px solid #bbb;border-radius:10px;padding:16px;break-inside:avoid}.label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:bold;margin-bottom:8px}.back{border-top:1px dashed #bbb;margin-top:14px;padding-top:14px}@media print{body{margin:12mm}.card{break-inside:avoid}}<\/style></head><body><h1>" + escapeHtml(title || "Flashcard Deck") + "</h1><div class=\"cards\">" + cards.map(function (c) { return '<article class="card"><div class="label">Question</div><div>' + escapeHtml(c.front) + '</div><div class="back"><div class="label">Answer</div><div>' + escapeHtml(c.back) + '</div></div></article>'; }).join("") + "</div><script>window.onload=function(){window.print();};<\/script></body></html>");
      win.document.close();
    }
    return true;
  }
  function newId() { return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function readSaved() {
    var arr; try { arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch (e) { return []; }
    if (!Array.isArray(arr)) return [];
    var dirty = false;
    arr.forEach(function (d) { if (d && !d.id) { d.id = newId(); dirty = true; } });
    if (dirty) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch (e) {} }
    return arr;
  }
  function writeSaved(decks) { localStorage.setItem(STORAGE_KEY, JSON.stringify(decks.slice(0, 50))); }
  function flash(message) { if (typeof window.showToast === "function") window.showToast("✓", "Deck transfer", message); else window.alert(message); }
  function parseImport(text, name) {
    const trimmed = text.trim();
    if (name.toLowerCase().endsWith(".csv")) {
      return trimmed.split(/\r?\n/).slice(1).filter(Boolean).map(function (line) { const parts = line.split(","); return { front: (parts.shift() || "").replace(/^"|"$/g, ""), back: parts.join(",").replace(/^"|"$/g, "") }; });
    }
    if (name.toLowerCase().endsWith(".txt") || trimmed.indexOf("\t") !== -1) return trimmed.split(/\r?\n/).filter(Boolean).map(function (line) { const parts = line.split("\t"); return { front: parts.shift() || "", back: parts.join("\t") || "" }; });
    const parsed = JSON.parse(trimmed); return cleanCards(Array.isArray(parsed) ? parsed : parsed.cards);
  }
  function renderSaved() {
    const list = document.getElementById("savedList"); if (!list) return;
    const saved = readSaved();
    list.innerHTML = saved.length ? saved.map(function (item, index) { return '<article class="saved-item"><div><h3><a href="card.html?deck=' + encodeURIComponent(item.id || "") + '" style="color:inherit;text-decoration:none">' + escapeHtml(item.title || "Flashcard Deck") + '</a></h3><p>' + (item.cards?.length || 0) + ' cards · Saved ' + new Date(item.savedAt || Date.now()).toLocaleDateString() + '</p></div><div class="saved-actions"><a class="btn-secondary" href="card.html?deck=' + encodeURIComponent(item.id || "") + '" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none">Open</a><button class="btn-secondary" type="button" data-export-index="' + index + '" data-format="json">JSON</button><button class="btn-secondary" type="button" data-export-index="' + index + '" data-format="csv">CSV</button><button class="btn-secondary" type="button" data-export-index="' + index + '" data-format="anki">Anki</button><button class="btn-secondary" type="button" data-print-index="' + index + '">Print</button></div></article>'; }).join("") : '<div class="saved-empty">No saved decks yet. Generate a deck, then use the save button in the header.</div>';
    list.querySelectorAll("[data-export-index]").forEach(function (button) { button.onclick = function () { const item = saved[Number(button.dataset.exportIndex)]; exportDeck(item.cards, item.title, button.dataset.format); }; });
    list.querySelectorAll("[data-print-index]").forEach(function (button) { button.onclick = function () { const item = saved[Number(button.dataset.printIndex)]; exportDeck(item.cards, item.title, "print"); }; });
  }
  function init() {
    if (document.body.getAttribute("data-page") === "save") {
      renderSaved();
      const importInput = document.getElementById("deckImportInput"), backupButton = document.getElementById("exportBackupBtn");
      if (backupButton) backupButton.onclick = function () { download("thunderstudy-decks-backup.json", JSON.stringify({ version: 1, decks: readSaved() }, null, 2), "application/json;charset=utf-8"); };
      if (importInput) importInput.onchange = function () {
        const file = importInput.files && importInput.files[0]; if (!file) return;
        const reader = new FileReader(); reader.onload = function () {
          try {
            const raw = String(reader.result), isTextDeck = /\.(csv|txt)$/i.test(file.name) || raw.indexOf("\t") !== -1;
            const parsed = isTextDeck ? { title: file.name.replace(/\.[^.]+$/, ""), cards: parseImport(raw, file.name) } : JSON.parse(raw);
            const decks = Array.isArray(parsed)
              ? (parsed.length && (parsed[0].front || parsed[0].question) ? [{ title: file.name.replace(/\.[^.]+$/, ""), cards: parsed }] : parsed)
              : (Array.isArray(parsed.decks) ? parsed.decks : [{ title: parsed.title || file.name.replace(/\.[^.]+$/, ""), cards: cleanCards(parsed.cards || parsed) }]);
            const valid = decks.map(function (d) { return { id: newId(), title: d.title || "Imported Deck", cards: cleanCards(d.cards), savedAt: d.savedAt || new Date().toISOString() }; }).filter(function (d) { return d.cards.length; });
            writeSaved(valid.concat(readSaved())); renderSaved(); flash(valid.length + " deck" + (valid.length === 1 ? "" : "s") + " imported.");
          } catch (error) { flash("That file is not a valid JSON, CSV, or Anki deck."); }
          importInput.value = "";
        }; reader.readAsText(file);
      };
    }
    const exportButton = document.getElementById("exportBtn"), printButton = document.getElementById("printBtn"), csvButton = document.getElementById("exportCsvBtn"), ankiButton = document.getElementById("exportAnkiBtn");
    function current() { return { cards: typeof deck !== "undefined" ? deck : [], title: document.getElementById("deckTitle")?.textContent || "Flashcard Deck" }; }
    if (exportButton) exportButton.onclick = function () { const d = current(); if (!d.cards.length) return flash("Generate a deck first, then export it."); exportDeck(d.cards, d.title, "json"); };
    if (printButton) printButton.onclick = function () { const d = current(); if (!d.cards.length) return flash("Generate a deck first, then print it."); exportDeck(d.cards, d.title, "print"); };
    if (csvButton) csvButton.onclick = function () { const d = current(); if (!d.cards.length) return flash("Generate a deck first, then export it."); exportDeck(d.cards, d.title, "csv"); };
    if (ankiButton) ankiButton.onclick = function () { const d = current(); if (!d.cards.length) return flash("Generate a deck first, then export it."); exportDeck(d.cards, d.title, "anki"); };
    if (document.body.getAttribute("data-page") === "index" && new URLSearchParams(window.location.search).has("imported")) {
      try {
        const imported = JSON.parse(sessionStorage.getItem("ts_flashcard_transfer_deck") || "null");
        if (imported && imported.cards?.length) {
          deck = cleanCards(imported.cards);
          const title = document.getElementById("deckTitle"); if (title) title.textContent = imported.title || "Imported Flashcards";
          if (typeof buildDots === "function") buildDots();
          if (typeof renderCard === "function") renderCard();
          document.getElementById("deckSection")?.classList.add("active");
          sessionStorage.removeItem("ts_flashcard_transfer_deck");
        }
      } catch (error) { flash("The imported deck could not be opened."); }
    }
  }
  window.tsDeckTransfer = { exportDeck: exportDeck, renderSaved: renderSaved };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
