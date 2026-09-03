// M.A.I. Chat Application - Minimal & Professional
(function() {
  'use strict';

  // DOM Elements
  const messageInput = document.getElementById('message-input');
  const messageList = document.getElementById('message-list');
  const sendBtn = document.getElementById('btn-send');
  const attachBtn = document.getElementById('btn-attach');
  const fileInput = document.getElementById('file-input');
  const filePreview = document.getElementById('file-preview');
  const previewImage = document.getElementById('preview-image');
  const previewFilename = document.getElementById('preview-filename');
  const previewSize = document.getElementById('preview-size');
  const previewRemove = document.getElementById('preview-remove');
  const typingIndicator = document.getElementById('typing-indicator');
  const connectionStatus = document.getElementById('connection-status');
  const settingsBtn = document.getElementById('btn-settings');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsClose = document.getElementById('settings-close');
  const systemInfo = document.getElementById('system-info');

  let ws = null;
  let selectedFile = null;

  // Initialize
  function init() {
    loadSettings();
    connectWebSocket();
    setupEventListeners();
    updateSystemInfo();
  }

  // WebSocket Connection
  function connectWebSocket() {
    const wsUrl = localStorage.getItem('ws-url') || 'ws://localhost:8080';
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connectionStatus.querySelector('.status-text').textContent = 'Connected';
      connectionStatus.querySelector('.status-dot').style.background = 'var(--success)';
    };

    ws.onclose = () => {
      connectionStatus.querySelector('.status-text').textContent = 'Disconnected';
      connectionStatus.querySelector('.status-dot').style.background = 'var(--danger)';
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
      console.error('WebSocket error');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message' || data.content) {
          addMessage(data.content || data.text, 'assistant');
        }
      } catch (e) {
        addMessage(event.data, 'assistant');
      }
    };
  }

  // Event Listeners
  function setupEventListeners() {
    sendBtn.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    messageInput.addEventListener('input', autoResize);

    attachBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', handleFileSelect);
    
    previewRemove.addEventListener('click', clearFilePreview);

    settingsBtn.addEventListener('click', () => {
      settingsPanel.classList.remove('hidden');
    });

    settingsClose.addEventListener('click', () => {
      settingsPanel.classList.add('hidden');
    });

    document.querySelector('.settings-backdrop').addEventListener('click', () => {
      settingsPanel.classList.add('hidden');
    });

    // Settings form listeners
    setupSettingsListeners();
  }

  // Send Message
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text && !selectedFile) return;

    if (selectedFile) {
      addMessage(`📎 ${selectedFile.name}`, 'user');
      selectedFile = null;
      clearFilePreview();
    }

    addMessage(text, 'user');
    messageInput.value = '';
    autoResize();

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'message', content: text }));
    } else {
      setTimeout(() => {
        addMessage("I'm currently offline. Please check your connection.", 'assistant');
      }, 500);
    }
  }

  // Add Message to Chat
  function addMessage(content, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = role === 'user' 
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 28 28" fill="currentColor"><circle cx="14" cy="14" r="4" opacity="0.8"/></svg>';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messageList.appendChild(messageDiv);
    
    scrollToBottom();
  }

  // Auto-resize Textarea
  function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  }

  // File Handling
  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    selectedFile = file;
    previewFilename.textContent = file.name;
    previewSize.textContent = formatFileSize(file.size);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        previewImage.src = event.target.result;
        previewImage.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    } else {
      previewImage.classList.add('hidden');
    }

    filePreview.classList.remove('hidden');
  }

  function clearFilePreview() {
    selectedFile = null;
    fileInput.value = '';
    filePreview.classList.add('hidden');
    previewImage.classList.add('hidden');
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // Scroll to Bottom
  function scrollToBottom() {
    const messageArea = document.getElementById('message-area');
    messageArea.scrollTop = messageArea.scrollHeight;
  }

  // Settings Management
  function loadSettings() {
    const theme = localStorage.getItem('theme') || 'black-blue';
    const accent = localStorage.getItem('accent') || 'blue';
    
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-accent', accent);

    // Load form values
    const inputs = ['primary-provider', 'fallback-1', 'fallback-2', 'theme', 'accent-color', 
                    'user-name', 'public-name', 'preferred-address', 'safety-level', 
                    'ws-url', 'vault-path', 'skills-path', 'ollama-endpoint'];
    
    inputs.forEach(id => {
      const saved = localStorage.getItem('setting-' + id);
      const el = document.getElementById('setting-' + id);
      if (el && saved) {
        if (el.type === 'checkbox') {
          el.checked = saved === 'true';
        } else {
          el.value = saved;
        }
      }
    });
  }

  function setupSettingsListeners() {
    // Theme changes
    document.getElementById('setting-theme').addEventListener('change', (e) => {
      localStorage.setItem('setting-theme', e.target.value);
      document.documentElement.setAttribute('data-theme', e.target.value);
    });

    document.getElementById('setting-accent-color').addEventListener('change', (e) => {
      localStorage.setItem('setting-accent-color', e.target.value);
      document.documentElement.setAttribute('data-accent', e.target.value);
    });

    // Save other settings
    const saveSetting = (id) => {
      const el = document.getElementById('setting-' + id);
      if (!el) return;
      
      el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        localStorage.setItem('setting-' + id, el.type === 'checkbox' ? el.checked : el.value);
      });
    };

    ['primary-provider', 'fallback-1', 'fallback-2', 'user-name', 'public-name', 
     'preferred-address', 'safety-level', 'ws-url', 'vault-path', 'skills-path',
     'ollama-endpoint', 'ollama-cloud-key', 'openrouter-key'].forEach(saveSetting);

    ['sandbox-first', 'terminal-access', 'network-access'].forEach(saveSetting);

    // Save Configuration Button
    document.getElementById('btn-save-config').addEventListener('click', saveConfiguration);

    // Clear History
    document.getElementById('btn-clear-history').addEventListener('click', () => {
      if (confirm('Clear all chat history?')) {
        messageList.innerHTML = '';
        localStorage.removeItem('chat-history');
      }
    });

    // Reconnect
    document.getElementById('btn-reconnect').addEventListener('click', () => {
      if (ws) ws.close();
      connectWebSocket();
    });

    // Toggle password visibility
    document.querySelectorAll('.btn-toggle-visibility').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input.type === 'password') {
          input.type = 'text';
        } else {
          input.type = 'password';
        }
      });
    });
  }

  function saveConfiguration() {
    const config = {
      assistantName: 'Mai',
      model: document.getElementById('setting-primary-provider').value,
      providers: {
        primary: document.getElementById('setting-primary-provider').value,
        fallback1: document.getElementById('setting-fallback-1').value,
        fallback2: document.getElementById('setting-fallback-2').value
      },
      apiKeys: {
        ollamaCloud: document.getElementById('setting-ollama-cloud-key').value,
        openrouter: document.getElementById('setting-openrouter-key').value
      },
      ollama: {
        endpoint: document.getElementById('setting-ollama-endpoint').value
      },
      user: {
        name: document.getElementById('setting-user-name').value,
        publicName: document.getElementById('setting-public-name').value,
        preferredAddress: document.getElementById('setting-preferred-address').value
      },
      security: {
        safetyLevel: document.getElementById('setting-safety-level').value,
        sandboxFirst: document.getElementById('setting-sandbox-first').checked,
        terminalAccess: document.getElementById('setting-terminal-access').checked,
        networkAccess: document.getElementById('setting-network-access').checked
      },
      paths: {
        vault: document.getElementById('setting-vault-path').value,
        skills: document.getElementById('setting-skills-path').value
      }
    };

    // Download as file
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'harness.config.json';
    a.click();
    URL.revokeObjectURL(url);

    alert('Configuration saved! Restart M.A.I. for changes to apply.');
  }

  function updateSystemInfo() {
    const info = {
      'User': localStorage.getItem('setting-user-name') || 'Bulega Farid',
      'Theme': localStorage.getItem('setting-theme') || 'black-blue',
      'Primary Model': localStorage.getItem('setting-primary-provider') || 'ollama-cloud',
      'Connection': localStorage.getItem('setting-ws-url') || 'ws://localhost:8080'
    };

    systemInfo.innerHTML = Object.entries(info)
      .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
      .join('');
  }

  // Start application
  init();
})();
