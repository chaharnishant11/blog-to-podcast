// Popup script for Blog-to-Podcast extension (New Implementation)

// DOM Elements
const notConfiguredView = document.getElementById('not-configured-view');
const noArticleView = document.getElementById('no-article-view');
const processingView = document.getElementById('processing-view');
const errorView = document.getElementById('error-view');
const playerView = document.getElementById('player-view');
const debugSection = document.getElementById('debug-section');

// Text elements
const articleTitle = document.getElementById('article-title');
const progressText = document.getElementById('progress-text');
const errorMessage = document.getElementById('error-message');
const timeDisplay = document.getElementById('time-display');
const chunkIndicator = document.getElementById('chunk-indicator');

// Buttons
const openOptionsBtn = document.getElementById('open-options-btn');
const convertSelectionBtn = document.getElementById('convert-selection-btn');
const retryBtn = document.getElementById('retry-btn');
const refreshBtn = document.getElementById('refresh-btn');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const prevChunkBtn = document.getElementById('prev-chunk-btn');
const nextChunkBtn = document.getElementById('next-chunk-btn');
const downloadBtn = document.getElementById('download-btn');
const optionsBtn = document.getElementById('options-btn');
const debugBtn = document.getElementById('debug-btn');
const refreshDebugBtn = document.getElementById('refresh-debug-btn');
const clearLogsBtn = document.getElementById('clear-logs-btn');

// Other elements
const audioElement = document.getElementById('audio-element');
const progressBar = document.getElementById('progress-bar');
const voiceSelect = document.getElementById('voice-select');
const speedSelect = document.getElementById('speed-select');
const debugInfo = document.getElementById('debug-info');

// State
let currentArticleUrl = null;
let currentArticleData = null;
let currentChunkIndex = 0;
let isConfigured = false;

// Initialize popup
// Add keyboard shortcut for refresh (F5)
document.addEventListener('keydown', (event) => {
  if (event.key === 'F5') {
    event.preventDefault(); // Prevent default page refresh
    refreshUI();
  }
});

document.addEventListener('DOMContentLoaded', initializePopup);

function initializePopup() {
  console.log('Initializing popup...');
  
  // Set up event listeners
  setupEventListeners();
  
  // Add event listener to save state when popup is about to close
  window.addEventListener('beforeunload', () => {
    console.log('Popup is closing, saving state...');
    saveState();
  });
  
  // Force save state every 5 seconds during processing
  setInterval(() => {
    if (currentArticleData && currentArticleData.status === 'processing') {
      console.log('Auto-saving state during processing...');
      saveState();
    }
  }, 5000);
  
  // Load state from storage first
  loadState();
  
  // Only check configuration if we don't have state to restore
  // This prevents overriding the restored state
  setTimeout(() => {
    if (!currentArticleData) {
      console.log('No state restored, checking configuration...');
      checkConfiguration();
    } else {
      console.log('State was restored, skipping initial configuration check');
    }
  }, 100);
  
  // Setup message listener for status updates from service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Popup received message:', message.type, message);
    
    if (message.type === 'CHUNK_READY') {
      // Check if this message is for our current article
      if (message.articleUrl === currentArticleUrl) {
        console.log('Received CHUNK_READY for current article', message);
        
        // Force refresh the article data from storage
        chrome.storage.local.get(['article_' + currentArticleUrl], (result) => {
          const articleData = result['article_' + currentArticleUrl];
          
          if (articleData) {
            console.log('Article data updated from storage after CHUNK_READY', articleData);
            currentArticleData = articleData;
            
            // Check status in both the message and the article data
            if (message.allReady === true || articleData.status === 'complete') {
              console.log('All chunks ready, showing player. Status:', articleData.status);
              showView('player');
              loadAudio(0);
            } else {
              // Still processing, update the view and progress text
              showView('processing');
              // Update progress text to show which chunk was just completed
              const chunksTotal = articleData.chunks?.length || '?';
              const chunksComplete = message.chunkIndex + 1;
              progressText.textContent = `Processing... ${chunksComplete} of ${chunksTotal} chunks complete`;
              console.log(`Updated progress: ${chunksComplete}/${chunksTotal} chunks processed`);
            }
          }
        });
      }
      
      // Acknowledge receipt
      sendResponse({ received: true });
      return true; // Keep channel open for async response
    }
  });
  
  console.log('Popup initialized');
}

// Set up all event listeners
function setupEventListeners() {
  console.log('Setting up event listeners...');
  
  // Options buttons
  openOptionsBtn.onclick = openOptions;
  optionsBtn.onclick = openOptions;
  
  // Debug buttons
  debugBtn.onclick = toggleDebugSection;
  refreshDebugBtn.onclick = refreshDebugInfo;
  clearLogsBtn.onclick = clearLogs;
  
  // Article conversion
  convertSelectionBtn.onclick = convertSelection;
  retryBtn.onclick = retryConversion;
  refreshBtn.onclick = refreshUI;
  
  // Player controls
  playBtn.onclick = playAudio;
  pauseBtn.onclick = pauseAudio;
  prevChunkBtn.onclick = playPreviousChunk;
  nextChunkBtn.onclick = playNextChunk;
  downloadBtn.onclick = downloadAudio;
  
  // Audio element events
  audioElement.addEventListener('timeupdate', updateProgress);
  audioElement.addEventListener('ended', handleAudioEnded);
  
  // Progress bar click
  document.querySelector('.progress-container').addEventListener('click', seekAudio);
  
  // Settings changes
  voiceSelect.addEventListener('change', handleVoiceChange);
  speedSelect.addEventListener('change', handleSpeedChange);
  
  console.log('Event listeners set up');
}

// Check if API keys are configured
function checkConfiguration() {
  console.log('Checking configuration...');
  
  chrome.storage.sync.get(['apiKey', 'voiceId'], (result) => {
    isConfigured = !!result.apiKey && !!result.voiceId;
    
    if (isConfigured) {
      console.log('Extension is configured');
      
      // Set voice if configured
      if (result.voiceId && voiceSelect.querySelector(`option[value="${result.voiceId}"]`)) {
        voiceSelect.value = result.voiceId;
      }
      
      // Check current tab for article
      checkCurrentTab();
    } else {
      console.log('Extension is not configured');
      showView('not-configured');
    }
  });
}

// Check current tab for article
function checkCurrentTab() {
  console.log('Checking current tab...');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      console.error('No active tab found');
      return;
    }
    
    const currentTab = tabs[0];
    const newArticleUrl = currentTab.url;
    console.log('Current tab URL:', newArticleUrl);
    
    // If we're already processing this article, don't reset the state
    if (currentArticleUrl === newArticleUrl && 
        currentArticleData && 
        currentArticleData.status === 'processing') {
      console.log('Already processing this article, preserving current state');
      return;
    }
    
    // Update the current article URL
    currentArticleUrl = newArticleUrl;
    
    // Check if we have this article in storage
    chrome.storage.local.get(['article_' + currentArticleUrl], (result) => {
      const articleData = result['article_' + currentArticleUrl];
      
      if (articleData) {
        console.log('Found article data in storage:', articleData.title);
        // Article exists in storage
        currentArticleData = articleData;
        articleTitle.textContent = articleData.title || 'Untitled Article';
        
        // Save state after loading article data
        saveState();
        
        if (articleData.status === 'processing') {
          // Article is still processing
          showView('processing');
          updateProcessingProgress();
        } else if (articleData.status === 'error') {
          // Article processing failed
          showView('error');
          errorMessage.textContent = articleData.error || 'An unknown error occurred';
        } else if (articleData.status === 'complete') {
          // Article is ready to play
          showView('player');
          loadAudio(0);
        }
      } else {
        // No article data found
        console.log('No article data found for current URL');
        showView('no-article');
      }
    });
  });
}

// Show a specific view and hide others
function showView(viewName) {
  console.log('Showing view:', viewName);
  
  // Hide all views
  notConfiguredView.classList.add('hidden');
  noArticleView.classList.add('hidden');
  processingView.classList.add('hidden');
  errorView.classList.add('hidden');
  playerView.classList.add('hidden');
  
  // Show the requested view
  switch (viewName) {
    case 'not-configured':
      notConfiguredView.classList.remove('hidden');
      break;
    case 'no-article':
      noArticleView.classList.remove('hidden');
      break;
    case 'processing':
      processingView.classList.remove('hidden');
      break;
    case 'error':
      errorView.classList.remove('hidden');
      break;
    case 'player':
      playerView.classList.remove('hidden');
      break;
    default:
      console.error('Unknown view:', viewName);
      noArticleView.classList.remove('hidden');
  }
}

// Load audio for a specific chunk
function loadAudio(chunkIndex) {
  console.log('Loading audio for chunk:', chunkIndex);
  
  if (!currentArticleData || !currentArticleData.audioUrls || !currentArticleData.audioUrls[chunkIndex]) {
    console.error('No audio URL found for chunk:', chunkIndex);
    return;
  }
  
  // Update current chunk index
  currentChunkIndex = chunkIndex;
  
  // Update chunk indicator
  chunkIndicator.textContent = `Chunk ${chunkIndex + 1} of ${currentArticleData.audioUrls.length}`;
  
  // Enable/disable prev/next buttons
  prevChunkBtn.disabled = chunkIndex === 0;
  nextChunkBtn.disabled = chunkIndex >= currentArticleData.audioUrls.length - 1;
  
  // Get audio URL
  const audioUrl = currentArticleData.audioUrls[chunkIndex];
  
  // Load audio
  console.log('Loading audio from URL:', audioUrl);
  audioElement.src = audioUrl;
  audioElement.load();
  
  // Add error handling for audio loading
  audioElement.onerror = (e) => {
    console.error('Error loading audio:', e);
    showStatus('Error loading audio. Please try again.');
  };
  
  // Add debug info for audio loading
  audioElement.onloadeddata = () => {
    console.log('Audio loaded successfully', {
      duration: audioElement.duration,
      readyState: audioElement.readyState
    });
  };
  
  // Reset playback rate
  audioElement.playbackRate = parseFloat(speedSelect.value);
  
  // Reset progress bar
  progressBar.style.width = '0%';
  updateTimeDisplay(0);
  
  // Show play button
  playBtn.classList.remove('hidden');
  pauseBtn.classList.add('hidden');
  
  // Save state after changing chunk
  saveState();
}

// Update time display
function updateTimeDisplay(currentTime) {
  const duration = audioElement.duration || 0;
  timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
}

// Format time as MM:SS
function formatTime(seconds) {
  seconds = Math.floor(seconds);
  const minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Update progress bar
function updateProgress() {
  const currentTime = audioElement.currentTime;
  const duration = audioElement.duration || 1;
  const progress = (currentTime / duration) * 100;
  
  progressBar.style.width = `${progress}%`;
  updateTimeDisplay(currentTime);
}

// Handle audio ended
function handleAudioEnded() {
  console.log('Audio ended');
  
  // Check if there are more chunks
  if (currentArticleData && currentChunkIndex < currentArticleData.audioUrls.length - 1) {
    // Load next chunk
    loadAudio(currentChunkIndex + 1);
    // Auto-play next chunk
    playAudio();
  } else {
    // End of article
    playBtn.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
  }
}

// Seek audio to position
function seekAudio(event) {
  if (!audioElement.duration) return;
  
  const rect = event.currentTarget.getBoundingClientRect();
  const clickPosition = (event.clientX - rect.left) / rect.width;
  const newTime = clickPosition * audioElement.duration;
  
  audioElement.currentTime = newTime;
}

// Play audio
function playAudio() {
  console.log('Playing audio');
  audioElement.play();
  playBtn.classList.add('hidden');
  pauseBtn.classList.remove('hidden');
}

// Pause audio
function pauseAudio() {
  console.log('Pausing audio');
  audioElement.pause();
  pauseBtn.classList.add('hidden');
  playBtn.classList.remove('hidden');
}

// Play previous chunk
function playPreviousChunk() {
  if (currentChunkIndex > 0) {
    loadAudio(currentChunkIndex - 1);
  }
}

// Play next chunk
function playNextChunk() {
  if (currentArticleData && currentChunkIndex < currentArticleData.audioUrls.length - 1) {
    loadAudio(currentChunkIndex + 1);
  }
}

// Download audio
function downloadAudio() {
  if (!currentArticleData || !currentArticleData.audioUrls || !currentArticleData.audioUrls[currentChunkIndex]) {
    console.error('No audio URL found for download');
    return;
  }
  
  const audioUrl = currentArticleData.audioUrls[currentChunkIndex];
  const title = currentArticleData.title || 'podcast';
  const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_part${currentChunkIndex + 1}.mp3`;
  
  // Show downloading state
  downloadBtn.innerHTML = '<span class="spinner" style="width: 12px; height: 12px; margin-right: 6px;"></span> Downloading...';
  downloadBtn.disabled = true;
  
  // Create a temporary link and trigger download
  const a = document.createElement('a');
  a.href = audioUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  // Reset button after a short delay
  setTimeout(() => {
    downloadBtn.innerHTML = '⬇️ Download';
    downloadBtn.disabled = false;
  }, 1000);
}

// Convert selection
function convertSelection() {
  console.log('Converting selection');
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    
    chrome.tabs.sendMessage(tabs[0].id, { type: 'CONVERT_ARTICLE' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        showView('error');
        errorMessage.textContent = 'Could not communicate with the page. Please refresh and try again.';
      } else {
        showView('processing');
        progressText.textContent = 'Processing...';
      }
    });
  });
}

// Retry conversion
function retryConversion() {
  console.log('Retrying conversion for URL:', currentArticleUrl);
  
  // Add visual feedback that retry is in progress
  retryBtn.innerHTML = '<span class="spinner" style="width: 12px; height: 12px; margin-right: 6px;"></span> Retrying...';
  retryBtn.disabled = true;
  
  if (!currentArticleUrl) {
    console.error('No article URL to retry');
    showStatus('Error: No article URL to retry');
    
    // Reset retry button after delay
    setTimeout(() => {
      retryBtn.textContent = 'Try Again';
      retryBtn.disabled = false;
    }, 1000);
    return;
  }
  
  // First delete the current article data from storage
  chrome.storage.local.remove(['article_' + currentArticleUrl], () => {
    console.log('Removed article data from storage to enable clean retry');
    
    // Also clear from memory
    currentArticleData = null;
    
    // Switch to processing view
    showView('processing');
    progressText.textContent = 'Retrying article processing...';
    
    // Request fresh processing of the article
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        console.error('No active tab found for retry');
        showView('error');
        errorMessage.textContent = 'Could not find the current tab for retry.';
        return;
      }
      
      // Send message to content script to restart article extraction
      chrome.tabs.sendMessage(tabs[0].id, { type: 'CONVERT_ARTICLE', retry: true }, (response) => {
        // Reset retry button
        retryBtn.textContent = 'Try Again';
        retryBtn.disabled = false;
        
        if (chrome.runtime.lastError || !response) {
          console.error('Error during retry:', chrome.runtime.lastError);
          showView('error');
          errorMessage.textContent = 'Could not communicate with the page. Please refresh and try again.';
        } else {
          console.log('Article retry initiated successfully');
          // updateProcessingProgress will handle polling for updates
          updateProcessingProgress();
        }
      });
    });
  });
}

// Handle voice change
function handleVoiceChange() {
  console.log('Voice changed to:', voiceSelect.value);
  
  // Save voice preference
  chrome.storage.sync.set({ voiceId: voiceSelect.value }, () => {
    console.log('Voice preference saved');
  });
}

// Handle speed change
function handleSpeedChange() {
  console.log('Speed changed to:', speedSelect.value);
  
  // Update playback rate
  audioElement.playbackRate = parseFloat(speedSelect.value);
}

// Open options page
function openOptions() {
  console.log('Opening options page');
  chrome.runtime.openOptionsPage();
}

// Toggle debug section
function toggleDebugSection() {
  console.log('Toggling debug section');
  
  if (debugSection.classList.contains('hidden')) {
    debugSection.classList.remove('hidden');
    debugBtn.textContent = 'Hide Debug';
    refreshDebugInfo();
  } else {
    debugSection.classList.add('hidden');
    debugBtn.textContent = 'Debug Info';
  }
}

// Refresh debug info
function refreshDebugInfo() {
  console.log('Refreshing debug info');
  
  // Show loading state
  refreshDebugBtn.innerHTML = '<span class="spinner" style="width: 12px; height: 12px; margin-right: 6px;"></span> Refreshing...';
  refreshDebugBtn.disabled = true;
  
  // Get logs from storage
  chrome.storage.local.get(['logs'], (result) => {
    const logs = result.logs || [];
    
    // Format logs
    let formattedLogs = logs.map(log => {
      return `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.level}: ${log.message}`;
    }).join('\n');
    
    if (formattedLogs.length === 0) {
      formattedLogs = 'No logs found.';
    }
    
    // Update debug info
    debugInfo.textContent = formattedLogs;
    
    // Reset button after a short delay
    setTimeout(() => {
      refreshDebugBtn.textContent = 'Refresh';
      refreshDebugBtn.disabled = false;
    }, 500);
  });
}

// Clear logs
function clearLogs() {
  console.log('Clearing logs');
  
  // Show loading state
  clearLogsBtn.innerHTML = '<span class="spinner" style="width: 12px; height: 12px; margin-right: 6px;"></span> Clearing...';
  clearLogsBtn.disabled = true;
  
  chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, () => {
    debugInfo.textContent = 'Logs cleared';
    
    // Reset button after a short delay
    setTimeout(() => {
      clearLogsBtn.textContent = 'Clear Logs';
      clearLogsBtn.disabled = false;
    }, 500);
  });
}

// Refresh UI state from storage
function refreshUI() {
  console.log('Manually refreshing UI state');
  
  if (!currentArticleUrl) {
    console.log('No current article URL to refresh');
    return;
  }
  
  // Show temporary refresh indicator
  const currentView = document.querySelector('.card:not(.hidden)');
  const viewId = currentView ? currentView.id : null;
  
  if (viewId === 'processing-view') {
    progressText.textContent = 'Refreshing status...';
  }
  
  // Force reload data from storage
  chrome.storage.local.get(['article_' + currentArticleUrl], (result) => {
    const articleData = result['article_' + currentArticleUrl];
    
    if (!articleData) {
      console.log('No article data found for URL:', currentArticleUrl);
      showView('no-article');
      return;
    }
    
    console.log('Refreshed article data from storage:', articleData);
    currentArticleData = articleData;
    
    // Update UI based on current status
    if (articleData.status === 'error') {
      showView('error');
      errorMessage.textContent = articleData.error || 'An unknown error occurred';
    } else if (articleData.status === 'complete') {
      showView('player');
      loadAudio(0);
    } else if (articleData.status === 'processing') {
      showView('processing');
      updateProcessingProgress();
    } else {
      showView('no-article');
    }
  });
}

// Update processing progress
function updateProcessingProgress() {
  // Poll for updates
  const checkProgress = () => {
    if (!currentArticleUrl) return;
    
    chrome.storage.local.get(['article_' + currentArticleUrl], (result) => {
      const articleData = result['article_' + currentArticleUrl];
      
      if (!articleData) return;
      
      // Update current article data
      currentArticleData = articleData;
      
      if (articleData.status === 'processing') {
        // Still processing
        let progressMessage = 'Processing...';
        
        // Provide more detailed progress if we have audio URLs
        if (articleData.audioUrls && Array.isArray(articleData.audioUrls)) {
          const completed = articleData.audioUrls.filter(url => url !== null).length;
          const total = articleData.chunks?.length || articleData.audioUrls.length;
          progressMessage = `Processing... ${completed} of ${total} chunks complete`;
        } else if (articleData.progress) {
          progressMessage = `Processing... ${articleData.progress}`;
        }
        
        console.log('Processing status update:', progressMessage);
        progressText.textContent = progressMessage;
        
        // Check again in 1 second
        setTimeout(checkProgress, 1000);
      } else if (articleData.status === 'error') {
        // Error occurred
        console.log('Error status detected:', articleData.error);
        showView('error');
        errorMessage.textContent = articleData.error || 'An unknown error occurred';
      } else if (articleData.status === 'complete') {
        // Processing complete
        console.log('Processing complete, showing player view');
        showView('player');
        loadAudio(0);
      }
    });
  };
  
  // Start checking progress
  checkProgress();
}

// Save state to storage
function saveState() {
  console.log('Saving state');
  
  // Create a clean version of the state that can be properly serialized
  let cleanArticleData = null;
  
  if (currentArticleData) {
    cleanArticleData = {
      title: currentArticleData.title,
      status: currentArticleData.status,
      chunks: currentArticleData.chunks,
      audioUrls: currentArticleData.audioUrls,
      error: currentArticleData.error,
      progress: currentArticleData.progress,
      timestamp: currentArticleData.timestamp || Date.now()
    };
  }
  
  // Save state to storage
  chrome.storage.local.set({
    'popup_state': {
      currentArticleUrl,
      currentArticleData: cleanArticleData,
      currentChunkIndex
    }
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error saving state:', chrome.runtime.lastError);
    } else {
      console.log('State saved successfully');
    }
  });
}

// Load state from storage
function loadState() {
  console.log('Loading state');
  
  chrome.storage.local.get(['popup_state'], (result) => {
    const state = result.popup_state;
    
    if (state) {
      console.log('Found saved state:', state);
      
      currentArticleUrl = state.currentArticleUrl;
      currentArticleData = state.currentArticleData;
      currentChunkIndex = state.currentChunkIndex || 0;
      
      console.log('State loaded successfully');
      
      // Restore UI based on loaded state
      restoreUIFromState();
    } else {
      console.log('No saved state found');
    }
  });
}

// Restore UI based on the current state
function restoreUIFromState() {
  console.log('Restoring UI from state', {
    hasArticleData: !!currentArticleData,
    articleUrl: currentArticleUrl,
    status: currentArticleData ? currentArticleData.status : 'none'
  });
  
  if (!currentArticleData) {
    console.log('No article data to restore UI from');
    return;
  }
  
  // Set article title if available
  if (currentArticleData.title) {
    articleTitle.textContent = currentArticleData.title;
  }
  
  // Restore the appropriate view based on the article status
  if (currentArticleData.status === 'processing') {
    console.log('Restoring processing view');
    showView('processing');
    updateProcessingProgress();
  } else if (currentArticleData.status === 'error') {
    console.log('Restoring error view');
    showView('error');
    errorMessage.textContent = currentArticleData.error || 'An unknown error occurred';
  } else if (currentArticleData.status === 'complete' && currentArticleData.audioUrls && currentArticleData.audioUrls.length > 0) {
    console.log('Restoring player view');
    showView('player');
    loadAudio(currentChunkIndex);
  } else {
    console.log('Article status not recognized or incomplete, showing no article view');
    showView('no-article');
  }
}

// Show status message
function showStatus(message) {
  console.log('Status:', message);
  // You can implement a toast or status bar here if needed
}
