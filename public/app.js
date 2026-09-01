/* ─── M.A.I. Unified Application ───────────────────────────────────────── */
/* Vanilla JS IIFE — no build tools, no frameworks.                          */
/* Merges: HUD (Iron Man) + Chat PWA (Linear/Vercel) into one interface.     */

(function () {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'mai-chat-messages';
  const SETTINGS_KEY = 'mai-chat-settings';
  const MAX_MESSAGES = 500;
  const RECONNECT_BASE_DELAY = 1000;
  const RECONNECT_MAX_DELAY = 30000;
  const SYNTH_DEDUP_WINDOW_MS = 500;
  const SPEAK_DEDUP_WINDOW_MS = 300;

  // ─── State ───────────────────────────────────────────────────────────────
  const state = {
    ws: null,
    reconnectDelay: RECONNECT_BASE_DELAY,
    reconnectTimer: null,
    messages: [],
    offlineQueue: [],
    isTyping: false,
    pendingFile: null,
    isRecording: false,
    recognition: null,
    wsUrl: 'ws://localhost:8080',
    settings: loadSettings(),
    activePanel: 'chat',
    cmdPaletteOpen: false,
    cmdActiveIdx: -1,
    cmdItems: [],

    // Core reactor state
    systemStatus: 'connecting',
    speaking: false,
    callActive: false,
    ttsEngine: 'browser',
    piperReady: false,
    kokoroReady: false,
    voicePersonality: 'friday',

    // Sparkline data
    cpuHistory: [],
    memHistory: [],

    // Speak queue
    _speakQueue: [],
    _speakActive: false,
    _lastSpeakText: '',
    _lastSpeakTime: 0,

    // Neural TTS dedup
    _lastSynthText: '',
    _lastSynthTime: 0,

    // Voice buffer
    voiceBuffer: [],
    maiSpeaking: false,

    // File manager
    currentDir: null,
    fileSearchFilter: '',

    // Activity log entries
    logEntries: [],

    // Background activities
    bgActivities: [],
  };

  // ─── DOM Helpers ───────────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── Settings Persistence ──────────────────────────────────────────────────
  function loadSettings() {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return { theme: 'dark', notifications: true, sound: true, wsUrl: 'ws://localhost:8080' };
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* ignore */ }
  }
  function applySettings(s) {
    document.body.classList.toggle('light', s.theme === 'light');
    const wsUrlInput = $('#setting-ws-url');
    if (wsUrlInput) wsUrlInput.value = s.wsUrl || 'ws://localhost:8080';
  }

  // ─── Message Persistence ───────────────────────────────────────────────────
  function loadMessages() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) { state.messages = JSON.parse(saved); }
    } catch { /* ignore */ }
  }
  function persistMessages() {
    try {
      if (state.messages.length > MAX_MESSAGES) state.messages = state.messages.slice(-MAX_MESSAGES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.messages));
    } catch { /* ignore */ }
  }

  // ─── Initialization ───────────────────────────────────────────────────────
  function init() {
    registerSW();
    loadMessages();
    applySettings(state.settings);
    initParticles();
    initParallax();
    initClock();
    renderMessages();
    bindEvents();
    connect();
    checkOnboarding();
  }

  // ─── Service Worker ───────────────────────────────────────────────────────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ─── Particles ─────────────────────────────────────────────────────────────
  function initParticles() {
    const container = $('#particles');
    if (!container) return;
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (8 + Math.random() * 12) + 's';
      p.style.animationDelay = Math.random() * 10 + 's';
      p.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
      p.style.width = (2 + Math.random() * 2) + 'px';
      p.style.height = p.style.width;
      container.appendChild(p);
    }
  }

  // ─── Parallax ──────────────────────────────────────────────────────────────
  function initParallax() {
    const panels = document.querySelectorAll('[data-parallax]');
    if (!panels.length) return;
    document.addEventListener('mousemove', (e) => {
      const cx = (e.clientX / window.innerWidth - 0.5) * 2;
      const cy = (e.clientY / window.innerHeight - 0.5) * 2;
      panels.forEach((panel, i) => {
        const factor = (i % 2 === 0 ? 1 : -1) * 2;
        panel.style.transform = `translate(${cx * factor}px, ${cy * factor}px)`;
      });
    });
  }

  // ─── Clock ─────────────────────────────────────────────────────────────────
  function initClock() {
    function update() {
      const now = new Date();
      const timeEl = $('#time-display');
      const dateEl = $('#date-display');
      if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
      if (dateEl) dateEl.textContent = now.toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
      }).toUpperCase();
    }
    update();
    setInterval(update, 1000);
  }

  // ─── Sidebar ───────────────────────────────────────────────────────────────
  function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebar-overlay').classList.add('open'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebar-overlay').classList.remove('open'); }
  function toggleSidebar() { $('#sidebar').classList.contains('open') ? closeSidebar() : openSidebar(); }

  // ─── Panel Switching ──────────────────────────────────────────────────────
  function switchPanel(panel) {
    state.activePanel = panel;
    $$('.sidebar-item[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === panel));
    ['chat', 'hud', 'dashboard', 'files'].forEach(p => {
      const el = $('#panel-' + p);
      if (el) el.classList.toggle('hidden', p !== panel);
    });
    const inputArea = document.querySelector('.input-area');
    if (inputArea) inputArea.classList.toggle('hidden', panel !== 'chat');
    closeSidebar();
  }

  // ─── Command Palette ───────────────────────────────────────────────────────
  const CMD_COMMANDS = [
    { id: 'chat', label: 'Go to Chat', shortcut: '1', action: () => switchPanel('chat') },
    { id: 'hud', label: 'Go to HUD', shortcut: '2', action: () => switchPanel('hud') },
    { id: 'dashboard', label: 'Go to Dashboard', shortcut: '3', action: () => switchPanel('dashboard') },
    { id: 'files', label: 'Go to Files', shortcut: '4', action: () => switchPanel('files') },
    { id: 'settings', label: 'Open Settings', action: () => openSettingsModal() },
    { id: 'search', label: 'Search Messages', shortcut: '', action: () => { closeCmdPalette(); toggleSearch(); } },
    { id: 'clear', label: 'Clear Chat History', action: () => { if (confirm('Clear all chat history?')) { state.messages = []; persistMessages(); renderMessages(); } } },
    { id: 'reconnect', label: 'Reconnect WebSocket', action: () => { if (state.ws) state.ws.close(); connect(); } },
    { id: 'theme', label: 'Toggle Theme', action: () => { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; applySettings(state.settings); saveSettings(); } },
  ];

  function openCmdPalette() {
    state.cmdPaletteOpen = true;
    const cp = $('#cmd-palette');
    cp.classList.add('open'); cp.setAttribute('aria-hidden', 'false');
    const input = $('#cmd-input'); input.value = ''; input.focus();
    state.cmdActiveIdx = -1;
    renderCmdResults('');
  }
  function closeCmdPalette() {
    state.cmdPaletteOpen = false;
    const cp = $('#cmd-palette');
    cp.classList.remove('open'); cp.setAttribute('aria-hidden', 'true');
    state.cmdItems = [];
  }
  function renderCmdResults(query) {
    const q = query.toLowerCase().trim();
    state.cmdItems = q ? CMD_COMMANDS.filter(c => c.label.toLowerCase().includes(q)) : CMD_COMMANDS;
    state.cmdActiveIdx = -1;
    const container = $('#cmd-results');
    if (state.cmdItems.length === 0) {
      container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-3);font-size:13px">No commands found</div>';
    } else {
      container.innerHTML = state.cmdItems.map((c, i) =>
        '<div class="cmd-item" data-idx="' + i + '"><span>' + escapeHtml(c.label) + '</span>' + (c.shortcut ? '<span class="cmd-shortcut">' + c.shortcut + '</span>' : '') + '</div>'
      ).join('');
    }
  }
  function executeCmdItem(idx) {
    if (idx >= 0 && idx < state.cmdItems.length) {
      const cmd = state.cmdItems[idx];
      closeCmdPalette();
      cmd.action();
    }
  }

  // ─── Search ───────────────────────────────────────────────────────────────
  function toggleSearch() {
    const bar = $('#search-bar');
    if (bar.classList.contains('hidden')) {
      bar.classList.remove('hidden');
      $('#search-input').focus();
    } else {
      bar.classList.add('hidden');
      renderMessages();
    }
  }
  function doSearch(query) {
    const q = query.toLowerCase().trim();
    if (!q) { renderMessages(); return; }
    const container = $('#search-results');
    const results = state.messages.filter(m => m.text && m.text.toLowerCase().includes(q));
    container.innerHTML = results.slice(0, 20).map(m =>
      '<div class="search-result-item" data-ts="' + m.timestamp + '">' + escapeHtml(m.text.slice(0, 100)) + '</div>'
    ).join('');
  }

  // ─── WebSocket ────────────────────────────────────────────────────────────
  function connect() {
    if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return;
    updateConnectionStatus('connecting');
    updateCoreStatus('CONNECTING...');
    try {
      const token = typeof __WS_TOKEN__ !== 'undefined' ? __WS_TOKEN__ : '';
      const url = state.wsUrl + (token ? '?token=' + token : '');
      state.ws = new WebSocket(url);
    } catch {
      updateConnectionStatus('disconnected');
      scheduleReconnect();
      return;
    }
    state.ws.onopen = () => {
      updateConnectionStatus('connected');
      updateCoreStatus('ONLINE');
      state.reconnectDelay = RECONNECT_BASE_DELAY;
      flushOfflineQueue();
      wsSend({ type: 'file_request', show_hidden: false });
      wsSend({ type: 'get_context_occupancy' });
    };
    state.ws.onmessage = (event) => {
      try { handleIncoming(JSON.parse(event.data)); } catch { /* ignore */ }
    };
    state.ws.onclose = () => {
      updateConnectionStatus('disconnected');
      updateCoreStatus('DISCONNECTED');
      scheduleReconnect();
    };
    state.ws.onerror = () => { updateConnectionStatus('disconnected'); };
  }
  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    state.reconnectTimer = setTimeout(() => { state.reconnectTimer = null; connect(); }, state.reconnectDelay);
    state.reconnectDelay = Math.min(state.reconnectDelay * 1.5, RECONNECT_MAX_DELAY);
  }
  function wsSend(data) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) { state.ws.send(JSON.stringify(data)); return true; }
    state.offlineQueue.push(data); return false;
  }
  function flushOfflineQueue() { while (state.offlineQueue.length > 0) wsSend(state.offlineQueue.shift()); }

  function updateConnectionStatus(s) {
    const el = $('#sidebar-conn');
    if (!el) return;
    const dot = el.querySelector('.spip');
    const val = el.querySelector('.sval');
    const labels = { connected: 'Connected', connecting: 'Connecting...', disconnected: 'Offline' };
    if (dot) dot.className = 'spip ' + (s === 'connected' ? 'green' : s === 'connecting' ? 'yellow' : 'disconnected');
    if (val) val.textContent = labels[s] || s;
    const subtitle = $('#header-subtitle');
    if (subtitle) subtitle.textContent = s === 'connected' ? 'Agentic AI' : (labels[s] || s);
  }

  function updateCoreStatus(text) {
    const el = $('#status-text');
    if (el) el.textContent = text;
  }

  // ─── Incoming Message Handler ──────────────────────────────────────────────
  function handleIncoming(data) {
    const { channel, payload, timestamp } = data;
    switch (channel) {
      case 'jarvis_speech': {
        showTyping(false);
        const text = typeof payload === 'string' ? payload : (payload?.text || payload?.message || JSON.stringify(payload));
        addChatBubble('ai', text, timestamp);
        speak(text);
        break;
      }
      case 'activity_log': {
        const text = typeof payload === 'string' ? payload : (payload?.text || payload?.description || payload?.message || JSON.stringify(payload));
        const level = payload?.level || 'info';
        addLogEntry(text, level);
        addChatBubble('system', text, timestamp);
        break;
      }
      case 'proactive_alert': {
        const text = typeof payload === 'string' ? payload : (payload?.text || payload?.message || JSON.stringify(payload));
        addChatBubble('ai', text, timestamp);
        speak(text);
        break;
      }
      case 'system_metrics': updateMetrics(payload); break;
      case 'gpu_stats': updateGpuStats(payload); break;
      case 'threat_level': updateThreatLevel(payload); break;
      case 'reactor_pulse': updateReactorPulse(payload); break;
      case 'file_list': renderFileList(payload); break;
      case 'device_list': break;
      case 'device_connected': addChatBubble('system', 'Device connected: ' + payload.deviceName, timestamp); break;
      case 'device_disconnected': addChatBubble('system', 'Device disconnected: ' + payload.deviceId, timestamp); break;
      case 'gateway_message': addChatBubble('user', payload.text, payload.timestamp || timestamp); break;
      case 'notification_incoming': addChatBubble('system', '[' + payload.source + '] ' + payload.title + ': ' + payload.body, timestamp); break;
      case 'ambient_listening': updateAmbientIndicator(payload); break;
      case 'tunnel_status': updateTunnelStatus(payload); break;
      case 'analytics_snapshot': updateAnalytics(payload); break;
      case 'voice_call_state': updateVoiceCallUI(payload); break;
      case 'health_report': updateHealthDisplay(payload); break;
      case 'user_profile_update': break;
      case 'typing': showTyping(true); break;
      case 'interim_message': handleInterimMessage(payload); break;
      case 'context_occupancy': updateContextMeter(payload); break;
      case 'router_status': updateRouterStatus(payload); break;
      case 'routing_decision': break;
      case 'bg_activity': handleBgActivity(payload, timestamp); break;
      case 'action_progress': handleActionProgress(payload, timestamp); break;
      case 'approval_required': handleApproval(payload); break;
      case 'promotion_required': handlePromotion(payload); break;
      case 'piper_audio': handleNeuralAudio(payload); break;
      case 'voice_switch': handleVoiceSwitch(payload, timestamp); break;
      case 'tts_engine_status': handleTtsEngineStatus(payload); break;
      case 'tts_engine_switch': handleTtsEngineSwitch(payload, timestamp); break;
      case 'silent_text': addChatBubble('system', payload?.text, timestamp, true); break;
      case 'sandbox_output': break;
      case 'sandbox_session_event': addChatBubble('system', 'Sandbox ' + payload.event + ': ' + payload.name, timestamp); break;
      case 'device_event': addChatBubble('system', 'Device ' + payload.event + ': ' + payload.name, timestamp); break;
      case 'ui_patch': applyUIPatch(payload); break;
      default:
        if (payload && typeof payload === 'object' && payload.text) addChatBubble('ai', payload.text, timestamp);
    }
  }

  // ─── Chat Message Rendering ─────────────────────────────────────────────────
  function addChatBubble(role, text, timestamp, silent) {
    if (!text || typeof text !== 'string') return;
    const msg = { role, text, timestamp: timestamp || Date.now(), silent: !!silent };
    state.messages.push(msg);
    persistMessages();
    if (state.activePanel === 'chat' && !silent) renderMessage(msg);
  }

  function renderMessages() {
    const list = $('#message-list');
    if (!list) return;
    list.innerHTML = '';
    state.messages.forEach(m => renderMessage(m, true));
    scrollToBottom();
  }

  function renderMessage(msg, isBulk) {
    const list = $('#message-list');
    if (!list) return;
    if (isBulk && state.activePanel !== 'chat') return;
    const div = document.createElement('div');
    div.className = 'chat-bubble ' + msg.role;
    const labels = { ai: 'M.A.I.', user: 'YOU', system: 'SYSTEM' };
    const time = new Date(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    let inner = '<div class="chat-bubble-label">' + (labels[msg.role] || msg.role.toUpperCase()) + ' <span style="opacity:0.5;margin-left:8px">' + time + '</span></div>';
    inner += '<div class="md">' + renderMarkdown(msg.text) + '</div>';
    // Render GenUI components if present
    if (msg.components) inner += renderComponents(msg.components);
    div.innerHTML = inner;
    list.appendChild(div);
    if (!isBulk) scrollToBottom();
  }

  function scrollToBottom() {
    const anchor = $('#scroll-anchor');
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function showTyping(show) {
    const el = $('#typing-indicator');
    if (el) el.classList.toggle('hidden', !show);
  }

  // ─── Markdown Renderer ─────────────────────────────────────────────────────
  function renderMarkdown(text) {
    if (!text) return '';
    let html = text;
    // Fenced code blocks
    const codeBlocks = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push('<pre><code>' + escapeHtml(code.trimEnd()) + '</code></pre>');
      return '%%CODEBLOCK_' + idx + '%%';
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Tables
    html = html.replace(/^(\|.+\|)\n(\|[-:| ]+\|)\n((?:\|.+\|\n?)+)/gm, (_, header, sep, body) => {
      const headers = header.split('|').filter(c => c.trim()).map(c => '<th>' + c.trim() + '</th>').join('');
      const rows = body.trim().split('\n').map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => '<td>' + c.trim() + '</td>').join('');
        return '<tr>' + cells + '</tr>';
      }).join('');
      return '<table><thead><tr>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table>';
    });
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold, italic, strikethrough
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr>');
    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    // Unordered lists
    html = html.replace(/^[*\-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    // Paragraphs (loose lines)
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');
    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      html = html.replace('%%CODEBLOCK_' + i + '%%', block);
    });
    return html;
  }

  // ─── GenUI Component Engine ────────────────────────────────────────────────
  function renderComponents(components) {
    if (!components || !Array.isArray(components)) return '';
    return components.map(renderComponent).join('');
  }
  function renderComponent(comp) {
    if (!comp || !comp.type) return '';
    const p = comp.props || {};
    switch (comp.type) {
      case 'card': return renderGUICard(p);
      case 'table': return renderGUITable(p);
      case 'chart': return renderGUIChart(p);
      case 'progress': return renderGUIProgress(p);
      case 'metric': return renderGUIMetric(p);
      case 'stat-grid': return renderGUIStatGrid(p);
      case 'timeline': return renderGUITimeline(p);
      case 'kanban': return renderGUIKanban(p);
      case 'code': return renderGUICode(p);
      case 'file-tree': return renderGUIFileTree(p);
      case 'terminal': return renderGUITerminal(p);
      case 'image': return renderGUIImage(p);
      case 'list': return renderGUIList(p);
      case 'approval': return renderGUIApproval(p);
      case 'error': return '<div class="genui-error">' + escapeHtml(p.message || 'Error') + '</div>';
      case 'empty-state': return '<div style="text-align:center;color:var(--text-3);padding:24px">' + escapeHtml(p.message || 'No data') + '</div>';
      default: return '';
    }
  }
  function renderGUICard(p) {
    let h = '<div class="genui-card">';
    if (p.image) h += '<img style="max-width:100%;border-radius:6px" src="' + escapeHtml(p.image) + '" alt="" loading="lazy">';
    if (p.title) h += '<div class="genui-card-title">' + escapeHtml(p.title) + '</div>';
    if (p.description) h += '<div class="genui-card-desc">' + renderMarkdown(p.description) + '</div>';
    if (p.badges && p.badges.length) {
      h += '<div class="genui-badges">' + p.badges.map(b => {
        const label = typeof b === 'string' ? b : (b.label || '');
        const color = (b.color || '');
        return '<span class="genui-badge ' + color + '">' + escapeHtml(label) + '</span>';
      }).join('') + '</div>';
    }
    if (p.actions && p.actions.length) {
      h += '<div class="genui-card-actions">' + p.actions.map(a => {
        const cls = a.variant === 'primary' ? ' primary' : (a.variant === 'danger' ? ' danger' : '');
        return '<button class="genui-btn' + cls + '">' + escapeHtml(a.label || '') + '</button>';
      }).join('') + '</div>';
    }
    h += '</div>'; return h;
  }
  function renderGUITable(p) {
    if (!p.headers || !p.rows) return '';
    let h = '<div class="genui-card"><table class="genui-table"><thead><tr>';
    p.headers.forEach(hd => { h += '<th>' + escapeHtml(hd) + '</th>'; });
    h += '</tr></thead><tbody>';
    p.rows.forEach(r => {
      h += '<tr>'; const cells = Array.isArray(r) ? r : p.headers.map(hd => r[hd] || '');
      cells.forEach(c => { h += '<td>' + escapeHtml(String(c)) + '</td>'; }); h += '</tr>';
    });
    h += '</tbody></table></div>'; return h;
  }
  function renderGUIChart(p) {
    if (!p.data || !p.data.length) return '';
    const maxVal = Math.max(...p.data.map(d => d.value || 0), 1);
    let h = '<div class="genui-card"><div class="genui-chart">';
    p.data.forEach(d => { const pct = ((d.value || 0) / maxVal) * 100; h += '<div class="genui-chart-bar-item"><div class="genui-chart-bar-fill" style="height:' + pct + '%"></div><div class="genui-chart-bar-label">' + escapeHtml(d.label || '') + '</div></div>'; });
    h += '</div></div>'; return h;
  }
  function renderGUIProgress(p) {
    const pct = Math.min(100, Math.max(0, p.percent || 0));
    return '<div class="genui-card"><div class="genui-progress"><div class="genui-progress-label"><span>' + escapeHtml(p.label || 'Progress') + '</span><span>' + pct + '%</span></div><div class="genui-progress-bar"><div class="genui-progress-fill" style="width:' + pct + '%"></div></div></div></div>';
  }
  function renderGUIMetric(p) {
    const trend = p.trend ? '<div class="genui-metric-trend ' + (p.trend > 0 ? 'up' : 'down') + '">' + (p.trend > 0 ? '\u2191' : '\u2193') + ' ' + Math.abs(p.trend) + '%</div>' : '';
    return '<div class="genui-metric"><div class="genui-metric-value">' + escapeHtml(String(p.value || '\u2014')) + '</div><div class="genui-metric-label">' + escapeHtml(p.label || '') + '</div>' + trend + '</div>';
  }
  function renderGUIStatGrid(p) {
    if (!p.metrics || !p.metrics.length) return '';
    let h = '<div class="genui-card"><div class="genui-stat-grid">';
    p.metrics.forEach(m => { h += renderGUIMetric(m); });
    h += '</div></div>'; return h;
  }
  function renderGUITimeline(p) {
    if (!p.events || !p.events.length) return '';
    let h = '<div class="genui-card"><div class="genui-timeline">';
    p.events.forEach(e => { h += '<div class="genui-tl-item"><div class="genui-tl-time">' + escapeHtml(e.time || '') + '</div><div class="genui-tl-text">' + renderMarkdown(e.text || '') + '</div></div>'; });
    h += '</div></div>'; return h;
  }
  function renderGUIKanban(p) {
    if (!p.columns || !p.columns.length) return '';
    let h = '<div class="genui-card"><div class="genui-kanban">';
    p.columns.forEach(col => {
      h += '<div class="genui-kb-col"><div class="genui-kb-col-title">' + escapeHtml(col.title || '') + '</div>';
      (col.cards || []).forEach(card => { h += '<div class="genui-kb-card">' + escapeHtml(card.title || card || '') + '</div>'; });
      h += '</div>';
    });
    h += '</div></div>'; return h;
  }
  function renderGUICode(p) {
    return '<div class="genui-code"><div class="genui-code-header"><span>' + escapeHtml(p.language || 'text') + '</span><button class="genui-code-copy" onclick="navigator.clipboard.writeText(this.closest(\'.genui-code\').querySelector(\'code\').textContent);this.textContent=\'Copied!\'">Copy</button></div><pre><code>' + escapeHtml(p.code || '') + '</code></pre></div>';
  }
  function renderGUIFileTree(p) {
    if (!p.nodes || !p.nodes.length) return '';
    let h = '<div class="genui-card"><div class="genui-file-tree">' + renderFTNodes(p.nodes, 0) + '</div></div>';
    return h;
  }
  function renderFTNodes(nodes, depth) {
    return nodes.map(n => {
      const isDir = n.type === 'directory' || !!n.children;
      const icon = isDir ? '\uD83D\uDCC1 ' : '\uD83D\uDCC4 ';
      let h = '<div class="genui-ft-node' + (isDir ? ' genui-ft-folder' : '') + '" style="padding-left:' + (depth * 16) + 'px">' + icon + escapeHtml(n.name || n) + '</div>';
      if (isDir && n.children) h += '<div>' + renderFTNodes(n.children, depth + 1) + '</div>';
      return h;
    }).join('');
  }
  function renderGUITerminal(p) {
    const lines = (p.lines || p.output || []).map(l => {
      if (typeof l === 'string') return escapeHtml(l);
      return '<span class="prompt">' + escapeHtml(l.prompt || '$') + '</span> ' + escapeHtml(l.command || l.text || '');
    }).join('<br>');
    return '<div class="genui-card"><div class="genui-terminal">' + lines + '</div></div>';
  }
  function renderGUIImage(p) {
    return '<div class="genui-image-wrap"><img src="' + escapeHtml(p.src || p.url || '') + '" alt="' + escapeHtml(p.alt || p.caption || '') + '" loading="lazy">' + (p.caption ? '<figcaption>' + escapeHtml(p.caption) + '</figcaption>' : '') + '</div>';
  }
  function renderGUIList(p) {
    if (!p.items || !p.items.length) return '';
    let h = '<div class="genui-card"><ul class="genui-list">';
    p.items.forEach(item => {
      const text = typeof item === 'string' ? item : (item.text || item.label || '');
      const checked = item.checked || item.done;
      h += '<li><div class="checkbox' + (checked ? ' checked' : '') + '"></div>' + escapeHtml(text) + '</li>';
    });
    h += '</ul></div>'; return h;
  }
  function renderGUIApproval(p) {
    return '<div class="genui-card" style="border-color:rgba(255,170,0,0.3)"><div class="genui-card-title" style="color:var(--warning)">' + escapeHtml(p.title || 'Approval Required') + '</div><div class="genui-card-desc">' + escapeHtml(p.description || '') + '</div></div>';
  }

  // ─── UI Patch Engine ───────────────────────────────────────────────────────
  function applyUIPatch(patch) {
    try {
      const id = patch.id || ('patch_' + Date.now());
      switch (patch.type) {
        case 'css': {
          const style = document.createElement('style');
          style.id = 'mai-patch-' + id;
          style.textContent = patch.selector ? (patch.selector + ' { ' + patch.css + ' }') : patch.css;
          document.head.appendChild(style); break;
        }
        case 'theme': {
          if (patch.variables) Object.entries(patch.variables).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
          if (patch.css) { const s = document.createElement('style'); s.id = 'mai-theme-' + id; s.textContent = ':root { ' + patch.css + ' }'; document.head.appendChild(s); }
          break;
        }
        case 'layout': {
          if (patch.css) { const s = document.createElement('style'); s.id = 'mai-layout-' + id; s.textContent = patch.css; document.head.appendChild(s); }
          break;
        }
        case 'widget': {
          if (patch.html) { const d = document.createElement('div'); d.id = 'mai-widget-' + id; d.innerHTML = patch.html; document.body.appendChild(d); }
          break;
        }
      }
    } catch (err) { console.warn('[ui_patch] Failed:', err); }
  }

  // ─── HUD Metrics ──────────────────────────────────────────────────────────
  function updateMetrics(payload) {
    if (!payload) return;
    const cpu = payload.cpu || 0;
    const mem = payload.memory || 0;
    // Update HUD panel
    setMetricValue('hud-cpu', cpu.toFixed(1) + '%', 'hud-cpu-bar', cpu);
    setMetricValue('hud-mem', mem.toFixed(1) + '%', 'hud-mem-bar', mem);
    // Update dashboard panel
    setMetricValue('dash-cpu', cpu.toFixed(1) + '%', 'dash-cpu-bar', cpu);
    setMetricValue('dash-mem', mem.toFixed(1) + '%', 'dash-mem-bar', mem);
    // Sparkline data
    state.cpuHistory.push(cpu); if (state.cpuHistory.length > 30) state.cpuHistory.shift();
    state.memHistory.push(mem); if (state.memHistory.length > 30) state.memHistory.shift();
    renderSparkline('spark-cpu', state.cpuHistory, 'var(--primary)');
    renderSparkline('spark-mem', state.memHistory, 'var(--secondary)');
  }
  function setMetricValue(valId, text, barId, pct) {
    const valEl = $('#' + valId); if (valEl) valEl.textContent = text;
    const barEl = $('#' + barId);
    if (barEl) {
      barEl.style.width = pct + '%';
      barEl.className = 'metric-bar-fill' + (pct > 80 ? ' critical' : pct > 60 ? ' warn' : '');
    }
  }
  function renderSparkline(svgId, points, color) {
    const svg = $('#' + svgId); if (!svg || !points.length) return;
    const w = svg.clientWidth || 200; const h = svg.clientHeight || 28;
    const maxVal = Math.max(...points, 1); const step = w / Math.max(points.length - 1, 1);
    let pathD = ''; let fillD = 'M0,' + h + ' ';
    points.forEach((val, i) => {
      const x = i * step; const y = h - (val / maxVal) * (h - 2);
      if (i === 0) { pathD += 'M' + x + ',' + y; fillD += 'L' + x + ',' + y; }
      else {
        const px = (i - 1) * step; const py = h - (points[i - 1] / maxVal) * (h - 2);
        const cp = (px + x) / 2;
        pathD += ' C' + cp + ',' + py + ' ' + cp + ',' + y + ' ' + x + ',' + y;
        fillD += ' C' + cp + ',' + py + ' ' + cp + ',' + y + ' ' + x + ',' + y;
      }
    });
    fillD += ' L' + w + ',' + h + ' Z';
    svg.innerHTML = '<defs><linearGradient id="' + svgId + '-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + color + '" stop-opacity="0.4"/><stop offset="100%" stop-color="' + color + '" stop-opacity="0.0"/></linearGradient></defs><path d="' + fillD + '" fill="url(#' + svgId + '-g)" /><path d="' + pathD + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" />';
  }
  function updateGpuStats(p) {
    if (!p) return;
    const gpuEl = $('#hud-gpu'); if (gpuEl) gpuEl.textContent = (p.utilization || 0).toFixed(0) + '%';
    const tempEl = $('#hud-gpu-temp'); if (tempEl) tempEl.style.left = Math.min(100, (p.temperature || 0)) + '%';
    const detailEl = $('#hud-gpu-detail');
    if (detailEl) detailEl.textContent = (p.memory_used || 0) + '/' + (p.memory_total || 0) + ' MB';
  }
  function updateThreatLevel(p) {
    if (!p) return;
    const level = p.level || 'green';
    const hudEl = $('#hud-threat'); if (hudEl) hudEl.innerHTML = '<span class="display threat-text threat-' + level + '">' + level.toUpperCase() + '</span>';
    const dashEl = $('#dash-threat'); if (dashEl) dashEl.textContent = level.toUpperCase();
  }
  function updateReactorPulse(p) {
    if (!p) return;
    const powerEl = $('#reactor-power'); if (powerEl) powerEl.textContent = (p.power || 0) + '%';
    const statusEl = $('#reactor-status'); if (statusEl) statusEl.textContent = (p.status || 'idle').toUpperCase();
  }
  function updateContextMeter(p) {
    if (!p) return;
    const wrap = $('#context-meter-wrap'); if (wrap) wrap.style.display = 'flex';
    const pct = p.percent || p.occupancy || 0;
    const fill = $('#context-meter-fill'); if (fill) {
      fill.style.width = pct + '%';
      fill.style.backgroundColor = pct > 80 ? 'var(--danger)' : pct > 60 ? 'var(--warning)' : 'var(--success)';
    }
    const label = $('#context-meter-label'); if (label) label.textContent = pct.toFixed(0) + '%';
  }
  function updateRouterStatus(p) {
    if (!p) return;
    const el = $('#router-info'); if (!el) return;
    const lines = [];
    if (p.activeModel) lines.push('Model: ' + p.activeModel);
    if (p.totalSavings) lines.push('Tokens saved: ' + p.totalSavings);
    if (p.health) lines.push('Health: ' + p.health);
    el.innerHTML = lines.map(l => '<div>' + escapeHtml(l) + '</div>').join('');
  }
  function updateHealthDisplay(p) {
    if (!p) return;
    const el = $('#dash-health'); if (el) el.textContent = (p.overall || 'unknown').toUpperCase();
    const helthInd = $('#health-indicator');
    if (helthInd) {
      helthInd.style.display = 'flex';
      const dot = helthInd.querySelector('.spip');
      const val = helthInd.querySelector('.sval');
      if (dot) dot.className = 'spip ' + (p.overall === 'healthy' ? 'green' : p.overall === 'degraded' ? 'yellow' : 'red');
      if (val) val.textContent = (p.overall || 'unknown').charAt(0).toUpperCase() + (p.overall || 'unknown').slice(1);
    }
  }
  function updateTunnelStatus(p) { if (p && $('#dash-tunnel')) $('#dash-tunnel').textContent = p.status || '—'; }
  function updateAnalytics(p) { if (p && $('#dash-analytics')) $('#dash-analytics').textContent = JSON.stringify(p).slice(0, 50); }
  function updateVoiceCallUI(p) {
    if (!p) return;
    state.callActive = !!p.active;
    const statusEl = $('#call-status');
    if (statusEl) statusEl.style.display = state.callActive ? 'flex' : 'none';
    const waveform = $('#waveform-wrapper');
    if (waveform) waveform.style.display = state.callActive ? 'block' : 'none';
    const core = $('#core');
    if (core) { core.classList.toggle('call-active', state.callActive); }
    updateCoreStatus(state.callActive ? 'CALL ACTIVE' : 'ONLINE');
  }
  function updateAmbientIndicator(p) {
    const el = $('#ambient-indicator');
    if (el) el.style.display = (p && p.active) ? 'block' : 'none';
  }
  function handleInterimMessage(p) {
    if (!p) return;
    if (p.type === 'model_switch') {
      addLogEntry('Model switched: ' + (p.detail || p.message || ''), 'info');
    } else {
      const el = $('#interim-text');
      if (el) el.textContent = p.text || p.message || '';
    }
  }

  // ─── Background Activities ──────────────────────────────────────────────────
  function handleBgActivity(payload, timestamp) {
    if (!payload) return;
    const status = payload.status;
    if (status === 'started' || status === 'running') {
      state.bgActivities.push(payload);
      addLogEntry((payload.detail || 'Working on ' + payload.action + '...'), 'info');
    } else if (status === 'completed' || status === 'failed') {
      const existing = state.bgActivities.find(a => a.action === payload.action);
      if (existing) { existing.status = status; existing.result = payload.result; }
      addLogEntry((status === 'completed' ? 'Done: ' : 'Failed: ') + payload.action, status === 'completed' ? 'success' : 'error');
    }
    renderBgActivities();
  }
  function renderBgActivities() {
    const wrap = $('#bg-activities');
    if (!wrap) return;
    const active = state.bgActivities.filter(a => a.status === 'running' || a.status === 'started');
    wrap.style.display = active.length ? 'block' : 'none';
    const countEl = $('#bg-count'); if (countEl) countEl.textContent = active.length;
    const list = $('#bg-activities-list'); if (!list) return;
    list.innerHTML = active.map(a =>
      '<div class="bg-activity-item"><div class="bg-activity-icon ' + (a.status || 'running') + '">\u21BB</div><div><div class="bg-activity-name">' + escapeHtml(a.action || 'Task') + '</div>' + (a.detail ? '<div class="bg-activity-detail">' + escapeHtml(a.detail) + '</div>' : '') + '</div></div>'
    ).join('');
  }
  function handleActionProgress(p, ts) {
    if (!p) return;
    const bar = $('#action-progress-bar');
    if (bar) {
      bar.style.display = 'flex';
      bar.querySelector('.progress-text').textContent = p.detail || (p.action + ': ' + p.step);
      if (p.percent != null) bar.querySelector('.progress-fill').style.width = p.percent + '%';
    }
  }

  // ─── Approval & Promotion ──────────────────────────────────────────────────
  function handleApproval(p) {
    if (!p) return;
    const banner = $('#approval-banner');
    const detail = $('#approval-detail');
    if (banner && detail) {
      detail.textContent = p.action || p.detail || 'An action requires approval';
      banner.classList.add('visible');
    }
  }
  function handlePromotion(p) {
    if (!p) return;
    const banner = $('#promotion-banner');
    const countEl = $('#promotion-count');
    const filesEl = $('#promotion-files');
    if (!banner || !filesEl) return;
    if (countEl) countEl.textContent = (p.files ? p.files.length : 0) + ' files';
    filesEl.innerHTML = (p.files || []).map(f =>
      '<div class="promotion-file-item"><span class="file-change-' + (f.change || 'modified') + '">' + escapeHtml(f.path || f.name || '') + '</span></div>'
    ).join('');
    banner.style.display = 'flex';
  }

  // ─── Voice / TTS ───────────────────────────────────────────────────────────
  function getProfile() {
    return state.voicePersonality === 'friday'
      ? { name: 'F.R.I.D.A.Y', voiceClass: 'friday', logPrefix: 'F.R.I.D.A.Y', voice: 'Google US English', pitch: 1.1, rate: 1.05 }
      : { name: 'J.A.R.V.I.S', voiceClass: 'jarvis', logPrefix: 'J.A.R.V.I.S', voice: 'Google UK English Male', pitch: 0.9, rate: 0.95 };
  }
  function switchVoice(personality) {
    state.voicePersonality = personality;
    $$('.voice-option[data-voice]').forEach(el => el.classList.toggle('active', el.dataset.voice === personality));
    wsSend({ type: 'voice_switch', personality });
    const el = $('#voice-personality');
    if (el) { el.style.display = 'flex'; el.querySelector('.sval').textContent = personality === 'friday' ? 'F.R.I.D.A.Y' : 'J.A.R.V.I.S'; }
  }
  function switchTts(engine) {
    state.ttsEngine = engine;
    $$('.voice-option[data-tts]').forEach(el => el.classList.toggle('active', el.dataset.tts === engine));
    wsSend({ type: 'tts_switch', engine });
  }
  function handleVoiceSwitch(p, ts) {
    if (!p) return;
    state.voicePersonality = p.personality || 'jarvis';
    $$('.voice-option[data-voice]').forEach(el => el.classList.toggle('active', el.dataset.voice === state.voicePersonality));
    const el = $('#voice-personality');
    if (el) { el.style.display = 'flex'; el.querySelector('.sval').textContent = p.personality === 'friday' ? 'F.R.I.D.A.Y' : 'J.A.R.V.I.S'; }
    addChatBubble('system', 'Voice personality: ' + (p.personality || 'default'), ts);
  }
  function handleTtsEngineStatus(p) {
    if (!p) return;
    if (p.engine === 'piper' || p.engine === 'kokoro') {
      state.piperReady = p.ready;
      if (p.ready) {
        const switcher = $('#tts-switcher');
        if (switcher) switcher.style.display = 'flex';
        if (p.engine === 'kokoro') { const el = $('#tts-kokoro'); if (el) el.textContent = 'KOKORO'; }
      }
    }
    const el = $('#tts-status');
    if (el) {
      el.style.display = 'flex';
      const dot = el.querySelector('.spip');
      const val = el.querySelector('.sval');
      if (dot) dot.className = 'spip ' + (p.ready ? 'green' : 'red');
      if (val) val.textContent = (p.ready ? p.engine + ' ready' : p.engine + ' unavailable');
    }
  }
  function handleTtsEngineSwitch(p, ts) {
    if (p) { state.ttsEngine = p.engine; addChatBubble('system', 'TTS engine: ' + p.engine, ts); }
  }
  function handleNeuralAudio(p) {
    if (!p || !p.audio) return;
    try {
      const binaryStr = atob(p.audio); const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: p.format === 'wav' ? 'audio/wav' : 'audio/mp3' });
      const url = URL.createObjectURL(blob); const audio = new Audio(url);
      state.maiSpeaking = true;
      audio.onended = () => { state.maiSpeaking = false; URL.revokeObjectURL(url); }; 
      audio.onerror = () => { state.maiSpeaking = false; URL.revokeObjectURL(url); }; 
      audio.play().catch(() => { state.maiSpeaking = false; URL.revokeObjectURL(url); });
    } catch { state.maiSpeaking = false; }
  }
  function speak(text, callback) {
    const now = Date.now();
    if (text === state._lastSpeakText && (now - (state._lastSpeakTime || 0)) < SPEAK_DEDUP_WINDOW_MS) return;
    state._lastSpeakText = text; state._lastSpeakTime = now;
    const cleanText = stripMarkdown(text);
    const profile = getProfile();
    addLogEntry(profile.logPrefix + ': ' + text.slice(0, 120), 'info');
    const core = $('#core');
    if (core) { core.removeAttribute('class'); core.classList.add('speaking'); }
    updateCoreStatus('SPEAKING');
    if ('speechSynthesis' in window && state.ttsEngine === 'browser') {
    
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.voice = speechSynthesis.getVoices().find(v => v.name.includes(profile.voice === 'Google UK English Male' ? 'Male' : 'Female')) || null;
      utterance.pitch = profile.pitch; utterance.rate = profile.rate;
      utterance.onend = () => { state.speaking = false; if (core) { core.classList.remove('speaking'); } updateCoreStatus('ONLINE'); if (callback) callback(); };
      utterance.onerror = () => { state.speaking = false; if (core) core.classList.remove('speaking'); };
      speechSynthesis.speak(utterance);
    }
  }
  function stripMarkdown(text) {
    return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/__/g, '').replace(/#{1,6}\s/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/~~(.+?)~~/g, '$1').replace(/^[>\-\*]\s/gm, '').replace(/\n{2,}/g, ' ').trim();
  }

  // ─── Voice Input (STT) ──────────────────────────────────────────────────────
  function toggleVoice() {
    if (state.isRecording) { stopRecording(); } else { startRecording(); }
  }
  function startRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { console.warn('Speech recognition not supported'); return; }
    state.recognition = new SpeechRecognition();
    state.recognition.continuous = false; state.recognition.interimResults = false;
    state.recognition.lang = 'en-US';
    state.recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      const input = $('#message-input'); if (input) { input.value = text; input.dispatchEvent(new Event('input')); }
    };
    state.recognition.onend = () => { stopRecording(); };
    state.recognition.onerror = () => { stopRecording(); };
    try { state.recognition.start(); state.isRecording = true; updateVoiceBtnUI('recording'); } catch { /* ignore */ }
  }
  function stopRecording() {
    if (state.recognition) { try { state.recognition.stop(); } catch { /* ignore */ } state.recognition = null; }
    state.isRecording = false; updateVoiceBtnUI('');
  }
  function updateVoiceBtnUI(newState) {
    const btn = $('#btn-voice'); if (btn) { btn.classList.remove('recording', 'error'); if (newState) btn.classList.add(newState); }
  }

  // ─── File Manager ───────────────────────────────────────────────────────────
  function renderFileList(payload) {
    if (!payload) return;
    const files = payload.files || [];
    state.currentDir = payload.basePath || null;
    // Update breadcrumbs
    renderBreadcrumbs(state.currentDir);
    const container = $('#files-list');
    if (!container) return;
    if (files.length === 0) { container.innerHTML = '<div class="panel-empty">No files found.</div>'; return; }
    // Sort: folders first, then files
    const sorted = [...files].sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (a.type !== 'dir' && b.type === 'dir') return 1;
      return a.name.localeCompare(b.name);
    });
    container.innerHTML = sorted.map(f => {
      const ext = (f.extension || '').toLowerCase();
      const colorClass = getFileColorClass(f, ext);
      const icon = f.type === 'dir' ? '\uD83D\uDCC1' : getFileIcon(ext);
      const size = f.type === 'file' ? formatFileSize(f.size) : '';
      return '<div class="file-item ' + colorClass + '" data-path="' + escapeHtml(f.path) + '" data-type="' + f.type + '"><span>' + icon + ' ' + escapeHtml(f.name) + '</span><span style="margin-left:auto;font-size:10px;color:var(--text-3)">' + size + '</span></div>';
    }).join('');
  }
  function renderBreadcrumbs(dirPath) {
    const container = $('#file-breadcrumb'); if (!container || !dirPath) return;
    const parts = dirPath.split('/').filter(Boolean);
    let html = '<span class="breadcrumb-item active" data-path="' + escapeHtml(dirPath) + '">~</span>';
    let accumulated = '';
    parts.forEach((part, i) => {
      accumulated += '/' + part;
      const isLast = i === parts.length - 1;
      html += '<span class="breadcrumb-sep">/</span><span class="breadcrumb-item' + (isLast ? ' active' : '') + '" data-path="' + escapeHtml(accumulated) + '">' + escapeHtml(part) + '</span>';
    });
    container.innerHTML = html;
  }
  function getFileColorClass(f, ext) {
    if (f.type === 'dir') return 'file-color-folder';
    const map = { md: 'md', ts: 'ts', tsx: 'ts', js: 'js', jsx: 'js', json: 'json', py: 'py', html: 'html', css: 'css', yml: 'yml', yaml: 'yml', sh: 'sh', svg: 'svg', env: 'env', sql: 'sql' };
    return 'file-color-' + (map[ext] || 'default');
  }
  function getFileIcon(ext) {
    const map = { md: '\uD83D\uDCD6', ts: '\uD83D\uDCBB', tsx: '\uD83D\uDCBB', js: '\uD83D\uDCBB', json: '\uD83D\uDCC4', py: '\uD83D\uDC0D', html: '\uD83C\uDF10', css: '\uD83C\uDFA8', sh: '\uD83D\uDDA5\uFE0F', svg: '\uD83C\uDFA8', png: '\uD83D\uDDBC\uFE0F', jpg: '\uD83D\uDBC\uFE0F', gif: '\uD83D\uDBC\uFE0F' };
    return map[ext] || '\uD83D\uDCC4';
  }
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ─── Activity Log ─────────────────────────────────────────────────────────
  function addLogEntry(text, level) {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    state.logEntries.unshift({ text, level: level || 'info', time });
    if (state.logEntries.length > 200) state.logEntries.pop();
    renderLogEntries();
  }
  function renderLogEntries() {
    const container = $('#hud-log'); if (!container) return;
    const entries = state.logEntries.slice(0, 50);
    container.innerHTML = entries.map(e =>
      '<div class="log-entry ' + (e.level || 'info') + '"><span class="log-time">' + e.time + '</span>' + escapeHtml(e.text) + '</div>'
    ).join('');
  }

  // ─── Settings Modal ─────────────────────────────────────────────────────────
  function openSettingsModal() {
    const modal = $('#settings-modal'); if (modal) modal.style.display = 'flex';
  }
  function closeSettingsModal() {
    const modal = $('#settings-modal'); if (modal) modal.style.display = 'none';
  }
  function switchSettingsTab(tab) {
    $$('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.settings-content').forEach(c => c.style.display = c.dataset.tab === tab ? 'block' : 'none');
  }

  // ─── Onboarding ────────────────────────────────────────────────────────────
  let onboardStep = 1;
  const totalOnboardSteps = 4;
  function checkOnboarding() {
    fetch('/api/onboarding/status').then(r => r.json()).then(data => {
      if (data.isFirstRun) openOnboarding();
    }).catch(() => {});
  }
  function openOnboarding() { const m = $('#onboarding-modal'); if (m) m.style.display = 'flex'; }
  function closeOnboarding() { const m = $('#onboarding-modal'); if (m) m.style.display = 'none'; }
  function onboardNext() {
    if (onboardStep < totalOnboardSteps) {
      if (onboardStep === 1 && !$('#ob-name').value.trim()) { $('#ob-name').style.borderColor = 'var(--danger)'; return; }
      $('#onboard-step-' + onboardStep).style.display = 'none';
      onboardStep++;
      $('#onboard-step-' + onboardStep).style.display = 'block';
      $('#ob-back').style.visibility = 'visible';
      $('#onboarding-progress').style.width = (onboardStep / totalOnboardSteps * 100) + '%';
      $('#onboarding-step-indicator').textContent = onboardStep + ' / ' + totalOnboardSteps;
      if (onboardStep === totalOnboardSteps) buildOnboardSummary();
      if (onboardStep === totalOnboardSteps) { $('#ob-next').textContent = 'Finish & Save'; $('#ob-next').onclick = finishOnboarding; }
    }
  }
  function onboardBack() {
    if (onboardStep > 1) {
      $('#onboard-step-' + onboardStep).style.display = 'none';
      onboardStep--;
      $('#onboard-step-' + onboardStep).style.display = 'block';
      $('#ob-back').style.visibility = onboardStep === 1 ? 'hidden' : 'visible';
      $('#ob-next').textContent = 'Next'; $('#ob-next').onclick = onboardNext;
      $('#onboarding-progress').style.width = (onboardStep / totalOnboardSteps * 100) + '%';
      $('#onboarding-step-indicator').textContent = onboardStep + ' / ' + totalOnboardSteps;
    }
  }
  function buildOnboardSummary() {
    const name = $('#ob-name').value;
    const mode = document.querySelector('input[name="ob-mode"]:checked')?.value || 'text';
    const tts = $('#ob-tts').value;
    const stt = $('#ob-stt').value;
    const browser = document.getElementById('ob-browser')?.checked;
    const el = $('#ob-summary');
    if (el) el.innerHTML = '<div><span>Name:</span><span>' + escapeHtml(name) + '</span></div><div><span>Mode:</span><span>' + (mode === 'voice' ? 'Voice + Text' : 'Text Only') + '</span></div><div><span>TTS:</span><span>' + tts + '</span></div><div><span>STT:</span><span>' + stt + '</span></div><div><span>Browser:</span><span style="color:' + (browser ? 'var(--success)' : 'var(--danger)') + '">' + (browser ? 'Enabled' : 'Disabled') + '</span></div>';
  }
  function finishOnboarding() {
    const updates = {
      assistantName: $('#ob-name').value,
      audio: { mode: 'builtIn', tts: { enabled: true, backend: $('#ob-tts').value }, stt: { enabled: $('#ob-stt').value !== 'disabled', backend: $('#ob-stt').value } },
      browserControl: { enabled: true, autoDiscover: true }
    };
    fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) })
      .then(() => { closeOnboarding(); addLogEntry('Onboarding complete!', 'success'); })
      .catch(() => {});
  }

  // ─── Event Binding ──────────────────────────────────────────────────────────
  function bindEvents() {
    // Sidebar toggle
    const sidebarToggle = $('#sidebar-toggle');
    const sidebarClose = $('#sidebar-close');
    const sidebarOverlay = $('#sidebar-overlay');
    if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    // Panel navigation
    $$('.sidebar-item[data-panel]').forEach(btn => {
      btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
    });
    // Settings button
    $$('.sidebar-item[data-action="settings"]').forEach(btn => {
      btn.addEventListener('click', openSettingsModal);
    });
    $('#btn-settings')?.addEventListener('click', openSettingsModal);
    $('#settings-close')?.addEventListener('click', closeSettingsModal);

    // Settings tabs
    $$('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => switchSettingsTab(tab.dataset.tab));
    });

    // Settings controls
    $('#setting-theme')?.addEventListener('change', (e) => {
      state.settings.theme = e.target.value; applySettings(state.settings); saveSettings();
    });
    $('#setting-ws-url')?.addEventListener('change', (e) => {
      state.settings.wsUrl = e.target.value; saveSettings();
    });
    $('#btn-reconnect')?.addEventListener('click', () => { if (state.ws) state.ws.close(); connect(); });
    $('#btn-clear-history')?.addEventListener('click', () => {
      if (confirm('Clear all chat history?')) { state.messages = []; persistMessages(); renderMessages(); }
    });
    $('#set-tts-speed')?.addEventListener('input', function () {
      const el = $('#speed-val'); if (el) el.textContent = parseFloat(this.value).toFixed(1) + 'x';
    });
    $('#btn-restart-onboarding')?.addEventListener('click', () => {
      closeSettingsModal(); onboardStep = 1;
      for (let i = 1; i <= 4; i++) { const s = $('#onboard-step-' + i); if (s) s.style.display = i === 1 ? 'block' : 'none'; }
      $('#ob-back').style.visibility = 'hidden';
      $('#ob-next').textContent = 'Next'; $('#ob-next').onclick = onboardNext;
      $('#onboarding-progress').style.width = '25%';
      $('#onboarding-step-indicator').textContent = '1 / 4';
      openOnboarding();
    });

    // Onboarding
    $('#ob-next')?.addEventListener('click', onboardNext);
    $('#ob-back')?.addEventListener('click', onboardBack);

    // Message input
    const input = $('#message-input');
    const sendBtn = $('#btn-send');
    if (input) {
      input.addEventListener('input', () => {
        if (sendBtn) sendBtn.disabled = !input.value.trim();
        // Auto-resize
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });
    }
    if (sendBtn) sendBtn.addEventListener('click', sendMessage);

    // Voice input
    $('#btn-voice')?.addEventListener('click', toggleVoice);

    // Voice call
    $('#btn-call')?.addEventListener('click', () => {
      wsSend({ type: 'voice_call', operation: state.callActive ? 'stop' : 'start' });
    });

    // Voice switcher
    $$('.voice-option[data-voice]').forEach(el => {
      el.addEventListener('click', () => switchVoice(el.dataset.voice));
    });
    // TTS switcher
    $$('.voice-option[data-tts]').forEach(el => {
      el.addEventListener('click', () => switchTts(el.dataset.tts));
    });

    // Approval
    $('#approval-approve')?.addEventListener('click', () => {
      wsSend({ type: 'approval_response', approved: true });
      $('#approval-banner')?.classList.remove('visible');
    });
    $('#approval-deny')?.addEventListener('click', () => {
      wsSend({ type: 'approval_response', approved: false });
      $('#approval-banner')?.classList.remove('visible');
    });
    // Promotion
    $('#promotion-approve')?.addEventListener('click', () => {
      wsSend({ type: 'promotion_response', approved: true });
      $('#promotion-banner').style.display = 'none';
    });
    $('#promotion-deny')?.addEventListener('click', () => {
      wsSend({ type: 'promotion_response', approved: false });
      $('#promotion-banner').style.display = 'none';
    });

    // File attachment
    const attachBtn = $('#btn-attach');
    const fileInput = $('#file-input');
    if (attachBtn && fileInput) attachBtn.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0]; if (!file) return;
      state.pendingFile = file;
      const preview = $('#file-preview');
      const previewImage = $('#preview-image');
      const previewFilename = $('#preview-filename');
      const previewSize = $('#preview-size');
      if (preview) preview.classList.remove('hidden');
      if (previewFilename) previewFilename.textContent = file.name;
      if (previewSize) previewSize.textContent = formatFileSize(file.size);
      if (previewImage && file.type.startsWith('image/')) {
        previewImage.src = URL.createObjectURL(file);
        previewImage.classList.remove('hidden');
      }
    });
    $('#preview-remove')?.addEventListener('click', () => {
      state.pendingFile = null;
      $('#file-preview')?.classList.add('hidden');
      const previewImage = $('#preview-image');
      if (previewImage) { URL.revokeObjectURL(previewImage.src); previewImage.classList.add('hidden'); }
      if (fileInput) fileInput.value = '';
    });

    // File manager clicks
    $('#files-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('.file-item');
      if (!item) return;
      if (item.dataset.type === 'dir') {
        wsSend({ type: 'file_request', path: item.dataset.path });
      } else {
        wsSend({ type: 'file_read', path: item.dataset.path });
        switchPanel('chat');
      }
    });
    // Breadcrumb clicks
    $('#file-breadcrumb')?.addEventListener('click', (e) => {
      const item = e.target.closest('.breadcrumb-item');
      if (item && item.dataset.path) wsSend({ type: 'file_request', path: item.dataset.path });
    });
    // File search
    $('#file-search')?.addEventListener('input', (e) => {
      state.fileSearchFilter = e.target.value.toLowerCase();
      $$('.file-item').forEach(item => {
        const name = item.querySelector('span')?.textContent?.toLowerCase() || '';
        item.style.display = name.includes(state.fileSearchFilter) ? '' : 'none';
      });
    });

    // Search
    $('#btn-search')?.addEventListener('click', toggleSearch);
    $('#search-clear')?.addEventListener('click', () => {
      $('#search-input').value = ''; $('#search-results').innerHTML = '';
    });
    $('#search-input')?.addEventListener('input', (e) => doSearch(e.target.value));
    $('#search-results')?.addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (item) { const ts = parseInt(item.dataset.ts); const msg = state.messages.find(m => m.timestamp === ts); if (msg) { switchPanel('chat'); renderMessages(); setTimeout(() => { const list = $('#message-list'); const allBubbles = list?.querySelectorAll('.chat-bubble'); if (allBubbles) { const idx = state.messages.indexOf(msg); if (idx >= 0 && allBubbles[idx]) allBubbles[idx].scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 100); } }
    });

    // Command palette
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); state.cmdPaletteOpen ? closeCmdPalette() : openCmdPalette(); }
      if (e.key === 'Escape') { if (state.cmdPaletteOpen) closeCmdPalette(); else if (!$('#search-bar')?.classList.contains('hidden')) toggleSearch(); }
      // Panel shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === '1') switchPanel('chat');
        if (e.key === '2') switchPanel('hud');
        if (e.key === '3') switchPanel('dashboard');
        if (e.key === '4') switchPanel('files');
      }
    });
    $('#cmd-input')?.addEventListener('input', (e) => { renderCmdResults(e.target.value); state.cmdActiveIdx = -1; });
    $('#cmd-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); state.cmdActiveIdx = Math.min(state.cmdActiveIdx + 1, state.cmdItems.length - 1); updateCmdHighlight(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); state.cmdActiveIdx = Math.max(state.cmdActiveIdx - 1, 0); updateCmdHighlight(); }
      if (e.key === 'Enter') { e.preventDefault(); executeCmdItem(state.cmdActiveIdx); }
      if (e.key === 'Escape') { e.preventDefault(); closeCmdPalette(); }
    });
    $('.cmd-palette-backdrop')?.addEventListener('click', closeCmdPalette);
    $('#cmd-results')?.addEventListener('click', (e) => {
      const item = e.target.closest('.cmd-item');
      if (item) executeCmdItem(parseInt(item.dataset.idx));
    });

    // Close modals on backdrop click
    $('#settings-modal')?.addEventListener('click', (e) => { if (e.target === $('#settings-modal')) closeSettingsModal(); });
  }
  function updateCmdHighlight() {
    $$('.cmd-item').forEach((el, i) => el.classList.toggle('active', i === state.cmdActiveIdx));
  }

  // ─── Send Message ──────────────────────────────────────────────────────────
  function sendMessage() {
    const input = $('#message-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; input.style.height = 'auto';
    const sendBtn = $('#btn-send'); if (sendBtn) sendBtn.disabled = true;
    addChatBubble('user', text);
    wsSend({ type: 'user_input', text });
    showTyping(true);
  }

  // ─── Start ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
