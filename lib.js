// Shared utilities for Ghost sync/publish
const crypto = require('crypto');
const https = require('https');

const GHOST_URL = process.env.GHOST_URL || 'https://blog.heymedy.com';
const API_KEY = process.env.GHOST_ADMIN_API_KEY;

if (!API_KEY) {
  console.error('ERROR: GHOST_ADMIN_API_KEY env var is required');
  console.error('Set it in .env or export it before running');
  process.exit(1);
}

function makeToken() {
  const [id, secret] = API_KEY.split(':');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
  const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'hex'));
  hmac.update(header + '.' + payload);
  const signature = hmac.digest('base64url');
  return header + '.' + payload + '.' + signature;
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(GHOST_URL + path);
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: 'Ghost ' + makeToken(),
        'Content-Type': 'application/json',
        ...(data && { 'Content-Length': Buffer.byteLength(data) }),
      },
    };
    const req = https.request(options, (res) => {
      let buf = '';
      res.on('data', (chunk) => (buf += chunk));
      res.on('end', () => {
        try {
          const json = buf ? JSON.parse(buf) : {};
          if (res.statusCode >= 400) {
            reject(new Error(`${res.statusCode}: ${JSON.stringify(json.errors || json)}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${buf.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

module.exports = { request, slugify, GHOST_URL };
