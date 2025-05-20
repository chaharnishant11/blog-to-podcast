// Debug functions for Blog-to-Podcast extension

// Set up debug section
function setupDebugSection() {
  // Show/hide debug section
  document.getElementById('show-debug').addEventListener('click', () => {
    const debugSection = document.getElementById('debug-section');
    const debugButton = document.getElementById('show-debug');
    
    if (debugSection.style.display === 'none') {
      // Show debug section with animation
      debugSection.style.display = 'block';
      debugButton.textContent = 'Hide Debug';
      debugButton.classList.add('active');
      
      // Refresh debug info
      refreshDebugInfo();
      
      // Scroll to debug section
      setTimeout(() => {
        debugSection.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      // Hide debug section
      debugSection.style.display = 'none';
      debugButton.textContent = 'Debug Info';
      debugButton.classList.remove('active');
    }
  });
  
  // Refresh debug info
  document.getElementById('refresh-debug').addEventListener('click', () => {
    const refreshButton = document.getElementById('refresh-debug');
    
    // Show loading state
    const originalText = refreshButton.textContent;
    refreshButton.innerHTML = '<span class="spinner" style="width: 12px; height: 12px; margin-right: 6px;"></span> Refreshing...';
    refreshButton.disabled = true;
    
    // Refresh data
    refreshDebugInfo();
    
    // Reset button after a short delay
    setTimeout(() => {
      refreshButton.textContent = originalText;
      refreshButton.disabled = false;
    }, 500);
  });
  
  // Clear logs
  document.getElementById('clear-logs').addEventListener('click', () => {
    const clearButton = document.getElementById('clear-logs');
    
    // Show loading state
    clearButton.innerHTML = '<span class="spinner" style="width: 12px; height: 12px; margin-right: 6px;"></span> Clearing...';
    clearButton.disabled = true;
    
    chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, () => {
      document.getElementById('logs-container').textContent = 'Logs cleared';
      
      // Reset button after a short delay
      setTimeout(() => {
        clearButton.textContent = 'Clear Logs';
        clearButton.disabled = false;
      }, 500);
    });
  });
  
  // Open debug page
  document.getElementById('open-debug-page').addEventListener('click', () => {
    chrome.tabs.create({ url: 'debug.html' });
  });
}

// Refresh debug information
function refreshDebugInfo() {
  // Update status indicators with loading state
  const statusFields = ['worker-status', 'active-jobs', 'queue-length', 'api-key-status', 'voice-id'];
  statusFields.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.innerHTML = '<span class="loading-pulse">Loading...</span>';
    }
  });
  
  // Add loading pulse animation style if not already present
  if (!document.querySelector('style[data-loading-styles]')) {
    const style = document.createElement('style');
    style.setAttribute('data-loading-styles', 'true');
    style.textContent = `
      @keyframes loadingPulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }
      .loading-pulse {
        animation: loadingPulse 1.5s infinite;
        color: var(--text-secondary);
      }
      .status-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
      }
      .status-running {
        background-color: #e6f4ea;
        color: var(--secondary);
      }
      .status-error {
        background-color: #fdede9;
        color: var(--error);
      }
      .status-warning {
        background-color: #fef7e0;
        color: var(--warning);
      }
      .status-configured {
        background-color: #e6f4ea;
        color: var(--secondary);
      }
      .status-not-configured {
        background-color: #fdede9;
        color: var(--error);
      }
    `;
    document.head.appendChild(style);
  }
  
  // Get service worker status
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
      document.getElementById('worker-status').innerHTML = 
        `<span class="status-badge status-error">Error</span> ${chrome.runtime.lastError.message}`;
      return;
    }
    
    if (response) {
      // Update status information with visual indicators
      document.getElementById('worker-status').innerHTML = 
        `<span class="status-badge status-running">Running</span>`;
      
      // Active jobs with visual indicator
      const activeJobs = parseInt(response.activeJobs) || 0;
      document.getElementById('active-jobs').innerHTML = 
        `${activeJobs} ${activeJobs > 0 ? '<span class="status-badge status-running">Active</span>' : ''}`;
      
      // Queue length with visual indicator
      const queueLength = parseInt(response.queueLength) || 0;
      document.getElementById('queue-length').innerHTML = 
        `${queueLength} ${queueLength > 0 ? '<span class="status-badge status-warning">Pending</span>' : ''}`;
      
      // API key status with visual indicator
      const hasApiKey = response.config.hasApiKey;
      document.getElementById('api-key-status').innerHTML = 
        `<span class="status-badge ${hasApiKey ? 'status-configured' : 'status-not-configured'}">
          ${hasApiKey ? 'Configured' : 'Not configured'}
        </span>`;
      
      // Voice ID with better formatting
      const voiceId = response.config.voiceId || 'Default';
      document.getElementById('voice-id').textContent = voiceId;
      
      // Get logs
      getLogs();
    } else {
      document.getElementById('worker-status').innerHTML = 
        `<span class="status-badge status-error">Not responding</span>`;
    }
  });
}

// Get logs from service worker
function getLogs() {
  chrome.runtime.sendMessage({ type: 'GET_LOGS' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting logs:', chrome.runtime.lastError);
      return;
    }
    
    const logsContainer = document.getElementById('logs-container');
    
    if (response && response.logs && response.logs.length > 0) {
      logsContainer.innerHTML = '';
      
      // Display the most recent 20 logs
      const recentLogs = response.logs.slice(-20);
      recentLogs.forEach(log => {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        // Format timestamp
        const timestamp = new Date(log.timestamp);
        const timeStr = timestamp.toLocaleTimeString();
        
        // Create timestamp element
        const timeElement = document.createElement('span');
        timeElement.className = 'log-time';
        timeElement.textContent = timeStr;
        
        // Create event element
        const eventElement = document.createElement('span');
        eventElement.className = 'log-event';
        
        // Apply color based on event type
        if (log.event.includes('ERROR')) {
          eventElement.classList.add('log-error');
        } else if (log.event.includes('SUCCESS') || log.event.includes('COMPLETE')) {
          eventElement.classList.add('log-success');
        } else if (log.event.includes('WARN')) {
          eventElement.classList.add('log-warning');
        } else {
          eventElement.classList.add('log-info');
        }
        
        eventElement.textContent = log.event;
        
        // Create data element
        const dataElement = document.createElement('span');
        dataElement.className = 'log-data';
        
        // Format data for better readability
        let dataText = '';
        if (log.data) {
          try {
            if (typeof log.data === 'string') {
              dataText = log.data;
            } else {
              // Format JSON with indentation for better readability
              dataText = JSON.stringify(log.data, null, 2);
              // Limit length for display
              if (dataText.length > 100) {
                dataText = dataText.substring(0, 100) + '...';
              }
            }
          } catch (e) {
            dataText = String(log.data);
          }
        }
        
        dataElement.textContent = dataText;
        
        // Add elements to log entry
        logEntry.appendChild(timeElement);
        logEntry.appendChild(eventElement);
        logEntry.appendChild(dataElement);
        
        // Add click handler to show full data in a popup
        if (log.data && Object.keys(log.data).length > 0) {
          logEntry.title = 'Click to view full data';
          logEntry.style.cursor = 'pointer';
          logEntry.addEventListener('click', () => {
            alert(JSON.stringify(log.data, null, 2));
          });
        }
        
        logsContainer.appendChild(logEntry);
      });
      
      // Add CSS for log entries
      const style = document.createElement('style');
      style.textContent = `
        .log-entry {
          padding: 4px 0;
          border-bottom: 1px solid var(--border);
          font-family: monospace;
          font-size: 12px;
          display: flex;
          flex-wrap: wrap;
        }
        .log-entry:hover {
          background-color: rgba(0,0,0,0.05);
        }
        .log-time {
          color: var(--text-secondary);
          margin-right: 8px;
          flex-shrink: 0;
        }
        .log-event {
          font-weight: bold;
          margin-right: 8px;
          flex-shrink: 0;
        }
        .log-data {
          color: var(--text-secondary);
          overflow-wrap: break-word;
          flex-grow: 1;
        }
        .log-error {
          color: var(--error);
        }
        .log-success {
          color: var(--secondary);
        }
        .log-warning {
          color: var(--warning);
        }
        .log-info {
          color: var(--primary);
        }
      `;
      
      // Add style only if it doesn't exist yet
      if (!document.querySelector('style[data-log-styles]')) {
        style.setAttribute('data-log-styles', 'true');
        document.head.appendChild(style);
      }
      
      // Scroll to bottom of logs
      logsContainer.scrollTop = logsContainer.scrollHeight;
    } else {
      logsContainer.innerHTML = '<div class="log-entry"><em>No logs available</em></div>';
    }
  });
}
