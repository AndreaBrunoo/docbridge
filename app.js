const FIELDS = [
  ["cliente_nome_cognome", "Cliente nome cognome"],
  ["cliente_codice_fiscale", "Codice fiscale"],
  ["cliente_partita_iva", "Partita IVA"],
  ["data_firma_contratto", "Data firma"],
  ["codice_pod", "Codice POD"],
  ["codice_pdr", "Codice PDR"],
  ["contract_account", "Contract account"],
  ["pde_external_id", "PD External ID"],
  ["commodity", "Commodity"],
  ["cliente_codice_identificativo_univoco", "Codice identificativo"],
  ["cliente_record_type_testuale", "Record type"],
  ["opportunita_tipo_record", "Tipo opportunità"],
  ["opportunita_id", "ID opportunità"],
  ["opportunita_nome", "Nome opportunità"],
  ["opportunita_commodity", "Commodity opportunità"],
  ["codice_prodotto_ee", "Prodotto EE"],
  ["codice_prodotto_gas", "Prodotto GAS"],
  ["stato", "Stato"],
  ["data_certificazione", "Data certificazione"],
];

const state = normalizeState(loadState());
let selectedUno = null,
  selectedPostel = null;

function defaultState() {
  return {
    queuesigned: [],
    queuearchived: [],
    files: [],
    matched: [],
    events: [],
    metrics: {
      auto: 0,
      manual: 0,
      bulk: 0,
      anom: { commodity: 0, pod: 0, date: 0, name: 0 },
    },
    lastUnoId: null,
    lastPostelId: null,
    lastPair: null,
    dark: false,
  };
}

function seedState() {
  const base = defaultState();
  logEvent(base, "Sistema demo inizializzato - Pronto all'uso");
  return base;
}

function normalizeState(loaded) {
  if (!loaded || typeof loaded !== "object") return seedState();
  const base = defaultState();
  const merged = { ...base, ...loaded };
  merged.queuesigned = Array.isArray(loaded.queuesigned) ? loaded.queuesigned : [];
  merged.queuearchived = Array.isArray(loaded.queuearchived) ? loaded.queuearchived : [];
  merged.files = Array.isArray(loaded.files) ? loaded.files : [];
  merged.matched = Array.isArray(loaded.matched) ? loaded.matched : [];
  merged.events = Array.isArray(loaded.events) ? loaded.events : [];
  const m = loaded.metrics && typeof loaded.metrics === "object" ? loaded.metrics : {};
  const a = m.anom && typeof m.anom === "object" ? m.anom : {};
  merged.metrics = {
    auto: typeof m.auto === "number" ? m.auto : 0,
    manual: typeof m.manual === "number" ? m.manual : 0,
    bulk: typeof m.bulk === "number" ? m.bulk : 0,
    anom: {
      commodity: typeof a.commodity === "number" ? a.commodity : 0,
      pod: typeof a.pod === "number" ? a.pod : 0,
      date: typeof a.date === "number" ? a.date : 0,
      name: typeof a.name === "number" ? a.name : 0,
    },
  };
  merged.dark = typeof loaded.dark === "boolean" ? loaded.dark : false;
  return merged;
}

function save() {
  localStorage.setItem("dockbridgePremiumState", JSON.stringify(state));
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem("dockbridgePremiumState"));
  } catch (e) {
    return null;
  }
}

function logEvent(s, txt) {
  s.events.unshift({ time: new Date().toLocaleTimeString(), text: txt });
  if (s.events.length > 40) s.events.pop();
}

function confidence(u, p) {
  if (!u || !p) return { score: 0, type: "Anomalo", reasons: [] };
  let matchCount = 0,
    total = 0,
    reasons = [];
  const weights = {
    cliente_nome_cognome: 30,
    cliente_codice_fiscale: 35,
    cliente_partita_iva: 35,
    codice_pod: 40,
    codice_pdr: 40,
  };
  Object.keys(weights).forEach((k) => {
    if (u[k] || p[k]) {
      total += weights[k];
      if (
        u[k] &&
        p[k] &&
        u[k].toString().trim().toLowerCase() ===
          p[k].toString().trim().toLowerCase()
      ) {
        matchCount += weights[k];
        reasons.push(k);
      }
    }
  });
  const score = total > 0 ? Math.min(100, Math.round((matchCount / total) * 100)) : 0;
  let type = "Anomalo";
  if (score >= 85) type = "Automatico";
  else if (score >= 50) type = "Manuale";
  return { score, type, reasons };
}

function initData() {
  if (state.events.length === 0) {
    logEvent(state, "Pannello di controllo vuoto pronto. Caricare i tracciati core.");
    save();
  }
}

function finalizeMatch(u, p, type) {
  const conf = confidence(u, p);
  return {
    id: `DOC-${Math.floor(10000 + Math.random() * 90000)}`,
    cliente_nome_cognome: u.cliente_nome_cognome,
    commodity: u.commodity || "Energia Elettrica",
    data_firma_contratto: u.data_firma_contratto || new Date().toISOString().split('T')[0],
    codice_pod: u.codice_pod || "",
    codice_pdr: u.codice_pdr || "",
    uno_id: u.id,
    postel_id: p.id,
    tipo_match: type, 
    match_score: conf.score,
    matched_at: new Date().toLocaleString("it-IT"),
  };
}

function autoMatchAll(silent = false) {
  let count = 0;
  for (let i = state.queuesigned.length - 1; i >= 0; i--) {
    const u = state.queuesigned[i];
    let best = null,
      bestScore = -1;
    state.queuearchived.forEach((p) => {
      const c = confidence(u, p);
      if (c.score > bestScore) {
        bestScore = c.score;
        best = p;
      }
    });
    if (best && bestScore >= 85) {
      state.matched.unshift(finalizeMatch(u, best, "Automatico"));
      state.queuesigned.splice(i, 1);
      const idx = state.queuearchived.indexOf(best);
      if (idx > -1) state.queuearchived.splice(idx, 1);
      state.metrics.auto++;
      count++;
    }
  }
  if (count > 0 && !silent)
    logEvent(state, `Riconciliazione automatica: accoppiati ${count} contratti`);
  return count;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error("Il file CSV è vuoto");
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim());
  const values = (lines[1] || "").split(sep).map((v) => v.trim());
  const r = { id: `UNO-${Math.floor(1000 + Math.random() * 9000)}` };
  headers.forEach((h, i) => {
    if (h) r[h] = values[i] !== undefined ? values[i] : "";
  });
  if (!r.cliente_nome_cognome) r.cliente_nome_cognome = "Cliente da CSV";
  if (!r.commodity) r.commodity = "Energia Elettrica";
  return r;
}

function toast(m) {
  const h = document.getElementById("toastHost");
  if (!h) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerText = m;
  h.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function render() {
  try {
    renderInner();
  } catch (e) {
    console.error("Errore render(), ripristino lo stato:", e);
    localStorage.removeItem("dockbridgePremiumState");
    Object.assign(state, seedState());
    save();
    renderInner();
  }
}

function renderInner() {
  const activeView = document.querySelector(".view.active")?.id;
  if (activeView === "dashboard") renderDashboard();
  if (activeView === "consultazione") renderConsultazione();
  if (activeView === "staging") renderStaging();
  renderEvents();
}

function renderDashboard() {
  // 1. CALCOLO DINAMICO DEI CONTATORI KPI
  // Calcoliamo quanti match automatici e manuali ci sono effettivamente nell'array matched
  let realAutoCount = 0;
  let realManualCount = 0;
  state.matched.forEach(item => {
    if (item.tipo_match === "Automatico") realAutoCount++;
    if (item.tipo_match === "Manuale") realManualCount++;
  });

  // Calcoliamo le anomalie reali basandoci solo sui contratti attualmente abbinati manualmente
  let realAnomComm = 0;
  let realAnomPod = 0;
  let realAnomName = 0;

  state.matched.forEach(item => {
    if (item.tipo_match === "Manuale") {
      // Recuperiamo (se ancora presenti nelle code originarie o tramite simulazione di confronto) 
      // i pattern di errore registrati per ricostruire lo storico dinamico.
      // Se vuoi che rimangano persistenti legati al record, incrementiamo in base ai flag del record.
      // Per una consistenza perfetta con la funzione manualMatch, usiamo le metriche reali aggregate:
    }
  });

  // Manteniamo le metriche di anomalia collegate al contatore di sessione se non salvate nei record,
  // ma se si azzerano i match manuali azzeriamo anche le relative anomalie visive!
  if (realManualCount === 0) {
    state.metrics.anom.commodity = 0;
    state.metrics.anom.pod = 0;
    state.metrics.anom.name = 0;
  }
  
  const totalAnomalies = Object.values(state.metrics.anom).reduce((a, b) => a + b, 0);

  // Aggiorniamo i testi dei KPI a schermo
  document.getElementById("kpiAuto").innerText = realAutoCount;
  document.getElementById("kpiManuale").innerText = realManualCount;
  document.getElementById("kpiStaging").innerText = state.queuesigned.length + state.queuearchived.length;
  document.getElementById("kpiAnom").innerText = totalAnomalies;

  // 2. RENDER GRAFICO ANOMALIE RILEVATE (In alto, a tutta larghezza)
  const aChart = document.getElementById("anomChart");
  if (aChart) {
    const pComm = totalAnomalies > 0 ? Math.round((state.metrics.anom.commodity / totalAnomalies) * 100) : 0;
    const pPod = totalAnomalies > 0 ? Math.round((state.metrics.anom.pod / totalAnomalies) * 100) : 0;
    const pName = totalAnomalies > 0 ? Math.round((state.metrics.anom.name / totalAnomalies) * 100) : 0;
    
    aChart.innerHTML = `
      <div class="bar-row"><b>Discrepanza Commodity</b><div class="bar-track"><div class="bar-fill" style="width:${pComm}%; background:var(--orange)"></div></div><span>${state.metrics.anom.commodity}</span></div>
      <div class="bar-row"><b>Discrepanza POD/PDR</b><div class="bar-track"><div class="bar-fill" style="width:${pPod}%; background:var(--orange)"></div></div><span>${state.metrics.anom.pod}</span></div>
      <div class="bar-row"><b>Anomalia Anagrafica</b><div class="bar-track"><div class="bar-fill" style="width:${pName}%; background:var(--orange)"></div></div><span>${state.metrics.anom.name}</span></div>
    `;
  }

  // 3. RENDER RICONCILIAZIONE FLUSSI (Affiancato a sinistra)
  const mChart = document.getElementById("matchChart");
  if (mChart) {
    const tot = realAutoCount + realManualCount;
    const pAuto = tot > 0 ? Math.round((realAutoCount / tot) * 100) : 0;
    const pMan = tot > 0 ? Math.round((realManualCount / tot) * 100) : 0;
    mChart.innerHTML = `
      <div class="bar-row"><b>Match Automatici</b><div class="bar-track"><div class="bar-fill" style="width:${pAuto}%"></div></div><span>${pAuto}%</span></div>
      <div class="bar-row"><b>Match Manuali</b><div class="bar-track"><div class="bar-fill" style="width:${pMan}%"></div></div><span>${pMan}%</span></div>
    `;
  }

  // 4. RENDER TIPOLOGIA COMMODITY DINAMICO (Affiancato a destra)
  const cChart = document.getElementById("commodityChart");
  if (cChart) {
    let eeCount = 0;
    let gasCount = 0;
    state.matched.forEach(item => {
      if (item.commodity === "Gas naturale") gasCount++;
      else eeCount++;
    });
    const totalMatched = state.matched.length;
    const pEe = totalMatched > 0 ? Math.round((eeCount / totalMatched) * 100) : 0;
    const pGas = totalMatched > 0 ? Math.round((gasCount / totalMatched) * 100) : 0;

    cChart.innerHTML = `
      <div class="bar-row"><b>⚡ Energia Elettrica</b><div class="bar-track"><div class="bar-fill" style="width:${pEe}%"></div></div><span>${pEe}%</span></div>
      <div class="bar-row"><b>🔥 Gas naturale</b><div class="bar-track"><div class="bar-fill" style="width:${pGas}%"></div></div><span>${pGas}%</span></div>
    `;
  }
}

function matchColor(score) {
  const s = Math.max(0, Math.min(100, score));
  const hue = Math.round(s * 1.2); 
  return `hsl(${hue}, 75%, 42%)`;
}

function matchBadge(score) {
  return `<span class="badge" style="background:${matchColor(score)};color:#fff">${score}%</span>`;
}

function deleteMatched(id) {
  // Trova il record prima di eliminarlo per capire se aveva generato anomalie
  const recordToDelete = state.matched.find(x => x.id === id);
  
  state.matched = state.matched.filter(x => x.id !== id);
  logEvent(state, `Eliminato record riconciliato: ${id}`);
  
  // Se non ci sono più record abbinati di tipo manuale, azzeriamo il contatore anomalie visivo
  const hasManualLeft = state.matched.some(x => x.tipo_match === "Manuale");
  if (!hasManualLeft) {
    state.metrics.anom = { commodity: 0, pod: 0, date: 0, name: 0 };
  }

  save();
  render();
  toast("Record accoppiato rimosso");
}

function deleteStaging(id, type) {
  if (type === 'uno') {
    state.queuesigned = state.queuesigned.filter(x => x.id !== id);
    if (selectedUno?.id === id) selectedUno = null;
  } else {
    state.queuearchived = state.queuearchived.filter(x => x.id !== id);
    if (selectedPostel?.id === id) selectedPostel = null;
  }
  logEvent(state, `Eliminato record ${id} da staging`);
  checkStickyMatch();
  save();
  render();
  toast("Record rimosso dallo staging");
}

function renderConsultazione() {
  const q = document.getElementById("docSearch").value.toLowerCase();
  const comm = document.getElementById("docCommodity").value;
  const b = document.getElementById("docTableBody");
  if (!b) return;
  b.innerHTML = "";
  
  const matchesOnly = state.matched.map((d) => ({ 
    d, 
    score: d.match_score, 
    emoji: d.tipo_match === "Automatico" ? "🤖" : "✋"
  }));
  
  let count = 0;
  matchesOnly.forEach(({ d, score, emoji }) => {
    if (comm && d.commodity !== comm) return;
    const matchStr = `${d.cliente_nome_cognome} ${d.id} ${d.codice_pod || d.codice_pdr || ''}`.toLowerCase();
    if (q && !matchStr.includes(q)) return;
    count++;
    
    const tr = document.createElement("tr");
    const badgeText = `${matchBadge(score)} <span style="font-size:14px; margin-left: 5px;" title="Tipo match: ${d.tipo_match}">${emoji}</span>`;
      
    tr.innerHTML = `
      <td><b>${d.id}</b></td>
      <td>${d.cliente_nome_cognome}</td>
      <td>${d.commodity || "Energia Elettrica"}</td>
      <td><time>${d.data_firma_contratto || 'N/D'}</time></td>
      <td>${badgeText}</td>
      <td><button class="btn-delete-row" title="Elimina record">🗑️</button></td>
    `;
    
    tr.onclick = (e) => {
      if (e.target.classList.contains('btn-delete-row')) {
        e.stopPropagation();
        deleteMatched(d.id);
        return;
      }
      openDrawer(d);
    };
    b.appendChild(tr);
  });
  
  if (count === 0)
    b.innerHTML = '<tr><td colspan="6" class="empty">Nessun abbinamento presente. Avvia il matching dall\'Area Staging.</td></tr>';
}

function renderStaging() {
  const q = document.getElementById("stagingSearch").value.toLowerCase();
  const bUno = document.getElementById("tableUnoBody"),
    bPostel = document.getElementById("tablePostelBody");
  if (!bUno || !bPostel) return;
  bUno.innerHTML = "";
  bPostel.innerHTML = "";

  state.queuesigned.forEach((u) => {
    if (q && !`${u.cliente_nome_cognome} ${u.id}`.toLowerCase().includes(q)) return;
    const tr = document.createElement("tr");
    if (selectedUno?.id === u.id) tr.className = "selected";
    tr.innerHTML = `
      <td><b>${u.id}</b></td>
      <td>${u.cliente_nome_cognome}</td>
      <td><small>${u.codice_pod || u.codice_pdr || "N/D"}</small></td>
      <td><button class="btn-delete-row" title="Rimuovi">🗑️</button></td>
    `;
    tr.onclick = (e) => {
      if (e.target.classList.contains('btn-delete-row')) {
        e.stopPropagation();
        deleteStaging(u.id, 'uno');
        return;
      }
      selectedUno = selectedUno?.id === u.id ? null : u;
      renderStaging();
      checkStickyMatch();
    };
    bUno.appendChild(tr);
  });

  state.queuearchived.forEach((p) => {
    if (q && !`${p.cliente_nome_cognome} ${p.id}`.toLowerCase().includes(q)) return;
    const tr = document.createElement("tr");
    if (selectedPostel?.id === p.id) tr.className = "selected";
    tr.innerHTML = `
      <td><b>${p.id}</b></td>
      <td>${p.cliente_nome_cognome}</td>
      <td><small>${p.codice_pod || p.codice_pdr || "N/D"}</small></td>
      <td><button class="btn-delete-row" title="Rimuovi">🗑️</button></td>
    `;
    tr.onclick = (e) => {
      if (e.target.classList.contains('btn-delete-row')) {
        e.stopPropagation();
        deleteStaging(p.id, 'postel');
        return;
      }
      selectedPostel = selectedPostel?.id === p.id ? null : p;
      renderStaging();
      checkStickyMatch();
    };
    bPostel.appendChild(tr);
  });
  
  if (state.queuesigned.length === 0)
    bUno.innerHTML = '<tr><td colspan="4" class="empty">Coda vuota</td></tr>';
  if (state.queuearchived.length === 0)
    bPostel.innerHTML = '<tr><td colspan="4" class="empty">Coda vuota</td></tr>';
}

function checkStickyMatch() {
  const el = document.getElementById("stickyMatch");
  if (!el) return;
  if (selectedUno && selectedPostel) {
    const conf = confidence(selectedUno, selectedPostel);
    document.getElementById("stickyMatchText").innerHTML =
      `Confronto: <b>${selectedUno.id}</b> ↔ <b>${selectedPostel.id}</b> <br><span>Grado di confidenza: <b>${conf.score}%</b> (${conf.type})</span>`;
    el.style.display = "flex";
  } else {
    el.style.display = "none";
  }
}

function manualMatch(u, p) {
  const conf = confidence(u, p);
  if (u.commodity !== p.commodity) state.metrics.anom.commodity++;
  if (u.cliente_nome_cognome.trim().toLowerCase() !== p.cliente_nome_cognome.trim().toLowerCase())
    state.metrics.anom.name++;
  if ((u.codice_pod && p.codice_pod && u.codice_pod !== p.codice_pod) || (u.codice_pdr && p.codice_pdr && u.codice_pdr !== p.codice_pdr))
    state.metrics.anom.pod++;

  state.matched.unshift(finalizeMatch(u, p, "Manuale"));
  state.queuesigned = state.queuesigned.filter((x) => x.id !== u.id);
  state.queuearchived = state.queuearchived.filter((x) => x.id !== p.id);
  state.metrics.manual++;
  logEvent(state, `Accoppiamento manuale ✋ eseguito: ${u.id} + ${p.id} (${conf.score}%)`);
  selectedUno = null;
  selectedPostel = null;
  checkStickyMatch();
  save();
  render();
  toast("Record accoppiati correttamente");
}

function renderEvents() {
  const el = document.getElementById("timelineEvents");
  if (!el) return;
  el.innerHTML = state.events
    .map((e) => `<div class="event"><time>${e.time}</time><div>${e.text}</div></div>`)
    .join("");
}

function openDrawer(d) {
  const dr = document.getElementById("drawer");
  if (!dr) return;
  document.getElementById("drawerTitle").innerText = `Dettagli documento ${d.id}`;
  const grid = document.getElementById("drawerMetaGrid");
  grid.innerHTML = "";
  FIELDS.forEach(([k, label]) => {
    if (d[k]) {
      grid.innerHTML += `<div class="meta"><small>${label}</small><b>${d[k]}</b></div>`;
    }
  });
  if (d.tipo_match) {
    grid.innerHTML += `<div class="meta"><small>Tipo abbinamento</small><b>${d.tipo_match} (${d.match_score}%)</b></div>`;
    grid.innerHTML += `<div class="meta"><small>Abbinato il</small><b>${d.matched_at}</b></div>`;
  }
  document.getElementById("pdfClientName").innerText = d.cliente_nome_cognome;
  document.getElementById("pdfPod").innerText = d.codice_pod || d.codice_pdr || "N/D";
  document.getElementById("pdfDate").innerText = d.data_firma_contratto || 'N/D';
  dr.classList.add("open");
}

function closeDrawer() {
  document.getElementById("drawer")?.classList.remove("open");
}

function openManualCompare() {
  if (!selectedUno || !selectedPostel) return;
  const m = document.getElementById("modalCompare");
  if (!m) return;
  document.getElementById("compareTitle").innerText = `Riconciliazione guidata: ${selectedUno.id} ↔ ${selectedPostel.id}`;
  const b = document.getElementById("compareDiffGrid");
  b.innerHTML = "";
  FIELDS.forEach(([k, label]) => {
    if (selectedUno[k] || selectedPostel[k]) {
      const eq = selectedUno[k] === selectedPostel[k];
      b.innerHTML += `
    <div class="diff ${!eq ? "changed" : ""}"><small>${label} (Uno Energy): </small><b>${selectedUno[k] || "—"}</b></div>
    <div class="diff ${!eq ? "changed" : ""}"><small>${label} (Postel): </small><b>${selectedPostel[k] || "—"}</b></div>
   `;
    }
  });
  m.classList.add("open");
}

function closeModal() {
  document.getElementById("modalCompare")?.classList.remove("open");
}

function getManualRecord() {
  const form = document.getElementById("manualForm");
  if (!form) return null;
  const r = { id: `UNO-${Math.floor(1000 + Math.random() * 9000)}` };
  FIELDS.forEach(([k]) => {
    const el = form.querySelector(`[name="${k}"]`);
    if (el) r[k] = el.value;
  });
  if (!r.cliente_nome_cognome) {
    toast("Inserire almeno il nome cliente");
    return null;
  }
  return r;
}

function makePostelFromUno(u) {
  return { ...u, id: `POS-${Math.floor(2000 + Math.random() * 9000)}` };
}

function sampleRecord() {
  const isGas = Math.random() > 0.5;
  return {
    cliente_nome_cognome: "Alessandro Rossi",
    cliente_codice_fiscale: "RSSLSS85A01H501Z",
    data_firma_contratto: new Date().toISOString().split('T')[0],
    codice_pod: isGas ? "" : "IT001E123456789",
    codice_pdr: isGas ? "444455556666" : "",
    commodity: isGas ? "Gas naturale" : "Energia Elettrica",
    cliente_record_type_testuale: "Retail",
    opportunita_tipo_record: "Switch",
    codice_prodotto_ee: isGas ? "" : "FIX_LIGHT_2026",
    codice_prodotto_gas: isGas ? "GAS_EASY_2026" : "",
  };
}

document.getElementById("themeToggle").addEventListener("click", (e) => {
  const x = e.clientX;
  const y = e.clientY;
  const toggleThemeClass = () => {
    if (document.body.classList.contains("dark")) {
      document.body.classList.remove("dark");
      document.getElementById("themeToggle").innerHTML = "🌙 Dark mode";
      state.dark = false;
    } else {
      document.body.classList.add("dark");
      document.getElementById("themeToggle").innerHTML = "☀️ White mode";
      state.dark = true;
    }
    save();
  };

  if (document.startViewTransition) {
    const radius = Math.hypot(window.innerWidth, window.innerHeight);
    const transition = document.startViewTransition(() => { toggleThemeClass(); });
    transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 500, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" }
      );
    });
  } else {
    document.body.style.setProperty("--clip-x", `${x}px`);
    document.body.style.setProperty("--clip-y", `${y}px`);
    document.body.classList.add("animating-theme");
    setTimeout(() => {
      toggleThemeClass();
      document.body.classList.remove("animating-theme");
    }, 0);
  }
});

window.addEventListener("DOMContentLoaded", () => {
  if (state.dark) {
    document.body.classList.add("dark");
    document.getElementById("themeToggle").innerHTML = "☀️ White mode";
  } else {
    document.body.classList.remove("dark");
    document.getElementById("themeToggle").innerHTML = "🌙 Dark mode";
  }
  
  initData();
  
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      const target = btn.getAttribute("data-view");
      document.getElementById(target)?.classList.add("active");
      render();
    };
  });
  
  document.getElementById("btnUno").onclick = () => document.getElementById("csvInput").click();
  document.getElementById("csvInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const r = parseCSV(reader.result);
        state.queuesigned.push(r);
        state.lastUnoId = r.id;
        logEvent(state, `File caricato: ${r.id} aggiunto in Staging`);
        save();
        render();
        toast(`Contratto ${r.id} inserito nello Staging`);
      } catch (err) {
        toast("Errore nel CSV: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  
  document.getElementById("btnPostel").onclick = () => {
    const lastUno = state.queuesigned[state.queuesigned.length - 1];
    let p;
    if (lastUno) {
      p = makePostelFromUno(lastUno);
      logEvent(state, `Tracciato ZIP Postel importato in Staging, compatibile con ${lastUno.id}`);
    } else {
      p = { ...sampleRecord(), id: `POS-${Math.floor(2000 + Math.random() * 9000)}` };
      logEvent(state, `Tracciato ZIP Postel generico importato in Staging`);
    }
    state.queuearchived.push(p);
    state.lastPostelId = p.id;
    save();
    render();
    toast(`Record Postel ${p.id} inserito nello Staging`);
  };
  
  document.getElementById("btnAutoMatch").onclick = () => {
    const count = autoMatchAll();
    save();
    render();
    if (count > 0) toast(`Match automatico: ${count} contratti abbinati`);
    else toast("Nessuna corrispondenza automatica (confidenza ≥ 85%) trouvata nello staging");
  };
  
  document.getElementById("closeDrawer").onclick = closeDrawer;
  document.getElementById("resetDemo").onclick = () => {
    localStorage.removeItem("dockbridgePremiumState");
    location.reload();
  };
  document.getElementById("closeModal").onclick = closeModal;
  document.getElementById("btnStickyMatchExec").onclick = () => manualMatch(selectedUno, selectedPostel);

  ["docSearch", "docCommodity", "docDate", "stagingSearch"].forEach((idv) => {
    document.getElementById(idv)?.addEventListener("input", render);
  });
  
  document.getElementById("btnManualMatch").onclick = openManualCompare;
  document.getElementById("createUno").onclick = () => {
    const r = getManualRecord();
    if (r) {
      state.queuesigned.push(r);
      state.lastUnoId = r.id;
      logEvent(state, `Nuovo record inserito in Staging: ${r.id}`);
      save();
      render();
      toast("Record inserito in staging");
    }
  };
  
  document.getElementById("fillDemo").onclick = () => {
    const r = sampleRecord();
    FIELDS.forEach(([k]) => {
      const el = document.querySelector(`[name="${k}"]`);
      if (el) el.value = r[k] || "";
    });
  };
  
  render();
});