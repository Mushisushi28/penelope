// inbox/takeover-toggle.js -- take-over / resume Penelope toggle bar

export function renderTakeoverToggle(container, thread, onToggle) {
  if (!container) return;
  var isPaused = !!thread.paused_at;
  container.innerHTML = isPaused
    ? '<div class="takeover-bar takeover-bar--paused"><span class="takeover-label">You are handling this conversation</span><button class="btn takeover-btn takeover-btn--resume" id="takeover-btn">Resume Penelope</button></div>'
    : '<div class="takeover-bar"><span class="takeover-label">Penelope is handling this</span><button class="btn takeover-btn takeover-btn--take" id="takeover-btn">Take over</button></div>';
  var btn = container.querySelector('#takeover-btn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    btn.disabled = true;
    btn.textContent = '...';
    var action = isPaused ? 'resume' : 'takeover';
    fetch('/api/inbox/threads/' + thread.id + '/' + action, { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (onToggle) {
          onToggle(Object.assign({}, thread, { paused_at: data.paused_at !== undefined ? data.paused_at : null }));
        }
      })
      .catch(function(e) {
        btn.disabled = false;
        btn.textContent = isPaused ? 'Resume Penelope' : 'Take over';
        console.error('toggle failed:', e);
      });
  });
}
