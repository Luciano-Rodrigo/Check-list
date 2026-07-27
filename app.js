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
let selectedTaskDate = toDateKey(new Date());
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
    task.dueDate ||= toDateKey(task.createdAt || new Date());
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
      ${navButton("tasks", "Tarefas", "tasks")}
      ${currentUser.role !== "agent" ? navButton("templates", "Modelos", "models") : ""}
      ${navButton("fill", "Preencher", "check")}
      ${navButton("reports", "Checklists preenchidos", "filled")}
      ${["adm", "company"].includes(currentUser.role) ? navButton("users", "Acessos", "users") : ""}
    </nav>
  `;
  const fabAction = currentPage === "tasks" ? "open-task-modal" : "open-fill-picker";
  const fabLabel = currentPage === "tasks" ? "+ Criar tarefa" : "+ Preencher checklist";
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
      <button class="fab" data-action="${fabAction}" type="button">${fabLabel}</button>
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
  const todayTasks = tasks.filter((task) => !task.done && taskDateKey(task) === toDateKey(new Date()));
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
    <section class="dashboard-summary-card">
      <article>
        <span>Modelos disponíveis</span>
        <strong>${templates.length}</strong>
      </article>
      <article>
        <span>Checklists preenchidos</span>
        <strong>${submissions.length}</strong>
      </article>
      <article>
        <span>Tarefas abertas</span>
        <strong>${tasks.filter((t) => !t.done).length}</strong>
      </article>
    </section>
    <section class="grid cols-2 dashboard-lists" style="margin-top:16px">
      <article class="card upcoming-card">
        <h3>Tarefas de hoje</h3>
        ${renderMiniList(todayTasks.slice(0, 4), renderEmptyState("Sem tarefas para hoje!", "tasks"), (task) => `
          <div class="list-item compact-task" data-action="open-task-details" data-id="${task.id}">
            <strong>${escapeHtml(task.title)}</strong>
            <span class="small">${task.recurrenceHours ? `A cada ${task.recurrenceHours}h` : "Tarefa simples"} · ${formatDateOnly(taskDateKey(task))}</span>
          </div>
        `)}
      </article>
      <article class="card">
        <h3>Últimos preenchimentos</h3>
        ${renderMiniList(submissions.slice(-4).reverse(), "Nenhum preenchimento ainda.", (item) => `
          <div class="list-item">
            <strong>${escapeHtml(item.templateTitle)}</strong>
            <span class="small">${formatDate(item.createdAt)} por ${escapeHtml(userName(item.filledBy))}</span>
          </div>
        `)}
      </article>
    </section>
  `;
}

function renderMiniList(items, empty, mapper) {
  if (items.length) return `<div class="list">${items.map(mapper).join("")}</div>`;
  return String(empty).trim().startsWith("<") ? empty : `<div class="empty">${empty}</div>`;
}

function renderEmptyState(message, icon = "tasks") {
  return `
    <div class="empty-state">
      <span class="empty-icon">${iconUi(icon)}</span>
      <strong>${escapeHtml(message)}</strong>
    </div>
  `;
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
          ${tpl.ownerId === currentUser.id || currentUser.role === "adm" ? `<button class="secondary-button" data-action="edit-template" data-id="${tpl.id}" type="button">Editar</button>` : ""}
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
    close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/></svg>`,
    filled: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5V4Zm3 4h8v2H8V8Zm0 4h8v2H8v-2Zm0 4h5v2H8v-2Z"/></svg>`,
    tasks: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h14v2H7V5Zm0 6h14v2H7v-2Zm0 6h14v2H7v-2ZM3 5h2v2H3V5Zm0 6h2v2H3v-2Zm0 6h2v2H3v-2Z"/></svg>`,
    bell: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.8 2.8 0 0 0 2.7-2h-5.4A2.8 2.8 0 0 0 12 22Zm7-6-1.5-1.7V10a5.5 5.5 0 0 0-4.2-5.4V3a1.3 1.3 0 0 0-2.6 0v1.6A5.5 5.5 0 0 0 6.5 10v4.3L5 16v2h14v-2Z"/></svg>`,
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
  const selectedTasks = tasks.filter((task) => taskDateKey(task) === selectedTaskDate);
  const openCount = tasks.filter((task) => !task.done).length;
  const doneCount = tasks.filter((task) => task.done).length;
  return `
    ${pageHeader("Tarefas", "Agenda visual das tarefas e compromissos.", `<button class="icon-button" data-action="request-notification" type="button" title="Ativar notificações" aria-label="Ativar notificações">${iconUi("bell")}</button>`)}
    <section class="task-summary">
      <article><span>Abertas</span><strong>${openCount}</strong></article>
      <article><span>Concluídas</span><strong>${doneCount}</strong></article>
      <article><span>No dia</span><strong>${selectedTasks.length}</strong></article>
    </section>
    ${renderTaskCalendar(tasks)}
  `;
}

function renderTaskCalendar(tasks) {
  const selected = dateFromKey(selectedTaskDate);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells = [];
  const taskCounts = tasks.reduce((acc, task) => {
    const key = taskDateKey(task);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  for (let i = 0; i < startOffset; i += 1) cells.push(`<span class="calendar-cell muted-cell"></span>`);
  for (let day = 1; day <= totalDays; day += 1) {
    const key = toDateKey(new Date(year, month, day));
    const count = taskCounts[key] || 0;
    cells.push(`
      <button class="calendar-cell ${key === selectedTaskDate ? "active" : ""} ${count ? "has-task" : ""}" data-action="open-task-day" data-date="${key}" type="button">
        <span>${day}</span>
        ${count ? `<small>${count}</small>` : ""}
      </button>
    `);
  }
  return `
    <section class="task-calendar card">
      <div class="calendar-head">
        <button class="icon-button calendar-nav" data-action="change-task-month" data-offset="-1" type="button" title="Mês anterior">&lt;</button>
        <strong>${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(selected)}</strong>
        <button class="icon-button calendar-nav" data-action="change-task-month" data-offset="1" type="button" title="Próximo mês">&gt;</button>
        <span>${tasks.length} tarefa(s)</span>
      </div>
      <div class="calendar-weekdays">
        ${["D", "S", "T", "Q", "Q", "S", "S"].map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="calendar-grid">${cells.join("")}</div>
    </section>
  `;
}

function renderTask(task) {
  const tpl = state.templates.find((item) => item.id === task.templateId);
  return `
    <article class="list-item task-card ${task.done ? "done" : ""}" data-action="open-task-details" data-id="${task.id}">
      <div class="list-item-head">
        <div>
          <label class="inline-check">
            <input type="checkbox" data-action="toggle-task" data-id="${task.id}" ${task.done ? "checked" : ""} />
            <strong>${escapeHtml(task.title)}</strong>
          </label>
          <div class="small">Para ${escapeHtml(userName(task.assignedTo))} · ${task.recurrenceHours ? `a cada ${task.recurrenceHours}h entre ${task.startHour} e ${task.endHour}` : "tarefa simples"}</div>
          <div class="small">Agenda: ${formatDateOnly(taskDateKey(task))}</div>
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

function renderTaskForm() {
  const templates = visibleTemplates();
  const assignOptions = currentUser.role === "company"
    ? `<option value="${currentUser.id}">Minha empresa</option>${agentsForCompany().map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("")}`
    : `<option value="${currentUser.id}">Eu</option>`;
  const templateOptions = `<option value="">Sem checklist vinculado</option>${templates.map((tpl) => `<option value="${tpl.id}">${escapeHtml(tpl.title)}</option>`).join("")}`;
  return `
    <form class="form" data-form="task">
      <div class="form-row">
        <label>Tarefa</label>
        <input name="title" placeholder="Ex.: Vistoriar loja 2" required />
      </div>
      <div class="split">
        <div class="form-row">
          <label>Data</label>
          <input name="dueDate" type="date" value="${selectedTaskDate}" required />
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
  `;
}

function openTaskModal() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal compact-modal">
      <div class="modal-head">
        <div>
          <h2>Criar tarefa</h2>
          <p class="muted">Defina o dia, o responsável e um checklist vinculado se precisar.</p>
        </div>
        <button class="icon-button" data-action="close-modal" type="button" title="Fechar">×</button>
      </div>
      ${renderTaskForm()}
    </section>
  `;
  document.body.appendChild(modal);
}

function openTaskDayModal(dateKey) {
  selectedTaskDate = dateKey || selectedTaskDate;
  const tasks = visibleTasks().filter((task) => taskDateKey(task) === selectedTaskDate);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal compact-modal task-day-modal">
      <div class="modal-head">
        <div>
          <span class="template-kicker">Agenda</span>
          <h2>${formatDateOnly(selectedTaskDate)}</h2>
          <p class="muted">${tasks.length ? `${tasks.length} tarefa(s) cadastrada(s)` : "Nenhuma tarefa cadastrada para este dia."}</p>
        </div>
        <button class="icon-button" data-action="close-modal" type="button" title="Fechar">×</button>
      </div>
      <div class="list">
        ${tasks.map(renderTask).join("") || renderEmptyState("Sem tarefas neste dia!", "tasks")}
      </div>
      <button class="primary-button icon-text" data-action="open-task-modal" type="button">${iconUi("tasks")} Criar tarefa neste dia</button>
    </section>
  `;
  document.body.appendChild(modal);
}

function openTaskDetailsModal(id) {
  const task = visibleTasks().find((item) => item.id === id);
  if (!task) return;
  const tpl = state.templates.find((item) => item.id === task.templateId);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal compact-modal task-detail-modal">
      <div class="modal-head">
        <div>
          <span class="template-kicker">${task.done ? "Concluída" : "Aberta"}</span>
          <h2>${escapeHtml(task.title)}</h2>
          <p class="muted">Agenda: ${formatDateOnly(taskDateKey(task))}</p>
        </div>
        <button class="icon-button" data-action="close-modal" type="button" title="Fechar">×</button>
      </div>
      <div class="detail-grid">
        <p><strong>Responsável</strong><span>${escapeHtml(userName(task.assignedTo))}</span></p>
        <p><strong>Tipo</strong><span>${task.recurrenceHours ? `Recorrente a cada ${task.recurrenceHours}h` : "Tarefa simples"}</span></p>
        <p><strong>Janela</strong><span>${task.startHour || "08:00"} até ${task.endHour || "18:00"}</span></p>
        <p><strong>Checklist</strong><span>${tpl ? escapeHtml(tpl.title) : "Sem checklist vinculado"}</span></p>
        ${task.completedLocation ? `<p><strong>Local de conclusão</strong><span>${escapeHtml(task.completedLocation)}</span></p>` : ""}
      </div>
      <div class="toolbar">
        ${tpl ? `<button class="primary-button" data-action="start-fill" data-id="${tpl.id}" data-task-id="${task.id}" type="button">Preencher checklist</button>` : ""}
        <button class="danger-button" data-action="delete-task" data-id="${task.id}" type="button">Excluir tarefa</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
}

function openTemplateModal(templateId = "") {
  const editing = state.templates.find((item) => item.id === templateId);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal">
      <div class="topbar">
        <div>
          <h2>${editing ? "Editar modelo" : "Novo modelo"}</h2>
          <p>${editing ? "Ajuste campos, evidências e distribuição deste modelo." : "Defina campos, evidências e distribuição para agentes."}</p>
        </div>
        <button class="icon-button" data-action="close-modal" type="button">×</button>
      </div>
      <form class="form" data-form="template" data-template-id="${editing?.id || ""}">
        <div class="split">
          <div class="form-row">
            <label>Nome do modelo</label>
            <input name="title" value="${escapeHtml(editing?.title || "")}" required />
          </div>
          <div class="form-row">
            <label>Visibilidade</label>
            <select name="visibility">
              <option value="private" ${editing?.visibility === "private" ? "selected" : ""}>Privado</option>
              <option value="public" ${editing?.visibility === "public" ? "selected" : ""}>Público</option>
            </select>
          </div>
        </div>
        <div class="split">
          <div class="form-row">
            <label>Categoria visual</label>
            <input name="category" placeholder="Ex.: Segurança, Estoque, Oficina" value="${escapeHtml(editing?.category || "")}" />
          </div>
          <div class="form-row">
            <label>Cor do modelo</label>
            <select name="accent">
              ${renderSelectedOptions([
                ["blue", "Azul profissional"],
                ["teal", "Verde técnico"],
                ["violet", "Violeta atendimento"],
                ["amber", "Âmbar segurança"],
                ["rose", "Rosa controle"],
              ], editing?.accent || "blue")}
            </select>
          </div>
        </div>
        <div class="split">
          <div class="form-row">
            <label>Cabeçalho artístico</label>
            <select name="artHeader">
              ${renderSelectedOptions([
                ["clean", "Minimalista"],
                ["stripe", "Faixa lateral"],
                ["glass", "Vidro suave"],
                ["solid", "Bloco de cor"],
              ], editing?.artHeader || "clean")}
            </select>
          </div>
          <div class="form-row">
            <label>Borda do checklist</label>
            <select name="borderStyle">
              ${renderSelectedOptions([
                ["soft", "Suave"],
                ["line", "Linha fina"],
                ["shadow", "Sombra"],
                ["frame", "Moldura"],
              ], editing?.borderStyle || "soft")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <label>Descrição</label>
          <textarea name="description">${escapeHtml(editing?.description || "")}</textarea>
        </div>
        ${currentUser.role === "company" ? `
          <div class="form-row">
            <label>Agentes com acesso</label>
            <div class="checkline">
              ${agentsForCompany().map((a) => `<label><input type="checkbox" name="agentIds" value="${a.id}" ${editing?.assignedAgentIds?.includes(a.id) ? "checked" : ""} /> ${escapeHtml(a.name)}</label>`).join("") || `<span class="small">Crie agentes para distribuir modelos específicos.</span>`}
            </div>
          </div>
        ` : ""}
        <div class="form-row">
          <label>Campos do checklist</label>
          <div id="builder-fields" class="grid"></div>
          <button class="secondary-button" data-action="add-builder-field" type="button">Adicionar campo</button>
        </div>
        <button class="primary-button" type="submit">${editing ? "Salvar alterações" : "Salvar modelo"}</button>
      </form>
    </section>
  `;
  document.body.appendChild(modal);
  if (editing?.fields?.length) editing.fields.forEach(addBuilderField);
  else addBuilderField();
}

function renderSelectedOptions(options, selectedValue) {
  return options.map(([value, label]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${label}</option>`).join("");
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

function openChecklistSuccessModal(submissionId) {
  const submission = state.submissions.find((item) => item.id === submissionId);
  if (!submission) return;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal compact-modal success-modal">
      <div class="success-check">${iconUi("check")}</div>
      <h2>Checklist preenchido com sucesso!</h2>
      <p class="muted">${escapeHtml(submission.templateTitle)} foi salvo e já está disponível nos checklists preenchidos.</p>
      <div class="success-actions">
        <button class="secondary-button" data-action="share-whatsapp" data-id="${submission.id}" type="button">Compartilhar PDF no Wpp</button>
        <button class="secondary-button icon-text" data-action="success-pdf" data-id="${submission.id}" type="button">${iconUi("pdf")} Exportar PDF</button>
        <button class="primary-button" data-action="go-dashboard" type="button">Voltar ao painel</button>
        <button class="secondary-button" data-action="fill-another" type="button">Preencher novo checklist</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
}

async function shareSubmissionWhatsapp(id) {
  const submission = state.submissions.find((item) => item.id === id);
  if (!submission) return;
  const text = `Checklist preenchido: ${submission.templateTitle} em ${formatDate(submission.createdAt)} por ${userName(submission.filledBy)}.`;
  const file = new File([await buildSubmissionPdfBlob(submission)], `${safeFileName(submission.templateTitle)}.pdf`, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: submission.templateTitle, text });
    return;
  }
  downloadBlob(file, file.name);
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} PDF baixado: anexe o arquivo ${file.name} nesta conversa.`)}`, "_blank", "noopener");
}

async function buildSubmissionPdfBlob(submission) {
  const stats = reportStats(submission);
  const pages = [];
  let currentLines = [];
  const pushLine = (line = "") => {
    wrapPdfLine(normalizePdfText(line), 88).forEach((wrapped) => {
      if (currentLines.length >= 54) {
        pages.push({ lines: currentLines, images: [] });
        currentLines = [];
      }
      currentLines.push(wrapped);
    });
  };
  [
    "RELATORIO TECNICO DE CHECKLIST",
    "",
    `Checklist: ${submission.templateTitle}`,
    `Categoria: ${submission.templateCategory || "Operacao"}`,
    `Data: ${formatDate(submission.createdAt)}`,
    `Preenchido por: ${userName(submission.filledBy)}`,
    `Registro: ${submission.id}`,
    "",
    "RESUMO EXECUTIVO",
    `Total de itens: ${stats.total} | Conformes: ${stats.ok} | Nao conformes: ${stats.fail} | Evidencias: ${stats.evidence}`,
    "",
    "ITENS VERIFICADOS",
  ].forEach(pushLine);
  submission.answers.forEach((answer, index) => {
    pushLine("");
    pushLine(`${index + 1}. ${answer.title}`);
    pushLine(`Status: ${pdfStatusLabel(answer)}`);
    if (answer.text) pushLine(`Observacao: ${answer.text}`);
    if (answer.transcript) pushLine(`Transcricao do audio: ${answer.transcript}`);
    if (answer.audio) pushLine("Audio: arquivo registrado no app");
    if (answer.location) pushLine(`Localizacao: ${answer.location}`);
    if (answer.ip) pushLine(`IP: ${answer.ip}`);
    const photos = answer.photos?.length ? answer.photos : answer.photo ? [answer.photo] : [];
    if (photos.length) pushLine(`Fotos: ${photos.length} imagem(ns) anexada(s) nas paginas de evidencias.`);
    if (answer.selfieDoc) pushLine("Foto com documento: registrada nas evidencias.");
    if (answer.signature) pushLine("Assinatura: registrada nas evidencias.");
  });
  if (currentLines.length) pages.push({ lines: currentLines, images: [] });

  const evidenceImages = [];
  for (const [answerIndex, answer] of submission.answers.entries()) {
    const photos = answer.photos?.length ? answer.photos : answer.photo ? [answer.photo] : [];
    const entries = [
      ...photos.map((src, index) => ({ src, label: `Item ${answerIndex + 1} - Foto ${index + 1}: ${answer.title}` })),
      ...(answer.selfieDoc ? [{ src: answer.selfieDoc, label: `Item ${answerIndex + 1} - Foto com documento: ${answer.title}` }] : []),
      ...(answer.signature ? [{ src: answer.signature, label: `Item ${answerIndex + 1} - Assinatura: ${answer.title}` }] : []),
    ];
    for (const entry of entries) {
      const image = await dataUrlToPdfJpeg(entry.src);
      if (image) evidenceImages.push({ ...image, label: entry.label });
    }
  }
  evidenceImages.forEach((image) => {
    pages.push({ lines: [normalizePdfText(image.label)], images: [image] });
  });

  return buildPdfDocument(pages);
}

function normalizePdfText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function wrapPdfLine(line, maxLength) {
  if (!line) return [""];
  const words = line.split(/\s+/);
  const rows = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength) {
      if (current) rows.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) rows.push(current);
  return rows;
}

function pdfStatusLabel(answer) {
  const status = reportStatusValue(answer);
  if (status === "ok") return "V - Correto";
  if (status === "fail") return "X - Incorreto";
  return answer.kind === "signature" ? "Assinatura solicitada" : "Nao marcado";
}

function dataUrlToPdfJpeg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const image = new Image();
    image.onload = () => {
      const maxWidth = 900;
      const scale = Math.min(1, maxWidth / image.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      const base64 = dataUrl.split(",")[1] || "";
      resolve({
        bytes: base64ToBytes(base64),
        width: canvas.width,
        height: canvas.height,
      });
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function buildPdfDocument(pages) {
  const encoder = new TextEncoder();
  const objects = [];
  const pageIds = [];
  const addObject = (body) => {
    objects.push(typeof body === "string" ? encoder.encode(body) : body);
    return objects.length;
  };
  addObject("");
  addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((page) => {
    const imageRefs = page.images.map((image) => {
      const id = addObject(pdfStreamObject(image.bytes, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>`));
      return { ...image, id };
    });
    const content = pdfPageContent(page.lines, imageRefs);
    const contentId = addObject(pdfStreamObject(encoder.encode(content), `<< /Length ${encoder.encode(content).length} >>`));
    const xObjects = imageRefs.length
      ? `/XObject << ${imageRefs.map((image, index) => `/Im${index + 1} ${image.id} 0 R`).join(" ")} >>`
      : "";
    const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> ${xObjects} >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[0] = encoder.encode("<< /Type /Catalog /Pages 2 0 R >>");
  objects[1] = encoder.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

  const chunks = [encoder.encode("%PDF-1.4\n")];
  const offsets = [0];
  let length = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const header = encoder.encode(`${index + 1} 0 obj\n`);
    const footer = encoder.encode("\nendobj\n");
    chunks.push(header, object, footer);
    length += header.length + object.length + footer.length;
  });
  const xrefOffset = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(encoder.encode(xref));
  return new Blob(chunks, { type: "application/pdf" });
}

function pdfStreamObject(bytes, dictionary) {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${dictionary}\nstream\n`);
  const suffix = encoder.encode("\nendstream");
  const merged = new Uint8Array(prefix.length + bytes.length + suffix.length);
  merged.set(prefix, 0);
  merged.set(bytes, prefix.length);
  merged.set(suffix, prefix.length + bytes.length);
  return merged;
}

function pdfPageContent(lines, images) {
  const commands = [
    "BT",
    "/F1 10 Tf",
    "46 800 Td",
    "13 TL",
    ...lines.map((line) => `(${pdfEscape(line)}) Tj T*`),
    "ET",
  ];
  images.forEach((image, index) => {
    const maxW = 500;
    const maxH = 560;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const x = Math.round((595 - width) / 2);
    const y = 92;
    commands.push("q", `${width} 0 0 ${height} ${x} ${y} cm`, `/Im${index + 1} Do`, "Q");
  });
  return commands.join("\n");
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function pdfEscape(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function safeFileName(value) {
  return normalizePdfText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "checklist";
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const isSignature = field.kind === "signature";
  return `
    <fieldset class="runtime-field ${isSignature ? "signature-field" : ""}" data-field-id="${field.id}">
      <div class="inspection-card">
        ${isSignature ? `<span class="field-kind-icon">${iconUi("edit")}</span>` : ""}
        <div class="inspection-status">
          ${options.check ? `
            <button class="status-button ok" data-action="select-check-status" data-field="${field.id}" data-value="ok" type="button" title="Correto" aria-label="Correto">${iconUi("check")}</button>
            <button class="status-button fail" data-action="select-check-status" data-field="${field.id}" data-value="fail" type="button" title="Incorreto" aria-label="Incorreto">${iconUi("close")}</button>
            <input type="hidden" name="${field.id}_status" />
          ` : ""}
        </div>
        <h3>${escapeHtml(field.title)}</h3>
        <div class="inspection-actions">
          ${options.photo ? `<button class="tool-icon" data-action="open-photo-picker" data-field="${field.id}" type="button" title="Tirar foto ou escolher imagens">${iconCamera()}</button>` : ""}
          ${options.text ? `<button class="tool-icon" data-action="open-observation-modal" data-field="${field.id}" type="button" title="Observações">${iconChat()}</button>` : ""}
          ${options.audio ? `<button class="tool-icon" data-action="start-audio" data-field="${field.id}" type="button" title="Gravar áudio">${iconMic()}</button>` : ""}
        </div>
        ${isSignature ? `
          <div class="signature-inline">
            <button class="primary-button signature-open-button" data-action="open-signature-modal" data-field="${field.id}" type="button">Assinar</button>
            <div class="signature-preview empty-signature" data-signature-preview="${field.id}">Assinatura ainda não registrada.</div>
            <input type="hidden" name="${field.id}_signature" />
          </div>
        ` : ""}
      </div>
      ${options.text ? `<input type="hidden" name="${field.id}_text" /><div class="evidence-note hidden" data-note-preview="${field.id}"></div>` : ""}
      ${options.photo ? `<input class="hidden-file" name="${field.id}_photo_input" data-photo-input="${field.id}" type="file" accept="image/*" multiple /><input type="hidden" name="${field.id}_photos" value="[]" /><div class="photo-strip" data-photo-strip="${field.id}"></div>` : ""}
      ${options.audio ? `<input type="hidden" name="${field.id}_audio" /><input type="hidden" name="${field.id}_transcript" /><div class="audio-strip" data-audio-preview="${field.id}"></div>` : ""}
      ${options.location || options.check ? `<input type="hidden" name="${field.id}_location" /><span class="small location-note" data-location-note="${field.id}">${isSignature ? "Localização será capturada ao assinar." : "Localização será capturada ao selecionar o resultado."}</span>` : ""}
      ${options.selfieDoc ? `<input type="hidden" name="${field.id}_selfieDoc_existing" /><div class="form-row"><label>Foto da pessoa com documento</label><input name="${field.id}_selfieDoc" type="file" accept="image/*" capture="user" /></div>` : ""}
      ${isSignature ? `<input type="hidden" name="${field.id}_ip" value="Indisponível no navegador local" />` : ""}
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
    if (answer.signature) renderSignaturePreview(fieldId, answer.signature);
    setInputValue(`${fieldId}_selfieDoc_existing`, answer.selfieDoc || "");
  });
}

function setInputValue(name, value) {
  const input = document.querySelector(`[name="${name}"]`);
  if (input) input.value = value;
}

function renderSignaturePreview(fieldId, src) {
  const preview = document.querySelector(`[data-signature-preview="${fieldId}"]`);
  if (!preview || !src) return;
  preview.classList.remove("empty-signature");
  preview.innerHTML = `<img src="${src}" alt="Assinatura registrada" />`;
}

function openSignatureModal(fieldId) {
  const title = document.querySelector(`[data-field-id="${fieldId}"] h3`)?.textContent || "Assinatura";
  const existing = document.querySelector(`input[name="${fieldId}_signature"]`)?.value || "";
  const modal = document.createElement("div");
  modal.className = "modal-backdrop signature-backdrop";
  modal.innerHTML = `
    <section class="modal signature-modal">
      <div class="signature-modal-head">
        <div>
          <span class="template-kicker">Assinatura</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <button class="icon-button" data-action="close-this-modal" type="button" title="Fechar">×</button>
      </div>
      <div class="signature-board">
        <canvas class="signature-pad signature-pad-large" data-signature="${fieldId}"></canvas>
        <input type="hidden" name="${fieldId}_signature_temp" value="${escapeHtml(existing)}" />
      </div>
      <div class="signature-floating-actions">
        <button class="secondary-button" data-action="clear-signature" data-field="${fieldId}" type="button">Limpar</button>
        <button class="primary-button signature-done-button" data-action="save-signature" data-field="${fieldId}" type="button">Concluir</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  const canvas = modal.querySelector(".signature-pad");
  setupSignaturePad(canvas);
  if (existing) drawSignatureOnCanvas(canvas, existing);
}

function saveSignature(fieldId) {
  const modal = document.querySelector(".signature-backdrop");
  const temp = modal?.querySelector(`input[name="${fieldId}_signature_temp"]`)?.value || "";
  if (!temp) return alert("Faça a assinatura antes de concluir.");
  setInputValue(`${fieldId}_signature`, temp);
  renderSignaturePreview(fieldId, temp);
  captureLocation(fieldId, { silent: true });
  modal?.remove();
}

function clearSignature(fieldId) {
  const modal = document.querySelector(".signature-backdrop");
  const canvas = modal?.querySelector(`[data-signature="${fieldId}"]`);
  const input = modal?.querySelector(`input[name="${fieldId}_signature_temp"]`);
  if (!canvas || !input) return;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  input.value = "";
}

function drawSignatureOnCanvas(canvas, src) {
  const ctx = canvas.getContext("2d");
  const image = new Image();
  image.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
  };
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
  const stats = reportStats(report);
  const failed = report.answers.filter((answer) => reportStatusValue(answer) === "fail");
  const locations = [...new Set(report.answers.map((answer) => answer.location).filter(Boolean))];
  return `
    <header class="report-cover report-a4-cover ${accentClass({ accent: report.templateAccent })}">
      <div>
        <span class="report-label">Relatório técnico de checklist</span>
        <h1>${escapeHtml(report.templateTitle)}</h1>
        <p>${escapeHtml(report.templateCategory || "Operação")} · Check list profissional Luma</p>
      </div>
      <div class="report-code">
        <strong>REGISTRO</strong>
        <span>${escapeHtml(shortId(report.id))}</span>
      </div>
    </header>

    <section class="report-section report-identity">
      <div>
        <strong>Responsável pelo preenchimento</strong>
        <span>${escapeHtml(userName(report.filledBy))}</span>
      </div>
      <div>
        <strong>Data e hora</strong>
        <span>${formatDate(report.createdAt)}</span>
      </div>
      <div>
        <strong>ID completo</strong>
        <span>${escapeHtml(report.id)}</span>
      </div>
      <div>
        <strong>Localização registrada</strong>
        <span>${locations.length ? escapeHtml(locations[0]) : "Não informada"}</span>
      </div>
    </section>

    <section class="report-summary-grid">
      <article><span>Total de itens</span><strong>${stats.total}</strong></article>
      <article><span>Conformes</span><strong>${stats.ok}</strong></article>
      <article><span>Não conformes</span><strong>${stats.fail}</strong></article>
      <article><span>Evidências</span><strong>${stats.evidence}</strong></article>
    </section>

    <section class="report-section">
      <div class="report-section-title">
        <span>01</span>
        <h2>Resumo executivo</h2>
      </div>
      <p class="report-summary-text">
        Checklist preenchido com ${stats.total} item(ns). Foram registrados ${stats.ok} item(ns) conforme(s), ${stats.fail} não conforme(s) e ${stats.evidence} evidência(s) operacional(is).
      </p>
      ${failed.length ? `
        <div class="report-alert">
          <strong>Atenção requerida</strong>
          <span>${failed.length} item(ns) precisam de análise ou ação corretiva.</span>
        </div>
      ` : `
        <div class="report-ok-box">
          <strong>Sem não conformidades registradas</strong>
          <span>O preenchimento não marcou itens como incorretos.</span>
        </div>
      `}
    </section>

    <section class="report-section">
      <div class="report-section-title">
        <span>02</span>
        <h2>Itens verificados</h2>
      </div>
      <table class="report-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Item avaliado</th>
            <th>Status</th>
            <th>Evidência / observação</th>
          </tr>
        </thead>
        <tbody>
          ${report.answers.map((answer, index) => renderReportRow(answer, index)).join("")}
        </tbody>
      </table>
    </section>

    ${renderEvidenceSection(report)}

    <section class="report-section report-signoff">
      <div class="report-section-title">
        <span>04</span>
        <h2>Assinatura e rastreabilidade</h2>
      </div>
      ${renderSignatureBlocks(report)}
    </section>
  `;
}

function reportStats(report) {
  return report.answers.reduce((acc, answer) => {
    const status = reportStatusValue(answer);
    const photos = answer.photos?.length ? answer.photos.length : answer.photo ? 1 : 0;
    acc.total += 1;
    if (status === "ok") acc.ok += 1;
    if (status === "fail") acc.fail += 1;
    if (photos || answer.selfieDoc || answer.signature || answer.audio || answer.text || answer.transcript || answer.location) acc.evidence += 1;
    return acc;
  }, { total: 0, ok: 0, fail: 0, evidence: 0 });
}

function reportStatusValue(answer) {
  return answer.status || (answer.checked === true ? "ok" : answer.checked === false ? "fail" : "");
}

function renderReportRow(answer, index) {
  const evidence = [
    answer.text,
    answer.transcript ? `Áudio/transcrição: ${answer.transcript}` : "",
    answer.location ? `Local: ${answer.location}` : "",
    answer.photos?.length ? `${answer.photos.length} foto(s)` : "",
    answer.signature ? "Assinatura registrada" : "",
  ].filter(Boolean).join(" · ") || "Sem evidência adicional";
  return `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(answer.title)}</td>
      <td>${renderReportStatus(answer)}</td>
      <td>${escapeHtml(evidence)}</td>
    </tr>
  `;
}

function renderEvidenceSection(report) {
  const evidence = report.answers.filter((answer) => answerHasMedia(answer));
  if (!evidence.length) return "";
  return `
    <section class="report-section report-evidence-section">
      <div class="report-section-title">
        <span>03</span>
        <h2>Evidências anexadas</h2>
      </div>
      <div class="report-evidence-grid">
        ${evidence.map((answer) => `
          <article>
            <h3>${escapeHtml(answer.title)}</h3>
            <div class="report-media">
              ${renderReportPhotos(answer)}
              ${answer.selfieDoc ? `<figure><img src="${answer.selfieDoc}" alt="Documento anexado" /><figcaption>Foto com documento</figcaption></figure>` : ""}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function answerHasMedia(answer) {
  return Boolean(answer.photos?.length || answer.photo || answer.selfieDoc);
}

function renderSignatureBlocks(report) {
  const signatures = report.answers.filter((answer) => answer.signature);
  if (!signatures.length) {
    return `
      <div class="signature-grid">
        <div><strong>${escapeHtml(userName(report.filledBy))}</strong><span>Responsável pelo preenchimento</span></div>
        <div><strong>${formatDate(report.createdAt)}</strong><span>Data do registro</span></div>
      </div>
    `;
  }
  return `
    <div class="signature-grid">
      ${signatures.map((answer) => `
        <figure>
          <img src="${answer.signature}" alt="Assinatura" />
          <figcaption>${escapeHtml(answer.title)}</figcaption>
        </figure>
      `).join("")}
    </div>
  `;
}

function shortId(id) {
  return String(id || "").slice(0, 10).toUpperCase();
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
  const existingId = form.dataset.templateId || "";
  const existing = state.templates.find((tpl) => tpl.id === existingId);
  const payload = {
    id: existing?.id || uid(),
    title: String(data.get("title")).trim(),
    description: String(data.get("description")).trim(),
    visibility: String(data.get("visibility")),
    category: String(data.get("category") || "Operação").trim() || "Operação",
    accent: String(data.get("accent") || "blue"),
    artHeader: String(data.get("artHeader") || "clean"),
    borderStyle: String(data.get("borderStyle") || "soft"),
    ownerId: existing?.ownerId || currentUser.id,
    companyId: existing?.companyId || currentUser.companyId,
    assignedAgentIds: data.getAll("agentIds"),
    fields,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (existing) state.templates = state.templates.map((tpl) => (tpl.id === existing.id ? payload : tpl));
  else state.templates.push(payload);
  saveState();
  closeModal();
  render();
}

function submitTask(data) {
  const dueDate = String(data.get("dueDate") || selectedTaskDate || toDateKey(new Date()));
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
    dueDate,
    done: false,
    completedLocation: "",
    lastNotifiedAt: null,
    createdAt: new Date().toISOString(),
  });
  selectedTaskDate = dueDate;
  saveState();
  closeAllModals();
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
  closeAllModals();
  render();
  openChecklistSuccessModal(payload.id);
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
  if (action === "open-task-modal") openTaskModal();
  if (action === "add-builder-field") addBuilderField();
  if (action === "close-modal") closeModal();
  if (action === "start-fill") {
    closeAllModals();
    openFillModal(target.dataset.id, target.dataset.taskId || "");
  }
  if (action === "open-fill-picker") openFillPickerModal();
  if (action === "select-check-status") selectCheckStatus(target.dataset.field, target.dataset.value);
  if (action === "open-photo-picker") openPhotoPicker(target.dataset.field);
  if (action === "remove-photo") removePhoto(target.dataset.field, Number(target.dataset.index));
  if (action === "open-observation-modal") openObservationModal(target.dataset.field);
  if (action === "save-observation") saveObservation(target.dataset.field);
  if (action === "open-signature-modal") openSignatureModal(target.dataset.field);
  if (action === "save-signature") saveSignature(target.dataset.field);
  if (action === "clear-signature") clearSignature(target.dataset.field);
  if (action === "close-this-modal") target.closest(".modal-backdrop")?.remove();
  if (action === "capture-location") captureLocation(target.dataset.field);
  if (action === "start-audio") startAudio(target.dataset.field);
  if (action === "stop-audio") stopAudio(target.dataset.field);
  if (action === "view-report") showReport(target.dataset.id, false);
  if (action === "edit-submission") editSubmission(target.dataset.id);
  if (action === "print-report") showReport(target.dataset.id, true);
  if (action === "delete-submission") deleteSubmission(target.dataset.id);
  if (action === "browser-print") window.print();
  if (action === "share-whatsapp") {
    shareSubmissionWhatsapp(target.dataset.id).catch((error) => {
      if (error?.name !== "AbortError") alert("Não foi possível abrir o compartilhamento do PDF.");
    });
  }
  if (action === "success-pdf") showReport(target.dataset.id, true);
  if (action === "go-dashboard") {
    closeAllModals();
    currentPage = "dashboard";
    render();
  }
  if (action === "fill-another") {
    closeAllModals();
    openFillPickerModal();
  }
  if (action === "open-company-modal") openUserModal("company");
  if (action === "open-agent-modal") openUserModal("agent");
  if (action === "request-notification") requestNotification();
  if (action === "select-task-date") {
    selectedTaskDate = target.dataset.date || selectedTaskDate;
    render();
  }
  if (action === "open-task-day") openTaskDayModal(target.dataset.date || selectedTaskDate);
  if (action === "open-task-details") openTaskDetailsModal(target.dataset.id);
  if (action === "change-task-month") {
    selectedTaskDate = shiftTaskMonth(Number(target.dataset.offset || 0));
    render();
  }
  if (action === "delete-task") deleteTask(target.dataset.id);
  if (action === "edit-template") openTemplateModal(target.dataset.id);
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

function closeAllModals() {
  document.querySelectorAll(".modal-backdrop").forEach((modal) => modal.remove());
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
  closeAllModals();
  render();
}

function deleteTemplate(id) {
  if (!confirm("Excluir este modelo?")) return;
  state.templates = state.templates.filter((tpl) => tpl.id !== id);
  saveState();
  closeAllModals();
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
  closeAllModals();
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
  document.querySelectorAll(".signature-pad").forEach(setupSignaturePad);
}

function setupSignaturePad(canvas) {
  if (!canvas || canvas.dataset.ready === "true") return;
  canvas.dataset.ready = "true";
  const ctx = canvas.getContext("2d");
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
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
    if (!drawing) return;
    drawing = false;
    canvas.nextElementSibling.value = canvas.toDataURL("image/png");
  };
  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
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

function taskDateKey(task) {
  return task.dueDate || toDateKey(task.createdAt || new Date());
}

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return toDateKey(new Date());
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = String(key).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function shiftTaskMonth(offset) {
  const current = dateFromKey(selectedTaskDate);
  const target = new Date(current.getFullYear(), current.getMonth() + offset, 1);
  const day = Math.min(current.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate());
  target.setDate(day);
  return toDateKey(target);
}

function formatDateOnly(key) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(dateFromKey(key));
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
