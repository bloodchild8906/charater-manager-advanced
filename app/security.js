const { randomBytes, randomUUID, scryptSync, timingSafeEqual } = require('node:crypto');

function createId() {
  return randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('base64');
  const hash = scryptSync(password, salt, 64).toString('base64');
  return { salt, hash };
}

function verifyPassword(password, passwordSalt, passwordHash) {
  const derivedHash = scryptSync(password, passwordSalt, 64);
  const storedHash = Buffer.from(passwordHash, 'base64');

  if (derivedHash.length !== storedHash.length) {
    return false;
  }

  return timingSafeEqual(derivedHash, storedHash);
}

module.exports = {
  addDays,
  createId,
  hashPassword,
  nowIso,
  verifyPassword,
};
