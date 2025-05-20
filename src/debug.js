// Debug page script for Blog-to-Podcast extension

// DOM elements
const workerStatusElement = document.getElementById('worker-status');
const activeJobsElement = document.getElementById('active-jobs');
const queueLengthElement = document.getElementById('queue-length');
const lastActiveElement = document.getElementById('last-active');
const logContainerElement = document.getElementById('log-container');
const cacheContainerElement = document.getElementById('cache-container');

// Buttons
const refreshStatusButton = document.getElementById('refresh-status');
const pingWorkerButton = document.getElementById('ping-worker');
const refreshLogsButton = document.getElementById('refresh-logs');
const clearLogsButton = document.getElementById('clear-logs');
const refreshCacheButton = document.getElementById('refresh-cache');
const clearCacheButton = document.getElementById('clear-cache');

// Initialize debug page
document.addEventListener('DOMContentLoaded', () => {
  // Load initial data
  refreshStatus();
  refreshLogs();
  refreshCache();
  
  // Set up event listeners
  setupEventListeners();
});

// Set up event listeners
function setupEventListeners() {
  refreshStatusButton.addEventListener('click', refreshStatus);
  pingWorkerButton.addEventListener('click', pingWorker);
  refreshLogsButton.addEventListener('click', refreshLogs);
  clearLogsButton.addEventListener('click', clearLogs);
  refreshCacheButton.addEventListener('click', refreshCache);
  clearCacheButton.addEventListener('click', clearCache);
}

// Refresh service worker status
function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
      workerStatusElement.textContent = 'Inactive';
      workerStatusElement.className = 'status-value error';
      activeJobsElement.textContent = '0';
      queueLengthElement.textContent = '0';
      lastActiveElement.textContent = '-';
      return;
    }
    
    workerStatusElement.textContent = 'Active';
    workerStatusElement.className = 'status-value success';
    activeJobsElement.textContent = response.activeJobs;
    queueLengthElement.textContent = response.queueLength;
    
    if (response.activeJobs > 0 || response.queueLength > 0) {
      activeJobsElement.className = 'status-value warning';
      queueLengthElement.className = 'status-value warning';
    } else {
      activeJobsElement.className = 'status-value';
      queueLengthElement.className = 'status-value';
    }
    
    // Format last active time
    if (response.lastActiveTime) {
      const lastActive = new Date(response.lastActiveTime);
      const now = new Date();
      const diffSeconds = Math.floor((now - lastActive) / 1000);
      
      if (diffSeconds < 60) {
        lastActiveElement.textContent = `${diffSeconds}s ago`;
      } else if (diffSeconds < 3600) {
        lastActiveElement.textContent = `${Math.floor(diffSeconds / 60)}m ago`;
      } else {
        lastActiveElement.textContent = lastActive.toLocaleTimeString();
      }
    } else {
      lastActiveElement.textContent = 'Just now';
    }
  });
}

// Ping service worker to keep it alive
function pingWorker() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
      alert('Service worker is not active. Try refreshing the page.');
      return;
    }
    
    alert('Service worker pinged successfully!');
    refreshStatus();
  });
}

// Refresh logs
function refreshLogs() {
  chrome.runtime.sendMessage({ type: 'GET_LOGS' }, (response) => {
    if (chrome.runtime.lastError || !response) {
      logContainerElement.innerHTML = '<div class="log-entry"><span class="log-timestamp">Error loading logs. Service worker may be inactive.</span></div>';
      return;
    }
    
    const logs = response.logs || [];
    
    if (logs.length === 0) {
      logContainerElement.innerHTML = '<div class="log-entry"><span class="log-timestamp">No logs available.</span></div>';
      return;
    }
    
    // Sort logs by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Render logs
    logContainerElement.innerHTML = logs.map(log => {
      const timestamp = new Date(log.timestamp).toLocaleTimeString();
      const event = log.event;
      
      // Remove timestamp and event from data
      const { timestamp: _, event: __, ...data } = log;
      const dataString = Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '';
      
      return `
        <div class="log-entry">
          <span class="log-timestamp">${timestamp}</span>
          <span class="log-event">${event}</span>
          ${dataString ? `<pre class="log-data">${dataString}</pre>` : ''}
        </div>
      `;
    }).join('');
  });
}

// Clear logs
function clearLogs() {
  if (confirm('Are you sure you want to clear all logs?')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, (response) => {
      if (chrome.runtime.lastError) {
        alert('Error clearing logs. Service worker may be inactive.');
        return;
      }
      
      refreshLogs();
    });
  }
}

// Refresh cache
function refreshCache() {
  chrome.storage.local.get(null, (items) => {
    const cacheItems = [];
    let totalSize = 0;
    
    for (const key in items) {
      if (key.startsWith('article_')) {
        const item = items[key];
        const json = JSON.stringify(item);
        const size = json.length;
        totalSize += size;
        
        cacheItems.push({
          key,
          url: item.url,
          title: item.title,
          status: item.status,
          chunks: item.chunks ? item.chunks.length : 0,
          audioUrls: item.audioUrls ? item.audioUrls.filter(url => url !== null).length : 0,
          totalChunks: item.audioUrls ? item.audioUrls.length : 0,
          timestamp: item.timestamp,
          size
        });
      }
    }
    
    if (cacheItems.length === 0) {
      cacheContainerElement.innerHTML = '<div class="log-entry"><span class="log-timestamp">No cached articles found.</span></div>';
      return;
    }
    
    // Sort cache items by timestamp (newest first)
    cacheItems.sort((a, b) => b.timestamp - a.timestamp);
    
    // Render cache items
    cacheContainerElement.innerHTML = `
      <div class="cache-summary">
        <p>Total articles: ${cacheItems.length}</p>
        <p>Total size: ${Math.round(totalSize / 1024)} KB</p>
      </div>
      ${cacheItems.map(item => {
        const date = new Date(item.timestamp).toLocaleString();
        const statusClass = item.status === 'ready' ? 'success' : 
                           item.status === 'processing' ? 'warning' : 
                           item.status === 'completed_with_errors' ? 'error' : '';
        
        return `
          <div class="cache-item" data-key="${item.key}">
            <div class="cache-item-header">
              <div class="cache-item-title">${item.title}</div>
              <div class="cache-item-actions">
                <button class="secondary view-cache-item">View</button>
                <button class="danger delete-cache-item">Delete</button>
              </div>
            </div>
            <div class="cache-item-url">${item.url}</div>
            <div class="cache-item-details">
              <div>Status: <span class="${statusClass}">${item.status}</span></div>
              <div>Chunks: ${item.audioUrls}/${item.totalChunks}</div>
              <div>Size: ${Math.round(item.size / 1024)} KB</div>
              <div>Date: ${date}</div>
            </div>
          </div>
        `;
      }).join('')}
    `;
    
    // Add event listeners to cache item buttons
    document.querySelectorAll('.view-cache-item').forEach(button => {
      button.addEventListener('click', (event) => {
        const key = event.target.closest('.cache-item').dataset.key;
        viewCacheItem(key);
      });
    });
    
    document.querySelectorAll('.delete-cache-item').forEach(button => {
      button.addEventListener('click', (event) => {
        const key = event.target.closest('.cache-item').dataset.key;
        deleteCacheItem(key);
      });
    });
  });
}

// View cache item details
function viewCacheItem(key) {
  chrome.storage.local.get([key], (result) => {
    const item = result[key];
    if (!item) return;
    
    const json = JSON.stringify(item, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${key}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  });
}

// Delete cache item
function deleteCacheItem(key) {
  if (confirm('Are you sure you want to delete this cached article?')) {
    chrome.storage.local.remove([key], () => {
      refreshCache();
    });
  }
}

// Clear all cache
function clearCache() {
  if (confirm('Are you sure you want to clear all cached articles? This cannot be undone.')) {
    chrome.storage.local.get(null, (items) => {
      const keysToRemove = [];
      
      for (const key in items) {
        if (key.startsWith('article_')) {
          keysToRemove.push(key);
        }
      }
      
      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, () => {
          refreshCache();
        });
      }
    });
  }
}

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'WORKER_STATUS') {
    refreshStatus();
  }
  
  // Return true to indicate we will send a response asynchronously
  return true;
});
