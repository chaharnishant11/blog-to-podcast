# Blog-to-Podcast Chrome Extension — Roadmap

This document breaks the build into small, AI-friendly milestones.
Each milestone ends with a **Task List** your AI agent can execute.

---

## 0️⃣ Prep / Ground Rules (½ day)

| What                             | Why / Details                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------ |
| **Get a Murf API key**           | All requests need the `api-key` header.                                        |
| **Set plan limits**              | Free tier: 5 concurrent jobs, 1 000 RPM. Paid tier: 15 concurrent, 10 000 RPM. |
| **Choose default voice & style** | Call `GET /v1/speech/voices` to show the list in **Options** page.             |
| **Decide max chunk size**        | \~3 000 characters per chunk keeps latency low and simplifies retries.         |

---

## 1️⃣ Extension Skeleton (1 day)

**Key files**

```
/manifest.json        (MV3)
/service-worker.js
/popup.html + popup.js
/options.html         (voice, style, chunk size)
/content-script.js    (extract article text)
```

**`manifest.json` essentials**

```jsonc
{
  "manifest_version": 3,
  "name": "Blog-to-Podcast",
  "version": "0.1.0",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["https://*/*", "http://*/*"],
  "background": { "service_worker": "service-worker.js" },
  "action": { "default_popup": "popup.html" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content-script.js"],
    "run_at": "document_idle"
  }]
}
```

### Task List

* [ ] Generate the skeleton above.
* [ ] Add a dev build script (`npm run watch` using *web-ext* or *crxjs*).

---

## 2️⃣ Content Extraction (1 day)

1. In **`content-script.js`** load *Mozilla Readability* (or *Mercury Parser*), extract `document.title` and clean article text.
2. Send the text to the background:

   ```js
   chrome.runtime.sendMessage({ type: "ARTICLE_TEXT", text });
   ```

### Task List

* [ ] Integrate Readability as an ES module.
* [ ] Implement message relay; test on Medium, Substack, and pay‑walled NYTimes (fallback to `window.getSelection()`).

---

## 3️⃣ Murf Integration Layer (2 days)

### 3.1 Voice discovery

```js
async function listVoices() {
  const res = await fetch("https://api.murf.ai/v1/speech/voices", {
    headers: { "api-key": API_KEY }
  });
  return res.json(); // cache with chrome.storage
}
```

### 3.2 Synthesize wrapper

```js
async function synth(text, voiceId, style) {
  const body = { text, voiceId, style, format: "MP3", modelVersion: "GEN2" };
  const res = await fetch("https://api.murf.ai/v1/speech/generate", {
    method: "POST",
    headers: {
      "api-key": API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const { audioFile } = await res.json();  // returns MP3 URL
  return audioFile;
}
```

### 3.3 Chunking & Parallelism

* Split text into ≤3 000‑char chunks.
* Run up to **N = min(3, planConcurrency – 1)** parallel jobs.
* Concatenate MP3s with the Web Audio API or stream sequentially.

### Task List

* [ ] `splitIntoChunks(text, 3000)`.
* [ ] Background queue with concurrency gate (= 5 for free plan).
* [ ] Progressive playback: play first chunk as soon as it’s ready.

---

## 4️⃣ UI — Popup Player (1 day)

```
┌─────────────────────────────┐
│  ▶︎  ‖   progress bar  03:21│
│  Voice: Ken (Convers.)  ⬇︎ │
│  Speed: 1.0×   Chunk: 3 k   │
│  ⬇︎ Download MP3            │
└─────────────────────────────┘
```

*HTML5 `<audio>` element; update `src` when each chunk completes.*

### Task List

* [ ] Build popup (React / Vue / plain HTML + Tailwind).
* [ ] Connect to background (`chrome.runtime.sendMessage({ type: "PLAY" })`).
* [ ] Implement play/pause, scrub, **Download all** (zip blobs with JSZip).

---

## 5️⃣ Persistence & Offline (½ day)

| Need                            | Solution                                       |
| ------------------------------- | ---------------------------------------------- |
| **Cache converted posts**       | IndexedDB via `idb-keyval`; key = URL + voice. |
| **Store API key & preferences** | `chrome.storage.sync` (encrypt API key).       |

### Task List

* [ ] `getPref/setPref` wrapper.
* [ ] “Clear cache” button in **Options**.

---

## 6️⃣ Service‑Worker Lifetime (½ day)

Chrome MV3 workers stop after ≈30 s idle.
Use a keep‑alive ping only while the queue is non‑empty.

### Task List

* [ ] Implement keep‑alive ping.
* [ ] Log shutdown events for debugging.

---

## 7️⃣ Packaging & QA (1 day)

1. **CSP** — add

   ```jsonc
   "content_security_policy": {
     "extension_pages": "script-src 'self'; object-src 'self'"
   }
   ```
2. Icons 16/32/48/128 px.
3. Privacy policy: text sent to Murf; no personal data stored.
4. Test matrix: Win/Mac/Linux + Chrome Stable/Beta; 10 popular sites (AMP & non‑AMP).
5. Lint + bundle size (< 2 MB zipped).

### Task List

* [ ] Automate `npm run zip`.
* [ ] Write `README.md` + GIF demo.

---

## 8️⃣ Future Enhancements

* Streaming endpoint (`/v1/speech/stream`) for near‑instant playback.
* Auto language detection & voice switching.
* GPT‑powered summarisation before TTS.
* One‑click publish to RSS / Podbean.

---

## 📦 Deliverables Checklist

1. **Repo scaffold** with MV3 manifest.
2. **`murf.js` SDK wrapper** (list voices, generate, stream).
3. **Content extraction module** (Readability).
4. **Background queue & chunker** with concurrency control.
5. **Popup player UI**.
6. **Build/zip script, docs, automated tests**.
