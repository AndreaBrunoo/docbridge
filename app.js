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
const tables = {};

function defaultState() {
  return {
    queuesigned: [],
    queuearchived: [],
    files: [],
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
  logEvent(base, "Sistema demo inizializzato");
  return base;
}
// Ripara uno stato caricato da localStorage che potrebbe provenire da
// un'altra versione della demo (stessa chiave, forma dei dati diversa),
// così i pulsanti non si bloccano più in silenzio per un campo mancante.
function normalizeState(loaded) {
  if (!loaded || typeof loaded !== "object") return seedState();
  const base = defaultState();
  const merged = { ...base, ...loaded };
  merged.queuesigned = Array.isArray(loaded.queuesigned) ? loaded.queuesigned : [];
  merged.queuearchived = Array.isArray(loaded.queuearchived) ? loaded.queuearchived : [];
  merged.files = Array.isArray(loaded.files) ? loaded.files : [];
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
  const score =
    total > 0 ? Math.min(100, Math.round((matchCount / total) * 100)) : 0;
  let type = "Anomalo";
  if (score >= 85) type = "Automatico";
  else if (score >= 50) type = "Manuale";
  return { score, type, reasons };
}

function initData() {
  if (
    state.queuesigned.length === 0 &&
    state.queuearchived.length === 0 &&
    state.files.length === 0
  ) {
    const firstNames = [
        "Mario",
        "Luigi",
        "Anna",
        "Elena",
        "Giovanni",
        "Paola",
        "Roberto",
        "Silvia",
      ],
      lastNames = [
        "Rossi",
        "Bianchi",
        "Verdi",
        "Ferrari",
        "Russo",
        "Esposito",
        "Gallo",
        "Fontana",
      ];
    for (let i = 0; i < 12; i++) {
      const fn = firstNames[i % firstNames.length],
        ln = lastNames[(i + 3) % lastNames.length],
        name = `${fn} ${ln}`,
        cf = `${ln.substring(0, 3).toUpperCase()}${fn.substring(0, 3).toUpperCase()}${80 + i}A01X999${String.fromCharCode(65 + i)}`,
        pod = `IT001E${100000000 + i * 12345}`,
        account = `ACC-${20000 + i}`,
        oppId = `OPP-${50000 + i}`;
      const u = {
        id: `UNO-${1000 + i}`,
        cliente_nome_cognome: name,
        cliente_codice_fiscale: cf,
        cliente_partita_iva: "",
        data_firma_contratto: `2026-03-${10 + i}`,
        codice_pod: pod,
        codice_pdr: "",
        contract_account: account,
        pde_external_id: "",
        commodity: "Energia Elettrica",
        cliente_codice_identificativo_univoco: `IDU-${3000 + i}`,
        cliente_record_type_testuale: "Retail",
        opportunita_tipo_record: "Switch",
        opportunita_id: oppId,
        opportunita_nome: `Opp ${name}`,
        opportunita_commodity: "Power",
        codice_prodotto_ee: "PROMO_POWER_2026",
        codice_prodotto_gas: "",
        stato: "Attivo",
        data_certificazione: `2026-03-${11 + i}`,
      };
      state.queuesigned.push(u);
      if (i !== 3 && i !== 7) {
        const p = { ...u, id: `POS-${2000 + i}` };
        if (i === 5) p.cliente_nome_cognome = "Roberto B.";
        if (i === 9) p.codice_pod = "IT001E999999999";
        state.queuearchived.push(p);
      }
    }
    state.files = [
      {
        id: "F-01",
        name: "uno_energy_report_2026_03.csv",
        type: "Uno Energy CSV",
        date: "2026-03-01",
        status: "Elaborato",
        rows: 12,
      },
      {
        id: "F-02",
        name: "postel_export_batch_A.zip",
        type: "Postel ZIP",
        date: "2026-03-02",
        status: "Elaborato",
        rows: 10,
      },
    ];
    autoMatchAll(true);
    save();
  }
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
      state.queuesigned.splice(i, 1);
      const idx = state.queuearchived.indexOf(best);
      if (idx > -1) state.queuearchived.splice(idx, 1);
      state.metrics.auto++;
      count++;
    }
  }
  if (count > 0 && !silent)
    logEvent(
      state,
      `Riconciliazione automatica: accoppiati ${count} contratti`,
    );
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
    console.error("Errore render(), ripristino i dati demo:", e);
    localStorage.removeItem("dockbridgePremiumState");
    Object.assign(state, seedState());
    logEvent(state, "Dati demo ripristinati automaticamente dopo un errore");
    save();
    toast("Dati demo non validi: ripristinati automaticamente");
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
  document.getElementById("kpiAuto").innerText = state.metrics.auto;
  document.getElementById("kpiManuale").innerText = state.metrics.manual;
  document.getElementById("kpiStaging").innerText =
    state.queuesigned.length + state.queuearchived.length;
  document.getElementById("kpiAnom").innerText = Object.values(
    state.metrics.anom,
  ).reduce((a, b) => a + b, 0);

  const mChart = document.getElementById("matchChart");
  if (mChart) {
    const tot = state.metrics.auto + state.metrics.manual;
    const pAuto = tot > 0 ? Math.round((state.metrics.auto / tot) * 100) : 70;
    const pMan = tot > 0 ? Math.round((state.metrics.manual / tot) * 100) : 30;
    mChart.innerHTML = `
   <div class="bar-row"><b>Match Automatici</b><div class="bar-track"><div class="bar-fill" style="width:${pAuto}%"></div></div><span>${pAuto}%</span></div>
   <div class="bar-row"><b>Match Manuali</b><div class="bar-track"><div class="bar-fill" style="width:${pMan}%"></div></div><span>${pMan}%</span></div>
  `;
  }
  const aChart = document.getElementById("anomChart");
  if (aChart) {
    const an = state.metrics.anom;
    aChart.innerHTML = `
   <div class="bar-row"><b>Errore POD/PDR</b><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, an.pod * 20)}%"></div></div><span>${an.pod}</span></div>
   <div class="bar-row"><b>Discrepanza Nome</b><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, an.name * 20)}%"></div></div><span>${an.name}</span></div>
   <div class="bar-row"><b>Anomalia Commodity</b><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, an.commodity * 20)}%"></div></div><span>${an.commodity}</span></div>
  `;
  }
  const cChart = document.getElementById("commodityChart");
  if (cChart) {
    cChart.innerHTML = `
   <div class="bar-row"><b>⚡ Energia Elettrica</b><div class="bar-track"><div class="bar-fill" style="width:85%"></div></div><span>85%</span></div>
   <div class="bar-row"><b>🔥 Gas naturale</b><div class="bar-track"><div class="bar-fill" style="width:15%"></div></div><span>15%</span></div>
  `;
  }
}

// Percentuale di abbinamento migliore di un documento verso la coda opposta
// (Uno Energy <-> Postel), usata al posto del vecchio "Stato" fisso.
function bestMatchScore(d, candidates) {
  if (!candidates.length) return 0;
  let best = 0;
  candidates.forEach((other) => {
    const c = confidence(d, other);
    if (c.score > best) best = c.score;
  });
  return best;
}
// Gradiente continuo rosso (0%) -> giallo (50%) -> verde (100%) in HSL.
function matchColor(score) {
  const s = Math.max(0, Math.min(100, score));
  const hue = Math.round(s * 1.2); // 0=rosso, 60=giallo, 120=verde
  return `hsl(${hue}, 75%, 42%)`;
}
function matchBadge(score) {
  return `<span class="badge" style="background:${matchColor(score)};color:#fff">${score}%</span>`;
}

function renderConsultazione() {
  const q = document.getElementById("docSearch").value.toLowerCase();
  const comm = document.getElementById("docCommodity").value;
  const b = document.getElementById("docTableBody");
  if (!b) return;
  b.innerHTML = "";
  const all = [
    ...state.queuesigned.map((d) => ({ d, opposite: state.queuearchived })),
    ...state.queuearchived.map((d) => ({ d, opposite: state.queuesigned })),
  ];
  let count = 0;
  all.forEach(({ d, opposite }) => {
    if (comm && d.commodity !== comm) return;
    const matchStr =
      `${d.cliente_nome_cognome} ${d.id} ${d.codice_pod}`.toLowerCase();
    if (q && !matchStr.includes(q)) return;
    count++;
    const score = bestMatchScore(d, opposite);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><b>${d.id}</b></td><td>${d.cliente_nome_cognome}</td><td>${d.commodity}</td><td><time>${d.data_firma_contratto}</time></td><td>${matchBadge(score)}</td>`;
    tr.onclick = () => openDrawer(d);
    b.appendChild(tr);
  });
  if (count === 0)
    b.innerHTML =
      '<tr><td colspan="5" class="empty">Nessun documento trovato corrispondente ai filtri</td></tr>';
}

function renderStaging() {
  const q = document.getElementById("stagingSearch").value.toLowerCase();
  const bUno = document.getElementById("tableUnoBody"),
    bPostel = document.getElementById("tablePostelBody");
  if (!bUno || !bPostel) return;
  bUno.innerHTML = "";
  bPostel.innerHTML = "";

  state.queuesigned.forEach((u) => {
    if (q && !`${u.cliente_nome_cognome} ${u.id}`.toLowerCase().includes(q))
      return;
    const tr = document.createElement("tr");
    if (selectedUno?.id === u.id) tr.className = "selected";
    tr.innerHTML = `<td><b>${u.id}</b></td><td>${u.cliente_nome_cognome}</td><td><small>${u.codice_pod || u.codice_pdr || "N/D"}</small></td>`;
    tr.onclick = () => {
      selectedUno = selectedUno?.id === u.id ? null : u;
      renderStaging();
      checkStickyMatch();
    };
    bUno.appendChild(tr);
  });
  state.queuearchived.forEach((p) => {
    if (q && !`${p.cliente_nome_cognome} ${p.id}`.toLowerCase().includes(q))
      return;
    const tr = document.createElement("tr");
    if (selectedPostel?.id === p.id) tr.className = "selected";
    tr.innerHTML = `<td><b>${p.id}</b></td><td>${p.cliente_nome_cognome}</td><td><small>${p.codice_pod || p.codice_pdr || "N/D"}</small></td>`;
    tr.onclick = () => {
      selectedPostel = selectedPostel?.id === p.id ? null : p;
      renderStaging();
      checkStickyMatch();
    };
    bPostel.appendChild(tr);
  });
  if (state.queuesigned.length === 0)
    bUno.innerHTML = '<tr><td colspan="3" class="empty">Coda vuota</td></tr>';
  if (state.queuearchived.length === 0)
    bPostel.innerHTML =
      '<tr><td colspan="3" class="empty">Coda vuota</td></tr>';
}

function checkStickyMatch() {
  const el = document.getElementById("stickyMatch");
  if (!el) return;
  if (selectedUno && selectedPostel) {
    const conf = confidence(selectedUno, selectedPostel);
    document.getElementById("stickyMatchText").innerHTML =
      `Confronto: <b>${selectedUno.id}</b> ↔ <b>${selectedPostel.id}</b> <br><span>Grado di confidenza stimato artificialmente: <b>${conf.score}%</b> (${conf.type})</span>`;
    el.style.display = "flex";
  } else {
    el.style.display = "none";
  }
}

function manualMatch(u, p) {
  const conf = confidence(u, p);
  if (u.commodity !== p.commodity) state.metrics.anom.commodity++;
  if (
    u.cliente_nome_cognome.trim().toLowerCase() !==
    p.cliente_nome_cognome.trim().toLowerCase()
  )
    state.metrics.anom.name++;
  if (
    (u.codice_pod && p.codice_pod && u.codice_pod !== p.codice_pod) ||
    (u.codice_pdr && p.codice_pdr && u.codice_pdr !== p.codice_pdr)
  )
    state.metrics.anom.pod++;

  state.queuesigned = state.queuesigned.filter((x) => x.id !== u.id);
  state.queuearchived = state.queuearchived.filter((x) => x.id !== p.id);
  state.metrics.manual++;
  logEvent(
    state,
    `Accoppiamento manuale eseguito con successo: ${u.id} + ${p.id} (Confidenza: ${conf.score}%)`,
  );
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
    .map(
      (e) =>
        `<div class="event"><time>${e.time}</time><div>${e.text}</div></div>`,
    )
    .join("");
}

function openDrawer(d) {
  const dr = document.getElementById("drawer");
  if (!dr) return;
  document.getElementById("drawerTitle").innerText =
    `Dettagli documento ${d.id}`;
  const grid = document.getElementById("drawerMetaGrid");
  grid.innerHTML = "";
  FIELDS.forEach(([k, label]) => {
    if (d[k]) {
      grid.innerHTML += `<div class="meta"><small>${label}</small><b>${d[k]}</b></div>`;
    }
  });
  document.getElementById("pdfClientName").innerText = d.cliente_nome_cognome;
  document.getElementById("pdfPod").innerText =
    d.codice_pod || d.codice_pdr || "N/D";
  document.getElementById("pdfDate").innerText = d.data_firma_contratto;
  dr.classList.add("open");
}
function closeDrawer() {
  document.getElementById("drawer")?.classList.remove("open");
}

function openManualCompare() {
  if (!selectedUno || !selectedPostel) return;
  const m = document.getElementById("modalCompare");
  if (!m) return;
  document.getElementById("compareTitle").innerText =
    `Riconciliazione guidata: ${selectedUno.id} ↔ ${selectedPostel.id}`;
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
  const r = { id: `MAN-${Math.floor(1000 + Math.random() * 9000)}` };
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
  return {
    cliente_nome_cognome: "Vittorio Emanuele",
    cliente_codice_fiscale: "VTTMNL84M01H501Z",
    data_firma_contratto: "2026-04-01",
    codice_pod: "IT001E888888888",
    commodity: "Energia Elettrica",
    cliente_record_type_testuale: "Retail",
    opportunita_tipo_record: "Switch",
    codice_prodotto_ee: "POWER_TOP_2026",
  };
}

// --- LOGICA GESTIONE CAMBIO TEMA CON EFFETTO ONDA CIRCOLARE ---
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

  // 1. Uso delle moderne API View Transition
  if (document.startViewTransition) {
    const radius = Math.hypot(window.innerWidth, window.innerHeight);

    const transition = document.startViewTransition(() => {
      toggleThemeClass();
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 500,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  }
  // 2. Fallback classico con Pseudo-elemento e variabili CSS
  else {
    document.body.style.setProperty("--clip-x", `${x}px`);
    document.body.style.setProperty("--clip-y", `${y}px`);
    document.body.classList.add("animating-theme");

    setTimeout(() => {
      toggleThemeClass();
      document.body.classList.remove("animating-theme");
    }, 0);
  }
});

// Setup iniziale degli eventi e del tema salvato
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
      document
        .querySelectorAll(".nav-item")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document
        .querySelectorAll(".view")
        .forEach((v) => v.classList.remove("active"));
      const target = btn.getAttribute("data-view");
      document.getElementById(target)?.classList.add("active");
      render();
    };
  });
  document.getElementById("btnUno").onclick = () =>
    document.getElementById("csvInput").click();
  document.getElementById("csvInput").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const r = parseCSV(reader.result);
        state.queuesigned.push(r);
        state.lastUnoId = r.id;
        logEvent(state, `Record Uno Energy importato da CSV: ${r.id}`);
        save();
        render();
        toast(`Contratto ${r.id} caricato in staging`);
      } catch (err) {
        toast("Errore nel CSV: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  document.getElementById("btnPostel").onclick = () => {
    const lastUno =
      state.queuesigned.find((x) => x.id === state.lastUnoId) ||
      state.queuesigned[state.queuesigned.length - 1];
    let p;
    if (lastUno) {
      p = makePostelFromUno(lastUno);
      logEvent(
        state,
        `Record Postel simulato generato, compatibile con ${lastUno.id}`,
      );
    } else {
      p = { ...sampleRecord(), id: `POS-${Math.floor(2000 + Math.random() * 9000)}` };
      logEvent(
        state,
        "Record Postel simulato generato (nessun contratto Uno Energy recente da abbinare)",
      );
    }
    state.queuearchived.push(p);
    state.lastPostelId = p.id;
    save();
    render();
    toast(`Record Postel ${p.id} importato in staging`);
  };
  document.getElementById("btnAutoMatch").onclick = () => {
    const count = autoMatchAll();
    save();
    render();
    if (count > 0)
      toast(`Match automatico: ${count} contratti riconciliati`);
    else
      toast("Nessuna coppia con confidenza ≥ 85% trovata in staging");
  };
  document.getElementById("closeDrawer").onclick = closeDrawer;
  document.getElementById("resetDemo").onclick = () => {
    localStorage.removeItem("dockbridgePremiumState");
    location.reload();
  };
  document.getElementById("closeModal").onclick = closeModal;
  document.getElementById("btnStickyMatchExec").onclick = () =>
    manualMatch(selectedUno, selectedPostel);

  ["docSearch", "docCommodity", "docDate", "stagingSearch"].forEach((idv) => {
    document.getElementById(idv)?.addEventListener("input", render);
  });
  document.getElementById("btnManualMatch").onclick = openManualCompare;
  document.getElementById("createUno").onclick = () => {
    const r = getManualRecord();
    if (r) {
      state.queuesigned.push(r);
      state.lastUnoId = r.id;
      logEvent(state, "Record Uno Energy creato");
      save();
      render();
      toast("Record creato");
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
