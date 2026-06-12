require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const ADMIN_COOKIE = 'noxframe_auth';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'noxframe-portfolio';
const DATA_PUBLIC_ID = `${CLOUDINARY_FOLDER}/projects-data.json`;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Envie apenas imagem JPG, PNG, WEBP ou GIF.'));
    }
    cb(null, true);
  }
});

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR, { etag: true, maxAge: '1h' }));

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function requireCloudinaryConfig() {
  if (!hasCloudinaryConfig()) {
    const err = new Error('Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.');
    err.status = 500;
    throw err;
  }
}

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

function dataUrl() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const encodedPublicId = DATA_PUBLIC_ID.split('/').map(encodeURIComponent).join('/');
  return `https://res.cloudinary.com/${cloud}/raw/upload/${encodedPublicId}`;
}

async function readProjects() {
  if (!hasCloudinaryConfig()) return [];

  const response = await fetch(`${dataUrl()}?t=${Date.now()}`, { cache: 'no-store' });

  if (response.status === 404) return [];

  if (!response.ok) {
    throw new Error('Não foi possível carregar os dados do portfólio no Cloudinary.');
  }

  const items = await response.json();
  return Array.isArray(items) ? normalizeOrder(items) : [];
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });

    stream.end(buffer);
  });
}

async function saveProjects(items) {
  requireCloudinaryConfig();
  const normalized = normalizeOrder(items);
  const buffer = Buffer.from(JSON.stringify(normalized, null, 2), 'utf8');

  await uploadBuffer(buffer, {
    resource_type: 'raw',
    public_id: DATA_PUBLIC_ID,
    overwrite: true,
    invalidate: true
  });

  return normalized;
}

async function uploadImageToCloudinary(file) {
  requireCloudinaryConfig();

  return uploadBuffer(file.buffer, {
    resource_type: 'image',
    folder: CLOUDINARY_FOLDER,
    use_filename: false,
    unique_filename: true,
    overwrite: false
  });
}

async function removeCloudinaryImage(publicId) {
  if (!publicId || !hasCloudinaryConfig()) return;

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  } catch (error) {
    console.warn('Não foi possível remover imagem do Cloudinary:', error.message);
  }
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const cookies = raw.split(';').map((part) => part.trim());

  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split('=');
    if (key === name) return decodeURIComponent(valueParts.join('='));
  }

  return '';
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || 'troque-essa-chave-no-env';
}

function sign(value) {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('hex');
}

function createAdminToken() {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + COOKIE_MAX_AGE_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyAdminToken(token) {
  if (!token || !token.includes('.')) return false;

  const [payload, signature] = token.split('.');
  const expected = sign(payload);

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.role === 'admin' && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function setAdminCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${encodeURIComponent(createAdminToken())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}${secure}`);
}

function clearAdminCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

function isAdmin(req) {
  return verifyAdminToken(getCookie(req, ADMIN_COOKIE));
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.status(401).json({ ok: false, message: 'Faça login para acessar o painel.' });
}

async function buildProjectFromBody(body, file, oldItem = null) {
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

  let image = oldItem?.image || '';
  let cloudinaryPublicId = oldItem?.cloudinaryPublicId || '';

  if (file) {
    const uploaded = await uploadImageToCloudinary(file);
    image = uploaded.secure_url;
    cloudinaryPublicId = uploaded.public_id;
  }

  const now = new Date().toISOString();

  return {
    id: oldItem?.id || crypto.randomUUID(),
    title,
    category,
    categoryLabel,
    type,
    typeLabel,
    image,
    cloudinaryPublicId,
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
  res.json({ ok: true, authenticated: isAdmin(req) });
});

app.post('/api/admin/login', (req, res) => {
  const password = String(req.body.password || '');
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ ok: false, message: 'Configure ADMIN_PASSWORD nas variáveis de ambiente.' });
  }

  if (password !== adminPassword) {
    return res.status(401).json({ ok: false, message: 'Senha incorreta.' });
  }

  setAdminCookie(res);
  res.json({ ok: true, message: 'Login feito.' });
});

app.post('/api/admin/logout', (req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
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
  let item = null;

  try {
    const items = await readProjects();
    item = await buildProjectFromBody(req.body, req.file);
    item.order = items.length + 1;

    const saved = await saveProjects([...items, item]);
    res.json({ ok: true, item: saved.find((project) => project.id === item.id) });
  } catch (error) {
    if (item?.cloudinaryPublicId) await removeCloudinaryImage(item.cloudinaryPublicId);
    next(error);
  }
});

app.post('/api/admin/projects/:id', requireAdmin, upload.single('image'), async (req, res, next) => {
  let uploadedNewImage = null;

  try {
    const items = await readProjects();
    const index = items.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ ok: false, message: 'Arte não encontrada.' });
    }

    const oldItem = items[index];
    const updated = await buildProjectFromBody(req.body, req.file, oldItem);
    uploadedNewImage = req.file ? updated.cloudinaryPublicId : null;

    items[index] = updated;
    const saved = await saveProjects(items);

    if (req.file && oldItem.cloudinaryPublicId && oldItem.cloudinaryPublicId !== updated.cloudinaryPublicId) {
      await removeCloudinaryImage(oldItem.cloudinaryPublicId);
    }

    res.json({ ok: true, item: saved.find((project) => project.id === updated.id) });
  } catch (error) {
    if (uploadedNewImage) await removeCloudinaryImage(uploadedNewImage);
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
    await removeCloudinaryImage(item.cloudinaryPublicId);

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
  res.status(status).json({ ok: false, message: error.message || 'Erro interno. Tente novamente.' });
});

app.listen(PORT, () => {
  console.log(`NoxFrame Designs rodando em http://localhost:${PORT}`);
  console.log('Painel ADM: http://localhost:' + PORT + '/adm');
});
