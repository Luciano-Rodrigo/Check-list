const STORE_KEY = "luma.checklist.profissional.v1";
const SESSION_KEY = "luma.checklist.session.v1";

const initialState = {
  users: [
    {
      id: "u_admin",
      name: "Administrador Luma",
      email: "admin@luma.com",
      phone: "",
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
let signupStep = "kind";
let signupDraft = {};
let planPrices = { personal: 9.90, company: 34.90, companyExtraCollaborator: 4.90 };
let saveQueue = Promise.resolve();
let stateEpoch = 0;
let adminSeedsAdded = false;
const modalReturnFocus = new WeakMap();
let mediaRecorder = null;
let currentAudioField = "";
let deferredInstallPrompt = null;
let chunks = [];

const app = document.getElementById("app");
const templateEl = document.getElementById("field-template");
const DEFAULT_SIGNATURE_TITLE = "Assinatura do responsável";

document.addEventListener("click", handleGlobalClick);
document.addEventListener("submit", handleSubmit);
document.addEventListener("change", handleChange);
document.addEventListener("input", handleInput);
document.addEventListener("keydown", handleModalKeydown);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.querySelectorAll('[data-action="install-app"]').forEach((button) => {
    button.classList.remove("hidden");
  });
});
document.addEventListener("DOMContentLoaded", async () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(STORE_KEY);
  const planResponse = await fetch("/api/plans").catch(() => null);
  if (planResponse?.ok) planPrices = { ...planPrices, ...((await planResponse.json()).prices || {}) };
  const authResponse = await fetch("/api/auth/me").catch(() => null);
  currentUser = authResponse?.ok ? (await authResponse.json()).user : null;
  state = await loadState();
  if (adminSeedsAdded) { adminSeedsAdded = false; await saveState(); }
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
  return await loadRemoteState() || { users: [], templates: [], submissions: [], tasks: [] };
}

function migrateState(nextState) {
  nextState.templates ||= [];
  nextState.submissions ||= [];
  nextState.tasks ||= [];
  const existingIds = new Set(nextState.templates.map((tpl) => tpl.id));
  if (currentUser?.role === "adm") buildSeedTemplates().forEach((tpl) => {
    if (!existingIds.has(tpl.id)) { nextState.templates.push(tpl); adminSeedsAdded = true; }
  });
  nextState.templates.forEach((tpl, index) => {
    tpl.category ||= "Operação";
    tpl.accent ||= ["blue", "teal", "violet", "amber", "rose"][index % 5];
    tpl.artHeader ||= "clean";
    tpl.borderStyle ||= "soft";
    tpl.assignedAgentIds ||= [];
    tpl.statusOkLabel ||= "Correto";
    tpl.statusFailLabel ||= "Incorreto";
    tpl.statusOkIcon ||= "check";
    tpl.statusFailIcon ||= "close";
    tpl.headerFields ||= [];
    tpl.layout ||= [];
    tpl.backgroundStyle ||= "clean";
    tpl.fields = (tpl.fields || []).map(normalizeTemplateField);
  });
  nextState.tasks.forEach((task) => {
    task.templateId ||= "";
    task.completedLocation ||= "";
    task.dueDate ||= toDateKey(task.createdAt || new Date());
    task.dueTime ||= task.startHour || "09:00";
    task.notifyEnabled = Boolean(task.notifyEnabled);
    task.notificationSentAt ||= null;
  });
  return nextState;
}

function saveState() {
  const epoch = stateEpoch;
  const userId = currentUser?.id;
  saveQueue = saveQueue.catch(() => {}).then(() => {
    if (epoch !== stateEpoch || userId !== currentUser?.id) return false;
    return saveRemoteState(structuredClone(state), epoch, userId);
  });
  return saveQueue;
}

async function loadRemoteState() {
  try {
    const response = await fetch("/api/state", { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    stateEpoch++;
    return migrateState(await response.json());
  } catch {
    return null;
  }
}

function mergeSavedState(sent, saved, current) {
  const result = { ...saved };
  for (const key of ["templates", "submissions", "tasks"]) {
    const before = new Map(sent[key].map((item) => [item.id, item]));
    const confirmed = new Map(saved[key].map((item) => [item.id, item]));
    result[key] = current[key].map((item) => {
      const old = before.get(item.id);
      const canonical = confirmed.get(item.id);
      if (!old || !canonical) return item;
      const merged = { ...canonical };
      for (const field of new Set([...Object.keys(old), ...Object.keys(item)])) {
        if (JSON.stringify(old[field]) !== JSON.stringify(item[field])) {
          if (Object.hasOwn(item, field)) merged[field] = item[field];
          else delete merged[field];
        }
      }
      return merged;
    });
    for (const item of saved[key]) if (!before.has(item.id) && !result[key].some((entry) => entry.id === item.id)) result[key].push(item);
  }
  return result;
}

function saveRemoteState(nextState, epoch, userId) {
  return fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(nextState),
  }).then(async (response) => {
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Não foi possível salvar.");
    }
    const body = await response.json();
    if (epoch !== stateEpoch || userId !== currentUser?.id) return false;
    state = mergeSavedState(nextState, body.state, state);
    return true;
  }).catch(async (error) => {
    if (epoch !== stateEpoch || userId !== currentUser?.id) return false;
    stateEpoch++;
    state = await loadState();
    currentUser = (await fetch("/api/auth/me").then((response) => response.json()).catch(() => ({}))).user || null;
    closeAllModals();
    render();
    alert(error.message);
    return false;
  });
}

function setSession(user) {
  currentUser = user;
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
  return state.templates;
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

function planOwner() {
  return currentUser?.role === "agent"
    ? state.users.find((user) => user.role === "company" && user.companyId === currentUser.companyId) || currentUser
    : currentUser;
}

function isPaidPlan(user) {
  return user?.role === "adm" || user?.plan === "paid" && (user?.billingStatus === "admin_granted" || user?.billingStatus === "active" && (!user?.paidUntil || Date.parse(user.paidUntil) > Date.now()));
}

function dailyFillAllowance() {
  const owner = planOwner();
  const paid = isPaidPlan(owner);
  const limit = paid ? Infinity : owner?.role === "company" ? 2 : 3;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const used = state.allowance?.day === today ? state.allowance.used : 0;
  return { limit, used, remaining: Math.max(0, limit - used) };
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
    profile: renderProfile,
  };
  const content = (pageMap[currentPage] || renderDashboard)();
  const navigation = `
    <nav class="nav">
      ${navButton("dashboard", "Painel", "dashboard")}
      ${navButton("tasks", "Tarefas", "tasks")}
      ${currentUser.role !== "agent" ? navButton("templates", "Modelos", "models") : ""}
      ${navButton("fill", "Preencher", "check")}
      ${navButton("reports", "Checklists preenchidos", "filled")}
      ${currentUser.role === "company" ? navButton("users", "Colaboradores", "users") : ""}
      ${currentUser.role === "adm" ? navButton("users", "Administração", "users") : ""}
      ${navButton("profile", "Meu perfil", "users")}
    </nav>
  `;
  const quickActions = currentPage === "users" ? "" : `
    <div class="fab-stack" aria-label="Ações rápidas">
      <button class="fab fab-secondary" data-action="open-task-modal" type="button">${iconUi("plus")} Tarefa</button>
      <button class="fab" data-action="open-fill-picker" type="button">${iconUi("check")} Checklist</button>
    </div>
  `;
  app.innerHTML = `
    <div class="app-shell">
      <header class="mobile-appbar">
        <button class="hamburger" data-action="toggle-mobile-menu" type="button" aria-label="Abrir menu">
          <span></span><span></span><span></span>
        </button>
        <div class="mobile-title">
          ${brandMark()}
          <strong>Checklist Luma</strong>
        </div>
        <button class="icon-button" data-action="toggle-theme" type="button" title="Alternar tema">${iconUi("theme")}</button>
      </header>
      <aside class="sidebar">
        <div class="brand">
          ${brandMark()}
          <div>
            <h1>Check list profissional</h1>
            <p>Luma</p>
          </div>
        </div>
        ${navigation}
        <div class="sidebar-footer">
          <span class="badge">${roleLabel(currentUser.role)} · ${isPaidPlan(planOwner()) ? "Pago" : "Gratuito"}</span>
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
      ${quickActions}
    </div>
  `;
}

function navButton(page, label, icon) {
  return `<button class="${currentPage === page ? "active" : ""}" data-page="${page}" type="button"><span class="nav-icon">${iconUi(icon)}</span><span>${label}</span></button>`;
}

function brandMark() {
  return `<img class="brand-mark" src="assets/luma-logo.png" alt="Luma" />`;
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
          ${brandMark()}
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
        ${authMode === "login" ? renderLoginForm() : renderSignupForm()}
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
    </form>
  `;
}

function renderSignupForm() {
  if (signupStep === "kind") return `
    <div class="signup-stage"><span>1 de 3</span><h2>Como você vai usar?</h2></div>
    <div class="signup-options">
      <button class="signup-option" type="button" data-action="signup-kind" data-kind="personal"><strong>Individual</strong><span>Seu espaço para tarefas e checklists.</span></button>
      <button class="signup-option" type="button" data-action="signup-kind" data-kind="company"><strong>Empresa</strong><span>Organize a equipe e crie acessos para colaboradores.</span></button>
    </div>`;
  if (signupStep === "plan") return renderSignupPlans();
  const company = signupDraft.kind === "company";
  return `
    <div class="signup-stage"><span>2 de 3</span><h2>${company ? "Dados da empresa" : "Seus dados"}</h2></div>
    <form class="form" data-form="signup-details">
      ${company ? `<div class="form-row"><label>Nome da empresa</label><input name="companyName" value="${escapeHtml(signupDraft.companyName || "")}" required /></div>` : ""}
      <div class="form-row">
        <label>Nome</label>
        <input name="name" type="text" autocomplete="name" value="${escapeHtml(signupDraft.name || "")}" required />
      </div>
      <div class="split">
        <div class="form-row">
          <label>Email</label>
          <input name="email" type="email" autocomplete="email" value="${escapeHtml(signupDraft.email || "")}" required />
        </div>
        <div class="form-row">
          <label>Telefone opcional</label>
          <input name="phone" type="tel" value="${escapeHtml(signupDraft.phone || "")}" />
        </div>
      </div>
      <div class="form-row"><label>${company ? "CNPJ" : "CPF"} opcional</label><input name="document" inputmode="numeric" maxlength="18" placeholder="Necessário para o plano pago" value="${escapeHtml(signupDraft.document || "")}" /></div>
      <div class="form-row">
        <label>Senha</label>
        <input name="password" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <div class="toolbar"><button class="ghost-button" type="button" data-action="signup-back">Voltar</button><button class="primary-button" type="submit">Continuar</button></div>
    </form>
  `;
}

function renderSignupPlans() {
  const company = signupDraft.kind === "company";
  const limit = company ? 2 : 3;
  const seats = company ? "Até 2 colaboradores" : "Acesso individual";
  const paidSeats = company ? "Acesso da empresa + 2 colaboradores" : "Acesso individual";
  const price = planPrices[company ? "company" : "personal"];
  return `
    <div class="signup-stage"><span>3 de 3</span><h2>Escolha seu plano</h2><p>${escapeHtml(signupDraft.email || "")}</p></div>
    <div class="plan-options">
      <article class="plan-option"><span>Gratuito</span><h3>R$ 0</h3><p>${limit} preenchimentos por dia, por acesso</p><p>Checklists próprios e tarefas com notificações</p><p>${seats}</p><button class="secondary-button" type="button" data-action="signup-plan" data-plan="free">Começar grátis</button></article>
      <article class="plan-option"><span>Pago</span><h3>${formatMoney(price)} <small>/ mês</small></h3><p>Preenchimentos ilimitados</p><p>Checklists próprios e da comunidade</p><p>Tarefas com notificações e ${paidSeats.toLowerCase()}</p>${company ? `<p class="small">Cada colaborador adicional: ${formatMoney(planPrices.companyExtraCollaborator)}/mês.</p>` : ""}<button class="primary-button" type="button" data-action="signup-plan" data-plan="paid">Assinar</button></article>
    </div><button class="ghost-button" type="button" data-action="signup-back">Voltar</button>
  `;
}

function formatMoney(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function renderDashboard() {
  const tasks = visibleTasks();
  const todayKey = toDateKey(new Date());
  const todayTasks = tasks
    .filter((task) => !task.done && taskDateKey(task) === todayKey)
    .sort((a, b) => taskSortValue(a).localeCompare(taskSortValue(b)));
  const doneToday = tasks.filter((task) => task.done && taskDateKey(task) === todayKey).length;
  return `
    ${pageHeader("Hoje", "")}
    ${currentUser.selectedPlan === "paid" && !isPaidPlan(currentUser) ? `<div class="plan-pending"><span>${currentUser.paidUntil && Date.parse(currentUser.paidUntil) <= Date.now() ? "Assinatura vencida" : "Assinatura aguardando pagamento"}</span><button class="secondary-button" type="button" data-action="manage-payment">Continuar</button></div>` : ""}
    <section class="today-focus">
      <div>
        <h3>${todayTasks.length === 1 ? "1 tarefa pendente" : `${todayTasks.length} tarefas pendentes`}</h3>
        <p>${formatDateOnly(todayKey)} · ${doneToday} concluída(s)</p>
      </div>
      <button class="icon-button" data-action="request-notification" type="button" title="Ativar notificações" aria-label="Ativar notificações">${iconUi("bell")}</button>
    </section>
    <section class="today-list">
      ${renderMiniList(todayTasks, renderEmptyState("Nenhuma tarefa aberta para hoje.", "tasks"), renderTask)}
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
  const privateTemplates = ownTemplates().filter((tpl) => tpl.visibility !== "public");
  const communityTemplates = visibleTemplates().filter((tpl) => tpl.visibility === "public");
  return `
    ${pageHeader("Modelos", "Crie, teste e publique modelos com prévia real de preenchimento e PDF.", canCreate ? `<button class="primary-button icon-text" data-action="open-template-modal" type="button">${iconUi("models")} Novo modelo</button>` : "")}
    <section class="model-section"><div class="section-heading"><h3>Meus modelos privados</h3><span>${privateTemplates.length}</span></div><div class="list">${privateTemplates.map(renderTemplateItem).join("") || `<div class="empty">Nenhum modelo privado criado ainda.</div>`}</div></section>
    <section class="model-section"><div class="section-heading"><h3>Modelos da comunidade</h3><span>${communityTemplates.length}</span></div><label class="community-search"><span>Pesquisar por tema</span><input type="search" data-community-search placeholder="Ex.: veículo, estoque, viagem" /></label><div class="list" data-community-list>${communityTemplates.map(renderTemplateItem).join("") || `<div class="empty">Nenhum modelo da comunidade disponível neste plano.</div>`}</div></section>
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
  const allowance = dailyFillAllowance();
  return `
    ${pageHeader("Preencher checklist", allowance.limit === Infinity ? "Preenchimentos ilimitados." : `${allowance.remaining} de ${allowance.limit} preenchimentos restantes hoje.`)}
    <div class="template-gallery">
      ${templates.map((tpl) => `
        <article class="card template-card ${accentClass(tpl)}">
          <span class="template-kicker">${escapeHtml(tpl.category || "Operação")}</span>
          <h3>${escapeHtml(tpl.title)}</h3>
          <p class="muted">${escapeHtml(tpl.description || "Sem descrição")}</p>
          <div class="toolbar">
            <span class="badge">${tpl.visibility === "public" ? "Público" : "Privado"}</span>
            <button class="primary-button icon-text" data-action="start-fill" data-id="${tpl.id}" type="button" ${allowance.remaining === 0 ? "disabled" : ""}>${iconUi("check")} Preencher</button>
          </div>
        </article>
      `).join("") || `<div class="empty">Nenhum modelo disponível para você.</div>`}
    </div>
  `;
}

function accentClass(tpl) {
  return `accent-${tpl.accent || "blue"}`;
}

function backgroundClass(item = {}) {
  return `pdf-background-${item.backgroundStyle || item.templateBackground || "clean"}`;
}

function accentColor(tpl = {}) {
  return {
    blue: "#111113",
    teal: "#34363a",
    violet: "#55575d",
    amber: "#777a81",
    rose: "#26272b",
  }[tpl.accent || "blue"] || "#111113";
}

function statusLabels(tpl = {}) {
  return {
    okLabel: tpl.statusOkLabel || "Correto",
    failLabel: tpl.statusFailLabel || "Incorreto",
    ntLabel: "Não tem",
    okIcon: tpl.statusOkIcon || "check",
    failIcon: tpl.statusFailIcon || "close",
    ntIcon: "nt",
  };
}

function statusChoiceIcon(name) {
  const icons = {
    check: iconUi("check"),
    "double-check": `<span class="status-symbol">VV</span>`,
    thumb: `<span class="status-symbol">OK</span>`,
    star: `<span class="status-symbol">*</span>`,
    shield: `<span class="status-symbol">#</span>`,
    close: iconUi("close"),
    alert: `<span class="status-symbol">!</span>`,
    flag: `<span class="status-symbol">F</span>`,
    wrench: `<span class="status-symbol">A</span>`,
    ban: `<span class="status-symbol">B</span>`,
    nt: `<span class="status-symbol">NT</span>`,
  };
  return icons[name] || iconUi("check");
}

function iconCamera() {
  return `
    <svg class="camera-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 8.5A2.5 2.5 0 0 1 7.5 6h1.8l1.1-1.5h3.2L14.7 6h1.8A2.5 2.5 0 0 1 19 8.5v7A2.5 2.5 0 0 1 16.5 18h-9A2.5 2.5 0 0 1 5 15.5v-7Z"/>
      <circle cx="12" cy="12.2" r="3.1"/>
      <path d="M18 5v3M16.5 6.5h3"/>
    </svg>
  `;
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
    gallery: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4V5Zm2 2v8.6l3.7-3.7 2.8 2.8 2.1-2.1L18 16V7H6Zm9 1.5a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z"/></svg>`,
    card: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 4h16V7H4v2Zm2 5h6v2H6v-2Z"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.4 8.6 4.6 4.6 4.6-4.6L18 10l-6 6-6-6 1.4-1.4Z"/></svg>`,
  };
  return icons[name] || "";
}

function modalCloseButton(action = "close-modal") {
  return `<button class="icon-button modal-close" data-action="${action}" type="button" title="Fechar" aria-label="Fechar">${iconUi("close")}</button>`;
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
  const selectedTasks = tasks
    .filter((task) => taskDateKey(task) === selectedTaskDate)
    .sort((a, b) => taskSortValue(a).localeCompare(taskSortValue(b)));
  const openCount = tasks.filter((task) => !task.done).length;
  const doneCount = tasks.filter((task) => task.done).length;
  return `
    ${pageHeader("Tarefas", "Agenda visual das tarefas e compromissos.", `
      <button class="secondary-button icon-text" data-action="request-notification" type="button">${iconUi("bell")} Notificações</button>
      <button class="primary-button icon-text" data-action="open-task-modal" type="button">${iconUi("plus")} Nova tarefa</button>
    `)}
    <section class="task-summary">
      <article><span>Abertas</span><strong>${openCount}</strong></article>
      <article><span>Concluídas</span><strong>${doneCount}</strong></article>
      <article><span>No dia</span><strong>${selectedTasks.length}</strong></article>
    </section>
    ${renderTaskCalendar(tasks)}
    <section class="task-day card">
      <div class="section-heading">
        <div>
          <span class="template-kicker">Dia selecionado</span>
          <h3>${formatDateOnly(selectedTaskDate)}</h3>
        </div>
        <button class="secondary-button icon-text" data-action="open-task-modal" type="button">${iconUi("plus")} Cadastrar</button>
      </div>
      <div class="list">
        ${selectedTasks.map(renderTask).join("") || renderEmptyState("Sem tarefas neste dia.", "tasks")}
      </div>
    </section>
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
  const timeLabel = task.dueTime || task.startHour || "09:00";
  return `
    <article class="list-item task-card ${task.done ? "done" : ""}" data-action="open-task-details" data-id="${task.id}">
      <div class="list-item-head">
        <div>
          <label class="inline-check">
            <input type="checkbox" data-action="toggle-task" data-id="${task.id}" ${task.done ? "checked" : ""} />
            <strong>${escapeHtml(task.title)}</strong>
          </label>
          <div class="small">Para ${escapeHtml(userName(task.assignedTo))} · ${formatTime(timeLabel)} · ${task.recurrenceHours ? `a cada ${task.recurrenceHours}h até ${task.endHour}` : "tarefa simples"}</div>
          <div class="task-meta-row">
            <span class="badge">${formatDateOnly(taskDateKey(task))}</span>
            ${task.notifyEnabled ? `<span class="badge dark">${iconUi("bell")} Lembrete</span>` : ""}
          </div>
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
    return renderAdminPanel();
  }
  const paid = isPaidPlan(planOwner());
  const limit = paid ? Infinity : 2;
  const count = agentsForCompany().length;
  return `
    ${pageHeader("Colaboradores", paid ? `${count} colaborador(es). O plano inclui 2; cada adicional custa ${formatMoney(planPrices.companyExtraCollaborator)}/mês.` : `${Math.min(count, limit)} de ${limit} vagas gratuitas em uso`, `<button class="primary-button" data-action="open-agent-modal" type="button" ${count >= limit ? "disabled" : ""}>Novo colaborador</button>`)}
    <div class="list">${agentsForCompany().map(renderUserItem).join("") || `<div class="empty">Nenhum agente cadastrado.</div>`}</div>
  `;
}

function renderProfile() {
  const owner = planOwner();
  const canManagePlan = ["company", "personal"].includes(currentUser.role);
  const planText = isPaidPlan(owner) ? (owner.billingStatus === "admin_granted" ? "Pago liberado pelo administrador" : "Plano pago ativo") : "Plano gratuito";
  return `
    ${pageHeader("Meu perfil", "Informações da conta, segurança e assinatura.")}
    <section class="profile-grid">
      <article class="card"><span class="template-kicker">Conta</span><h3>${escapeHtml(currentUser.name)}</h3><p class="muted">${escapeHtml(currentUser.email)}</p><div class="detail-grid"><p><strong>Tipo de acesso</strong><span>${roleLabel(currentUser.role)}</span></p><p><strong>Telefone</strong><span>${escapeHtml(currentUser.phone || "Não informado")}</span></p><p><strong>Plano</strong><span>${planText}</span></p>${currentUser.companyName ? `<p><strong>Empresa</strong><span>${escapeHtml(currentUser.companyName)}</span></p>` : ""}</div></article>
      <article class="card"><span class="template-kicker">Segurança</span><h3>Trocar senha</h3><form class="form" data-form="change-password"><div class="form-row"><label>Senha atual</label><input name="currentPassword" type="password" autocomplete="current-password" required /></div><div class="form-row"><label>Nova senha</label><input name="nextPassword" type="password" autocomplete="new-password" minlength="8" required /></div><button class="secondary-button" type="submit">Atualizar senha</button></form></article>
      ${canManagePlan ? `<article class="card profile-cancel"><span class="template-kicker">Assinatura</span><h3>Plano e cancelamento</h3><p class="muted">${isPaidPlan(owner) ? "Ao cancelar, seu acesso volta para o plano gratuito e a cobrança recorrente é encerrada no Asaas." : "Você está no plano gratuito. Pode assinar quando quiser."}</p><div class="toolbar">${!isPaidPlan(owner) ? `<button class="primary-button" data-action="renew-plan" type="button">Assinar plano pago</button>` : ""}${isPaidPlan(owner) && owner.billingStatus !== "admin_granted" ? `<button class="danger-button" data-action="open-cancel-plan-modal" type="button">Cancelar meu plano</button>` : ""}</div></article>` : `<article class="card"><span class="template-kicker">Plano</span><h3>${planText}</h3><p class="muted">Este acesso é administrado pelo titular da empresa.</p></article>`}
    </section>
  `;
}

function renderAdminPanel() {
  const companyUsers = state.users.filter((user) => user.role === "company");
  const agentUsers = state.users.filter((user) => user.role === "agent");
  const personalUsers = state.users.filter((user) => user.role === "personal");
  const openTasks = state.tasks.filter((task) => !task.done).length;
  return `
    ${pageHeader("ADM", "", `<button class="primary-button icon-text" data-action="open-company-modal" type="button">${iconUi("plus")} Nova empresa</button>`)}
    <section class="admin-overview">
      <article><span>Empresas</span><strong>${companyUsers.length}</strong></article>
      <article><span>Agentes</span><strong>${agentUsers.length}</strong></article>
      <article><span>Tarefas abertas</span><strong>${openTasks}</strong></article>
      <article><span>Checklists</span><strong>${state.submissions.length}</strong></article>
    </section>
    <section class="admin-sections">
      ${renderAdminSection("Acessos e contas", `${companyUsers.length} empresas · ${personalUsers.length} individuais · ${agentUsers.length} colaboradores`, `
        ${[["Empresas", companyUsers], ["Individuais", personalUsers], ["Colaboradores", agentUsers], ["Administradores", state.users.filter((user) => user.role === "adm")]].filter(([, users]) => users.length).map(([label, users]) => `<h3 class="account-group-title">${label}</h3><div class="list">${users.map(renderUserItem).join("")}</div>`).join("")}
      `, true)}
      ${renderAdminSection("Cobranças Asaas", "Cartão de crédito e Pix", renderBillingForm())}
      ${renderAdminSection("Operação", `${openTasks} tarefas abertas`, `
        <div class="admin-metrics-grid">
          <article><span>Modelos</span><strong>${state.templates.length}</strong></article>
          <article><span>Tarefas totais</span><strong>${state.tasks.length}</strong></article>
          <article><span>Concluídas</span><strong>${state.tasks.filter((task) => task.done).length}</strong></article>
          <article><span>Relatórios</span><strong>${state.submissions.length}</strong></article>
        </div>
      `)}
      ${renderAdminSection("Sistema", "Aplicativo e serviços", `
        <div class="system-checklist">
          <p><strong>Pagamentos</strong><span>Asaas</span></p>
          <p><strong>Notificações</strong><span>Com aplicativo ativo</span></p>
          <p><strong>Sincronização</strong><span>Conexão com servidor necessária</span></p>
        </div>
      `)}
    </section>
  `;
}

function renderAdminSection(title, subtitle, body, open = false) {
  return `
    <details class="admin-section" ${open ? "open" : ""}>
      <summary>
        <span>
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(subtitle)}</small>
        </span>
        <span class="admin-section-toggle">${iconUi("chevron")}</span>
      </summary>
      <div class="admin-section-body">${body}</div>
    </details>
  `;
}

function renderBillingForm() {
  return `
    <form class="form billing-form" data-form="asaas-charge">
      <div class="split">
        <div class="form-row">
          <label>Cliente</label>
          <input name="name" placeholder="Nome ou empresa" required />
        </div>
        <div class="form-row">
          <label>CPF/CNPJ</label>
          <input name="cpfCnpj" inputmode="numeric" placeholder="Somente números" required />
        </div>
      </div>
      <div class="split">
        <div class="form-row">
          <label>Email</label>
          <input name="email" type="email" required />
        </div>
        <div class="form-row">
          <label>Telefone</label>
          <input name="mobilePhone" inputmode="tel" />
        </div>
      </div>
      <div class="split">
        <div class="form-row">
          <label>Valor</label>
          <input name="value" type="number" min="1" step="0.01" placeholder="199.90" required />
        </div>
        <div class="form-row">
          <label>Vencimento</label>
          <input name="dueDate" type="date" value="${toDateKey(new Date())}" required />
        </div>
      </div>
      <div class="split">
        <div class="form-row">
          <label>Forma de cobrança</label>
          <select name="billingType">
            <option value="CREDIT_CARD">Cartão pela Fatura Asaas</option>
            <option value="PIX">Pix com QR Code</option>
          </select>
        </div>
        <div class="form-row">
          <label>Descrição</label>
          <input name="description" placeholder="Assinatura Checklist Luma" />
        </div>
      </div>
      <button class="primary-button icon-text" type="submit">${iconUi("card")} Gerar cobrança</button>
    </form>
    <div class="billing-result" data-billing-result></div>
  `;
}

function renderUserItem(user) {
  const canDelete = canDeleteUser(user);
  const owner = user.role === "agent" ? state.users.find((item) => item.companyId === user.companyId && ["company", "adm"].includes(item.role)) : user;
  const seats = state.users.filter((item) => item.role === "agent" && item.companyId === user.companyId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
  const suspended = user.role === "agent" && (!owner || owner.role !== "adm" && !isPaidPlan(owner) && seats.findIndex((item) => item.id === user.id) >= 2);
  const planLabel = isPaidPlan(user) ? "Pago ativo" : user.selectedPlan === "paid" ? (user.paidUntil && Date.parse(user.paidUntil) <= Date.now() ? "Vencido" : "Pagamento pendente") : "Gratuito";
  return `
    <article class="list-item">
      <div class="list-item-head">
        <div>
          <h3>${escapeHtml(user.name)}</h3>
          <span class="small">${escapeHtml(user.email)} · ${roleLabel(user.role)}</span>
          ${currentUser.role === "adm" ? `<div class="admin-user-info"><span>${escapeHtml(user.companyName || "")}</span><span>${escapeHtml(user.phone || "")}</span><span>${escapeHtml(user.document || "")}</span><span>${user.createdAt ? new Date(user.createdAt).toLocaleDateString("pt-BR") : ""}</span><span>${escapeHtml(user.companyId || "")}</span></div>` : ""}
        </div>
        <div class="toolbar">
          <span class="badge">${user.role === "agent" ? suspended ? "Acesso suspenso" : "Colaborador ativo" : planLabel}</span>
          ${currentUser.role === "adm" && ["personal", "company"].includes(user.role) ? `<button class="secondary-button" data-action="admin-set-plan" data-id="${user.id}" data-plan="${isPaidPlan(user) ? "free" : "paid"}" type="button">${isPaidPlan(user) ? "Definir grátis" : "Liberar pago"}</button>` : ""}
          ${canDelete ? `<button class="danger-button icon-text" data-action="delete-user" data-id="${user.id}" type="button">${iconUi("trash")} Excluir</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function canDeleteUser(user) {
  if (!currentUser || !user || user.id === currentUser.id || user.role === "adm") return false;
  if (currentUser.role === "adm") return true;
  return currentUser.role === "company" && user.role === "agent" && user.companyId === currentUser.companyId;
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
        <label for="task-title">Tarefa</label>
        <input id="task-title" name="title" placeholder="Ex.: Vistoriar loja 2" required />
      </div>
      <div class="split">
        <div class="form-row">
          <label for="task-date">Data</label>
          <input id="task-date" name="dueDate" type="date" value="${selectedTaskDate}" required />
        </div>
        <div class="form-row">
          <label for="task-time">Horário</label>
          <input id="task-time" name="dueTime" type="time" value="09:00" required />
        </div>
      </div>
      <div class="split">
        <div class="form-row">
          <label for="task-assignee">Atribuir para</label>
          <select id="task-assignee" name="assignedTo">${assignOptions}</select>
        </div>
        <label class="toggle-row">
          <input name="notifyEnabled" type="checkbox" />
          <span>
            <strong>Ativar notificação</strong>
            <small>Lembrar no horário cadastrado enquanto o app estiver ativo.</small>
          </span>
        </label>
      </div>
      <details class="task-advanced">
        <summary>Checklist e recorrência</summary>
        <div class="form-row">
        <label for="task-template">Modelo de checklist vinculado</label>
        <select id="task-template" name="templateId">${templateOptions}</select>
      </div>
      <div class="split">
        <div class="form-row">
          <label for="task-recurrence">Recorrência em horas</label>
          <input id="task-recurrence" name="recurrenceHours" type="number" min="0" step="1" placeholder="0 para tarefa simples" />
        </div>
        <div class="split">
          <div class="form-row">
            <label for="task-start">Início</label>
            <input id="task-start" name="startHour" type="time" value="08:00" />
          </div>
          <div class="form-row">
            <label for="task-end">Fim</label>
            <input id="task-end" name="endHour" type="time" value="18:00" />
          </div>
        </div>
      </div>
      </details>
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
        </div>
        ${modalCloseButton()}
      </div>
      ${renderTaskForm()}
    </section>
  `;
  mountModal(modal);
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
        ${modalCloseButton()}
      </div>
      <div class="list">
        ${tasks.map(renderTask).join("") || renderEmptyState("Sem tarefas neste dia!", "tasks")}
      </div>
      <button class="primary-button icon-text" data-action="open-task-modal" type="button">${iconUi("tasks")} Criar tarefa neste dia</button>
    </section>
  `;
  mountModal(modal);
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
          <p class="muted">Agenda: ${formatDateOnly(taskDateKey(task))} às ${formatTime(task.dueTime || task.startHour || "09:00")}</p>
        </div>
        ${modalCloseButton()}
      </div>
      <div class="detail-grid">
        <p><strong>Responsável</strong><span>${escapeHtml(userName(task.assignedTo))}</span></p>
        <p><strong>Tipo</strong><span>${task.recurrenceHours ? `Recorrente a cada ${task.recurrenceHours}h` : "Tarefa simples"}</span></p>
        <p><strong>Janela</strong><span>${task.startHour || "08:00"} até ${task.endHour || "18:00"}</span></p>
        <p><strong>Notificação</strong><span>${task.notifyEnabled ? `Ativa para ${formatTime(task.dueTime || task.startHour || "09:00")}` : "Desativada"}</span></p>
        <p><strong>Checklist</strong><span>${tpl ? escapeHtml(tpl.title) : "Sem checklist vinculado"}</span></p>
        ${task.completedLocation ? `<p><strong>Local de conclusão</strong><span>${escapeHtml(task.completedLocation)}</span></p>` : ""}
      </div>
      <div class="toolbar">
        ${tpl ? `<button class="primary-button" data-action="start-fill" data-id="${tpl.id}" data-task-id="${task.id}" type="button">Preencher checklist</button>` : ""}
        <button class="danger-button" data-action="delete-task" data-id="${task.id}" type="button">Excluir tarefa</button>
      </div>
    </section>
  `;
  mountModal(modal);
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
        </div>
        ${modalCloseButton()}
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
              ${isPaidPlan(planOwner()) ? `<option value="public" ${editing?.visibility === "public" ? "selected" : ""}>Público</option>` : ""}
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
        <div class="split">
          <div class="form-row">
            <label>Nome da marcação positiva</label>
            <input name="statusOkLabel" value="${escapeHtml(editing?.statusOkLabel || "Correto")}" placeholder="Ex.: Aprovado, Conforme, OK" />
          </div>
          <div class="form-row">
            <label>Ícone positivo</label>
            <select name="statusOkIcon">
              ${renderSelectedOptions(statusIconOptions("ok"), editing?.statusOkIcon || "check")}
            </select>
          </div>
        </div>
        <div class="split">
          <div class="form-row">
            <label>Nome da marcação negativa</label>
            <input name="statusFailLabel" value="${escapeHtml(editing?.statusFailLabel || "Incorreto")}" placeholder="Ex.: Reprovado, Ajustar, Falhou" />
          </div>
          <div class="form-row">
            <label>Ícone negativo</label>
            <select name="statusFailIcon">
              ${renderSelectedOptions(statusIconOptions("fail"), editing?.statusFailIcon || "close")}
            </select>
          </div>
        </div>
        <div class="form-row">
          <label>Descrição</label>
          <textarea name="description">${escapeHtml(editing?.description || "")}</textarea>
        </div>
        <div class="form-row">
          <label>Fundo do checklist em PDF</label>
          <span class="small">Escolha um modelo pronto. Os campos que você criar ficam organizados sobre este estilo, sem precisar montar o PDF manualmente.</span>
          ${renderBackgroundPicker(editing?.backgroundStyle || "clean")}
        </div>
        <div class="form-row">
          <label>CabeÃ§alho do preenchimento</label>
          <span class="small">Campos que aparecem antes dos itens, como cliente, OS, equipamento ou endereÃ§o.</span>
          <div id="builder-header-fields" class="grid builder-header-grid"></div>
          <button class="secondary-button" data-action="add-header-field" type="button">Adicionar campo de cabeÃ§alho</button>
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
  mountModal(modal);
  (editing?.headerFields || []).forEach(addHeaderFieldClean);
  if (editing?.fields?.length) editing.fields.forEach(addBuilderField);
  else addBuilderField();
  document.querySelectorAll(".image-builder-field").forEach(setupImageMarkerBuilder);
}

function renderSelectedOptions(options, selectedValue) {
  return options.map(([value, label]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${label}</option>`).join("");
}

function renderBackgroundPicker(selected) {
  const themes = [["clean", "Clássico", "Fundo branco, linhas discretas"], ["blueprint", "Azul suave", "Azul pastel técnico"], ["blush", "Rosa pastel", "Leve e acolhedor"], ["mint", "Verde menta", "Organizado e fresco"], ["sand", "Areia", "Elegante e quente"], ["lavender", "Lavanda", "Criativo e suave"]];
  return `<div class="background-picker">${themes.map(([id, name, description]) => `<label class="background-card background-${id}"><input type="radio" name="backgroundStyle" value="${id}" ${id === selected ? "checked" : ""} /><span class="background-swatch"><i></i><i></i><i></i></span><strong>${name}</strong><small>${description}</small></label>`).join("")}</div>`;
}

function statusIconOptions(kind) {
  return kind === "ok"
    ? [["check", "V / check"], ["double-check", "Duplo check"], ["thumb", "Polegar"], ["star", "Estrela"], ["shield", "Escudo"]]
    : [["close", "X"], ["alert", "Alerta"], ["flag", "Bandeira"], ["wrench", "Ajuste"], ["ban", "Bloqueado"]];
}

function addBuilderField(seed) {
  const holder = document.getElementById("builder-fields");
  if (!holder) return;
  const field = seed ? normalizeTemplateField(seed) : null;
  const node = templateEl.content.firstElementChild.cloneNode(true);
  if (field) {
    node.dataset.fieldId = field.id || "";
    node.querySelector(".field-title").value = field.title || "";
    node.querySelector(".field-kind").value = field.kind || "inspection";
    node.querySelectorAll("[data-option]").forEach((input) => {
      input.checked = Boolean(field.options?.[input.dataset.option]);
    });
  }
  applyBuilderKindDefaults(node, !field);
  if (field?.kind === "image") renderImageBuilderConfig(node, field);
  holder.appendChild(node);
  if (field?.kind === "image") setupImageMarkerBuilder(node);
}

function renderImageBuilderConfig(node, field = {}) {
  node.classList.add("image-builder-field");
  const config = node.querySelector(".image-builder-config") || document.createElement("div");
  config.className = "image-builder-config";
  config.dataset.imageSrc = field.imageSrc || "";
  config.innerHTML = `<div class="image-builder-actions"><label class="secondary-button">Escolher imagem<input class="template-image-upload" type="file" accept="image/*" hidden /></label><button class="secondary-button" data-action="add-image-marker" type="button">Adicionar bolinha</button><span class="small">Adicione uma bolinha e arraste-a até a área que deseja avaliar.</span></div><div class="marker-builder-canvas ${field.imageSrc ? "has-image" : ""}" data-marker-canvas>${field.imageSrc ? `<img src="${field.imageSrc}" alt="Imagem do modelo" />` : `<div class="marker-placeholder">Escolha uma imagem, como o desenho de um veículo.</div>`}${renderImageMarkers(field.imageMarkers || [], "builder")}</div><div class="small" data-marker-count>${(field.imageMarkers || []).length} marcações configuradas</div>`;
  if (!config.parentElement) node.appendChild(config);
}

function renderImageMarkers(markers = [], mode = "builder", fieldId = "") {
  return markers.map((marker) => `<button class="image-marker ${mode === "runtime" && marker.marked ? "marked" : ""}" style="left:${marker.x}%;top:${marker.y}%;" data-action="${mode === "runtime" ? "toggle-image-marker" : ""}" data-field="${fieldId}" data-marker="${marker.id}" type="button" aria-label="Marcação ${escapeHtml(marker.label || "")}"><span></span></button>`).join("");
}

function getImageMarkers(node) {
  return [...node.querySelectorAll(".image-marker")].map((marker) => ({ id: marker.dataset.marker || uid(), x: Number(marker.style.left.replace("%", "")) || 50, y: Number(marker.style.top.replace("%", "")) || 50, label: marker.dataset.label || "" }));
}

function setupImageMarkerBuilder(node) {
  const canvas = node.querySelector("[data-marker-canvas]");
  if (!canvas || canvas.dataset.bound) return;
  canvas.dataset.bound = "true";
  let dragged = null;
  const setPosition = (marker, event) => {
    const rect = canvas.getBoundingClientRect();
    marker.style.left = `${Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100))}%`;
    marker.style.top = `${Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))}%`;
  };
  canvas.addEventListener("pointerdown", (event) => { const marker = event.target.closest(".image-marker"); if (!marker) return; dragged = marker; marker.setPointerCapture?.(event.pointerId); event.preventDefault(); });
  canvas.addEventListener("pointermove", (event) => { if (dragged) setPosition(dragged, event); });
  canvas.addEventListener("pointerup", () => { dragged = null; });
}

function addImageMarker(fieldNode) {
  const config = fieldNode?.querySelector(".image-builder-config");
  const canvas = config?.querySelector("[data-marker-canvas]");
  if (!config || !canvas || !config.dataset.imageSrc) return alert("Escolha uma imagem antes de adicionar marcações.");
  const marker = { id: uid(), x: 50, y: 50, label: "" };
  canvas.insertAdjacentHTML("beforeend", renderImageMarkers([marker], "builder"));
  updateImageMarkerCount(config);
}

async function loadTemplateImage(input) {
  const file = input.files?.[0];
  const config = input.closest(".image-builder-config");
  const canvas = config?.querySelector("[data-marker-canvas]");
  if (!file || !config || !canvas) return;
  const src = await fileToDataUrl(file, { maxSize: 1800, quality: 0.82 });
  if (!src) return alert("Não foi possível abrir esta imagem.");
  const markers = getImageMarkers(config);
  config.dataset.imageSrc = src;
  canvas.classList.add("has-image");
  canvas.innerHTML = `<img src="${src}" alt="Imagem do modelo" />${renderImageMarkers(markers, "builder")}`;
  input.value = "";
  updateImageMarkerCount(config);
  setupImageMarkerBuilder(input.closest(".builder-field"));
}

function updateImageMarkerCount(config) {
  const count = getImageMarkers(config).length;
  const output = config.querySelector("[data-marker-count]");
  if (output) output.textContent = `${count} marcação(ões) configurada(s)`;
}

function toggleImageMarker(fieldId, markerId, button) {
  const hidden = document.querySelector(`input[name="${fieldId}_marker_${markerId}"]`);
  if (!hidden) return;
  const marked = hidden.value !== "marked";
  hidden.value = marked ? "marked" : "";
  button.classList.toggle("marked", marked);
  if (marked) captureLocation(fieldId, { silent: true });
}

function addLayoutElement(seed = {}) {
  const holder = document.getElementById("layout-elements");
  if (!holder) return;
  const element = normalizeLayoutElement(seed);
  const node = document.createElement("div");
  node.className = "layout-element";
  node.dataset.layoutId = element.id;
  node.innerHTML = `<div class="field-head"><select class="layout-kind" aria-label="Tipo">${renderSelectedOptions([["title", "Título"], ["text", "Texto"], ["line", "Linha"], ["box", "Caixa"], ["circle", "Círculo"], ["blank", "Campo livre"]], element.kind)}</select><input class="layout-content" placeholder="Texto ou rótulo" value="${escapeHtml(element.content)}" /><button class="icon-button danger" data-action="remove-layout-element" type="button" title="Remover">×</button></div><div class="layout-position"><label>X <input class="layout-x" type="number" min="0" max="90" value="${element.x}" /></label><label>Y <input class="layout-y" type="number" min="0" max="95" value="${element.y}" /></label><label>Largura <input class="layout-w" type="number" min="2" max="100" value="${element.w}" /></label><label>Altura <input class="layout-h" type="number" min="1" max="100" value="${element.h}" /></label></div>`;
  holder.appendChild(node);
  refreshTemplatePreview();
}

function normalizeLayoutElement(element = {}) {
  const numeric = (value, fallback) => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : fallback));
  return { id: element.id || uid(), kind: ["title", "text", "line", "box", "circle", "blank"].includes(element.kind) ? element.kind : "text", content: String(element.content || ""), x: numeric(element.x, 8), y: numeric(element.y, 8), w: Math.max(2, numeric(element.w, 84)), h: Math.max(1, numeric(element.h, 8)) };
}

function layoutElementsFromForm(form = document) {
  return [...form.querySelectorAll(".layout-element")].map((node) => normalizeLayoutElement({ id: node.dataset.layoutId, kind: node.querySelector(".layout-kind")?.value, content: node.querySelector(".layout-content")?.value, x: node.querySelector(".layout-x")?.value, y: node.querySelector(".layout-y")?.value, w: node.querySelector(".layout-w")?.value, h: node.querySelector(".layout-h")?.value }));
}

function renderLayout(layout = [], mode = "preview") {
  return (layout || []).map((raw) => {
    const item = normalizeLayoutElement(raw);
    const style = `left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%;`;
    const content = escapeHtml(item.content || (item.kind === "blank" ? "Preencha aqui" : ""));
    return `<div class="layout-shape layout-${item.kind}" style="${style}">${item.kind === "blank" && mode === "runtime" ? `<input aria-label="${content || "Campo livre"}" placeholder="${content || "Preencha aqui"}" />` : content}</div>`;
  }).join("");
}

function refreshTemplatePreview() {
  const preview = document.querySelector("[data-template-preview]");
  if (!preview) return;
  preview.innerHTML = `<div class="a4-preview-head">${escapeHtml(document.querySelector('[name="title"]')?.value || "Título do checklist")}</div>${renderLayout(layoutElementsFromForm())}<div class="a4-preview-footer">Prévia A4 · campos operacionais, fotos, áudio, localização e assinatura seguem logo abaixo.</div>`;
}

function normalizeTemplateField(field = {}) {
  const kind = ["signature", "free", "image"].includes(field.kind) ? field.kind : "inspection";
  const options = { ...(field.options || {}) };
  const title = String(field.title || "").trim();
  if (kind === "signature") {
    return {
      ...field,
      title: title || DEFAULT_SIGNATURE_TITLE,
      kind,
      options: {
        check: false,
        text: false,
        photo: false,
        audio: false,
        location: true,
        selfieDoc: options.selfieDoc !== false,
      },
    };
  }
  if (kind === "free") return { ...field, title, kind, options: { check: false, text: true, photo: Boolean(options.photo), audio: Boolean(options.audio), location: Boolean(options.location), selfieDoc: Boolean(options.selfieDoc) } };
  if (kind === "image") return { ...field, title: title || "Imagem para avaliação", kind, imageSrc: String(field.imageSrc || ""), imageMarkers: Array.isArray(field.imageMarkers) ? field.imageMarkers.map((marker) => ({ id: marker.id || uid(), x: Number(marker.x) || 50, y: Number(marker.y) || 50, label: String(marker.label || "") })) : [], options: { check: false, text: options.text !== false, photo: options.photo !== false, audio: options.audio !== false, location: options.location !== false, selfieDoc: false } };
  return {
    ...field,
    title,
    kind,
    options: {
      check: options.check !== false,
      text: Boolean(options.text),
      photo: Boolean(options.photo),
      audio: Boolean(options.audio),
      location: Boolean(options.location),
      selfieDoc: Boolean(options.selfieDoc),
    },
  };
}

function applyBuilderKindDefaults(node, applyDefaults = false) {
  const isSignature = node.querySelector(".field-kind")?.value === "signature";
  const isFree = node.querySelector(".field-kind")?.value === "free";
  const isImage = node.querySelector(".field-kind")?.value === "image";
  if (!isImage) {
    node.classList.remove("image-builder-field");
    node.querySelector(".image-builder-config")?.remove();
  }
  const title = node.querySelector(".field-title");
  const options = {
    check: node.querySelector('[data-option="check"]'),
    text: node.querySelector('[data-option="text"]'),
    photo: node.querySelector('[data-option="photo"]'),
    audio: node.querySelector('[data-option="audio"]'),
    location: node.querySelector('[data-option="location"]'),
    selfieDoc: node.querySelector('[data-option="selfieDoc"]'),
  };
  if (isSignature) {
    if (title) {
      title.placeholder = DEFAULT_SIGNATURE_TITLE;
      if (applyDefaults && !title.value.trim()) title.value = DEFAULT_SIGNATURE_TITLE;
    }
    if (options.check) options.check.checked = false;
    if (options.text) options.text.checked = false;
    if (options.photo) options.photo.checked = false;
    if (options.audio) options.audio.checked = false;
    if (options.location) options.location.checked = true;
    if (options.selfieDoc && applyDefaults && !options.selfieDoc.dataset.userChanged) options.selfieDoc.checked = true;
  } else if (isFree) {
    if (title) title.placeholder = "Campo de preenchimento livre";
    if (options.check) options.check.checked = false;
    if (options.text) options.text.checked = true;
  } else if (isImage) {
    if (title) title.placeholder = "Imagem para avaliação";
    if (options.check) options.check.checked = false;
    if (options.text) options.text.checked = true;
    if (options.photo) options.photo.checked = true;
    if (options.audio) options.audio.checked = true;
    if (options.location) options.location.checked = true;
    node.classList.add("image-builder-field");
    renderImageBuilderConfig(node);
    setupImageMarkerBuilder(node);
  } else if (options.check && applyDefaults && !options.check.dataset.userChanged) {
    if (title) {
      title.placeholder = "Ponto a ser checado";
      if (title.value.trim() === DEFAULT_SIGNATURE_TITLE) title.value = "";
    }
    options.check.checked = true;
  }
  ["check", "text", "photo", "audio"].forEach((key) => {
    if (options[key]) options[key].disabled = isSignature || (isFree && ["check", "text"].includes(key)) || (isImage && key === "check");
  });
  if (options.location) options.location.disabled = isSignature;
}

function addHeaderField(seed = {}) {
  const holder = document.getElementById("builder-header-fields");
  if (!holder) return;
  const node = document.createElement("div");
  node.className = "builder-field header-builder-field";
  node.innerHTML = `
    <div class="field-head header-field-head">
      <input class="header-field-label" type="text" placeholder="Ex.: Cliente, OS, Equipamento" value="${escapeHtml(seed.label || "")}" />
      <select class="header-field-type" aria-label="Tipo do campo">
        ${renderSelectedOptions([
          ["text", "Texto"],
          ["date", "Data"],
          ["number", "NÃºmero"],
          ["textarea", "Texto longo"],
        ], seed.type || "text")}
      </select>
      <label class="inline-check header-required"><input class="header-field-required" type="checkbox" ${seed.required ? "checked" : ""} /> ObrigatÃ³rio</label>
      <button class="icon-button danger" data-action="remove-builder-row" type="button" title="Remover campo">Ã—</button>
    </div>
  `;
  holder.appendChild(node);
}

function addHeaderFieldClean(seed = {}) {
  const holder = document.getElementById("builder-header-fields");
  if (!holder) return;
  const node = document.createElement("div");
  node.className = "builder-field header-builder-field";
  node.innerHTML = `
    <div class="field-head header-field-head">
      <input class="header-field-label" type="text" placeholder="Ex.: Cliente, OS, Equipamento" value="${escapeHtml(seed.label || "")}" />
      <select class="header-field-type" aria-label="Tipo do campo">
        ${renderSelectedOptions([
          ["text", "Texto"],
          ["date", "Data"],
          ["number", "Numero"],
          ["textarea", "Texto longo"],
        ], seed.type || "text")}
      </select>
      <label class="inline-check header-required"><input class="header-field-required" type="checkbox" ${seed.required ? "checked" : ""} /> Obrigatorio</label>
      <button class="icon-button danger" data-action="remove-builder-row" type="button" title="Remover campo">x</button>
    </div>
  `;
  holder.appendChild(node);
}

function openFillModal(templateId, taskId = "", submissionId = "") {
  if (!submissionId && dailyFillAllowance().remaining === 0) return alert("Seu limite de preenchimentos de hoje foi atingido.");
  const tpl = state.templates.find((item) => item.id === templateId);
  if (!tpl) return;
  const editing = state.submissions.find((item) => item.id === submissionId);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal checklist-modal ${accentClass(tpl)} ${backgroundClass(tpl)} border-${tpl.borderStyle || "soft"}">
      <div class="topbar checklist-top art-${tpl.artHeader || "clean"}">
        <div>
          <span class="template-kicker">${escapeHtml(tpl.category || "Operação")}</span>
          <h2>${escapeHtml(tpl.title)}</h2>
          <p>${editing ? "Editando checklist preenchido" : escapeHtml(tpl.description || "Preenchimento de checklist")}</p>
        </div>
        ${modalCloseButton()}
      </div>
      <form class="form" data-form="submission" data-template-id="${tpl.id}" data-task-id="${taskId}" data-submission-id="${submissionId}">
        ${tpl.layout?.length ? `<section class="runtime-layout"><div class="a4-preview">${renderLayout(tpl.layout, "runtime")}</div></section>` : ""}
        ${renderChecklistHeaderFields(tpl)}
        ${tpl.fields.map((field) => renderRuntimeField(field, tpl)).join("")}
        <button class="primary-button icon-text" type="submit">${editing ? iconUi("edit") : iconUi("check")} ${editing ? "Salvar edição" : "Finalizar checklist"}</button>
      </form>
    </section>
  `;
  mountModal(modal);
  setupSignaturePads();
  if (editing) hydrateSubmissionForm(editing);
}

function renderChecklistHeaderFields(tpl) {
  const fields = tpl.headerFields || [];
  if (!fields.length) return "";
  return `
    <section class="checklist-header-card">
      <div>
        <span class="template-kicker">Cabecalho</span>
        <h3>Dados iniciais</h3>
      </div>
      <div class="checklist-header-grid">
        ${fields.map((field) => renderChecklistHeaderInput(field)).join("")}
      </div>
    </section>
  `;
}

function renderChecklistHeaderInput(field) {
  const fieldId = `header_${field.id}`;
  const required = field.required ? "required" : "";
  const label = `${escapeHtml(field.label)}${field.required ? " *" : ""}`;
  const type = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  if (field.type === "textarea") {
    return `<div class="form-row header-runtime-field"><label>${label}</label><textarea name="${fieldId}" ${required}></textarea></div>`;
  }
  return `<div class="form-row header-runtime-field"><label>${label}</label><input name="${fieldId}" type="${type}" ${required} /></div>`;
}

function openFillPickerModal() {
  if (dailyFillAllowance().remaining === 0) return alert("Seu limite de preenchimentos de hoje foi atingido.");
  const templates = visibleTemplates();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal">
      <div class="topbar">
        <div>
          <h2>Preencher checklist</h2>
        </div>
        ${modalCloseButton()}
      </div>
      <div class="checklist-picker">
        ${templates.map((tpl) => `
          <button class="checklist-picker-row" data-action="start-fill" data-id="${tpl.id}" type="button">
            <span class="picker-symbol">${iconUi("models")}</span>
            <span class="picker-copy"><strong>${escapeHtml(tpl.title)}</strong><small>${escapeHtml(tpl.category || "Operação")}</small></span>
            <span class="picker-arrow">${iconUi("chevron")}</span>
          </button>
        `).join("") || `<div class="empty">Nenhum modelo disponível.</div>`}
      </div>
    </section>
  `;
  mountModal(modal);
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
  mountModal(modal);
}

async function shareSubmissionWhatsapp(id) {
  const submission = state.submissions.find((item) => item.id === id);
  if (!submission) return;
  const fileName = `${safeFileName(submission.templateTitle)}.pdf`;
  const blob = await buildSubmissionPdfBlob(submission);
  const file = new File([blob], fileName, { type: "application/pdf", lastModified: Date.now() });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }
  downloadBlob(blob, fileName);
  const text = `Checklist preenchido: ${submission.templateTitle} em ${formatDate(submission.createdAt)} por ${userName(submission.filledBy)}.`;
  alert("Este navegador não permite anexar o PDF automaticamente. O arquivo completo foi baixado; anexe ele na conversa do WhatsApp.");
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} PDF completo baixado: anexe o arquivo ${fileName} nesta conversa.`)}`, "_blank", "noopener");
}

async function exportSubmissionPdf(id) {
  const submission = state.submissions.find((item) => item.id === id);
  if (!submission) return;
  const blob = await buildSubmissionPdfBlob(submission);
  downloadBlob(blob, `${safeFileName(submission.templateTitle)}.pdf`);
}

async function buildSubmissionPdfBlob(submission) {
  const stats = reportStats(submission);
  const labels = statusLabels(submission);
  const rawPages = buildChecklistPdfPages(submission, stats, labels);
  const pages = [];
  for (const page of rawPages) {
    if (page.type !== "photo-inline") { pages.push(page); continue; }
    const image = await dataUrlToPdfJpeg(page.src);
    if (image) pages.push({ type: "image", title: submission.templateTitle, accent: accentColor({ accent: submission.templateAccent }), backgroundStyle: submission.templateBackground || "clean", label: `Foto ${page.photoIndex + 1}`, item: buildPdfItem(submission, page.answer, page.answerIndex), metadata: photoPdfMetadata(page.answer, submission, page.metadata), images: [image] });
  }
  const logo = await dataUrlToPdfJpeg("assets/luma-logo.png");
  if (logo) pages.forEach((page) => {
    page.logo = logo;
  });
  for (const [index, answer] of submission.answers.entries()) {
    const photos = answer.photos?.length ? answer.photos : answer.photo ? [answer.photo] : [];
    const entries = [
      ...(answer.selfieDoc ? [{ src: answer.selfieDoc, label: `Item ${index + 1} - Foto com documento: ${answer.title}` }] : []),
      ...(answer.signature ? [{ src: answer.signature, label: `Item ${index + 1} - Assinatura: ${answer.title}` }] : []),
    ];
    for (const entry of entries) {
      const image = await dataUrlToPdfJpeg(entry.src);
      if (image) pages.push({
        type: "image",
        title: submission.templateTitle,
        accent: accentColor({ accent: submission.templateAccent }),
        backgroundStyle: submission.templateBackground || "clean",
        label: normalizePdfText(entry.label),
        item: entry.item || null,
        metadata: entry.metadata || "",
        logo,
        images: [image],
      });
    }
  }

  return buildPdfDocument(pages);
}

function buildChecklistPdfPages(submission, stats, labels) {
  const accent = accentColor({ accent: submission.templateAccent });
  const basePage = () => ({
    type: "content",
    title: submission.templateTitle,
    category: submission.templateCategory || "Operacao",
    filledBy: userName(submission.filledBy),
    createdAt: formatDate(submission.createdAt),
    register: submission.id,
    accent,
    stats,
    labels,
    headerValues: submission.headerValues || [],
    backgroundStyle: submission.templateBackground || "clean",
    items: [],
    images: [],
  });
  const pages = [];
  let page = basePage();
  page.cover = true;
  let used = pdfInitialCoverUsage(submission);
  const pageLimit = 730;
  submission.answers.forEach((answer, index) => {
    const hasPhotos = Boolean(answer.photos?.length || answer.photo);
    if (hasPhotos) {
      if (page.items.length) pages.push(page);
      const photos = answer.photos?.length ? answer.photos : [answer.photo];
      photos.forEach((src, photoIndex) => pages.push({ type: "photo-inline", src, answer, answerIndex: index, photoIndex, metadata: answer.photoMetadata?.[photoIndex] || {} }));
      page = basePage();
      page.cover = false;
      used = 88;
      return;
    }
    const item = buildPdfItem(submission, answer, index);
    if (page.items.length && used + item.height > pageLimit) {
      pages.push(page);
      page = basePage();
      used = 88;
    }
    page.items.push(item);
    used += item.height + 10;
  });
  if (page.items.length || !pages.length) pages.push(page);
  if (submission.templateLayout?.length) pages.unshift({ ...basePage(), cover: false, layout: submission.templateLayout });
  return pages;
}

function pdfInitialCoverUsage(submission) {
  const headerRows = Math.ceil(Math.min(6, (submission.headerValues || []).filter((item) => item.value).length) / 2);
  const itemStartY = headerRows ? 448 - headerRows * 28 : 464;
  return 730 - (itemStartY - 64);
}

function buildPdfItem(submission, answer, index) {
  const photos = answer.photos?.length ? answer.photos : answer.photo ? [answer.photo] : [];
  const notes = [
    answer.text ? ["Observacao", answer.text] : null,
    answer.transcript ? ["Descricao do audio", answer.transcript] : null,
    answer.audio ? ["Audio", "Arquivo de audio registrado no app."] : null,
    answer.location ? ["Localizacao", answer.location] : null,
    answer.ip ? ["IP", answer.ip] : null,
    photos.length ? ["Fotos", `${photos.length} imagem(ns) anexada(s) abaixo deste item.`] : null,
    answer.selfieDoc ? ["Documento", "Foto com documento anexada logo apos este item."] : null,
    answer.signature ? ["Assinatura", "Assinatura registrada logo apos este item."] : null,
  ].filter(Boolean).flatMap(([label, value]) => {
    const text = `${label}: ${value}`;
    return wrapPdfLine(normalizePdfText(text), 78);
  });
  return {
    number: index + 1,
    titleLines: wrapPdfLine(normalizePdfText(answer.title), 44),
    status: reportStatusValue(answer),
    statusLabel: normalizePdfText(pdfStatusLabel(submission, answer)),
    notes,
    height: Math.max(72, 42 + wrapPdfLine(normalizePdfText(answer.title), 44).length * 14 + notes.length * 12),
  };
}

function photoPdfMetadata(answer, submission, metadata = {}) {
  const device = metadata.device || navigator.userAgent || "Navegador não informado";
  const location = metadata.location || answer.location || "Localização não informada";
  const ip = answer.ip || "IP não disponível no navegador";
  return `Data/hora: ${formatDate(metadata.capturedAt || submission.createdAt)} | Lat/long: ${location} | IP: ${ip} | Dispositivo: ${device}`;
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

function pdfStatusLabel(report, answer) {
  const status = reportStatusValue(answer);
  const labels = statusLabels(report);
  if (status === "ok") return `${pdfIconLabel(labels.okIcon)} ${labels.okLabel}`;
  if (status === "fail") return `${pdfIconLabel(labels.failIcon)} ${labels.failLabel}`;
  if (status === "nt") return "NT Nao tem";
  return answer.kind === "signature" ? "Assinatura solicitada" : "Nao marcado";
}

function pdfIconLabel(icon) {
  const icons = {
    check: "V",
    "double-check": "VV",
    thumb: "OK",
    star: "*",
    shield: "#",
    close: "X",
    alert: "!",
    flag: "F",
    wrench: "A",
    ban: "B",
  };
  return icons[icon] || "V";
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
  pages.forEach((page, pageIndex) => {
    const imageRefs = (page.images || []).map((image) => {
      const id = addObject(pdfStreamObject(image.bytes, `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>`));
      return { ...image, id };
    });
    const logoRef = page.logo ? { ...page.logo, id: addObject(pdfStreamObject(page.logo.bytes, `<< /Type /XObject /Subtype /Image /Width ${page.logo.width} /Height ${page.logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.logo.bytes.length} >>`)) } : null;
    const content = pdfPageContent(page, imageRefs, logoRef, pageIndex + 1, pages.length);
    const contentId = addObject(pdfStreamObject(encoder.encode(content), `<< /Length ${encoder.encode(content).length} >>`));
    const xObjectRefs = [
      ...imageRefs.map((image, index) => `/Im${index + 1} ${image.id} 0 R`),
      ...(logoRef ? [`/Logo ${logoRef.id} 0 R`] : []),
    ];
    const xObjects = xObjectRefs.length
      ? `/XObject << ${xObjectRefs.join(" ")} >>`
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

function pdfPageContent(page, images, logo, pageNumber, totalPages) {
  if (page.type === "image") return pdfImagePageContent(page, images, logo, pageNumber, totalPages);
  return pdfContentPageContent(page, logo, pageNumber, totalPages);
}

function pdfContentPageContent(page, logo, pageNumber, totalPages) {
  const accent = pdfColor(page.accent);
  const commands = [];
  commands.push(`${pdfBackgroundColor(page.backgroundStyle)} rg 0 0 595 842 re f`);
  if (page.cover) {
    commands.push(`${accent} rg 0 720 595 92 re f`);
    commands.push("0.07 0.09 0.15 rg 0 698 595 22 re f");
    if (logo) commands.push(pdfImageCommand("Logo", 42, 744, 48, 48));
    commands.push(pdfText("RELATORIO TECNICO DE CHECKLIST", logo ? 102 : 42, 782, 9, "1 1 1"));
    commands.push(pdfText(normalizePdfText(page.title), logo ? 102 : 42, 752, 22, "1 1 1"));
    commands.push(pdfText(normalizePdfText(`${page.category} | Check list profissional Luma`), logo ? 102 : 42, 731, 10, "0.92 0.96 1"));
    commands.push(pdfText("REGISTRO", 444, 777, 8, "0.92 0.96 1"));
    commands.push(pdfText(shortId(page.register), 444, 756, 16, "1 1 1"));
    commands.push(pdfInfoRow("Responsavel", page.filledBy, 42, 676));
    commands.push(pdfInfoRow("Data e hora", page.createdAt, 214, 676));
    commands.push(pdfInfoRow("ID completo", page.register, 386, 676, 22));
    commands.push(...pdfSummaryCards(page.stats, page.labels, accent, 42, 558));
    const headerRows = Math.ceil(Math.min(6, pdfVisibleHeaderValues(page).length) / 2);
    if (headerRows) {
      commands.push(pdfSectionTitle("Dados do cabecalho", 42, 498, accent));
      commands.push(...pdfHeaderValueRows(page, 42, 466));
      commands.push(pdfSectionTitle("Itens verificados", 42, 448 - headerRows * 28, accent));
    } else {
      commands.push(pdfSectionTitle("Itens verificados", 42, 492, accent));
    }
  } else {
    commands.push(`${accent} rg 0 804 595 38 re f`);
    if (logo) commands.push(pdfImageCommand("Logo", 42, 810, 24, 24));
    commands.push(pdfText(normalizePdfText(page.title), logo ? 74 : 42, 818, 12, "1 1 1"));
    commands.push(pdfText(`Pagina ${pageNumber} de ${totalPages}`, 488, 818, 9, "0.92 0.96 1"));
  }
  let y = page.cover ? pdfCoverItemsStartY(page) : 768;
  if (page.layout?.length) commands.push(...pdfLayoutElements(page.layout));
  page.items.forEach((item) => {
    commands.push(...pdfItemCard(item, 42, y, 511, accent));
    y -= item.height + 10;
  });
  commands.push(pdfFooter(pageNumber, totalPages, logo));
  return commands.join("\n");
}

function pdfLayoutElements(layout) {
  const commands = [pdfSectionTitle("Layout visual do checklist", 42, 768, "0.10 0.12 0.16"), "0.94 0.95 0.97 rg 42 70 511 670 re f", "0.78 0.80 0.84 RG 42 70 511 670 re S"];
  for (const raw of layout) {
    const item = normalizeLayoutElement(raw);
    const x = 42 + item.x / 100 * 511;
    const y = 70 + (100 - item.y - item.h) / 100 * 670;
    const w = item.w / 100 * 511;
    const h = Math.max(3, item.h / 100 * 670);
    if (item.kind === "line") commands.push(`0.18 0.20 0.25 RG 0.8 w ${x.toFixed(1)} ${(y + h / 2).toFixed(1)} m ${(x + w).toFixed(1)} ${(y + h / 2).toFixed(1)} l S`);
    else if (item.kind === "circle") commands.push(`0.18 0.20 0.25 RG ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`);
    else if (item.kind === "box" || item.kind === "blank") { commands.push(`0.18 0.20 0.25 RG ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`); if (item.content) commands.push(pdfText(normalizePdfText(item.content), x + 4, y + Math.max(4, h - 11), Math.min(12, Math.max(7, h / 2)), "0.12 0.14 0.18")); }
    else if (item.content) commands.push(pdfText(normalizePdfText(item.content), x, y + Math.max(4, h - 11), item.kind === "title" ? 16 : 10, "0.08 0.10 0.15"));
  }
  return commands;
}

function pdfImagePageContent(page, images, logo, pageNumber, totalPages) {
  const accent = pdfColor(page.accent);
  const commands = [
    `${pdfBackgroundColor(page.backgroundStyle)} rg 0 0 595 842 re f`,
    `${accent} rg 0 804 595 38 re f`,
    ...(logo ? [pdfImageCommand("Logo", 42, 810, 24, 24)] : []),
    pdfText(normalizePdfText(page.title), logo ? 74 : 42, 818, 12, "1 1 1"),
    pdfText(`Pagina ${pageNumber} de ${totalPages}`, 488, 818, 9, "0.92 0.96 1"),
    ...(page.item ? pdfItemCard(page.item, 42, 766, 511, accent) : [pdfSectionTitle("Evidencia anexada", 42, 762, accent), pdfText(normalizePdfText(page.label), 42, 736, 11, "0.12 0.16 0.24")]),
    "0.96 0.98 1 rg 42 94 511 430 re f",
    "0.84 0.88 0.94 RG 42 94 511 430 re S",
  ];
  images.forEach((image, index) => {
    const maxW = 470;
    const maxH = 380;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const x = Math.round((595 - width) / 2);
    const y = Math.round(132 + (380 - height) / 2);
    commands.push("q", `${width} 0 0 ${height} ${x} ${y} cm`, `/Im${index + 1} Do`, "Q");
  });
  if (page.metadata) {
    commands.push("0.08 0.09 0.12 rg 42 94 511 30 re f");
    wrapPdfLine(normalizePdfText(page.metadata), 108).slice(0, 2).forEach((line, index) => commands.push(pdfText(line, 50, 112 - index * 10, 7, "1 1 1")));
  }
  commands.push(pdfFooter(pageNumber, totalPages, logo));
  return commands.join("\n");
}

function pdfBackgroundColor(style) {
  return { blueprint: "0.90 0.94 0.98", blush: "0.99 0.91 0.93", mint: "0.90 0.96 0.93", sand: "0.98 0.94 0.88", lavender: "0.94 0.92 0.98" }[style] || "1 1 1";
}

function pdfSummaryCards(stats, labels, accent, x, y) {
  const cards = [
    ["Total de itens", stats.total],
    [labels.okLabel, stats.ok],
    [labels.failLabel, stats.fail],
    [labels.ntLabel, stats.nt],
    ["Evidencias", stats.evidence],
  ];
  return cards.flatMap(([label, value], index) => {
    const cardX = x + index * 102;
    return [
      "0.96 0.98 1 rg " + `${cardX} ${y} 92 66 re f`,
      "0.85 0.89 0.95 RG " + `${cardX} ${y} 92 66 re S`,
      pdfText(normalizePdfText(label).toUpperCase(), cardX + 9, y + 43, 7, "0.35 0.42 0.54"),
      pdfText(String(value), cardX + 9, y + 18, 23, index === 2 ? "0.8 0.12 0.12" : index === 3 ? "0.64 0.42 0.08" : accent),
    ];
  });
}

function pdfVisibleHeaderValues(page) {
  return (page.headerValues || []).filter((item) => item.value);
}

function pdfCoverItemsStartY(page) {
  const headerRows = Math.ceil(Math.min(6, pdfVisibleHeaderValues(page).length) / 2);
  return headerRows ? 420 - headerRows * 28 : 464;
}

function pdfHeaderValueRows(page, x, y) {
  return pdfVisibleHeaderValues(page).slice(0, 6).map((item, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const rowX = x + col * 256;
    const rowY = y - row * 28;
    const text = `${normalizePdfText(item.label)}: ${normalizePdfText(item.value)}`;
    return [
      "0.96 0.98 1 rg " + `${rowX} ${rowY - 18} 244 24 re f`,
      "0.86 0.9 0.95 RG " + `${rowX} ${rowY - 18} 244 24 re S`,
      pdfText(text.length > 58 ? `${text.slice(0, 55)}...` : text, rowX + 8, rowY - 10, 8.5, "0.16 0.2 0.3"),
    ].join("\n");
  });
}

function pdfItemCard(item, x, y, width, accent) {
  const statusColor = item.status === "fail" ? "0.86 0.12 0.16" : item.status === "ok" ? "0.05 0.62 0.32" : accent;
  const commands = [
    "0.99 0.995 1 rg " + `${x} ${y - item.height} ${width} ${item.height} re f`,
    "0.84 0.88 0.94 RG " + `${x} ${y - item.height} ${width} ${item.height} re S`,
    `${accent} rg ${x} ${y - item.height} 4 ${item.height} re f`,
    pdfText(`ITEM ${String(item.number).padStart(2, "0")}`, x + 16, y - 22, 8, "0.38 0.45 0.56"),
    `${statusColor} rg ${x + width - 124} ${y - 34} 96 20 re f`,
    pdfText(item.statusLabel, x + width - 116, y - 28, 8.5, "1 1 1"),
  ];
  let titleY = y - 40;
  item.titleLines.forEach((line) => {
    commands.push(pdfText(line, x + 16, titleY, 12, "0.08 0.11 0.18"));
    titleY -= 14;
  });
  let noteY = titleY - 8;
  item.notes.forEach((note) => {
    commands.push(pdfText(note, x + 16, noteY, 8.5, "0.22 0.28 0.38"));
    noteY -= 12;
  });
  if (!item.notes.length) commands.push(pdfText("Sem observacoes adicionais.", x + 16, noteY, 8.5, "0.43 0.49 0.58"));
  return commands;
}

function pdfInfoRow(label, value, x, y, maxLength = 32) {
  const normalized = normalizePdfText(value);
  const shortValue = normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
  return [
    "0.96 0.98 1 rg " + `${x} ${y - 36} 152 50 re f`,
    "0.85 0.89 0.95 RG " + `${x} ${y - 36} 152 50 re S`,
    pdfText(normalizePdfText(label).toUpperCase(), x + 10, y - 4, 7, "0.38 0.45 0.56"),
    pdfText(shortValue, x + 10, y - 22, 9, "0.1 0.14 0.22"),
  ].join("\n");
}

function pdfSectionTitle(title, x, y, accent) {
  return [
    `${accent} rg ${x} ${y - 3} 22 3 re f`,
    pdfText(normalizePdfText(title).toUpperCase(), x, y - 20, 10, "0.14 0.18 0.28"),
  ].join("\n");
}

function pdfFooter(pageNumber, totalPages, logo) {
  return [
    "0.86 0.89 0.94 RG 42 54 m 553 54 l S",
    ...(logo ? [pdfImageCommand("Logo", 42, 27, 18, 18)] : []),
    pdfText("Check list profissional Luma", logo ? 66 : 42, 36, 8, "0.48 0.54 0.64"),
    pdfText(`Pagina ${pageNumber} de ${totalPages}`, 498, 36, 8, "0.48 0.54 0.64"),
  ].join("\n");
}

function pdfImageCommand(name, x, y, width, height) {
  return ["q", `${width} 0 0 ${height} ${x} ${y} cm`, `/${name} Do`, "Q"].join("\n");
}

function pdfText(text, x, y, size, color = "0.08 0.11 0.18") {
  return `BT ${color} rg /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(normalizePdfText(text))}) Tj ET`;
}

function pdfColor(hex) {
  const match = String(hex || "").match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return "0.09 0.36 0.83";
  return [match[1], match[2], match[3]].map((part) => (parseInt(part, 16) / 255).toFixed(3)).join(" ");
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
  link.rel = "noopener";
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

function renderRuntimeField(field, tpl = {}) {
  const options = field.options || {};
  const isSignature = field.kind === "signature";
  const isFree = field.kind === "free";
  const isImage = field.kind === "image";
  const labels = statusLabels(tpl);
  if (isFree) return `<fieldset class="runtime-field free-runtime-field" data-field-id="${field.id}"><label>${escapeHtml(field.title || "Campo livre")}</label><textarea name="${field.id}_text" placeholder="Preencha livremente"></textarea>${options.photo ? `<button class="tool-icon camera-tool" data-action="open-photo-picker" data-field="${field.id}" type="button" title="Adicionar foto">${iconCamera()}</button>` : ""}${options.audio ? `<button class="tool-icon" data-action="start-audio" data-field="${field.id}" type="button" title="Gravar áudio">${iconMic()}</button>` : ""}<input type="hidden" name="${field.id}_photos" value="[]" /><input type="hidden" name="${field.id}_audio" /><input type="hidden" name="${field.id}_transcript" />${options.location ? `<input type="hidden" name="${field.id}_location" />` : ""}</fieldset>`;
  if (isImage) return `<fieldset class="runtime-field image-runtime-field" data-field-id="${field.id}"><div class="image-runtime-head"><div><span class="template-kicker">Imagem interativa</span><h3>${escapeHtml(field.title)}</h3><p class="small">Toque nas bolinhas para marcar ou desmarcar.</p></div></div>${field.imageSrc ? `<div class="marker-runtime-canvas"><img src="${field.imageSrc}" alt="${escapeHtml(field.title)}" />${renderImageMarkers(field.imageMarkers || [], "runtime", field.id)}</div>` : `<div class="empty">A imagem deste campo não foi configurada.</div>`}${(field.imageMarkers || []).map((marker) => `<input type="hidden" name="${field.id}_marker_${marker.id}" value="" />`).join("")}${options.text ? `<button class="secondary-button" data-action="open-observation-modal" data-field="${field.id}" type="button">Adicionar observação</button><input type="hidden" name="${field.id}_text" /><div class="evidence-note hidden" data-note-preview="${field.id}"></div>` : ""}${options.photo ? `<button class="tool-icon camera-tool" data-action="open-photo-picker" data-field="${field.id}" type="button" title="Tirar foto ou escolher imagens">${iconCamera()}</button><input class="hidden-file" data-photo-input="${field.id}" data-photo-source="camera" type="file" accept="image/*" capture="environment" /><input class="hidden-file" data-photo-input="${field.id}" data-photo-source="gallery" type="file" accept="image/*" multiple /><input type="hidden" name="${field.id}_photos" value="[]" /><div class="photo-strip" data-photo-strip="${field.id}"></div>` : ""}${options.audio ? `<button class="tool-icon" data-action="start-audio" data-field="${field.id}" type="button" title="Gravar áudio">${iconMic()}</button><input type="hidden" name="${field.id}_audio" /><input type="hidden" name="${field.id}_transcript" /><div class="audio-strip" data-audio-preview="${field.id}"></div>` : ""}${options.location ? `<input type="hidden" name="${field.id}_location" /><span class="small location-note" data-location-note="${field.id}">Localização será capturada ao marcar.</span>` : ""}</fieldset>`;
  return `
    <fieldset class="runtime-field ${isSignature ? "signature-field" : ""}" data-field-id="${field.id}">
      <div class="inspection-card">
        ${isSignature ? `<span class="field-kind-icon">${iconUi("edit")}</span>` : ""}
        <div class="inspection-status">
          ${options.check ? `
            <button class="status-button ok" data-action="select-check-status" data-field="${field.id}" data-value="ok" type="button" title="${escapeHtml(labels.okLabel)}" aria-label="${escapeHtml(labels.okLabel)}">${statusChoiceIcon(labels.okIcon)}</button>
            <button class="status-button fail" data-action="select-check-status" data-field="${field.id}" data-value="fail" type="button" title="${escapeHtml(labels.failLabel)}" aria-label="${escapeHtml(labels.failLabel)}">${statusChoiceIcon(labels.failIcon)}</button>
            <button class="status-button nt" data-action="select-check-status" data-field="${field.id}" data-value="nt" type="button" title="${escapeHtml(labels.ntLabel)}" aria-label="${escapeHtml(labels.ntLabel)}">${statusChoiceIcon(labels.ntIcon)}</button>
            <input type="hidden" name="${field.id}_status" />
          ` : ""}
        </div>
        <h3>${escapeHtml(field.title)}</h3>
        <div class="inspection-actions">
          ${options.photo ? `<button class="tool-icon camera-tool" data-action="open-photo-picker" data-field="${field.id}" type="button" title="Tirar foto ou escolher imagens">${iconCamera()}</button>` : ""}
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
      ${options.photo ? `<input class="hidden-file" name="${field.id}_photo_camera" data-photo-input="${field.id}" data-photo-source="camera" type="file" accept="image/*" capture="environment" /><input class="hidden-file" name="${field.id}_photo_gallery" data-photo-input="${field.id}" data-photo-source="gallery" type="file" accept="image/*" multiple /><input type="hidden" name="${field.id}_photos" value="[]" /><div class="photo-strip" data-photo-strip="${field.id}"></div>` : ""}
      ${options.audio ? `<input type="hidden" name="${field.id}_audio" /><input type="hidden" name="${field.id}_transcript" /><div class="audio-strip" data-audio-preview="${field.id}"></div>` : ""}
      ${options.location || options.check ? `<input type="hidden" name="${field.id}_location" /><span class="small location-note" data-location-note="${field.id}">${isSignature ? "Localização será capturada ao assinar." : "Localização será capturada ao selecionar o resultado."}</span>` : ""}
      ${options.selfieDoc ? `<input type="hidden" name="${field.id}_selfieDoc_existing" /><div class="form-row"><label>Foto da pessoa com documento</label><input name="${field.id}_selfieDoc" type="file" accept="image/*" capture="user" /></div>` : ""}
      ${isSignature ? `<input type="hidden" name="${field.id}_ip" value="Indisponível no navegador local" />` : ""}
    </fieldset>
  `;
}

function hydrateSubmissionForm(submission) {
  (submission.headerValues || []).forEach((item) => {
    setInputValue(`header_${item.fieldId}`, item.value || "");
  });
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
    (answer.imageMarks || []).filter((marker) => marker.marked).forEach((marker) => {
      setInputValue(`${fieldId}_marker_${marker.id}`, "marked");
      document.querySelector(`[data-field-id="${fieldId}"] .image-marker[data-marker="${marker.id}"]`)?.classList.add("marked");
    });
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
  lockSignatureOrientation();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop signature-backdrop";
  modal.innerHTML = `
    <section class="modal signature-modal">
      <div class="signature-modal-head">
        <div>
          <span class="template-kicker">Assinatura</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
        ${modalCloseButton("close-signature-modal")}
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
  mountModal(modal);
  const canvas = modal.querySelector(".signature-pad");
  setupSignaturePad(canvas);
  if (existing) drawSignatureOnCanvas(canvas, existing);
}

async function lockSignatureOrientation() {
  document.documentElement.classList.add("signature-landscape-open");
  try {
    if (!window.screen?.orientation?.lock) return;
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen().catch(() => {});
    }
    await window.screen.orientation.lock("landscape").catch(() => {});
  } catch {
    // Browsers can deny orientation lock outside installed/fullscreen contexts.
  }
}

function unlockSignatureOrientation() {
  document.documentElement.classList.remove("signature-landscape-open");
  window.screen?.orientation?.unlock?.();
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

function closeSignatureModal() {
  dismissModal(document.querySelector(".signature-backdrop"));
  unlockSignatureOrientation();
}

function saveSignature(fieldId) {
  const modal = document.querySelector(".signature-backdrop");
  const temp = modal?.querySelector(`input[name="${fieldId}_signature_temp"]`)?.value || "";
  if (!temp) return alert("Faça a assinatura antes de concluir.");
  setInputValue(`${fieldId}_signature`, temp);
  renderSignaturePreview(fieldId, temp);
  captureLocation(fieldId, { silent: true });
  closeSignatureModal();
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
    <section class="modal compact-modal">
      <div class="topbar">
        <div>
          <h2>${isCompany ? "Nova empresa" : "Novo agente"}</h2>
        </div>
        ${modalCloseButton()}
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
  mountModal(modal);
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
          <button class="primary-button icon-text" data-action="download-report-pdf" data-id="${report.id}" type="button">${iconUi("pdf")} Baixar PDF</button>
          ${modalCloseButton()}
        </div>
      </div>
      <div id="print-area" class="report-paper">${reportHtml(report)}</div>
    </section>
  `;
  mountModal(modal);
  if (shouldPrint) exportSubmissionPdf(report.id);
}

function reportHtml(report) {
  const stats = reportStats(report);
  const labels = statusLabels(report);
  const failed = report.answers.filter((answer) => reportStatusValue(answer) === "fail");
  const locations = [...new Set(report.answers.map((answer) => answer.location).filter(Boolean))];
  const reportAccent = accentColor({ accent: report.templateAccent });
  return `
    <header class="report-cover report-a4-cover ${accentClass({ accent: report.templateAccent })} ${backgroundClass(report)}" style="--accent-color:${reportAccent};">
      <div>
        <img class="report-logo" src="assets/luma-logo.png" alt="Luma" />
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
      <article><span>${escapeHtml(labels.okLabel)}</span><strong>${stats.ok}</strong></article>
      <article><span>${escapeHtml(labels.failLabel)}</span><strong>${stats.fail}</strong></article>
      <article><span>${escapeHtml(labels.ntLabel)}</span><strong>${stats.nt}</strong></article>
      <article><span>Evidências</span><strong>${stats.evidence}</strong></article>
    </section>

    ${renderReportHeaderValues(report)}

    ${report.templateLayout?.length ? `<section class="report-section"><div class="report-section-title"><span>01</span><h2>Layout do checklist</h2></div><div class="a4-preview report-layout-preview">${renderLayout(report.templateLayout, "report")}</div></section>` : ""}

    <section class="report-section">
      <div class="report-section-title">
        <span>${report.templateLayout?.length ? "02" : "01"}</span>
        <h2>Resumo executivo</h2>
      </div>
      <p class="report-summary-text">
        Checklist preenchido com ${stats.total} item(ns). Foram registrados ${stats.ok} item(ns) como ${escapeHtml(labels.okLabel)}, ${stats.fail} como ${escapeHtml(labels.failLabel)}, ${stats.nt} como ${escapeHtml(labels.ntLabel)} e ${stats.evidence} evidência(s) operacional(is).
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
        <span>${report.templateLayout?.length ? "03" : "02"}</span>
        <h2>Itens verificados</h2>
      </div>
      <div class="report-check-list">
        ${report.answers.map((answer, index) => renderReportItemCard(report, answer, index)).join("")}
      </div>
    </section>

    <section class="report-section report-signoff">
      <div class="report-section-title">
        <span>${report.templateLayout?.length ? "04" : "03"}</span>
        <h2>Assinatura e rastreabilidade</h2>
      </div>
      ${renderSignatureBlocks(report)}
    </section>
  `;
}

function renderReportHeaderValues(report) {
  const values = (report.headerValues || []).filter((item) => item.value);
  if (!values.length) return "";
  return `
    <section class="report-section">
      <div class="report-section-title">
        <span>00</span>
        <h2>Dados do cabecalho</h2>
      </div>
      <div class="report-note-grid">
        ${values.map((item) => `<p><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></p>`).join("")}
      </div>
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
    if (status === "nt") acc.nt += 1;
    if (photos || answer.selfieDoc || answer.signature || answer.audio || answer.text || answer.transcript || answer.location) acc.evidence += 1;
    return acc;
  }, { total: 0, ok: 0, fail: 0, nt: 0, evidence: 0 });
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

function renderReportItemCard(report, answer, index) {
  const notes = [
    answer.text ? ["Observação", answer.text] : null,
    answer.transcript ? ["Descrição do áudio", answer.transcript] : null,
    answer.audio ? ["Áudio", "Arquivo de áudio registrado no app."] : null,
    answer.location ? ["Localização", answer.location] : null,
    answer.ip ? ["IP", answer.ip] : null,
    answer.signature ? ["Assinatura", "Assinatura registrada."] : null,
  ].filter(Boolean);
  const media = [
    answer.imageSrc ? `<figure class="report-marked-image">${renderMarkedImage(answer)}</figure>` : "",
    renderReportPhotos(answer),
    answer.selfieDoc ? `<figure><img src="${answer.selfieDoc}" alt="Documento anexado" /><figcaption>Foto com documento</figcaption></figure>` : "",
    answer.signature ? `<figure><img src="${answer.signature}" alt="Assinatura" /><figcaption>Assinatura</figcaption></figure>` : "",
  ].join("");
  return `
    <article class="report-check-card">
      <div class="report-check-head">
        <div>
          <span>Item ${index + 1}</span>
          <h3>${escapeHtml(answer.title)}</h3>
        </div>
        ${renderReportStatus(answer, report)}
      </div>
      ${notes.length ? `
        <div class="report-note-grid">
          ${notes.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></p>`).join("")}
        </div>
      ` : `<p class="report-muted-line">Sem observações adicionais.</p>`}
      ${media.trim() ? `<div class="report-media report-media-under-item">${media}</div>` : ""}
    </article>
  `;
}

function renderMarkedImage(answer) {
  return `<div class="marker-runtime-canvas report-marker-canvas"><img src="${answer.imageSrc}" alt="Imagem avaliada" />${renderImageMarkers(answer.imageMarks || [], "runtime", answer.fieldId)}</div><figcaption>Marcação(ões) preenchida(s) no checklist</figcaption>`;
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

function renderReportStatus(answer, report = {}) {
  const status = answer.status || (answer.checked === true ? "ok" : answer.checked === false ? "fail" : "");
  const labels = statusLabels(report);
  if (status === "ok") return `<span class="report-status ok">${statusChoiceIcon(labels.okIcon)} ${escapeHtml(labels.okLabel)}</span>`;
  if (status === "fail") return `<span class="report-status fail">${statusChoiceIcon(labels.failIcon)} ${escapeHtml(labels.failLabel)}</span>`;
  if (status === "nt") return `<span class="report-status nt">${statusChoiceIcon(labels.ntIcon)} ${escapeHtml(labels.ntLabel)}</span>`;
  return "";
}

async function handleSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  const formType = form.dataset.form;
  const data = new FormData(form);
  if (formType === "login") await submitLogin(form, data);
  if (formType === "signup-details") submitSignupDetails(data);
  if (formType === "plan-payment") await submitPlanPayment(form, data);
  if (formType === "change-password") await submitChangePassword(form, data);
  if (formType === "cancel-plan") await cancelPlan(data);
  if (formType === "template") await submitTemplate(form, data);
  if (formType === "task") await submitTask(data);
  if (formType === "asaas-charge") await submitAsaasCharge(form, data);
  if (formType === "company-user" || formType === "agent-user") await submitUser(formType, data);
  if (formType === "submission") await submitChecklist(form, data);
}

async function submitLogin(form, data) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: String(data.get("email") || "").trim(), password: String(data.get("password") || "") }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Não foi possível entrar.");
    setSession(body.user);
    state = await loadState();
    if (adminSeedsAdded) { adminSeedsAdded = false; await saveState(); }
    currentPage = "dashboard";
    render();
    if (currentUser.selectedPlan === "paid" && !isPaidPlan(currentUser)) checkPlanStatus();
  } catch (error) { alert(error.message); button.disabled = false; }
}

function submitSignupDetails(data) {
  const document = onlyDigits(data.get("document"));
  const required = signupDraft.kind === "company" ? 14 : 11;
  if (document && document.length !== required) return alert(`Informe um ${required === 14 ? "CNPJ" : "CPF"} com ${required} dígitos.`);
  signupDraft = { ...signupDraft, companyName: String(data.get("companyName") || "").trim(), name: String(data.get("name") || "").trim(), email: String(data.get("email") || "").trim().toLowerCase(), phone: String(data.get("phone") || "").trim(), document, password: String(data.get("password") || "") };
  signupStep = "plan";
  render();
}

async function chooseSignupPlan(plan, button) {
  button.disabled = true;
  try {
    const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...signupDraft, plan }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Não foi possível criar a conta.");
    signupDraft = {};
    setSession(body.user);
    state = await loadState();
    currentPage = "dashboard";
    render();
    if (plan === "paid") openPlanPaymentModal();
  } catch (error) { alert(error.message); button.disabled = false; }
}

function openPlanPaymentModal(result = null) {
  closeAllModals();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="modal plan-payment-modal">
      <div class="topbar"><div><h2>Assinatura ${currentUser.role === "company" ? "Empresa" : "Individual"}</h2><p>${formatMoney(planPrices[currentUser.role])} por mês</p></div>${modalCloseButton()}</div>
      ${result ? renderPlanPaymentResult(result) : `
        <form class="form" data-form="plan-payment">
          ${!currentUser.document ? `<div class="form-row"><label>${currentUser.role === "company" ? "CNPJ" : "CPF"}</label><input name="document" inputmode="numeric" required placeholder="Somente números" /></div>` : ""}
          <div class="form-row"><label>Forma de pagamento</label><select name="method"><option value="CREDIT_CARD">Cartão de crédito</option><option value="PIX_AUTOMATIC">Pix Automático</option></select></div>
          <p class="small">A assinatura renova mensalmente. O plano pago libera após a confirmação do pagamento. Você pode cancelar a recorrência em Plano e pagamento.</p>
          <label class="toggle-row"><input type="checkbox" name="termsAccepted" required /><span>Concordo com a cobrança mensal de ${formatMoney(planPrices[currentUser.role])} e com o processamento do pagamento pelo Asaas. <a href="https://www.asaas.com/politicas-de-seguranca" target="_blank" rel="noopener">Segurança do Asaas</a>.</span></label>
          <button class="primary-button" type="submit">Continuar para pagamento</button>
        </form>`}
    </section>`;
  mountModal(modal);
}

function renderPlanPaymentResult(result) {
  return `<div class="plan-payment-result">
    <p>${result.status === "active" ? "Pagamento confirmado. Seu plano pago está ativo." : result.status === "pending" ? "Aguardando confirmação do pagamento pelo Asaas." : result.status === "cancelled" ? "A cobrança recorrente foi cancelada." : "O plano pago não está ativo."}</p>
    ${result.invoiceUrl ? `<a class="primary-button" href="${escapeHtml(result.invoiceUrl)}" target="_blank" rel="noopener">Pagar cartão no Asaas</a>` : ""}
    ${result.pixImage ? `<img alt="QR Code Pix Automático" src="data:image/png;base64,${escapeHtml(result.pixImage)}" />` : ""}
    ${result.pixPayload ? `<div class="form-row"><label>Pix copia e cola</label><textarea readonly>${escapeHtml(result.pixPayload)}</textarea></div>` : ""}
    ${result.status === "pending" ? `<button class="secondary-button" type="button" data-action="check-plan-status">Verificar pagamento</button>` : ""}
    ${!["active", "pending"].includes(result.status) && !isPaidPlan(currentUser) ? `<button class="primary-button" type="button" data-action="renew-plan">Assinar novamente</button>` : ""}
    ${result.status === "active" || result.status === "pending" ? `<button class="ghost-button" type="button" data-action="open-cancel-plan-modal">Cancelar recorrência</button>` : ""}
  </div>`;
}

async function submitPlanPayment(form, data) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch("/api/plan/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: String(data.get("method")), document: onlyDigits(data.get("document")), termsAccepted: data.get("termsAccepted") === "on" }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Pagamento indisponível.");
    currentUser.selectedPlan = "paid";
    currentUser.billingStatus = "pending";
    if (data.get("document")) currentUser.document = onlyDigits(data.get("document"));
    openPlanPaymentModal(body);
  } catch (error) { alert(error.message); button.disabled = false; }
}

async function checkPlanStatus() {
  const response = await fetch("/api/plan/status");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return alert(body.error || "Não foi possível verificar.");
  currentUser = body.user;
  state = await loadState();
  render();
  openPlanPaymentModal(body.billing);
}

function openCancelPlanModal() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<section class="modal compact-modal"><div class="topbar"><div><h2>Cancelar meu plano</h2><p>Seu acesso será alterado para o plano gratuito e a cobrança mensal será encerrada no Asaas.</p></div>${modalCloseButton()}</div><form class="form" data-form="cancel-plan"><div class="form-row"><label>Por que está cancelando?</label><select name="reason" required><option value="">Selecione um motivo</option><option>Preço</option><option>Não preciso mais do plano</option><option>Faltam recursos</option><option>Problema técnico</option><option>Outro</option></select></div><div class="form-row"><label>Comentário opcional</label><textarea name="detail" placeholder="Conte-nos como podemos melhorar"></textarea></div><button class="danger-button" type="submit">Confirmar cancelamento</button></form></section>`;
  mountModal(modal);
}

async function cancelPlan(data) {
  const reason = `${String(data?.get("reason") || "")}${data?.get("detail") ? ` — ${String(data.get("detail")).trim()}` : ""}`.trim();
  if (!reason) return alert("Selecione o motivo do cancelamento.");
  const response = await fetch("/api/plan/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return alert(body.error || "Não foi possível cancelar.");
  const auth = await fetch("/api/auth/me");
  currentUser = (await auth.json()).user;
  state = await loadState();
  closeAllModals();
  render();
}

async function submitChangePassword(form, data) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch("/api/auth/password", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: String(data.get("currentPassword") || ""), nextPassword: String(data.get("nextPassword") || "") }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Não foi possível atualizar a senha.");
    form.reset();
    alert("Senha atualizada.");
  } catch (error) { alert(error.message); }
  finally { button.disabled = false; }
}

async function adminSetPlan(id, plan) {
  const message = plan === "paid" ? "Liberar o plano pago sem gerar cobrança para este acesso?" : "Alterar para o plano gratuito e encerrar qualquer recorrência no Asaas?";
  if (!confirm(message)) return;
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/plan`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return alert(body.error || "Não foi possível atualizar o plano.");
  state = await loadState();
  render();
}

async function submitTemplate(form, data) {
  const headerFields = [...form.querySelectorAll(".header-builder-field")].map((node) => ({
    id: uid(),
    label: node.querySelector(".header-field-label").value.trim(),
    type: node.querySelector(".header-field-type").value,
    required: node.querySelector(".header-field-required").checked,
  })).filter((field) => field.label);
  const fields = [...form.querySelectorAll(".builder-field")].map((node) => {
    if (node.classList.contains("header-builder-field")) return null;
    const options = {};
    node.querySelectorAll("[data-option]").forEach((input) => {
      options[input.dataset.option] = input.checked;
    });
    const imageConfig = node.querySelector(".image-builder-config");
    return normalizeTemplateField({
      id: node.dataset.fieldId || uid(),
      title: node.querySelector(".field-title").value.trim(),
      kind: node.querySelector(".field-kind").value,
      options,
      imageSrc: imageConfig?.dataset.imageSrc || "",
      imageMarkers: imageConfig ? getImageMarkers(imageConfig) : [],
    });
  }).filter((field) => field?.title || field?.kind === "signature");
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
    backgroundStyle: String(data.get("backgroundStyle") || "clean"),
    layout: [],
    statusOkLabel: String(data.get("statusOkLabel") || "Correto").trim() || "Correto",
    statusFailLabel: String(data.get("statusFailLabel") || "Incorreto").trim() || "Incorreto",
    statusOkIcon: String(data.get("statusOkIcon") || "check"),
    statusFailIcon: String(data.get("statusFailIcon") || "close"),
    ownerId: existing?.ownerId || currentUser.id,
    companyId: existing?.companyId || currentUser.companyId,
    assignedAgentIds: data.getAll("agentIds"),
    headerFields,
    fields,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (existing) state.templates = state.templates.map((tpl) => (tpl.id === existing.id ? payload : tpl));
  else state.templates.push(payload);
  if (!await saveState()) return;
  closeModal();
  render();
}

async function submitTask(data) {
  const dueDate = String(data.get("dueDate") || selectedTaskDate || toDateKey(new Date()));
  const dueTime = String(data.get("dueTime") || "09:00");
  const notifyEnabled = data.get("notifyEnabled") === "on";
  state.tasks.push({
    id: uid(),
    title: String(data.get("title")).trim(),
    assignedTo: String(data.get("assignedTo")),
    templateId: String(data.get("templateId") || ""),
    ownerId: currentUser.id,
    companyId: currentUser.companyId,
    recurrenceHours: Number(data.get("recurrenceHours") || 0),
    startHour: String(data.get("startHour") || dueTime || "08:00"),
    endHour: String(data.get("endHour") || "18:00"),
    dueDate,
    dueTime,
    notifyEnabled,
    done: false,
    completedLocation: "",
    lastNotifiedAt: null,
    notificationSentAt: null,
    createdAt: new Date().toISOString(),
  });
  selectedTaskDate = dueDate;
  if (!await saveState()) return;
  closeAllModals();
  render();
  if (notifyEnabled) requestNotification({ quiet: true });
}

async function submitUser(formType, data) {
  const email = String(data.get("email")).trim().toLowerCase();
  if (state.users.some((item) => item.email.toLowerCase() === email)) return alert("Email já cadastrado.");
  const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: String(data.get("name") || "").trim(), email, phone: String(data.get("phone") || "").trim(), password: String(data.get("password") || ""), role: formType === "company-user" ? "company" : "agent" }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return alert(body.error || "Não foi possível criar o acesso.");
  state = await loadState();
  closeModal();
  render();
}

async function submitChecklist(form, data) {
  const tpl = state.templates.find((item) => item.id === form.dataset.templateId);
  if (!tpl) return;
  const headerValues = (tpl.headerFields || []).map((field) => ({
    fieldId: field.id,
    label: field.label,
    type: field.type || "text",
    value: String(data.get(`header_${field.id}`) || "").trim(),
  })).filter((item) => item.value || (tpl.headerFields || []).find((field) => field.id === item.fieldId)?.required);
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
      photos: await normalizeImageDataUrls(safeJson(String(data.get(`${field.id}_photos`) || "[]"), [])),
      photoMetadata: safeJson(String(data.get(`${field.id}_photoMetadata`) || "[]"), []),
      photo: await fileToDataUrl(data.get(`${field.id}_photo`)),
      selfieDoc: (await fileToDataUrl(data.get(`${field.id}_selfieDoc`), { maxSize: 1400, quality: 0.72 })) || String(data.get(`${field.id}_selfieDoc_existing`) || ""),
      audio: String(data.get(`${field.id}_audio`) || ""),
      signature: String(data.get(`${field.id}_signature`) || ""),
      imageSrc: field.kind === "image" ? field.imageSrc || "" : "",
      imageMarks: field.kind === "image" ? (field.imageMarkers || []).map((marker) => ({ ...marker, marked: data.get(`${field.id}_marker_${marker.id}`) === "marked" })) : [],
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
    templateBackground: tpl.backgroundStyle || "clean",
    templateLayout: tpl.layout || [],
    statusOkLabel: tpl.statusOkLabel || "Correto",
    statusFailLabel: tpl.statusFailLabel || "Incorreto",
    statusOkIcon: tpl.statusOkIcon || "check",
    statusFailIcon: tpl.statusFailIcon || "close",
    taskId: form.dataset.taskId || "",
    companyId: currentUser.companyId,
    filledBy: currentUser.id,
    headerValues,
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
  const savedLocally = await saveState();
  if (!savedLocally) return;
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
    signupStep = "kind";
    signupDraft = {};
    render();
  }
  const action = target.dataset.action;
  if (!action) return;
  if (action === "logout") {
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSession(null);
    state = { users: [], templates: [], submissions: [], tasks: [] };
    render();
  }
  if (action === "signup-kind") { signupDraft = { kind: target.dataset.kind }; signupStep = "details"; render(); }
  if (action === "signup-back") { signupStep = signupStep === "plan" ? "details" : "kind"; render(); }
  if (action === "signup-plan") chooseSignupPlan(target.dataset.plan, target);
  if (action === "manage-payment") checkPlanStatus();
  if (action === "check-plan-status") checkPlanStatus();
  if (action === "renew-plan") openPlanPaymentModal();
  if (action === "open-cancel-plan-modal") openCancelPlanModal();
  if (action === "toggle-mobile-menu") toggleMobileMenu();
  if (action === "close-mobile-menu") closeMobileMenu();
  if (action === "install-app") installApp();
  if (action === "toggle-theme") {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("luma.theme", next);
    applyTheme();
  }
  if (action === "open-template-modal") openTemplateModal();
  if (action === "open-task-modal") openTaskModal();
  if (action === "add-builder-field") addBuilderField();
  if (action === "add-image-marker") addImageMarker(target.closest(".builder-field"));
  if (action === "add-layout-element") addLayoutElement({ kind: target.dataset.kind });
  if (action === "remove-layout-element") { target.closest(".layout-element")?.remove(); refreshTemplatePreview(); }
  if (action === "add-header-field") addHeaderFieldClean();
  if (action === "remove-builder-row") target.closest(".builder-field")?.remove();
  if (action === "close-modal") closeModal();
  if (action === "start-fill") {
    closeAllModals();
    openFillModal(target.dataset.id, target.dataset.taskId || "");
  }
  if (action === "open-fill-picker") openFillPickerModal();
  if (action === "select-check-status") selectCheckStatus(target.dataset.field, target.dataset.value);
  if (action === "toggle-image-marker") toggleImageMarker(target.dataset.field, target.dataset.marker, target);
  if (action === "open-photo-picker") openPhotoPicker(target.dataset.field);
  if (action === "photo-camera") triggerPhotoInput(target.dataset.field, "camera");
  if (action === "photo-gallery") triggerPhotoInput(target.dataset.field, "gallery");
  if (action === "remove-photo") removePhoto(target.dataset.field, Number(target.dataset.index));
  if (action === "view-photo") openPhotoPreview(target.dataset.field, Number(target.dataset.index));
  if (action === "open-observation-modal") openObservationModal(target.dataset.field);
  if (action === "save-observation") saveObservation(target.dataset.field);
  if (action === "open-signature-modal") openSignatureModal(target.dataset.field);
  if (action === "save-signature") saveSignature(target.dataset.field);
  if (action === "clear-signature") clearSignature(target.dataset.field);
  if (action === "close-signature-modal") closeSignatureModal();
  if (action === "close-this-modal") dismissModal(target.closest(".modal-backdrop"));
  if (action === "capture-location") captureLocation(target.dataset.field);
  if (action === "start-audio") startAudio(target.dataset.field);
  if (action === "stop-audio") stopAudio(target.dataset.field);
  if (action === "view-report") showReport(target.dataset.id, false);
  if (action === "edit-submission") editSubmission(target.dataset.id);
  if (action === "print-report") showReport(target.dataset.id, true);
  if (action === "delete-submission") deleteSubmission(target.dataset.id);
  if (action === "browser-print") exportSubmissionPdf(target.dataset.id);
  if (action === "download-report-pdf") exportSubmissionPdf(target.dataset.id);
  if (action === "share-whatsapp") {
    shareSubmissionWhatsapp(target.dataset.id).catch((error) => {
      if (error?.name !== "AbortError") alert("Não foi possível abrir o compartilhamento do PDF.");
    });
  }
  if (action === "success-pdf") exportSubmissionPdf(target.dataset.id);
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
  if (action === "delete-user") deleteUser(target.dataset.id);
  if (action === "admin-set-plan") adminSetPlan(target.dataset.id, target.dataset.plan);
  if (action === "edit-template") openTemplateModal(target.dataset.id);
  if (action === "delete-template") deleteTemplate(target.dataset.id);
  if (action === "duplicate-template") duplicateTemplate(target.dataset.id);
  if (action === "toggle-task") toggleTask(target.dataset.id, target.checked);
}

function handleChange(event) {
  const input = event.target;
  if (input.matches(".template-image-upload")) loadTemplateImage(input);
  else if (input.matches("[data-photo-input]")) addPhotosFromInput(input);
  else if (input.matches('input[type="file"]')) previewFile(input);
  if (input.matches("[data-option]")) input.dataset.userChanged = "true";
  if (input.matches(".field-kind")) {
    const node = input.closest(".builder-field");
    applyBuilderKindDefaults(node, true);
  }
  if (input.matches(".layout-kind, .layout-content, .layout-x, .layout-y, .layout-w, .layout-h, [name=title]")) refreshTemplatePreview();
}

function handleInput(event) {
  if (event.target.matches("[data-signature]")) return;
  if (event.target.matches("[data-community-search]")) {
    const query = event.target.value.trim().toLocaleLowerCase("pt-BR");
    document.querySelectorAll("[data-community-list] .template-card").forEach((card) => {
      card.hidden = Boolean(query) && !card.textContent.toLocaleLowerCase("pt-BR").includes(query);
    });
  }
}

function mountModal(backdrop) {
  const dialog = backdrop.querySelector(".modal");
  const title = dialog.querySelector("h2");
  modalReturnFocus.set(backdrop, document.activeElement);
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.tabIndex = -1;
  if (title) {
    title.id ||= `dialog-${uid()}`;
    dialog.setAttribute("aria-labelledby", title.id);
  }
  dialog.querySelectorAll(".form-row > label:not([for])").forEach((label) => {
    const control = label.nextElementSibling;
    if (!control?.matches("input, select, textarea")) return;
    control.id ||= `field-${uid()}`;
    label.htmlFor = control.id;
  });
  document.querySelectorAll(".modal-backdrop").forEach((item) => { item.inert = true; });
  app.inert = true;
  document.body.classList.add("has-modal");
  document.body.appendChild(backdrop);
  dialog.focus({ preventScroll: true });
}

function dismissModal(backdrop) {
  if (!backdrop) return;
  const returnFocus = modalReturnFocus.get(backdrop);
  backdrop.remove();
  const remaining = [...document.querySelectorAll(".modal-backdrop")];
  const top = remaining.at(-1);
  if (top) top.inert = false;
  app.inert = Boolean(top);
  document.body.classList.toggle("has-modal", Boolean(top));
  if (returnFocus?.isConnected && !returnFocus.closest("[inert]")) returnFocus.focus({ preventScroll: true });
  else top?.querySelector(".modal")?.focus({ preventScroll: true });
}

function handleModalKeydown(event) {
  const backdrop = [...document.querySelectorAll(".modal-backdrop")].at(-1);
  if (!backdrop || event.isComposing) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== "Tab") return;
  const targets = [...backdrop.querySelectorAll('button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.getClientRects().length && !element.closest("[inert]"));
  const first = targets[0];
  const last = targets.at(-1);
  if (!first) { event.preventDefault(); return; }
  if (!targets.includes(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

function closeModal() {
  const modals = document.querySelectorAll(".modal-backdrop");
  if (modals[modals.length - 1]?.classList.contains("signature-backdrop")) unlockSignatureOrientation();
  dismissModal(modals[modals.length - 1]);
  mediaRecorder = null;
  chunks = [];
}

function closeAllModals() {
  if (document.querySelector(".signature-backdrop")) unlockSignatureOrientation();
  [...document.querySelectorAll(".modal-backdrop")].reverse().forEach(dismissModal);
  mediaRecorder = null;
  chunks = [];
}

function openPhotoPicker(fieldId) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop photo-source-backdrop";
  modal.innerHTML = `
    <section class="modal compact-modal photo-source-modal">
      <div class="topbar">
        <div>
          <h2>Adicionar foto</h2>
          <p>Use a câmera agora ou escolha imagens da galeria.</p>
        </div>
        ${modalCloseButton("close-this-modal")}
      </div>
      <div class="photo-source-actions">
        <button class="primary-button icon-text" data-action="photo-camera" data-field="${fieldId}" type="button">${iconCamera()} Tirar foto</button>
        <button class="secondary-button icon-text" data-action="photo-gallery" data-field="${fieldId}" type="button">${iconUi("gallery")} Galeria</button>
      </div>
    </section>
  `;
  mountModal(modal);
}

function triggerPhotoInput(fieldId, source) {
  dismissModal(document.querySelector(".photo-source-backdrop"));
  document.querySelector(`[data-photo-input="${fieldId}"][data-photo-source="${source}"]`)?.click();
}

async function addPhotosFromInput(input) {
  const fieldId = input.dataset.photoInput;
  const hidden = document.querySelector(`input[name="${fieldId}_photos"]`);
  if (!hidden) return;
  const current = safeJson(hidden.value, []);
  let metadataInput = document.querySelector(`input[name="${fieldId}_photoMetadata"]`);
  if (!metadataInput) {
    metadataInput = document.createElement("input");
    metadataInput.type = "hidden";
    metadataInput.name = `${fieldId}_photoMetadata`;
    hidden.insertAdjacentElement("afterend", metadataInput);
  }
  const currentMetadata = safeJson(metadataInput.value, []);
  const files = [...(input.files || [])].filter((file) => file.type.startsWith("image/"));
  const nextPhotos = await Promise.all(files.map(fileToDataUrl));
  hidden.value = JSON.stringify([...current, ...nextPhotos.filter(Boolean)]);
  const location = document.querySelector(`input[name="${fieldId}_location"]`)?.value || "";
  metadataInput.value = JSON.stringify([...currentMetadata, ...nextPhotos.filter(Boolean).map(() => ({ capturedAt: new Date().toISOString(), device: navigator.userAgent || "", location }))]);
  input.value = "";
  renderPhotoStrip(fieldId);
}

function removePhoto(fieldId, index) {
  const hidden = document.querySelector(`input[name="${fieldId}_photos"]`);
  if (!hidden) return;
  const photos = safeJson(hidden.value, []);
  photos.splice(index, 1);
  hidden.value = JSON.stringify(photos);
  const metadata = safeJson(document.querySelector(`input[name="${fieldId}_photoMetadata"]`)?.value || "[]", []);
  metadata.splice(index, 1);
  const metadataInput = document.querySelector(`input[name="${fieldId}_photoMetadata"]`);
  if (metadataInput) metadataInput.value = JSON.stringify(metadata);
  renderPhotoStrip(fieldId);
}

function renderPhotoStrip(fieldId) {
  const hidden = document.querySelector(`input[name="${fieldId}_photos"]`);
  const strip = document.querySelector(`[data-photo-strip="${fieldId}"]`);
  if (!hidden || !strip) return;
  const photos = safeJson(hidden.value, []);
  strip.innerHTML = photos.map((src, index) => `
    <figure class="thumb">
      <button class="thumb-preview" data-action="view-photo" data-field="${fieldId}" data-index="${index}" type="button" title="Visualizar foto">
        <img src="${src}" alt="Foto ${index + 1}" />
      </button>
      <button data-action="remove-photo" data-field="${fieldId}" data-index="${index}" type="button" title="Excluir foto">×</button>
    </figure>
  `).join("");
}

function openPhotoPreview(fieldId, index) {
  const photos = safeJson(document.querySelector(`input[name="${fieldId}_photos"]`)?.value || "[]", []);
  const src = photos[index];
  if (!src) return;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop photo-preview-backdrop";
  modal.innerHTML = `
    <section class="modal photo-preview-modal">
      <div class="topbar">
        <div>
          <h2>Foto ${index + 1}</h2>
        </div>
        ${modalCloseButton("close-this-modal")}
      </div>
      <img src="${src}" alt="Foto ${index + 1}" />
    </section>
  `;
  mountModal(modal);
}

function openObservationModal(fieldId) {
  const input = document.querySelector(`input[name="${fieldId}_text"]`);
  const title = document.querySelector(`[data-field-id="${fieldId}"] h3`)?.textContent || "Observação";
  const modal = document.createElement("div");
  modal.className = "modal-backdrop evidence-backdrop";
  modal.innerHTML = `
    <section class="modal compact-modal evidence-modal">
      <div class="topbar">
        <div>
          <h2>Observações</h2>
          <p>${escapeHtml(title)}</p>
        </div>
        ${modalCloseButton("close-this-modal")}
      </div>
      <textarea aria-label="Observação" data-observation-editor="${fieldId}" placeholder="Escreva a observação aqui...">${escapeHtml(input?.value || "")}</textarea>
      <div class="toolbar">
        <button class="primary-button" data-action="save-observation" data-field="${fieldId}" type="button">Salvar observação</button>
      </div>
    </section>
  `;
  mountModal(modal);
}

function saveObservation(fieldId) {
  const editor = document.querySelector(`[data-observation-editor="${fieldId}"]`);
  const input = document.querySelector(`input[name="${fieldId}_text"]`);
  const preview = document.querySelector(`[data-note-preview="${fieldId}"]`);
  if (!editor || !input || !preview) return;
  input.value = editor.value.trim();
  preview.textContent = input.value;
  preview.classList.toggle("hidden", !input.value);
  dismissModal(editor.closest(".modal-backdrop"));
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

async function deleteUser(id) {
  const user = state.users.find((item) => item.id === id);
  if (!canDeleteUser(user)) return;
  if (!confirm(`Excluir somente o acesso de ${user.name}? Modelos, checklists e tarefas serão preservados.`)) return;
  const response = await fetch(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return alert(body.error || "Não foi possível excluir o acesso.");
  state = await loadState();
  render();
}

async function submitAsaasCharge(form, data) {
  const result = form.parentElement.querySelector("[data-billing-result]");
  const button = form.querySelector('button[type="submit"]');
  if (result) result.innerHTML = `<div class="empty">Gerando cobrança...</div>`;
  if (button) button.disabled = true;
  try {
    const payload = {
      customer: {
        name: String(data.get("name") || "").trim(),
        cpfCnpj: onlyDigits(data.get("cpfCnpj")),
        email: String(data.get("email") || "").trim(),
        mobilePhone: onlyDigits(data.get("mobilePhone")),
      },
      payment: {
        billingType: String(data.get("billingType") || "CREDIT_CARD"),
        value: Number(data.get("value") || 0),
        dueDate: String(data.get("dueDate") || toDateKey(new Date())),
        description: String(data.get("description") || "Assinatura Checklist Luma").trim() || "Assinatura Checklist Luma",
        externalReference: `luma-${Date.now()}`,
      },
    };
    const response = await fetch("/api/asaas/charges", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Não foi possível gerar a cobrança.");
    if (result) result.innerHTML = renderBillingResult(body);
    form.reset();
    form.querySelector('[name="dueDate"]').value = toDateKey(new Date());
  } catch (error) {
    if (result) result.innerHTML = `<div class="empty danger-empty">${escapeHtml(error.message)}</div>`;
  } finally {
    if (button) button.disabled = false;
  }
}

function renderBillingResult(body) {
  const payment = body.payment || {};
  const pix = body.pixQrCode || null;
  return `
    <article class="billing-success">
      <div>
        <span class="template-kicker">Cobrança criada</span>
        <h3>${escapeHtml(payment.billingType || "Asaas")} · ${escapeHtml(payment.status || "pendente")}</h3>
        <p class="muted">ID ${escapeHtml(payment.id || "")}</p>
      </div>
      <div class="billing-links">
        ${payment.invoiceUrl ? `<a class="primary-button" href="${escapeHtml(payment.invoiceUrl)}" target="_blank" rel="noopener">Abrir fatura</a>` : ""}
        ${payment.bankSlipUrl ? `<a class="secondary-button" href="${escapeHtml(payment.bankSlipUrl)}" target="_blank" rel="noopener">Abrir boleto</a>` : ""}
      </div>
      ${pix ? `
        <div class="pix-box">
          ${pix.encodedImage ? `<img src="data:image/png;base64,${pix.encodedImage}" alt="QR Code Pix" />` : ""}
          <label>Pix copia e cola</label>
          <textarea readonly>${escapeHtml(pix.payload || "")}</textarea>
        </div>
      ` : ""}
    </article>
  `;
}

function onlyDigits(value) {
  return String(value || "").replace(/\D+/g, "");
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
  const input = canvas.nextElementSibling;
  const applyStrokeStyle = () => {
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = document.documentElement.dataset.theme === "dark" ? "#f3f6f8" : "#17202a";
  };
  const resize = () => {
    const existing = input?.value || (canvas.width && canvas.height ? canvas.toDataURL("image/png") : "");
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    applyStrokeStyle();
    if (existing) drawSignatureOnCanvas(canvas, existing);
  };
  resize();
  let drawing = false;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };
  const start = (event) => {
    drawing = true;
    canvas.setPointerCapture?.(event.pointerId);
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
    if (input) input.value = canvas.toDataURL("image/png");
    event.preventDefault();
  };
  const end = (event) => {
    if (!drawing) return;
    drawing = false;
    canvas.releasePointerCapture?.(event.pointerId);
    if (input) input.value = canvas.toDataURL("image/png");
  };
  const redraw = () => requestAnimationFrame(resize);
  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  window.addEventListener("resize", redraw);
  window.addEventListener("orientationchange", redraw);
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

function fileToDataUrl(file, options = {}) {
  if (!file || !file.size) return Promise.resolve("");
  if (file.type.startsWith("image/")) return compressImageSource(URL.createObjectURL(file), options, true);
  return readFileAsDataUrl(file);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

async function normalizeImageDataUrls(images) {
  const compressed = await Promise.all(
    images
      .filter(Boolean)
      .map((src) => compressImageSource(src, { maxSize: 1600, quality: 0.76 }))
  );
  return compressed.filter(Boolean);
}

function compressImageSource(src, options = {}, revoke = false) {
  const { maxSize = 1600, quality = 0.76 } = options;
  return new Promise((resolve) => {
    if (!src) return resolve("");
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (revoke) URL.revokeObjectURL(src);
      resolve(dataUrl);
    };
    image.onerror = () => {
      if (revoke) URL.revokeObjectURL(src);
      resolve(revoke ? "" : src);
    };
    image.src = src;
  });
}

function requestNotification(options = {}) {
  if (!("Notification" in window)) return alert("Notificações não disponíveis.");
  Notification.requestPermission().then((permission) => {
    if (!options.quiet) alert(permission === "granted" ? "Notificações ativadas." : "Permissão não concedida.");
  });
}

function startTaskTicker() {
  setInterval(() => {
    if (!currentUser || !("Notification" in window) || Notification.permission !== "granted") return;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    visibleTasks().forEach((task) => {
      if (task.done) return;
      const todayKey = toDateKey(now);
      if (task.notifyEnabled && taskDateKey(task) === todayKey && !task.notificationSentAt) {
        const [dueH, dueM] = String(task.dueTime || task.startHour || "09:00").split(":").map(Number);
        const dueMinutes = dueH * 60 + dueM;
        if (currentMinutes >= dueMinutes) {
          showTaskNotification(task);
          task.notificationSentAt = now.toISOString();
          task.lastNotifiedAt = now.toISOString();
          saveState();
          return;
        }
      }
      if (!task.recurrenceHours) return;
      const [startH, startM] = String(task.startHour || task.dueTime || "08:00").split(":").map(Number);
      const [endH, endM] = String(task.endHour || "18:00").split(":").map(Number);
      const start = startH * 60 + startM;
      const end = endH * 60 + endM;
      if (currentMinutes < start || currentMinutes > end) return;
      const last = task.lastNotifiedAt ? new Date(task.lastNotifiedAt) : new Date(task.createdAt);
      const due = now - last >= task.recurrenceHours * 60 * 60 * 1000;
      if (!due) return;
      showTaskNotification(task);
      task.lastNotifiedAt = now.toISOString();
      saveState();
    });
  }, 60000);
}

function showTaskNotification(task) {
  new Notification("Checklist Luma", {
    body: `${task.title}${task.dueTime ? ` · ${formatTime(task.dueTime)}` : ""}`,
    tag: `task-${task.id}`,
  });
}

function userName(id) {
  return state.users.find((user) => user.id === id)?.name || "Usuário";
}

function taskDateKey(task) {
  return task.dueDate || toDateKey(task.createdAt || new Date());
}

function taskSortValue(task) {
  return `${task.dueTime || task.startHour || "99:99"}-${task.createdAt || ""}`;
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

function formatTime(value) {
  const [hour = "00", minute = "00"] = String(value || "00:00").split(":");
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
