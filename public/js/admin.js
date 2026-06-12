const loginView = document.querySelector('#loginView');
const dashboardView = document.querySelector('#dashboardView');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const logoutBtn = document.querySelector('#logoutBtn');

const projectForm = document.querySelector('#projectForm');
const formTitle = document.querySelector('#formTitle');
const editingId = document.querySelector('#editingId');
const titleInput = document.querySelector('#titleInput');
const typeSelect = document.querySelector('#typeSelect');
const categorySelect = document.querySelector('#categorySelect');
const sizeSelect = document.querySelector('#sizeSelect');
const imageInput = document.querySelector('#imageInput');
const imageHelp = document.querySelector('#imageHelp');
const submitProjectBtn = document.querySelector('#submitProjectBtn');
const cancelEditBtn = document.querySelector('#cancelEditBtn');
const formMessage = document.querySelector('#formMessage');
const adminList = document.querySelector('#adminList');
const emptyAdminList = document.querySelector('#emptyAdminList');
const itemsCounter = document.querySelector('#itemsCounter');

let currentItems = [];

function setMessage(element, message = '', type = '') {
  element.textContent = message;
  element.className = `admin-message ${type}`.trim();
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
  logoutBtn.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  logoutBtn.hidden = false;
  loadAdminProjects();
}

function selectedLabel(select) {
  const option = select.options[select.selectedIndex];
  return option?.dataset?.label || option?.textContent || select.value;
}

function setSelectValue(select, value, fallbackLabel = '') {
  const found = Array.from(select.options).some((option) => option.value === value);

  if (!found && value) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = fallbackLabel || value;
    option.dataset.label = fallbackLabel || value;
    select.appendChild(option);
  }

  select.value = value || select.options[0]?.value || '';
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || 'Algo deu errado.');
  }

  return data;
}

async function checkSession() {
  try {
    const data = await requestJson('/api/admin/me');
    data.authenticated ? showDashboard() : showLogin();
  } catch (error) {
    showLogin();
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(loginMessage, 'Entrando...');

  try {
    const formData = new FormData(loginForm);
    await requestJson('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: formData.get('password') })
    });

    loginForm.reset();
    setMessage(loginMessage, '');
    showDashboard();
  } catch (error) {
    setMessage(loginMessage, error.message, 'error');
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await requestJson('/api/admin/logout', { method: 'POST' });
  } catch (error) {
    console.warn(error);
  }

  resetProjectForm();
  showLogin();
});

async function loadAdminProjects() {
  adminList.innerHTML = '';
  emptyAdminList.hidden = true;
  itemsCounter.textContent = 'Carregando...';

  try {
    const data = await requestJson('/api/admin/projects', { cache: 'no-store' });
    currentItems = data.items || [];
    renderAdminList();
  } catch (error) {
    emptyAdminList.hidden = false;
    emptyAdminList.textContent = error.message;
    itemsCounter.textContent = 'Erro';
  }
}

function renderAdminList() {
  adminList.innerHTML = '';
  emptyAdminList.hidden = currentItems.length > 0;
  itemsCounter.textContent = `${currentItems.length} ${currentItems.length === 1 ? 'item' : 'itens'}`;

  currentItems.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'admin-item';

    const img = document.createElement('img');
    img.src = item.image || '/assets/logo-noxframe.jpg';
    img.alt = item.title || 'Arte cadastrada';
    img.loading = 'lazy';

    const content = document.createElement('div');
    content.className = 'admin-item-content';

    const titleRow = document.createElement('div');
    titleRow.className = 'admin-item-title-row';

    const titleBlock = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = item.title || 'Sem título';

    const meta = document.createElement('p');
    meta.className = 'admin-item-meta';
    meta.textContent = `${item.typeLabel || 'Arte'} • ${item.categoryLabel || 'Outros'}`;

    titleBlock.append(title, meta);

    const order = document.createElement('span');
    order.className = 'order-pill';
    order.textContent = String(index + 1).padStart(2, '0');

    titleRow.append(titleBlock, order);

    const actions = document.createElement('div');
    actions.className = 'admin-actions';

    actions.append(
      makeActionButton('Editar', () => editItem(item)),
      makeActionButton('Subir', () => moveItem(item.id, 'up')),
      makeActionButton('Descer', () => moveItem(item.id, 'down')),
      makeActionButton('Remover', () => deleteItem(item), 'danger')
    );

    content.append(titleRow, actions);
    card.append(img, content);
    adminList.appendChild(card);
  });
}

function makeActionButton(label, onClick, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `admin-action-btn ${extraClass}`.trim();
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

projectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const isEditing = Boolean(editingId.value);
  const url = isEditing ? `/api/admin/projects/${editingId.value}` : '/api/admin/projects';
  const formData = new FormData(projectForm);

  formData.set('categoryLabel', selectedLabel(categorySelect));
  formData.set('typeLabel', selectedLabel(typeSelect));

  if (isEditing && !imageInput.files.length) {
    formData.delete('image');
  }

  setMessage(formMessage, isEditing ? 'Salvando alteração...' : 'Publicando arte...');
  submitProjectBtn.disabled = true;

  try {
    await requestJson(url, {
      method: 'POST',
      body: formData
    });

    setMessage(formMessage, isEditing ? 'Arte atualizada.' : 'Arte publicada no site.', 'success');
    resetProjectForm();
    await loadAdminProjects();
  } catch (error) {
    setMessage(formMessage, error.message, 'error');
  } finally {
    submitProjectBtn.disabled = false;
  }
});

function editItem(item) {
  editingId.value = item.id;
  titleInput.value = item.title || '';
  setSelectValue(typeSelect, item.type, item.typeLabel);
  setSelectValue(categorySelect, item.category, item.categoryLabel);
  setSelectValue(sizeSelect, item.size || 'square');

  imageInput.required = false;
  imageInput.value = '';
  imageHelp.textContent = 'Envie uma nova imagem somente se quiser trocar a arte atual.';
  formTitle.textContent = 'Editar arte';
  submitProjectBtn.textContent = 'Salvar alteração';
  cancelEditBtn.hidden = false;
  setMessage(formMessage, 'Editando: ' + (item.title || 'arte selecionada'));

  window.scrollTo({ top: 0, behavior: 'smooth' });
  titleInput.focus({ preventScroll: true });
}

function resetProjectForm() {
  projectForm.reset();
  editingId.value = '';
  imageInput.required = true;
  imageHelp.textContent = 'JPG, PNG, WEBP ou GIF. Até 20 MB.';
  formTitle.textContent = 'Nova arte';
  submitProjectBtn.textContent = 'Publicar arte';
  cancelEditBtn.hidden = true;
}

cancelEditBtn.addEventListener('click', () => {
  resetProjectForm();
  setMessage(formMessage, '');
});

async function deleteItem(item) {
  const ok = confirm(`Remover "${item.title}" do portfólio?`);
  if (!ok) return;

  try {
    await requestJson(`/api/admin/projects/${item.id}/delete`, { method: 'POST' });
    if (editingId.value === item.id) resetProjectForm();
    setMessage(formMessage, 'Arte removida.', 'success');
    await loadAdminProjects();
  } catch (error) {
    setMessage(formMessage, error.message, 'error');
  }
}

async function moveItem(id, direction) {
  try {
    await requestJson(`/api/admin/projects/${id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction })
    });
    await loadAdminProjects();
  } catch (error) {
    setMessage(formMessage, error.message, 'error');
  }
}

checkSession();
