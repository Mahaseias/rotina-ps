const LS_KEY = "rotina_v1";

const DEFAULT_STATE = {
  week: 1,
  oncallWeeks: "4,8,12",
  goalNormal: 6,
  goalOncall: 2,
  weeklyPlan: "",
  checklist: {
    "Inglês – Input": false,
    "Inglês – Output": false,
    "Inglês Técnico": false,
    "Alemão": false,
    "Leitura Técnica": false,
    "Hands-on Tech": false,
    "Piano": false,
    "Violino": false,
    "Review semanal": false
  }
};

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

function isOncall(state){
  const list = "," + (state.oncallWeeks || "").replace(/\s/g,"") + ",";
  return list.includes("," + state.week + ",");
}
function weeklyGoal(state){
  return isOncall(state) ? Number(state.goalOncall || 0) : Number(state.goalNormal || 0);
}
function doneCount(state){
  return Object.values(state.checklist).filter(Boolean).length;
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
const metaValue = document.getElementById("metaValue");
const doneValue = document.getElementById("doneValue");
const pctValue = document.getElementById("pctValue");
const weeklyPlan = document.getElementById("weeklyPlan");
const checklistEl = document.getElementById("checklist");

const weekInput = document.getElementById("weekInput");
const oncallInput = document.getElementById("oncallInput");
const goalNormalInput = document.getElementById("goalNormalInput");
const goalOncallInput = document.getElementById("goalOncallInput");

function renderHeader(){
  weekLabel.textContent = `Semana ${state.week} • ${isOncall(state) ? "Plantão" : "Normal"}`;
  modeBadge.textContent = isOncall(state) ? "PLANTÃO" : "NORMAL";
  modeBadge.classList.toggle("oncall", isOncall(state));
}

function renderStats(){
  const goal = weeklyGoal(state);
  const done = doneCount(state);
  const pct = goal === 0 ? 0 : Math.min(done / goal, 1.5);
  metaValue.textContent = goal;
  doneValue.textContent = done;
  pctValue.textContent = `${Math.round((done/goal)*100 || 0)}%`;
}

function renderPlan(){
  weeklyPlan.value = state.weeklyPlan || "";
}

function renderChecklist(){
  checklistEl.innerHTML = "";
  Object.entries(state.checklist).forEach(([name, done])=>{
    const div = document.createElement("div");
    div.className = "item" + (done ? " done" : "");
    div.innerHTML = `
      <div class="toggle"></div>
      <div>
        <h3>${name}</h3>
        <p>${hintFor(name)}</p>
      </div>
    `;
    div.addEventListener("click", ()=>{
      state.checklist[name] = !state.checklist[name];
      saveState(state);
      renderAll();
    });
    checklistEl.appendChild(div);
  });
}

function hintFor(name){
  const map = {
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
  return map[name] || "";
}

document.getElementById("savePlanBtn").addEventListener("click", ()=>{
  state.weeklyPlan = weeklyPlan.value.trim();
  saveState(state);
  renderAll();
});

document.getElementById("newWeekBtn").addEventListener("click", ()=>{
  // zera checklist e avança semana
  Object.keys(state.checklist).forEach(k=>state.checklist[k]=false);
  state.weeklyPlan = "";
  state.week = state.week >= 12 ? 1 : state.week + 1;
  saveState(state);
  // também reflete na config
  weekInput.value = state.week;
  renderAll();
});

// Config save
document.getElementById("saveConfigBtn").addEventListener("click", ()=>{
  const w = Number(weekInput.value);
  state.week = Number.isFinite(w) ? Math.min(12, Math.max(1, w)) : 1;
  state.oncallWeeks = (oncallInput.value || "").trim();
  state.goalNormal = Number(goalNormalInput.value || 0);
  state.goalOncall = Number(goalOncallInput.value || 0);
  saveState(state);
  renderAll();
});

// Export/Import
document.getElementById("exportBtn").addEventListener("click", async ()=>{
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
  oncallInput.value = state.oncallWeeks;
  goalNormalInput.value = state.goalNormal;
  goalOncallInput.value = state.goalOncall;
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

(async function init(){
  bootConfigUI();
  resources = await loadResources();
  bootResourcesUI();
  renderAll();
})();
