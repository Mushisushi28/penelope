// api.js — fetch helpers for all /api/* routes

const BASE = '';

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'content-type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  if (!r.ok) {
    const msg = await r.text().catch(() => r.statusText);
    throw new Error(`${method} ${path} → ${r.status}: ${msg}`);
  }
  return r.json();
}

export const health         = ()         => req('GET', '/api/health');
export const getBrief       = ()         => req('GET', '/api/brief/today');
export const getShadowQueue = ()         => req('GET', '/api/shadow-queue');
export const getInbox       = (ch)       => req('GET', `/api/inbox${ch ? '?channel=' + ch : ''}`);
export const getThread      = (id)       => req('GET', `/api/inbox/${id}/thread`);
export const getSettings    = ()         => req('GET', '/api/settings');
export const saveSettings   = (data)     => req('POST', '/api/settings', data);
export const busAction      = (action, payload) => req('POST', '/api/action', { action, ...payload });


// v2 inbox API — two-pane omnichannel inbox
export const getInboxThreads  = (ch)         => req('GET', `/api/inbox/threads${ch ? '?channel=' + encodeURIComponent(ch) : ''}`);
export const getInboxMessages = (id)         => req('GET', `/api/inbox/${id}/thread`);
export const takeoverThread   = (id)         => req('POST', `/api/inbox/threads/${id}/takeover`);
export const resumeThread     = (id)         => req('POST', `/api/inbox/threads/${id}/resume`);
export const replyToThread    = (id, text, draftId) => req('POST', `/api/inbox/threads/${id}/reply`, { text, draft_id: draftId ?? null });

export const approveQueueItem = (id) => req('POST', `/api/shadow-queue/${id}/approve`);
export const declineQueueItem = (id) => req('POST', `/api/shadow-queue/${id}/decline`);
export const editQueueItem    = (id, text) => req('POST', `/api/shadow-queue/${id}/edit`, { text });
