// Content script for Blog-to-Podcast extension
// This script extracts article text from web pages using Mozilla's Readability library

// State
let articleText = null;
let articleTitle = null;

// Process content to handle CORS issues with images
function processCORSSafeContent(htmlContent) {
  try {
    // Create a temporary div to manipulate the content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Remove all images to avoid CORS issues
    const images = tempDiv.querySelectorAll('img');
    images.forEach(img => {
      // Replace with alt text if available
      if (img.alt) {
        const altText = document.createElement('span');
        altText.textContent = `[Image: ${img.alt}]`;
        img.parentNode.replaceChild(altText, img);
      } else {
        // Just remove the image if no alt text
        img.parentNode.removeChild(img);
      }
    });
    
    // Also handle other potential CORS issues (iframes, videos, etc.)
    const iframes = tempDiv.querySelectorAll('iframe');
    iframes.forEach(iframe => iframe.parentNode.removeChild(iframe));
    
    const videos = tempDiv.querySelectorAll('video');
    videos.forEach(video => video.parentNode.removeChild(video));
    
    return tempDiv.innerHTML;
  } catch (error) {
    console.error('Error processing CORS-safe content:', error);
    return htmlContent; // Return original content if processing fails
  }
}

// Load Readability library using chrome.scripting API to bypass CSP restrictions
async function loadReadability() {
  return new Promise((resolve, reject) => {
    try {
      // First check if Readability is already available in the page context
      // This check will likely fail in the content script context due to isolation
      if (typeof window.Readability !== 'undefined') {
        console.log('Readability already available in window');
        return resolve(window.Readability);
      }
      
      // Since we can't inject scripts directly due to CSP, we'll use a different approach
      // We'll extract the content ourselves without relying on Readability in the page context
      
      console.log('Using direct DOM extraction instead of Readability');
      
      // Create a pseudo-Readability object that mimics the API but uses our own extraction
      const PseudoReadability = function(doc) {
        this.doc = doc;
      };
      
      // Add a parse method that extracts content using our own logic
      PseudoReadability.prototype.parse = function() {
        try {
          // Find the article container
          const articleContainer = findArticleContainer(this.doc);
          
          if (!articleContainer) {
            console.warn('No article container found');
            return null;
          }
          
          // Get the title
          const title = this.doc.querySelector('h1')?.textContent || 
                        this.doc.querySelector('title')?.textContent || 
                        document.title;
          
          // Get the content
          const content = articleContainer.innerHTML;
          
          // Get the text content
          const textContent = cleanText(articleContainer.textContent);
          
          // Create a result object similar to what Readability would return
          return {
            title: title,
            content: content,
            textContent: textContent,
            excerpt: textContent.substring(0, 150) + '...'
          };
        } catch (error) {
          console.error('Error in PseudoReadability.parse:', error);
          return null;
        }
      };
      
      // Return our pseudo-Readability implementation
      resolve(PseudoReadability);
    } catch (error) {
      console.error('Error in loadReadability:', error);
      reject(error);
    }
  });
}

// Find the common ancestor of multiple elements
function findCommonAncestor(elements) {
  if (!elements.length) return null;
  if (elements.length === 1) return elements[0].parentElement;
  
  let ancestor = elements[0].parentElement;
  
  while (ancestor && !elements.every(el => ancestor.contains(el))) {
    ancestor = ancestor.parentElement;
  }
  
  return ancestor;
}

// Find the most likely article container using heuristics
function findArticleContainer() {
  // Common article container selectors - expanded for better coverage
  const selectors = [
    'article',
    '[role="article"]',
    '.post-content',
    '.article-content',
    '.post-body',
    '.entry-content',
    '.content-body',
    '#content',
    '.content',
    '.post',
    '.article',
    'main',
    '.cpt-bodycopy',
    '.cb27-blog-content',
    '.cb27w1',
    '.rw-blog-post',
    '.blog-post',
    '.blog-detail',
    '.blog-entry',
    '.blog-container',
    '.blog-article',
    '.blog-body',
    '.post-text',
    '.post-entry',
    '.entry',
    '.blog-entry-content',
    '.blog-text',
    '.story-content',
    '.article-text',
    '.main-content',
    '.page-content',
    '.single-content'
  ];
  
  // Try each selector
  for (const selector of selectors) {
    // Try both querySelector and querySelectorAll since some blogs might have multiple matching elements
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 500) {
      return element;
    }
    
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      // Find the element with the most text content
      let bestElement = null;
      let maxLength = 0;
      
      elements.forEach(el => {
        const text = el.innerText;
        if (text.length > maxLength) {
          maxLength = text.length;
          bestElement = el;
        }
      });
      
      if (bestElement && maxLength > 500) {
        return bestElement;
      }
    }
  }
  
  // If no selector matches, try to find the element with the most text
  const paragraphs = document.querySelectorAll('p');
  if (paragraphs.length > 5) {
    // Find the common ancestor of paragraphs
    const commonAncestor = findCommonAncestor(Array.from(paragraphs).slice(0, 5));
    if (commonAncestor && commonAncestor.innerText.length > 1000) {
      return commonAncestor;
    }
  }
  
  return null;
}

// Clean text by removing extra whitespace and unwanted characters
function cleanText(text) {
  if (!text) return '';
  
  // Replace multiple newlines with a single one
  let cleaned = text.replace(/[\r\n]+/g, '\n');
  
  // Replace multiple spaces with a single one
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Trim whitespace
  cleaned = cleaned.trim();
  
  return cleaned;
}

// Check if there's an article on this page
function checkForArticle() {
  // Check if the page has a significant amount of text
  const bodyText = document.body.innerText;
  return bodyText.length > 1000;
}

// Helper function to send article to service worker
function sendArticleToServiceWorker(text, title, url, extractionMethod) {
  console.log('Sending article to service worker', {
    title,
    url,
    textLength: text.length,
    extractionMethod
  });
  
  chrome.runtime.sendMessage({
    type: 'ARTICLE_TEXT',
    text: text,
    title: title,
    url: url,
    extractionMethod: extractionMethod
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending article to service worker:', chrome.runtime.lastError);
    } else {
      console.log('Service worker response:', response);
    }
  });
  
  console.log('Article sent to service worker, waiting for processing...');
}

// Extract article text using multiple fallback methods
async function extractArticle() {
  console.log('Extracting article text');
  let extractionMethod = 'unknown';
  
  try {
    // Method 1: Try to find article content using common selectors
    console.log('Using extraction method 1: Common selectors');
    try {
      // Special case for Oracle blogs
      let element = null;
      
      if (window.location.href.includes('blogs.oracle.com')) {
        console.log('Oracle blog detected, using specific selectors');
        // Try Oracle blog specific selectors - expanded for better coverage
        const oracleSelectors = [
          '.cw22-content',
          '.cw22-blog-post-content', 
          '.blog-post-content', 
          '.blog-content', 
          '.cpt-bodycopy',
          '.cb27-blog-content',
          '.cb27w1',
          '.rw-blog-post',
          '.blog-post',
          '.blog-detail',
          '.blog-entry',
          '.blog-container',
          '.blog-article',
          '.blog-body',
          '.post-content',
          '.post-body',
          'article'
        ];
        
        // Try each Oracle-specific selector
        for (const selector of oracleSelectors) {
          const found = document.querySelector(selector);
          if (found && found.textContent && found.textContent.length > 500) {
            console.log(`Found Oracle blog content using selector: ${selector}`);
            element = found;
            break;
          }
        }
        
        // If still not found, try to find content in iframes (Oracle blogs sometimes use iframes)
        if (!element) {
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
              if (iframeDoc && iframeDoc.body && iframeDoc.body.textContent.length > 500) {
                console.log('Found content in iframe');
                element = iframeDoc.body;
                break;
              }
            } catch (e) {
              // Cross-origin iframe access will fail, which is expected
              console.log('Could not access iframe content (likely cross-origin)');
            }
          }
        }
      }
      
      // If no Oracle-specific content found, try the general approach
      if (!element) {
        element = findArticleContainer();
      }
      
      if (element && element.textContent && element.textContent.length > 500) {
        articleText = cleanText(element.textContent);
        articleTitle = document.title;
        extractionMethod = 'common-selectors';
        
        console.log('Extracted article using common selectors', {
          title: articleTitle,
          textLength: articleText.length,
          excerpt: articleText.substring(0, 150) + '...'
        });
        
        // Success - send the article text to the service worker
        sendArticleToServiceWorker(articleText, articleTitle, window.location.href, extractionMethod);
        return;
      } else {
        console.warn('No content found with common selectors or content too short');
        throw new Error('No content found with common selectors');
      }
    } catch (selectorError) {
      console.error('Selector-based extraction failed, trying next method', selectorError);
    }
    
    // Method 2: Try to find the common ancestor of paragraphs
    console.log('Using extraction method 2: Common ancestor');
    try {
      const paragraphs = document.querySelectorAll('p');
      if (paragraphs.length > 5) {
        // Find the common ancestor of paragraphs
        const commonAncestor = findCommonAncestor(Array.from(paragraphs).slice(0, 10));
        
        if (commonAncestor && commonAncestor.textContent && commonAncestor.textContent.length > 1000) {
          articleText = cleanText(commonAncestor.textContent);
          articleTitle = document.title;
          extractionMethod = 'common-ancestor';
          
          console.log('Extracted article using common ancestor', {
            title: articleTitle,
            textLength: articleText.length,
            excerpt: articleText.substring(0, 150) + '...'
          });
          
          // Success - send the article text to the service worker
          sendArticleToServiceWorker(articleText, articleTitle, window.location.href, extractionMethod);
          return;
        } else {
          console.warn('Common ancestor not found or content too short');
          throw new Error('Common ancestor extraction failed');
        }
      } else {
        console.warn('Not enough paragraphs for common ancestor method');
        throw new Error('Not enough paragraphs');
      }
    } catch (ancestorError) {
      console.error('Common ancestor extraction failed, trying next method', ancestorError);
    }
    
    // Method 3: Try to extract content from specific elements
    console.log('Using extraction method 3: Specific elements');
    try {
      // Try to find content in specific elements that might contain the article
      // Expanded selector list for better coverage of different blog platforms
      const contentElements = document.querySelectorAll(
        'article, .post-content, .entry-content, .content, main, [role="main"], ' +
        '.blog-post, .post-body, .story-body, .article-body, .article-content, ' +
        '.post-text, .post-entry, .entry, .blog-entry-content, .blog-text, ' +
        '.story-content, .article-text, .content-body, .main-content, ' +
        '.page-content, .single-content, .cpt-bodycopy, .cb27-blog-content, ' +
        '.cb27w1, .rw-blog-post, .blog-detail, .blog-container, .blog-article, ' +
        '.blog-body, .post, .article'
      );
      
      if (contentElements.length > 0) {
        // Find the element with the most text content
        let bestElement = null;
        let maxLength = 0;
        
        contentElements.forEach(el => {
          const text = cleanText(el.innerText);
          if (text.length > maxLength) {
            maxLength = text.length;
            bestElement = el;
          }
        });
        
        if (bestElement && maxLength > 500) {
          articleText = cleanText(bestElement.innerText);
          articleTitle = document.title;
          extractionMethod = 'specific-elements';
          console.log('Extracted article using specific elements', {
            title: articleTitle,
            textLength: articleText.length,
            excerpt: articleText.substring(0, 150) + '...'
          });
          
          // Success - send the article text to the service worker
          sendArticleToServiceWorker(articleText, articleTitle, window.location.href, extractionMethod);
          return;
        }
      }
      
      // Method 3.5: Try to find all paragraphs and combine them
      console.log('Using extraction method 3.5: Paragraph collection');
      const paragraphs = document.querySelectorAll('p');
      if (paragraphs.length > 5) {
        let combinedText = '';
        paragraphs.forEach(p => {
          // Only include paragraphs that are likely part of the main content
          // (exclude navigation, headers, footers, etc.)
          const text = p.innerText.trim();
          if (text.length > 20 && text.split(' ').length > 5) {
            combinedText += text + '\n\n';
          }
        });
        
        if (combinedText.length > 500) {
          articleText = cleanText(combinedText);
          articleTitle = document.title;
          extractionMethod = 'paragraph-collection';
          console.log('Extracted article by collecting paragraphs', {
            title: articleTitle,
            textLength: articleText.length,
            excerpt: articleText.substring(0, 150) + '...'
          });
          
          // Success - send the article text to the service worker
          sendArticleToServiceWorker(articleText, articleTitle, window.location.href, extractionMethod);
          return;
        }
      }
      
      // Method 4: Fallback to body text
      console.log('Using extraction method 4: Body text');
      articleText = cleanText(document.body.innerText);
      articleTitle = document.title;
      extractionMethod = 'body-text';
      console.log('Extracted article using body text', {
        title: articleTitle,
        textLength: articleText.length,
        excerpt: articleText.substring(0, 150) + '...'
      });
      
      // Success - send the article text to the service worker
      sendArticleToServiceWorker(articleText, articleTitle, window.location.href, extractionMethod);
      return;
    } catch (fallbackError) {
      console.error('Fallback extraction methods failed', fallbackError);
      throw new Error('All extraction methods failed');
    }
  } catch (error) {
    console.error('All extraction methods failed', error);
    // Notify the user that extraction failed
    alert('Failed to extract article content. Please try a different page.');
  }
  
  console.log('Article extraction complete');
}

// Initialize content script
(function() {
  console.log('Blog-to-Podcast content script initialized');
  
  // Check if the page has an article
  if (checkForArticle()) {
    console.log('Article detected, extracting content...');
    // Extract article text
    extractArticle();
  } else {
    console.log('No article detected on this page');
  }
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message', message.type);
    
    switch (message.type) {
      case 'CHECK_ARTICLE':
        // Check if there's an article on this page
        const hasArticle = checkForArticle();
        sendResponse({ hasArticle });
        break;
        
      case 'CONVERT_ARTICLE':
        // Extract and convert article
        extractArticle()
          .then(() => {
            console.log('Article extraction complete');
          })
          .catch(error => {
            console.error('Article extraction failed:', error);
            chrome.runtime.sendMessage({
              type: 'ERROR',
              error: error.message || 'Failed to extract article text'
            });
          });
        sendResponse({ status: 'extracting' });
        break;
        
      default:
        sendResponse({ status: 'unknown_command' });
    }
    
    // Return true to indicate we will send a response asynchronously
    return true;
  });
})();
