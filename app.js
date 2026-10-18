/* ═══════════════════════════════════════════
   VOICEFLOW — Complete App Logic
   Uses Web Speech API (SpeechRecognition +
   SpeechSynthesis) — no dependencies needed
═══════════════════════════════════════════ */

// ── LANGUAGES ──────────────────────────────
const LANGUAGES = [
  { label: '🇺🇸 English', code: 'en-US' },
  { label: '🇬🇧 English UK', code: 'en-GB' },
  { label: '🇮🇳 Hindi', code: 'hi-IN' },
  { label: '🇮🇳 Marathi', code: 'mr-IN' },
  { label: '🇪🇸 Spanish', code: 'es-ES' },
  { label: '🇫🇷 French', code: 'fr-FR' },
];

let sttLang = 'en-US';
let ttsLang = 'en-US';

function buildLangChips(containerId, currentLang, setter) {
  const el = document.getElementById(containerId);
  el.innerHTML = LANGUAGES.map(l =>
    `<button class="lang-chip ${l.code === currentLang ? 'active' : ''}"
      onclick="selectLang('${containerId}','${l.code}')">${l.label}</button>`
  ).join('');
}

function selectLang(containerId, code) {
  if (containerId === 'stt-lang-chips') { sttLang = code; buildLangChips('stt-lang-chips', code, null); }
  else { ttsLang = code; buildLangChips('tts-lang-chips', code, null); populateVoices(); }
  toast('Language set to ' + LANGUAGES.find(l => l.code === code).label, 'info');
}

// ── THEME ───────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const dark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('themeBtn').textContent = dark ? '☀️' : '🌙';
  localStorage.setItem('vf-theme', dark ? 'light' : 'dark');
}
(function initTheme() {
  const t = localStorage.getItem('vf-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('themeBtn').textContent = t === 'dark' ? '🌙' : '☀️';
})();

// ── TAB SWITCHING ───────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'history') renderHistory();
  if (tab === 'stt') buildLangChips('stt-lang-chips', sttLang, null);
  if (tab === 'tts') { buildLangChips('tts-lang-chips', ttsLang, null); populateVoices(); }
}

// ── TOAST ───────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span> ${msg}`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ── HISTORY ─────────────────────────────────
function getHistory() { try { return JSON.parse(localStorage.getItem('vf-history') || '[]'); } catch { return []; } }
function saveHistory(h) { try { localStorage.setItem('vf-history', JSON.stringify(h.slice(0, 50))); } catch {} }
function addHistory(type, text) {
  if (!text.trim()) return;
  const h = getHistory();
  h.unshift({ type, text: text.trim(), time: new Date().toLocaleString() });
  saveHistory(h);
}
function renderHistory() {
  const h = getHistory();
  const el = document.getElementById('history-list');
  if (!h.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No history yet. Try speaking or converting some text!</p></div>'; return; }
  el.innerHTML = h.map((item, i) => `
    <div class="history-item">
      <span class="history-type type-${item.type}">${item.type === 'stt' ? '🎤 STT' : '🔊 TTS'}</span>
      <div class="history-content">
        <div class="history-text">${escHtml(item.text)}</div>
        <div class="history-meta">${item.time}</div>
      </div>
      <div class="history-actions">
        <button class="icon-btn" title="Copy" onclick="copyHistory(${i})">📋</button>
        <button class="icon-btn" title="Use in TTS" onclick="useInTTS(getHistory()[${i}].text)">🔊</button>
        <button class="icon-btn" title="Delete" onclick="deleteHistoryItem(${i})">🗑</button>
      </div>
    </div>`).join('');
}
function copyHistory(i) { const it = getHistory()[i]; if (it) copyText(it.text); }
function deleteHistoryItem(i) { const h = getHistory(); h.splice(i, 1); saveHistory(h); renderHistory(); }
function clearHistory() { if (confirm('Clear all history?')) { localStorage.removeItem('vf-history'); renderHistory(); toast('History cleared', 'success'); } }
function useInTTS(text) { document.getElementById('tts-input').value = text; switchTab('tts'); updateTTSCount(); toast('Text loaded into TTS', 'success'); }
function escHtml(t) { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(t) { return t.replace(/'/g,'&#39;').replace(/"/g,'&quot;').replace(/\n/g,' '); }

// ── COPY / DOWNLOAD ─────────────────────────
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast('Copied!', 'success')).catch(() => toast('Copy failed', 'error'));
}
function copyTranscript() {
  const text = getTranscriptText();
  if (!text) { toast('Nothing to copy', 'error'); return; }
  copyText(text);
}
function downloadTranscript() {
  const text = getTranscriptText();
  if (!text) { toast('Nothing to download', 'error'); return; }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: 'transcript-' + Date.now() + '.txt' });
  a.click(); toast('Downloaded!', 'success');
}

// ── STT ──────────────────────────────────────
let recognition = null;
let sttRunning = false;
let sttPaused = false;
let finalText = '';
let interimText = '';

function getTranscriptText() { return finalText + interimText; }

function updateSTTCount(text) {
  document.getElementById('wordCount').textContent = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('charCount').textContent = text.length;
}

// SpeechRecognition is accessed safely via HAS_STT guard in startSTT()

function startSTT() {
  if (!HAS_STT) { toast('Speech Recognition not supported. Try Chrome or Edge on HTTPS.', 'error'); return; }
  if (sttRunning) return;

  finalText = '';
  interimText = '';
  renderTranscript();

  const SafeRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SafeRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = sttLang;

  recognition.onstart = () => {
    sttRunning = true; sttPaused = false;
    setSTTStatus('recording');
    document.getElementById('stt-start').disabled = true;
    document.getElementById('stt-pause').disabled = false;
    document.getElementById('stt-stop').disabled = false;
    document.getElementById('sttWave').classList.add('active');
  };

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i].transcript;
      if (e.results[i].isFinal) finalText += t + ' ';
      else interim += t;
    }
    interimText = interim;
    renderTranscript();
    updateSTTCount(finalText + interimText);
  };

  recognition.onend = () => {
    if (sttRunning && !sttPaused) {
      // auto restart for continuous recording
      try { recognition.start(); } catch {}
    }
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      toast('Microphone access denied', 'error');
      sttRunning = false;
      setSTTStatus('idle');
      document.getElementById('stt-start').disabled = false;
      document.getElementById('stt-pause').disabled = true;
      document.getElementById('stt-stop').disabled = true;
      document.getElementById('sttWave').classList.remove('active');
    } else if (e.error !== 'aborted' && e.error !== 'no-speech') {
      toast('Recognition error: ' + e.error, 'error');
    }
  };

  recognition.start();
}

function pauseSTT() {
  if (!sttRunning) return;
  if (!sttPaused) {
    sttPaused = true;
    recognition.stop();
    setSTTStatus('idle');
    document.getElementById('stt-pause').textContent = '▶ Resume';
    document.getElementById('sttWave').classList.remove('active');
    toast('Recording paused', 'info');
  } else {
    sttPaused = false;
    recognition.start();
    setSTTStatus('recording');
    document.getElementById('stt-pause').textContent = '⏸ Pause';
    document.getElementById('sttWave').classList.add('active');
    toast('Recording resumed', 'info');
  }
}

function stopSTT() {
  if (!sttRunning) return;
  sttRunning = false; sttPaused = false;
  recognition.stop();
  setSTTStatus('idle');
  document.getElementById('stt-start').disabled = false;
  document.getElementById('stt-pause').disabled = true;
  document.getElementById('stt-pause').textContent = '⏸ Pause';
  document.getElementById('stt-stop').disabled = true;
  document.getElementById('sttWave').classList.remove('active');
  if (finalText.trim()) {
    addHistory('stt', finalText.trim());
    toast('Recording saved to history', 'success');
  }
}

function clearSTT() {
  if (sttRunning) stopSTT();
  finalText = ''; interimText = '';
  renderTranscript();
  updateSTTCount('');
}

function renderTranscript() {
  const box = document.getElementById('stt-transcript');
  if (!finalText && !interimText) {
    box.innerHTML = '<span class="transcript-placeholder">Your transcribed text will appear here as you speak…</span>';
  } else {
    box.innerHTML = escHtml(finalText) + (interimText ? `<span class="interim">${escHtml(interimText)}</span>` : '');
    box.scrollTop = box.scrollHeight;
  }
}

function setSTTStatus(state) {
  const el = document.getElementById('stt-status');
  el.className = 'status-badge status-' + (state === 'recording' ? 'recording' : 'idle');
  el.innerHTML = `<span class="status-dot"></span> ${state === 'recording' ? 'Recording…' : 'Idle'}`;
}

// ── TTS ──────────────────────────────────────
let ttsUtterance = null;
let ttsSpeaking = false;
let ttsPaused = false;
let ttsProgressInterval = null;
let ttsStartTime = 0;
let ttsDuration = 0;

function populateVoices() {
  const voices = synth.getVoices();
  const sel = document.getElementById('voice-select');
  const lang = ttsLang.split('-')[0];
  sel.innerHTML = '';
  const filtered = voices.filter(v => v.lang.startsWith(lang));
  const toShow = filtered.length ? filtered : voices.slice(0, 20);
  toShow.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${v.name} (${v.lang})`;
    opt.dataset.idx = voices.indexOf(v);
    sel.appendChild(opt);
  });
  if (!sel.options.length) {
    const opt = document.createElement('option'); opt.textContent = 'Default System Voice'; sel.appendChild(opt);
  }
  onVoiceChange();
}

function onVoiceChange() {
  const sel = document.getElementById('voice-select');
  const opt = sel.options[sel.selectedIndex];
  document.getElementById('voiceName').textContent = opt ? opt.textContent.split('(')[0].trim().slice(0,18) : 'Default';
}

function getSelectedVoice() {
  const voices = synth.getVoices();
  const sel = document.getElementById('voice-select');
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return null;
  const idx = parseInt(opt.dataset.idx);
  return isNaN(idx) ? null : voices[idx];
}

function updateSlider(id, displayId, fmt) {
  const val = document.getElementById(id).value;
  document.getElementById(displayId).textContent = fmt(parseFloat(val).toFixed(1));
}

// ── TTS CHUNK ENGINE ─────────────────────────
// Android TTS fails on large text; split into ~180-char sentence chunks
let ttsChunks = [];
let ttsChunkIdx = 0;
let ttsKeepAlive = null;
let ttsFullText = '';

function splitIntoChunks(text) {
  // Split on paragraphs first, then sentences, then commas/clauses
  // 300 chars per chunk — safe on all Android/iOS/desktop engines
  var MAX = 300;
  var chunks = [];

  // Step 1: split by paragraph breaks
  var paras = text.split(/\n{1,}/);

  for (var p = 0; p < paras.length; p++) {
    var para = paras[p].trim();
    if (!para) continue;

    if (para.length <= MAX) {
      chunks.push(para);
      continue;
    }

    // Step 2: split by sentence endings
    var sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
    var bucket = '';
    for (var s = 0; s < sentences.length; s++) {
      var sent = sentences[s];
      if ((bucket + sent).length <= MAX) {
        bucket += sent;
      } else {
        if (bucket.trim()) chunks.push(bucket.trim());
        bucket = sent;
        // Step 3: if single sentence still too long, split on commas/semicolons
        while (bucket.length > MAX) {
          var cut = bucket.lastIndexOf(',', MAX);
          if (cut < 10) cut = bucket.lastIndexOf(' ', MAX);
          if (cut < 10) cut = MAX;
          chunks.push(bucket.slice(0, cut).trim());
          bucket = bucket.slice(cut).replace(/^[,;\s]+/, '');
        }
      }
    }
    if (bucket.trim()) chunks.push(bucket.trim());
  }

  return chunks.filter(function(ch) { return ch.length > 0; });
}

function speakChunk(idx) {
  if (!ttsSpeaking) return;
  if (idx >= ttsChunks.length) {
    clearInterval(ttsKeepAlive);
    onTTSEnd();
    addHistory('tts', ttsFullText);
    return;
  }
  var chunk = ttsChunks[idx];
  ttsUtterance = new SpeechSynthesisUtterance(chunk);
  var voice = getSelectedVoice();
  // Only assign voice if lang matches — mismatched voice = synthesis-failed on Android
  if (voice && voice.lang.startsWith(ttsLang.split('-')[0])) {
    ttsUtterance.voice = voice;
  }
  ttsUtterance.rate   = parseFloat(document.getElementById('speed').value);
  ttsUtterance.pitch  = parseFloat(document.getElementById('pitch').value);
  ttsUtterance.volume = parseFloat(document.getElementById('volume').value);
  ttsUtterance.lang   = ttsLang;

  ttsUtterance.onend = function() {
    ttsChunkIdx++;
    var pct = Math.round((ttsChunkIdx / ttsChunks.length) * 100);
    document.getElementById('tts-progress').style.width = pct + '%';
    speakChunk(ttsChunkIdx);
  };
  ttsUtterance.onerror = function(e) {
    if (e.error !== 'interrupted' && e.error !== 'canceled') {
      toast('TTS error: ' + e.error, 'error');
    }
    clearInterval(ttsKeepAlive);
    onTTSEnd();
  };
  synth.speak(ttsUtterance);
}

function playTTS() {
  if (!HAS_TTS) { toast('TTS not supported — open the downloaded file in Chrome.', 'error'); return; }
  var text = document.getElementById('tts-input').value.trim();
  if (!text) { toast('Please enter some text first', 'error'); return; }

  // Resume from pause
  if (ttsPaused) {
    synth.resume();
    ttsPaused = false; ttsSpeaking = true;
    setTTSStatus('playing');
    document.getElementById('tts-play').disabled = true;
    document.getElementById('tts-pause-btn').disabled = false;
    document.getElementById('tts-pause-btn').textContent = '\u23f8 Pause';
    return;
  }

  synth.cancel();
  clearInterval(ttsKeepAlive);

  setTimeout(function() {
    ttsFullText  = text;
    ttsChunks    = splitIntoChunks(text);
    ttsChunkIdx  = 0;
    ttsSpeaking  = true;
    ttsPaused    = false;

    setTTSStatus('playing');
    document.getElementById('tts-play').disabled = true;
    document.getElementById('tts-pause-btn').disabled = false;
    document.getElementById('tts-stop-btn').disabled = false;
    document.getElementById('tts-progress').style.width = '0%';

    speakChunk(0);

    // Keepalive: some Android builds suspend speech after idle ticks
    ttsKeepAlive = setInterval(function() {
      if (!ttsSpeaking) { clearInterval(ttsKeepAlive); }
    }, 4000);
  }, 150);
}

function pauseTTS() {
  if (!ttsSpeaking && !ttsPaused) return;
  if (!ttsPaused) {
    synth.pause();
    ttsPaused = true; ttsSpeaking = false;
    setTTSStatus('idle');
    document.getElementById('tts-pause-btn').textContent = '▶ Resume';
  } else {
    synth.resume();
    ttsPaused = false; ttsSpeaking = true;
    setTTSStatus('playing');
    document.getElementById('tts-pause-btn').textContent = '⏸ Pause';
  }
}

function stopTTS() {
  clearInterval(ttsKeepAlive);
  ttsSpeaking = false;
  ttsChunks = []; ttsChunkIdx = 0;
  synth.cancel();
  onTTSEnd();
}

function onTTSEnd() {
  ttsSpeaking = false; ttsPaused = false;
  setTTSStatus('idle');
  document.getElementById('tts-play').disabled = false;
  document.getElementById('tts-pause-btn').disabled = true;
  document.getElementById('tts-pause-btn').textContent = '⏸ Pause';
  document.getElementById('tts-stop-btn').disabled = true;
  stopProgressBar();
  document.getElementById('tts-progress').style.width = '0';
}

function setTTSStatus(state) {
  const el = document.getElementById('tts-status');
  el.className = 'status-badge status-' + (state === 'playing' ? 'playing' : 'idle');
  el.innerHTML = `<span class="status-dot"></span> ${state === 'playing' ? 'Playing…' : 'Ready'}`;
}

function startProgressBar() {
  stopProgressBar();
  const bar = document.getElementById('tts-progress');
  ttsProgressInterval = setInterval(() => {
    const elapsed = Date.now() - ttsStartTime;
    const pct = Math.min(100, (elapsed / ttsDuration) * 100);
    bar.style.width = pct + '%';
    if (pct >= 100) stopProgressBar();
  }, 100);
}
function stopProgressBar() { clearInterval(ttsProgressInterval); }

function previewVoice() {
  if (!HAS_TTS) { toast('TTS not available in this environment', 'error'); return; }
  const text = 'Hello! This is a preview of the selected voice.';
  synth.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  const voice = getSelectedVoice();
  if (voice) utt.voice = voice;
  utt.rate = parseFloat(document.getElementById('speed').value);
  utt.pitch = parseFloat(document.getElementById('pitch').value);
  utt.volume = parseFloat(document.getElementById('volume').value);
  utt.lang = ttsLang;
  synth.speak(utt);
  toast('Previewing voice…', 'info');
}

// ── DOWNLOAD MODAL ───────────────────────────
// Browser SpeechSynthesis routes through the OS audio pipeline and
// intentionally bypasses Web Audio / MediaRecorder — there is no
// programmatic way to capture it as a file in any browser.
// We offer two practical options instead:
//   1. Download the text as .txt (open in any offline TTS tool)
//   2. Show a modal explaining how to record with free tools

function downloadAudio() {
  var text = document.getElementById('tts-input').value.trim();
  if (!text) { toast('No text to convert — type something first', 'error'); return; }
  showDownloadModal(text);
}

function showDownloadModal(text) {
  const existing = document.getElementById('dl-modal');
  if (existing) existing.remove();
  const box = 'background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:16px;margin-bottom:12px';
  const ttl = 'font-family:var(--font-display);font-weight:700;font-size:.9rem;margin-bottom:6px';
  const txt = 'font-size:.82rem;color:var(--muted);line-height:1.6;margin-bottom:12px';
  const modal = document.createElement('div');
  modal.id = 'dl-modal';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9998;backdrop-filter:blur(6px)" onclick="closeDownloadModal()"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;max-height:90vh;overflow-y:auto;
      background:var(--surface);border:1px solid var(--border-active);border-radius:var(--radius);
      padding:28px 28px 24px;max-width:460px;width:calc(100% - 40px);box-shadow:0 24px 80px rgba(0,0,0,.6)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <div style="font-family:var(--font-display);font-weight:700;font-size:1.1rem;display:flex;align-items:center;gap:9px">
          <span style="background:rgba(139,92,246,.2);border-radius:8px;padding:6px 8px">⬇</span> Download Audio
        </div>
        <button onclick="closeDownloadModal()" style="font-size:1.3rem;color:var(--muted);line-height:1">×</button>
      </div>
      <p style="font-size:.85rem;color:var(--muted);line-height:1.65;margin-bottom:20px">
        Browser TTS plays through your device's audio system and can't be captured as a file directly. Here are your options:
      </p>
      <div style="${box}">
        <div style="${ttl}">📄 Option 1 — Download as Text</div>
        <p style="${txt}">Download your text and open it in any offline TTS app (Balabolka, Natural Reader, etc.) to export as MP3.</p>
        <button class="btn btn-accent" style="width:100%;justify-content:center" onclick="doTextDownload()">⬇ Download .txt file</button>
      </div>
      <div style="${box}">
        <div style="${ttl}">🎙 Option 2 — Record While Playing</div>
        <p style="${txt}">Press Play, then capture audio with a free recorder:<br>
          <strong style="color:var(--text)">Windows:</strong> Xbox Game Bar (Win+G)<br>
          <strong style="color:var(--text)">Android:</strong> Screen recorder with internal audio<br>
          <strong style="color:var(--text)">Mac/iOS:</strong> QuickTime → New Audio Recording</p>
        <button class="btn btn-teal" style="width:100%;justify-content:center" onclick="closeDownloadModal();playTTS()">▶ Play now (then record)</button>
      </div>
      <div style="${box};margin-bottom:0">
        <div style="${ttl}">📋 Option 3 — Copy &amp; Use Online</div>
        <p style="${txt}">Copy your text and paste it into an online text-to-MP3 service.</p>
        <button class="btn btn-outline" style="width:100%;justify-content:center" onclick="copyTTSInput()">📋 Copy text to clipboard</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function copyTTSInput() {
  copyText(document.getElementById('tts-input').value.trim());
  closeDownloadModal();
}

function doTextDownload() {
  var text = document.getElementById('tts-input').value.trim();
  var blob = new Blob([text], { type: 'text/plain' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href   = url;
  a.download = 'voiceflow-' + Date.now() + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
  toast('Text downloaded!', 'success');
  closeDownloadModal();
}

function closeDownloadModal() {
  var m = document.getElementById('dl-modal');
  if (m) m.remove();
}

function clearTTS() {
  stopTTS();
  document.getElementById('tts-input').value = '';
  updateTTSCount();
}

function updateTTSCount() {
  var text = document.getElementById('tts-input').value;
  var words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('tts-wordCount').textContent = words;
  document.getElementById('tts-charCount').textContent = text.length;
  // No limit — long text is chunked automatically
}
document.getElementById('tts-input').addEventListener('input', updateTTSCount);

// ── KEYBOARD SHORTCUTS ───────────────────────
document.addEventListener('keydown', e => {
  if (!e.altKey) return;
  switch (e.key) {
    case 'r': case 'R': e.preventDefault(); sttRunning ? stopSTT() : startSTT(); break;
    case 'p': case 'P': e.preventDefault(); ttsSpeaking || ttsPaused ? pauseTTS() : playTTS(); break;
    case 's': case 'S': e.preventDefault(); stopTTS(); break;
    case 'c': case 'C': e.preventDefault();
      const active = document.querySelector('.panel.active');
      if (active.id === 'panel-stt') clearSTT();
      else if (active.id === 'panel-tts') clearTTS();
      break;
    case '1': e.preventDefault(); switchTab('stt'); break;
    case '2': e.preventDefault(); switchTab('tts'); break;
  }
});

// ── SUPPORT FLAGS ────────────────────────────
const HAS_TTS = typeof window !== 'undefined' && 'speechSynthesis' in window;
const HAS_STT = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

// Safe wrappers so nothing crashes when APIs are absent
const synth = HAS_TTS ? window.speechSynthesis : {
  getVoices: () => [], speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {},
  get paused() { return false; }
};

// ── VOICES INIT ─────────────────────────────
if (HAS_TTS) {
  if ('onvoiceschanged' in synth) synth.onvoiceschanged = populateVoices;
  populateVoices();
  setTimeout(populateVoices, 500);
} else {
  setTimeout(() => toast('Text-to-Speech is not supported in this browser or environment', 'error'), 800);
  ['tts-play','tts-pause-btn','tts-stop-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.disabled = true; el.title = 'TTS not supported here'; }
  });
}

// ── INIT ─────────────────────────────────────
buildLangChips('stt-lang-chips', sttLang, null);
buildLangChips('tts-lang-chips', ttsLang, null);

// Animate hero waveform randomly
setInterval(() => {
  document.querySelectorAll('#heroWave .waveform-bar').forEach(b => {
    b.style.height = (Math.random() * 36 + 10) + 'px';
  });
}, 150);

// Check STT support
if (!HAS_STT) {
  const startBtn = document.getElementById('stt-start');
  if (startBtn) { startBtn.disabled = true; startBtn.title = 'Not supported in this browser'; }
  setTimeout(() => toast('Speech Recognition requires Chrome or Edge on HTTPS', 'error'), 1000);
}
