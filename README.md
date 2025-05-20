# Blog-to-Podcast Chrome Extension

A Chrome extension that converts blog articles to podcasts using Murf.ai's text-to-speech API. Listen to your favorite articles on the go!

## Features

- **Smart Content Extraction**: Automatically extracts article content from web pages using Mozilla's Readability
- **High-Quality Text-to-Speech**: Converts article text to natural-sounding speech using Murf.ai's API
- **Customizable Voices**: Choose from a variety of voices and styles
- **Chunk Navigation**: Navigate between different sections of the article
- **Playback Controls**: Adjust playback speed, pause/resume, and track progress
- **Offline Support**: Cache converted articles for offline listening
- **Background Processing**: Continue browsing while articles are processed
- **Debug Tools**: Comprehensive logging and debugging tools

## Installation

### From Source

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Build the extension:
   ```
   npm run build
   ```
4. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable Developer mode
   - Click "Load unpacked"
   - Select the `dist/blog-to-podcast` directory

### Troubleshooting Installation

If you encounter issues during installation:

1. Check the console for errors in the extension's service worker
   - Go to `chrome://extensions/`
   - Find the Blog-to-Podcast extension
   - Click on "service worker" link under Inspect views
   - Check the console for any error messages

2. Verify that all files were correctly built
   - The build script should create a `dist/blog-to-podcast` directory
   - This directory should contain all necessary files including readability.js

3. If you see CORS errors when making API calls
   - Make sure your Murf API key is valid
   - The extension includes a default API key for testing

### API Key Setup

1. Get a Murf.ai API key from the [Murf API Dashboard](https://murf.ai/api)
2. Open the extension options page
3. Enter your API key and select your preferred voice and style

## Usage

1. Navigate to any blog or article page
2. Click the Blog-to-Podcast extension icon in your browser toolbar
3. Click "Convert Article" to extract and convert the article
4. Once processing is complete, use the player controls to listen to the article
5. Use the chunk navigation to skip between different sections
6. Adjust playback speed as needed
7. Download the audio for offline listening

## Development

### Development Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run watch
```

### Building for Production

```bash
npm run build
```

This will create a zip file in the `dist` directory that can be uploaded to the Chrome Web Store.

### Project Structure

```
/package.json         (Dependencies and scripts)
/README.md            (Project documentation)
/build.js             (Build automation script)
/src/
  /manifest.json      (MV3 extension manifest)
  /service-worker.js  (Background worker)
  /murf-api.js        (Murf API integration)
  /popup.html         (Extension popup UI)
  /popup.js           (Popup functionality)
  /options.html       (Settings page)
  /options.js         (Settings functionality)
  /content-script.js  (Extract article text)
  /readability.js     (Mozilla Readability library)
  /debug.html         (Debug and monitoring page)
  /debug.js           (Debug functionality)
  /privacy_policy.html (Privacy policy)
  /icons/             (Extension icons)
```

## Debugging

The extension includes a debug page that provides insights into the service worker status, job queue, and logs. To access it:

1. Navigate to `chrome-extension://<extension-id>/debug.html` in your browser
2. View service worker status, logs, and cache information
3. Clear logs or cache as needed

## Future Enhancements

- Streaming API for near-instant playback
- Auto language detection and voice switching
- GPT-powered summarization before TTS
- One-click publishing to RSS feeds or podcast platforms
- Custom voice support
- Progressive Web App for mobile listening

## Privacy

This extension sends article text to Murf.ai for text-to-speech conversion. All data is stored locally in your browser. See the [Privacy Policy](src/privacy_policy.html) for more details.

## License

MIT

## Acknowledgements

- [Mozilla Readability](https://github.com/mozilla/readability) for article extraction
- [Murf.ai](https://murf.ai) for text-to-speech API
- [web-ext](https://github.com/mozilla/web-ext) for extension development tools
