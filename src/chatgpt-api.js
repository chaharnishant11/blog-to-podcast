/**
 * ChatGPT API client for converting blog content to podcast scripts
 * This client handles communication with OpenAI's API to transform
 * blog content into a more conversational podcast format with pauses.
 */
class ChatGPTAPI {
  /**
   * Create a new ChatGPT API client
   * @param {string} apiKey - OpenAI API key
   */
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('API key is required for ChatGPT API');
    }
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.openai.com/v1';
    this.debug = true; // Set to true to enable debug logging
    this.model = 'gpt-4';  // Using a valid model name
  }
  
  /**
   * Get headers for API requests
   * @returns {Object} Headers object
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }
  
  /**
   * Log debug messages if debug is enabled
   * @param {string} message - Debug message
   * @param {Object} data - Additional data to log
   */
  log(message, data = {}) {
    if (this.debug) {
      console.log(`[ChatGPTAPI] ${message}`, data);
    }
  }
  
  /**
   * Log step progress with a clear step number
   * @param {number|string} stepNumber - Step number in the process
   * @param {string} message - Step description
   * @param {Object} data - Additional data to log
   */
  logStep(stepNumber, message, data = {}) {
    const logMessage = `[ChatGPTAPI] STEP ${stepNumber}: ${message}`;
    console.log(logMessage, data);
  }
  
  /**
   * Convert blog text to podcast script with pauses
   * @param {Object} options - Options for conversion
   * @param {string} options.text - Blog text to convert
   * @param {string} options.title - Blog title (optional)
   * @param {string} options.style - Podcast style (casual, professional, etc.)
   * @returns {Promise<string>} Podcast script with pauses
   */
  async convertToPodcastScript(options) {
    const { text, title = '', style = 'conversational' } = options;
    
    this.logStep(1, 'Starting blog to podcast conversion process');
    
    if (!text) {
      throw new Error('Text is required for conversion');
    }
    
    this.logStep(2, 'Validating parameters', { 
      textLength: text.length,
      hasTitle: !!title,
      style
    });
    
    // Prepare the system message based on the style
    let systemMessage = `You are an expert podcast script writer. Convert the provided blog text into a concise, natural-sounding one-person podcast script that is UNDER 3000 CHARACTERS in length.`;
    
    // Add style guidance
    switch (style.toLowerCase()) {
      case 'professional':
        systemMessage += ` Use a professional, authoritative tone suitable for a business or educational podcast.`;
        break;
      case 'casual':
        systemMessage += ` Use a casual, friendly tone with occasional humor and a conversational style.`;
        break;
      case 'storytelling':
        systemMessage += ` Frame the content as a compelling story with narrative elements and emotional hooks.`;
        break;
      default: // conversational is the default
        systemMessage += ` Use a natural, conversational tone that sounds like someone talking to a friend.`;
    }
    
    // Add instructions for pauses
    systemMessage += `\n\nInclude natural pauses and breaks in the script using the following notation:
    - [pause-short] for brief pauses (about 1 second)
    
    Place these pauses at natural points like:
    - Between topic transitions
    - After important points that need to sink in
    - Before introducing new concepts
    - When switching between explanation and examples
    
    Format the script to be easily readable with paragraphs and sections.`;
    
    this.logStep(3, 'Preparing API request', {
      model: this.model,
      systemMessageLength: systemMessage.length
    });
    
    // Prepare the messages array
    const messages = [
      {
        role: 'system',
        content: systemMessage
      },
      {
        role: 'user',
        content: title 
          ? `Convert this blog titled "${title}" into a concise podcast script that is STRICTLY UNDER 3000 CHARACTERS in length. Focus on the most important points. The script MUST be under 3000 characters:\n\n${text}`
          : `Convert this blog text into a concise podcast script that is STRICTLY UNDER 3000 CHARACTERS in length. Focus on the most important points. The script MUST be under 3000 characters:\n\n${text}`
      }
    ];
    
    // Add a timeout to the fetch request
    this.logStep(4, 'Setting up request timeout (60 seconds)');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    try {
      this.logStep(5, 'Sending API request to ChatGPT');
      console.time('[ChatGPTAPI] API Request Time');
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          temperature: 0.5, // Lower temperature for more focused, concise output
          max_tokens: 2000, // Limit the tokens to encourage brevity
          top_p: 1,
          frequency_penalty: 0.3, // Higher penalty for repetition to encourage conciseness
          presence_penalty: 0.2 // Higher presence penalty to discourage going on tangents
        }),
        signal: controller.signal
      });
      
      console.timeEnd('[ChatGPTAPI] API Request Time');
      this.logStep(6, 'API response received', { 
        status: response.status, 
        statusText: response.statusText,
        ok: response.ok
      });
      
      // Clear the timeout since the request completed
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        this.logStep(7, 'API returned error response', { 
          status: response.status, 
          statusText: response.statusText 
        });
        
        const errorText = await response.text();
        let errorData = {};
        
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { rawError: errorText };
        }
        
        console.error('[ChatGPTAPI] API ERROR', { 
          status: response.status, 
          statusText: response.statusText,
          errorData
        });
        
        throw new Error(`ChatGPT API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }
      
      this.logStep(7, 'Reading successful response body');
      const result = await response.json();
      
      this.logStep(8, 'API response parsed', {
        choices: result.choices ? result.choices.length : 0,
        usage: result.usage
      });
      
      if (!result.choices || result.choices.length === 0) {
        throw new Error('No response content returned from API');
      }
      
      let scriptContent = result.choices[0].message.content.trim();
      
      // Verify the script is under 3000 characters
      if (scriptContent.length > 3000) {
        this.logStep('8a', 'Script exceeds 3000 characters - truncating', {
          originalLength: scriptContent.length
        });
        
        // Find a good breakpoint near 3000 characters (end of paragraph or sentence)
        let breakPoint = scriptContent.lastIndexOf('\n\n', 2900);
        if (breakPoint === -1 || breakPoint < 2500) {
          // If no paragraph break found, try to find a sentence end
          breakPoint = scriptContent.lastIndexOf('. ', 2900);
          if (breakPoint !== -1) breakPoint += 1; // Include the period
        }
        
        // If still no good breakpoint, just truncate at 2900 to be safe
        if (breakPoint === -1 || breakPoint < 2500) {
          breakPoint = 2900;
        }
        
        // Truncate the script
        scriptContent = scriptContent.substring(0, breakPoint) + '\n\n[Note: Script truncated to fit within 3000 character limit]';
      }
      
      this.logStep(9, 'Script conversion complete', {
        scriptLength: scriptContent.length,
        usageTokens: result.usage ? result.usage.total_tokens : 'unknown',
        isUnder3000: scriptContent.length <= 3000
      });
      
      return scriptContent;
      
    } catch (error) {
      if (error.name === 'AbortError') {
        this.logStep('ERROR', 'API request timed out after 60 seconds');
        console.error('[ChatGPTAPI] Request Timeout', { timeout: '60 seconds' });
        throw new Error('ChatGPT API request timed out after 60 seconds');
      }
      
      console.error('[ChatGPTAPI] Unexpected Error', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Set the model to use for API requests
   * @param {string} model - Model name (e.g., 'gpt-3.5-turbo', 'gpt-4')
   */
  setModel(model) {
    this.model = model;
    this.log(`Model set to: ${model}`);
  }
}

// Make the class available for import
if (typeof module !== 'undefined') {
  module.exports = { ChatGPTAPI };
}
