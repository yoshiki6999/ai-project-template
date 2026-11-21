// AI API client: same-origin, timeout, one retry on network failure, friendly errors.
import * as store from './store.js';

let status = { enabled: false, provider: 'off', checked: false };

export async function checkAi() {
  try {
    const res = await fetchWithTimeout('/api/health', { cache: 'no-store' }, 6000);
    if (res.ok) {
      const j = await res.json();
      status = { ...j.ai, checked: true };
      return status;
    }
  } catch { /* offline or static hosting */ }
  status = { enabled: false, provider: 'off', checked: true };
  return status;
}

export const aiEnabled = () => status.enabled;
export const aiProvider = () => status.provider;

function fetchWithTimeout(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opts, signal: ctl.signal }).finally(() => clearTimeout(t));
}

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export async function ai(task, body) {
  if (!navigator.onLine) throw new ApiError('offline', '现在没有网络，AI 功能需要联网。卡片学习可以离线继续。');
  if (status.requiresCode && !store.settings().accessCode) {
    throw new ApiError('unauthorized', '请先在「我的 → 设置」里填写 AI 访问码。');
  }
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Access-Code': store.settings().accessCode || '' },
    body: JSON.stringify(body),
  };
  let res;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetchWithTimeout(`/api/ai/${task}`, opts, 60000);
      break;
    } catch (e) {
      if (attempt === 1) throw new ApiError('network', e.name === 'AbortError' ? 'AI 响应超时了，请再试一次。' : '网络不稳定，请稍后再试。');
    }
  }
  let j = null;
  try { j = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    if (res.status === 404 && !j) throw new ApiError('ai_disabled', '这个版本没有连接 AI 服务。');
    throw new ApiError(j?.error || 'error', j?.message || `出错了（${res.status}）`);
  }
  return j;
}
