import 'dotenv/config';

export function securityConfig(env = process.env) {
 const base = new URL(env.PUBLIC_URL || env.BETTER_AUTH_URL || 'http://localhost:8080');
 const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
 if (base.protocol !== 'https:' && !(local && env.ALLOW_INSECURE_LOCALHOST === 'true') && env.NODE_ENV === 'production') {
  throw new Error('HTTPS is required; only explicit localhost development may use HTTP');
 }
 const origins = new Set([base.origin]);
 if (env.NODE_ENV === 'production') {
  if ((env.BETTER_AUTH_SECRET || '').length < 32) throw new Error('BETTER_AUTH_SECRET must have at least 32 characters');
  if (!/^[a-f0-9]{64}$/i.test(env.DATA_ENCRYPTION_KEY || '')) throw new Error('DATA_ENCRYPTION_KEY must contain 32 random bytes in hex');
 }
 for (const value of (env.CORS_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean)) {
  const url = new URL(value);
  if (url.origin !== value || url.username || url.password || value.includes('*')) throw new Error('CORS requires exact origins');
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:' && !(local && env.ALLOW_INSECURE_LOCALHOST === 'true' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('CORS origin must use HTTPS');
  origins.add(url.origin);
 }
 return { baseURL: base.origin, origins: [...origins], secureCookies: base.protocol === 'https:' };
}

export function hasUrlCredential(url: string) {
 const parsed = new URL(url, 'http://localhost');
 return [...parsed.searchParams.keys()].some(key => /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|authorization|api[_-]?key|session[_-]?token|password|secret)$/i.test(key));
}
