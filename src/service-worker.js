// Background service worker for Blog-to-Podcast extension

// Import API clients
let murfApiImported = false;
let chatGptApiImported = false;

// Import Murf API client
try {
  importScripts('./murf-api.js');
  console.log('Successfully imported murf-api.js');
  murfApiImported = true;
} catch (error) {
  console.error('Error importing murf-api.js:', error);
}

// Only try alternative path if first attempt failed
if (!murfApiImported) {
  try {
    importScripts('murf-api.js');
    console.log('Successfully imported murf-api.js using alternative path');
    murfApiImported = true;
  } catch (altError) {
    logDebug('Error importing murf-api.js with alternative path:', altError);
  }
}

// Import ChatGPT API client
try {
  importScripts('./chatgpt-api.js');
  console.log('Successfully imported chatgpt-api.js');
  chatGptApiImported = true;
} catch (error) {
  console.error('Error importing chatgpt-api.js:', error);
}

// Only try alternative path if first attempt failed
if (!chatGptApiImported) {
  try {
    importScripts('chatgpt-api.js');
    console.log('Successfully imported chatgpt-api.js using alternative path');
    chatGptApiImported = true;
  } catch (altError) {
    logDebug('Error importing chatgpt-api.js with alternative path:', altError);
  }
}

// Constants
const DEBUG = true;
const DEFAULT_CHUNK_SIZE = 3000; // characters
const MAX_MURF_CHUNK_SIZE = 3000; // Maximum allowed by Murf API
const MAX_CONCURRENT_JOBS = 5; // Free tier limit
const MAX_RETRIES = 3; // Maximum number of retries for failed jobs

// Centralized logging system
function logDebug(message, data = {}) {
  if (!DEBUG) return;
  
  const timestamp = new Date().toISOString();
  const logMessage = `[Blog-to-Podcast] ${message}`;
  
  // Log to console
  console.log(logMessage, data);
  
  // Store in extension storage for debug page
  try {
    chrome.storage.local.get(['debug_logs'], (result) => {
      const logs = result.debug_logs || [];
      logs.push({
        timestamp,
        message: logMessage,
        data: typeof data === 'object' ? JSON.stringify(data) : data
      });
      
      // Keep only the most recent 100 logs
      while (logs.length > 100) {
        logs.shift();
      }
      
      chrome.storage.local.set({ debug_logs: logs });
    });
  } catch (e) {
    console.error('Error storing log in extension storage:', e);
  }
}

// State
let activeJobs = 0;
let jobQueue = [];
let keepAliveInterval = null;
let lastActiveTime = Date.now();
let logs = [];
let murfApi = null;
let chatGptApi = null;

// Configuration
const config = {
  apiKey: null,          // Murf API key
  voiceId: 'en-US-terrell', // Default to a valid Murf voice ID (from Murf docs)
  style: null,           // No style by default, as per API docs
  chunkSize: DEFAULT_CHUNK_SIZE,
  chatGptApiKey: null,   // ChatGPT API key
  useChatGpt: false,     // Whether to use ChatGPT for podcast script conversion
  podcastStyle: 'conversational' // Style for podcast scripts (conversational, professional, casual, storytelling)
};

// Initialize the service worker
function initialize() {
  logEvent('worker_initialize');
  
  // Load configuration from storage
  chrome.storage.sync.get(['apiKey', 'voiceId', 'style', 'chunkSize', 'chatGptApiKey', 'useChatGpt', 'podcastStyle'], (result) => {
    if (result.apiKey) config.apiKey = result.apiKey;
    if (result.voiceId) config.voiceId = result.voiceId;
    if (result.style) config.style = result.style;
    if (result.chunkSize) config.chunkSize = result.chunkSize;
    if (result.chatGptApiKey) config.chatGptApiKey = result.chatGptApiKey;
    if (result.useChatGpt !== undefined) config.useChatGpt = result.useChatGpt;
    if (result.podcastStyle) config.podcastStyle = result.podcastStyle;
    
    logEvent('config_loaded', { 
      hasApiKey: !!config.apiKey, 
      apiKeyLength: config.apiKey ? config.apiKey.length : 0,
      voiceId: config.voiceId,
      useChatGpt: config.useChatGpt,
      hasChatGptApiKey: !!config.chatGptApiKey
    });
    
    console.log('Service worker config loaded');
    
    // Initialize Murf API
    initializeMurfAPI();
    
    // Initialize ChatGPT API if ChatGPT is enabled
    initializeChatGptAPI();
  });
  
  // Start the keep-alive mechanism
  startKeepAlive();
}

// Initialize Murf API
function initializeMurfAPI() {
  // Only initialize if we have an API key
  if (config.apiKey) {
    console.log('Checking API configuration', {
      hasApiKey: !!config.apiKey, 
      apiKeyLength: config.apiKey ? config.apiKey.length : 0,
      voiceId: config.voiceId,
      useChatGpt: config.useChatGpt,
      hasChatGptApiKey: !!config.chatGptApiKey
    });
    
    if (!murfApi) {
      try {
        console.log('Initializing Murf API with key length:', config.apiKey.length);
        murfApi = new MurfAPI(config.apiKey);
        logEvent('murf_api_initialized');
        console.log('Murf API initialized successfully');
      } catch (error) {
        console.error('Error initializing Murf API:', error);
        logEvent('murf_api_init_error', { error: error.message });
      }
    } else {
      console.log('Murf API already initialized');
    }
  } else {
    console.log('Cannot initialize Murf API: No API key provided');
  }
}

// Initialize ChatGPT API
function initializeChatGptAPI() {
  // Only initialize if ChatGPT is enabled and we have an API key
  if (config.useChatGpt && config.chatGptApiKey && typeof ChatGPTAPI !== 'undefined') {
    console.log('ChatGPT is enabled with settings:', { 
      keyLength: config.chatGptApiKey ? config.chatGptApiKey.length : 0,
      keyPreview: config.chatGptApiKey ? config.chatGptApiKey.substring(0, 5) + '...' : 'none',
      podcastStyle: config.podcastStyle,
      useChatGpt: config.useChatGpt
    });
    
    try {
      // Force reinitialize the ChatGPT API
      chatGptApi = null;
      chatGptApi = new ChatGPTAPI(config.chatGptApiKey);
      console.log('ChatGPT API initialized successfully with model:', chatGptApi.model);
      logEvent('chatgpt_api_initialized', { model: chatGptApi.model });
    } catch (error) {
      console.error('Error initializing ChatGPT API:', error);
      console.error('Error details:', error.stack);
      logEvent('chatgpt_api_init_error', { 
        error: error.message,
        stack: error.stack,
        apiKey: config.chatGptApiKey ? 'present (length: ' + config.chatGptApiKey.length + ')' : 'missing'
      });
      // Continue without ChatGPT if initialization fails
      chatGptApi = null;
    }
  } else {
    console.log('ChatGPT is not enabled or missing API key:', {
      useChatGpt: config.useChatGpt,
      hasApiKey: !!config.chatGptApiKey,
      apiImported: typeof ChatGPTAPI !== 'undefined'
    });
    chatGptApi = null;
  }
}

// Initialize on installation
chrome.runtime.onInstalled.addListener(initialize);

// Initialize when service worker starts
initialize();

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logEvent('message_received', { type: message.type, sender: sender.id || 'unknown' });
  lastActiveTime = Date.now();
  
  // Create a keep-alive interval to prevent service worker termination during async operations
  const keepAliveInterval = setInterval(() => {
    console.log('Keeping service worker alive while processing message:', message.type);
    lastActiveTime = Date.now();
  }, 5000); // Update every 5 seconds
  
  // Helper to clean up the interval when done
  const cleanupAndRespond = (response) => {
    clearInterval(keepAliveInterval);
    sendResponse(response);
  };
  
  try {
    switch (message.type) {
      case 'ARTICLE_TEXT':
        // Handle article text synchronously but start the processing
        handleArticleText(
          message.text, 
          message.title || 'Article', 
          message.url || (sender.tab ? sender.tab.url : 'unknown'),
          message.extractionMethod || 'unknown',
          message.isRetry || false
        );
        cleanupAndRespond({ status: 'processing' });
        return false; // Synchronous response
      
      case 'GET_STATUS':
        const statusResponse = {
          activeJobs,
          queueLength: jobQueue.length,
          config: {
            hasApiKey: !!config.apiKey,
            voiceId: config.voiceId,
            style: config.style,
            chunkSize: config.chunkSize
          }
        };
        logEvent('status_request', statusResponse);
        cleanupAndRespond(statusResponse);
        return false; // Synchronous response
        
      case 'GET_LOGS':
        // Return the most recent logs for debugging
        chrome.storage.local.get(['debug_logs'], (result) => {
          cleanupAndRespond({ logs: result.debug_logs || [] });
        });
        return true; // Async response
        
      case 'CLEAR_LOGS':
        // Clear debug logs
        chrome.storage.local.set({ debug_logs: [] }, () => {
          logEvent('logs_cleared');
          cleanupAndRespond({ status: 'logs_cleared' });
        });
        return true; // Async response
        
      case 'SETTINGS_UPDATED':
        // Update configuration with new settings
        logEvent('settings_updated', { 
          hasApiKey: !!message.settings.apiKey,
          apiKeyLength: message.settings.apiKey ? message.settings.apiKey.length : 0,
          voiceId: message.settings.voiceId,
          useChatGpt: message.settings.useChatGpt,
          hasChatGptApiKey: !!message.settings.chatGptApiKey,
          chatGptApiKeyLength: message.settings.chatGptApiKey ? message.settings.chatGptApiKey.length : 0
        });
        
        // Update config with new settings
        if (message.settings.apiKey) config.apiKey = message.settings.apiKey;
        if (message.settings.voiceId) config.voiceId = message.settings.voiceId;
        if (message.settings.style) config.style = message.settings.style;
        if (message.settings.chunkSize) config.chunkSize = message.settings.chunkSize;
        if (message.settings.chatGptApiKey) config.chatGptApiKey = message.settings.chatGptApiKey;
        if (message.settings.useChatGpt !== undefined) config.useChatGpt = message.settings.useChatGpt;
        if (message.settings.podcastStyle) config.podcastStyle = message.settings.podcastStyle;
        
        console.log('Service worker configuration updated:', {
          hasApiKey: !!config.apiKey,
          apiKeyLength: config.apiKey ? config.apiKey.length : 0,
          voiceId: config.voiceId,
          useChatGpt: config.useChatGpt,
          hasChatGptApiKey: !!config.chatGptApiKey,
          podcastStyle: config.podcastStyle
        });
        
        // Re-initialize APIs with new configuration
        initializeMurfAPI();
        initializeChatGptAPI();
        
        cleanupAndRespond({ status: 'settings_updated', success: true });
        return false; // Synchronous response
        
      default:
        logEvent('unknown_message', { type: message.type });
        cleanupAndRespond({ status: 'unknown_command' });
        return false; // Synchronous response
    }
  } catch (error) {
    console.error('Error handling message:', error);
    logEvent('message_error', { type: message.type, error: error.message });
    clearInterval(keepAliveInterval);
    sendResponse({ status: 'error', error: error.message });
    return false;
  }
});

// Handle article text from content script
async function handleArticleText(text, title, url, extractionMethod = 'unknown', isRetry = false) {
  console.log('Handling article text', { textLength: text.length, title, isRetry });
  
  // For retry operations, clear any lingering state
  if (isRetry) {
    console.log('Retry operation detected, cleaning up previous state for URL:', url);
    
    // Remove any active jobs for this URL
    for (const jobId in activeJobs) {
      if (activeJobs[jobId].url === url) {
        console.log('Removing stale active job for URL:', url, 'Job ID:', jobId);
        delete activeJobs[jobId];
      }
    }
    
    // Also remove from job queue
    jobQueue = jobQueue.filter(job => job.url !== url);
  }
  // Initialize variables for text processing
  let processedText = text;
  let originalText = text;
  
  // Create a keep-alive interval specifically for article processing
  const keepAliveInterval = setInterval(() => {
    console.log('Keeping service worker alive while processing article:', title);
    lastActiveTime = Date.now();
  }, 5000); // Update every 5 seconds

  try {
    logEvent('article_processing_started', { 
      textLength: text.length,
      titleLength: title.length,
      extractionMethod,
      isRetry
    });
    console.log('Service worker received article text', {
      title,
      url,
      textLength: text.length,
      extractionMethod,
      textPreview: text.substring(0, 100) + '...'
    });
    
    // Check if API key is configured
    console.log('Checking API configuration', {
      hasApiKey: !!config.apiKey,
      apiKeyLength: config.apiKey ? config.apiKey.length : 0,
      voiceId: config.voiceId,
      useChatGpt: config.useChatGpt,
      hasChatGptApiKey: !!config.chatGptApiKey
    });
    
    if (!config.voiceId) {
      logEvent('config_error', { hasVoiceId: !!config.voiceId });
      console.error('Voice not configured');
      chrome.runtime.sendMessage({
        type: 'ERROR',
        error: 'Voice not configured. Please go to extension options to set it up.'
      });
      clearInterval(keepAliveInterval);
      return;
    }
    
    // Initialize Murf API if not already initialized
    if (!murfApi) {
      console.log('Initializing Murf API with key', { 
        keyLength: config.apiKey ? config.apiKey.length : 0,
        keyPreview: config.apiKey ? config.apiKey.substring(0, 5) + '...' : 'none'
      });
      // Will use default API key if none is configured
      murfApi = new MurfAPI(config.apiKey);
      logEvent('murf_api_initialized');
    } else {
      console.log('Murf API already initialized');
    }
    
    // Always reinitialize ChatGPT API if it's enabled and we have an API key
    // This ensures we're using the latest settings
    if (config.useChatGpt && config.chatGptApiKey && chatGptApiImported) {
      console.log('ChatGPT is enabled with settings:', { 
        keyLength: config.chatGptApiKey ? config.chatGptApiKey.length : 0,
        keyPreview: config.chatGptApiKey ? config.chatGptApiKey.substring(0, 5) + '...' : 'none',
        podcastStyle: config.podcastStyle,
        useChatGpt: config.useChatGpt
      });
      
      try {
        // Force reinitialize the ChatGPT API
        chatGptApi = null;
        chatGptApi = new ChatGPTAPI(config.chatGptApiKey);
        console.log('ChatGPT API initialized successfully with model:', chatGptApi.model);
        logEvent('chatgpt_api_initialized', { model: chatGptApi.model });
      } catch (error) {
        console.error('Error initializing ChatGPT API:', error);
        console.error('Error details:', error.stack);
        logEvent('chatgpt_api_init_error', { 
          error: error.message,
          stack: error.stack,
          apiKey: config.chatGptApiKey ? 'present (length: ' + config.chatGptApiKey.length + ')' : 'missing'
        });
        // Continue without ChatGPT if initialization fails
        chatGptApi = null;
      }
    } else {
      console.log('ChatGPT is not enabled or missing API key:', {
        useChatGpt: config.useChatGpt,
        hasApiKey: !!config.chatGptApiKey,
        apiImported: chatGptApiImported
      });
      chatGptApi = null;
    }
    
    // Check if ChatGPT should be used
    console.log('Checking if ChatGPT should be used:', {
      useChatGpt: config.useChatGpt,
      chatGptApiInitialized: !!chatGptApi,
      textLength: text.length
    });
    
    // If ChatGPT is enabled and initialized, convert the blog to a podcast script first
    if (config.useChatGpt && chatGptApi) {
      try {
        logEvent('chatgpt_conversion_started', { textLength: text.length });
        console.log('Converting blog to podcast script using ChatGPT', {
          textLength: text.length,
          podcastStyle: config.podcastStyle,
          model: chatGptApi.model
        });
        
        // Make sure ChatGPT API is properly initialized
        if (!chatGptApi) {
          throw new Error('ChatGPT API is not initialized properly');
        }
        
        // Convert the blog text to a podcast script
        processedText = await chatGptApi.convertToPodcastScript({
          text: text,
          title: title,
          style: config.podcastStyle
        });
        
        // Verify we got a valid response
        if (!processedText || typeof processedText !== 'string' || processedText.length < 10) {
          throw new Error('ChatGPT API returned invalid or empty response');
        }
        
        logEvent('chatgpt_conversion_completed', { 
          originalLength: text.length,
          processedLength: processedText.length 
        });
        
        console.log('Blog converted to podcast script', {
          originalLength: text.length,
          processedLength: processedText.length,
          scriptPreview: processedText.substring(0, 100) + '...'
        });
      } catch (error) {
        console.error('Error converting blog to podcast script:', error);
        logEvent('chatgpt_conversion_error', { 
          error: error.message,
          stack: error.stack,
          model: chatGptApi ? chatGptApi.model : 'unknown'
        });
        
        // Add more detailed logging for debugging
        console.log('ChatGPT API error details:', {
          apiInitialized: !!chatGptApi,
          model: chatGptApi ? chatGptApi.model : 'unknown',
          textLength: text.length,
          errorName: error.name,
          errorMessage: error.message
        });
        
        // Try to reinitialize ChatGPT API if it failed
        if (config.useChatGpt && config.chatGptApiKey && chatGptApiImported) {
          try {
            console.log('Attempting to reinitialize ChatGPT API after error...');
            chatGptApi = new ChatGPTAPI(config.chatGptApiKey);
            console.log('ChatGPT API reinitialized successfully');
          } catch (reinitError) {
            console.error('Failed to reinitialize ChatGPT API:', reinitError);
            chatGptApi = null;
          }
        }
        
        // Fall back to original text if conversion fails
        processedText = text;
        
        // Notify that we're falling back to original text
        console.log('Falling back to original text for processing');
      }
    }
  } catch (error) {
    console.error('Error in handleArticleText:', error);
    logEvent('article_processing_error', { error: error.message });
    clearInterval(keepAliveInterval);
    throw error;
  }
  
  // Split text into chunks using the Murf API
  // Ensure we don't exceed Murf API's 3000 character limit
  const safeChunkSize = Math.min(config.chunkSize, MAX_MURF_CHUNK_SIZE);
  console.log('Splitting text into chunks', { 
    textLength: processedText.length, 
    requestedChunkSize: config.chunkSize,
    actualChunkSize: safeChunkSize
  });
  const chunks = murfApi.splitIntoChunks(processedText, safeChunkSize);
  logEvent('text_chunked', { chunkCount: chunks.length, avgChunkLength: Math.round(processedText.length / chunks.length) });
  
  console.log('Text split into chunks', { 
    chunkCount: chunks.length, 
    avgChunkLength: Math.round(processedText.length / chunks.length),
    firstChunkPreview: chunks[0].substring(0, 50) + '...'
  });
  
  // Store article metadata
  const articleData = {
    title,
    url,
    chunks,
    audioUrls: Array(chunks.length).fill(null),
    status: 'processing',
    timestamp: Date.now(),
    usedChatGpt: config.useChatGpt && chatGptApi ? true : false,
    podcastStyle: config.podcastStyle,
    originalText: config.useChatGpt && chatGptApi ? originalText : null // Store original text if we used ChatGPT
  };
  
  // Store in local storage
  chrome.storage.local.set({ 
    ['article_' + url]: articleData 
  }, () => {
    logEvent('article_saved', { url, title });
  });
  
  // Notify popup that processing has started
  chrome.runtime.sendMessage({
    type: 'PROCESSING_STARTED',
    articleUrl: url,
    totalChunks: chunks.length,
    usedChatGpt: articleData.usedChatGpt
  });
  
  // Queue chunks for processing
  console.log('Queueing chunks for processing', { count: chunks.length });
  
  chunks.forEach((chunk, index) => {
    console.log(`Queueing chunk ${index + 1}/${chunks.length}`, {
      chunkLength: chunk.length,
      chunkPreview: chunk.substring(0, 50) + '...'
    });
    
    queueJob({
      type: 'SYNTHESIZE',
      text: chunk,
      articleUrl: url,
      chunkIndex: index,
      retryCount: 0
    });
  });
  
  logEvent('chunks_queued', { count: chunks.length, url });
  console.log('All chunks queued, starting processing');
  
  // Start processing the queue
  processQueue();
  
  // Clear the keep-alive interval
  clearInterval(keepAliveInterval);
}

/**
 * Queue a job for processing
 * @param {Object} job - Job to queue
 */
function queueJob(job) {
  jobQueue.push(job);
  
  logEvent('job_queued', { 
    type: job.type, 
    chunkIndex: job.chunkIndex, 
    retryCount: job.retryCount,
    queueLength: jobQueue.length
  });
  
  // Start keep-alive ping if not already running
  if (!keepAliveInterval && jobQueue.length > 0) {
    startKeepAlive();
  }
}

/**
 * Process jobs in the queue
 * This function processes up to MAX_CONCURRENT_JOBS jobs at a time
 */
function processQueue() {
  // Ensure the service worker stays alive during queue processing
  lastActiveTime = Date.now();
  
  logEvent('queue_processing', { 
    activeJobs, 
    queueLength: jobQueue.length,
    maxConcurrentJobs: MAX_CONCURRENT_JOBS
  });
  
  // Make sure keep-alive is running if we have jobs
  if (jobQueue.length > 0 || activeJobs > 0) {
    startKeepAlive();
  }
  
  // Process up to MAX_CONCURRENT_JOBS jobs at a time
  while (activeJobs < MAX_CONCURRENT_JOBS && jobQueue.length > 0) {
    const job = jobQueue.shift();
    activeJobs++;
    
    // Process the job with error handling
    processJob(job)
      .then(() => {
        activeJobs--;
        lastActiveTime = Date.now(); // Update last active time after job completion
        // Continue processing queue
        processQueue();
      })
      .catch(error => {
        console.error('Job processing error:', error);
        logEvent('queue_processing_error', { error: error.message, jobType: job.type });
        activeJobs--;
        lastActiveTime = Date.now(); // Update last active time even after error
        // Continue processing queue
        processQueue();
      });
  }
  
  // If queue is empty, stop keep-alive ping
  if (jobQueue.length === 0 && activeJobs === 0) {
    logEvent('queue_empty');
    stopKeepAlive();
  }
}

// Process a single job
async function processJob(job) {
  // Create a job-specific keep-alive interval
  const jobKeepAliveInterval = setInterval(() => {
    console.log('Keeping service worker alive while processing job:', job.type, job.chunkIndex);
    lastActiveTime = Date.now();
  }, 5000);
  
  try {
    logEvent('job_processing_started', { 
      type: job.type, 
      chunkIndex: job.chunkIndex, 
      retryCount: job.retryCount,
      url: job.articleUrl
    });
    
    if (job.type === 'SYNTHESIZE') {
      // Make sure Murf API is initialized
      if (!murfApi) {
        murfApi = new MurfAPI(config.apiKey);
        logEvent('murf_api_initialized');
      }
      
      // Get article data
      const articleData = await new Promise((resolve) => {
        chrome.storage.local.get(['article_' + job.articleUrl], (result) => {
          resolve(result['article_' + job.articleUrl]);
        });
      });
      
      if (!articleData) {
        logEvent('job_error', { error: 'article_not_found', url: job.articleUrl });
        return;
      }
      
      logEvent('speech_generation_started', { 
        chunkIndex: job.chunkIndex, 
        textLength: job.text.length,
        voiceId: config.voiceId,
        style: config.style
      });
      
      try {
        // Generate speech using Murf API
        console.log(`Starting speech generation for chunk ${job.chunkIndex + 1}`, {
          textLength: job.text.length,
          textPreview: job.text.substring(0, 50) + '...',
          voiceId: config.voiceId,
          style: config.style,
          apiKeyLength: config.apiKey ? config.apiKey.length : 0
        });
        
        // Use the updated Murf API client with proper parameters
        const audioUrl = await murfApi.generateSpeech({
          text: job.text,
          voiceId: config.voiceId,
          style: config.style
        });
        
        console.log(`Speech generation completed for chunk ${job.chunkIndex + 1}`, {
          audioUrlLength: audioUrl.length,
          audioUrlPreview: audioUrl.substring(0, 50) + '...'
        });
        
        logEvent('speech_generation_completed', { 
          chunkIndex: job.chunkIndex,
          audioUrlLength: audioUrl.length
        });
        
        // Update article data with audio URL
        articleData.audioUrls[job.chunkIndex] = audioUrl;
        
        // Check if all chunks are processed
        const allProcessed = articleData.audioUrls.every(url => url !== null);
        
        // Update article status
        if (allProcessed) {
          articleData.status = 'complete';
          logEvent('article_completed', { 
            url: job.articleUrl,
            status: articleData.status,
            audioUrlsCount: articleData.audioUrls.length,
            chunksCount: articleData.chunks.length
          });
          logDebug('Article processing completed', {
            url: job.articleUrl,
            title: articleData.title,
            status: articleData.status,
            audioUrls: articleData.audioUrls.map(url => url ? 'present' : 'missing')
          });
        }
        
        // Save updated article data
        await new Promise((resolve) => {
          chrome.storage.local.set({ ['article_' + job.articleUrl]: articleData }, resolve);
        });
        
        // Notify popup that chunk is processed
        try {
          chrome.runtime.sendMessage({
            type: 'CHUNK_READY',  // Changed to match what popup.js is listening for
            articleUrl: job.articleUrl,
            chunkIndex: job.chunkIndex,
            audioUrl,
            allReady: allProcessed  // Changed to match what popup.js is checking
          }, response => {
            // Handle response from popup
            if (chrome.runtime.lastError) {
              logDebug('Error sending message to popup', { error: chrome.runtime.lastError.message });
            } else if (response && response.received) {
              logDebug('Popup acknowledged CHUNK_READY message', {
                articleUrl: job.articleUrl,
                chunkIndex: job.chunkIndex,
                allReady: allProcessed
              });
            }
          });
        } catch (msgError) {
          logDebug('Exception sending message to popup', { error: msgError.message });
        }
        
        logEvent('job_completed', { 
          type: job.type, 
          chunkIndex: job.chunkIndex,
          url: job.articleUrl
        });
      } catch (error) {
        logEvent('job_error', { 
          error: error.message, 
          type: job.type, 
          chunkIndex: job.chunkIndex,
          retryCount: job.retryCount
        });
        
        // Retry job if not exceeded max retries
        if (job.retryCount < MAX_RETRIES) {
          logEvent('job_retry', { 
            type: job.type, 
            chunkIndex: job.chunkIndex,
            retryCount: job.retryCount + 1
          });
          
          // Add job back to queue with increased retry count
          queueJob({
            ...job,
            retryCount: job.retryCount + 1
          });
        } else {
          logEvent('job_failed', { 
            type: job.type, 
            chunkIndex: job.chunkIndex,
            error: error.message
          });
          
          // Notify popup of failure
          chrome.runtime.sendMessage({
            type: 'CHUNK_FAILED',
            articleUrl: job.articleUrl,
            chunkIndex: job.chunkIndex,
            error: error.message
          });
        }
        
        throw error; // Re-throw to be caught by caller
      }
    }
  } catch (error) {
    console.error('Error in processJob:', error);
    throw error; // Re-throw to be caught by caller
  } finally {
    // Always clear the keep-alive interval when done
    clearInterval(jobKeepAliveInterval);
  }
}

/**
 * Keep-alive mechanism to prevent service worker from being terminated
 * Chrome MV3 service workers are terminated after ~30 seconds of inactivity
 * This function sets up a ping mechanism to keep the worker alive while jobs are in the queue
 */
function startKeepAlive() {
  logEvent('keep_alive_start', { activeJobs, queueLength: jobQueue.length });
  
  // If there's already a keep-alive interval, clear it first
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }
  
  // Create a new keep-alive interval
  keepAliveInterval = setInterval(() => {
    const timeSinceLastActive = Date.now() - lastActiveTime;
    const timeInSeconds = Math.round(timeSinceLastActive / 1000);
    
    logEvent('keep_alive_ping', { 
      activeJobs, 
      queueLength: jobQueue.length,
      timeSinceLastActive: timeInSeconds + 's'
    });
    
    // Send a message to any open popups to keep them informed
    chrome.runtime.sendMessage({
      type: 'WORKER_STATUS',
      activeJobs,
      queueLength: jobQueue.length,
      lastActiveTime: new Date(lastActiveTime).toISOString()
    }).catch(() => {
      // Ignore errors if no popups are open to receive the message
    });
    
    // If no activity for 5 minutes and no jobs, stop keep-alive
    if (timeSinceLastActive > 5 * 60 * 1000 && activeJobs === 0 && jobQueue.length === 0) {
      stopKeepAlive();
    }
  }, 25000); // Ping every 25 seconds (service worker terminates after ~30s)
}

/**
 * Stop the keep-alive ping mechanism
 * This is called when there are no more jobs to process
 */
function stopKeepAlive() {
  if (keepAliveInterval) {
    logEvent('keep_alive_stop', { activeJobs, queueLength: jobQueue.length });
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

/**
 * Log an event with structured data
 * This makes it easier to debug issues by providing consistent logging
 * @param {string} eventName - Name of the event
 * @param {Object} data - Additional data to log
 */
function logEvent(eventName, data = {}) {
  const timestamp = new Date().toISOString();
  const logData = {
    event: eventName,
    timestamp,
    ...data
  };
  
  console.log(`[${eventName}]`, logData);
  
  // Store recent logs in local storage for debugging
  chrome.storage.local.get(['debug_logs'], (result) => {
    const logs = result.debug_logs || [];
    logs.push(logData);
    
    // Keep only the most recent 100 logs
    while (logs.length > 100) {
      logs.shift();
    }
    
    chrome.storage.local.set({ debug_logs: logs });
  });
}

// Service worker lifecycle events

/**
 * Log when service worker starts
 */
logEvent('worker_started', { timestamp: new Date().toISOString() });

/**
 * Listen for service worker termination
 */
self.addEventListener('unload', () => {
  logEvent('worker_stopping', {
    activeJobs,
    queueLength: jobQueue.length,
    uptime: Math.round((Date.now() - lastActiveTime) / 1000) + 's'
  });
});

/**
 * Listen for storage changes to update config
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    // Check for config changes
    let configChanged = false;
    
    if (changes.apiKey) {
      config.apiKey = changes.apiKey.newValue;
      // Reinitialize Murf API with new key
      if (config.apiKey) {
        murfApi = new MurfAPI(config.apiKey);
      }
      configChanged = true;
    }
    
    if (changes.voiceId) {
      config.voiceId = changes.voiceId.newValue;
      configChanged = true;
    }
    
    if (changes.style) {
      config.style = changes.style.newValue;
      configChanged = true;
    }
    
    if (changes.chunkSize) {
      config.chunkSize = changes.chunkSize.newValue;
      configChanged = true;
    }
    
    if (configChanged) {
      logEvent('config_updated', { 
        hasApiKey: !!config.apiKey,
        voiceId: config.voiceId,
        style: config.style,
        chunkSize: config.chunkSize
      });
    }
  }
});