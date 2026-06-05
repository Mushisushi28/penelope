// inbox/takeover-toggle.js — Penelope takeover / resume toggle button
export function renderTakeoverToggle(container, thread, onToggle) {
  if (!container) return;

  const isPaused = !!thread.paused_at;

  container.innerHTML = `
    <div class="tt-wrap">
      <button class="btn tt-btn ${isPaused ? 'tt-btn--resume' : 'tt-btn--takeover'}" id="tt-btn">
        ${isPaused
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <polygon points="5 3 19 12 5 21 5 3"/>
             </svg>
             Resume Penelope`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
               <circle cx="9" cy="7" r="4"/>
               <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
             </svg>
             Take over`
        }
      </button>
      ${isPaused
        ? `<span class="tt-since">Paused ${_relTime(thread.paused_at)}</span>`
        : `<span class="tt-hint">Penelope is handling this conversation</span>`
      }
    </div>
  `;

  const btn = container.querySelector('#tt-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const action = isPaused ? 'resume' : 'takeover';

    try {
      const res = await fetch(`/api/inbox/threads/${thread.id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      if (onToggle) {
        onToggle({
          ...thread,
          paused_at: data.paused_at ?? null,
        });
      }
    } catch (err) {
      btn.disabled = false;
      const errEl = document.createElement('div');
      errEl.className = 'tt-error';
      errEl.textContent = `Failed: ${err.message}`;
      container.querySelector('.tt-wrap')?.append(errEl);
      setTimeout(() => errEl.remove(), 4000);
    }
  });
}

function _relTime(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
