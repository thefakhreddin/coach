// Password login with a signed, HttpOnly session cookie (Web Crypto: works in Node 20+ and Workers).

const COOKIE = 'coach_session';
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days
const enc = new TextEncoder();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secretOf(env) {
  // Changing APP_PASSWORD also signs everyone out.
  return `${env.SESSION_SECRET || ''}|${env.APP_PASSWORD}`;
}

export function authEnabled(env) {
  return !!env.APP_PASSWORD;
}

export async function checkPassword(env, password) {
  const a = await hmac('pw', String(password || ''));
  const b = await hmac('pw', String(env.APP_PASSWORD));
  return safeEqual(a, b);
}

export async function makeSessionCookie(env, secure) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const sig = await hmac(secretOf(env), String(exp));
  return `${COOKIE}=${exp}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export async function isAuthenticated(env, request) {
  if (!authEnabled(env)) return true;
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(secretOf(env), exp));
}
