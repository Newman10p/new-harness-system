/* ─── M.A.I. Settings Application ────────────────────────────────────────── */
/* Vanilla JS module for Settings UI - connects to ConfigManager & Services  */

(function() {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  const state = {
    currentSection: 'identity',
    config: null,
    providers: [],
    mcpServers: [],
    channels: [],
    secrets: [],
    memories: { total: 0, size: 0, oldest: null },
    dirty: false
  };

  // ─── DOM Helpers ──────────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── API Client ───────────────────────────────────────────────────────────
  const api = {
    baseUrl: '/api',
    
    async get(path) {
      const res = await fetch(`${this.baseUrl}${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    
    async post(path, data) {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    
    async put(path, data) {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    
    async delete(path) {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
  };

  // ─── Navigation ───────────────────────────────────────────────────────────
  function initNavigation() {
    const navItems = $$('.settings-nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const section = item.dataset.section;
        switchSection(section);
      });
    });

    $('#close-settings')?.addEventListener('click', () => {
      window.location.href = '../index.html';
    });
  }

  function switchSection(sectionId) {
    // Update nav
    $$('.settings-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.section === sectionId);
    });

    // Update content
    $$('.settings-section').forEach(section => {
      section.classList.toggle('active', section.id === `settings-${sectionId}`);
    });

    state.currentSection = sectionId;
    
    // Load section data
    loadSectionData(sectionId);
  }

  // ─── Data Loading ─────────────────────────────────────────────────────────
  async function loadSectionData(sectionId) {
    try {
      switch(sectionId) {
        case 'identity':
          await loadIdentity();
          break;
        case 'policy':
          await loadPolicy();
          break;
        case 'models':
          await loadModels();
          break;
        case 'voice':
          await loadVoice();
          break;
        case 'memory':
          await loadMemory();
          break;
        case 'mcp':
          await loadMCP();
          break;
        case 'channels':
          await loadChannels();
          break;
        case 'runtime':
          await loadRuntime();
          break;
        case 'security':
          await loadSecurity();
          break;
        case 'appearance':
          await loadAppearance();
          break;
      }
    } catch (err) {
      console.error(`Failed to load ${sectionId}:`, err);
      showToast(`Failed to load ${sectionId}: ${err.message}`, 'error');
    }
  }

  async function loadIdentity() {
    const config = await api.get('/config/identity');
    $('#ai-name').value = config.name || 'M.A.I.';
    $('#ai-role').value = config.role || '';
    $('#verbosity-level').value = config.verbosity || 'balanced';
    $('#formality-level').value = config.formality || 'professional';
    $('#tone-style').value = config.tone || 'neutral';
    $('#proactive-level').value = config.proactiveLevel || 50;
    $('#allow-interruption').checked = config.allowInterruption ?? true;
    $('#background-updates').checked = config.backgroundUpdates ?? true;
  }

  async function loadPolicy() {
    const policy = await api.get('/policy/config');
    $('#safety-level').value = policy.safetyLevel || 'standard';
    $('#risk-threshold').value = policy.riskThreshold || 30;
    
    // Load policy lists
    renderTags($('#auto-approve-tags'), policy.autoApprove || []);
    renderTags($('#require-approval-tags'), policy.requireApproval || []);
    renderTags($('#denied-actions-tags'), policy.deniedActions || []);
  }

  async function loadModels() {
    const providers = await api.get('/models/providers');
    state.providers = providers;
    renderProviders(providers);
  }

  async function loadVoice() {
    const voiceConfig = await api.get('/config/voice');
    $('#tts-engine').value = voiceConfig.engine || 'browser';
    $('#speech-rate').value = voiceConfig.rate || 1;
    $('#speech-pitch').value = voiceConfig.pitch || 1;
    $('#enable-stt').checked = voiceConfig.enableSTT ?? true;
    
    // Load available voices
    await loadVoicesForEngine(voiceConfig.engine);
    $('#voice-select').value = voiceConfig.voice || '';
  }

  async function loadMemory() {
    const memoryConfig = await api.get('/memory/config');
    $('#memory-mode').value = memoryConfig.mode || 'auto';
    $('#retention-days').value = memoryConfig.retentionDays || 90;
    $('#max-memories').value = memoryConfig.maxMemories || 10000;
    $('#auto-compact').checked = memoryConfig.autoCompact ?? true;
    $('#remember-preferences').checked = memoryConfig.rememberPreferences ?? true;
    
    // Load stats
    const stats = await api.get('/memory/stats');
    $('#total-memories').textContent = stats.total || 0;
    $('#memory-size').textContent = formatBytes(stats.size || 0);
    $('#oldest-memory').textContent = stats.oldest ? formatDate(stats.oldest) : '-';
  }

  async function loadMCP() {
    const servers = await api.get('/mcp/servers');
    state.mcpServers = servers;
    renderMCPServers(servers);
  }

  async function loadChannels() {
    const channels = await api.get('/gateway/channels');
    state.channels = channels;
    renderChannels(channels);
  }

  async function loadRuntime() {
    const runtime = await api.get('/config/runtime');
    $('#action-timeout').value = runtime.actionTimeout || 30;
    $('#max-loops').value = runtime.maxLoops || 10;
    $('#retry-count').value = runtime.retryCount || 3;
    $('#bg-concurrency').value = runtime.bgConcurrency || 5;
    $('#circuit-breaker').checked = runtime.circuitBreaker ?? true;
    $('#log-retention').value = runtime.logRetention || 7;
  }

  async function loadSecurity() {
    const secrets = await api.get('/secrets/list');
    state.secrets = secrets;
    renderSecrets(secrets);
    
    const securityConfig = await api.get('/config/security');
    $('#audit-logging').checked = securityConfig.auditLogging ?? true;
    $('#redact-logs').checked = securityConfig.redactLogs ?? true;
  }

  async function loadAppearance() {
    const appearance = await api.get('/config/appearance');
    $('#theme-mode').value = appearance.mode || 'dark';
    
    // Set aura selection
    $$('.aura-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.aura === (appearance.aura || 'cobalt'));
    });
    
    $('#reduced-motion').checked = appearance.reducedMotion ?? false;
    updateThemePreview(appearance.aura || 'cobalt', appearance.mode || 'dark');
  }

  // ─── Rendering ────────────────────────────────────────────────────────────
  function renderTags(container, tags) {
    container.innerHTML = '';
    tags.forEach(tag => {
      const tagEl = document.createElement('div');
      tagEl.className = 'tag';
      tagEl.innerHTML = `
        <span>${escapeHtml(tag)}</span>
        <button class="tag-remove" data-tag="${escapeHtml(tag)}">&times;</button>
      `;
      container.appendChild(tagEl);
    });

    // Add remove handlers
    container.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tag = e.target.dataset.tag;
        // Remove from list (will be saved on form submit)
        e.target.parentElement.remove();
      });
    });

    // Add tag input handler
    const input = container.previousElementSibling;
    if (input && input.classList.contains('tag-input')) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
          e.preventDefault();
          const tag = input.value.trim();
          const tagEl = document.createElement('div');
          tagEl.className = 'tag';
          tagEl.innerHTML = `
            <span>${escapeHtml(tag)}</span>
            <button class="tag-remove" data-tag="${escapeHtml(tag)}">&times;</button>
          `;
          container.appendChild(tagEl);
          input.value = '';
          
          // Add remove handler
          tagEl.querySelector('.tag-remove').addEventListener('click', (ev) => {
            ev.target.parentElement.remove();
          });
        }
      });
    }
  }

  function renderProviders(providers) {
    const container = $('#provider-list');
    container.innerHTML = '';
    
    providers.forEach(provider => {
      const card = document.createElement('div');
      card.className = 'provider-card';
      card.innerHTML = `
        <div class="provider-header">
          <h4>${escapeHtml(provider.name)}</h4>
          <span class="status-badge ${provider.status}">${provider.status}</span>
        </div>
        <div class="provider-details">
          <div class="detail-row">
            <span class="label">Type:</span>
            <span class="value">${escapeHtml(provider.type)}</span>
          </div>
          <div class="detail-row">
            <span class="label">Models:</span>
            <span class="value">${provider.models?.length || 0}</span>
          </div>
          <div class="detail-row">
            <span class="label">Latency:</span>
            <span class="value">${provider.latency || '-'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Status:</span>
            <span class="value">${provider.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
        <div class="provider-actions">
          <button class="btn btn-sm" data-action="edit-provider" data-id="${provider.id}">Edit</button>
          <button class="btn btn-sm" data-action="test-provider" data-id="${provider.id}">Test</button>
          <button class="btn btn-sm btn-danger" data-action="delete-provider" data-id="${provider.id}">Remove</button>
        </div>
      `;
      container.appendChild(card);
    });

    // Add provider action handlers
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleProviderAction);
    });
  }

  function renderMCPServers(servers) {
    const container = $('#mcp-server-list');
    container.innerHTML = '';
    
    servers.forEach(server => {
      const card = document.createElement('div');
      card.className = 'mcp-server-card';
      card.innerHTML = `
        <div class="server-header">
          <h4>${escapeHtml(server.name)}</h4>
          <span class="status-badge ${server.health}">${server.health}</span>
        </div>
        <div class="server-details">
          <div class="detail-row">
            <span class="label">Transport:</span>
            <span class="value">${escapeHtml(server.transport)}</span>
          </div>
          <div class="detail-row">
            <span class="label">Trust Level:</span>
            <span class="value">${escapeHtml(server.trustLevel)}</span>
          </div>
          <div class="detail-row">
            <span class="label">Tools:</span>
            <span class="value">${server.tools?.length || 0}</span>
          </div>
          <div class="detail-row">
            <span class="label">Resources:</span>
            <span class="value">${server.resources?.length || 0}</span>
          </div>
          <div class="detail-row">
            <span class="label">Last Seen:</span>
            <span class="value">${formatDate(server.lastSeen)}</span>
          </div>
        </div>
        <div class="server-actions">
          <button class="btn btn-sm" data-action="inspect-server" data-id="${server.serverId}">Inspect</button>
          <button class="btn btn-sm" data-action="perms-server" data-id="${server.serverId}">Permissions</button>
          <button class="btn btn-sm" data-action="reconnect-server" data-id="${server.serverId}">Reconnect</button>
          <button class="btn btn-sm btn-danger" data-action="disable-server" data-id="${server.serverId}">${server.enabled ? 'Disable' : 'Enable'}</button>
        </div>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleMCPAction);
    });
  }

  function renderChannels(channels) {
    const container = $('#channel-list');
    container.innerHTML = '';
    
    channels.forEach(channel => {
      const card = document.createElement('div');
      card.className = 'channel-card';
      card.innerHTML = `
        <div class="channel-header">
          <h4>${escapeHtml(channel.name)}</h4>
          <span class="status-badge ${channel.status}">${channel.status}</span>
        </div>
        <div class="channel-details">
          <div class="detail-row">
            <span class="label">Type:</span>
            <span class="value">${escapeHtml(channel.type)}</span>
          </div>
          <div class="detail-row">
            <span class="label">Policy Tier:</span>
            <span class="value">${escapeHtml(channel.policyTier)}</span>
          </div>
          <div class="detail-row">
            <span class="label">Last Activity:</span>
            <span class="value">${formatDate(channel.lastActivity)}</span>
          </div>
        </div>
        <div class="channel-actions">
          <button class="btn btn-sm" data-action="config-channel" data-id="${channel.id}">Configure</button>
          <button class="btn btn-sm" data-action="test-channel" data-id="${channel.id}">Test</button>
        </div>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleChannelAction);
    });
  }

  function renderSecrets(secrets) {
    const container = $('#secret-list');
    // Keep the header, add secret entries
    const header = container.querySelector('h4');
    container.innerHTML = '';
    container.appendChild(header);
    
    secrets.forEach(secret => {
      const entry = document.createElement('div');
      entry.className = 'secret-entry';
      entry.innerHTML = `
        <div class="secret-info">
          <span class="secret-key">${escapeHtml(secret.key)}</span>
          <span class="secret-meta">••••••••</span>
          <span class="secret-updated">Updated: ${formatDate(secret.updatedAt)}</span>
        </div>
        <div class="secret-actions">
          <button class="btn btn-sm" data-action="rotate-secret" data-key="${escapeHtml(secret.key)}">Rotate</button>
          <button class="btn btn-sm" data-action="audit-secret" data-key="${escapeHtml(secret.key)}">Audit</button>
          <button class="btn btn-sm btn-danger" data-action="revoke-secret" data-key="${escapeHtml(secret.key)}">Revoke</button>
        </div>
      `;
      container.appendChild(entry);
    });

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleSecretAction);
    });
  }

  // ─── Action Handlers ──────────────────────────────────────────────────────
  function handleProviderAction(e) {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    console.log(`Provider action: ${action} on ${id}`);
    // Implement provider actions
  }

  function handleMCPAction(e) {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    console.log(`MCP action: ${action} on ${id}`);
    // Implement MCP actions
  }

  function handleChannelAction(e) {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    console.log(`Channel action: ${action} on ${id}`);
    // Implement channel actions
  }

  function handleSecretAction(e) {
    const action = e.target.dataset.action;
    const key = e.target.dataset.key;
    console.log(`Secret action: ${action} on ${key}`);
    // Implement secret actions
  }

  async function loadVoicesForEngine(engine) {
    try {
      const voices = await api.get(`/voice/voices?engine=${engine}`);
      const select = $('#voice-select');
      select.innerHTML = '';
      voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.name;
        select.appendChild(option);
      });
    } catch (err) {
      console.error('Failed to load voices:', err);
    }
  }

  function updateThemePreview(aura, mode) {
    const preview = $('#theme-preview');
    preview.className = `theme-preview theme-${mode} aura-${aura}`;
  }

  // ─── Save Handlers ────────────────────────────────────────────────────────
  function initSaveHandlers() {
    $('#save-identity')?.addEventListener('click', saveIdentity);
    $('#save-policy')?.addEventListener('click', savePolicy);
    $('#save-models')?.addEventListener('click', saveModels);
    $('#save-voice')?.addEventListener('click', saveVoice);
    $('#save-memory')?.addEventListener('click', saveMemory);
    $('#save-mcp')?.addEventListener('click', saveMCP);
    $('#save-channels')?.addEventListener('click', saveChannels);
    $('#save-runtime')?.addEventListener('click', saveRuntime);
    $('#save-security')?.addEventListener('click', saveSecurity);
    $('#save-appearance')?.addEventListener('click', saveAppearance);
    
    $('#generate-preview')?.addEventListener('click', generateResponsePreview);
    $('#run-simulation')?.addEventListener('click', runPolicySimulation);
    $('#test-tts')?.addEventListener('click', testTTS);
    
    // Aura selection
    $$('.aura-option').forEach(opt => {
      opt.addEventListener('click', () => {
        $$('.aura-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        updateThemePreview(opt.dataset.aura, $('#theme-mode').value);
      });
    });
    
    // Theme mode change
    $('#theme-mode')?.addEventListener('change', (e) => {
      updateThemePreview($$('.aura-option.active')[0]?.dataset.aura || 'cobalt', e.target.value);
    });
  }

  async function saveIdentity() {
    const config = {
      name: $('#ai-name').value,
      role: $('#ai-role').value,
      verbosity: $('#verbosity-level').value,
      formality: $('#formality-level').value,
      tone: $('#tone-style').value,
      proactiveLevel: parseInt($('#proactive-level').value),
      allowInterruption: $('#allow-interruption').checked,
      backgroundUpdates: $('#background-updates').checked
    };
    
    await api.put('/config/identity', config);
    showToast('Identity settings saved', 'success');
  }

  async function savePolicy() {
    const autoApprove = Array.from($('#auto-approve-tags').children).map(el => el.querySelector('span').textContent);
    const requireApproval = Array.from($('#require-approval-tags').children).map(el => el.querySelector('span').textContent);
    const deniedActions = Array.from($('#denied-actions-tags').children).map(el => el.querySelector('span').textContent);
    
    const policy = {
      safetyLevel: $('#safety-level').value,
      riskThreshold: parseInt($('#risk-threshold').value),
      autoApprove,
      requireApproval,
      deniedActions
    };
    
    await api.put('/policy/config', policy);
    showToast('Policy settings saved', 'success');
  }

  async function saveModels() {
    await api.put('/models/providers', state.providers);
    showToast('Model configuration saved', 'success');
  }

  async function saveVoice() {
    const config = {
      engine: $('#tts-engine').value,
      voice: $('#voice-select').value,
      rate: parseFloat($('#speech-rate').value),
      pitch: parseFloat($('#speech-pitch').value),
      enableSTT: $('#enable-stt').checked
    };
    
    await api.put('/config/voice', config);
    showToast('Voice settings saved', 'success');
  }

  async function saveMemory() {
    const config = {
      mode: $('#memory-mode').value,
      retentionDays: parseInt($('#retention-days').value),
      maxMemories: parseInt($('#max-memories').value),
      autoCompact: $('#auto-compact').checked,
      rememberPreferences: $('#remember-preferences').checked
    };
    
    await api.put('/memory/config', config);
    showToast('Memory settings saved', 'success');
  }

  async function saveMCP() {
    await api.put('/mcp/servers', state.mcpServers);
    showToast('MCP configuration saved', 'success');
  }

  async function saveChannels() {
    await api.put('/gateway/channels', state.channels);
    showToast('Channel configuration saved', 'success');
  }

  async function saveRuntime() {
    const config = {
      actionTimeout: parseInt($('#action-timeout').value),
      maxLoops: parseInt($('#max-loops').value),
      retryCount: parseInt($('#retry-count').value),
      bgConcurrency: parseInt($('#bg-concurrency').value),
      circuitBreaker: $('#circuit-breaker').checked,
      logRetention: parseInt($('#log-retention').value)
    };
    
    await api.put('/config/runtime', config);
    showToast('Runtime settings saved', 'success');
  }

  async function saveSecurity() {
    const config = {
      auditLogging: $('#audit-logging').checked,
      redactLogs: $('#redact-logs').checked
    };
    
    await api.put('/config/security', config);
    showToast('Security settings saved', 'success');
  }

  async function saveAppearance() {
    const activeAura = $$('.aura-option.active')[0];
    const config = {
      mode: $('#theme-mode').value,
      aura: activeAura?.dataset.aura || 'cobalt',
      reducedMotion: $('#reduced-motion').checked
    };
    
    await api.put('/config/appearance', config);
    showToast('Appearance settings saved', 'success');
  }

  // ─── Preview & Simulation ─────────────────────────────────────────────────
  async function generateResponsePreview() {
    const prompt = $('#preview-prompt').value;
    const preview = $('#response-preview');
    
    preview.innerHTML = '<em>Generating preview...</em>';
    
    try {
      const identity = {
        name: $('#ai-name').value,
        verbosity: $('#verbosity-level').value,
        formality: $('#formality-level').value,
        tone: $('#tone-style').value
      };
      
      const response = await api.post('/identity/preview', { prompt, identity });
      preview.innerHTML = `<div class="preview-response">${escapeHtml(response.text)}</div>`;
    } catch (err) {
      preview.innerHTML = `<em class="error">Failed to generate preview: ${err.message}</em>`;
    }
  }

  async function runPolicySimulation() {
    const actionJson = $('#simulator-action').value;
    const result = $('#simulation-result');
    
    result.innerHTML = '<em>Running simulation...</em>';
    
    try {
      const action = JSON.parse(actionJson);
      const simulation = await api.post('/policy/simulate', { action });
      
      result.innerHTML = `
        <div class="simulation-decision ${simulation.decision.toLowerCase()}">
          <strong>Decision:</strong> ${simulation.decision}
        </div>
        <div class="simulation-risk">
          <strong>Risk Level:</strong> ${simulation.riskLevel}
        </div>
        <div class="simulation-reason">
          <strong>Reason:</strong> ${escapeHtml(simulation.reason)}
        </div>
        <div class="simulation-rules">
          <strong>Matched Rules:</strong>
          <ul>${simulation.matchedRules.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
        </div>
      `;
    } catch (err) {
      result.innerHTML = `<em class="error">Simulation failed: ${err.message}</em>`;
    }
  }

  async function testTTS() {
    const text = "This is a test of the voice synthesis system.";
    try {
      const audioUrl = await api.post('/voice/synthesize', { 
        text, 
        engine: $('#tts-engine').value,
        voice: $('#voice-select').value 
      });
      
      const audio = $('#audio-preview');
      audio.src = audioUrl.url;
      audio.play();
    } catch (err) {
      showToast(`TTS test failed: ${err.message}`, 'error');
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  function showToast(message, type = 'info') {
    // Simple toast implementation
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ─── Initialization ───────────────────────────────────────────────────────
  function init() {
    initNavigation();
    initSaveHandlers();
    loadSectionData('identity');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
