const LS_KEY = "rotina_v2";

/**
 * Normal (seu cenário):
 * Seg/Qua/Qui/Sex 19:30–22:00 = 150min/dia * 4 = 600min/sem
 * Plantão: modo manutenção (ex: 200min/sem)
 */
const DEFAULT_STATE = {
  week: 1,
  cycleStart: "",            // "YYYY-MM-DD" (segunda) para calcular semana por data
  oncallWeeks: "4,8,12",
  availNormalMin: 600,
  availOncallMin: 200,
  weeklyPlan: "",
  timers: {
    // "Inglês – Input": { seconds: 0, running: false, startedAt: null }
  }
};

const ACTIVITY_HINTS = {
  "Inglês – Input": "BBC/YouGlish + shadowing (20–30min).",
  "Inglês – Output": "Explique 1 assunto técnico em voz alta (10–15min).",
  "Inglês Técnico": "Leia 1 doc (Grafana/Prometheus/Cisco) e resuma.",
  "Alemão": "DW Learn German + 10 palavras (Anki).",
  "Leitura Técnica": "Livro ativo (meta de páginas).",
  "Hands-on Tech": "Aplicar 1 coisa do que leu (15–30min).",
  "Piano": "Técnica + trecho (20min).",
  "Violino": "Técnica (arco/escala) + trecho (20min).",
  "Review semanal": "5 min: o que funcionou/travou e ajuste."
};

const ACTIVITIES = Object.keys(ACTIVITY_HINTS);

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  }catch{
    return structuredClone(DEFAULT_STATE);
  }
}
function saveState(s){ localStorage.setItem(LS_KEY, JSON.stringify(s)); }

function normalizeWeekList(str){
  return (str || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => Number(x))
    .filter(n => Number.isFinite(n) && n >= 1 && n <= 12)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a,b)=>a-b)
    .join(",");
}

function isOncall(state){
  const list = "," + normalizeWeekList(state.oncallWeeks).replace(/\s/g,"") + ",";
  return list.includes("," + state.week + ",");
}

function availableMinutes(state){
  return isOncall(state) ? Number(state.availOncallMin || 0) : Number(state.availNormalMin || 0);
}

function ensureTimer(state, name){
  state.timers ??= {};
  if(!state.timers[name]){
    state.timers[name] = { seconds: 0, running: false, startedAt: null };
  }
  return state.timers[name];
}

function stopAllTimers(state){
  const now = Date.now();
  Object.values(state.timers || {}).forEach(t=>{
    if(t?.running && t.startedAt){
      t.seconds += Math.floor((now - t.startedAt)/1000);
      t.running = false;
      t.startedAt = null;
    }
  });
}

function toggleTimer(state, name){
  const t = ensureTimer(state, name);
  const now = Date.now();

  if(t.running){
    // stop
    t.seconds += Math.floor((now - t.startedAt)/1000);
    t.running = false;
    t.startedAt = null;
  } else {
    // start (só um timer rodando)
    stopAllTimers(state);
    t.running = true;
    t.startedAt = now;
  }
}

function totalUsedSeconds(state){
  const now = Date.now();
  return Object.entries(state.timers || {}).reduce((acc, [_, t])=>{
    if(!t) return acc;
    let sec = t.seconds || 0;
    if(t.running && t.startedAt){
      sec += Math.floor((now - t.startedAt)/1000);
    }
    return acc + sec;
  }, 0);
}

function usedMinutes(state){
  return Math.floor(totalUsedSeconds(state) / 60);
}

function pctCapped(state){
  const avail = availableMinutes(state);
  if(avail <= 0) return 0;
  return Math.min(usedMinutes(state) / avail, 1); // cap 100%
}

function formatMMSS(totalSeconds){
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${String(s).padStart(2,"0")}s`;
}

function parseISODate(s){
  return s ? new Date(s + "T00:00:00") : null;
}

/**
 * Converte uma data em semana do ciclo (1–12) baseado em cycleStart.
 * cycleStart idealmente é uma segunda-feira.
 */
function weekFromDate(state, dateObj){
  const start = parseISODate(state.cycleStart);
  if(!start) return null;
  const ms = dateObj.getTime() - start.getTime();
  const days = Math.floor(ms / (1000*60*60*24));
  if(days < 0) return null;
  const w = Math.floor(days / 7) + 1;
  if(w < 1 || w > 12) return null;
  return w;
}

let state = loadState();

// -------- Tabs
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.querySelectorAll(".panel").forEach(p=>p.classList.add("hidden"));
    document.querySelector("#tab-" + tab).classList.remove("hidden");
  });
});

// -------- UI refs
const weekLabel = document.getElementById("weekLabel");
const modeBadge = document.getElementById("modeBadge");
const pctValue = document.getElementById("pctValue");
const weeklyPlan = document.getElementById("weeklyPlan");
const checklistEl = document.getElementById("checklist");
const availMinEl = document.getElementById("availMin");
const usedMinEl = document.getElementById("usedMin");
const usedMinHeroEl = document.getElementById("usedMinHero");
const remainMinEl = document.getElementById("remainMin");
const weekProgressBarEl = document.getElementById("weekProgressBar");
const xpValueEl = document.getElementById("xpValue");
const levelValueEl = document.getElementById("levelValue");
const activityCountEl = document.getElementById("activityCount");
const rankLabelEl = document.getElementById("rankLabel");

// config inputs
const weekInput = document.getElementById("weekInput");
const oncallInput = document.getElementById("oncallInput");
const cycleStartInput = document.getElementById("cycleStartInput");
const oncallDateInput = document.getElementById("oncallDateInput");
const addOncallDateBtn = document.getElementById("addOncallDateBtn");
const availNormalInput = document.getElementById("availNormalInput");
const availOncallInput = document.getElementById("availOncallInput");

function renderHeader(){
  weekLabel.textContent = `Semana ${state.week} • ${isOncall(state) ? "Plantão" : "Normal"}`;
  modeBadge.textContent = isOncall(state) ? "PLANTÃO" : "NORMAL";
  modeBadge.classList.toggle("oncall", isOncall(state));
}

function renderStats(){
  const avail = availableMinutes(state);
  const used = usedMinutes(state);
  const pct = pctCapped(state);
  const remaining = Math.max(avail - used, 0);
  const xp = used * 10;
  const level = Math.floor(used / 120) + 1;
  const now = Date.now();
  const activityDone = Object.values(state.timers || {}).filter(t=>{
    if(!t) return false;
    let sec = t.seconds || 0;
    if(t.running && t.startedAt){
      sec += Math.floor((now - t.startedAt)/1000);
    }
    return sec > 0;
  }).length;
  const rank = pct >= 1
    ? "Chefao"
    : pct >= 0.75
      ? "No fluxo"
      : pct >= 0.5
        ? "Focado"
        : pct >= 0.25
          ? "Constante"
          : "Iniciante";

  availMinEl.textContent = String(avail);
  usedMinEl.textContent = String(used);
  pctValue.textContent = `${Math.round(pct * 100)}%`;
  if(usedMinHeroEl) usedMinHeroEl.textContent = String(used);
  if(remainMinEl) remainMinEl.textContent = String(remaining);
  if(weekProgressBarEl) weekProgressBarEl.style.width = `${Math.round(pct * 100)}%`;
  if(xpValueEl) xpValueEl.textContent = String(xp);
  if(levelValueEl) levelValueEl.textContent = String(level);
  if(activityCountEl) activityCountEl.textContent = String(activityDone);
  if(rankLabelEl) rankLabelEl.textContent = rank;
}

function renderPlan(){
  weeklyPlan.value = state.weeklyPlan || "";
}

function renderChecklist(){
  checklistEl.innerHTML = "";

  ACTIVITIES.forEach((name)=>{
    const t = ensureTimer(state, name);
    const avail = availableMinutes(state);
    const now = Date.now();

    const liveSeconds = t.running && t.startedAt
      ? (t.seconds + Math.floor((now - t.startedAt)/1000))
      : (t.seconds || 0);
    const pct = avail > 0 ? Math.min((liveSeconds / 60) / avail, 1) : 0;
    const pctLabel = Math.round(pct * 100);

    const div = document.createElement("div");
    div.className = "item" + (t.running ? " running" : "");
    div.innerHTML = `
      <div class="toggle"></div>
      <div style="flex:1;">
        <h3>${name}</h3>
        <div class="progress" role="progressbar" aria-label="Progresso semanal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctLabel}">
          <div class="progress__bar" style="width:${pctLabel}%"></div>
        </div>
        <p>${ACTIVITY_HINTS[name]}</p>
        <div class="method" style="margin-top:8px; color: var(--muted); font-size: 12px;">
          Tempo: <strong style="color: var(--text);">${formatMMSS(liveSeconds)}</strong>
          ${t.running ? " • rodando…" : ""}
        </div>
        <div class="actions" style="margin-top:10px;">
          <button class="btn ${t.running ? "btn--ghost" : ""}" data-action="toggle" data-name="${name}">
            ${t.running ? "Parar" : "Start"}
          </button>
          <button class="btn btn--ghost" data-action="reset" data-name="${name}">Zerar</button>
        </div>
      </div>
    `;

    // botões
    div.querySelectorAll("button").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.stopPropagation();
        const action = btn.dataset.action;
        const nm = btn.dataset.name;

        if(action === "toggle"){
          toggleTimer(state, nm);
          saveState(state);
          renderAll();
        }
        if(action === "reset"){
          const tt = ensureTimer(state, nm);
          tt.seconds = 0; tt.running = false; tt.startedAt = null;
          saveState(state);
          renderAll();
        }
      });
    });

    checklistEl.appendChild(div);
  });
}

document.getElementById("savePlanBtn").addEventListener("click", ()=>{
  state.weeklyPlan = weeklyPlan.value.trim();
  saveState(state);
  renderAll();
});

document.getElementById("newWeekBtn").addEventListener("click", ()=>{
  // para timers e zera tudo
  stopAllTimers(state);
  Object.values(state.timers || {}).forEach(t=>{
    t.seconds = 0;
    t.running = false;
    t.startedAt = null;
  });

  state.weeklyPlan = "";
  state.week = state.week >= 12 ? 1 : state.week + 1;

  saveState(state);
  if(weekInput) weekInput.value = state.week;
  renderAll();
});

// Config save
document.getElementById("saveConfigBtn").addEventListener("click", ()=>{
  const w = Number(weekInput.value);
  state.week = Number.isFinite(w) ? Math.min(12, Math.max(1, w)) : 1;

  state.cycleStart = (cycleStartInput.value || "").trim();
  state.oncallWeeks = normalizeWeekList(oncallInput.value || "").trim();

  state.availNormalMin = Number(availNormalInput.value || 0);
  state.availOncallMin = Number(availOncallInput.value || 0);

  saveState(state);
  bootConfigUI();
  renderAll();
});

// Plantão por calendário
if(addOncallDateBtn){
  addOncallDateBtn.addEventListener("click", ()=>{
    const d = parseISODate(oncallDateInput.value);
    if(!d){
      alert("Selecione uma data de plantão.");
      return;
    }
    const w = weekFromDate(state, d);
    if(!w){
      alert("Não consegui calcular a semana. Defina o 'Início do ciclo' (uma segunda-feira) e tente de novo.");
      return;
    }
    const list = normalizeWeekList((state.oncallWeeks || "") + "," + w);
    state.oncallWeeks = list;
    oncallInput.value = state.oncallWeeks;
    saveState(state);
    renderAll();
    alert(`Plantão marcado na semana ${w}.`);
  });
}

// Export/Import (mantido)
document.getElementById("exportBtn").addEventListener("click", async ()=>{
  // antes de exportar, fecha timer rodando para persistir tempo atual
  stopAllTimers(state);
  saveState(state);

  const text = JSON.stringify(state, null, 2);
  await navigator.clipboard.writeText(text);
  alert("Dados copiados para a área de transferência (JSON).");
});
document.getElementById("importBtn").addEventListener("click", async ()=>{
  const text = prompt("Cole aqui o JSON exportado:");
  if(!text) return;
  try{
    const parsed = JSON.parse(text);
    state = { ...structuredClone(DEFAULT_STATE), ...parsed };
    // normaliza lista de plantão
    state.oncallWeeks = normalizeWeekList(state.oncallWeeks || "");
    saveState(state);
    bootConfigUI();
    renderAll();
    alert("Dados importados com sucesso.");
  }catch(e){
    alert("JSON inválido.");
  }
});

function bootConfigUI(){
  weekInput.value = state.week;
  oncallInput.value = normalizeWeekList(state.oncallWeeks || "");
  cycleStartInput.value = state.cycleStart || "";
  availNormalInput.value = state.availNormalMin ?? 600;
  availOncallInput.value = state.availOncallMin ?? 200;
}

async function loadResources(){
  const res = await fetch("./data/recursos.json", { cache: "no-store" });
  return res.json();
}

let resources = [];
const resourcesEl = document.getElementById("resources");
const searchInput = document.getElementById("searchInput");
const areaSelect = document.getElementById("areaSelect");

function renderResources(){
  const q = (searchInput.value || "").toLowerCase().trim();
  const area = areaSelect.value;

  const filtered = resources.filter(r=>{
    const hay = `${r.area} ${r.tema} ${r.nome} ${r.metodo}`.toLowerCase();
    const okQ = !q || hay.includes(q);
    const okA = area === "all" || r.area === area;
    return okQ && okA;
  });

  resourcesEl.innerHTML = "";
  filtered.forEach(r=>{
    const div = document.createElement("div");
    div.className = "resource";
    div.innerHTML = `
      <div class="meta">
        <span>${r.area}</span>
        <span>•</span>
        <span>${r.tema}</span>
      </div>
      <div><a href="${r.link}" target="_blank" rel="noreferrer">${r.nome}</a></div>
      <div class="method">${r.metodo}</div>
    `;
    resourcesEl.appendChild(div);
  });

  if(filtered.length === 0){
    resourcesEl.innerHTML = `<div class="hint">Nada encontrado.</div>`;
  }
}

function bootResourcesUI(){
  const areas = Array.from(new Set(resources.map(r=>r.area))).sort();
  areas.forEach(a=>{
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    areaSelect.appendChild(opt);
  });
  searchInput.addEventListener("input", renderResources);
  areaSelect.addEventListener("change", renderResources);
  renderResources();
}

function renderAll(){
  renderHeader();
  renderPlan();
  renderChecklist();
  renderStats();
}

// atualiza UI a cada 1s se tiver timer rodando
setInterval(()=>{
  const running = Object.values(state.timers || {}).some(t => t?.running);
  if(running){
    renderStats();
    renderChecklist();
  }
}, 1000);

(async function init(){
  // garante timers para todas atividades
  ACTIVITIES.forEach(name => ensureTimer(state, name));
  state.oncallWeeks = normalizeWeekList(state.oncallWeeks || "");
  saveState(state);

  bootConfigUI();
  resources = await loadResources();
  bootResourcesUI();
  renderAll();
})();
