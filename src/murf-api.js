/**
 * Murf API client for text-to-speech conversion
 * Based on the official Murf API documentation: https://murf.ai/api/docs/introduction/overview
 */
class MurfAPI {
  /**
   * Create a new Murf API client
   * @param {string} apiKey - Murf API key
   */
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('API key is required for Murf API');
    }
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.murf.ai/v1';
    this.debug = true; // Set to true to enable debug logging
  }
  
  /**
   * Get headers for API requests
   * @returns {Object} Headers object
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'api-key': this.apiKey
    };
  }
  
  /**
   * Log debug messages if debug is enabled
   * @param {string} message - Debug message
   * @param {Object} data - Additional data to log
   */
  log(message, data = {}) {
    if (this.debug) {
      console.log(`[MurfAPI] ${message}`, data);
    }
  }
  
  /**
   * Log step progress with a clear step number
   * @param {number} stepNumber - Step number in the process
   * @param {string} message - Step description
   * @param {Object} data - Additional data to log
   */
  logStep(stepNumber, message, data = {}) {
    const logMessage = `[MurfAPI] STEP ${stepNumber}: ${message}`;
    console.log(logMessage, data);
    
    // Store log in extension storage for debug page
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['debug_logs'], (result) => {
          const logs = result.debug_logs || [];
          logs.push({
            event: 'murf_api_step',
            timestamp: new Date().toISOString(),
            step: stepNumber,
            message: logMessage,
            data: JSON.stringify(data)
          });
          
          // Keep only the most recent 100 logs
          while (logs.length > 100) {
            logs.shift();
          }
          
          chrome.storage.local.set({ debug_logs: logs });
        });
      }
    } catch (e) {
      console.error('Error storing log in extension storage:', e);
    }
  }
  
  /**
   * Split text into chunks for processing
   * @param {string} text - Text to split into chunks
   * @param {number} maxChunkSize - Maximum chunk size in characters
   * @returns {Array<string>} Array of text chunks
   */
  splitIntoChunks(text, maxChunkSize = 3000) {
    // Ensure maxChunkSize is at most 3000 characters (Murf API limit)
    const actualMaxSize = Math.min(maxChunkSize, 3000);
    
    this.logStep(1, 'Starting text chunking process', { 
      textLength: text.length, 
      requestedChunkSize: maxChunkSize,
      actualMaxSize: actualMaxSize
    });
    
    // If text is already small enough, return as single chunk
    if (text.length <= actualMaxSize) {
      this.logStep(2, 'Text is small enough for a single chunk', { textLength: text.length });
      return [text];
    }
    
    this.logStep(2, 'Text needs to be split into multiple chunks', { textLength: text.length });
    
    const chunks = [];
    let currentChunk = '';
    
    // Split by sentences to avoid cutting in the middle of a sentence
    this.logStep(3, 'Splitting text by sentences');
    const sentences = text.split(/(?<=[.!?])\s+/);
    this.logStep(4, 'Text split into sentences', { sentenceCount: sentences.length });
    
    this.logStep(5, 'Processing sentences into chunks');
    let processedSentences = 0;
    
    for (const sentence of sentences) {
      // Handle case where a single sentence is longer than the max chunk size
      if (sentence.length > actualMaxSize) {
        // If we have content in the current chunk, save it first
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          this.log(`Added chunk #${chunks.length}`, { 
            chunkLength: currentChunk.trim().length,
            chunkPreview: currentChunk.trim().substring(0, 50) + '...'
          });
          currentChunk = '';
        }
        
        // Split long sentence into smaller parts
        this.log('Found sentence exceeding max chunk size', {
          sentenceLength: sentence.length,
          maxSize: actualMaxSize
        });
        
        let remainingSentence = sentence;
        while (remainingSentence.length > 0) {
          // Find a good breaking point (preferably after a comma, semicolon, or other punctuation)
          let breakPoint = actualMaxSize;
          if (breakPoint < remainingSentence.length) {
            // Try to find a natural break point
            const possibleBreakPoints = [',', ';', ':', ' '];
            
            for (const punct of possibleBreakPoints) {
              // Look for the punctuation from right to left within the allowed range
              const lastPunct = remainingSentence.lastIndexOf(punct, actualMaxSize - 1);
              if (lastPunct > 0) {
                breakPoint = lastPunct + 1; // Include the punctuation
                break;
              }
            }
          } else {
            breakPoint = remainingSentence.length;
          }
          
          // Add the chunk
          const sentenceChunk = remainingSentence.substring(0, breakPoint).trim();
          chunks.push(sentenceChunk);
          this.log(`Added sentence fragment as chunk #${chunks.length}`, { 
            chunkLength: sentenceChunk.length,
            chunkPreview: sentenceChunk.substring(0, 50) + '...'
          });
          
          // Move to the next part of the sentence
          remainingSentence = remainingSentence.substring(breakPoint).trim();
        }
      }
      // Normal case: If adding this sentence would exceed the chunk size and we already have content
      else if (currentChunk.length + sentence.length > actualMaxSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        this.log(`Added chunk #${chunks.length}`, { 
          chunkLength: currentChunk.trim().length,
          chunkPreview: currentChunk.trim().substring(0, 50) + '...'
        });
        currentChunk = sentence;
      } else {
        // Otherwise, add the sentence to the current chunk
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
      
      processedSentences++;
      if (processedSentences % 100 === 0) {
        this.log(`Processed ${processedSentences}/${sentences.length} sentences`);
      }
    }
    
    // Add the last chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
      this.log(`Added final chunk #${chunks.length}`, { 
        chunkLength: currentChunk.trim().length,
        chunkPreview: currentChunk.trim().substring(0, 50) + '...'
      });
    }
    
    this.logStep(6, 'Text chunking completed', { 
      chunkCount: chunks.length, 
      avgChunkSize: Math.round(text.length / chunks.length),
      totalProcessedChars: chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    });
    
    // Verify no chunks exceed the maximum size
    const oversizedChunks = chunks.filter(chunk => chunk.length > actualMaxSize);
    if (oversizedChunks.length > 0) {
      this.logStep(7, 'WARNING: Some chunks still exceed maximum size', {
        oversizedCount: oversizedChunks.length,
        sizes: oversizedChunks.map(chunk => chunk.length)
      });
    } else {
      this.logStep(7, 'All chunks are within size limit', {
        maxChunkLength: Math.max(...chunks.map(chunk => chunk.length))
      });
    }
    
    // Log details about each chunk
    chunks.forEach((chunk, index) => {
      this.log(`Chunk #${index + 1} details`, {
        length: chunk.length,
        preview: chunk.substring(0, 50) + (chunk.length > 50 ? '...' : '')
      });
    });
    
    return chunks;
  }
  
  /**
   * Generate speech from text using Murf API
   * @param {Object} options - Options for speech generation
   * @param {string} options.text - Text to convert to speech
   * @param {string} options.voiceId - Voice ID to use
   * @param {string} [options.style] - Voice style to use
   * @param {string} [options.format] - Audio format (MP3, WAV, FLAC)
   * @param {number} [options.sampleRate] - Sample rate (8000, 24000, 44100, 48000)
   * @param {string} [options.modelType] - Model type (GEN1, GEN2)
   * @returns {Promise<string>} URL to the generated audio file
   */
  async generateSpeech(options) {
    this.logStep(1, 'Starting speech generation process');
    
    const { 
      text, 
      voiceId, 
      style = null,
      format = null,
      sampleRate = null,
      modelType = null
    } = options;
    
    this.logStep(2, 'Validating parameters', { 
      textLength: text ? text.length : 0,
      hasVoiceId: !!voiceId,
      hasStyle: !!style,
      hasFormat: !!format,
      hasSampleRate: !!sampleRate,
      hasModelType: !!modelType
    });
    
    if (!text || !voiceId) {
      console.error('[MurfAPI] ERROR: Missing required parameters', {
        hasText: !!text,
        hasVoiceId: !!voiceId
      });
      throw new Error('Text and voiceId are required');
    }
    
    this.logStep(3, 'Parameters validated successfully', { 
      textLength: text.length,
      voiceId,
      style,
      format,
      sampleRate,
      modelType
    });
    
    // Prepare request body with required parameters
    this.logStep(4, 'Preparing request body');
    const body = {
      text,
      voiceId
    };
    
    // Add optional parameters if provided
    if (style) body.style = style;
    if (format) body.format = format;
    if (sampleRate) body.sampleRate = sampleRate;
    if (modelType) body.modelType = modelType;
    
    this.logStep(5, 'Request body prepared', {
      bodyPreview: JSON.stringify(body).substring(0, 100) + (JSON.stringify(body).length > 100 ? '...' : ''),
      bodyLength: JSON.stringify(body).length
    });
    
    // Add a timeout to the fetch request
    this.logStep(6, 'Setting up request timeout (30 seconds)');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      this.logStep(7, 'Preparing to send API request', {
        url: `${this.baseUrl}/speech/generate`,
        headers: { ...this.getHeaders(), 'api-key': '***' }, // Hide actual API key in logs
        bodyPreview: JSON.stringify(body).substring(0, 100) + '...'
      });
      
      this.logStep(8, 'Sending API request now...');
      console.time('[MurfAPI] API Request Time');
      
      const response = await fetch(`${this.baseUrl}/speech/generate`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal
      });
      
      console.timeEnd('[MurfAPI] API Request Time');
      this.logStep(9, 'API response received', { 
        status: response.status, 
        statusText: response.statusText,
        ok: response.ok
      });
      
      // Clear the timeout since the request completed
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        this.logStep(10, 'API returned error response', { 
          status: response.status, 
          statusText: response.statusText 
        });
        
        const errorText = await response.text();
        this.logStep(11, 'Reading error response text', { 
          errorTextLength: errorText.length,
          errorTextPreview: errorText.substring(0, 200) + (errorText.length > 200 ? '...' : '')
        });
        
        let errorData = {};
        
        try {
          this.logStep(12, 'Parsing error response as JSON');
          errorData = JSON.parse(errorText);
          this.logStep(13, 'Error response parsed successfully', { errorData });
        } catch (e) {
          this.logStep(13, 'Failed to parse error response as JSON', { error: e.message });
          errorData = { rawError: errorText };
        }
        
        console.error('[MurfAPI] API ERROR', { 
          status: response.status, 
          statusText: response.statusText,
          errorData
        });
        
        // Create a detailed error object with all relevant information
        const detailedError = new Error(`Murf API error: ${response.status} ${response.statusText}`);
        detailedError.status = response.status;
        detailedError.statusText = response.statusText;
        detailedError.errorData = errorData;
        detailedError.requestBody = { ...body, text: body.text.length > 100 ? body.text.substring(0, 100) + '...' : body.text };
        
        console.error('[MurfAPI] Detailed API Error:', detailedError);
        
        throw detailedError;
      }
      
      this.logStep(10, 'Reading successful response body');
      const responseText = await response.text();
      this.logStep(11, 'Response body read successfully', { 
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '')
      });
      
      let data;
      try {
        this.logStep(12, 'Parsing response as JSON');
        data = JSON.parse(responseText);
        this.logStep(13, 'Response parsed successfully as JSON', { 
          hasAudioUrl: !!data.audioUrl,
          hasAudioFile: !!data.audioFile,
          dataKeys: Object.keys(data)
        });
      } catch (e) {
        this.logStep(13, 'Failed to parse response as JSON', { error: e.message });
        console.error('[MurfAPI] JSON Parse Error', { 
          error: e.message,
          responsePreview: responseText.substring(0, 200) + '...'
        });
        throw new Error(`Failed to parse API response as JSON: ${e.message}. Raw response: ${responseText.substring(0, 200)}...`);
      }
      
      this.logStep(14, 'Speech generated successfully', { 
        hasAudioUrl: !!data.audioUrl,
        hasAudioFile: !!data.audioFile,
        dataKeys: Object.keys(data)
      });
      
      // According to the Murf API documentation, the response contains an audioUrl field
      this.logStep(15, 'Extracting audio URL from response');
      
      if (data.audioUrl) {
        this.logStep(16, 'Found audioUrl in response', { 
          audioUrlLength: data.audioUrl.length,
          audioUrlPreview: data.audioUrl.substring(0, 50) + (data.audioUrl.length > 50 ? '...' : '')
        });
        return data.audioUrl; // URL to the generated audio file
      } else if (data.audioFile) {
        this.logStep(16, 'Found audioFile in response (fallback)', { 
          audioFileLength: data.audioFile.length,
          audioFilePreview: data.audioFile.substring(0, 50) + (data.audioFile.length > 50 ? '...' : '')
        });
        return data.audioFile; // Fallback to audioFile if present
      } else {
        this.logStep(16, 'No audio URL found in response', { dataKeys: Object.keys(data) });
        console.error('[MurfAPI] Missing Audio URL', { data });
        throw new Error('No audio URL found in API response: ' + JSON.stringify(data));
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        this.logStep('ERROR', 'API request timed out after 30 seconds');
        console.error('[MurfAPI] Request Timeout', { timeout: '30 seconds' });
        throw new Error('API request timed out after 30 seconds');
      }
      
      // If we haven't already logged this error
      if (!error.message.includes('API error:') && 
          !error.message.includes('Failed to parse API response') &&
          !error.message.includes('No audio URL found')) {
        console.error('[MurfAPI] Unexpected Error', { error: error.message });
      }
      
      throw error;
    }
  }
  
  /**
   * Get available voices from Murf API
   * @returns {Promise<Array>} Array of available voices
   */
  async getVoices() {
    this.log('Getting available voices');
    
    try {
      const response = await fetch(`${this.baseUrl}/speech/voices`, {
        method: 'GET',
        headers: this.getHeaders()
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      this.log('Voices retrieved successfully', { voiceCount: data.length });
      
      return data;
    } catch (error) {
      this.log('Error getting voices', { error: error.message });
      throw error;
    }
  }
}

// Make the class available for import
if (typeof module !== 'undefined') {
  module.exports = { MurfAPI };
}