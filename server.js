require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'projects.json');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  name: 'noxframe.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const id = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Envie apenas imagem JPG, PNG, WEBP ou GIF.'));
    }
    cb(null, true);
  }
});

app.use(express.static(PUBLIC_DIR, {
  etag: true,
  maxAge: '1h'
}));

function cleanText(value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function slugify(value) {
  return cleanText(value, 60)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'outros';
}

function safeSize(value) {
  const allowed = new Set(['square', 'wide', 'tall']);
  return allowed.has(value) ? value : 'square';
}

async function readProjects() {
  try {
    const raw = await fsp.readFile(DATA_FILE, 'utf8');
    const items = JSON.parse(raw);
    return Array.isArray(items) ? normalizeOrder(items) : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveProjects(items) {
  const normalized = normalizeOrder(items);
  await fsp.writeFile(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function normalizeOrder(items) {
  return [...items]
    .sort((a, b) => Number(a.order || 9999) - Number(b.order || 9999))
    .map((item, index) => ({ ...item, order: index + 1 }));
}

function publicProject(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    categoryLabel: item.categoryLabel,
    type: item.type,
    typeLabel: item.typeLabel,
    image: item.image,
    size: item.size,
    order: item.order,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok: false, message: 'Faça login para acessar o painel.' });
}

async function removeUploadIfLocal(imagePath) {
  if (!imagePath || !imagePath.startsWith('/uploads/')) return;
  const fileName = path.basename(imagePath);
  const fullPath = path.join(UPLOADS_DIR, fileName);
  if (!fullPath.startsWith(UPLOADS_DIR)) return;

  try {
    await fsp.unlink(fullPath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Não foi possível remover arquivo:', error.message);
  }
}

function buildProjectFromBody(body, file, oldItem = null) {
  const title = cleanText(body.title, 100);
  const categoryLabel = cleanText(body.categoryLabel || body.category, 40) || 'Outros';
  const category = slugify(body.category || categoryLabel);
  const typeLabel = cleanText(body.typeLabel || body.type, 40) || 'Arte';
  const type = slugify(body.type || typeLabel);

  if (!title) {
    const err = new Error('Coloque um título para a arte.');
    err.status = 400;
    throw err;
  }

  if (!oldItem && !file) {
    const err = new Error('Envie uma imagem para publicar.');
    err.status = 400;
    throw err;
  }

  const now = new Date().toISOString();
  const image = file ? `/uploads/${file.filename}` : oldItem.image;

  return {
    id: oldItem?.id || crypto.randomUUID(),
    title,
    category,
    categoryLabel,
    type,
    typeLabel,
    image,
    size: safeSize(body.size),
    order: oldItem?.order || 9999,
    createdAt: oldItem?.createdAt || now,
    updatedAt: now
  };
}

app.get('/api/projects', async (req, res, next) => {
  try {
    const items = await readProjects();
    res.json({ ok: true, items: items.map(publicProject) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/me', (req, res) => {
  res.json({ ok: true, authenticated: Boolean(req.session && req.session.isAdmin) });
});

app.post('/api/admin/login', (req, res) => {
  const password = String(req.body.password || '');
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({
      ok: false,
      message: 'Configure a senha no arquivo .env antes de usar o painel ADM.'
    });
  }

  if (password !== adminPassword) {
    return res.status(401).json({ ok: false, message: 'Senha incorreta.' });
  }

  req.session.isAdmin = true;
  res.json({ ok: true, message: 'Login feito.' });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('noxframe.sid');
    res.json({ ok: true });
  });
});

app.get('/api/admin/projects', requireAdmin, async (req, res, next) => {
  try {
    const items = await readProjects();
    res.json({ ok: true, items });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/projects', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    const items = await readProjects();
    const item = buildProjectFromBody(req.body, req.file);
    item.order = items.length + 1;
    const saved = await saveProjects([...items, item]);
    res.json({ ok: true, item: saved.find((project) => project.id === item.id) });
  } catch (error) {
    if (req.file) await removeUploadIfLocal(`/uploads/${req.file.filename}`);
    next(error);
  }
});

app.post('/api/admin/projects/:id', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    const items = await readProjects();
    const index = items.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      if (req.file) await removeUploadIfLocal(`/uploads/${req.file.filename}`);
      return res.status(404).json({ ok: false, message: 'Arte não encontrada.' });
    }

    const oldItem = items[index];
    const updated = buildProjectFromBody(req.body, req.file, oldItem);
    items[index] = updated;

    const saved = await saveProjects(items);

    if (req.file && oldItem.image !== updated.image) {
      await removeUploadIfLocal(oldItem.image);
    }

    res.json({ ok: true, item: saved.find((project) => project.id === updated.id) });
  } catch (error) {
    if (req.file) await removeUploadIfLocal(`/uploads/${req.file.filename}`);
    next(error);
  }
});

app.post('/api/admin/projects/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const items = await readProjects();
    const item = items.find((project) => project.id === req.params.id);

    if (!item) {
      return res.status(404).json({ ok: false, message: 'Arte não encontrada.' });
    }

    const remaining = items.filter((project) => project.id !== req.params.id);
    await saveProjects(remaining);
    await removeUploadIfLocal(item.image);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/projects/:id/move', requireAdmin, async (req, res, next) => {
  try {
    const direction = req.body.direction === 'down' ? 'down' : 'up';
    const items = await readProjects();
    const index = items.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ ok: false, message: 'Arte não encontrada.' });
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) {
      return res.json({ ok: true, items });
    }

    const temp = items[index].order;
    items[index].order = items[targetIndex].order;
    items[targetIndex].order = temp;

    const saved = await saveProjects(items);
    res.json({ ok: true, items: saved });
  } catch (error) {
    next(error);
  }
});

app.get('/adm', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, message: 'Rota não encontrada.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  const status = error.status || 500;
  res.status(status).json({
    ok: false,
    message: error.message || 'Erro interno. Tente novamente.'
  });
});

app.listen(PORT, () => {
  console.log(`NoxFrame Designs rodando em http://localhost:${PORT}`);
  console.log('Painel ADM: http://localhost:' + PORT + '/adm');
});
