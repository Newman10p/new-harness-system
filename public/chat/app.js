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
  let activePanel = 'chat';
  let cmdPaletteOpen = false;
  let cmdActiveIdx = -1;
  let cmdItems = [];
  let dashboardState = { cpu: 0, memory: 0, threat: '—', health: '—' };

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
  const dashboardPanel = $('#dashboard-panel');
  const sidebar = $('#sidebar');
  const sidebarOverlay = $('#sidebar-overlay');
  const sidebarToggle = $('#sidebar-toggle');
  const sidebarClose = $('#sidebar-close');
  const cmdPalette = $('#cmd-palette');
  const cmdInput = $('#cmd-input');
  const cmdResults = $('#cmd-results');
  const headerSubtitle = $('#header-subtitle');

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

  // ─── Sidebar ──────────────────────────────────────────────────────────────
  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('open');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
  }
  function toggleSidebar() {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  }

  // ─── Panel Switching ─────────────────────────────────────────────────────
  function switchPanel(panel) {
    activePanel = panel;
    $$('.sidebar-item[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === panel));
    const isChat = panel === 'chat';
    const isDash = panel === 'dashboard';
    const isFiles = panel === 'files';
    const isDevices = panel === 'devices';
    messageList.closest('.message-area').classList.toggle('hidden', !isChat);
    $('.input-area').classList.toggle('hidden', !isChat);
    dashboardPanel.classList.toggle('hidden', !isDash);
    filesPanel.classList.toggle('hidden', !isFiles);
    devicesPanel.classList.toggle('hidden', !isDevices);
    if (panel !== 'settings') closeSettings();
    closeSidebar();
  }

  // ─── Command Palette ─────────────────────────────────────────────────────
  const CMD_COMMANDS = [
    { id: 'chat', label: 'Go to Chat', icon: 'chat', shortcut: '1', action: () => switchPanel('chat') },
    { id: 'dashboard', label: 'Go to Dashboard', icon: 'dashboard', shortcut: '2', action: () => switchPanel('dashboard') },
    { id: 'files', label: 'Go to Files', icon: 'files', shortcut: '3', action: () => switchPanel('files') },
    { id: 'devices', label: 'Go to Devices', icon: 'devices', shortcut: '4', action: () => switchPanel('devices') },
    { id: 'settings', label: 'Open Settings', icon: 'settings', action: () => { openSettings(); } },
    { id: 'search', label: 'Search Messages', icon: 'search', action: () => { closeCmdPalette(); toggleSearch(); } },
    { id: 'clear', label: 'Clear Chat History', icon: 'clear', action: () => { if (confirm('Clear all chat history?')) { messages = []; persistMessages(); renderMessages(); } } },
    { id: 'reconnect', label: 'Reconnect WebSocket', icon: 'reconnect', action: () => { if (ws) ws.close(); connect(); } },
    { id: 'theme', label: 'Toggle Theme', icon: 'theme', action: () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; applySettings(settings); saveSettings(); } },
  ];

  function openCmdPalette() {
    cmdPaletteOpen = true;
    cmdPalette.classList.add('open');
    cmdPalette.setAttribute('aria-hidden', 'false');
    cmdInput.value = '';
    cmdInput.focus();
    cmdActiveIdx = -1;
    renderCmdResults('');
  }
  function closeCmdPalette() {
    cmdPaletteOpen = false;
    cmdPalette.classList.remove('open');
    cmdPalette.setAttribute('aria-hidden', 'true');
    cmdItems = [];
  }
  function renderCmdResults(query) {
    const q = query.toLowerCase().trim();
    cmdItems = q ? CMD_COMMANDS.filter(c => c.label.toLowerCase().includes(q)) : CMD_COMMANDS;
    cmdActiveIdx = -1;
    if (cmdItems.length === 0) {
      cmdResults.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No commands found</div>';
    } else {
      cmdResults.innerHTML = cmdItems.map((c, i) =>
        '<div class="cmd-item" data-idx="' + i + '"><span>' + escapeHtml(c.label) + '</span>' + (c.shortcut ? '<span class="cmd-shortcut">' + c.shortcut + '</span>' : '') + '</div>'
      ).join('');
    }
  }
  function executeCmdItem(idx) {
    if (idx >= 0 && idx < cmdItems.length) {
      const cmd = cmdItems[idx];
      closeCmdPalette();
      cmd.action();
    }
  }

  // ─── WebSocket ────────────────────────────────────────────────────────────
  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    updateStatus('connecting');
    try { ws = new WebSocket(wsUrl); } catch { updateStatus('disconnected'); scheduleReconnect(); return; }
    ws.onopen = () => { updateStatus('connected'); reconnectDelay = RECONNECT_BASE_DELAY; flushOfflineQueue(); wsSend({ type: 'file_request', show_hidden: false }); };
    ws.onmessage = (event) => { try { handleIncoming(JSON.parse(event.data)); } catch {} };
    ws.onclose = () => { updateStatus('disconnected'); scheduleReconnect(); };
    ws.onerror = () => { updateStatus('disconnected'); };
  }
  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, RECONNECT_MAX_DELAY);
  }
  function wsSend(data) {
    if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(data)); return true; }
    offlineQueue.push(data); return false;
  }
  function flushOfflineQueue() { while (offlineQueue.length > 0) wsSend(offlineQueue.shift()); }
  function updateStatus(state) {
    connectionStatus.className = 'sidebar-conn ' + state;
    const labels = { connected: 'Connected', connecting: 'Connecting...', disconnected: 'Offline' };
    connectionStatus.querySelector('.conn-text').textContent = labels[state] || state;
    headerSubtitle.textContent = state === 'connected' ? 'Agentic AI' : (labels[state] || state);
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
          components: payload?.components || null,
        });
        break;
      case 'activity_log':
        addMessage({ role: 'system', text: typeof payload === 'string' ? payload : (payload?.text || payload?.description || JSON.stringify(payload)), timestamp: timestamp || Date.now() });
        break;
      case 'proactive_alert':
        addMessage({ role: 'assistant', text: typeof payload === 'string' ? payload : (payload?.text || payload?.message || JSON.stringify(payload)), timestamp: timestamp || Date.now(), actions: [{ status: 'pending', label: 'Proactive' }] });
        break;
      case 'file_list': renderFileList(payload); break;
      case 'device_list': renderDeviceList(payload); break;
      case 'system_metrics': updateStatusBar(payload); break;
      case 'threat_level': updateThreatIndicator(payload); break;
      case 'reactor_pulse': updateConnectionStatus(payload); break;
      case 'device_connected':
        addMessage({ role: 'system', text: 'Device connected: ' + payload.deviceName + ' via ' + payload.channel, timestamp: timestamp || Date.now() }); break;
      case 'device_disconnected':
        addMessage({ role: 'system', text: 'Device disconnected: ' + payload.deviceId + ' via ' + payload.channel, timestamp: timestamp || Date.now() }); break;
      case 'gateway_message':
        addMessage({ role: 'user', text: payload.text, timestamp: payload.timestamp || Date.now(), source: payload.channel + ':' + payload.source }); break;
      case 'notification_incoming':
        addMessage({ role: 'assistant', text: '[' + payload.source + '] ' + payload.title + ': ' + payload.body, timestamp: timestamp || Date.now(), actions: [{ status: payload.priority === 'urgent' ? 'pending' : 'info', label: payload.source }] }); break;
      case 'ambient_listening': updateAmbientIndicator(payload); break;
      case 'tunnel_status': updateTunnelStatus(payload); break;
      case 'analytics_snapshot': updateAnalyticsDisplay(payload); break;
      case 'voice_call_state': updateVoiceCallUI(payload); break;
      case 'health_report': updateHealthDisplay(payload); break;
      case 'user_profile_update': break;
      case 'typing': showTyping(true); break;
      case 'bg_activity':
        if (payload && (payload.status === 'started' || payload.status === 'running')) {
          maiSpeaking = true;
          addMessage({ role: 'system', text: payload.detail || 'Working on ' + payload.action + '...', timestamp: timestamp || Date.now(), badge: payload.action });
        } else if (payload && (payload.status === 'completed' || payload.status === 'failed')) {
          maiSpeaking = false;
          addMessage({ role: 'system', text: payload.status === 'completed' ? 'Done: ' + payload.action : 'Failed: ' + payload.action + (payload.result ? ' — ' + payload.result : ''), timestamp: timestamp || Date.now(), badge: payload.action });
          setTimeout(flushVoiceBuffer, 500);
        }
        break;
      case 'action_progress':
        if (payload) {
          const progressText = payload.detail || payload.action + ': ' + payload.step;
          const progressEl = $('#action-progress-bar');
          if (progressEl) {
            progressEl.style.display = 'flex';
            progressEl.querySelector('.hprogress-text').textContent = progressText;
            if (payload.percent != null) progressEl.querySelector('.hprogress-fill').style.width = payload.percent + '%';
          } else { addMessage({ role: 'system', text: progressText, timestamp: timestamp || Date.now() }); }
        }
        break;
      case 'piper_audio':
        if (payload && payload.audio) {
          try {
            const binaryStr = atob(payload.audio); const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const audioBlob = new Blob([bytes], { type: payload.format === 'wav' ? 'audio/wav' : 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob); const audio = new Audio(audioUrl);
            maiSpeaking = true;
            audio.onended = () => { maiSpeaking = false; URL.revokeObjectURL(audioUrl); setTimeout(flushVoiceBuffer, 300); };
            audio.onerror = () => { maiSpeaking = false; URL.revokeObjectURL(audioUrl); };
            audio.play().catch(() => { maiSpeaking = false; URL.revokeObjectURL(audioUrl); });
          } catch (err) { maiSpeaking = false; }
        }
        break;
      case 'voice_switch':
        if (payload) {
          const personalityEl = $('#voice-personality');
          if (personalityEl) { personalityEl.style.display = 'flex'; personalityEl.querySelector('.sval').textContent = payload.personality || 'jarvis'; }
          addMessage({ role: 'system', text: 'Voice personality switched to ' + (payload.personality || 'default'), timestamp: timestamp || Date.now() });
        }
        break;
      case 'tts_engine_status':
        if (payload) {
          const ttsEl = $('#tts-status');
          if (ttsEl) { ttsEl.style.display = 'flex'; ttsEl.className = 'sidebar-status-row'; const spip = ttsEl.querySelector('.spip'); if (spip) spip.className = 'spip ' + (payload.ready ? 'green' : 'red'); ttsEl.querySelector('.sval').textContent = (payload.ready ? payload.engine + ' ready' : payload.engine + ' unavailable'); }
        }
        break;
      case 'tts_engine_switch':
        if (payload) addMessage({ role: 'system', text: 'TTS engine switched to ' + payload.engine + (payload.piperReady ? '' : ' (Piper not available)'), timestamp: timestamp || Date.now() });
        break;
      case 'silent_text':
        if (payload && payload.text) addMessage({ role: 'system', text: payload.text, timestamp: timestamp || Date.now(), silent: true });
        break;
      default:
        if (payload && typeof payload === 'object' && payload.text) addMessage({ role: 'assistant', text: payload.text, timestamp: timestamp || Date.now() });
    }
  }
  // ─── Generative UI Engine ─────────────────────────────────────────────
  function renderComponents(components) {
    if (!components || !Array.isArray(components) || components.length === 0) return '';
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
      case 'error': return renderGUIError(p);
      case 'empty-state': return renderGUIEmpty(p);
      case 'toast': return renderGUIToast(p);
      default: return '';
    }
  }

  function renderGUICard(p) {
    let html = '<div class="genui-card">';
    if (p.image) html += '<img class="genui-card-img" src="' + escapeHtml(p.image) + '" alt="" loading="lazy">';
    if (p.title) html += '<div class="genui-card-title">' + escapeHtml(p.title) + '</div>';
    if (p.description) html += '<div class="genui-card-desc">' + renderMarkdownLite(p.description) + '</div>';
    if (p.badges && p.badges.length) {
      html += '<div class="genui-badges">' + p.badges.map(b => '<span class="genui-badge ' + (b.color || 'cyan') + '">' + escapeHtml(b.label || b) + '</span>').join('') + '</div>';
    }
    if (p.actions && p.actions.length) {
      html += '<div class="genui-card-actions">' + p.actions.map(a => {
        const cls = a.variant === 'primary' ? ' primary' : (a.variant === 'danger' ? ' danger' : '');
        const click = a.payload ? ' onclick="document.querySelector(\'.main-wrapper\').__maiAction(' + JSON.stringify(a.payload).replace(/"/g, '&quot;') + ')"' : '';
        return '<button class="genui-btn' + cls + '"' + click + '>' + escapeHtml(a.label) + '</button>';
      }).join('') + '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderGUITable(p) {
    if (!p.headers || !p.rows) return '';
    let html = '<div class="genui-card"><table class="genui-table"><thead><tr>';
    p.headers.forEach(h => { html += '<th>' + escapeHtml(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    p.rows.forEach(r => {
      html += '<tr>';
      const cells = Array.isArray(r) ? r : p.headers.map(h => r[h] || '');
      cells.forEach(c => { html += '<td>' + escapeHtml(String(c)) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderGUIChart(p) {
    if (!p.data || !p.data.length) return '';
    const maxVal = Math.max(...p.data.map(d => d.value || 0), 1);
    let html = '<div class="genui-card"><div class="genui-chart"><div class="genui-chart-bar">';
    p.data.forEach(d => {
      const pct = ((d.value || 0) / maxVal) * 100;
      html += '<div class="genui-chart-bar-item"><div class="genui-chart-bar-fill" style="height:' + pct + '%"></div><div class="genui-chart-bar-label">' + escapeHtml(d.label || '') + '</div></div>';
    });
    html += '</div></div></div>';
    return html;
  }

  function renderGUIProgress(p) {
    const pct = Math.min(100, Math.max(0, p.percent || 0));
    const statusColor = pct >= 100 ? 'var(--success)' : (p.status === 'error' ? 'var(--danger)' : 'linear-gradient(90deg,#00d4ff,#8b5cf6)');
    return '<div class="genui-card"><div class="genui-progress"><div class="genui-progress-label"><span>' + escapeHtml(p.label || 'Progress') + '</span><span>' + pct + '%</span></div><div class="genui-progress-bar"><div class="genui-progress-fill" style="width:' + pct + '%;background:' + statusColor + '"></div></div></div></div>';
  }

  function renderGUIMetric(p) {
    const trend = p.trend ? '<div class="genui-metric-trend ' + (p.trend > 0 ? 'up' : 'down') + '">' + (p.trend > 0 ? '↑' : '↓') + ' ' + Math.abs(p.trend) + '%</div>' : '';
    return '<div class="genui-metric"><div class="genui-metric-value">' + escapeHtml(String(p.value || '—')) + '</div><div class="genui-metric-label">' + escapeHtml(p.label || '') + '</div>' + trend + '</div>';
  }

  function renderGUIStatGrid(p) {
    if (!p.metrics || !p.metrics.length) return '';
    let html = '<div class="genui-stat-grid">';
    p.metrics.forEach(m => { html += renderGUIMetric(m); });
    html += '</div>';
    return html;
  }

  function renderGUITimeline(p) {
    if (!p.events || !p.events.length) return '';
    let html = '<div class="genui-card"><div class="genui-timeline">';
    p.events.forEach(e => {
      html += '<div class="genui-tl-item"><div class="genui-tl-time">' + escapeHtml(e.time || '') + '</div><div class="genui-tl-text">' + renderMarkdownLite(e.text || '') + '</div></div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderGUIKanban(p) {
    if (!p.columns || !p.columns.length) return '';
    let html = '<div class="genui-card"><div class="genui-kanban">';
    p.columns.forEach(col => {
      html += '<div class="genui-kb-col"><div class="genui-kb-col-title">' + escapeHtml(col.title || '') + '</div>';
      (col.cards || []).forEach(card => {
        html += '<div class="genui-kb-card">' + escapeHtml(card.title || card || '') + '</div>';
      });
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderGUICode(p) {
    const lang = p.language || 'text';
    const code = highlightSyntax(escapeHtml(p.code || ''));
    return '<div class="genui-code"><div class="genui-code-header"><span>' + escapeHtml(lang) + '</span><button class="genui-code-copy" onclick="navigator.clipboard.writeText(this.closest(\'.genui-code\').querySelector(\'code\').textContent);this.textContent=\'Copied!\'">Copy</button></div><pre><code>' + code + '</code></pre></div>';
  }

  function renderGUIFileTree(p) {
    if (!p.nodes || !p.nodes.length) return '';
    let html = '<div class="genui-card"><div class="genui-file-tree">' + renderFTNodes(p.nodes, 0) + '</div></div>';
    return html;
  }
  function renderFTNodes(nodes, depth) {
    return nodes.map(n => {
      const isDir = n.type === 'directory' || !!n.children;
      const cls = isDir ? 'genui-ft-node genui-ft-folder' : 'genui-ft-node';
      const icon = isDir ? '📁 ' : '📄 ';
      let h = '<div class="' + cls + '" style="padding-left:' + (depth * 16) + 'px">' + icon + escapeHtml(n.name || n) + '</div>';
      if (isDir && n.children) h += '<div class="genui-ft-children">' + renderFTNodes(n.children, depth + 1) + '</div>';
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
    let html = '<div class="genui-card"><ul class="genui-list">';
    p.items.forEach(item => {
      const text = typeof item === 'string' ? item : (item.text || item.label || '');
      const checked = item.checked || item.done;
      html += '<li class="genui-list-item"><span class="genui-list-check' + (checked ? ' checked' : '') + '">' + (checked ? '✓' : '') + '</span><span>' + renderMarkdownLite(text) + '</span></li>';
    });
    html += '</ul></div>';
    return html;
  }

  function renderGUIApproval(p) {
    return '<div class="genui-approval"><span class="genui-approval-text">' + escapeHtml(p.text || p.message || 'Approve this action?') + '</span><button class="genui-btn primary" onclick="document.querySelector(\'.main-wrapper\').__maiAction({approve:true})">Approve</button><button class="genui-btn danger" onclick="document.querySelector(\'.main-wrapper\').__maiAction({deny:true})">Deny</button></div>';
  }

  function renderGUIError(p) {
    return '<div class="genui-error"><div class="genui-error-title">' + escapeHtml(p.title || 'Error') + '</div><div class="genui-error-detail">' + escapeHtml(p.detail || p.message || '') + '</div>' + (p.retryable ? '<button class="genui-btn" style="margin-top:8px" onclick="document.querySelector(\'.main-wrapper\').__maiAction({retry:true})">Retry</button>' : '') + '</div>';
  }

  function renderGUIEmpty(p) {
    return '<div class="genui-empty"><div class="genui-empty-icon">' + (p.icon || '📭') + '</div><div class="genui-empty-text">' + escapeHtml(p.text || 'No data') + '</div>' + (p.action ? '<button class="genui-btn primary" onclick="document.querySelector(\'.main-wrapper\').__maiAction({emptyAction:true})">' + escapeHtml(p.action) + '</button>' : '') + '</div>';
  }

  function renderGUIToast(p) {
    const el = document.createElement('div');
    el.className = 'genui-toast';
    el.textContent = p.text || p.message || 'Notification';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
    return '';
  }

  // Global action handler for interactive components
  document.querySelector('.main-wrapper').__maiAction = function(payload) {
    wsSend({ type: 'component_action', payload: payload });
  };

  // Basic syntax highlighting
  function highlightSyntax(code) {
    return code
      .replace(/(\/\/.*$)/gm, '<span class="hl-comment">$1</span>')
      .replace(/(\b(?:function|const|let|var|if|else|for|while|return|class|import|export|from|async|await|try|catch|throw|new|this|typeof|instanceof)\b)/g, '<span class="hl-keyword">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="hl-string">$1</span>')
      .replace(/(\b\d+\.?\d*\b)/g, '<span class="hl-number">$1</span>')
      .replace(/(\b\w+)(?=\s*\()/g, '<span class="hl-function">$1</span>');
  }
  // ─── Message Management ──────────────────────────────────────────────────
  function addMessage(msg) {
    msg.id = generateId();
    messages.push(msg);
    if (messages.length > MAX_MESSAGES) messages = messages.slice(-MAX_MESSAGES);
    persistMessages();
    appendMessageDOM(msg);
    scrollToBottom();
  }

  function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

  function renderMarkdownLite(text) {
    let html = escapeHtml(text);
    // Code blocks with language
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function(m, lang, code) {
      return '<div class="genui-code"><div class="genui-code-header"><span>' + (lang || 'code') + '</span><button class="genui-code-copy" onclick="navigator.clipboard.writeText(this.closest(\'.genui-code\').querySelector(\'code\').textContent);this.textContent=\'Copied!\'">Copy</button></div><pre><code>' + code + '</code></pre></div>';
    });
    // Tables (markdown)
    html = html.replace(/((?:^\|.\|)[^\n]+\|\n(?:\|[-:| ]+\|\n)((?:^\|.\|)[^\n]+\|\n?)+)/gm, function(match, header, body) {
      const headers = header.split('|').map(s => s.trim()).filter(Boolean);
      const rows = body.trim().split('\n').map(r => r.split('|').map(s => s.trim()).filter(Boolean));
      let t = '<div class="genui-card" style="padding:0;overflow-x:auto"><table class="genui-table"><thead><tr>';
      headers.forEach(h => { t += '<th>' + h + '</th>'; });
      t += '</tr></thead><tbody>';
      rows.forEach(r => { t += '<tr>'; r.forEach(c => { t += '<td>' + c + '</td>'; }); t += '</tr>'; });
      return t + '</tbody></table></div>';
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function formatTime(ts) {
    const d = new Date(ts); const now = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return time;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
  }

  function createActionBadges(actions) {
    if (!actions || !actions.length) return '';
    const icons = { executed: '✓', blocked: '✗', pending: '⏳' };
    return actions.map(a => {
      const status = a.status || 'pending'; const icon = icons[status] || '⏳'; const label = a.label || status;
      return '<span class="action-badge ' + status + '">' + icon + ' ' + escapeHtml(label) + '</span>';
    }).join('');
  }

  function createMessageEl(msg) {
    const el = document.createElement('div');
    el.className = 'message ' + msg.role;
    el.dataset.id = msg.id;

    if (msg.role === 'system') {
      el.innerHTML = '<div class="system-message"><span class="system-text">' + escapeHtml(msg.text) + '</span></div>';
      return el;
    }

    const time = formatTime(msg.timestamp);
    const badges = createActionBadges(msg.actions);
    const badgeHtml = badges ? '<div class="message-badges">' + badges + '</div>' : '';
    const timeHtml = '<div class="message-time">' + time + '</div>';
    const componentsHtml = renderComponents(msg.components);
    const textHtml = msg.text ? '<div class="message-text">' + renderMarkdownLite(msg.text) + '</div>' : '';

    // Message actions (copy, speak, regenerate)
    let actionsHtml = '';
    if (msg.role === 'assistant') {
      actionsHtml = '<div class="msg-actions">' +
        '<button class="msg-action-btn" data-action="copy" data-msg-id="' + msg.id + '">📋 Copy</button>' +
        '<button class="msg-action-btn" data-action="speak" data-msg-id="' + msg.id + '">🔊 Speak</button>' +
        '<button class="msg-action-btn" data-action="regen" data-msg-id="' + msg.id + '">↻ Regenerate</button>' +
        '</div>';
    }

    el.innerHTML = '<div class="message-bubble">' + componentsHtml + textHtml + badgeHtml + actionsHtml + timeHtml + '</div>';

    if (msg.role === 'user') setupSwipe(el, msg.id);
    return el;
  }

  function appendMessageDOM(msg) { messageList.appendChild(createMessageEl(msg)); }
  function renderMessages() { messageList.innerHTML = ''; messages.forEach(appendMessageDOM); scrollToBottom(false); }
  function scrollToBottom(smooth) { scrollAnchor.scrollIntoView(smooth ? { behavior: 'smooth', block: 'end' } : { block: 'end' }); }
  function showTyping(show) { isTyping = show; typingIndicator.classList.toggle('hidden', !show); if (show) scrollToBottom(); }

  // ─── Message Actions ───────────────────────────────────────────────────
  function handleMessageAction(e) {
    const btn = e.target.closest('.msg-action-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    const msgId = btn.dataset.msgId;
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    if (action === 'copy') {
      navigator.clipboard.writeText(msg.text || '').then(() => { btn.textContent = '✓ Copied'; setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500); });
    } else if (action === 'speak') {
      const utterance = new SpeechSynthesisUtterance(msg.text);
      utterance.rate = 1; utterance.pitch = 1;
      speechSynthesis.speak(utterance);
    } else if (action === 'regen') {
      wsSend({ type: 'regenerate', messageId: msgId, text: msg.text });
    }
  }

  // ─── Swipe to Delete ───────────────────────────────────────────────────
  function setupSwipe(el, msgId) {
    let startX = 0, currentX = 0, swiping = false;
    el.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; swiping = true; el.style.transition = 'none'; }, { passive: true });
    el.addEventListener('touchmove', (e) => { if (!swiping) return; currentX = e.touches[0].clientX - startX; if (currentX > 0) currentX = 0; if (currentX < -80) currentX = -80; el.style.transform = 'translateX(' + currentX + 'px)'; }, { passive: true });
    el.addEventListener('touchend', () => { if (!swiping) return; swiping = false; el.style.transition = 'transform 200ms ease'; if (currentX < -50) { el.style.transform = 'translateX(-100%)'; el.style.opacity = '0'; setTimeout(() => { messages = messages.filter(m => m.id !== msgId); persistMessages(); el.remove(); }, 200); } else { el.style.transform = ''; } currentX = 0; }, { passive: true });
  }

  // ─── Voice Input ──────────────────────────────────────────────────────
  let maiSpeaking = false;
  let voiceBuffer = [];
  let voiceRestartTimer = null;
  let voiceWantsContinuous = false;

  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      addMessage({ role: 'system', text: 'Voice input not supported in this browser.' });
      return;
    }
    if (isRecording) { stopVoice(); return; }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let transcript = '';
      let isFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      messageInput.value = transcript;
      autoResizeInput();
      if (maiSpeaking && isFinal && transcript.trim()) {
        voiceBuffer.push(transcript.trim());
        addMessage({ role: 'system', text: 'Voice captured while busy — queued.', timestamp: Date.now() });
      }
    };

    recognition.onend = () => {
      if (maiSpeaking || voiceWantsContinuous) { scheduleVoiceRestart(); return; }
      stopVoice();
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        if (maiSpeaking || voiceWantsContinuous) { scheduleVoiceRestart(); return; }
      }
      stopVoice();
    };

    recognition.start();
    isRecording = true;
    document.body.classList.add('voice-active');
    voiceBtn.classList.add('recording');
  }

  function scheduleVoiceRestart() {
    if (voiceRestartTimer) return;
    voiceRestartTimer = setTimeout(() => {
      voiceRestartTimer = null;
      if (isRecording || maiSpeaking || voiceWantsContinuous) {
        try { if (recognition) { try { recognition.abort(); } catch {} recognition = null; } isRecording = false; startVoice(); } catch { isRecording = false; }
      }
    }, 300);
  }

  function stopVoice() {
    if (voiceRestartTimer) { clearTimeout(voiceRestartTimer); voiceRestartTimer = null; }
    if (recognition) { try { recognition.abort(); } catch {} recognition = null; }
    isRecording = false;
    document.body.classList.remove('voice-active');
    voiceBtn.classList.remove('recording');
  }

  function flushVoiceBuffer() {
    if (voiceBuffer.length === 0) return;
    const buffered = voiceBuffer.splice(0);
    buffered.forEach(text => {
      if (text.trim()) {
        wsSend({ type: 'user_input', text: text.trim() });
        addMessage({ role: 'user', text: text.trim(), timestamp: Date.now(), source: 'voice-buffered' });
      }
    });
  }

  // ─── Send Message ──────────────────────────────────────────────────────
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;
    const userMsg = {
      role: 'user',
      text,
      timestamp: Date.now(),
      attachment: pendingFile ? { name: pendingFile.name, size: pendingFile.size, type: pendingFile.type } : null,
    };
    addMessage(userMsg);
    wsSend({ type: 'user_input', text });
    messageInput.value = '';
    messageInput.style.height = 'auto';
    clearFilePreview();
    sendBtn.disabled = true;
  }

  // ─── File Attachment ──────────────────────────────────────────────────
  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    pendingFile = file;
    previewFilename.textContent = file.name;
    previewSize.textContent = formatFileSize(file.size);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => { previewImage.src = ev.target.result; previewImage.classList.remove('hidden'); };
      reader.readAsDataURL(file);
    } else { previewImage.classList.add('hidden'); }
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

  // ─── Search ───────────────────────────────────────────────────────────
  function toggleSearch() {
    const isHidden = searchBar.classList.contains('hidden');
    searchBar.classList.toggle('hidden');
    if (isHidden) { searchInput.focus(); } else { searchInput.value = ''; searchResults.innerHTML = ''; searchResults.classList.remove('active'); }
  }

  function performSearch(query) {
    if (!query.trim()) { searchResults.innerHTML = ''; searchResults.classList.remove('active'); return; }
    const q = query.toLowerCase();
    const results = messages.filter(m => m.role !== 'system' && m.text && m.text.toLowerCase().includes(q)).slice(-20).reverse();
    if (results.length === 0) {
      searchResults.innerHTML = '<div class="panel-empty" style="padding:12px">No results found</div>';
    } else {
      searchResults.innerHTML = results.map(m => {
        const highlighted = escapeHtml(m.text).replace(new RegExp(escapeRegExp(query), 'gi'), match => '<mark>' + match + '</mark>');
        return '<div class="search-result-item" data-msg-id="' + m.id + '"><div class="sr-text">' + highlighted.slice(0, 120) + '</div><div class="sr-time">' + formatTime(m.timestamp) + ' · ' + m.role + '</div></div>';
      }).join('');
    }
    searchResults.classList.add('active');
  }

  function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ─── File & Device Lists ──────────────────────────────────────────────
  function renderFileList(payload) {
    const list = $('#files-list');
    const files = payload?.files || (Array.isArray(payload) ? payload : null);
    if (!files || !Array.isArray(files) || files.length === 0) { list.innerHTML = '<div class="panel-empty">No files found.</div>'; return; }
    list.innerHTML = files.map(f => {
      const name = f.name || f.path || 'Unknown';
      const detail = f.size ? formatFileSize(f.size) : (f.type || '');
      return '<div class="panel-card" data-path="' + escapeHtml(f.path || name) + '"><div class="pc-name">' + escapeHtml(name) + '</div><div class="pc-detail">' + escapeHtml(detail) + '</div></div>';
    }).join('');
  }

  function renderDeviceList(payload) {
    const list = $('#devices-list');
    const devices = payload?.devices || (Array.isArray(payload) ? payload : null);
    if (!devices || !Array.isArray(devices) || devices.length === 0) { list.innerHTML = '<div class="panel-empty">No devices connected.</div>'; return; }
    list.innerHTML = devices.map(d => {
      const name = d.name || d.id || 'Unknown Device';
      const detail = d.type || d.status || '';
      return '<div class="panel-card"><div class="pc-name">' + escapeHtml(name) + '</div><div class="pc-detail">' + escapeHtml(detail) + '</div></div>';
    }).join('');
  }

  // ─── Settings ──────────────────────────────────────────────────────────
  function loadSettings() {
    try { const raw = localStorage.getItem(SETTINGS_KEY); if (raw) return JSON.parse(raw); } catch {}
    return { theme: 'dark', notifications: true, sound: true, wsUrl: 'ws://localhost:8080' };
  }

  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

  function applySettings(s) {
    if (s.theme === 'light') { document.body.classList.add('light'); } else { document.body.classList.remove('light'); }
    themeSelect.value = s.theme;
    wsUrlInput.value = s.wsUrl || wsUrl;
    notifToggle.checked = s.notifications !== false;
    soundToggle.checked = s.sound !== false;
    wsUrl = s.wsUrl || wsUrl;
  }

  function openSettings() { settingsPanel.classList.remove('hidden'); }
  function closeSettings() { settingsPanel.classList.add('hidden'); }

  // ─── Persistence ────────────────────────────────────────────────────────
  function persistMessages() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {
      messages = messages.slice(-Math.floor(MAX_MESSAGES / 2));
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {}
    }
  }

  function loadMessages() {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) messages = JSON.parse(raw); } catch { messages = []; }
  }

  // ─── Auto-resize Textarea ──────────────────────────────────────────────
  function autoResizeInput() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  }

  // ─── Dashboard Updates ──────────────────────────────────────────────────
  function updateStatusBar(metrics) {
    dashboardState.cpu = metrics.cpu || 0;
    dashboardState.memory = metrics.memory || 0;
    const cpuEl = $('#dash-cpu');
    const memEl = $('#dash-mem');
    const cpuBar = $('#dash-cpu-bar');
    const memBar = $('#dash-mem-bar');
    if (cpuEl) cpuEl.textContent = metrics.cpu + '%';
    if (memEl) memEl.textContent = metrics.memory + '%';
    if (cpuBar) cpuBar.style.width = metrics.cpu + '%';
    if (memBar) memBar.style.width = metrics.memory + '%';
  }

  function updateThreatIndicator(threat) {
    dashboardState.threat = threat.level || '—';
    const el = $('#dash-threat');
    if (el) { el.textContent = threat.level || '—'; el.style.color = threat.level === 'green' ? 'var(--success)' : threat.level === 'orange' ? 'var(--warning)' : 'var(--danger)'; }
  }

  function updateConnectionStatus(pulse) {
    const status = pulse.status || 'unknown';
    headerSubtitle.textContent = status === 'active' || status === 'online' ? 'Connected' : status;
  }

  function updateAmbientIndicator(ambient) {
    const el = $('#ambient-indicator');
    if (!el) return;
    el.style.display = ambient.active ? 'flex' : 'none';
    el.className = 'ambient-indicator' + (ambient.audioLevel > 20 ? ' listening' : '');
  }

  function updateTunnelStatus(tunnel) {
    const el = $('#dash-tunnel');
    if (!el) return;
    if (tunnel.active && tunnel.publicUrl) { el.textContent = tunnel.publicUrl; } else { el.textContent = '—'; }
  }

  function updateAnalyticsDisplay(stats) {
    const el = $('#dash-analytics');
    if (!el) return;
    el.textContent = stats.totalInteractions + ' interactions · ' + stats.actionsExecuted + ' actions · ' + Math.round(stats.errorRate * 100) + '% errors';
  }

  function updateVoiceCallUI(callState) {
    const el = $('#voice-call-ui');
    if (!el) return;
    if (callState.active) { el.style.display = 'flex'; el.querySelector('.call-status').textContent = callState.transcript || 'Listening...'; } else { el.style.display = 'none'; }
  }

  function updateHealthDisplay(health) {
    dashboardState.health = health.overall || '—';
    const el = $('#dash-health');
    if (el) { el.textContent = health.overall || '—'; el.style.color = health.overall === 'healthy' ? 'var(--success)' : health.overall === 'degraded' ? 'var(--warning)' : 'var(--danger)'; }
  }

  // ─── Event Binding ──────────────────────────────────────────────────────
  function bindEvents() {
    // Send
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    messageInput.addEventListener('input', () => { autoResizeInput(); sendBtn.disabled = !messageInput.value.trim(); });

    // Voice
    voiceBtn.addEventListener('click', startVoice);

    // File attach
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    previewRemove.addEventListener('click', clearFilePreview);

    // Search
    searchBtn.addEventListener('click', toggleSearch);
    searchInput.addEventListener('input', () => performSearch(searchInput.value));
    searchClear.addEventListener('click', () => { searchInput.value = ''; searchResults.innerHTML = ''; searchResults.classList.remove('active'); searchInput.focus(); });

    // Settings
    settingsBtn = $('[data-action="settings"]');
    if (settingsBtn) settingsBtn.addEventListener('click', () => { openSettings(); switchPanel('chat'); });
    settingsClose.addEventListener('click', () => { closeSettings(); switchPanel('chat'); });
    settingsPanel.querySelector('.settings-backdrop').addEventListener('click', () => { closeSettings(); switchPanel('chat'); });

    themeSelect.addEventListener('change', () => { settings.theme = themeSelect.value; applySettings(settings); saveSettings(); });
    wsUrlInput.addEventListener('change', () => { settings.wsUrl = wsUrlInput.value.trim(); saveSettings(); });
    notifToggle.addEventListener('change', () => { settings.notifications = notifToggle.checked; saveSettings(); });
    soundToggle.addEventListener('change', () => { settings.sound = soundToggle.checked; saveSettings(); });

    reconnectBtn.addEventListener('click', () => { if (ws) ws.close(); connect(); });
    clearHistoryBtn.addEventListener('click', () => { if (confirm('Clear all chat history?')) { messages = []; persistMessages(); renderMessages(); } });

    // Sidebar
    sidebarToggle.addEventListener('click', toggleSidebar);
    sidebarClose.addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);

    $$('.sidebar-item[data-panel]').forEach(btn => {
      btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
    });

    // Command palette (Ctrl+K / Cmd+K)
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        cmdPaletteOpen ? closeCmdPalette() : openCmdPalette();
      }
      if (e.key === 'Escape') {
        if (cmdPaletteOpen) closeCmdPalette();
        if (!settingsPanel.classList.contains('hidden')) { closeSettings(); switchPanel('chat'); }
        if (!searchBar.classList.contains('hidden')) toggleSearch();
      }
    });

    cmdInput.addEventListener('input', () => renderCmdResults(cmdInput.value));
    cmdInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdActiveIdx = Math.min(cmdActiveIdx + 1, cmdItems.length - 1); updateCmdActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cmdActiveIdx = Math.max(cmdActiveIdx - 1, 0); updateCmdActive(); }
      else if (e.key === 'Enter') { e.preventDefault(); executeCmdItem(cmdActiveIdx); }
      else if (e.key === 'Escape') { closeCmdPalette(); }
    });

    cmdResults.addEventListener('click', (e) => {
      const item = e.target.closest('.cmd-item');
      if (item) executeCmdItem(parseInt(item.dataset.idx));
    });

    cmdPalette.querySelector('.cmd-palette-backdrop').addEventListener('click', closeCmdPalette);

    // Message actions (copy, speak, regenerate)
    messageList.addEventListener('click', handleMessageAction);

    // File card click → request file read
    $('#files-list').addEventListener('click', (e) => {
      const card = e.target.closest('.panel-card');
      if (card && card.dataset.path) wsSend({ type: 'file_read', path: card.dataset.path });
    });

    // Search result click → scroll to message
    searchResults.addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (!item) return;
      const msgEl = messageList.querySelector('[data-id="' + item.dataset.msgId + '"]');
      if (msgEl) { msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); msgEl.style.background = 'var(--accent-soft)'; setTimeout(() => { msgEl.style.background = ''; }, 2000); }
    });
  }

  function updateCmdActive() {
    $$('.cmd-item').forEach((el, i) => el.classList.toggle('active', i === cmdActiveIdx));
  }

  // ─── Boot ─────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
