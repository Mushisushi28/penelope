// inbox/composer.js — Message compose bar
const MAX_CHARS = 1600;

export function renderComposer(container, thread, pendingDraft, onSent) {
  if (!container) return;

  const hasDraft = !!pendingDraft;

  container.innerHTML = `
    <div class="comp-wrap">
      ${hasDraft ? `
        <div class="comp-draft-notice">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          Penelope has a draft queued for review — sending will replace it.
        </div>
      ` : ''}
      <div class="comp-row">
        <textarea
          class="comp-textarea"
          id="comp-textarea"
          placeholder="Type a message… (Ctrl+Enter to send)"
          maxlength="${MAX_CHARS}"
          rows="2"
          ${thread.paused_at ? '' : 'disabled'}
          aria-label="Compose message"
        ></textarea>
        <div class="comp-actions">
          <span class="comp-chars" id="comp-chars">0/${MAX_CHARS}</span>
          <button class="btn comp-send-btn" id="comp-send" ${thread.paused_at ? '' : 'disabled'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send
          </button>
        </div>
      </div>
      ${!thread.paused_at ? `<div class="comp-paused-notice">Take over this thread to send a manual reply.</div>` : ''}
    </div>
  `;

  const textarea = container.querySelector('#comp-textarea');
  const charEl   = container.querySelector('#comp-chars');
  const sendBtn  = container.querySelector('#comp-send');

  if (!textarea || !sendBtn) return;

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    if (charEl) charEl.textContent = `${len}/${MAX_CHARS}`;
    sendBtn.disabled = len === 0 || len > MAX_CHARS;
  });

  textarea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!sendBtn.disabled) doSend();
    }
  });

  sendBtn.addEventListener('click', doSend);

  async function doSend() {
    const text = textarea.value.trim();
    if (!text) return;

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';

    try {
      const res = await fetch(`/api/inbox/threads/${thread.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          draft_id: pendingDraft?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      textarea.value = '';
      if (charEl) charEl.textContent = `0/${MAX_CHARS}`;
      sendBtn.disabled = false;
      sendBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        Send
      `;

      if (onSent) {
        onSent({
          id: data.id || Date.now(),
          direction: 'outbound',
          text,
          ts: data.ts || new Date().toISOString(),
          is_draft: false,
        });
      }
    } catch (err) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        Send
      `;
      const notice = container.querySelector('.comp-draft-notice') || container.querySelector('.comp-paused-notice');
      const errEl = document.createElement('div');
      errEl.className = 'comp-error';
      errEl.textContent = `Send failed: ${err.message}`;
      container.querySelector('.comp-wrap')?.prepend(errEl);
      setTimeout(() => errEl.remove(), 5000);
    }
  }
}
