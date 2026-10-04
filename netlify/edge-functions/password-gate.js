function cookieName() { return 'yokogawa_voice_lab_session'; }
function sessionSeconds() { return 60 * 60 * 8; }
function encode(value) { return new TextEncoder().encode(value); }

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function page(message = '', configured = true) {
  const detail = configured ? '公演関係者向け<br>パスワードを入力してください' : 'This site is not yet configured.';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Yokogawa AI Voice Lab</title><style>:root{font-family:"Yu Gothic UI",system-ui;color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;color:#eef6f8;background:radial-gradient(circle at 80% 0,#153a42,#071017 55%)}main{width:min(430px,calc(100% - 32px));padding:32px;border:1px solid #28404e;border-radius:14px;background:#0e1a23;box-shadow:0 20px 70px #0008}.eyebrow{margin:0;color:#63e5de;font:700 12px Consolas;letter-spacing:.18em}h1{margin:10px 0 8px;font-size:30px}p{color:#9cb0ba;line-height:1.7}.error{color:#ff8a84}label{display:grid;gap:8px;margin-top:22px;color:#bdcbd2;font-size:13px}input,button{width:100%;min-height:46px;padding:10px 12px;border:1px solid #34505e;border-radius:8px;font:inherit}input{color:#fff;background:#071017}button{margin-top:12px;color:#071017;background:#63e5de;font-weight:700;cursor:pointer}:focus-visible{outline:2px solid #63e5de;outline-offset:3px}</style></head><body><main><p class="eyebrow">YOKOGAWA AI</p><h1>VOICE LAB</h1><p>${detail}</p>${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ''}${configured ? '<form method="post"><label>共有パスワード<input name="password" type="password" required autocomplete="current-password"></label><button type="submit">入室する</button></form>' : ''}</main></body></html>`;
}

function responsePage(body, status, clearCookie = false) {
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store, private',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
  });
  if (clearCookie) headers.set('set-cookie', `${cookieName()}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  return new Response(body, { status, headers });
}

function getPassword() {
  return globalThis.Netlify?.env?.get('PROTECTED_PAGE_PASSWORD') ?? '';
}

async function digest(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256', encode(value))); }
function equalBytes(left, right) { let difference = left.length ^ right.length; const length = Math.max(left.length, right.length); for (let index = 0; index < length; index += 1) difference |= (left[index % left.length] ?? 0) ^ (right[index % right.length] ?? 0); return difference === 0; }
function hex(bytes) { return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join(''); }
async function signingKey(password) { return crypto.subtle.importKey('raw', encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); }
async function signature(password, payload) { return hex(await crypto.subtle.sign('HMAC', await signingKey(password), encode(payload))); }

async function validSession(request, password) {
  const name = cookieName();
  const cookie = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!cookie) return false;
  const [expires, supplied] = cookie.split('.');
  if (!/^\d+$/.test(expires) || Number(expires) <= Date.now() || !supplied) return false;
  return equalBytes(encode(supplied), encode(await signature(password, expires)));
}

export default async (request) => {
  const password = getPassword();
  if (!password) return responsePage(page('', false), 503);
  const url = new URL(request.url);
  if (url.searchParams.get('logout') === '1') return responsePage(page(), 401, true);
  if (await validSession(request, password)) return;
  if (request.method === 'POST') {
    const form = await request.formData();
    const supplied = String(form.get('password') ?? '');
    if (equalBytes(await digest(supplied), await digest(password))) {
      const maxAge = sessionSeconds();
      const expires = String(Date.now() + maxAge * 1000);
      const token = `${expires}.${await signature(password, expires)}`;
      return new Response(null, { status: 303, headers: { location: request.url, 'set-cookie': `${cookieName()}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`, 'cache-control': 'no-store' } });
    }
    return responsePage(page('パスワードが違います'), 401);
  }
  return responsePage(page(), 401);
};

export const config = { path: '/*' };
