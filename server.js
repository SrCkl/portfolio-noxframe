require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const ADMIN_COOKIE = 'noxframe_auth';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'portfolio';
const PROJECTS_TABLE = 'projects';

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

function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function requireSupabaseConfig() {
  if (!hasSupabaseConfig()) {
    const err = new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente.');
    err.status = 500;
    throw err;
  }
}

function getSupabase() {
  requireSupabaseConfig();

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
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

function labelFromSlug(value) {
  return String(value || 'Outros')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeSize(value) {
  const allowed = new Set(['square', 'wide', 'tall']);
  return allowed.has(value) ? value : 'square';
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

function rowToProject(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    categoryLabel: row.category_label || labelFromSlug(row.category),
    type: row.type,
    typeLabel: row.type_label || labelFromSlug(row.type),
    image: row.image_url,
    size: row.format || 'square',
    order: Number(row.sort_order || 0),
    storagePath: row.storage_path || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function readProjects() {
  if (!hasSupabaseConfig()) return [];

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error('Não foi possível carregar as artes no Supabase: ' + error.message);

  return (data || []).map(rowToProject);
}

async function getProjectRow(id) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

async function getNextOrder() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  if (error) throw new Error('Não foi possível calcular a ordem da arte: ' + error.message);
  return Number(data?.[0]?.sort_order || 0) + 1;
}

async function uploadImageToSupabase(file, category = 'outros') {
  const supabase = getSupabase();
  const extByMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };

  const ext = extByMime[file.mimetype] || path.extname(file.originalname || '').replace('.', '') || 'jpg';
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const storagePath = `${slugify(category)}/${fileName}`;

  const { error } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '31536000',
      upsert: false
    });

  if (error) throw new Error('Erro ao enviar imagem para o Supabase Storage: ' + error.message);

  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath);

  return {
    imageUrl: data.publicUrl,
    storagePath
  };
}

async function removeSupabaseImage(storagePath) {
  if (!storagePath || !hasSupabaseConfig()) return;

  try {
    const supabase = getSupabase();
    await supabase.storage.from(SUPABASE_BUCKET).remove([storagePath]);
  } catch (error) {
    console.warn('Não foi possível remover imagem do Supabase:', error.message);
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

function safeCompare(a, b) {
  const aBuffer = Buffer.from(String(a || ''));
  const bBuffer = Buffer.from(String(b || ''));
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function verifyAdminToken(token) {
  if (!token || !token.includes('.')) return false;

  const [payload, signature] = token.split('.');
  const expected = sign(payload);

  if (!safeCompare(signature, expected)) return false;

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

async function buildProjectFromBody(body, file, oldRow = null) {
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

  if (!oldRow && !file) {
    const err = new Error('Envie uma imagem para publicar.');
    err.status = 400;
    throw err;
  }

  let imageUrl = oldRow?.image_url || '';
  let storagePath = oldRow?.storage_path || '';

  if (file) {
    const uploaded = await uploadImageToSupabase(file, category);
    imageUrl = uploaded.imageUrl;
    storagePath = uploaded.storagePath;
  }

  return {
    title,
    type,
    type_label: typeLabel,
    category,
    category_label: categoryLabel,
    format: safeSize(body.size),
    image_url: imageUrl,
    storage_path: storagePath
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

  if (!safeCompare(password, adminPassword)) {
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
  let uploadedStoragePath = '';

  try {
    const supabase = getSupabase();
    const row = await buildProjectFromBody(req.body, req.file);
    uploadedStoragePath = row.storage_path;
    row.sort_order = await getNextOrder();

    const { data, error } = await supabase
      .from(PROJECTS_TABLE)
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error('Erro ao salvar arte no banco: ' + error.message);

    res.json({ ok: true, item: rowToProject(data) });
  } catch (error) {
    if (uploadedStoragePath) await removeSupabaseImage(uploadedStoragePath);
    next(error);
  }
});

app.post('/api/admin/projects/:id', requireAdmin, upload.single('image'), async (req, res, next) => {
  let uploadedStoragePath = '';

  try {
    const supabase = getSupabase();
    const oldRow = await getProjectRow(req.params.id);

    if (!oldRow) {
      return res.status(404).json({ ok: false, message: 'Arte não encontrada.' });
    }

    const row = await buildProjectFromBody(req.body, req.file, oldRow);
    uploadedStoragePath = req.file ? row.storage_path : '';

    const { data, error } = await supabase
      .from(PROJECTS_TABLE)
      .update(row)
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (error) throw new Error('Erro ao atualizar arte: ' + error.message);

    if (req.file && oldRow.storage_path && oldRow.storage_path !== row.storage_path) {
      await removeSupabaseImage(oldRow.storage_path);
    }

    res.json({ ok: true, item: rowToProject(data) });
  } catch (error) {
    if (uploadedStoragePath) await removeSupabaseImage(uploadedStoragePath);
    next(error);
  }
});

app.post('/api/admin/projects/:id/delete', requireAdmin, async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const oldRow = await getProjectRow(req.params.id);

    if (!oldRow) {
      return res.status(404).json({ ok: false, message: 'Arte não encontrada.' });
    }

    const { error } = await supabase
      .from(PROJECTS_TABLE)
      .delete()
      .eq('id', req.params.id);

    if (error) throw new Error('Erro ao remover arte: ' + error.message);

    await removeSupabaseImage(oldRow.storage_path);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/projects/:id/move', requireAdmin, async (req, res, next) => {
  try {
    const direction = req.body.direction === 'down' ? 'down' : 'up';
    const supabase = getSupabase();
    const items = await readProjects();
    const index = items.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ ok: false, message: 'Arte não encontrada.' });
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= items.length) {
      return res.json({ ok: true, items });
    }

    const current = items[index];
    const target = items[targetIndex];

    const { error: errorOne } = await supabase
      .from(PROJECTS_TABLE)
      .update({ sort_order: target.order })
      .eq('id', current.id);

    if (errorOne) throw new Error('Erro ao mover arte: ' + errorOne.message);

    const { error: errorTwo } = await supabase
      .from(PROJECTS_TABLE)
      .update({ sort_order: current.order })
      .eq('id', target.id);

    if (errorTwo) throw new Error('Erro ao mover arte: ' + errorTwo.message);

    const saved = await readProjects();
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
