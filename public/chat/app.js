/* ─── M.A.I. Chat Application ───────────────────────────────────────────── */
/* Vanilla JS — no build tools, no frameworks. Fully self-contained PWA.     */

(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'mai-chat-messages';
  const SETTINGS_KEY = 'mai-chat-settings';
  const MAX_MESSAGES = 500;
  const RECONNECT_BASE_DELAY = 1000;
  const RECONNECT_MAX_DELAY = 30000;

  // ─── State ────────────────────────────────────────────────────────────────
  let ws = null;
  let reconnectDelay = RECONNECT_BASE_DELAY;
  let reconnectTimer = null;
  let messages = [];
  let offlineQueue = [];
  let isTyping = false;
  let pendingFile = null;
  let isRecording = false;
  let recognition = null;
  let wsUrl = 'ws://localhost:8080';
  let settings = loadSettings();

  // ─── DOM References ───────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const messageList = $('#message-list');
  const messageInput = $('#message-input');
  const sendBtn = $('#btn-send');
  const voiceBtn = $('#btn-voice');
  const attachBtn = $('#btn-attach');
  const fileInput = $('#file-input');
  const typingIndicator = $('#typing-indicator');
  const connectionStatus = $('#connection-status');
  const scrollAnchor = $('#scroll-anchor');
  const searchBtn = $('#btn-search');
  const searchBar = $('#search-bar');
  const searchInput = $('#search-input');
  const searchClear = $('#search-clear');
  const searchResults = $('#search-results');
  const settingsBtn = $('#btn-settings');
  const settingsPanel = $('#settings-panel');
  const settingsClose = $('#settings-close');
  const filePreview = $('#file-preview');
  const previewImage = $('#preview-image');
  const previewFilename = $('#preview-filename');
  const previewSize = $('#preview-size');
  const previewRemove = $('#preview-remove');
  const reconnectBtn = $('#btn-reconnect');
  const clearHistoryBtn = $('#btn-clear-history');
  const themeSelect = $('#setting-theme');
  const wsUrlInput = $('#setting-ws-url');
  const notifToggle = $('#setting-notifications');
  const soundToggle = $('#setting-sound');
  const filesPanel = $('#files-panel');
  const devicesPanel = $('#devices-panel');

  // ─── Initialization ───────────────────────────────────────────────────────
  function init() {
    registerSW();
    loadMessages();
    renderMessages();
    applySettings(settings);
    bindEvents();
    connect();
  }

  // ─── Service Worker ───────────────────────────────────────────────────────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ─── WebSocket ────────────────────────────────────────────────────────────
  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    updateStatus('connecting');
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      updateStatus('disconnected');
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      updateStatus('connected');
      reconnectDelay = RECONNECT_BASE_DELAY;
      flushOfflineQueue();
      // Request file list
      wsSend({ type: 'file_request', show_hidden: false });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleIncoming(data);
      } catch {
        // Non-JSON message — ignore
      }
    };

    ws.onclose = () => {
      updateStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      updateStatus('disconnected');
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, RECONNECT_MAX_DELAY);
  }

  function wsSend(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    offlineQueue.push(data);
    return false;
  }

  function flushOfflineQueue() {
    while (offlineQueue.length > 0) {
      const msg = offlineQueue.shift();
      wsSend(msg);
    }
  }

  function updateStatus(state) {
    connectionStatus.className = 'connection-status ' + state;
    const labels = { connected: 'Connected', connecting: 'Connecting...', disconnected: 'Offline' };
    connectionStatus.querySelector('.status-text').textContent = labels[state] || state;
  }

  // ─── Incoming Messages ────────────────────────────────────────────────────
  function handleIncoming(data) {
    const { channel, payload, timestamp } = data;

    switch (channel) {
      case 'jarvis_speech':
        showTyping(false);
        addMessage({
          role: 'assistant',
          text: typeof payload === 'string' ? payload : (payload?.text || payload?.message || JSON.stringify(payload)),
          timestamp: timestamp || Date.now(),
          actions: payload?.actions || [],
        });
        break;

      case 'activity_log':
        addMessage({
          role: 'system',
          text: typeof payload === 'string' ? payload : (payload?.text || payload?.description || JSON.stringify(payload)),
          timestamp: timestamp || Date.now(),
        });
        break;

      case 'proactive_alert':
        addMessage({
          role: 'assistant',
          text: typeof payload === 'string' ? payload : (payload?.text || payload?.message || JSON.stringify(payload)),
          timestamp: timestamp || Date.now(),
          actions: [{ status: 'pending', label: 'Proactive' }],
        });
        break;

      case 'file_list':
        renderFileList(payload);
        break;

      case 'device_list':
        renderDeviceList(payload);
        break;

      // ── v4.0 New Channels ──
      case 'system_metrics':
        updateStatusBar(payload);
        break;

      case 'threat_level':
        updateThreatIndicator(payload);
        break;

      case 'reactor_pulse':
        updateConnectionStatus(payload);
        break;

      case 'device_connected':
        addMessage({
          role: 'system',
          text: `Device connected: ${payload.deviceName} via ${payload.channel}`,
          timestamp: timestamp || Date.now(),
        });
        break;

      case 'device_disconnected':
        addMessage({
          role: 'system',
          text: `Device disconnected: ${payload.deviceId} via ${payload.channel}`,
          timestamp: timestamp || Date.now(),
        });
        break;

      case 'gateway_message':
        addMessage({
          role: 'user',
          text: payload.text,
          timestamp: payload.timestamp || Date.now(),
          source: `${payload.channel}:${payload.source}`,
        });
        break;

      case 'notification_incoming':
        addMessage({
          role: 'assistant',
          text: `[${payload.source}] ${payload.title}: ${payload.body}`,
          timestamp: timestamp || Date.now(),
          actions: [{ status: payload.priority === 'urgent' ? 'pending' : 'info', label: payload.source }],
        });
        break;

      case 'ambient_listening':
        updateAmbientIndicator(payload);
        break;

      case 'tunnel_status':
        updateTunnelStatus(payload);
        break;

      case 'analytics_snapshot':
        updateAnalyticsDisplay(payload);
        break;

      case 'voice_call_state':
        updateVoiceCallUI(payload);
        break;

      case 'health_report':
        updateHealthDisplay(payload);
        break;

      case 'user_profile_update':
        // Silently update — no UI action needed in chat
        break;

      case 'typing':
        showTyping(true);
        break;

      default:
        // Unknown channel — display if it has text content
        if (payload && typeof payload === 'object' && payload.text) {
          addMessage({
            role: 'assistant',
            text: payload.text,
            timestamp: timestamp || Date.now(),
          });
        }
    }
  }

  // ─── Message Management ──────────────────────────────────────────────────
  function addMessage(msg) {
    msg.id = generateId();
    messages.push(msg);
    if (messages.length > MAX_MESSAGES) {
      messages = messages.slice(-MAX_MESSAGES);
    }
    persistMessages();
    appendMessageDOM(msg);
    scrollToBottom();
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderMarkdownLite(text) {
    let html = escapeHtml(text);
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Links
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return date + ' ' + time;
  }

  function createActionBadges(actions) {
    if (!actions || !actions.length) return '';
    const icons = { executed: '✓', blocked: '✗', pending: '⏳' };
    return actions
      .map((a) => {
        const status = a.status || 'pending';
        const icon = icons[status] || '⏳';
        const label = a.label || status;
        return `<span class="action-badge ${status}">${icon} ${escapeHtml(label)}</span>`;
      })
      .join('');
  }

  function createMessageEl(msg) {
    const el = document.createElement('div');
    el.className = 'message ' + msg.role;
    el.dataset.id = msg.id;

    if (msg.role === 'system') {
      el.innerHTML = `<div class="system-message"><span class="system-text">${escapeHtml(msg.text)}</span></div>`;
      return el;
    }

    const time = formatTime(msg.timestamp);
    const badges = createActionBadges(msg.actions);
    const badgeHtml = badges ? `<div class="message-badges">${badges}</div>` : '';
    const timeHtml = `<div class="message-time">${time}</div>`;
    const textHtml = `<div class="message-text">${renderMarkdownLite(msg.text)}</div>`;

    el.innerHTML = `<div class="message-bubble">${textHtml}${badgeHtml}${timeHtml}</div>`;

    // Swipe to delete on user messages
    if (msg.role === 'user') {
      setupSwipe(el, msg.id);
    }

    return el;
  }

  function appendMessageDOM(msg) {
    const el = createMessageEl(msg);
    messageList.appendChild(el);
  }

  function renderMessages() {
    messageList.innerHTML = '';
    messages.forEach((msg) => appendMessageDOM(msg));
    scrollToBottom(false);
  }

  function scrollToBottom(smooth = true) {
    if (smooth) {
      scrollAnchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else {
      scrollAnchor.scrollIntoView({ block: 'end' });
    }
  }

  function showTyping(show) {
    isTyping = show;
    typingIndicator.classList.toggle('hidden', !show);
    if (show) scrollToBottom();
  }

  // ─── Swipe to Delete ──────────────────────────────────────────────────────
  function setupSwipe(el, msgId) {
    let startX = 0;
    let currentX = 0;
    let swiping = false;

    el.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      swiping = true;
      el.style.transition = 'none';
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (!swiping) return;
      currentX = e.touches[0].clientX - startX;
      if (currentX > 0) currentX = 0; // Only allow left swipe
      if (currentX < -80) currentX = -80;
      el.style.transform = `translateX(${currentX}px)`;
    }, { passive: true });

    el.addEventListener('touchend', () => {
      if (!swiping) return;
      swiping = false;
      el.style.transition = 'transform 200ms ease';
      if (currentX < -50) {
        // Delete the message
        el.style.transform = 'translateX(-100%)';
        el.style.opacity = '0';
        setTimeout(() => {
          messages = messages.filter((m) => m.id !== msgId);
          persistMessages();
          el.remove();
        }, 200);
      } else {
        el.style.transform = '';
      }
      currentX = 0;
    }, { passive: true });
  }

  // ─── Send Message ─────────────────────────────────────────────────────────
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && !pendingFile) return;

    // Add user message locally
    const userMsg = {
      role: 'user',
      text: text,
      timestamp: Date.now(),
      attachment: pendingFile ? { name: pendingFile.name, size: pendingFile.size, type: pendingFile.type } : null,
    };
    addMessage(userMsg);

    // Send over WebSocket
    wsSend({ type: 'user_input', text: text });

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    clearFilePreview();
    sendBtn.disabled = true;
  }

  // ─── Voice Input ──────────────────────────────────────────────────────────
  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addMessage({ role: 'system', text: 'Voice input not supported in this browser.' });
      return;
    }

    if (isRecording) {
      stopVoice();
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      messageInput.value = transcript;
      autoResizeInput();
    };

    recognition.onend = () => {
      stopVoice();
    };

    recognition.onerror = () => {
      stopVoice();
    };

    recognition.start();
    isRecording = true;
    document.body.classList.add('voice-active');
  }

  function stopVoice() {
    if (recognition) {
      try { recognition.stop(); } catch {}
      recognition = null;
    }
    isRecording = false;
    document.body.classList.remove('voice-active');
  }

  // ─── File Attachment ──────────────────────────────────────────────────────
  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    pendingFile = file;
    previewFilename.textContent = file.name;
    previewSize.textContent = formatFileSize(file.size);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        previewImage.src = ev.target.result;
        previewImage.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    } else {
      previewImage.classList.add('hidden');
    }

    filePreview.classList.remove('hidden');
    fileInput.value = '';
  }

  function clearFilePreview() {
    pendingFile = null;
    filePreview.classList.add('hidden');
    previewImage.src = '';
    previewImage.classList.add('hidden');
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ─── Search ───────────────────────────────────────────────────────────────
  function toggleSearch() {
    const isHidden = searchBar.classList.contains('hidden');
    searchBar.classList.toggle('hidden');
    if (isHidden) {
      searchInput.focus();
    } else {
      searchInput.value = '';
      searchResults.innerHTML = '';
      searchResults.classList.remove('active');
    }
  }

  function performSearch(query) {
    if (!query.trim()) {
      searchResults.innerHTML = '';
      searchResults.classList.remove('active');
      return;
    }

    const q = query.toLowerCase();
    const results = messages.filter(
      (m) => m.role !== 'system' && m.text && m.text.toLowerCase().includes(q)
    ).slice(-20).reverse();

    if (results.length === 0) {
      searchResults.innerHTML = '<div class="panel-empty" style="padding:12px">No results found</div>';
    } else {
      searchResults.innerHTML = results
        .map((m) => {
          const highlighted = escapeHtml(m.text).replace(
            new RegExp(escapeRegExp(query), 'gi'),
            (match) => `<mark>${match}</mark>`
          );
          return `<div class="search-result-item" data-msg-id="${m.id}">
            <div class="sr-text">${highlighted.slice(0, 120)}${highlighted.length > 120 ? '...' : ''}</div>
            <div class="sr-time">${formatTime(m.timestamp)} · ${m.role}</div>
          </div>`;
        })
        .join('');
    }
    searchResults.classList.add('active');
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ─── File & Device Lists ──────────────────────────────────────────────────
  function renderFileList(files) {
    const list = $('#files-list');
    if (!files || !Array.isArray(files) || files.length === 0) {
      list.innerHTML = '<div class="panel-empty">No files found.</div>';
      return;
    }
    list.innerHTML = files
      .map((f) => {
        const name = f.name || f.path || 'Unknown';
        const detail = f.size ? formatFileSize(f.size) : (f.type || '');
        return `<div class="panel-card" data-path="${escapeHtml(f.path || name)}">
          <div class="pc-name">${escapeHtml(name)}</div>
          <div class="pc-detail">${escapeHtml(detail)}</div>
        </div>`;
      })
      .join('');
  }

  function renderDeviceList(devices) {
    const list = $('#devices-list');
    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      list.innerHTML = '<div class="panel-empty">No devices connected.</div>';
      return;
    }
    list.innerHTML = devices
      .map((d) => {
        const name = d.name || d.id || 'Unknown Device';
        const detail = d.type || d.status || '';
        return `<div class="panel-card">
          <div class="pc-name">${escapeHtml(name)}</div>
          <div class="pc-detail">${escapeHtml(detail)}</div>
        </div>`;
      })
      .join('');
  }

  // ─── Settings ─────────────────────────────────────────────────────────────
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { theme: 'dark', notifications: true, sound: true, wsUrl: 'ws://localhost:8080' };
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function applySettings(s) {
    if (s.theme === 'light') {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
    themeSelect.value = s.theme;
    wsUrlInput.value = s.wsUrl || wsUrl;
    notifToggle.checked = s.notifications !== false;
    soundToggle.checked = s.sound !== false;
    wsUrl = s.wsUrl || wsUrl;
  }

  function openSettings() {
    settingsPanel.classList.remove('hidden');
  }

  function closeSettings() {
    settingsPanel.classList.add('hidden');
  }

  // ─── Persistence ──────────────────────────────────────────────────────────
  function persistMessages() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Storage full — trim oldest
      messages = messages.slice(-Math.floor(MAX_MESSAGES / 2));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {}
    }
  }

  function loadMessages() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) messages = JSON.parse(raw);
    } catch {
      messages = [];
    }
  }

  // ─── Auto-resize Textarea ─────────────────────────────────────────────────
  function autoResizeInput() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  }

  // ─── Tab Navigation ───────────────────────────────────────────────────────
  function switchTab(tab) {
    $$('.nav-tab').forEach((t) => t.classList.remove('active'));
    const active = $(`.nav-tab[data-tab="${tab}"]`);
    if (active) active.classList.add('active');

    const isChat = tab === 'chat';
    const isFiles = tab === 'files';
    const isDevices = tab === 'devices';
    const isSettings = tab === 'settings';

    messageList.closest('.message-area').classList.toggle('hidden', !isChat && !isFiles && !isDevices);
    $('.input-area').classList.toggle('hidden', !isChat);
    filesPanel.classList.toggle('hidden', !isFiles);
    devicesPanel.classList.toggle('hidden', !isDevices);

    if (isSettings) openSettings();
    if (isChat) closeSettings();
  }

  // ─── Pull to Refresh ──────────────────────────────────────────────────────
  let pullStartY = 0;
  let pulling = false;

  function setupPullToRefresh() {
    const area = $('#message-area');
    area.addEventListener('touchstart', (e) => {
      if (messageList.scrollTop <= 0) {
        pullStartY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    area.addEventListener('touchmove', (e) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - pullStartY;
      if (dy > 60 && messageList.scrollTop <= 0) {
        // Trigger refresh
        pulling = false;
        if (ws && ws.readyState === WebSocket.OPEN) {
          wsSend({ type: 'file_request', show_hidden: false });
          addMessage({ role: 'system', text: 'Refreshed connection.' });
        } else {
          connect();
        }
      }
    }, { passive: true });

    area.addEventListener('touchend', () => { pulling = false; }, { passive: true });
  }

  // ─── Event Binding ────────────────────────────────────────────────────────
  function bindEvents() {
    // Send message
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    messageInput.addEventListener('input', () => {
      autoResizeInput();
      sendBtn.disabled = !messageInput.value.trim();
    });

    // Voice
    voiceBtn.addEventListener('click', startVoice);

    // File attachment
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    previewRemove.addEventListener('click', clearFilePreview);

    // Search
    searchBtn.addEventListener('click', toggleSearch);
    searchInput.addEventListener('input', () => performSearch(searchInput.value));
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchResults.innerHTML = '';
      searchResults.classList.remove('active');
      searchInput.focus();
    });

    // Settings
    settingsBtn.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', () => {
      closeSettings();
      switchTab('chat');
    });
    settingsPanel.querySelector('.settings-backdrop').addEventListener('click', () => {
      closeSettings();
      switchTab('chat');
    });

    themeSelect.addEventListener('change', () => {
      settings.theme = themeSelect.value;
      applySettings(settings);
      saveSettings();
    });

    wsUrlInput.addEventListener('change', () => {
      settings.wsUrl = wsUrlInput.value.trim();
      saveSettings();
    });

    notifToggle.addEventListener('change', () => {
      settings.notifications = notifToggle.checked;
      saveSettings();
    });

    soundToggle.addEventListener('change', () => {
      settings.sound = soundToggle.checked;
      saveSettings();
    });

    reconnectBtn.addEventListener('click', () => {
      wsUrl = wsUrlInput.value.trim() || wsUrl;
      if (ws) ws.close();
      connect();
    });

    clearHistoryBtn.addEventListener('click', () => {
      if (confirm('Clear all chat history? This cannot be undone.')) {
        messages = [];
        persistMessages();
        renderMessages();
      }
    });

    // Tab navigation
    $$('.nav-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Search result click → scroll to message
    searchResults.addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (!item) return;
      const msgId = item.dataset.msgId;
      const msgEl = messageList.querySelector(`[data-id="${msgId}"]`);
      if (msgEl) {
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        msgEl.style.background = 'var(--accent-dim)';
        setTimeout(() => { msgEl.style.background = ''; }, 2000);
      }
    });

    // File card click → request file read
    $('#files-list').addEventListener('click', (e) => {
      const card = e.target.closest('.panel-card');
      if (!card) return;
      const path = card.dataset.path;
      if (path) wsSend({ type: 'file_read', path });
    });

    // Pull to refresh
    setupPullToRefresh();
  }

  // ─── v4.0 UI Helper Functions ────────────────────────────────────────────

  function updateStatusBar(metrics) {
    const bar = $('#status-bar');
    if (!bar) return;
    bar.innerHTML = `<span>CPU ${metrics.cpu}%</span><span>MEM ${metrics.memory}%</span>`;
    // Color code based on severity
    bar.className = 'status-bar' + (metrics.cpu > 90 || metrics.memory > 90 ? ' critical' : metrics.cpu > 70 || metrics.memory > 70 ? ' warning' : '');
  }

  function updateThreatIndicator(threat) {
    const el = $('#threat-indicator');
    if (!el) return;
    if (el) {
      el.className = 'threat-indicator ' + threat.level;
      el.title = threat.detail || threat.level;
    }
  }

  function updateConnectionStatus(pulse) {
    const statusEl = $('#connection-status');
    if (!statusEl) return;
    const statusText = pulse.status || 'unknown';
    const isConnected = statusText === 'active' || statusText === 'online';
    statusEl.className = 'connection-dot ' + (isConnected ? 'connected' : 'disconnected');
    statusEl.title = `Reactor: ${statusText} (${pulse.power}%)`;
  }

  function updateAmbientIndicator(ambient) {
    const el = $('#ambient-indicator');
    if (!el) return;
    el.style.display = ambient.active ? 'flex' : 'none';
    el.className = 'ambient-indicator' + (ambient.audioLevel > 20 ? ' listening' : ' idle');
  }

  function updateTunnelStatus(tunnel) {
    const el = $('#tunnel-status');
    if (!el) return;
    if (tunnel.active && tunnel.publicUrl) {
      el.textContent = tunnel.publicUrl;
      el.className = 'tunnel-status active';
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }

  function updateAnalyticsDisplay(stats) {
    const el = $('#analytics-bar');
    if (!el) return;
    el.innerHTML = `<span>${stats.totalInteractions} interactions</span><span>${stats.actionsExecuted} actions</span><span>${Math.round(stats.errorRate * 100)}% errors</span>`;
    el.style.display = 'flex';
  }

  function updateVoiceCallUI(callState) {
    const el = $('#voice-call-ui');
    if (!el) return;
    if (callState.active) {
      el.style.display = 'flex';
      el.querySelector('.call-status').textContent = callState.transcript || 'Listening...';
    } else {
      el.style.display = 'none';
    }
  }

  function updateHealthDisplay(health) {
    const el = $('#health-indicator');
    if (!el) return;
    const colors = { healthy: 'green', degraded: 'yellow', critical: 'red' };
    el.className = 'health-indicator ' + (colors[health.overall] || 'green');
    el.title = `${health.overall}: ${health.subsystems.map(s => s.name + '=' + s.status).join(', ')}`;
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
