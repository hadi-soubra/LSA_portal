// ── Shared Chat Panel ────────────────────────────────────────────────────────
// Injects the chat UI into .chat-panel-body and handles AI conversations.
// Reads lsa_token + lsa_user from sessionStorage (set by the auth flow).

(function () {
  const MAX_HISTORY = 10;
  let history = [];

  function getToken() {
    return sessionStorage.getItem('lsa_token');
  }

  function getUserData() {
    return JSON.parse(sessionStorage.getItem('lsa_user') || 'null');
  }

  function isLeader() {
    const u = getUserData();
    return u && u.dashboard === 'leader';
  }

  // ── Build UI ────────────────────────────────────────────────────────────────
  function buildUI() {
    const body = document.querySelector('.chat-panel-body');
    if (!body) return;

    body.innerHTML = `
      <div class="chat-messages" id="chat-messages"></div>
      ${isLeader() ? `
      <div class="chat-scoutmind-row">
        <button class="chat-scoutmind-btn" onclick="openScoutMind()">
          Generate Weekly Meeting Plan
        </button>
      </div>` : ''}
      <div class="chat-input-row">
        <textarea
          id="chat-input"
          class="chat-input"
          placeholder="Ask anything..."
          rows="1"
          onkeydown="chatHandleKey(event)"
        ></textarea>
        <button class="chat-send-btn" onclick="chatSend()">Send</button>
      </div>
    `;
  }

  // ── Render messages ─────────────────────────────────────────────────────────
  function renderMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = history.map(m => `
      <div class="chat-msg chat-msg--${m.role}">
        <span class="chat-bubble">${renderMarkdown(m.content)}</span>
      </div>
    `).join('');

    container.scrollTop = container.scrollHeight;
  }

  function showTyping() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'chat-msg chat-msg--assistant chat-msg--typing';
    el.id = 'chat-typing';
    el.innerHTML = '<span class="chat-bubble">...</span>';
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('chat-typing');
    if (el) el.remove();
  }

  function renderMarkdown(str) {
    let out = str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Convert consecutive bullet lines into <ul> before touching newlines
    out = out.replace(/((?:^|\n)- [^\n]+)+/g, match => {
      const items = match.trim().split('\n')
        .map(l => `<li>${l.replace(/^- /, '')}</li>`)
        .join('');
      return '\n<ul>' + items + '</ul>';
    });

    // Ensure space after sentence-ending punctuation before a capital letter
    out = out.replace(/([.?!])([A-Z])/g, '$1 $2');

    // Remaining newlines become <br>
    out = out.replace(/\n/g, '<br>');
    return out;
  }

  // ── Send message ────────────────────────────────────────────────────────────
  window.chatSend = async function () {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

    history.push({ role: 'user', content: text });
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
    renderMessages();
    showTyping();

    const token = getToken();
    if (!token) { removeTyping(); return; }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: history }),
      });

      removeTyping();

      if (!res.ok) {
        history.push({ role: 'assistant', content: 'Something went wrong. Please try again.' });
      } else {
        const data = await res.json();
        history.push({ role: 'assistant', content: data.reply || 'No response.' });
        if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      }
    } catch {
      removeTyping();
      history.push({ role: 'assistant', content: 'Network error. Please try again.' });
    }

    renderMessages();
  };

  // ── Enter key sends (Shift+Enter = newline) ─────────────────────────────────
  window.chatHandleKey = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatSend();
    }
  };

  // ── ScoutMind redirect ──────────────────────────────────────────────────────
  window.openScoutMind = function () {
    window.open('http://localhost:8501', '_blank');
  };

  // ── Init on DOM ready ───────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', buildUI);
})();
