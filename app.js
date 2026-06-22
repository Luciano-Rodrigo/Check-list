const STORE_KEY = "luma.checklist.profissional.v1";
const SESSION_KEY = "luma.checklist.session.v1";

const initialState = {
  users: [
    {
      id: "u_admin",
      name: "Administrador Luma",
      email: "admin@luma.com",
      phone: "",
      password: "admin123",
      role: "adm",
      companyId: "luma",
      verified: true,
      createdAt: new Date().toISOString(),
    },
  ],
  templates: buildSeedTemplates(),
  submissions: [],
  tasks: [],
};

let state = structuredClone(initialState);
let currentUser = null;
let currentPage = "dashboard";
let authMode = "login";
let pendingVerification = null;
let mediaRecorder = null;
let currentAudioField = "";
let deferredInstallPrompt = null;
let chunks = [];

const app = document.getElementById("app");
const templateEl = document.getElementById("field-template");

document.addEventListener("click", handleGlobalClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("change", handleChange);
document.addEventListener("input", handleInput);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.querySelectorAll('[data-action="install-app"]').forEach((button) => {
    button.classList.remove("hidden");
  });
});
document.addEventListener("DOMContentLoaded", async () => {
  state = await loadState();
  currentUser = getSessionUser();
  applyTheme();
  render();
  startTaskTicker();
  registerServiceWorker();
});

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function buildSeedTemplates() {
  const now = new Date().toISOString();
  const base = { visibility: "public", ownerId: "u_admin", companyId: "luma", assignedAgentIds: [], artHeader: "clean", borderStyle: "soft", createdAt: now };
  return [
    {
      ...base,
      id: "tpl_public_vehicle",
      title: "Entrada e saída de veículo",
      description: "Duas etapas para oficina, locadora ou frota, com evidências, localização e assinaturas.",
      category: "Veículos",
      accent: "blue",
      artHeader: "stripe",
      borderStyle: "frame",
      fields: [
        { id: uid(), title: "Entrada: quilometragem, combustível e estado geral", kind: "inspection", options: { check: true, text: true, photo: true, audio: false, location: true, selfieDoc: false } },
        { id: uid(), title: "Entrada: assinatura do responsável pela entrega", kind: "signature", options: { check: false, text: false, photo: false, audio: false, location: true, selfieDoc: true } },
        { id: uid(), title: "Saída: serviços executados e condição final", kind: "inspection", options: { check: true, text: true, photo: true, audio: false, location: true, selfieDoc: false } },
        { id: uid(), title: "Saída: assinatura de retirada", kind: "signature", options: { check: false, text: false, photo: false, audio: false, location: true, selfieDoc: true } },
      ],
    },
    {
      ...base,
      id: "tpl_public_facility",
      title: "Vistoria de ambiente corporativo",
      description: "Checklist para salas, recepção, banheiros, estoque e áreas comuns.",
      category: "Facilities",
      accent: "teal",
      artHeader: "glass",
      borderStyle: "shadow",
      fields: [
        { id: uid(), title: "Limpeza geral e organização visual", kind: "inspection", options: { check: true, text: true, photo: true, audio: false, location: true, selfieDoc: false } },
        { id: uid(), title: "Iluminação, tomadas e equipamentos aparentes", kind: "inspection", options: { check: true, text: true, photo: true, audio: false, location: true, selfieDoc: false } },
        { id: uid(), title: "Ocorrências críticas encontradas", kind: "inspection", options: { check: true, text: true, photo: false, audio: true, location: true, selfieDoc: false } },
      ],
    },
    {
      ...base,
      id: "tpl_public_delivery",
      title: "Entrega técnica ao cliente",
      description: "Validação de entrega, instalação, aceite e registro de evidências.",
      category: "Cliente",
      accent: "violet",
      artHeader: "stripe",
      borderStyle: "line",
      fields: [
        { id: uid(), title: "Produto entregue em boas condições", kind: "inspection", options: { check: true, text: true, photo: true, audio: false, location: true, selfieDoc: false } },
        { id: uid(), title: "Orientações repassadas ao cliente", kind: "inspection", options: { check: true, text: true, photo: false, audio: true, location: true, selfieDoc: false } },
        { id: uid(), title: "Assinatura de aceite do cliente", kind: "signature", options: { check: false, text: false, photo: false, audio: false, location: true, selfieDoc: true } },
      ],
    },
    {
      ...base,
      id: "tpl_public_safety",
      title: "Segurança operacional",
      description: "Inspeção de EPIs, sinalização, riscos e bloqueios de área.",
      category: "Segurança",
      accent: "amber",
      artHeader: "solid",
      borderStyle: "frame",
      fields: [
        { id: uid(), title: "Equipe usando EPIs obrigatórios", kind: "inspection", options: { check: true, text: true, photo: true, audio: false, location: true, selfieDoc: false } },
        { id: uid(), title: "Sinalização e isolamento adequados", kind: "inspection", options: { check: true, text: true, photo: true, audio: false, location: true, selfieDoc: false } },
        { id: uid(), title: "Risco identificado ou melhoria necessária", kind: "inspection", options: { check: true, text: true, photo: true, audio: true, location: true, selfieDoc: false } },
      ],
    },
    {
      ...base,
      id: "tpl_public_inventory",
      title: "Conferência de estoque",
      description: "Controle de entrada, contagem, avarias e assinatura do conferente.",
      category: "Estoque",
      accent: "rose",
      artHeader: "glass",
      borderStyle: "shadow",
      fields: [
        { id: uid(), title: "Quantidade física confere com o documento", kind: "inspection", options: { check: true, text: true, photo: false, audio: false, location: true, selfieDoc: false } },
        { id: uid(), title: "Embalagens, lote e validade conferidos", kind: "inspection", options: { check: true, text: true, photo: true, audio: false, location: true, selfieDoc: false } },
        { id: uid(), title: "Assinatura do responsável pela conferência", kind: "signature", options: { check: false, text: false, photo: false, audio: false, location: true, selfieDoc: false } },
      ],
    },
  ];
}

async function loadState() {
  const remote = await loadRemoteState();
  if (remote) return remote;
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) {
    localStorage.setItem(STORE_KEY, JSON.stringify(initialState));
    return structuredClone(initialState);
  }
  const parsed = JSON.parse(raw);
  return migrateState(parsed);
}

function migrateState(nextState) {
  nextState.templates ||= [];
  nextState.submissions ||= [];
  nextState.tasks ||= [];
  const existingIds = new Set(nextState.templates.map((tpl) => tpl.id));
  buildSeedTemplates().forEach((tpl) => {
    if (!existingIds.has(tpl.id)) nextState.templates.push(tpl);
  });
  nextState.templates.forEach((tpl, index) => {
    tpl.category ||= "Operação";
    tpl.accent ||= ["blue", "teal", "violet", "amber", "rose"][index % 5];
    tpl.artHeader ||= "clean";
    tpl.borderStyle ||= "soft";
    tpl.assignedAgentIds ||= [];
  });
  nextState.tasks.forEach((task) => {
    task.templateId ||= "";
    task.completedLocation ||= "";
  });
  saveMigratedState(nextState);
  return nextState;
}

function saveMigratedState(nextState) {
  localStorage.setItem(STORE_KEY, JSON.stringify(nextState));
  saveRemoteState(nextState);
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  saveRemoteState(state);
}

async function loadRemoteState() {
  try {
    const response = await fetch("/api/state", { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return migrateState(await response.json());
  } catch {
    return null;
  }
}

function saveRemoteState(nextState) {
  fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextState),
  }).catch(() => {});
}

function getSessionUser() {
  const id = localStorage.getItem(SESSION_KEY);
  return state.users.find((user) => user.id === id) || null;
}

function setSession(user) {
  currentUser = user;
  if (user) localStorage.setItem(SESSION_KEY, user.id);
  else localStorage.removeItem(SESSION_KEY);
}

async function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return;
  }
  alert("Para instalar: no celular, abra o menu do navegador e toque em 'Adicionar à tela inicial'. No Chrome desktop, use o ícone de instalação na barra de endereço.");
}

function toggleMobileMenu() {
  document.body.classList.toggle("mobile-menu-open");
}

function closeMobileMenu() {
  document.body.classList.remove("mobile-menu-open");
}

function applyTheme() {
  const theme = localStorage.getItem("luma.theme") || "light";
  document.documentElement.dataset.theme = theme;
}

function visibleTemplates() {
  if (!currentUser) return [];
  if (currentUser.role === "adm") return state.templates;
  if (currentUser.role === "agent") {
    return state.templates.filter((tpl) => tpl.visibility === "public" || tpl.assignedAgentIds.includes(currentUser.id));
  }
  return state.templates.filter((tpl) => tpl.visibility === "public" || tpl.ownerId === currentUser.id || tpl.companyId === currentUser.companyId);
}

function ownTemplates() {
  if (!currentUser) return [];
  if (currentUser.role === "adm") return state.templates;
  return state.templates.filter((tpl) => tpl.ownerId === currentUser.id || tpl.companyId === currentUser.companyId);
}

function visibleSubmissions() {
  if (!currentUser) return [];
  if (currentUser.role === "adm") return state.submissions;
  if (currentUser.role === "agent") return state.submissions.filter((item) => item.filledBy === currentUser.id);
  return state.submissions.filter((item) => item.companyId === currentUser.companyId || item.filledBy === currentUser.id);
}

function visibleTasks() {
  if (!currentUser) return [];
  if (currentUser.role === "adm") return state.tasks;
  if (currentUser.role === "agent") return state.tasks.filter((task) => task.assignedTo === currentUser.id);
  return state.tasks.filter((task) => task.ownerId === currentUser.id || task.companyId === currentUser.companyId);
}

function agentsForCompany() {
  if (!currentUser) return [];
  return state.users.filter((user) => user.role === "agent" && user.companyId === currentUser.companyId);
}

function render() {
  if (!currentUser) {
    renderAuth();
    return;
  }
  const pageMap = {
    dashboard: renderDashboard,
    templates: renderTemplates,
    fill: renderFill,
    reports: renderReports,
    tasks: renderTasks,
    users: renderUsers,
  };
  const content = (pageMap[currentPage] || renderDashboard)();
  const navigation = `
    <nav class="nav">
      ${navButton("dashboard", "Painel", "dashboard")}
      ${currentUser.role !== "agent" ? navButton("templates", "Modelos", "models") : ""}
      ${navButton("fill", "Preencher", "check")}
      ${navButton("reports", "Checklists preenchidos", "filled")}
      ${navButton("tasks", "Tarefas", "tasks")}
      ${["adm", "company"].includes(currentUser.role) ? navButton("users", "Acessos", "users") : ""}
    </nav>
  `;
  app.innerHTML = `
    <div class="app-shell">
      <header class="mobile-appbar">
        <button class="hamburger" data-action="toggle-mobile-menu" type="button" aria-label="Abrir menu">
          <span></span><span></span><span></span>
        </button>
        <div class="mobile-title">
          <div class="brand-mark">L</div>
          <strong>Checklist Luma</strong>
        </div>
        <button class="icon-button" data-action="toggle-theme" type="button" title="Alternar tema">${iconUi("theme")}</button>
      </header>
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">L</div>
          <div>
            <h1>Check list profissional</h1>
            <p>Luma</p>
          </div>
        </div>
        ${navigation}
        <div class="sidebar-footer">
          <span class="badge">${roleLabel(currentUser.role)}</span>
          <div>
            <strong>${escapeHtml(currentUser.name)}</strong>
            <div class="small">${escapeHtml(currentUser.email)}</div>
          </div>
          <button class="secondary-button theme-button" data-action="toggle-theme" type="button">${iconUi("theme")} Alternar tema</button>
          <button class="danger-button logout-button" data-action="logout" type="button">${iconUi("logout")} Sair</button>
        </div>
      </aside>
      <div class="mobile-menu-backdrop" data-action="close-mobile-menu"></div>
      <main class="main">${content}</main>
      <button class="fab" data-action="open-fill-picker" type="button">+ Preencher checklist</button>
    </div>
  `;
}

function navButton(page, label, icon) {
  return `<button class="${currentPage === page ? "active" : ""}" data-page="${page}" type="button"><span class="nav-icon">${iconUi(icon)}</span><span>${label}</span></button>`;
}

function roleLabel(role) {
  return { adm: "ADM", company: "Empresa", agent: "Agente", personal: "Pessoal" }[role] || role;
}

function pageHeader(title, subtitle, actions = "") {
  return `
    <div class="topbar">
      <div>
        <h2>${title}</h2>
        <p>${subtitle}</p>
      </div>
      <div class="toolbar">${actions}</div>
    </div>
  `;
}

function renderAuth() {
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-panel">
        <div class="brand">
          <div class="brand-mark">L</div>
          <div>
            <h1>Check list profissional</h1>
            <p>Produto Luma</p>
          </div>
        </div>
        <button class="install-button" data-action="install-app" type="button">${iconUi("download")} Baixar app</button>
        <div class="tabs">
          <button type="button" class="${authMode === "login" ? "active" : ""}" data-auth-mode="login">Entrar</button>
          <button type="button" class="${authMode === "signup" ? "active" : ""}" data-auth-mode="signup">Cadastrar</button>
        </div>
        ${pendingVerification ? renderVerifyForm() : authMode === "login" ? renderLoginForm() : renderSignupForm()}
      </section>
      <section class="auth-visual">
        <h2>Controle operacional com evidências, assinatura e rastreabilidade.</h2>
      </section>
    </main>
  `;
}

function renderLoginForm() {
  return `
    <form class="form" data-form="login">
      <div class="form-row">
        <label>Email ou usuário</label>
        <input name="email" type="text" autocomplete="username" required />
      </div>
      <div class="form-row">
        <label>Senha</label>
        <input name="password" type="password" autocomplete="current-password" required />
      </div>
      <button class="primary-button" type="submit">Entrar</button>
      <p class="small">Demo ADM: admin@luma.com / admin123</p>
    </form>
  `;
}

function renderSignupForm() {
  return `
    <form class="form" data-form="signup">
      <div class="form-row">
        <label>Tipo de acesso</label>
        <select name="role" required>
          <option value="company">Empresa</option>
          <option value="personal">Pessoal</option>
        </select>
      </div>
      <div class="form-row">
        <label>Nome</label>
        <input name="name" type="text" required />
      </div>
      <div class="split">
        <div class="form-row">
          <label>Email</label>
          <input name="email" type="email" required />
        </div>
        <div class="form-row">
          <label>Telefone opcional</label>
          <input name="phone" type="tel" />
        </div>
      </div>
      <div class="form-row">
        <label>Senha</label>
        <input name="password" type="password" minlength="6" required />
      </div>
      <button class="primary-button" type="submit">Criar acesso</button>
    </form>
  `;
}

function renderVerifyForm() {
  return `
    <form class="form" data-form="verify">
      <p class="muted">Enviamos um código de verificação para ${escapeHtml(pendingVerification.email)}.</p>
      <p class="small">Nesta versão local, o código é: <strong>${pendingVerification.code}</strong></p>
      <div class="form-row">
        <label>Código</label>
        <input name="code" inputmode="numeric" required />
      </div>
      <button class="primary-button" type="submit">Verificar email</button>
      <button class="ghost-button" type="button" data-action="cancel-verification">Voltar</button>
    </form>
  `;
}

function renderDashboard() {
  const templates = visibleTemplates();
  const submissions = visibleSubmissions();
  const tasks = visibleTasks();
  return `
    ${pageHeader("Painel", "Visão geral dos modelos, preenchimentos e tarefas em andamento.")}
    <section class="dashboard-hero">
      <div>
        <span class="template-kicker">Produto Luma</span>
        <h3>Checklists com evidência, assinatura e contexto operacional.</h3>
        <p>Crie padrões de controle, distribua para equipes e transforme cada preenchimento em um registro pronto para auditoria.</p>
      </div>
      <div class="hero-actions">
        <button class="primary-button icon-text" data-action="open-fill-picker" type="button">${iconUi("check")} Preencher checklist</button>
        ${currentUser.role !== "agent" ? `<button class="secondary-button icon-text" data-action="open-template-modal" type="button">${iconUi("models")} Criar modelo</button>` : ""}
      </div>
    </section>
    <section class="grid cols-3">
      <article class="card metric"><span class="muted">Modelos disponíveis</span><strong>${templates.length}</strong></article>
      <article class="card metric"><span class="muted">Checklists preenchidos</span><strong>${submissions.length}</strong></article>
      <article class="card metric"><span class="muted">Tarefas abertas</span><strong>${tasks.filter((t) => !t.done).length}</strong></article>
    </section>
    <section class="grid cols-2" style="margin-top:16px">
      <article class="card">
        <h3>Últimos preenchimentos</h3>
        ${renderMiniList(submissions.slice(-4).reverse(), "Nenhum preenchimento ainda.", (item) => `
          <div class="list-item">
            <strong>${escapeHtml(item.templateTitle)}</strong>
            <span class="small">${formatDate(item.createdAt)} por ${escapeHtml(userName(item.filledBy))}</span>
          </div>
        `)}
      </article>
      <article class="card">
        <h3>Próximas tarefas</h3>
        ${renderMiniList(tasks.filter((t) => !t.done).slice(0, 4), "Nenhuma tarefa aberta.", (task) => `
          <div class="list-item">
            <strong>${escapeHtml(task.title)}</strong>
            <span class="small">${task.recurrenceHours ? `A cada ${task.recurrenceHours}h` : "Tarefa simples"}</span>
          </div>
        `)}
      </article>
    </section>
  `;
}

function renderMiniList(items, empty, mapper) {
  return items.length ? `<div class="list">${items.map(mapper).join("")}</div>` : `<div class="empty">${empty}</div>`;
}

function renderTemplates() {
  const canCreate = currentUser.role !== "agent";
  return `
    ${pageHeader("Modelos", "Crie modelos públicos ou privados e defina quais evidências cada campo precisa.", canCreate ? `<button class="primary-button icon-text" data-action="open-template-modal" type="button">${iconUi("models")} Novo modelo</button>` : "")}
    <div class="list">
      ${ownTemplates().map(renderTemplateItem).join("") || `<div class="empty">Nenhum modelo criado ainda.</div>`}
    </div>
  `;
}

function renderTemplateItem(tpl) {
  const assigned = tpl.assignedAgentIds.length ? `${tpl.assignedAgentIds.length} agente(s)` : "Sem agentes específicos";
  return `
    <article class="list-item template-card ${accentClass(tpl)}">
      <div class="list-item-head">
        <div>
          <span class="template-kicker">${escapeHtml(tpl.category || "Operação")}</span>
          <h3>${escapeHtml(tpl.title)}</h3>
          <p class="muted">${escapeHtml(tpl.description || "Sem descrição")}</p>
        </div>
        <div class="toolbar">
          <span class="badge">${tpl.visibility === "public" ? "Público" : "Privado"}</span>
          <button class="secondary-button" data-action="duplicate-template" data-id="${tpl.id}" type="button">Duplicar</button>
          ${tpl.ownerId === currentUser.id || currentUser.role === "adm" ? `<button class="danger-button" data-action="delete-template" data-id="${tpl.id}" type="button">Excluir</button>` : ""}
        </div>
      </div>
      <span class="small">${tpl.fields.length} campo(s) · ${assigned}</span>
    </article>
  `;
}

function renderFill() {
  const templates = visibleTemplates();
  return `
    ${pageHeader("Preencher checklist", "Escolha um modelo disponível e registre evidências, localização e assinaturas.")}
    <div class="template-gallery">
      ${templates.map((tpl) => `
        <article class="card template-card ${accentClass(tpl)}">
          <span class="template-kicker">${escapeHtml(tpl.category || "Operação")}</span>
          <h3>${escapeHtml(tpl.title)}</h3>
          <p class="muted">${escapeHtml(tpl.description || "Sem descrição")}</p>
          <div class="toolbar">
            <span class="badge">${tpl.visibility === "public" ? "Público" : "Privado"}</span>
            <button class="primary-button icon-text" data-action="start-fill" data-id="${tpl.id}" type="button">${iconUi("check")} Preencher</button>
          </div>
        </article>
      `).join("") || `<div class="empty">Nenhum modelo disponível para você.</div>`}
    </div>
  `;
}

function accentClass(tpl) {
  return `accent-${tpl.accent || "blue"}`;
}

function iconCamera() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.6A1 1 0 0 1 10.5 4h3a1 1 0 0 1 .8.4L15.5 6h2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"/><circle cx="12" cy="12.5" r="3.2"/></svg>`;
}

function iconChat() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v7A2.5 2.5 0 0 1 16.5 15H11l-4.4 3.3A1 1 0 0 1 5 17.5v-12Z"/></svg>`;
}

function iconMic() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v4"/><path d="M8.5 21h7"/></svg>`;
}

function iconUi(name) {
  const icons = {
    dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7v7H4V5Zm9 0h7v4h-7V5ZM4 14h7v5H4v-5Zm9-3h7v8h-7v-8Z"/></svg>`,
    models: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6V3Zm8 1v4h4"/></svg>`,
    check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5 1.8-1.8L9 13.4 18.2 4.2 20 6Z"/></svg>`,
    filled: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5V4Zm3 4h8v2H8V8Zm0 4h8v2H8v-2Zm0 4h5v2H8v-2Z"/></svg>`,
    tasks: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h14v2H7V5Zm0 6h14v2H7v-2Zm0 6h14v2H7v-2ZM3 5h2v2H3V5Zm0 6h2v2H3v-2Zm0 6h2v2H3v-2Z"/></svg>`,
    users: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0 2c-3.3 0-6 1.7-6 3.8V20h12v-2.2C15 15.7 12.3 14 9 14Zm8-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-.8 0-1.5.1-2.1.4 1.2.8 2.1 1.8 2.1 3V20h4v-1.7c0-2.1-1.8-3.8-4-3.8Z"/></svg>`,
    theme: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10c0-.4 0-.7-.1-1A7 7 0 0 1 13 3.1 8 8 0 0 0 12 2Z"/></svg>`,
    logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h8v2H7v14h6v2H5V3Zm11.6 5.4L20.2 12l-3.6 3.6-1.4-1.4 1.2-1.2H10v-2h6.4l-1.2-1.2 1.4-1.4Z"/></svg>`,
    download: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v9l3.2-3.2 1.4 1.4L12 15.8l-5.6-5.6 1.4-1.4L11 12V3ZM5 18h14v3H5v-3Z"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5V20h2.5L17.1 9.4l-2.5-2.5L4 17.5ZM18 8.5 15.5 6 17 4.5a1.8 1.8 0 0 1 2.5 2.5L18 8.5Z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l1 2h4v2H3V6h4l1-2Zm1 6h2v8H9v-8Zm4 0h2v8h-2v-8ZM6 9h12l-1 12H7L6 9Z"/></svg>`,
    pdf: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l4 4v16H6V2Zm8 1v4h4M8 15h8v2H8v-2Zm0-4h8v2H8v-2Z"/></svg>`,
    eye: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c5 0 8 4.5 9 7-1 2.5-4 7-9 7s-8-4.5-9-7c1-2.5 4-7 9-7Zm0 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/></svg>`,
  };
  return icons[name] || "";
}

function renderReports() {
  const submissions = visibleSubmissions().slice().reverse();
  return `
    ${pageHeader("Checklists preenchidos", "Consulte, edite, exclua ou gere PDF dos checklists finalizados.")}
    <div class="list">
      ${submissions.map((item) => `
        <article class="list-item">
          <div class="list-item-head">
            <div>
              <h3>${escapeHtml(item.templateTitle)}</h3>
              <span class="small">${formatDate(item.createdAt)} · ${escapeHtml(userName(item.filledBy))}</span>
            </div>
            <div class="toolbar">
              <button class="secondary-button icon-text" data-action="view-report" data-id="${item.id}" type="button">${iconUi("eye")} Ver</button>
              <button class="secondary-button icon-text" data-action="edit-submission" data-id="${item.id}" type="button">${iconUi("edit")} Editar</button>
              <button class="primary-button icon-text" data-action="print-report" data-id="${item.id}" type="button">${iconUi("pdf")} PDF</button>
              <button class="danger-button icon-text" data-action="delete-submission" data-id="${item.id}" type="button">${iconUi("trash")} Excluir</button>
            </div>
          </div>
        </article>
      `).join("") || `<div class="empty">Nenhum checklist preenchido ainda.</div>`}
    </div>
  `;
}

function renderTasks() {
  const tasks = visibleTasks();
  const templates = visibleTemplates();
  const assignOptions = currentUser.role === "company"
    ? `<option value="${currentUser.id}">Minha empresa</option>${agentsForCompany().map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}`
    : `<option value="${currentUser.id}">Eu</option>`;
  const templateOptions = `<option value="">Sem checklist vinculado</option>${templates.map((tpl) => `<option value="${tpl.id}">${escapeHtml(tpl.title)}</option>`).join("")}`;
  return `
    ${pageHeader("Tarefas", "Crie tarefas simples ou recorrentes com janela de funcionamento.", `<button class="secondary-button icon-text" data-action="request-notification" type="button">${iconUi("tasks")} Ativar notificações</button>`)}
    <section class="card">
      <form class="form" data-form="task">
        <div class="split">
          <div class="form-row">
            <label>Tarefa</label>
            <input name="title" placeholder="Ex.: beber água" required />
          </div>
          <div class="form-row">
            <label>Atribuir para</label>
            <select name="assignedTo">${assignOptions}</select>
          </div>
        </div>
        <div class="form-row">
          <label>Modelo de checklist vinculado</label>
          <select name="templateId">${templateOptions}</select>
        </div>
        <div class="split">
          <div class="form-row">
            <label>Recorrência em horas</label>
            <input name="recurrenceHours" type="number" min="0" step="1" placeholder="0 para tarefa simples" />
          </div>
          <div class="split">
            <div class="form-row">
              <label>Início</label>
              <input name="startHour" type="time" value="08:00" />
            </div>
            <div class="form-row">
              <label>Fim</label>
              <input name="endHour" type="time" value="18:00" />
            </div>
          </div>
        </div>
        <button class="primary-button icon-text" type="submit">${iconUi("tasks")} Criar tarefa</button>
      </form>
    </section>
    <section class="list" style="margin-top:16px">
      ${tasks.map(renderTask).join("") || `<div class="empty">Nenhuma tarefa cadastrada.</div>`}
    </section>
  `;
}

function renderTask(task) {
  const tpl = state.templates.find((item) => item.id === task.templateId);
  return `
    <article class="list-item">
      <div class="list-item-head">
        <div>
          <label class="inline-check">
            <input type="checkbox" data-action="toggle-task" data-id="${task.id}" ${task.done ? "checked" : ""} />
            <strong>${escapeHtml(task.title)}</strong>
          </label>
          <div class="small">Para ${escapeHtml(userName(task.assignedTo))} · ${task.recurrenceHours ? `a cada ${task.recurrenceHours}h entre ${task.startHour} e ${task.endHour}` : "simples"}</div>
          ${tpl ? `<div class="task-template-chip ${accentClass(tpl)}">${escapeHtml(tpl.title)}</div>` : ""}
          ${task.completedLocation ? `<div class="small">Concluída em ${escapeHtml(task.completedLocation)}</div>` : ""}
        </div>
        <div class="toolbar">
          ${tpl ? `<button class="primary-button" data-action="start-fill" data-id="${tpl.id}" data-task-id="${task.id}" type="button">Preencher checklist</button>` : ""}
          <button class="danger-button" data-action="delete-task" data-id="${task.id}" type="button">Excluir</button>
        </div>
      </div>
    </article>
  `;
}

function renderUsers() {
  if (currentUser.role === "adm") {
    return `
      ${pageHeader("Acessos", "ADM acompanha todos os usuários e pode criar acessos de empresa.", `<button class="primary-button" data-action="open-company-modal" type="button">Nova empresa</button>`)}
      <div class="list">${state.users.map(renderUserItem).join("")}</div>
    `;
  }
  return `
    ${pageHeader("Acessos", "Crie agentes e distribua modelos específicos para cada um.", `<button class="primary-button" data-action="open-agent-modal" type="button">Novo agente</button>`)}
    <div class="list">${agentsForCompany().map(renderUserItem).join("") || `<div class="empty">Nenhum agente cadastrado.</div>`}</div>
  `;
}

function renderUserItem(user) {
  return `
    <article class="list-item">
      <div class="list-item-head">
        <div>
          <h3>${escapeHtml(user.name)}</h3>
          <span class="small">${escapeHtml(user.email)} · ${roleLabel(user.role)}</span>
        </div>
        <span class="badge">${user.verified ? "Verificado" : "Pendente"}</span>
      </div>
    </article>
  `;
}

function openTemplateModal() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal">
      <div class="topbar">
        <div>
          <h2>Novo modelo</h2>
          <p>Defina campos, evidências e distribuição para agentes.</p>
        </div>
        <button class="icon-button" data-action="close-modal" type="button">×</button>
      </div>
      <form class="form" data-form="template">
        <div class="split">
          <div class="form-row">
            <label>Nome do modelo</label>
            <input name="title" required />
          </div>
          <div class="form-row">
            <label>Visibilidade</label>
            <select name="visibility">
              <option value="private">Privado</option>
              <option value="public">Público</option>
            </select>
          </div>
        </div>
        <div class="split">
          <div class="form-row">
            <label>Categoria visual</label>
            <input name="category" placeholder="Ex.: Segurança, Estoque, Oficina" />
          </div>
          <div class="form-row">
            <label>Cor do modelo</label>
            <select name="accent">
              <option value="blue">Azul profissional</option>
              <option value="teal">Verde técnico</option>
              <option value="violet">Violeta atendimento</option>
              <option value="amber">Âmbar segurança</option>
              <option value="rose">Rosa controle</option>
            </select>
          </div>
        </div>
        <div class="split">
          <div class="form-row">
            <label>Cabeçalho artístico</label>
            <select name="artHeader">
              <option value="clean">Minimalista</option>
              <option value="stripe">Faixa lateral</option>
              <option value="glass">Vidro suave</option>
              <option value="solid">Bloco de cor</option>
            </select>
          </div>
          <div class="form-row">
            <label>Borda do checklist</label>
            <select name="borderStyle">
              <option value="soft">Suave</option>
              <option value="line">Linha fina</option>
              <option value="shadow">Sombra</option>
              <option value="frame">Moldura</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <label>Descrição</label>
          <textarea name="description"></textarea>
        </div>
        ${currentUser.role === "company" ? `
          <div class="form-row">
            <label>Agentes com acesso</label>
            <div class="checkline">
              ${agentsForCompany().map((a) => `<label><input type="checkbox" name="agentIds" value="${a.id}" /> ${escapeHtml(a.name)}</label>`).join("") || `<span class="small">Crie agentes para distribuir modelos específicos.</span>`}
            </div>
          </div>
        ` : ""}
        <div class="form-row">
          <label>Campos do checklist</label>
          <div id="builder-fields" class="grid"></div>
          <button class="secondary-button" data-action="add-builder-field" type="button">Adicionar campo</button>
        </div>
        <button class="primary-button" type="submit">Salvar modelo</button>
      </form>
    </section>
  `;
  document.body.appendChild(modal);
  addBuilderField();
}

function addBuilderField(seed) {
  const holder = document.getElementById("builder-fields");
  if (!holder) return;
  const node = templateEl.content.firstElementChild.cloneNode(true);
  if (seed) {
    node.querySelector(".field-title").value = seed.title || "";
    node.querySelector(".field-kind").value = seed.kind || "inspection";
    node.querySelectorAll("[data-option]").forEach((input) => {
      input.checked = Boolean(seed.options?.[input.dataset.option]);
    });
  }
  holder.appendChild(node);
}

function openFillModal(templateId, taskId = "", submissionId = "") {
  const tpl = state.templates.find((item) => item.id === templateId);
  if (!tpl) return;
  const editing = state.submissions.find((item) => item.id === submissionId);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal checklist-modal ${accentClass(tpl)} border-${tpl.borderStyle || "soft"}">
      <div class="topbar checklist-top art-${tpl.artHeader || "clean"}">
        <div>
          <span class="template-kicker">${escapeHtml(tpl.category || "Operação")}</span>
          <h2>${escapeHtml(tpl.title)}</h2>
          <p>${editing ? "Editando checklist preenchido" : escapeHtml(tpl.description || "Preenchimento de checklist")}</p>
        </div>
        <button class="icon-button" data-action="close-modal" type="button">×</button>
      </div>
      <form class="form" data-form="submission" data-template-id="${tpl.id}" data-task-id="${taskId}" data-submission-id="${submissionId}">
        ${tpl.fields.map(renderRuntimeField).join("")}
        <button class="primary-button icon-text" type="submit">${editing ? iconUi("edit") : iconUi("check")} ${editing ? "Salvar edição" : "Finalizar checklist"}</button>
      </form>
    </section>
  `;
  document.body.appendChild(modal);
  setupSignaturePads();
  if (editing) hydrateSubmissionForm(editing);
}

function openFillPickerModal() {
  const templates = visibleTemplates();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal">
      <div class="topbar">
        <div>
          <h2>Preencher checklist</h2>
          <p>Escolha um modelo para iniciar o preenchimento.</p>
        </div>
        <button class="icon-button" data-action="close-modal" type="button">×</button>
      </div>
      <div class="template-gallery compact">
        ${templates.map((tpl) => `
          <article class="card template-card ${accentClass(tpl)}">
            <span class="template-kicker">${escapeHtml(tpl.category || "Operação")}</span>
            <h3>${escapeHtml(tpl.title)}</h3>
            <p class="muted">${escapeHtml(tpl.description || "Sem descrição")}</p>
            <button class="primary-button icon-text" data-action="start-fill" data-id="${tpl.id}" type="button">${iconUi("check")} Preencher</button>
          </article>
        `).join("") || `<div class="empty">Nenhum modelo disponível.</div>`}
      </div>
    </section>
  `;
  document.body.appendChild(modal);
}

function selectCheckStatus(fieldId, value, options = {}) {
  const fieldset = document.querySelector(`[data-field-id="${fieldId}"]`);
  if (!fieldset) return;
  const input = fieldset.querySelector(`input[name="${fieldId}_status"]`);
  input.value = value;
  fieldset.querySelectorAll(".status-button").forEach((button) => {
    const selected = button.dataset.value === value;
    button.classList.toggle("selected", selected);
    button.classList.toggle("dimmed", !selected);
  });
  if (!options.skipLocation) captureLocation(fieldId, { silent: true });
}

function renderRuntimeField(field) {
  const options = field.options || {};
  return `
    <fieldset class="runtime-field ${field.kind === "signature" ? "signature-field" : ""}" data-field-id="${field.id}">
      <legend><span class="badge">${field.kind === "signature" ? "Assinatura" : "Checagem"}</span></legend>
      <div class="inspection-card">
        <div class="inspection-status">
          ${options.check ? `
            <button class="status-button ok" data-action="select-check-status" data-field="${field.id}" data-value="ok" type="button" title="Correto" aria-label="Correto">✓</button>
            <button class="status-button fail" data-action="select-check-status" data-field="${field.id}" data-value="fail" type="button" title="Incorreto" aria-label="Incorreto">×</button>
            <input type="hidden" name="${field.id}_status" />
          ` : ""}
        </div>
        <h3>${escapeHtml(field.title)}</h3>
        <div class="inspection-actions">
          ${options.photo ? `<button class="tool-icon" data-action="open-photo-picker" data-field="${field.id}" type="button" title="Tirar foto ou escolher imagens">${iconCamera()}</button>` : ""}
          ${options.text ? `<button class="tool-icon" data-action="open-observation-modal" data-field="${field.id}" type="button" title="Observações">${iconChat()}</button>` : ""}
          ${options.audio ? `<button class="tool-icon" data-action="start-audio" data-field="${field.id}" type="button" title="Gravar áudio">${iconMic()}</button>` : ""}
        </div>
      </div>
      ${options.text ? `<input type="hidden" name="${field.id}_text" /><div class="evidence-note hidden" data-note-preview="${field.id}"></div>` : ""}
      ${options.photo ? `<input class="hidden-file" name="${field.id}_photo_input" data-photo-input="${field.id}" type="file" accept="image/*" multiple /><input type="hidden" name="${field.id}_photos" value="[]" /><div class="photo-strip" data-photo-strip="${field.id}"></div>` : ""}
      ${options.audio ? `<input type="hidden" name="${field.id}_audio" /><input type="hidden" name="${field.id}_transcript" /><div class="audio-strip" data-audio-preview="${field.id}"></div>` : ""}
      ${options.location || options.check ? `<input type="hidden" name="${field.id}_location" /><span class="small location-note" data-location-note="${field.id}">${field.kind === "signature" ? "Localização será capturada ao assinar." : "Localização será capturada ao selecionar o resultado."}</span>` : ""}
      ${field.kind === "signature" ? `<div class="form-row"><label>Assinatura</label><canvas class="signature-pad" data-signature="${field.id}"></canvas><input type="hidden" name="${field.id}_signature" /></div>` : ""}
      ${options.selfieDoc ? `<input type="hidden" name="${field.id}_selfieDoc_existing" /><div class="form-row"><label>Foto da pessoa com documento</label><input name="${field.id}_selfieDoc" type="file" accept="image/*" capture="user" /></div>` : ""}
      ${field.kind === "signature" ? `<input type="hidden" name="${field.id}_ip" value="Indisponível no navegador local" />` : ""}
    </fieldset>
  `;
}

function hydrateSubmissionForm(submission) {
  submission.answers.forEach((answer) => {
    const fieldId = answer.fieldId;
    if (answer.status || answer.checked !== undefined) {
      const status = answer.status || (answer.checked ? "ok" : "fail");
      selectCheckStatus(fieldId, status, { skipLocation: true });
    }
    setInputValue(`${fieldId}_text`, answer.text || "");
    const note = document.querySelector(`[data-note-preview="${fieldId}"]`);
    if (note && answer.text) {
      note.textContent = answer.text;
      note.classList.remove("hidden");
    }
    const photos = answer.photos?.length ? answer.photos : answer.photo ? [answer.photo] : [];
    setInputValue(`${fieldId}_photos`, JSON.stringify(photos));
    renderPhotoStrip(fieldId);
    setInputValue(`${fieldId}_audio`, answer.audio || "");
    setInputValue(`${fieldId}_transcript`, answer.transcript || "");
    renderAudioPreview(fieldId);
    setInputValue(`${fieldId}_location`, answer.location || "");
    const locationNote = document.querySelector(`[data-location-note="${fieldId}"]`);
    if (locationNote && answer.location) locationNote.textContent = `Localização capturada: ${answer.location}`;
    setInputValue(`${fieldId}_signature`, answer.signature || "");
    if (answer.signature) drawSignaturePreview(fieldId, answer.signature);
    setInputValue(`${fieldId}_selfieDoc_existing`, answer.selfieDoc || "");
  });
}

function setInputValue(name, value) {
  const input = document.querySelector(`[name="${name}"]`);
  if (input) input.value = value;
}

function drawSignaturePreview(fieldId, src) {
  const canvas = document.querySelector(`[data-signature="${fieldId}"]`);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const image = new Image();
  image.onload = () => ctx.drawImage(image, 0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
  image.src = src;
}

function openUserModal(kind) {
  const isCompany = kind === "company";
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal">
      <div class="topbar">
        <div>
          <h2>${isCompany ? "Nova empresa" : "Novo agente"}</h2>
          <p>${isCompany ? "Criado pelo ADM." : "Criado dentro da sua empresa."}</p>
        </div>
        <button class="icon-button" data-action="close-modal" type="button">×</button>
      </div>
      <form class="form" data-form="${isCompany ? "company-user" : "agent-user"}">
        <div class="split">
          <div class="form-row"><label>Nome</label><input name="name" required /></div>
          <div class="form-row"><label>Email</label><input name="email" type="email" required /></div>
        </div>
        <div class="split">
          <div class="form-row"><label>Telefone opcional</label><input name="phone" type="tel" /></div>
          <div class="form-row"><label>Senha</label><input name="password" type="password" minlength="6" required /></div>
        </div>
        <button class="primary-button" type="submit">Criar acesso</button>
      </form>
    </section>
  `;
  document.body.appendChild(modal);
}

function showReport(id, shouldPrint = false) {
  const report = state.submissions.find((item) => item.id === id);
  if (!report) return;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal">
      <div class="topbar">
        <div>
          <h2>Checklist preenchido</h2>
          <p>${formatDate(report.createdAt)}</p>
        </div>
        <div class="toolbar">
          <button class="primary-button icon-text" data-action="browser-print" type="button">${iconUi("pdf")} Gerar PDF</button>
          <button class="icon-button" data-action="close-modal" type="button">×</button>
        </div>
      </div>
      <div id="print-area" class="report-paper">${reportHtml(report)}</div>
    </section>
  `;
  document.body.appendChild(modal);
  if (shouldPrint) setTimeout(() => window.print(), 150);
}

function reportHtml(report) {
  return `
    <header class="report-cover ${accentClass({ accent: report.templateAccent })} art-${report.templateArtHeader || "clean"} border-${report.templateBorderStyle || "soft"}">
      <span>${escapeHtml(report.templateCategory || "Operação")}</span>
      <h1>${escapeHtml(report.templateTitle)}</h1>
      <p>Check list profissional · Luma</p>
    </header>
    <section class="report-meta">
      <div><strong>Preenchido por</strong><span>${escapeHtml(userName(report.filledBy))}</span></div>
      <div><strong>Data</strong><span>${formatDate(report.createdAt)}</span></div>
      <div><strong>Registro</strong><span>${escapeHtml(report.id)}</span></div>
    </section>
    <div class="report-items">
      ${report.answers.map((answer) => `
        <section class="report-item">
          <div class="report-item-head">
            <h2>${escapeHtml(answer.title)}</h2>
            ${renderReportStatus(answer)}
          </div>
          ${answer.text ? `<p><strong>Observação</strong><span>${escapeHtml(answer.text)}</span></p>` : ""}
          ${answer.transcript ? `<p><strong>Transcrição</strong><span>${escapeHtml(answer.transcript)}</span></p>` : ""}
          ${answer.location ? `<p><strong>Localização</strong><span>${escapeHtml(answer.location)}</span></p>` : ""}
          ${answer.ip ? `<p><strong>IP</strong><span>${escapeHtml(answer.ip)}</span></p>` : ""}
          <div class="report-media">
            ${renderReportPhotos(answer)}
            ${answer.selfieDoc ? `<figure><img src="${answer.selfieDoc}" alt="Documento anexado" /><figcaption>Foto com documento</figcaption></figure>` : ""}
            ${answer.signature ? `<figure><img src="${answer.signature}" alt="Assinatura" /><figcaption>Assinatura</figcaption></figure>` : ""}
          </div>
          ${answer.audio ? `<p><strong>Áudio</strong><audio controls src="${answer.audio}"></audio></p>` : ""}
        </section>
      `).join("")}
    </div>
  `;
}

function renderReportPhotos(answer) {
  const photos = answer.photos?.length ? answer.photos : answer.photo ? [answer.photo] : [];
  return photos.map((src, index) => `<figure><img src="${src}" alt="Foto anexada ${index + 1}" /><figcaption>Foto ${index + 1}</figcaption></figure>`).join("");
}

function renderReportStatus(answer) {
  const status = answer.status || (answer.checked === true ? "ok" : answer.checked === false ? "fail" : "");
  if (status === "ok") return `<span class="report-status ok">✓ Correto</span>`;
  if (status === "fail") return `<span class="report-status fail">× Incorreto</span>`;
  return "";
}

async function handleSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const formType = form.dataset.form;
  const data = new FormData(form);
  if (formType === "login") submitLogin(data);
  if (formType === "signup") submitSignup(data);
  if (formType === "verify") submitVerify(data);
  if (formType === "template") submitTemplate(form, data);
  if (formType === "task") submitTask(data);
  if (formType === "company-user" || formType === "agent-user") submitUser(formType, data);
  if (formType === "submission") await submitChecklist(form, data);
}

function submitLogin(data) {
  const login = String(data.get("email")).trim().toLowerCase();
  const password = String(data.get("password"));
  const user = state.users.find((item) => item.email.toLowerCase() === login && item.password === password);
  if (!user) return alert("Email ou senha inválidos.");
  if (!user.verified) return alert("Verifique seu email antes de entrar.");
  setSession(user);
  currentPage = "dashboard";
  render();
}

function submitSignup(data) {
  const email = String(data.get("email")).trim().toLowerCase();
  if (state.users.some((item) => item.email.toLowerCase() === email)) return alert("Email já cadastrado.");
  pendingVerification = {
    code: Math.floor(100000 + Math.random() * 900000).toString(),
    user: {
      id: uid(),
      name: String(data.get("name")).trim(),
      email,
      phone: String(data.get("phone")).trim(),
      password: String(data.get("password")),
      role: String(data.get("role")),
      companyId: uid(),
      verified: false,
      createdAt: new Date().toISOString(),
    },
    email,
  };
  render();
}

function submitVerify(data) {
  if (String(data.get("code")).trim() !== pendingVerification.code) return alert("Código incorreto.");
  const user = { ...pendingVerification.user, verified: true };
  state.users.push(user);
  saveState();
  pendingVerification = null;
  setSession(user);
  currentPage = "dashboard";
  render();
}

function submitTemplate(form, data) {
  const fields = [...form.querySelectorAll(".builder-field")].map((node) => {
    const options = {};
    node.querySelectorAll("[data-option]").forEach((input) => {
      options[input.dataset.option] = input.checked;
    });
    return {
      id: uid(),
      title: node.querySelector(".field-title").value.trim(),
      kind: node.querySelector(".field-kind").value,
      options,
    };
  }).filter((field) => field.title);
  if (!fields.length) return alert("Adicione pelo menos um campo.");
  state.templates.push({
    id: uid(),
    title: String(data.get("title")).trim(),
    description: String(data.get("description")).trim(),
    visibility: String(data.get("visibility")),
    category: String(data.get("category") || "Operação").trim() || "Operação",
    accent: String(data.get("accent") || "blue"),
    artHeader: String(data.get("artHeader") || "clean"),
    borderStyle: String(data.get("borderStyle") || "soft"),
    ownerId: currentUser.id,
    companyId: currentUser.companyId,
    assignedAgentIds: data.getAll("agentIds"),
    fields,
    createdAt: new Date().toISOString(),
  });
  saveState();
  closeModal();
  render();
}

function submitTask(data) {
  state.tasks.push({
    id: uid(),
    title: String(data.get("title")).trim(),
    assignedTo: String(data.get("assignedTo")),
    templateId: String(data.get("templateId") || ""),
    ownerId: currentUser.id,
    companyId: currentUser.companyId,
    recurrenceHours: Number(data.get("recurrenceHours") || 0),
    startHour: String(data.get("startHour") || "08:00"),
    endHour: String(data.get("endHour") || "18:00"),
    done: false,
    completedLocation: "",
    lastNotifiedAt: null,
    createdAt: new Date().toISOString(),
  });
  saveState();
  render();
}

function submitUser(formType, data) {
  const email = String(data.get("email")).trim().toLowerCase();
  if (state.users.some((item) => item.email.toLowerCase() === email)) return alert("Email já cadastrado.");
  const user = {
    id: uid(),
    name: String(data.get("name")).trim(),
    email,
    phone: String(data.get("phone")).trim(),
    password: String(data.get("password")),
    role: formType === "company-user" ? "company" : "agent",
    companyId: formType === "company-user" ? uid() : currentUser.companyId,
    verified: true,
    createdAt: new Date().toISOString(),
  };
  state.users.push(user);
  saveState();
  closeModal();
  render();
}

async function submitChecklist(form, data) {
  const tpl = state.templates.find((item) => item.id === form.dataset.templateId);
  if (!tpl) return;
  const answers = [];
  for (const field of tpl.fields) {
    answers.push({
      fieldId: field.id,
      title: field.title,
      kind: field.kind,
      status: field.options.check ? String(data.get(`${field.id}_status`) || "") : "",
      checked: field.options.check ? data.get(`${field.id}_status`) === "ok" : undefined,
      text: String(data.get(`${field.id}_text`) || ""),
      transcript: String(data.get(`${field.id}_transcript`) || ""),
      location: String(data.get(`${field.id}_location`) || ""),
      ip: String(data.get(`${field.id}_ip`) || ""),
      photos: safeJson(String(data.get(`${field.id}_photos`) || "[]"), []),
      photo: await fileToDataUrl(data.get(`${field.id}_photo`)),
      selfieDoc: (await fileToDataUrl(data.get(`${field.id}_selfieDoc`))) || String(data.get(`${field.id}_selfieDoc_existing`) || ""),
      audio: String(data.get(`${field.id}_audio`) || ""),
      signature: String(data.get(`${field.id}_signature`) || ""),
    });
  }
  const existingId = form.dataset.submissionId || "";
  const payload = {
    id: existingId || uid(),
    templateId: tpl.id,
    templateTitle: tpl.title,
    templateAccent: tpl.accent || "blue",
    templateCategory: tpl.category || "Operação",
    templateArtHeader: tpl.artHeader || "clean",
    templateBorderStyle: tpl.borderStyle || "soft",
    taskId: form.dataset.taskId || "",
    companyId: tpl.companyId,
    filledBy: currentUser.id,
    answers,
    createdAt: existingId ? state.submissions.find((item) => item.id === existingId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (existingId) {
    state.submissions = state.submissions.map((item) => (item.id === existingId ? payload : item));
  } else {
    state.submissions.push(payload);
  }
  if (form.dataset.taskId) {
    const task = state.tasks.find((item) => item.id === form.dataset.taskId);
    if (task) {
      task.done = true;
      task.completedLocation = firstLocationFromAnswers(answers);
    }
  }
  saveState();
  closeModal();
  currentPage = "reports";
  render();
}

function firstLocationFromAnswers(answers) {
  return answers.find((answer) => answer.location)?.location || "";
}

function handleGlobalClick(event) {
  const target = event.target.closest("[data-action], [data-page], [data-auth-mode]");
  if (!target) return;
  if (target.dataset.page) {
    currentPage = target.dataset.page;
    render();
    closeMobileMenu();
  }
  if (target.dataset.authMode) {
    authMode = target.dataset.authMode;
    pendingVerification = null;
    render();
  }
  const action = target.dataset.action;
  if (!action) return;
  if (action === "logout") {
    setSession(null);
    render();
  }
  if (action === "toggle-mobile-menu") toggleMobileMenu();
  if (action === "close-mobile-menu") closeMobileMenu();
  if (action === "install-app") installApp();
  if (action === "toggle-theme") {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("luma.theme", next);
    applyTheme();
  }
  if (action === "cancel-verification") {
    pendingVerification = null;
    render();
  }
  if (action === "open-template-modal") openTemplateModal();
  if (action === "add-builder-field") addBuilderField();
  if (action === "close-modal") closeModal();
  if (action === "start-fill") {
    closeModal();
    openFillModal(target.dataset.id, target.dataset.taskId || "");
  }
  if (action === "open-fill-picker") openFillPickerModal();
  if (action === "select-check-status") selectCheckStatus(target.dataset.field, target.dataset.value);
  if (action === "open-photo-picker") openPhotoPicker(target.dataset.field);
  if (action === "remove-photo") removePhoto(target.dataset.field, Number(target.dataset.index));
  if (action === "open-observation-modal") openObservationModal(target.dataset.field);
  if (action === "save-observation") saveObservation(target.dataset.field);
  if (action === "close-this-modal") target.closest(".modal-backdrop")?.remove();
  if (action === "capture-location") captureLocation(target.dataset.field);
  if (action === "start-audio") startAudio(target.dataset.field);
  if (action === "stop-audio") stopAudio(target.dataset.field);
  if (action === "view-report") showReport(target.dataset.id, false);
  if (action === "edit-submission") editSubmission(target.dataset.id);
  if (action === "print-report") showReport(target.dataset.id, true);
  if (action === "delete-submission") deleteSubmission(target.dataset.id);
  if (action === "browser-print") window.print();
  if (action === "open-company-modal") openUserModal("company");
  if (action === "open-agent-modal") openUserModal("agent");
  if (action === "request-notification") requestNotification();
  if (action === "delete-task") deleteTask(target.dataset.id);
  if (action === "delete-template") deleteTemplate(target.dataset.id);
  if (action === "duplicate-template") duplicateTemplate(target.dataset.id);
  if (action === "toggle-task") toggleTask(target.dataset.id, target.checked);
}

function handleChange(event) {
  const input = event.target;
  if (input.matches("[data-photo-input]")) addPhotosFromInput(input);
  else if (input.matches('input[type="file"]')) previewFile(input);
  if (input.matches(".field-kind")) {
    const node = input.closest(".builder-field");
    const isSignature = input.value === "signature";
    node.querySelector('[data-option="check"]').checked = !isSignature;
    node.querySelector('[data-option="selfieDoc"]').checked = isSignature;
    node.querySelector('[data-option="location"]').checked = isSignature;
  }
}

function handleInput(event) {
  if (event.target.matches("[data-signature]")) return;
}

function closeModal() {
  const modals = document.querySelectorAll(".modal-backdrop");
  modals[modals.length - 1]?.remove();
  mediaRecorder = null;
  chunks = [];
}

function openPhotoPicker(fieldId) {
  document.querySelector(`[data-photo-input="${fieldId}"]`)?.click();
}

async function addPhotosFromInput(input) {
  const fieldId = input.dataset.photoInput;
  const hidden = document.querySelector(`input[name="${fieldId}_photos"]`);
  if (!hidden) return;
  const current = safeJson(hidden.value, []);
  const files = [...(input.files || [])].filter((file) => file.type.startsWith("image/"));
  const nextPhotos = await Promise.all(files.map(fileToDataUrl));
  hidden.value = JSON.stringify([...current, ...nextPhotos.filter(Boolean)]);
  input.value = "";
  renderPhotoStrip(fieldId);
}

function removePhoto(fieldId, index) {
  const hidden = document.querySelector(`input[name="${fieldId}_photos"]`);
  if (!hidden) return;
  const photos = safeJson(hidden.value, []);
  photos.splice(index, 1);
  hidden.value = JSON.stringify(photos);
  renderPhotoStrip(fieldId);
}

function renderPhotoStrip(fieldId) {
  const hidden = document.querySelector(`input[name="${fieldId}_photos"]`);
  const strip = document.querySelector(`[data-photo-strip="${fieldId}"]`);
  if (!hidden || !strip) return;
  const photos = safeJson(hidden.value, []);
  strip.innerHTML = photos.map((src, index) => `
    <figure class="thumb">
      <img src="${src}" alt="Foto ${index + 1}" />
      <button data-action="remove-photo" data-field="${fieldId}" data-index="${index}" type="button" title="Excluir foto">×</button>
    </figure>
  `).join("");
}

function openObservationModal(fieldId) {
  const input = document.querySelector(`input[name="${fieldId}_text"]`);
  const title = document.querySelector(`[data-field-id="${fieldId}"] h3`)?.textContent || "Observação";
  const modal = document.createElement("div");
  modal.className = "modal-backdrop evidence-backdrop";
  modal.innerHTML = `
    <section class="modal evidence-modal">
      <div class="topbar">
        <div>
          <h2>Observações</h2>
          <p>${escapeHtml(title)}</p>
        </div>
        <button class="icon-button" data-action="close-this-modal" type="button">×</button>
      </div>
      <textarea data-observation-editor="${fieldId}" placeholder="Escreva a observação aqui...">${escapeHtml(input?.value || "")}</textarea>
      <div class="toolbar">
        <button class="primary-button" data-action="save-observation" data-field="${fieldId}" type="button">Salvar observação</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
}

function saveObservation(fieldId) {
  const editor = document.querySelector(`[data-observation-editor="${fieldId}"]`);
  const input = document.querySelector(`input[name="${fieldId}_text"]`);
  const preview = document.querySelector(`[data-note-preview="${fieldId}"]`);
  if (!editor || !input || !preview) return;
  input.value = editor.value.trim();
  preview.textContent = input.value;
  preview.classList.toggle("hidden", !input.value);
  editor.closest(".modal-backdrop")?.remove();
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((task) => task.id !== id);
  saveState();
  render();
}

function deleteTemplate(id) {
  if (!confirm("Excluir este modelo?")) return;
  state.templates = state.templates.filter((tpl) => tpl.id !== id);
  saveState();
  render();
}

function editSubmission(id) {
  const submission = visibleSubmissions().find((item) => item.id === id);
  if (!submission) return;
  openFillModal(submission.templateId, submission.taskId || "", submission.id);
}

function deleteSubmission(id) {
  const submission = visibleSubmissions().find((item) => item.id === id);
  if (!submission) return;
  if (!confirm("Excluir este checklist preenchido?")) return;
  state.submissions = state.submissions.filter((item) => item.id !== id);
  saveState();
  render();
}

function duplicateTemplate(id) {
  const tpl = state.templates.find((item) => item.id === id);
  if (!tpl) return;
  state.templates.push({
    ...structuredClone(tpl),
    id: uid(),
    title: `${tpl.title} (cópia)`,
    ownerId: currentUser.id,
    companyId: currentUser.companyId,
    visibility: "private",
    createdAt: new Date().toISOString(),
  });
  saveState();
  render();
}

function toggleTask(id, done) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.done = done;
  if (!done) task.completedLocation = "";
  saveState();
  render();
  if (done) captureTaskLocation(id);
}

function captureTaskLocation(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      task.completedLocation = `${latitude.toFixed(7)}, ${longitude.toFixed(7)} (precisão ${Math.round(accuracy)}m)`;
      saveState();
      render();
    },
    () => {}
  );
}

async function captureLocation(fieldId, options = {}) {
  const input = document.querySelector(`input[name="${fieldId}_location"]`);
  if (!input) return;
  const note = document.querySelector(`[data-location-note="${fieldId}"]`);
  if (!navigator.geolocation) {
    if (!options.silent) alert("Geolocalização não disponível neste navegador.");
    if (note) note.textContent = "Geolocalização indisponível neste navegador.";
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      input.value = `${latitude.toFixed(7)}, ${longitude.toFixed(7)} (precisão ${Math.round(accuracy)}m)`;
      if (note) note.textContent = `Localização capturada: ${input.value}`;
    },
    () => {
      if (!options.silent) alert("Não foi possível capturar a localização.");
      if (note) note.textContent = "Não foi possível capturar a localização.";
    }
  );
}

async function startAudio(fieldId) {
  if (!navigator.mediaDevices?.getUserMedia) return alert("Microfone não disponível.");
  if (mediaRecorder && mediaRecorder.state !== "inactive") stopAudio();
  currentAudioField = fieldId;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    const reader = new FileReader();
    reader.onload = () => {
      const input = document.querySelector(`input[name="${fieldId}_audio"]`);
      input.value = reader.result;
      renderAudioPreview(fieldId);
    };
    reader.readAsDataURL(blob);
  };
  mediaRecorder.start();
  renderAudioPreview(fieldId, true);
  startSpeechRecognition(fieldId);
}

function stopAudio() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }
}

function renderAudioPreview(fieldId, recording = false) {
  const preview = document.querySelector(`[data-audio-preview="${fieldId}"]`);
  const audio = document.querySelector(`input[name="${fieldId}_audio"]`)?.value || "";
  const transcript = document.querySelector(`input[name="${fieldId}_transcript"]`)?.value || "";
  if (!preview) return;
  if (recording) {
    preview.innerHTML = `
      <div class="audio-pill recording">
        <span>Gravando áudio...</span>
        <button class="secondary-button" data-action="stop-audio" data-field="${fieldId}" type="button">Parar</button>
      </div>
    `;
    return;
  }
  preview.innerHTML = audio || transcript ? `
    <div class="audio-pill">
      ${audio ? `<audio controls src="${audio}"></audio>` : ""}
      ${transcript ? `<p>${escapeHtml(transcript)}</p>` : ""}
    </div>
  ` : "";
}

function startSpeechRecognition(fieldId) {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) return;
  const recognition = new Speech();
  recognition.lang = "pt-BR";
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    const text = [...event.results].map((result) => result[0].transcript).join(" ");
    const input = document.querySelector(`input[name="${fieldId}_transcript"]`);
    if (input) input.value = text;
    renderAudioPreview(fieldId);
  };
  recognition.start();
}

function setupSignaturePads() {
  document.querySelectorAll(".signature-pad").forEach((canvas) => {
    const ctx = canvas.getContext("2d");
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = document.documentElement.dataset.theme === "dark" ? "#f3f6f8" : "#17202a";
    };
    resize();
    let drawing = false;
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      const touch = event.touches?.[0];
      return {
        x: (touch?.clientX ?? event.clientX) - rect.left,
        y: (touch?.clientY ?? event.clientY) - rect.top,
      };
    };
    const start = (event) => {
      drawing = true;
      const p = point(event);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      event.preventDefault();
    };
    const move = (event) => {
      if (!drawing) return;
      const p = point(event);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      canvas.nextElementSibling.value = canvas.toDataURL("image/png");
      event.preventDefault();
    };
    const end = () => {
      drawing = false;
      canvas.nextElementSibling.value = canvas.toDataURL("image/png");
      captureLocation(canvas.dataset.signature, { silent: true });
    };
    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
  });
}

function previewFile(input) {
  const file = input.files?.[0];
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    input.parentElement.querySelector("img")?.remove();
    input.insertAdjacentHTML("afterend", `<img class="photo-preview" src="${reader.result}" alt="Pré-visualização" />`);
  };
  reader.readAsDataURL(file);
}

function fileToDataUrl(file) {
  if (!file || !file.size) return Promise.resolve("");
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function requestNotification() {
  if (!("Notification" in window)) return alert("Notificações não disponíveis.");
  Notification.requestPermission().then((permission) => {
    alert(permission === "granted" ? "Notificações ativadas." : "Permissão não concedida.");
  });
}

function startTaskTicker() {
  setInterval(() => {
    if (!currentUser || !("Notification" in window) || Notification.permission !== "granted") return;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    visibleTasks().forEach((task) => {
      if (task.done || !task.recurrenceHours) return;
      const [startH, startM] = task.startHour.split(":").map(Number);
      const [endH, endM] = task.endHour.split(":").map(Number);
      const start = startH * 60 + startM;
      const end = endH * 60 + endM;
      if (currentMinutes < start || currentMinutes > end) return;
      const last = task.lastNotifiedAt ? new Date(task.lastNotifiedAt) : new Date(task.createdAt);
      const due = now - last >= task.recurrenceHours * 60 * 60 * 1000;
      if (!due) return;
      new Notification("Check list profissional", { body: task.title });
      task.lastNotifiedAt = now.toISOString();
      saveState();
    });
  }, 60000);
}

function userName(id) {
  return state.users.find((user) => user.id === id)?.name || "Usuário";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {
    // O app segue funcionando mesmo quando aberto via arquivo local.
  });
}
