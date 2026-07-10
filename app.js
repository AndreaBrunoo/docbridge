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
  ["id_forniture", "ID forniture"],
  ["opportunita_nome", "Nome opportunità"],
  ["opportunita_commodity", "Commodity opportunità"],
  ["codice_prodotto_ee", "Prodotto EE"],
  ["codice_prodotto_gas", "Prodotto GAS"],
  ["stato", "Stato"],
  ["data_certificazione", "Data certificazione"],
];

// Mappa le intestazioni "umane" del CSV reale Uno Energy (export CRM)
// alle chiavi interne usate dall'applicazione.
const CSV_HEADER_MAP = {
  "fornitura : cliente : nome e cognome": "cliente_nome_cognome",
  "fornitura : cliente : codice fiscale": "cliente_codice_fiscale",
  "fornitura : cliente : partita iva": "cliente_partita_iva",
  "data firma contratto": "data_firma_contratto",
  "codice pod": "codice_pod",
  "codice pdr": "codice_pdr",
  "contract account": "contract_account",
  "pde external id": "pde_external_id",
  "commodity": "commodity",
  "fornitura : cliente : codice identificativo univoco": "cliente_codice_identificativo_univoco",
  "fornitura : cliente : record type testuale": "cliente_record_type_testuale",
  "fornitura : opportunita : tipo di record opportunita": "opportunita_tipo_record",
  "id forniture": "id_forniture",
  "fornitura : opportunita : nome opportunita": "opportunita_nome",
  "fornitura : opportunita : commodity": "opportunita_commodity",
  "codice prodotto ee": "codice_prodotto_ee",
  "codice prodotto gas": "codice_prodotto_gas",
  "stato": "stato",
  "data certificazione": "data_certificazione",
};

// Password demo archiviate in chiaro: è una demo frontend-only, NON un
// sistema di autenticazione reale. In produzione le password andrebbero
// hashate lato server (es. bcrypt) e mai inviate/transitate in chiaro.
const DEMO_USERS = [
  { id: "u_vis", username: "Mario", role: "Consultatore", password: "demo", createdAt: "2026-01-15 09:00" },
  { id: "u_tec", username: "Luigi", role: "Tecnico", password: "demo", createdAt: "2026-01-15 09:00" },
  { id: "u_dpo", username: "Margherita", role: "DPO", password: "demo", createdAt: "2026-01-15 09:00" },
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
    // --- Sistema di ruoli (V2) ---
    users: DEMO_USERS.map((u) => ({ ...u })),
    currentUser: null,   // null = login non effettuato
    auditUnlocked: false, // DPO ha rivelato almeno una volta i nomi utente nei log (solo UI, non persistito davvero: viene resettato a ogni avvio per evitare che l'utente DPO precedente lasci la sessione 'sbloccata')
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
  // --- Ruoli: garantire presenza di users / currentUser / auditUnlocked ---
  // Per chi aveva già uno stato salvato senza questi campi, inizializziamo
  // i 3 utenti demo e forziamo il logout: la sessione precedente non aveva
  // un'identità associata, quindi richiediamo un nuovo login.
  merged.users = Array.isArray(loaded.users) && loaded.users.length > 0
    ? loaded.users
    : DEMO_USERS.map((u) => ({ ...u }));
  merged.currentUser = loaded.currentUser && typeof loaded.currentUser === "object"
    ? loaded.currentUser
    : null;
  merged.auditUnlocked = false; // mai persistito: sempre off al riavvio
  return merged;
}

// ============================================================
// Ruoli & Permessi
// ============================================================
// Matrice delle azioni consentite per ciascun ruolo. Aggiungere una nuova
// azione significa elencarla qui sotto; il resto del codice usa solo
// `can(...)` e non deve fare confronti diretti con `state.currentUser.role`.
const ROLE_PERMISSIONS = {
  Consultatore: new Set([
    "view:dashboard",
    "view:consultazione",
  ]),
  Tecnico: new Set([
    "view:dashboard",
    "view:consultazione",
    "view:staging",
    "view:manuale",
    "action:carica-csv",
    "action:carica-xml",
    "action:auto-match",
    "action:manual-match",
    "action:elimina-record",
  ]),
  DPO: new Set([
    "view:dashboard",
    "view:consultazione",
    "view:staging",
    "view:manuale",
    "view:utenti",
    "action:carica-csv",
    "action:carica-xml",
    "action:auto-match",
    "action:manual-match",
    "action:elimina-record",
    "action:cambia-ruolo",
    "action:audit-rivela", // può svelare gli userId nei log
  ]),
};

function currentRole() {
  return state.currentUser?.role || null;
}

function can(action) {
  const role = currentRole();
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.has(action) || false;
}

function findUserById(id) {
  return state.users.find((u) => u.id === id) || null;
}

function findUserByUsername(username) {
  return state.users.find((u) => u.username === username) || null;
}

function login(userId, password) {
  const user = findUserById(userId);
  if (!user) return { ok: false, error: "Utente non trovato" };
  if (user.password !== password) return { ok: false, error: "Password errata" };
  state.currentUser = { id: user.id, username: user.username, role: user.role };
  state.auditUnlocked = false;
  _revealedEventIdx = new Set();
  logEvent(state, `Login effettuato: ${user.username} (${user.role})`, user.id);
  save();
  return { ok: true, user: state.currentUser };
}

function logout() {
  if (state.currentUser) {
    logEvent(state, `Logout effettuato: ${state.currentUser.username}`, state.currentUser.id);
  }
  state.currentUser = null;
  state.auditUnlocked = false;
  _revealedEventIdx = new Set();
  save();
}

// Maschera un userId in un codice corto, STABILE e NON reversibile, da
// mostrare di default nel Log Eventi (privacy by default). I 3 caratteri
// finali sono derivati da un hash deterministico dell'id, così lo stesso
// utente produce sempre lo stesso codice e il DPO può correlare gli eventi.
function maskUser(userId) {
  if (!userId) return "sys";
  if (userId === "system") return "sys";
  // djb2-like: leggero, deterministico, sufficiente per mascherare senza
  // esporre l'id reale. Non è un hash crittografico.
  let h = 5381;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 33) ^ userId.charCodeAt(i);
  }
  // Converti in unsigned e poi in base36, prendi gli ultimi 3 caratteri
  const code = (h >>> 0).toString(36).padStart(3, "0").slice(-3);
  return `usr_***${code}`;
}

function revealUser(userId) {
  if (!userId || userId === "system") return "system";
  const u = findUserById(userId);
  return u ? u.username : userId;
}

function changeUserRole(userId, newRole) {
  if (!can("action:cambia-ruolo")) return false;
  if (!["Consultatore", "Tecnico", "DPO"].includes(newRole)) return false;
  const u = findUserById(userId);
  if (!u) return false;
  const oldRole = u.role;
  if (oldRole === newRole) return true;
  u.role = newRole;
  // Aggiorna anche eventuale currentUser se stiamo modificando l'utente loggato
  if (state.currentUser?.id === u.id) {
    state.currentUser.role = newRole;
  }
  logEvent(state, `Cambio ruolo: ${u.username} ${oldRole} → ${newRole}`, state.currentUser?.id);
  save();
  return true;
}

function save() {
  try {
    updateNotificationDot();
    localStorage.setItem("dockbridgePremiumState", JSON.stringify(state));
    return true;
  } catch (err) {
    // Quota di localStorage superata: alleggeriamo lo stato tenendo solo la
    // cronologia più recente e riproviamo, invece di far fallire l'azione
    // dell'utente (import CSV, match, inserimento manuale, ecc.).
    console.warn("Salvataggio fallito, provo a liberare spazio:", err);
    // Preserva sempre la sessione corrente: un fallimento di quota durante
    // un login/cambio ruolo non deve mai far "regredire" o perdere
    // state.currentUser al giro di salvataggio successivo.
    const savedUser = state.currentUser;
    const savedUsers = state.users;
    state.events = state.events.slice(0, 15);
    if (state.matched.length > 150) state.matched = state.matched.slice(0, 150);
    state.currentUser = savedUser;
    state.users = savedUsers;
    try {
      localStorage.setItem("dockbridgePremiumState", JSON.stringify(state));
      toast("Spazio archiviazione quasi esaurito: rimossa la cronologia più vecchia");
      return true;
    } catch (err2) {
      toast("Spazio di archiviazione del browser esaurito. Usa 'Ripristina dati demo' per liberarlo.");
      return false;
    }
  }
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem("dockbridgePremiumState"));
  } catch (e) {
    return null;
  }
}

function logEvent(s, txt, userId) {
  // userId: id dell'utente che ha generato l'evento. Default = utente
  // attualmente loggato. "system" per eventi tecnici (inizializzazione, ecc.).
  const uid = userId !== undefined ? userId : (s.currentUser?.id || "system");
  s.events.unshift({ time: new Date().toLocaleTimeString(), text: txt, userId: uid });
  if (s.events.length > 40) s.events.pop();
}

function isGasRecord(d) {
  if (!d) return false;
  const hasPod = !!(d.codice_pod && d.codice_pod.toString().trim());
  const hasPdr = !!(d.codice_pdr && d.codice_pdr.toString().trim());
  if (hasPdr && !hasPod) return true;
  if (hasPod && !hasPdr) return false;
  return (d.commodity || "").toString().toLowerCase().includes("gas");
}

function podPdrValue(d) {
  return isGasRecord(d)
    ? (d.codice_pdr || d.codice_pod || "N/D")
    : (d.codice_pod || d.codice_pdr || "N/D");
}

// Checks if a PDE external ID is valid (not null, not empty, not "null", not "undefined")
function isValidPdeExternalId(value) {
  return value &&
    typeof value === 'string' &&
    value.trim() !== '' &&
    value.trim() !== 'null' &&
    value.trim() !== 'undefined';
}

// Un record Elettrica (identificato da POD) e un record Gas (identificato
// da PDR) non sono compatibili per l'abbinamento: sono identificativi di
// natura diversa e non ha senso "unificarli" tramite la riconciliazione
// guidata. Questo controllo blocca sia il match automatico che quello
// manuale quando i due record selezionati appartengono a commodity diverse.
function commodityIncompatible(u, p) {
  if (!u || !p) return false;
  return isGasRecord(u) !== isGasRecord(p);
}

function confidence(u, p) {
  if (!u || !p) return { score: 0, type: "Anomalo", reasons: [] };
  let matchCount = 0,
    total = 0,
    reasons = [];
  // Pesi per il calcolo del grado di confidenza. Escludiamo di proposito i
  // campi di natura puramente CRM/Opportunità Uno Energy (opportunita_tipo_record,
  // id_forniture, opportunita_nome) perché non hanno un corrispondente
  // significativo nel tracciato Postel e non vanno usati per il matching.
  const weights = {
    cliente_nome_cognome: 20,
    cliente_codice_fiscale: 20,
    cliente_partita_iva: 15,
    codice_pod: 20,
    codice_pdr: 20,
    contract_account: 15,
    cliente_codice_identificativo_univoco: 10,
    data_firma_contratto: 8,
    commodity: 8,
    cliente_record_type_testuale: 5,
    opportunita_id: 8,
    opportunita_commodity: 5,
    codice_prodotto_ee: 8,
    codice_prodotto_gas: 8,
    stato: 5,
    data_certificazione: 5,
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
  let type = score >= 100 ? "Automatico" : "Anomalo";
  return { score, type, reasons };
}

function initData() {
  if (state.events.length === 0) {
    logEvent(state, "Pannello di controllo vuoto pronto. Caricare i tracciati core.");
    save();
  }
}

function getActiveRepoByCategory(category) {
  return repoManaged.find((repo) => repo.active && getRepoCategory(repo) === category) || null;
}

function getDefaultOriginRepo(category) {
  const repo = getActiveRepoByCategory(category);
  return repo?.name || (category === "Postel" ? "Postel" : "Uno Energy");
}

function getRecordOriginLabel(record) {
  const candidates = [record?.origin_repo, record?.source_repo, record?.repository_origin].filter(Boolean);
  return candidates[0] || "Repository non specificato";
}

function getRecordProvenanceLabel(record) {
  const repositories = Array.isArray(record?.source_repositories) && record.source_repositories.length
    ? record.source_repositories.filter(Boolean)
    : [];
  if (repositories.length) return repositories.join(" + ");
  const direct = getRecordOriginLabel(record);
  return direct;
}

function finalizeMatch(u, p, type) {
  const conf = confidence(u, p);
  const repos = [u.origin_repo || getDefaultOriginRepo("Uno Energy"), p.origin_repo || getDefaultOriginRepo("Postel")].filter(Boolean);
  const provenanceLabel = repos.length ? repos.join(" + ") : "Repository non specificato";
  return {
    ...u,
    id: `DOC-${Math.floor(10000 + Math.random() * 90000)}`,
    commodity: u.commodity || "Energia Elettrica",
    data_firma_contratto: u.data_firma_contratto || new Date().toISOString().split('T')[0],
    codice_pod: u.codice_pod || "",
    codice_pdr: u.codice_pdr || "",
    // Il PD External ID è l'identificativo autorevole del documento Postel
    // (WS/XML): va preservato dal lato "p" e non sovrascritto da quello,
    // spesso assente, del record Unoenergy. Senza questo il controllo
    // duplicati sul re-import dello stesso file non trova mai corrispondenza.
    pde_external_id: p.pde_external_id || u.pde_external_id || "",
    uno_id: u.id,
    postel_id: p.id,
    tipo_match: type,
    match_score: conf.score,
    matched_at: new Date().toLocaleString("it-IT"),
    origin_repo: provenanceLabel,
    source_repositories: repos,
    uno_origin_repo: u.origin_repo || getDefaultOriginRepo("Uno Energy"),
    postel_origin_repo: p.origin_repo || getDefaultOriginRepo("Postel"),
    // Tracciamento GDPR: chi ha effettuato il match. "system" per i match
    // generati automaticamente dal flusso (es. ingest Postel con ID valido)
    // quando l'utente non ha eseguito un'azione esplicita.
    matched_by: state.currentUser?.id || "system",
    // Flag di anomalia calcolati una volta e "congelati" sul record: così
    // il pannello Anomalie Rilevate può sempre ricontarli a partire dai
    // record realmente presenti in state.matched, invece di tenere un
    // contatore separato che rischia di disallinearsi quando i record
    // vengono eliminati singolarmente.
    anom_commodity: (u.commodity || "") !== (p.commodity || ""),
    anom_name: (u.cliente_nome_cognome || "").trim().toLowerCase() !== (p.cliente_nome_cognome || "").trim().toLowerCase(),
    anom_pod: !!((u.codice_pod && p.codice_pod && u.codice_pod !== p.codice_pod) || (u.codice_pdr && p.codice_pdr && u.codice_pdr !== p.codice_pdr)),
  };
}

function autoMatchAll(silent = false) {
  let count = 0;
  for (let i = state.queuesigned.length - 1; i >= 0; i--) {
    const u = state.queuesigned[i];
    let best = null,
      bestScore = -1;
    state.queuearchived.forEach((p) => {
      // Check if both records have invalid PDE external ID
      // If both are invalid, they cannot be matched automatically
      const uHasValidPde = isValidPdeExternalId(u.pde_external_id);
      const pHasValidPde = isValidPdeExternalId(p.pde_external_id);
      const bothHaveInvalidPde = !uHasValidPde && !pHasValidPde;

      if (bothHaveInvalidPde) {
        // Skip this pair - cannot match if both have invalid PDE external ID
        return;
      }

      if (commodityIncompatible(u, p)) return;
      const c = confidence(u, p);
      if (c.score > bestScore) {
        bestScore = c.score;
        best = p;
      }
    });
    if (best && bestScore >= 100) {
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

function parseCSVLine(line, sep) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Parsa un CSV con intestazione e restituisce un array di record (una riga
// per ogni riga dati del file), mappando le intestazioni umane del CRM
// Uno Energy alle chiavi interne quando riconosciute.
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("Il file CSV non contiene righe di dati");
  const headerLine = lines[0];
  const sepCandidates = [["\t", (headerLine.match(/\t/g) || []).length], [";", (headerLine.match(/;/g) || []).length], [",", (headerLine.match(/,/g) || []).length]];
  sepCandidates.sort((a, b) => b[1] - a[1]);
  const sep = sepCandidates[0][1] > 0 ? sepCandidates[0][0] : ",";
  const rawHeaders = parseCSVLine(lines[0], sep).map((h) => h.trim());
  const headers = rawHeaders.map((h) => CSV_HEADER_MAP[h.toLowerCase()] || h);
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], sep).map((v) => v.trim());
    if (values.every((v) => v === "")) continue;
    const r = { id: `UNO-${Math.floor(1000 + Math.random() * 9000)}`, origin_repo: getDefaultOriginRepo("Uno Energy") };
    headers.forEach((h, idx) => {
      if (h) r[h] = values[idx] !== undefined ? values[idx] : "";
    });
    if (!r.cliente_nome_cognome) r.cliente_nome_cognome = "Cliente da CSV";
    if (!r.commodity) {
      r.commodity = (r.codice_pdr && !r.codice_pod) ? "Gas naturale" : "Energia Elettrica";
    }
    records.push(r);
  }
  if (!records.length) throw new Error("Nessuna riga dati valida trovata nel CSV");
  return records;
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
  // Se non c'è un utente loggato non renderizzare nulla (l'overlay di login
  // è gestito separatamente in showLoginOverlay/hideLoginOverlay).
  if (!state.currentUser) return;
  const activeView = document.querySelector(".view.active")?.id;
  applyRoleGating();
  if (activeView === "dashboard") renderDashboard();
  if (activeView === "consultazione") renderConsultazione();
  if (activeView === "staging") renderStaging();
  if (activeView === "users") renderUsersPanel();
  renderEvents();
  renderUserBadge();
}

// Mostra/nasconde elementi della sidebar, header e altri bottoni in base
// al ruolo corrente. Gli elementi restano nel DOM (perché la loro presenza
// può servire a debug), ma sono nascosti via display:none quando il ruolo
// non ha il permesso corrispondente. Il mapping si appoggia agli attributi
// `data-requires` presenti nell'HTML.
function applyRoleGating() {
  const map = {
    "btnUno": "action:carica-csv",
    "btnPostel": "action:carica-xml",
    "btnAutoMatch": "action:auto-match",
    "nav-staging": "view:staging",
    "nav-manuale": "view:manuale",
    "nav-users": "view:utenti",
  };
  Object.entries(map).forEach(([id, perm]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = can(perm) ? "" : "none";
  });
}

// Aggiorna il badge utente nella topbar (username + pill ruolo). Se nessun
// utente è loggato, il contenitore è nascosto.
function renderUserBadge() {
  const badge = document.getElementById("userBadge");
  if (!badge) return;
  if (!state.currentUser) {
    badge.style.display = "none";
    return;
  }
  const u = state.currentUser;
  badge.style.display = "";
  badge.innerHTML = `
    <div class="user-info">
      <span class="user-icon">👤</span>
      <div class="user-meta">
        <b class="user-name">${escapeHtml(u.username)}</b>
        <span class="role-pill role-${u.role.toLowerCase()}">${escapeHtml(u.role)}</span>
      </div>
    </div>
    <button id="logoutBtn" class="ghostrosso" title="Esci dalla sessione">⎋ Esci</button>
  `;
  const lo = document.getElementById("logoutBtn");
  if (lo) lo.onclick = handleLogout;
}

// Gestisce il click sul bottone Logout. Salva, azzera currentUser, mostra
// l'overlay di login e ripristina la vista Dashboard.
function handleLogout() {
  logout();
  // Torna alla vista Dashboard prima di mostrare il login, così l'utente
  // DPO che si disconnette non lascia la "Gestione utenti" come view attiva
  // per il prossimo login (Consultatore non la vedrebbe).
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById("dashboard")?.classList.add("active");
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  document.querySelector('.nav-item[data-view="dashboard"]')?.classList.add("active");
  showLoginOverlay();
}

// ============================================================
// Login overlay
// ============================================================
function showLoginOverlay() {
  const overlay = document.getElementById("loginOverlay");
  if (!overlay) return;

  // Resetta i campi di input ad ogni apertura dell'overlay
  const usernameInput = document.getElementById("loginUsername");
  if (usernameInput) {
    usernameInput.value = "";
    usernameInput.focus();
  }
  
  const pwdInput = document.getElementById("loginPassword");
  if (pwdInput) pwdInput.value = "demo"; // Mantiene la password precompilata della demo

  const err = document.getElementById("loginError");
  if (err) err.textContent = "";

  overlay.classList.add("open");
  document.body.classList.add("login-open");
}

function hideLoginOverlay() {
  const overlay = document.getElementById("loginOverlay");
  if (!overlay) return;
  overlay.classList.remove("open");
  document.body.classList.remove("login-open");
}

function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  
  const usernameInput = document.getElementById("loginUsername");
  const pwdInput = document.getElementById("loginPassword");
  const err = document.getElementById("loginError");
  
  const username = usernameInput?.value.trim() || "";
  const password = pwdInput?.value || "";

  if (!username) {
    if (err) err.textContent = "Inserisci l'username";
    return;
  }

  // Cerca l'utente nell'array DEMO_USERS tramite l'username inserito
  const user = findUserByUsername(username);
  if (!user) {
    if (err) err.textContent = "Utente non trovato";
    return;
  }

  // Effettua il tentativo di login reale usando la funzione esistente tramite l'ID trovato
  const result = login(user.id, password);
  if (!result.ok) {
    if (err) err.textContent = result.error;
    return;
  }

  hideLoginOverlay();
  render();
  toast(`Benvenuto, ${result.user.username} (${result.user.role})`);
}

function renderDashboard() {
  // 1. CALCOLO DINAMICO DEI CONTATORI KPI
  // Calcoliamo quanti match automatici e manuali ci sono effettivamente nell'array matched
  let realAutoCount = 0;
  let realManualCount = 0;
  state.matched.forEach(item => {
    // Include anche le varianti come "Automatico (da XML con ID valido)":
    // sono comunque match automatici e vanno contati come tali (coerenza
    // con l'emoji 🤖 già usata in Consultazione, vedi renderConsultazione).
    if (item.tipo_match && item.tipo_match.startsWith("Automatico")) realAutoCount++;
    if (item.tipo_match === "Manuale") realManualCount++;
  });

  // Aggiorniamo i testi dei KPI a schermo
  document.getElementById("kpiAuto").innerText = realAutoCount;
  document.getElementById("kpiManuale").innerText = realManualCount;
  document.getElementById("kpiStaging").innerText = state.queuesigned.length + state.queuearchived.length;

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
      if (item.commodity === "GA") gasCount++;
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

function deleteMatched(id) {
  if (!can("action:elimina-record")) {
    toast("Permesso negato: il tuo ruolo non può eliminare record");
    return;
  }
  state.matched = state.matched.filter(x => x.id !== id);
  logEvent(state, `Eliminato record riconciliato: ${id}`);

  // Non serve più azzerare manualmente state.metrics.anom: il pannello
  // Anomalie Rilevate viene ora ricalcolato ad ogni render direttamente
  // dai flag salvati sui record rimasti in state.matched (vedi renderDashboard).

  save();
  render();
  toast("Record accoppiato rimosso");
}

function deleteStaging(id, type) {
  if (!can("action:elimina-record")) {
    toast("Permesso negato: il tuo ruolo non può eliminare record");
    return;
  }
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
  const q = document.getElementById("docSearch").value.toLowerCase().trim();
  // Campi attivi per il filtro: se l'utente non ha applicato filtri
  // avanzati personalizzati, usiamo i 6 campi "hash" di default.
  const activeFields = _activeFilterFields || DEFAULT_HASH_FIELDS;
  const b = document.getElementById("docTableBody");
  if (!b) return;
  b.innerHTML = "";

  // Badge filtri attivi: visibile solo se l'utente ha personalizzato i
  // campi rispetto al default. Mostra i label dei campi + una × per
  // tornare al default con un click.
  renderActiveFiltersBar();

  const matchesOnly = state.matched.map((d) => ({
    d,
    emoji: d.tipo_match === "Automatico" || d.tipo_match === "Automatico (da XML con ID valido)" ? "🤖" : "✋"
  }));

  let count = 0;

  // Aggiunto l'indice "i" nel forEach se ti serve per data-idx
  matchesOnly.forEach(({ d, emoji }, i) => {
    if (q) {
      // "Ricerca hash": il record passa se ALMENO UNO dei campi attivi
      // contiene la query (OR logico). Sostituisce sia il vecchio filtro
      // per singolo campo (docSearchField) sia quello per commodity.
      const hit = activeFields.some((field) => {
        const v = (d[field] || "").toString().toLowerCase();
        return v.includes(q);
      });
      if (!hit) return;
    }

    count++;
    const u = state.users.find((x) => x.id === d.matched_by);
    const tr = document.createElement("tr");
    const userId = d.matched_by || "system";
    const badgeText = `<span class="badge" style="background:#0f913f;color:#fff">${d.tipo_match}</span> <span style="font-size:14px; margin-left: 5px;" title="Tipo match: ${d.tipo_match}">${emoji}</span>`;
    const provenanceLabel = getRecordProvenanceLabel(d);

    // 1. Dichiariamo "eye" fuori con "let" così è accessibile ovunque nel ciclo
    let eye = "******"; // Default per chi non è DPO

    // Recuperiamo l'utente CORRENTE loggato (adatta "state.currentUser" al tuo progetto)
    const currentUser = state.currentUser;
    const isCurrentUserDpo = currentUser && currentUser.role === "DPO";

    if (isCurrentUserDpo) {
      // Se l'utente è DPO, vede una card con l'occhio
      // La card contiene: occhio + eventualmente il nome (toggle)
      eye = `<div class="user-reveal-card" data-reveal-idx="${i}" data-user-id="${u.id}">
        <button class="user-reveal-eye" title="Rivela/Nascondi identità">👁️</button>
        <span class="user-reveal-name" style="display: none;"></span>
      </div>`;
    }

    const deleteBtn = can("action:elimina-record")
      ? '<button class="btn-delete-row" title="Elimina record">🗑️</button>'
      : "";

    tr.innerHTML = `
      <td><b>${d.id}</b></td>
      <td>${d.cliente_nome_cognome}</td>
      <td>${d.commodity || "Energia Elettrica"}</td>
      <td><time>${d.data_firma_contratto || 'N/D'}</time></td>
      <td>
        <div>${badgeText}</div>
        <div class="repo-origin-pill">Repository: ${escapeHtml(provenanceLabel)}</div>
      </td>
      <td>${eye || 'N/D' }</td>

      <td>${deleteBtn}</td>
    `;

tr.onclick = async (e) => {
      // 1. Gestione Cestino (Elimina)
      if (e.target.classList.contains('btn-delete-row')) {
        e.stopPropagation();
        deleteMatched(d.id);
        return;
      }

      // 2. Gestione Card Occhio (DPO) - Toggle reveal/hide
      const revealBtn = e.target.closest('.user-reveal-eye');
      if (revealBtn) {
        e.stopPropagation();

        const card = revealBtn.closest('.user-reveal-card');
        const nameSpan = card.querySelector('.user-reveal-name');
        const isCurrentlyRevealed = nameSpan.style.display !== 'none';

        if (isCurrentlyRevealed) {
          // Nascondi il nome e cambia occhio
          nameSpan.style.display = 'none';
          revealBtn.textContent = '👁️';
        } else {
          // Rivela il nome e cambia occhio
          try {
            revealBtn.textContent = '⏳';

            // Attendiamo il nome utente
            const usernameRivelato = await revealUser(u.id);

            if (usernameRivelato) {
              nameSpan.textContent = escapeHtml(usernameRivelato);
              nameSpan.style.display = 'inline';
              revealBtn.textContent = '🙈';
            } else {
              revealBtn.textContent = '👁️';
            }
          } catch (error) {
            console.error("Errore durante la rivelazione dell'utente:", error);
            revealBtn.textContent = '👁️';
          }
        }
        return;
      }

      // 3. Se si clicca sul resto della riga, si apre il drawer
      openDrawer(d);
    };
    b.appendChild(tr);
  });

  if (count === 0)
    b.innerHTML = '<tr><td colspan="7" class="empty">Nessun documento trovato con i filtri selezionati.</td></tr>';
    // Nota: colspan modificato a 7 perché hai 7 tag <td> nella riga sopra
}

// Renderizza il badge "Filtri attivi: …" sopra la tabella, visibile solo
// quando l'utente ha personalizzato i campi rispetto al default. Cliccando
// sulla × del badge (o sull'ultima pill "Ripristina") si torna ai 6 campi
// predefiniti.
function renderActiveFiltersBar() {
  const bar = document.getElementById("activeFiltersBar");
  if (!bar) return;
  const active = _activeFilterFields;
  // Caso 1: filtri default (mai personalizzati) → niente badge.
  // Caso 2: filtri personalizzati = identici al set di default
  // (impossibile col flusso attuale: applyAdvancedFilters converte questa
  // condizione in `null`, ma lo gestiamo comunque per sicurezza).
  const isDefault =
    !active ||
    (active.length === DEFAULT_HASH_FIELDS.length &&
      DEFAULT_HASH_FIELDS.every((k) => active.includes(k)));
  if (isDefault) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  const labels = active
    .map((key) => {
      const found = FIELDS.find(([k]) => k === key);
      return found ? found[1] : key;
    })
    .filter(Boolean);
  bar.hidden = false;
  bar.innerHTML = `
    <small>Filtri attivi:</small>
    ${labels
      .map(
        (lbl) =>
          `<span class="active-filters-pill">${escapeHtml(lbl)}</span>`
      )
      .join("")}
    <button type="button" class="active-filters-pill" id="resetActiveFiltersBtn"
      title="Torna ai campi predefiniti (Codice Fiscale, Partita IVA, PD External ID, Codice POD, Codice PDR, Data Firma)">
      ↺ Ripristina predefiniti
    </button>
  `;
  const resetBtn = document.getElementById("resetActiveFiltersBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      _activeFilterFields = null;
      _advancedFiltersSnapshot = null;
      render();
      toast("Filtri ripristinati ai campi predefiniti");
    };
  }
}

// Area Staging: gestione delle code di contratti Uno Energy e Postel, con selezione e confronto manuale.
function getStagingCount() {
  return state.queuesigned.length + state.queuearchived.length;
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
      <td>
        <div><small>${podPdrValue(u)}</small></div>
        <div class="repo-origin-pill">Repository: ${escapeHtml(getRecordOriginLabel(u))}</div>
      </td>
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
      <td>
        <div><small>${podPdrValue(p)}</small></div>
        <div class="repo-origin-pill">Repository: ${escapeHtml(getRecordOriginLabel(p))}</div>
      </td>
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
  dot.classList.add("hidden");
}

function updateNotificationDot() {
  const dot = document.getElementById("notificationDot");

  const current = getStagingCount();
  const lastSeen = parseInt(localStorage.getItem("stagingLastSeenCount")) || 0;

  if (current > lastSeen) {
    dot.classList.remove("hidden");
  } else {
    dot.classList.add("hidden");
  }
}

function checkStickyMatch() {
  const el = document.getElementById("stickyMatch");
  if (!el) return;
  const btnCompare = document.getElementById("btnManualMatch");
  const btnAuto = document.getElementById("btnStickyAutoMatch");
  if (selectedUno && selectedPostel) {
    if (commodityIncompatible(selectedUno, selectedPostel)) {
      // Blocco totale: un record Elettrica (POD) e un record Gas (PDR)
      // non possono essere abbinati, né automaticamente né tramite
      // riconciliazione guidata. Disabilitiamo entrambi i tasti invece di
      // lasciare che l'utente li "forzi" tramite l'editor unificato.
      document.getElementById("stickyMatchText").innerHTML =
        `⚠️ <b>${selectedUno.id}</b> ↔ <b>${selectedPostel.id}</b>: abbinamento non consentito. ` +
        `<span>Un record Elettrica (POD) non può essere abbinato a un record Gas (PDR).</span>`;
      el.classList.add("sticky-match-blocked");
      if (btnCompare) btnCompare.disabled = true;
      if (btnAuto) btnAuto.disabled = true;
    } else {
      const conf = confidence(selectedUno, selectedPostel);
      document.getElementById("stickyMatchText").innerHTML =
        `Confronto: <b>${selectedUno.id}</b> ↔ <b>${selectedPostel.id}</b> <br><span>Grado di confidenza: <b>${conf.score}%</b> (${conf.type})</span>`;
      el.classList.remove("sticky-match-blocked");
      if (btnCompare) btnCompare.disabled = false;
      if (btnAuto) btnAuto.disabled = false;
    }
    el.style.display = "flex";
  } else {
    el.classList.remove("sticky-match-blocked");
    el.style.display = "none";
  }
}

// Tenta il match automatico solo per la coppia attualmente selezionata in
// Staging. Accoppia esclusivamente se la confidenza è al 100%, esattamente
// come la logica del pulsante "Match automatico" globale; altrimenti avvisa
// l'utente e lo indirizza al confronto manuale, senza forzare nulla.
function autoMatchSelectedPair() {
  if (!selectedUno || !selectedPostel) {
    logEvent(state, "Tentativo di match automatico senza coppia selezionata");
    return;
  }

  const u = selectedUno,
    p = selectedPostel;
  const uHasValidPde = isValidPdeExternalId(u.pde_external_id);
  const pHasValidPde = isValidPdeExternalId(p.pde_external_id);
  const bothHaveInvalidPde = !uHasValidPde && !pHasValidPde;

  if (bothHaveInvalidPde) {
    const msg = "Match automatico non disponibile: entrambi i record hanno ID esterno PDE non valido.";
    logEvent(state, msg);
    toast(msg);
    return;
  }

  if (commodityIncompatible(u, p)) {
    toast("Abbinamento non consentito: un record Elettrica (POD) non può essere abbinato a un record Gas (PDR).");
    return;
  }
  const conf = confidence(u, p);
  if (conf.score >= 100) {
    state.matched.unshift(finalizeMatch(u, p, "Automatico"));
    state.queuesigned = state.queuesigned.filter((x) => x.id !== u.id);
    state.queuearchived = state.queuearchived.filter((x) => x.id !== p.id);
    state.metrics.auto++;
    logEvent(state, `Match automatico eseguito: ${u.id} + ${p.id} (100%)`);
    selectedUno = null;
    selectedPostel = null;
    checkStickyMatch();
    save();
    render();
    toast("Record abbinati automaticamente (100% di confidenza)");
  } else {
    const msg = `Match automatico non disponibile: confidenza ${conf.score}% (serve 100%).`;
    logEvent(state, msg);
    toast(msg);
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

// Insieme (in memoria, non persistito) degli indici di evento che il DPO
// ha momentaneamente "svelato" con il tasto occhio in questa sessione di
// rendering. Si resetta ad ogni logout/login (privacy by default).
let _revealedEventIdx = new Set();

// ============================================================
// Filtri Avanzati — Consultazione
// ============================================================
// Campi su cui la barra di ricerca "hash" filtra di default (senza filtri
// avanzati applicati). Sono esattamente i campi che la vecchia select
// "Cerca per campo specifico" offriva: Codice Fiscale, Partita IVA, PD
// External ID, Codice POD, Codice PDR, Data Firma. Una ricerca con la
// query vuota restituisce tutto (la query è opzionale, i filtri no).
const DEFAULT_HASH_FIELDS = [
  "cliente_codice_fiscale",
  "cliente_partita_iva",
  "pde_external_id",
  "codice_pod",
  "codice_pdr",
  "data_firma_contratto",
];

// Set corrente dei campi attivi sui quali filtrare la ricerca in
// Consultazione. `null` → uso DEFAULT_HASH_FIELDS. In-memory: si resetta
// al reload della pagina (è una preferenza di vista, non un dato
// applicativo da persistere in localStorage).
let _activeFilterFields = null;

// Snapshot dei campi attivi al momento dell'apertura del popup Filtri
// Avanzati: serve al pulsante "Annulla" per ripristinare la selezione
// precedente senza toccare `_activeFilterFields`. `null` quando il popup
// non è aperto.
let _advancedFiltersSnapshot = null;

function renderEvents() {
  const el = document.getElementById("timelineEvents");
  if (!el) return;
  const isDpo = can("action:audit-rivela");
  el.innerHTML = state.events
    .map((e, i) => {
      const revealed = isDpo && _revealedEventIdx.has(i);
      const label = revealed ? revealUser(e.userId) : maskUser(e.userId);
      const userChip = `<span class="event-user${revealed ? " revealed" : ""}">${escapeHtml(label)}</span>`;
      const eye = isDpo
        ? `<button class="event-eye" data-idx="${i}" title="${revealed ? "Nascondi identità" : "Rivela identità (DPO)"}">${revealed ? "🙈" : "👁"}</button>`
        : "";
      return `<div class="event"><time>${e.time}</time><div>${userChip}${eye}${escapeHtml(e.text)}</div></div>`;
    })
    .join("");
  if (isDpo) {
    el.querySelectorAll(".event-eye").forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute("data-idx"));
        if (_revealedEventIdx.has(idx)) {
          _revealedEventIdx.delete(idx);
        } else {
          _revealedEventIdx.add(idx);
        }
        renderEvents();
      };
    });
  }
}

function openDrawer(d) {
  const dr = document.getElementById("drawer");
  if (!dr) return;
  logEvent(state, `Dettagli documento aperti: ${d.id}`);
  document.getElementById("drawerTitle").innerText = `Dettagli documento ${d.id}`;
  const grid = document.getElementById("drawerMetaGrid");
  grid.innerHTML = "";
  FIELDS.forEach(([k, label]) => {
    if (k === "codice_pod" && isGasRecord(d)) return;
    if (k === "codice_pdr" && !isGasRecord(d)) return;
    if (d[k]) {
      grid.innerHTML += `<div class="meta"><small>${label}</small><b>${d[k]}</b></div>`;
    }
  });
  if (d.tipo_match) {
    grid.innerHTML += `<div class="meta"><small>Tipo abbinamento</small><b>${d.tipo_match}</b></div>`;
    grid.innerHTML += `<div class="meta"><small>Repository di provenienza</small><b>${escapeHtml(getRecordProvenanceLabel(d))}</b></div>`;
    grid.innerHTML += `<div class="meta"><small>Abbinato il</small><b>${d.matched_at}</b></div>`;
  }
  document.getElementById("pdfClientName").innerText = d.cliente_nome_cognome;
  document.getElementById("pdfPodLabel").innerText = isGasRecord(d) ? "Identificativo PDR:" : "Identificativo POD:";
  document.getElementById("pdfPod").innerText = podPdrValue(d);
  document.getElementById("pdfDate").innerText = d.data_firma_contratto || 'N/D';
  dr.classList.add("open");
}

function closeDrawer() {
  logEvent(state, "Dettagli documento chiusi");
  document.getElementById("drawer")?.classList.remove("open");
}

// Snapshot dei valori originali di selectedUno / selectedPostel all'apertura
// del modal di Confronto Riconciliazione guidata. Serve per supportare il
// tasto "Annulla" del footer, che ripristina i record allo stato pre-modifica.
let _reconSnapshot = null;
// Totale FISSO dei campi in mismatch, calcolato una sola volta all'apertura
// del modal. Non va mai ricalcolato durante la sessione di riconciliazione:
// rappresenta il numero di errori originali (Y), che non deve diminuire
// mano a mano che l'utente risolve i singoli campi.
let _reconTotalConflicts = 0;

function openManualCompare() {
  logEvent(state, `Riconciliazione guidata aperta: ${selectedUno.id} ↔ ${selectedPostel.id}`);
  if (!selectedUno || !selectedPostel) return;
  if (commodityIncompatible(selectedUno, selectedPostel)) {
    toast("Abbinamento non consentito: un record Elettrica (POD) non può essere abbinato a un record Gas (PDR).");
    return;
  }
  const m = document.getElementById("modalCompare");
  if (!m) return;
  document.getElementById("compareTitle").innerText = `Riconciliazione guidata: ${selectedUno.id} ↔ ${selectedPostel.id}`;
  const b = document.getElementById("compareDiffGrid");
  b.innerHTML = "";
  // Salva lo stato originale per consentire il rollback completo
  _reconSnapshot = {
    u: { ...selectedUno },
    p: { ...selectedPostel },
  };
  FIELDS.forEach(([k, label]) => {
    if (selectedUno[k] || selectedPostel[k]) {
      const eq = selectedUno[k] === selectedPostel[k];
      const isIgnoredConflict = k === "pde_external_id";
      const cls = isIgnoredConflict || eq ? "" : "changed";
      const safeU = escapeHtml(selectedUno[k] || "—");
      const safeP = escapeHtml(selectedPostel[k] || "—");
      if (isIgnoredConflict || eq) {
        b.innerHTML += `
    <div class="diff ${cls}"><small>${label} (Unoenergy): </small><b>${safeU}</b></div>
    <div class="diff ${cls}"><small>${label} (Postel): </small><b>${safeP}</b></div>
   `;
      } else {
        b.innerHTML += `
    <div class="diff ${cls}" data-key="${k}" data-side="u"><small>${label} (Unoenergy): </small><b>${safeU}</b><button class="btn-edit-mismatch" title="Unifica partendo dal valore Unoenergy" aria-label="Modifica campo Unoenergy" data-source="u">✏️</button></div>
    <div class="diff ${cls}" data-key="${k}" data-side="p"><small>${label} (Postel): </small><b>${safeP}</b><button class="btn-edit-mismatch" title="Unifica partendo dal valore Postel" aria-label="Modifica campo Postel" data-source="p">✏️</button></div>
   `;
      }
    }
  });
  // Delega: click su matita → fondi i due riquadri in un editor viola.
  // Il valore iniziale dell'input è pre-popolato con la sorgente scelta
  // (Uno Energy o Postel) grazie all'attributo data-source sulla matita.
  b.querySelectorAll(".btn-edit-mismatch").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const diff = btn.closest(".diff");
      const key = diff.getAttribute("data-key");
      const source = btn.getAttribute("data-source");
      const side = diff.getAttribute("data-side");
      const diffOther = b.querySelector(`.diff[data-key="${key}"][data-side="${side === "u" ? "p" : "u"}"]`);
      if (!diffOther) return;
      openUnifiedEditor(key, diff, diffOther, source);
    });
  });
  // Numero di CAMPI (non di riquadri: ogni campo in mismatch genera 2
  // riquadri, uno per Unoenergy e uno per Postel) effettivamente in
  // mismatch all'apertura. Questo è il totale "Y" e resta fisso per tutta
  // la sessione di riconciliazione, anche mentre l'utente risolve i campi.
  _reconTotalConflicts = new Set(
    Array.from(b.querySelectorAll(".diff.changed"))
      .map((el) => el.getAttribute("data-key"))
      .filter((key) => key && key !== "pde_external_id")
  ).size;
  renderReconFooter();
  m.classList.add("open");
}

// Mostra/nasconde il footer "Accoppia" + "Annulla" in base allo stato
// dei conflitti. Il tasto "Accoppia" è abilitato solo se TUTTI i campi in
// mismatch sono stati risolti (cioè non ci sono più .diff.changed aperti
// che non siano dentro un editor unificato "confirmed").
function renderReconFooter() {
  const footer = document.getElementById("reconFooter");
  if (!footer) return;
  const grid = document.getElementById("compareDiffGrid");
  // Conta i CAMPI (non i singoli riquadri: ogni campo non risolto ha 2
  // riquadri "changed", uno Unoenergy e uno Postel, con lo stesso
  // data-key) ancora da risolvere. Il campo Pde External ID non va
  // considerato come conflitto di matching e non deve bloccare l'accoppiamento.
  const pending = new Set(
    Array.from(grid.querySelectorAll(".diff.changed"))
      .map((el) => el.getAttribute("data-key"))
      .filter((key) => key && key !== "pde_external_id")
  ).size;
  // Y: totale fisso calcolato all'apertura del modal (vedi openManualCompare).
  // Non va MAI ricalcolato qui, altrimenti decrementerebbe insieme a X ogni
  // volta che un campo viene unificato.
  const totalConflicts = _reconTotalConflicts;
  const btnAccoppia = document.getElementById("reconAccoppia");
  const btnAnnulla = document.getElementById("reconAnnulla");
  const status = document.getElementById("reconStatus");
  if (totalConflicts === 0) {
    footer.style.display = "none";
    return;
  }
  footer.style.display = "flex";
  if (pending === 0) {
    status.textContent = "Tutti i conflitti sono stati risolti. Puoi accoppiare i record.";
    status.className = "recon-status ok";
    btnAccoppia.disabled = false;
  } else {
    status.textContent = `Conflitti da risolvere: ${pending} di ${totalConflicts}. Risolvi tutti i campi in mismatch per abilitare l'accoppiamento.`;
    status.className = "recon-status pending";
    btnAccoppia.disabled = true;
  }
}

// Pannello "Gestione utenti", visibile solo al DPO. Lista utenti demo con
// possibilità di cambiare ruolo tramite una select inline.
function renderUsersPanel() {
  const b = document.getElementById("usersTableBody");
  if (!b) return;
  if (!can("view:utenti")) {
    b.innerHTML = '<tr><td colspan="3" class="empty">Accesso riservato al ruolo DPO.</td></tr>';
    return;
  }
const roles = ["Consultatore", "Tecnico", "DPO"];
  b.innerHTML = state.users
    .map((u) => {
      const roleClass = u.role.toLowerCase();
      const options = roles
        .map((r) => {
          const selected = r === u.role;
          return `
            <button type="button" class="role-dropdown-option role-${r.toLowerCase()}${selected ? " is-selected" : ""}" data-role="${r}">
              <span class="role-dropdown-dot"></span>${r}
              ${selected ? '<span class="role-dropdown-check">✓</span>' : ""}
            </button>
          `;
        })
        .join("");
      const isSelf = state.currentUser?.id === u.id;
      return `
        <tr>
          <td><b>${escapeHtml(u.username)}</b>${isSelf ? ' <small class="pill">tu</small>' : ""}</td>
          <td>
            <div class="role-dropdown" data-user-id="${u.id}">
              <button type="button" class="role-dropdown-trigger role-${roleClass}">
                <span class="role-dropdown-label"><span class="role-dropdown-dot"></span>${escapeHtml(u.role)}</span>
                <span class="role-dropdown-arrow">▾</span>
              </button>
              <div class="role-dropdown-menu">${options}</div>
            </div>
          </td>
          <td><small>${escapeHtml(u.createdAt || "—")}</small></td>
        </tr>
      `;
    })
    .join("");

  b.querySelectorAll(".role-dropdown").forEach((dropdown) => {
    const userId = dropdown.getAttribute("data-user-id");
    const trigger = dropdown.querySelector(".role-dropdown-trigger");

    trigger.onclick = (e) => {
      e.stopPropagation();
      const willOpen = !dropdown.classList.contains("open");
      closeAllRoleDropdowns();
      dropdown.classList.toggle("open", willOpen);
    };

    dropdown.querySelectorAll(".role-dropdown-option").forEach((opt) => {
      opt.onclick = (e) => {
        e.stopPropagation();
        const newRole = opt.getAttribute("data-role");
        const ok = changeUserRole(userId, newRole);
        if (ok) {
          toast(`Ruolo aggiornato per ${findUserById(userId)?.username || userId}`);
          render();
        } else {
          toast("Impossibile aggiornare il ruolo");
          closeAllRoleDropdowns();
        }
      };
    });
  });
}

function closeAllRoleDropdowns() {
  document.querySelectorAll(".role-dropdown.open").forEach((el) => el.classList.remove("open"));
}
document.addEventListener("click", closeAllRoleDropdowns);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  // Chiudi prima il popup Filtri Avanzati se aperto (ha priorità sul
  // dropdown utenti perché è un overlay modale che blocca l'interazione).
  if (document.getElementById("modalAdvancedFilters")?.classList.contains("open")) {
    cancelAdvancedFilters();
    return;
  }
  closeAllRoleDropdowns();
});

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Apre l'editor unificato per un campo in mismatch: sostituisce i due
// riquadri (Uno Energy + Postel) con un singolo blocco viola che mostra il
// valore scelto e permette la modifica inline. Premendo "Applica" il valore
// viene propagato su entrambi i record in staging e la confidenza ricalcolata.
// `source` indica quale lato ha generato la matita cliccata: "u" → pre-popola
// con il valore Uno Energy, "p" → pre-popola con il valore Postel.
function openUnifiedEditor(key, diffUno, diffPostel, source = "u") {
  const label = diffUno.querySelector("small").textContent.replace(/\s*\(Unoenergy\):\s*$/, "");
  const valU = selectedUno[key] ?? "";
  const valP = selectedPostel[key] ?? "";
  // Default: il valore del lato da cui l'utente ha cliccato la matita
  const initial = source === "p" ? (valP || valU || "") : (valU || valP || "");
  const wrapper = document.createElement("div");
  wrapper.className = "diff diff-merged";
  wrapper.setAttribute("data-key", key);
  wrapper.innerHTML = `
    <small>${escapeHtml(label)} (campo unificato)</small>
    <div class="diff-merged-row">
      <input type="text" class="diff-merged-input" value="${escapeHtml(initial)}" />
      <button class="diff-merged-apply" type="button">Applica</button>
      <button class="diff-merged-cancel ghost" type="button">Annulla</button>
    </div>
    <div class="diff-merged-hint">Valore attuale: Unoenergy = <b>${escapeHtml(valU || "—")}</b> · Postel = <b>${escapeHtml(valP || "—")}</b></div>
  `;
  // Sostituisci i due riquadri consecutivi con quello unico
  diffPostel.replaceWith(wrapper);
  diffUno.remove();

  const input = wrapper.querySelector(".diff-merged-input");
  input.focus();
  input.select();

  wrapper.querySelector(".diff-merged-cancel").addEventListener("click", () => {
    // Ripristina la coppia originale dei due riquadri in mismatch.
    // diffPostel era stato rimosso dal DOM, quindi reinseriamo prima lui
    // e poi diffUno prima di diffPostel per ripristinare l'ordine.
    wrapper.replaceWith(diffPostel);
    diffPostel.parentNode?.insertBefore(diffUno, diffPostel);
    // Ri-aggancia i listener delle matite su entrambi i riquadri ripristinati
    wirePencilButton(diffUno, key);
    wirePencilButton(diffPostel, key);
    renderReconFooter();
  });

  wrapper.querySelector(".diff-merged-apply").addEventListener("click", () => {
    const newVal = input.value;
    // Aggiorna i record in staging in-place (riferimenti mantenuti)
    selectedUno[key] = newVal;
    selectedPostel[key] = newVal;
    // Aggiorna la sticky match bar con la nuova confidenza. NON salvare qui:
    // le modifiche restano solo in memoria finché non si preme "Accoppia
    // record". Se il modal viene chiuso senza accoppiare, closeModal() le
    // scarta ripristinando lo snapshot originale.
    checkStickyMatch();
    toast(`Campo "${label}" unificato (provvisorio, non ancora salvato)`);
    // Trasforma il riquadro unificato in modalità "confermato" viola
    wrapper.classList.add("confirmed");
    wrapper.innerHTML = `
      <small>${escapeHtml(label)} (campo unificato)</small>
      <b>${escapeHtml(newVal || "—")}</b>
      <div class="diff-merged-hint">✅ Valore unificato applicato a entrambi i record</div>
    `;
    renderReconFooter();
  });
}

// Aggancia il listener della matita ✏️ su un riquadro appena ricreato (es.
// dopo "Annulla" dell'editor unificato). `key` è la chiave del campo.
function wirePencilButton(diffEl, key) {
  const btn = diffEl.querySelector(".btn-edit-mismatch");
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const side = diffEl.getAttribute("data-side");
    const source = btn.getAttribute("data-source");
    const grid = document.getElementById("compareDiffGrid");
    const otherSide = side === "u" ? "p" : "u";
    const diffOther = grid.querySelector(`.diff[data-key="${key}"][data-side="${otherSide}"]`);
    if (diffOther) openUnifiedEditor(key, diffEl, diffOther, source);
  });
}

// Annulla TUTTE le modifiche fatte nel modal di riconciliazione guidata,
// ripristinando i valori originali dei record in staging dallo snapshot
// salvato all'apertura. Chiude inoltre il modal.
function reconAnnullaTutto() {
  if (!_reconSnapshot) {
    closeModal();
    return;
  }
  // Ripristina i valori originali sui record in staging
  Object.assign(selectedUno, _reconSnapshot.u);
  Object.assign(selectedPostel, _reconSnapshot.p);
  _reconSnapshot = null;
  checkStickyMatch();
  save();
  closeModal();
  toast("Modifiche annullate: record ripristinati allo stato iniziale");
}

function closeModal() {
  // Se il modal viene chiuso (es. tasto X) senza aver premuto "Accoppia
  // record", eventuali campi unificati con "Applica" non sono mai stati
  // salvati: scartiamo le modifiche ripristinando i record in staging allo
  // stato originale catturato in _reconSnapshot. Quando invece si conferma
  // l'accoppiamento, _reconSnapshot viene azzerato prima di chiamare
  // closeModal(), quindi qui non scatta alcun ripristino.
  if (_reconSnapshot && selectedUno && selectedPostel) {
    Object.assign(selectedUno, _reconSnapshot.u);
    Object.assign(selectedPostel, _reconSnapshot.p);
    checkStickyMatch();
  }
  document.getElementById("modalCompare")?.classList.remove("open");
  _reconSnapshot = null;
  const footer = document.getElementById("reconFooter");
  if (footer) footer.style.display = "none";
}

// ============================================================
// Filtri Avanzati (Consultazione) — gestione popup
// ============================================================
// Apre il popup Filtri Avanzati e renderizza la lista di checkbox a
// partire dall'array FIELDS. Le checkbox pre-spuntabili corrispondono a
// _activeFilterFields (o a DEFAULT_HASH_FIELDS se l'utente non ha mai
// personalizzato). Salva uno snapshot in _advancedFiltersSnapshot per
// supportare il tasto "Annulla".
function openAdvancedFilters() {
  const modal = document.getElementById("modalAdvancedFilters");
  const list = document.getElementById("advancedFiltersList");
  if (!modal || !list) return;
  const current = _activeFilterFields || DEFAULT_HASH_FIELDS;
  _advancedFiltersSnapshot = new Set(current);
  list.innerHTML = FIELDS.map(
    ([key, label]) => `
      <label class="checkbox-row">
        <input type="checkbox" data-field="${escapeHtml(key)}" ${current.includes(key) ? "checked" : ""} />
        <span>${escapeHtml(label)}</span>
      </label>
    `
  ).join("");
  modal.classList.add("open");
}

// Legge le checkbox spuntate nel popup e applica il filtro.
// Se l'utente ha spuntato esattamente i 6 campi di default (stesso set,
// stesso ordine) → annulliamo la personalizzazione e torniamo a
// _activeFilterFields = null (= usa DEFAULT_HASH_FIELDS), in modo che il
// badge filtri attivi scompaia.
function applyAdvancedFilters() {
  const list = document.getElementById("advancedFiltersList");
  if (!list) return;
  const checked = Array.from(list.querySelectorAll("input:checked"))
    .map((el) => el.getAttribute("data-field"))
    .filter(Boolean);
  const isDefault =
    checked.length === DEFAULT_HASH_FIELDS.length &&
    DEFAULT_HASH_FIELDS.every((k) => checked.includes(k));
  _activeFilterFields = isDefault ? null : checked;
  _advancedFiltersSnapshot = null;
  document.getElementById("modalAdvancedFilters")?.classList.remove("open");
  render();
  toast(
    isDefault
      ? "Filtri ripristinati ai campi predefiniti"
      : `Filtri applicati su ${checked.length} campo${checked.length === 1 ? "" : "i"}`
  );
}

// Chiude il popup senza applicare le modifiche fatte dall'utente.
// Ripristina _activeFilterFields allo snapshot catturato all'apertura.
// Le modifiche alle checkbox sono solo visive, non hanno toccato lo
// stato persistente, quindi basta azzerare lo snapshot.
function cancelAdvancedFilters() {
  // Lo snapshot non viene riapplicato: _activeFilterFields non è mai
  // stato modificato durante l'editing, quindi "Annulla" significa solo
  // "chiudi senza salvare".
  _advancedFiltersSnapshot = null;
  document.getElementById("modalAdvancedFilters")?.classList.remove("open");
}

// Risposta al tasto "Ripristina predefiniti" dentro il popup: ri-spunta
// le 6 checkbox di default e deseleziona tutte le altre. Non chiude il
// popup, l'utente deve ancora premere "Applica" per confermare.
function resetAdvancedFiltersToDefault() {
  const list = document.getElementById("advancedFiltersList");
  if (!list) return;
  list.querySelectorAll("input[type=checkbox]").forEach((el) => {
    el.checked = DEFAULT_HASH_FIELDS.includes(el.getAttribute("data-field"));
  });
}

function getManualRecord() {
  const form = document.getElementById("manualForm");
  if (!form) return null;
  const r = { id: `UNO-${Math.floor(1000 + Math.random() * 9000)}`, origin_repo: "Inserimento manuale" };
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
  // Dati anagrafici/di stato/di data: randomizzati ad ogni invocazione del
  // bottone "Inserisci dati demo" per evitare record demo tutti identici.
  const dataFirma = randomDateInLastYear();
  const dataCertificazione = randomDateOnOrAfter(dataFirma);
  return {
    cliente_nome_cognome: randomNomeCognome(),
    cliente_codice_fiscale: randomCodiceFiscale(),
    cliente_partita_iva: randomPartitaIva(),
    data_firma_contratto: dataFirma,
    codice_pod: isGas ? "" : randomPod(),
    codice_pdr: isGas ? randomPdr() : "",
    contract_account: `ACC-${Math.floor(10000 + Math.random() * 90000)}`,
    pde_external_id: `PDE-${Math.floor(100000 + Math.random() * 900000)}`,
    commodity: isGas ? "Gas naturale" : "Energia Elettrica",
    cliente_codice_identificativo_univoco: `IDU-${Math.floor(1000 + Math.random() * 9000)}`,
    cliente_record_type_testuale: pickRandom(["Retail", "Business"]),
    opportunita_tipo_record: pickRandom(["Switch", "Nuova attivazione"]),
    opportunita_id: `OPP-${Math.floor(10000 + Math.random() * 90000)}`,
    id_forniture: `02${randomAlnum(14)}`,
    opportunita_nome: randomNomeOpportunita(),
    opportunita_commodity: isGas ? "Gas" : "Power",
    codice_prodotto_ee: isGas ? "" : "FIX_LIGHT_2026",
    codice_prodotto_gas: isGas ? "GAS_EASY_2026" : "",
    stato: pickRandom(["Attivo", "Sospeso", "Chiuso"]),
    data_certificazione: dataCertificazione,
  };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAlnum(len) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function randomDigits(len) {
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
}

function randomDateInLastYear() {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);
  const ts = oneYearAgo.getTime() + Math.random() * (now.getTime() - oneYearAgo.getTime());
  return new Date(ts).toISOString().split("T")[0];
}

// Data casuale in formato YYYY-MM-DD compresa fra `startISO` (incluso) e oggi
// (incluso). Usata per garantire data_certificazione ≥ data_firma_contratto.
function randomDateOnOrAfter(startISO) {
  const start = new Date(startISO + "T00:00:00");
  const now = new Date();
  const startClamped = start > now ? now : start;
  const ts = startClamped.getTime() + Math.random() * (now.getTime() - startClamped.getTime());
  return new Date(ts).toISOString().split("T")[0];
}

// POD reale italiano: prefisso "IT001E" + 8 cifre (es. "IT001E12345678").
function randomPod() {
  return "IT001E" + randomDigits(8);
}

// PDR reale italiano: 14 cifre (es. "44445555666677").
function randomPdr() {
  return randomDigits(14);
}

function randomNomeCognome() {
  const nomi = ["Alessandro", "Maria", "Giulia", "Francesco", "Luca", "Sofia", "Andrea", "Chiara", "Matteo", "Elena", "Davide", "Federica"];
  const cognomi = ["Rossi", "Bianchi", "Romano", "Ferrari", "Esposito", "Russo", "Bruno", "Greco", "Costa", "De Luca", "Conti", "Marino"];
  return `${pickRandom(nomi)} ${pickRandom(cognomi)}`;
}

function randomCodiceFiscale() {
  // Schema non validato fiscalmente: 6 lettere + 2 cifre + 1 lettera + 2 cifre + 1 lettera + 3 cifre + 1 lettera (16 caratteri).
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const cons = (n) => Array.from({ length: n }, () => LETTERS.charAt(Math.floor(Math.random() * LETTERS.length))).join("");
  const dig = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
  return cons(6) + dig(2) + cons(1) + dig(2) + cons(1) + dig(3) + cons(1);
}

function randomPartitaIva() {
  // 11 cifre; la cifra di controllo (11ª) è calcolata col metodo Luhn-like
  // semplificato usato dall'Agenzia delle Entrate: somma pesata sui 10 digit.
  let base = "";
  for (let i = 0; i < 10; i++) base += Math.floor(Math.random() * 10);
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const d = parseInt(base[i], 10);
    sum += (i % 2 === 0) ? d : (d * 2 > 9 ? d * 2 - 9 : d * 2);
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

function randomNomeOpportunita() {
  const prefissi = ["Migrazione", "Attivazione", "Switch", "Subentro", "Voltura"];
  const tipologie = ["Business", "Retail", "PMI", "Condominio", "Residenziale"];
  return `${pickRandom(prefissi)} ${pickRandom(tipologie)} ${pickRandom(["EE", "GAS", "Dual"])}`;
}
// --- Gestione visuale "Repository attive" (solo demo, nessun salvataggio) ---
const repoManaged = [
  { id: "uno", name: "Unoenergy", active: true, category: "Unoenergy" },
  { id: "postel1", name: "Postel1", active: true, category: "Postel" },
  { id: "postel2", name: "Postel2", active: false, category: "Postel" },
];

function getRepoCategory(repo) {
  const name = (repo?.name || "").toLowerCase();
  return name.includes("postel") ? "Postel" : "Unoenergy";
}

function getActiveRepoCount() {
  return repoManaged.filter((r) => r.active).length;
}

function getActiveRepoCountByCategory(category) {
  return repoManaged.filter((r) => r.active && getRepoCategory(r) === category).length;
}

function hasRequiredRepoSelection() {
  return getActiveRepoCountByCategory("Postel") >= 1 && getActiveRepoCountByCategory("Unoenergy") >= 1;
}

// Disegna il riquadro principale nella sidebar, mostrando solo i repository attivi
function renderRepoStatusList() {
  const list = document.getElementById("repoStatusList");
  if (!list) return;
  const activeRepos = repoManaged.filter((r) => r.active);
  if (activeRepos.length === 0) {
    list.innerHTML = '<div class="flow-status"><span class="dot red"></span> Nessun repository attivo</div>';
    return;
  }
  list.innerHTML = activeRepos
    .map(
      (r) => `<div class="flow-status"><span class="dot green"></span> ${r.name}</div>`
    )
    .join("");
}

// Disegna il pannello di gestione con le righe cliccabili per attivare/disattivare
function renderRepoTogglePanel() {
  const list = document.getElementById("repoToggleList");
  if (!list) return;

  const grouped = [
    { title: "Postel", items: repoManaged.filter((r) => getRepoCategory(r) === "Postel") },
    { title: "Unoenergy", items: repoManaged.filter((r) => getRepoCategory(r) === "Unoenergy") },
  ];

  list.innerHTML = grouped
    .map((group) => {
      const itemsMarkup = group.items
        .map((r) => {
          const isActive = r.active;
          const stateLabel = isActive ? "Attivo" : "Non attivo";
          return `
            <button
              type="button"
              class="repo-toggle-row"
              data-repo="${r.id}"
            >
              <span class="dot ${isActive ? "green" : "red"}"></span>
              <span class="repo-toggle-name">${r.name}</span>
              <span class="repo-toggle-state">${stateLabel}</span>
            </button>
          `;
        })
        .join("");

      return `
        <div class="repo-toggle-section">
          <div class="repo-toggle-section-title">${group.title}</div>
          ${itemsMarkup}
        </div>
      `;
    })
    .join("");

  list.querySelectorAll(".repo-toggle-row").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-repo");
      const repo = repoManaged.find((r) => r.id === id);
      if (!repo) return;

      const category = getRepoCategory(repo);
      const otherCategory = category === "Postel" ? "Unoenergy" : "Postel";
      const activeInCategory = getActiveRepoCountByCategory(category);
      const activeInOtherCategory = getActiveRepoCountByCategory(otherCategory);

      if (repo.active) {
        if (activeInCategory <= 1 || activeInOtherCategory <= 0) {
          toast("Serve almeno un repository attivo per ciascuna categoria.");
          return;
        }
        repo.active = false;
      } else {
        if (activeInOtherCategory <= 0) {
          toast("Serve almeno un repository attivo per entrambe le categorie.");
          return;
        }

        if (activeInCategory >= 1) {
          repoManaged.forEach((item) => {
            if (getRepoCategory(item) === category && item.active) {
              item.active = false;
            }
          });
        }
        repo.active = true;
      }
      logEvent(state, `Repository ${repo.name} ${repo.active ? "attivato" : "disattivato"}`);
      if (!hasRequiredRepoSelection()) {
        toast("Seleziona almeno un repository Postel e uno Unoenergy.");
        return;
      }

      renderRepoTogglePanel();
      renderRepoStatusList();
    };
  });
}

function toggleRepoPanel(forceState) {
  const panel = document.getElementById("repoTogglePanel");
  if (!panel) return;
  const shouldOpen = typeof forceState === "boolean" ? forceState : !panel.classList.contains("open");
  panel.classList.toggle("open", shouldOpen);
  if (shouldOpen) renderRepoTogglePanel();
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
  renderRepoStatusList();

  document.getElementById("repoCard").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleRepoPanel();
  });
  document.getElementById("repoTogglePanel").addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => toggleRepoPanel(false));
  if (state.dark) {
    document.body.classList.add("dark");
    document.getElementById("themeToggle").innerHTML = "☀️ White mode";
  } else {
    document.body.classList.remove("dark");
    document.getElementById("themeToggle").innerHTML = "🌙 Dark mode";
  }

  initData();

  // --- Ruoli: mostra login se non c'è una sessione attiva ---
  if (!state.currentUser) {
    showLoginOverlay();
  } else {
    hideLoginOverlay();
  }
  document.getElementById("loginForm")?.addEventListener("submit", handleLoginSubmit);
  document.getElementById("loginSubmitBtn")?.addEventListener("click", handleLoginSubmit);

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.onclick = () => {
      // Difesa in profondità: non permettere di entrare in una vista per cui
      // il ruolo corrente non ha permesso, anche se il bottone fosse forzato
      // visibile via DevTools.
      const target = btn.getAttribute("data-view");
      const viewPerm = { staging: "view:staging", manuale: "view:manuale", users: "view:utenti" }[target];
      if (viewPerm && !can(viewPerm)) {
        toast("Permesso negato: il tuo ruolo non può accedere a questa sezione");
        return;
      }
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
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
        const records = parseCSV(reader.result);

        // Check for duplicate PD External IDs in consultation
        let hasDuplicate = false;
        let duplicateId = null;

        for (const record of records) {
          const pdeExternalId = record.pde_external_id;
          if (pdeExternalId && pdeExternalId.trim() !== "" &&
            pdeExternalId.trim() !== "null" && pdeExternalId.trim() !== "undefined") {

            const trimmedId = pdeExternalId.trim();
            const existingRecord = state.matched.find(r =>
              r.pde_external_id &&
              r.pde_external_id.trim() === trimmedId
            );

            if (existingRecord) {
              hasDuplicate = true;
              duplicateId = trimmedId;
              break;
            }
          }
        }

        if (hasDuplicate) {
          // Show error and log the event
          const errorMsg = `Errore: Documento con PD External ID "${duplicateId}" già presente in consultazione. Il file non è stato caricato.`;
          toast(errorMsg);
          logEvent(state, errorMsg);
          return; // Exit without loading the file
        }

        // No duplicates found, proceed with normal loading
        state.queuesigned.push(...records);
        state.lastUnoId = records[records.length - 1].id;
        logEvent(state, `File caricato: ${records.length} contratti aggiunti in Staging`);
        save();
        render();
        toast(`${records.length} contratti inseriti nello Staging`);
      } catch (err) {
        toast("Errore nel CSV: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  document.getElementById("btnPostel").onclick = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xml';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const xmlText = e.target.result;
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, "text/xml");

          // 1. Selezioniamo TUTTI i blocchi <info> presenti nell'XML
          const infoNodes = xmlDoc.querySelectorAll("info");
          
          if (infoNodes.length === 0) {
            toast("Nessun record valido trovato nel file XML.");
            return;
          }

          let recordContatore = 0;

          // 2. Iteriamo su ciascun nodo trovato (creando più istanze/record)
          infoNodes.forEach((infoNode) => {
            const record = {};

            // Estrarre i campi cercando RELATIVAMENTE a ciascun singolo "infoNode"
            record.cliente_nome_cognome = infoNode.querySelector("cliente_nome_cognome")?.textContent ||
              infoNode.querySelector("ClienteNomeCognome")?.textContent ||
              infoNode.querySelector("nome_cognome")?.textContent ||
              "Cliente da XML";

            record.cliente_codice_fiscale = infoNode.querySelector("cliente_codice_fiscale")?.textContent ||
              infoNode.querySelector("CodiceFiscale")?.textContent ||
              infoNode.querySelector("codice_fiscale")?.textContent || "";

            record.cliente_partita_iva = infoNode.querySelector("cliente_partita_iva")?.textContent ||
              infoNode.querySelector("PartitaIVA")?.textContent ||
              infoNode.querySelector("partita_iva")?.textContent || "";

            record.data_firma_contratto = infoNode.querySelector("data_firma_contratto")?.textContent ||
              infoNode.querySelector("DataFirmaContratto")?.textContent ||
              infoNode.querySelector("data_firma")?.textContent ||
              new Date().toISOString().split('T')[0];

            record.codice_pod = infoNode.querySelector("codice_pod")?.textContent ||
              infoNode.querySelector("CodicePOD")?.textContent ||
              infoNode.querySelector("codice_pod")?.textContent || "";

            record.codice_pdr = infoNode.querySelector("codice_pdr")?.textContent ||
              infoNode.querySelector("CodicePDR")?.textContent ||
              infoNode.querySelector("codice_pdr")?.textContent || "";

            record.contract_account = infoNode.querySelector("contract_account")?.textContent ||
              infoNode.querySelector("ContractAccount")?.textContent ||
              infoNode.querySelector("contract_account")?.textContent || "";

            record.pde_external_id = infoNode.querySelector("pde_external_id")?.textContent ||
              infoNode.querySelector("PdeExternalId")?.textContent ||
              infoNode.querySelector("pde_external_id")?.textContent || "";

            record.commodity = infoNode.querySelector("commodity")?.textContent ||
              infoNode.querySelector("Commodity")?.textContent ||
              ((record.codice_pdr && !record.codice_pod) ? "Gas naturale" : "Energia Elettrica");

            record.cliente_codice_identificativo_univoco = infoNode.querySelector("cliente_codice_identificativo_univoco")?.textContent ||
              infoNode.querySelector("CodiceIdentificativoUnivoco")?.textContent ||
              infoNode.querySelector("cliente_codice_identificativo_univoco")?.textContent || "";

            record.cliente_record_type_testuale = infoNode.querySelector("cliente_record_type_testuale")?.textContent ||
              infoNode.querySelector("RecordTypeTestuale")?.textContent ||
              infoNode.querySelector("cliente_record_type_testuale")?.textContent || "Retail";

            record.opportunita_tipo_record = infoNode.querySelector("opportunita_tipo_record")?.textContent ||
              infoNode.querySelector("TipoRecordOpportunita")?.textContent ||
              infoNode.querySelector("opportunita_tipo_record")?.textContent || "Switch";

            record.opportunita_id = infoNode.querySelector("opportunita_id")?.textContent ||
              infoNode.querySelector("OpportunitaID")?.textContent ||
              infoNode.querySelector("opportunita_id")?.textContent || "";

            record.opportunita_nome = infoNode.querySelector("opportunita_nome")?.textContent ||
              infoNode.querySelector("OpportunitaNome")?.textContent ||
              infoNode.querySelector("opportunita_nome")?.textContent || "Opportunità da XML";

            record.opportunita_commodity = infoNode.querySelector("opportunita_commodity")?.textContent ||
              infoNode.querySelector("OpportunitaCommodity")?.textContent ||
              infoNode.querySelector("opportunita_commodity")?.textContent || "Power";

            record.codice_prodotto_ee = infoNode.querySelector("codice_prodotto_ee")?.textContent ||
              infoNode.querySelector("CodiceProdottoEE")?.textContent ||
              infoNode.querySelector("codice_prodotto_ee")?.textContent || "";

            record.codice_prodotto_gas = infoNode.querySelector("codice_prodotto_gas")?.textContent ||
              infoNode.querySelector("CodiceProdottoGAS")?.textContent ||
              infoNode.querySelector("codice_prodotto_gas")?.textContent || "";

            record.stato = infoNode.querySelector("stato")?.textContent ||
              infoNode.querySelector("Stato")?.textContent ||
              infoNode.querySelector("stato")?.textContent || "Attivo";

            record.data_certificazione = infoNode.querySelector("data_certificazione")?.textContent ||
              infoNode.querySelector("DataCertificazione")?.textContent ||
              infoNode.querySelector("data_certificazione")?.textContent ||
              new Date().toISOString().split('T')[0];

            // Generazione ID per questa specifica istanza
            record.id = `POS-${Math.floor(2000 + Math.random() * 9000)}`;
            record.origin_repo = getDefaultOriginRepo("Postel");

            // Controllo validità external ID
            const hasValidExternalId = record.pde_external_id &&
              record.pde_external_id.trim() !== "" &&
              record.pde_external_id.trim() !== "null" &&
              record.pde_external_id.trim() !== "undefined";

          if (hasValidExternalId) {
            const trimmedId = record.pde_external_id.trim();
            // Il duplicato va cercato ovunque il documento possa già
            // trovarsi: sia tra i record già abbinati in consultazione
            // (state.matched), sia tra quelli ancora in Staging Postel non
            // abbinati (state.queuearchived). Senza questo secondo controllo,
            // importare due volte lo stesso file XML prima che il primo
            // documento venga abbinato non verrebbe mai intercettato.
            const existingInConsultazione = state.matched.find(r =>
              r.pde_external_id && r.pde_external_id.trim() === trimmedId
            );
            const existingInStaging = state.queuearchived.find(r =>
              r.pde_external_id && r.pde_external_id.trim() === trimmedId
            );
            const existingRecord = existingInConsultazione || existingInStaging;

            if (existingRecord) {
              // Document with same PD external ID already exists
              const dove = existingInConsultazione ? "in consultazione" : "nello Staging Postel";
              const errorMsg = `Errore: Documento con PD External ID "${record.pde_external_id}" già presente ${dove}. Il file non è stato caricato.`;
              toast(errorMsg);
              logEvent(state, errorMsg);
              save();
              return; // Exit without inserting
            }

              const lastUno = state.queuesigned[state.queuesigned.length - 1];
              let matchRecord;

              if (lastUno) {
                matchRecord = finalizeMatch(lastUno, record, "Automatico (da XML con ID valido)");
                state.matched.unshift(matchRecord);
                state.metrics.auto++;
                logEvent(state, `Record XML con ID valido andato direttamente in consultazione: ${matchRecord.id}`);
              } else {
                const unoRecord = {
                  id: `UNO-${Math.floor(1000 + Math.random() * 9000)}`,
                  cliente_nome_cognome: record.cliente_nome_cognome,
                  cliente_codice_fiscale: record.cliente_codice_fiscale,
                  cliente_partita_iva: record.cliente_partita_iva,
                  data_firma_contratto: record.data_firma_contratto,
                  codice_pod: record.codice_pod,
                  codice_pdr: record.codice_pdr,
                  contract_account: record.contract_account,
                  pde_external_id: record.pde_external_id,
                  commodity: record.commodity,
                  cliente_codice_identificativo_univoco: record.cliente_codice_identificativo_univoco,
                  cliente_record_type_testuale: record.cliente_record_type_testuale,
                  opportunita_tipo_record: record.opportunita_tipo_record,
                  opportunita_id: record.opportunita_id,
                  opportunita_nome: record.opportunita_nome,
                  opportunita_commodity: record.opportunita_commodity,
                  codice_prodotto_ee: record.codice_prodotto_ee,
                  codice_prodotto_gas: record.codice_prodotto_gas,
                  stato: record.stato,
                  data_certificazione: record.data_certificazione
                };

                matchRecord = finalizeMatch(unoRecord, record, "Automatico (da XML con ID valido)");
                state.matched.unshift(matchRecord);
                state.metrics.auto++;
                logEvent(state, `Record XML con ID valido andato direttamente in consultazione (con Uno generato): ${matchRecord.id}`);
              }
            } else {
              // Invio allo Staging
              state.queuearchived.push(record);
              state.lastPostelId = record.id;
            }

            recordContatore++;
          });

          // 3. Salviamo lo stato globale e aggiorniamo la UI solo UNA volta, alla fine del ciclo
          save();
          render();
          toast(`Elaborazione completata con successo. Inseriti ${recordContatore} record.`);

        } catch (err) {
          toast("Errore nel parsing del file XML: " + err.message);
          console.error(err);
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
};

  document.getElementById("btnAutoMatch").onclick = () => {
    const count = autoMatchAll();
    save();
    render();
    if (count > 0) toast(`Match automatico: ${count} contratti abbinati`);
    else toast("Nessuna corrispondenza automatica (confidenza 100%) trovata nello staging");
  };

  document.getElementById("closeDrawer").onclick = closeDrawer;
  document.getElementById("resetDemo").onclick = () => {
    logEvent(state, "Dati demo ripristinati");
    localStorage.removeItem("dockbridgePremiumState");
    location.reload();
  };
  document.getElementById("closeModal").onclick = closeModal;
  // Footer del modal di Riconciliazione guidata
  document.getElementById("reconAnnulla").onclick = reconAnnullaTutto;
  document.getElementById("reconAccoppia").onclick = () => {
    if (document.getElementById("reconAccoppia").disabled) return;
    if (commodityIncompatible(selectedUno, selectedPostel)) {
      toast("Abbinamento non consentito: un record Elettrica (POD) non può essere abbinato a un record Gas (PDR).");
      return;
    }
    _reconSnapshot = null; // le modifiche sono confermate, non servono più
    closeModal();
    manualMatch(selectedUno, selectedPostel);
  };
  document.getElementById("btnStickyAutoMatch").onclick = autoMatchSelectedPair;

  // Barra di ricerca Consultazione: filtro live. Il popup "Filtri
  // Avanzati" gestisce la multi-selezione dei campi in modo separato
  // (vedi openAdvancedFilters/applyAdvancedFilters).
  document.getElementById("docSearch")?.addEventListener("input", render);
  document.getElementById("stagingSearch")?.addEventListener("input", render);

  // Popup Filtri Avanzati
  document.getElementById("btnAdvancedFilters")?.addEventListener("click", openAdvancedFilters);
  document.getElementById("advancedFiltersApply")?.addEventListener("click", applyAdvancedFilters);
  document.getElementById("advancedFiltersCancel")?.addEventListener("click", cancelAdvancedFilters);
  document.getElementById("advancedFiltersReset")?.addEventListener("click", resetAdvancedFiltersToDefault);
  // Chiudi cliccando sul backdrop del modal Filtri Avanzati (= Annulla).
  document.getElementById("modalAdvancedFilters")?.addEventListener("click", (e) => {
    if (e.target.id === "modalAdvancedFilters") cancelAdvancedFilters();
  });

  function syncManualCommodityFields(isGas, clearValues) {
    const podPdrInput = document.getElementById("f_codice_pod_pdr");
    const podPdrLabel = document.getElementById("f_codice_pod_pdr_label");
    const prodottoInput = document.getElementById("f_codice_prodotto");
    const prodottoLabel = document.getElementById("f_codice_prodotto_label");
    if (!podPdrInput || !prodottoInput) return;
    podPdrInput.name = isGas ? "codice_pdr" : "codice_pod";
    podPdrLabel.innerText = isGas ? "Codice PDR" : "Codice POD";
    prodottoInput.name = isGas ? "codice_prodotto_gas" : "codice_prodotto_ee";
    prodottoLabel.innerText = isGas ? "Prodotto GAS" : "Prodotto EE";
    if (clearValues) {
      podPdrInput.value = "";
      prodottoInput.value = "";
    }
  }

  document.getElementById("f_commodity")?.addEventListener("change", (e) => {
    syncManualCommodityFields(e.target.value === "Gas naturale", false);
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
    const isGas = r.commodity === "Gas naturale";
    document.getElementById("f_commodity").value = r.commodity;
    syncManualCommodityFields(isGas, false);
    FIELDS.forEach(([k]) => {
      const el = document.querySelector(`[name="${k}"]`);
      if (el) el.value = r[k] || "";
    });
    logEvent(state, "Compilati i campi manuali con dati demo");
  };

  render();
});

const dot = document.getElementById("notificationDot");
const btn = document.getElementById("stagingBtn");

// chiave per salvare stato
const STORAGE_KEY = "stagingLastSeen";
const UPDATE_KEY = "stagingLastUpdate";

// 1. inizializza aggiornamento (simulato)
if (!localStorage.getItem(UPDATE_KEY)) {
  localStorage.setItem(UPDATE_KEY, Date.now());
}

// 2. controlla se mostrare il pallino
function checkNotification() {
  const lastSeen = localStorage.getItem(STORAGE_KEY);
  const lastUpdate = localStorage.getItem(UPDATE_KEY);

  if (!lastSeen || lastUpdate > lastSeen) {
    dot.classList.remove("hidden");
  } else {
    dot.classList.add("hidden");
  }
}

// 3. quando l'utente entra nello staging
btn.addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEY, Date.now());
  dot.classList.add("hidden");

  // qui vai alla pagina staging
  console.log("entra in staging");
});

// 4. simula aggiornamento (per demo)
function simulateUpdate() {
  localStorage.setItem(UPDATE_KEY, Date.now());
  checkNotification();
}

// inizializza
checkNotification();

// opzionale: bottone demo o trigger manuale
window.simulateUpdate = simulateUpdate;