// 로컬 테스트용 가짜 Supabase (GoTrue + PostgREST 흉내) → 실제 Postgres 함수 호출
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const DB = process.env.DB || 'e2e';
const psql = (sql) => execFileSync('psql', ['-h', '/tmp', '-p', '5499', '-U', 'postgres', '-d', DB, '-At', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const users = new Map(); // email -> {id, password}
const tokens = new Map(); // token -> id
const argCache = new Map();

function args(fn) {
  if (!argCache.has(fn)) {
    const row = psql(`select coalesce(array_to_string(proargnames, ','), '') || '|' || oidvectortypes(proargtypes) from pg_proc where proname = '${fn.replace(/\W/g, '')}' and pronamespace = 'public'::regnamespace`);
    if (!row) return null;
    const [names, types] = row.split('|');
    const n = names ? names.split(',') : [];
    const t = types ? types.split(', ') : [];
    argCache.set(fn, n.map((x, i) => [x, t[i]]));
  }
  return argCache.get(fn);
}
function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
const issue = (id) => { const t = 'tok-' + crypto.randomUUID(); tokens.set(t, id); return { access_token: t, refresh_token: 'r' + t, expires_in: 3600, token_type: 'bearer', user: { id } }; };

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  let raw = '';
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/auth/v1/signup') {
      if (users.has(body.email)) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      const id = crypto.randomUUID();
      try {
        psql(`insert into auth.users(id, email, raw_user_meta_data) values ('${id}', $E$${body.email}$E$, $J$${JSON.stringify(body.data || {})}$J$::jsonb)`);
      } catch (e) {
        return send(res, 500, { code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' });
      }
      users.set(body.email, { id, password: body.password });
      return send(res, 200, issue(id));
    }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        const u = users.get(body.email);
        if (!u || u.password !== body.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        return send(res, 200, issue(u.id));
      }
      const id = tokens.get(String(body.refresh_token).slice(1));
      if (!id) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      return send(res, 200, issue(id));
    }
    if (url.pathname === '/auth/v1/logout') return send(res, 204);
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
    if (m) {
      if (!req.headers.apikey) return send(res, 401, { message: 'No API key found in request' });
      const fn = m[1];
      const a = args(fn);
      if (!a) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${fn}` });
      const auth = (req.headers.authorization || '').replace('Bearer ', '');
      const uid = tokens.get(auth);
      for (const k of Object.keys(body)) if (!a.find(([n]) => n === k)) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${fn}(${Object.keys(body).join(', ')})` });
      const call = a.filter(([n]) => n in body).map(([n, t]) => `${n} => ${t === 'jsonb' ? `j->'${n}'` : `(j->>'${n}')::${t}`}`).join(', ');
      const sql = `${uid ? `set request.jwt.claim.sub = '${uid}'; set role authenticated;` : 'set role anon;'}
        select coalesce(to_jsonb(public.${fn}(${call}))::text, 'null') from (select $J$${JSON.stringify(body)}$J$::jsonb j) s;`;
      try {
        return send(res, 200, JSON.parse(psql(sql)));
      } catch (e) {
        const msg = String(e.stderr || e.message).match(/ERROR:\s+(.*)/)?.[1] || 'error';
        const code = /permission denied/.test(msg) ? 401 : 400;
        return send(res, code, { code: code === 401 ? '42501' : 'P0001', message: msg, details: null, hint: null });
      }
    }
    send(res, 404, { message: 'not found' });
  } catch (e) {
    send(res, 500, { message: String(e) });
  }
}).listen(8766, () => console.log('fake supabase on 8766'));
