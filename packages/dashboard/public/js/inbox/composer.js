// inbox/composer.js -- reply composer widget

var MAX_CHARS = 1600;

export function renderComposer(container, thread, pendingDraft, onSent) {
  if (!container) return;
  var isPaused = !!thread.paused_at;
  var draftNotice = pendingDraft
    ? '<div class="comp-draft-notice">&#9670; Penelope has a draft pending approval in the Queue.</div>'
    : (!isPaused ? '<div class="comp-paused-notice">Penelope is handling this conversation. Take over to reply.</div>' : '');
  container.innerHTML = [
    '<div class="comp-wrap">',
    draftNotice,
    '<div class="comp-row">',
    '<textarea class="comp-textarea" id="comp-textarea" placeholder="' + (isPaused ? 'Reply...' : 'Take over to reply') + '" maxlength="' + MAX_CHARS + '" rows="3"' + (!isPaused ? ' disabled' : '') + '></textarea>',
    '</div>',
    '<div class="comp-footer">',
    '<span class="comp-charcount" id="comp-charcount">0 / ' + MAX_CHARS + '</span>',
    '<button class="btn comp-send-btn" id="comp-send" ' + (!isPaused ? 'disabled' : '') + '>Send</button>',
    '</div>',
    '</div>',
  ].join('');
  if (!isPaused) return;
  var textarea = container.querySelector('#comp-textarea');
  var sendBtn  = container.querySelector('#comp-send');
  var charCount = container.querySelector('#comp-charcount');
  textarea.addEventListener('input', function() {
    var len = textarea.value.length;
    charCount.textContent = len + ' / ' + MAX_CHARS;
    sendBtn.disabled = len === 0;
  });
  textarea.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!sendBtn.disabled) sendBtn.click();
    }
  });
  sendBtn.addEventListener('click', function() {
    var text = textarea.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    fetch('/api/inbox/threads/' + thread.id + '/reply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text, draft_id: pendingDraft ? pendingDraft.id || null : null }),
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        textarea.value = '';
        charCount.textContent = '0 / ' + MAX_CHARS;
        sendBtn.textContent = 'Send';
        sendBtn.disabled = true;
        if (onSent) onSent({ direction: 'outbound', text: text, ts: data.ts || new Date().toISOString() });
      })
      .catch(function(e) {
        sendBtn.textContent = 'Send';
        sendBtn.disabled = false;
        console.error('reply failed:', e);
      });
  });
}
