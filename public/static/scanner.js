(function () {
  var video = document.getElementById('scanner-video');
  var statusEl = document.getElementById('scan-status');
  var resultBox = document.getElementById('scan-result');
  var startBtn = document.getElementById('start-scan-btn');
  if (!video) return;

  var stream = null;
  var detector = null;
  var scanning = false;
  var queueKey = 'anv_checkin_queue';

  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'scan-status ' + (cls || '');
  }

  function getQueue() {
    try { return JSON.parse(localStorage.getItem(queueKey) || '[]'); } catch (e) { return []; }
  }
  function setQueue(q) { localStorage.setItem(queueKey, JSON.stringify(q)); }
  function queueScan(token) {
    var q = getQueue();
    q.push({ token: token, ts: Date.now() });
    setQueue(q);
    renderQueueBadge();
  }
  function renderQueueBadge() {
    var q = getQueue();
    var el = document.getElementById('queue-count');
    if (el) el.textContent = q.length;
  }

  async function syncQueue() {
    var q = getQueue();
    if (q.length === 0) return;
    var remaining = [];
    for (var i = 0; i < q.length; i++) {
      try {
        var resp = await fetch('/admin/check-in/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: q[i].token }) });
        if (!resp.ok && resp.status >= 500) { remaining.push(q[i]); }
      } catch (e) { remaining.push(q[i]); }
    }
    setQueue(remaining);
    renderQueueBadge();
  }

  window.addEventListener('online', syncQueue);
  renderQueueBadge();
  syncQueue();

  async function handleToken(token) {
    setStatus('Connecting…', '');
    try {
      var resp = await fetch('/admin/check-in/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token }) });
      if (!resp.ok) {
        if (resp.status >= 500) { queueScan(token); setStatus('Server unavailable — queued for retry.', 'text-danger'); return; }
        var errData = await resp.json().catch(function(){ return {}; });
        setStatus(errData.message || 'Scan failed.', 'text-danger');
        return;
      }
      var data = await resp.json();
      renderResult(data);
    } catch (e) {
      queueScan(token);
      setStatus('Network error — queued for retry when back online.', 'text-danger');
    }
  }

  function renderResult(data) {
    if (data.duplicate) {
      setStatus('Already checked in at ' + data.checked_in_at + '.', 'text-warn');
    } else {
      setStatus('Checked in successfully.', 'text-success');
    }
    resultBox.innerHTML =
      '<div class="card"><h3>' + data.team_name + '</h3>' +
      '<p style="margin:4px 0;"><strong>College:</strong> ' + data.college_name + '</p>' +
      '<p style="margin:4px 0;"><strong>Registration ID:</strong> ' + data.registration_id + '</p>' +
      '<p style="margin:4px 0;"><strong>Category:</strong> ' + (data.category_name || '—') + '</p>' +
      '<p style="margin:4px 0;"><strong>Project:</strong> ' + (data.project_title || '—') + '</p>' +
      (data.duplicate ? '<div class="alert alert-warn" style="margin-top:10px;">Already checked in at ' + data.checked_in_at + '.</div>' : '<div class="alert alert-success" style="margin-top:10px;">Checked in just now.</div>') +
      '</div>';
  }

  async function startCamera() {
    setStatus('Requesting camera access…', '');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      setStatus('Point the camera at a team QR code.', '');
      if ('BarcodeDetector' in window) {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        scanning = true;
        scanLoop();
      } else {
        setStatus('QR auto-scan is not supported in this browser. Use manual entry below.', 'text-warn');
      }
    } catch (e) {
      setStatus('Could not access camera. Use manual entry below.', 'text-danger');
    }
  }

  async function scanLoop() {
    if (!scanning) return;
    try {
      var codes = await detector.detect(video);
      if (codes.length > 0) {
        scanning = false;
        var raw = codes[0].rawValue;
        var token = extractToken(raw);
        handleToken(token);
        setTimeout(function () { scanning = true; scanLoop(); }, 2500);
        return;
      }
    } catch (e) { /* ignore per-frame errors */ }
    requestAnimationFrame(scanLoop);
  }

  function extractToken(raw) {
    try {
      var url = new URL(raw);
      return url.searchParams.get('token') || raw;
    } catch (e) { return raw; }
  }

  startBtn?.addEventListener('click', startCamera);

  var manualForm = document.getElementById('manual-checkin-form');
  manualForm?.addEventListener('submit', function (e) {
    e.preventDefault();
    var val = document.getElementById('manual-token').value.trim();
    if (val) handleToken(extractToken(val));
  });
})();
