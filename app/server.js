const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { getCounts, getDatabaseTarget, getProvider } = require('./database');
const { addDays, createId, hashPassword, nowIso, verifyPassword } = require('./security');
const {
  countUsers,
  createCharacter,
  createSession,
  createUser,
  deleteCharacter,
  deleteSession,
  ensureAppStorage,
  findUserByEmail,
  getBootstrapData,
  getCharacterById,
  getSessionWithUser,
  isGlobalCharacterAccess,
  listCharacters,
  listDiceModels,
  listUsers,
  searchCompendium,
  touchSession,
  updateCharacter,
  updateUserRole,
} = require('./store');

const APP_DIR = __dirname;
const ROOT_DIR = path.resolve(APP_DIR, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DICE_BOX_VENDOR_DIR = path.join(APP_DIR, 'vendor', 'dice-box');
const DICE_BOX_DIST_DIR = path.join(ROOT_DIR, 'node_modules', '@3d-dice', 'dice-box', 'dist');
const SESSION_COOKIE_NAME = 'character_manager_session';
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function writeJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(body, null, 2));
}

function writeText(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    ...headers,
  });
  response.end(body);
}

function getPublicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName || user.display_name || '',
    role: user.role,
    createdAt: user.createdAt || user.created_at || null,
    updatedAt: user.updatedAt || user.updated_at || null,
  };
}

function getPermissions(user) {
  return {
    canManageUsers: user.role === 'admin',
    canViewAllCharacters: isGlobalCharacterAccess(user.role),
  };
}

function parseCookies(request) {
  const header = String(request.headers.cookie || '');
  const cookies = {};

  for (const part of header.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (!rawName) {
      continue;
    }

    cookies[rawName] = decodeURIComponent(rawValue.join('='));
  }

  return cookies;
}

function buildSessionCookie(sessionId) {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;
}

function buildClearedSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function resolveStaticPath(baseDir, fileName) {
  const absolutePath = path.resolve(baseDir, fileName);
  if (absolutePath !== baseDir && !absolutePath.startsWith(`${baseDir}${path.sep}`)) {
    const error = new Error('Not found.');
    error.code = 'ENOENT';
    throw error;
  }

  return absolutePath;
}

async function serveStaticFile(response, fileName, baseDir = APP_DIR) {
  const absolutePath = resolveStaticPath(baseDir, fileName);
  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const fileContents = await fs.readFile(absolutePath);

  response.writeHead(200, {
    'content-type': contentType,
  });
  response.end(fileContents);
}

async function serveStaticFileIfExists(response, fileName, baseDir = APP_DIR) {
  try {
    await serveStaticFile(response, fileName, baseDir);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function createSessionForUser(userId, userAgent) {
  const timestamp = nowIso();
  const sessionId = createId();

  await createSession({
    id: sessionId,
    user_id: userId,
    expires_at: addDays(7),
    created_at: timestamp,
    last_seen_at: timestamp,
    user_agent: String(userAgent || '').slice(0, 512),
  });

  return sessionId;
}

async function getAuthenticatedUser(request, response) {
  await ensureAppStorage();

  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) {
    return null;
  }

  const session = await getSessionWithUser(sessionId);
  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await deleteSession(sessionId);
    response.setHeader('Set-Cookie', buildClearedSessionCookie());
    return null;
  }

  await touchSession(sessionId, nowIso());
  return {
    sessionId,
    user: getPublicUser(session.user),
  };
}

function normalizeInteger(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(numericValue), min), max);
}

function buildDefaultCharacterData() {
  return {
    name: 'Unnamed Hero',
    edition: 'all',
    level: 1,
    ancestrySlug: '',
    classSlug: '',
    backgroundSlug: '',
    alignment: 'True Neutral',
    abilities: {
      STR: 15,
      DEX: 14,
      CON: 13,
      INT: 12,
      WIS: 10,
      CHA: 8,
    },
    hp: {
      max: 10,
      current: 10,
      temp: 0,
    },
    ac: 10,
    speed: 30,
    initiative: 0,
    skillRanks: {},
    skillBonuses: {},
    conditions: [],
    attacks: [],
    inventory: [],
    spells: [],
    spellcasting: {
      ability: '',
      attackBonus: 0,
      saveDcBonus: 0,
    },
    features: [],
    notes: '',
  };
}

function sanitizeCharacterPayload(payload) {
  const base = buildDefaultCharacterData();
  const input = payload && typeof payload === 'object' ? payload : {};
  const data = input.data && typeof input.data === 'object' ? input.data : input;
  const abilities = data.abilities && typeof data.abilities === 'object' ? data.abilities : {};
  const hp = data.hp && typeof data.hp === 'object' ? data.hp : {};
  const skillRanks = data.skillRanks && typeof data.skillRanks === 'object' ? data.skillRanks : {};
  const skillBonuses = data.skillBonuses && typeof data.skillBonuses === 'object' ? data.skillBonuses : {};
  const spellcasting = data.spellcasting && typeof data.spellcasting === 'object' ? data.spellcasting : {};

  const characterData = {
    ...base,
    ...data,
    name: String(data.name || input.name || base.name).trim() || base.name,
    edition: String(data.edition || input.edition || 'all').trim() || 'all',
    level: normalizeInteger(data.level || input.level || 1, 1, 1, 20),
    ancestrySlug: String(data.ancestrySlug || input.ancestrySlug || '').trim(),
    classSlug: String(data.classSlug || input.classSlug || '').trim(),
    backgroundSlug: String(data.backgroundSlug || input.backgroundSlug || '').trim(),
    alignment: String(data.alignment || base.alignment).trim() || base.alignment,
    abilities: {
      STR: normalizeInteger(abilities.STR, base.abilities.STR, 1, 30),
      DEX: normalizeInteger(abilities.DEX, base.abilities.DEX, 1, 30),
      CON: normalizeInteger(abilities.CON, base.abilities.CON, 1, 30),
      INT: normalizeInteger(abilities.INT, base.abilities.INT, 1, 30),
      WIS: normalizeInteger(abilities.WIS, base.abilities.WIS, 1, 30),
      CHA: normalizeInteger(abilities.CHA, base.abilities.CHA, 1, 30),
    },
    hp: {
      max: normalizeInteger(hp.max, base.hp.max, 1, 999),
      current: normalizeInteger(hp.current, base.hp.current, 0, 999),
      temp: normalizeInteger(hp.temp, base.hp.temp, 0, 999),
    },
    ac: normalizeInteger(data.ac, base.ac, 0, 99),
    speed: normalizeInteger(data.speed, base.speed, 0, 120),
    initiative: normalizeInteger(data.initiative, base.initiative, -20, 20),
    skillRanks: Object.fromEntries(
      Object.entries(skillRanks)
        .slice(0, 40)
        .map(([key, value]) => [String(key).slice(0, 64), String(value || 'none').slice(0, 32)])
    ),
    skillBonuses: Object.fromEntries(
      Object.entries(skillBonuses)
        .slice(0, 40)
        .map(([key, value]) => [String(key).slice(0, 64), normalizeInteger(value, 0, -20, 20)])
    ),
    conditions: Array.isArray(data.conditions) ? data.conditions.slice(0, 20) : [],
    attacks: Array.isArray(data.attacks) ? data.attacks.slice(0, 200) : [],
    inventory: Array.isArray(data.inventory) ? data.inventory.slice(0, 200) : [],
    spells: Array.isArray(data.spells) ? data.spells.slice(0, 200) : [],
    spellcasting: {
      ability: String(spellcasting.ability || '').slice(0, 16),
      attackBonus: normalizeInteger(spellcasting.attackBonus, 0, -20, 20),
      saveDcBonus: normalizeInteger(spellcasting.saveDcBonus, 0, -20, 20),
    },
    features: Array.isArray(data.features) ? data.features.slice(0, 200) : [],
    notes: String(data.notes || '').slice(0, 10000),
  };

  return {
    name: characterData.name,
    edition: characterData.edition,
    ancestry_slug: characterData.ancestrySlug,
    class_slug: characterData.classSlug,
    background_slug: characterData.backgroundSlug,
    level: characterData.level,
    data_json: JSON.stringify(characterData),
  };
}

function canAccessCharacter(user, character) {
  return isGlobalCharacterAccess(user.role) || character.ownerUserId === user.id;
}

const server = http.createServer(async (request, response) => {
  const provider = getProvider();
  const url = new URL(request.url || '/', 'http://localhost');
  const pathname = url.pathname;

  try {
    if (pathname === '/health') {
      writeJson(response, 200, {
        status: 'ok',
        provider,
        database: getDatabaseTarget(provider),
      });
      return;
    }

    if (pathname === '/stats') {
      const counts = await getCounts();
      writeJson(response, 200, {
        status: 'ok',
        provider,
        counts,
      });
      return;
    }

    if (pathname === '/api/auth/session' && request.method === 'GET') {
      const authenticated = await getAuthenticatedUser(request, response);
      writeJson(response, 200, {
        authenticated: Boolean(authenticated),
        user: authenticated?.user || null,
        permissions: authenticated ? getPermissions(authenticated.user) : null,
      });
      return;
    }

    if (pathname === '/api/auth/register' && request.method === 'POST') {
      const body = await readJsonBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const displayName = String(body.displayName || '').trim() || email.split('@')[0] || 'Player';

      if (!email || !password) {
        writeJson(response, 400, { message: 'Email and password are required.' });
        return;
      }

      if (password.length < 8) {
        writeJson(response, 400, { message: 'Password must be at least 8 characters.' });
        return;
      }

      const existingUser = await findUserByEmail(email);
      if (existingUser) {
        writeJson(response, 409, { message: 'A user with that email already exists.' });
        return;
      }

      const { salt, hash } = hashPassword(password);
      const timestamp = nowIso();
      const role = (await countUsers()) === 0 ? 'admin' : 'player';
      const user = await createUser({
        id: createId(),
        email,
        display_name: displayName,
        password_hash: hash,
        password_salt: salt,
        role,
        created_at: timestamp,
        updated_at: timestamp,
      });

      const sessionId = await createSessionForUser(user.id, request.headers['user-agent']);
      writeJson(
        response,
        201,
        {
          authenticated: true,
          user,
          permissions: getPermissions(user),
        },
        { 'Set-Cookie': buildSessionCookie(sessionId) }
      );
      return;
    }

    if (pathname === '/api/auth/login' && request.method === 'POST') {
      const body = await readJsonBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = await findUserByEmail(email);

      if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
        writeJson(response, 401, { message: 'Invalid email or password.' });
        return;
      }

      const publicUser = getPublicUser(user);
      const sessionId = await createSessionForUser(publicUser.id, request.headers['user-agent']);
      writeJson(
        response,
        200,
        {
          authenticated: true,
          user: publicUser,
          permissions: getPermissions(publicUser),
        },
        { 'Set-Cookie': buildSessionCookie(sessionId) }
      );
      return;
    }

    if (pathname === '/api/auth/logout' && request.method === 'POST') {
      const cookies = parseCookies(request);
      if (cookies[SESSION_COOKIE_NAME]) {
        await deleteSession(cookies[SESSION_COOKIE_NAME]);
      }
      writeJson(
        response,
        200,
        { authenticated: false },
        { 'Set-Cookie': buildClearedSessionCookie() }
      );
      return;
    }

    const authenticated = await getAuthenticatedUser(request, response);
    const currentUser = authenticated?.user || null;

    if (pathname === '/api/bootstrap' && request.method === 'GET') {
      if (!currentUser) {
        writeJson(response, 401, { message: 'Authentication required.' });
        return;
      }

      const edition = url.searchParams.get('edition') || 'all';
      const [characters, compendium, diceModels, users] = await Promise.all([
        listCharacters(currentUser),
        getBootstrapData(edition),
        listDiceModels(),
        currentUser.role === 'admin' ? listUsers() : Promise.resolve(null),
      ]);

      writeJson(response, 200, {
        user: currentUser,
        permissions: getPermissions(currentUser),
        characters,
        compendium,
        diceModels,
        users,
      });
      return;
    }

    if (pathname === '/api/compendium/search' && request.method === 'GET') {
      if (!currentUser) {
        writeJson(response, 401, { message: 'Authentication required.' });
        return;
      }

      const type = url.searchParams.get('type') || '';
      const query = url.searchParams.get('q') || '';
      const edition = url.searchParams.get('edition') || 'all';
      const limit = url.searchParams.get('limit') || '20';

      const results = await searchCompendium({
        type,
        query,
        edition,
        limit,
      });
      writeJson(response, 200, { results });
      return;
    }

    if (pathname === '/api/characters' && request.method === 'GET') {
      if (!currentUser) {
        writeJson(response, 401, { message: 'Authentication required.' });
        return;
      }

      writeJson(response, 200, { characters: await listCharacters(currentUser) });
      return;
    }

    if (pathname === '/api/characters' && request.method === 'POST') {
      if (!currentUser) {
        writeJson(response, 401, { message: 'Authentication required.' });
        return;
      }

      const body = await readJsonBody(request);
      const timestamp = nowIso();
      const payload = sanitizeCharacterPayload(body);
      const character = await createCharacter({
        id: createId(),
        owner_user_id: currentUser.id,
        created_at: timestamp,
        updated_at: timestamp,
        ...payload,
      });

      writeJson(response, 201, { character });
      return;
    }

    const characterMatch = pathname.match(/^\/api\/characters\/([^/]+)$/);
    if (characterMatch) {
      if (!currentUser) {
        writeJson(response, 401, { message: 'Authentication required.' });
        return;
      }

      const characterId = decodeURIComponent(characterMatch[1]);
      const character = await getCharacterById(characterId);
      if (!character) {
        writeJson(response, 404, { message: 'Character not found.' });
        return;
      }

      if (!canAccessCharacter(currentUser, character)) {
        writeJson(response, 403, { message: 'You do not have access to that character.' });
        return;
      }

      if (request.method === 'GET') {
        writeJson(response, 200, { character });
        return;
      }

      if (request.method === 'PUT') {
        const body = await readJsonBody(request);
        const payload = sanitizeCharacterPayload(body);
        const updated = await updateCharacter({
          id: characterId,
          owner_user_id: character.ownerUserId,
          created_at: character.createdAt,
          updated_at: nowIso(),
          ...payload,
        });
        writeJson(response, 200, { character: updated });
        return;
      }

      if (request.method === 'DELETE') {
        await deleteCharacter(characterId);
        writeJson(response, 200, { deleted: true });
        return;
      }
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (pathname === '/api/admin/users' && request.method === 'GET') {
      if (!currentUser || currentUser.role !== 'admin') {
        writeJson(response, 403, { message: 'Admin access required.' });
        return;
      }

      writeJson(response, 200, { users: await listUsers() });
      return;
    }

    if (adminUserMatch && request.method === 'PATCH') {
      if (!currentUser || currentUser.role !== 'admin') {
        writeJson(response, 403, { message: 'Admin access required.' });
        return;
      }

      const body = await readJsonBody(request);
      const role = String(body.role || '').trim();
      if (!['admin', 'gm', 'player'].includes(role)) {
        writeJson(response, 400, { message: 'Role must be admin, gm, or player.' });
        return;
      }

      await updateUserRole(decodeURIComponent(adminUserMatch[1]), role, nowIso());
      writeJson(response, 200, { users: await listUsers() });
      return;
    }

    if (request.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      await serveStaticFile(response, 'index.html');
      return;
    }

    if (
      request.method === 'GET' &&
      (
        pathname === '/app.js' ||
        pathname === '/styles.css' ||
        pathname === '/manifest.webmanifest' ||
        pathname === '/sw.js' ||
        pathname.startsWith('/frontend/') ||
        pathname.startsWith('/styles/') ||
        pathname.startsWith('/icons/')
      )
    ) {
      await serveStaticFile(response, pathname.slice(1));
      return;
    }

    if (request.method === 'GET' && pathname.startsWith('/vendor/dice-box/')) {
      const vendorFile = pathname.slice('/vendor/dice-box/'.length);
      const served =
        (await serveStaticFileIfExists(response, vendorFile, DICE_BOX_VENDOR_DIR)) ||
        (await serveStaticFileIfExists(response, vendorFile, DICE_BOX_DIST_DIR));

      if (!served) {
        writeText(response, 404, 'Not found.');
      }
      return;
    }

    if (request.method === 'GET' && pathname.startsWith('/assets/')) {
      const assetFile = pathname.slice('/assets/'.length);
      const served = await serveStaticFileIfExists(response, assetFile, path.join(PUBLIC_DIR, 'assets'));
      if (!served) {
        writeText(response, 404, 'Not found.');
      }
      return;
    }

    if (pathname.startsWith('/api/')) {
      writeJson(response, 404, { message: 'Not found.' });
      return;
    }

    if (request.method === 'GET') {
      await serveStaticFile(response, 'index.html');
      return;
    }

    writeText(response, 404, 'Not found.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(response, 500, {
      status: 'error',
      provider,
      message,
    });
  }
});

const port = Number(process.env.PORT || 50505);
server.listen(port, () => {
  console.log(`5e-database server listening on ${port} using ${getProvider()}`);
});
