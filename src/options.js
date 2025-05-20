// Options page script for Blog-to-Podcast extension

// DOM elements
const apiKeyInput = document.getElementById('api-key');
const toggleApiKeyButton = document.getElementById('toggle-api-key');
const voiceFilterInput = document.getElementById('voice-filter');
const voicesLoadingElement = document.getElementById('voices-loading');
const voicesErrorElement = document.getElementById('voices-error');
const voicesContainerElement = document.getElementById('voices-container');
const chunkSizeSelect = document.getElementById('chunk-size');
const styleSelect = document.getElementById('style');
const clearCacheButton = document.getElementById('clear-cache');
const cacheSizeElement = document.getElementById('cache-size');
const saveButton = document.getElementById('save');
const testApiButton = document.getElementById('test-api');
const statusElement = document.getElementById('status');

// ChatGPT elements
const useChatGptCheckbox = document.getElementById('use-chatgpt');
const chatGptSettingsDiv = document.getElementById('chatgpt-settings');
const chatGptApiKeyInput = document.getElementById('chatgpt-api-key');
const toggleChatGptApiKeyButton = document.getElementById('toggle-chatgpt-api-key');
const podcastStyleSelect = document.getElementById('podcast-style');

// Debug elements
const debugLevelSelect = document.getElementById('debug-level');
const viewLogsButton = document.getElementById('view-logs');
const clearLogsButton = document.getElementById('clear-logs');
const exportLogsButton = document.getElementById('export-logs');
const workerStatusElement = document.getElementById('worker-status');
const activeJobsElement = document.getElementById('active-jobs');
const queueLengthElement = document.getElementById('queue-length');
const refreshStatusButton = document.getElementById('refresh-status');

// State
let voices = [];
let selectedVoiceId = null;

// Initialize options page
document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  loadSettings();
  
  // Calculate cache size
  calculateCacheSize();
  
  // Set up event listeners
  setupEventListeners();
});

// Load settings from storage
function loadSettings() {
  chrome.storage.sync.get(['apiKey', 'voiceId', 'style', 'chunkSize', 'chatGptApiKey', 'useChatGpt', 'podcastStyle'], (result) => {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    
    if (result.voiceId) {
      selectedVoiceId = result.voiceId;
    }
    
    if (result.style) {
      styleSelect.value = result.style;
    }
    
    if (result.chunkSize) {
      chunkSizeSelect.value = result.chunkSize;
    }
    
    // Load ChatGPT settings
    if (result.useChatGpt) {
      useChatGptCheckbox.checked = true;
      chatGptSettingsDiv.style.display = 'block';
    }
    
    if (result.chatGptApiKey) {
      chatGptApiKeyInput.value = result.chatGptApiKey;
    }
    
    if (result.podcastStyle) {
      podcastStyleSelect.value = result.podcastStyle;
    }
    
    // Load voices if API key is set
    if (result.apiKey) {
      loadVoices(result.apiKey);
    }
  });
}

// Load voices from Murf API
async function loadVoices(apiKey) {
  voicesLoadingElement.classList.remove('hidden');
  voicesErrorElement.classList.add('hidden');
  voicesContainerElement.classList.add('hidden');
  
  try {
    // In milestone 3, this will be a real API call
    // For now, just simulate loading voices
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock voices data with valid Murf voice IDs
    // Based on https://murf.ai/api/docs/voices-styles/voice-library
    voices = [
      { id: 'en-US-terrell', name: 'Terrell', language: 'English (US)', styles: ['conversational', 'professional'] },
      { id: 'en-US-natalie', name: 'Natalie', language: 'English (US)', styles: ['conversational', 'casual'] },
      { id: 'en-US-marcus', name: 'Marcus', language: 'English (US)', styles: ['professional', 'excited'] },
      { id: 'en-US-sarah', name: 'Sarah', language: 'English (US)', styles: ['conversational', 'professional'] },
      { id: 'en-UK-harry', name: 'Harry', language: 'English (UK)', styles: ['professional', 'conversational'] },
      { id: 'en-UK-olivia', name: 'Olivia', language: 'English (UK)', styles: ['conversational', 'casual'] },
      { id: 'en-IN-aryan', name: 'Aryan', language: 'English (India)', styles: ['professional', 'conversational'] },
      { id: 'en-IN-diya', name: 'Diya', language: 'English (India)', styles: ['conversational', 'casual'] }
    ];
    
    // Render voices
    renderVoices(voices);
    
    voicesLoadingElement.classList.add('hidden');
    voicesContainerElement.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading voices', error);
    voicesLoadingElement.classList.add('hidden');
    voicesErrorElement.classList.remove('hidden');
  }
}

// Render voices in the UI
function renderVoices(voicesToRender) {
  voicesContainerElement.innerHTML = '';
  
  voicesToRender.forEach(voice => {
    const voiceCard = document.createElement('div');
    voiceCard.className = 'voice-card';
    if (voice.id === selectedVoiceId) {
      voiceCard.classList.add('selected');
    }
    
    const voiceName = document.createElement('div');
    voiceName.className = 'voice-name';
    voiceName.textContent = voice.name;
    
    const voiceDetails = document.createElement('div');
    voiceDetails.className = 'voice-details';
    voiceDetails.textContent = `${voice.language} • ${voice.styles.join(', ')}`;
    
    voiceCard.appendChild(voiceName);
    voiceCard.appendChild(voiceDetails);
    
    voiceCard.addEventListener('click', () => {
      // Deselect all voice cards
      document.querySelectorAll('.voice-card').forEach(card => {
        card.classList.remove('selected');
      });
      
      // Select this voice card
      voiceCard.classList.add('selected');
      selectedVoiceId = voice.id;
    });
    
    voicesContainerElement.appendChild(voiceCard);
  });
}

// Filter voices based on search input
function filterVoices(query) {
  if (!query) {
    renderVoices(voices);
    return;
  }
  
  const lowerQuery = query.toLowerCase();
  const filteredVoices = voices.filter(voice => {
    return voice.name.toLowerCase().includes(lowerQuery) ||
           voice.language.toLowerCase().includes(lowerQuery) ||
           voice.styles.some(style => style.toLowerCase().includes(lowerQuery));
  });
  
  renderVoices(filteredVoices);
}

// Calculate cache size
function calculateCacheSize() {
  chrome.storage.local.get(null, (items) => {
    let totalSize = 0;
    let articleCount = 0;
    
    for (const key in items) {
      if (key.startsWith('article_')) {
        articleCount++;
        const item = items[key];
        const json = JSON.stringify(item);
        totalSize += json.length;
      }
    }
    
    const sizeInKB = Math.round(totalSize / 1024);
    cacheSizeElement.textContent = `Cache: ${articleCount} articles, ${sizeInKB} KB`;
  });
}

// Clear cache
function clearCache() {
  chrome.storage.local.get(null, (items) => {
    const keysToRemove = [];
    
    for (const key in items) {
      if (key.startsWith('article_')) {
        keysToRemove.push(key);
      }
    }
    
    if (keysToRemove.length > 0) {
      chrome.storage.local.remove(keysToRemove, () => {
        calculateCacheSize();
        showStatus('Cache cleared successfully', 'success');
      });
    } else {
      showStatus('Cache is already empty', 'success');
    }
  });
}

// Save settings
function saveSettings() {
  const apiKey = apiKeyInput.value.trim();
  const style = styleSelect.value;
  const chunkSize = chunkSizeSelect.value;
  const useChatGpt = useChatGptCheckbox.checked;
  const chatGptApiKey = chatGptApiKeyInput.value.trim();
  const podcastStyle = podcastStyleSelect.value;
  
  if (!apiKey) {
    showStatus('Murf API key is required', 'error');
    return;
  }
  
  if (!selectedVoiceId) {
    showStatus('Please select a voice', 'error');
    return;
  }
  
  // Validate ChatGPT API key if enabled
  if (useChatGpt && !chatGptApiKey) {
    showStatus('ChatGPT API key is required when ChatGPT is enabled', 'error');
    return;
  }
  
  chrome.storage.sync.set({
    apiKey,
    voiceId: selectedVoiceId,
    style,
    chunkSize,
    useChatGpt,
    chatGptApiKey,
    podcastStyle
  }, () => {
    // Notify the service worker about settings change
    chrome.runtime.sendMessage({
      type: 'SETTINGS_UPDATED',
      settings: {
        apiKey,
        voiceId: selectedVoiceId,
        style,
        chunkSize,
        useChatGpt,
        chatGptApiKey,
        podcastStyle
      }
    }, response => {
      console.log('Settings update notification sent to service worker', response);
    });
    
    showStatus('Settings saved successfully', 'success');
  });
}

// Test API connection
async function testApiConnection() {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showStatus('API key is required', 'error');
    return;
  }
  
  showStatus('Testing API connection...', '');
  
  try {
    // In milestone 3, this will be a real API call
    // For now, just simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate success
    showStatus('API connection successful', 'success');
    
    // Load voices
    loadVoices(apiKey);
  } catch (error) {
    console.error('Error testing API connection', error);
    showStatus('API connection failed. Please check your API key and try again.', 'error');
  }
}

// Show status message
function showStatus(message, type) {
  statusElement.textContent = message;
  statusElement.className = 'status';
  
  if (type) {
    statusElement.classList.add(type);
  }
  
  statusElement.classList.remove('hidden');
  
  // Hide status after 3 seconds
  setTimeout(() => {
    statusElement.classList.add('hidden');
  }, 3000);
}

// Set up event listeners
function setupEventListeners() {
  // Toggle API key visibility
  toggleApiKeyButton.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleApiKeyButton.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleApiKeyButton.textContent = 'Show';
    }
  });
  
  // Toggle ChatGPT API key visibility
  toggleChatGptApiKeyButton.addEventListener('click', () => {
    if (chatGptApiKeyInput.type === 'password') {
      chatGptApiKeyInput.type = 'text';
      toggleChatGptApiKeyButton.textContent = 'Hide';
    } else {
      chatGptApiKeyInput.type = 'password';
      toggleChatGptApiKeyButton.textContent = 'Show';
    }
  });
  
  // Filter voices
  voiceFilterInput.addEventListener('input', filterVoices);
  
  // Save settings
  saveButton.addEventListener('click', saveSettings);
  
  // Test API connection
  testApiButton.addEventListener('click', testApiConnection);
  
  // Clear cache
  clearCacheButton.addEventListener('click', clearCache);
  
  // Toggle ChatGPT settings
  useChatGptCheckbox.addEventListener('change', () => {
    chatGptSettingsDiv.style.display = useChatGptCheckbox.checked ? 'block' : 'none';
  });
  
  // Debug level change
  debugLevelSelect.addEventListener('change', saveDebugLevel);
  
  // View logs
  viewLogsButton.addEventListener('click', viewLogs);
  
  // Clear logs
  clearLogsButton.addEventListener('click', clearLogs);
  
  // Export logs
  exportLogsButton.addEventListener('click', exportLogs);
  
  // Refresh service worker status
  refreshStatusButton.addEventListener('click', checkServiceWorkerStatus);
  
  // Initialize debug level from storage
  loadDebugLevel();
  
  // Check service worker status on load
  checkServiceWorkerStatus();
}

// Debug functions

// Load debug level from storage
function loadDebugLevel() {
  chrome.storage.sync.get(['debugLevel'], (result) => {
    if (result.debugLevel) {
      debugLevelSelect.value = result.debugLevel;
    }
  });
}

// Save debug level to storage
function saveDebugLevel() {
  const debugLevel = debugLevelSelect.value;
  chrome.storage.sync.set({ debugLevel }, () => {
    showStatus('Debug level saved', 'success');
  });
}

// View logs in a new tab
function viewLogs() {
  chrome.tabs.create({ url: chrome.runtime.getURL('debug.html') });
}

// Clear logs
function clearLogs() {
  chrome.storage.local.set({ debug_logs: [] }, () => {
    showStatus('Debug logs cleared', 'success');
  });
}

// Export logs as JSON file
function exportLogs() {
  chrome.storage.local.get(['debug_logs'], (result) => {
    const logs = result.debug_logs || [];
    
    if (logs.length === 0) {
      showStatus('No logs to export', 'error');
      return;
    }
    
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blog-to-podcast-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    
    showStatus('Logs exported successfully', 'success');
  });
}

// Check service worker status
function checkServiceWorkerStatus() {
  workerStatusElement.textContent = 'Checking...';
  activeJobsElement.textContent = '?';
  queueLengthElement.textContent = '?';
  
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
      workerStatusElement.textContent = 'Error: ' + chrome.runtime.lastError.message;
      workerStatusElement.style.color = 'red';
      return;
    }
    
    if (response) {
      workerStatusElement.textContent = 'Active';
      workerStatusElement.style.color = 'green';
      
      if (response.activeJobs !== undefined) {
        activeJobsElement.textContent = response.activeJobs;
      }
      
      if (response.queueLength !== undefined) {
        queueLengthElement.textContent = response.queueLength;
      }
    } else {
      workerStatusElement.textContent = 'Inactive';
      workerStatusElement.style.color = 'red';
    }
  });
}
