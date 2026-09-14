(function () {
  var form = document.getElementById('reg-form');
  if (!form) return;

  var steps = Array.from(document.querySelectorAll('.wizard-step'));
  var pills = Array.from(document.querySelectorAll('.step-pill'));
  var current = 0;
  var memberList = document.getElementById('member-list');
  var memberTemplate = document.getElementById('member-template');
  var memberCount = 0;
  var MIN_MEMBERS = parseInt(form.dataset.minMembers || '2', 10);
  var MAX_MEMBERS = parseInt(form.dataset.maxMembers || '5', 10);

  function showStep(idx) {
    steps.forEach(function (s, i) { s.style.display = i === idx ? 'block' : 'none'; });
    pills.forEach(function (p, i) {
      p.classList.remove('active', 'done');
      if (i < idx) p.classList.add('done');
      if (i === idx) p.classList.add('active');
    });
    current = idx;
    window.scrollTo({ top: form.offsetTop - 100, behavior: 'smooth' });
    if (idx === steps.length - 1) populateReview();
  }

  function validateStep(idx) {
    var el = steps[idx];
    var inputs = el.querySelectorAll('input[required], select[required], textarea[required]');
    for (var i = 0; i < inputs.length; i++) {
      if (!inputs[i].checkValidity()) {
        inputs[i].reportValidity();
        return false;
      }
    }
    if (idx === 2 && memberList.children.length < MIN_MEMBERS) {
      alert('Please add at least ' + MIN_MEMBERS + ' team members.');
      return false;
    }
    return true;
  }

  document.querySelectorAll('[data-next]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (validateStep(current) && current < steps.length - 1) showStep(current + 1);
    });
  });
  document.querySelectorAll('[data-back]').forEach(function (btn) {
    btn.addEventListener('click', function () { if (current > 0) showStep(current - 1); });
  });
  pills.forEach(function (p, i) {
    p.addEventListener('click', function () { if (i < current) showStep(i); });
    p.style.cursor = i < current ? 'pointer' : 'default';
  });

  function addMember(prefill) {
    if (memberList.children.length >= MAX_MEMBERS) {
      alert('Maximum ' + MAX_MEMBERS + ' members allowed (including leader).');
      return;
    }
    var idx = memberCount++;
    var html = memberTemplate.innerHTML.replace(/__INDEX__/g, idx);
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    var node = wrap.firstElementChild;
    memberList.appendChild(node);
    node.querySelector('.remove-member').addEventListener('click', function () {
      if (memberList.children.length <= MIN_MEMBERS) {
        alert('A team needs at least ' + MIN_MEMBERS + ' members.');
        return;
      }
      node.remove();
    });
  }
  document.getElementById('add-member-btn')?.addEventListener('click', function () { addMember(); });

  // Pre-seed minimum required member rows (leader is captured separately in step 2)
  for (var i = 0; i < MIN_MEMBERS - 1; i++) addMember();

  function populateReview() {
    var box = document.getElementById('review-box');
    var data = new FormData(form);
    var rows = [
      ['College', data.get('college_name')],
      ['University', data.get('university')],
      ['Team Name', data.get('team_name')],
      ['Team Leader', data.get('leader_name') + ' (' + data.get('leader_email') + ')'],
      ['Members Added', memberList.children.length],
      ['Project Title', data.get('project_title')],
      ['Category', form.querySelector('[name=category_id] option:checked')?.textContent || ''],
      ['Faculty Mentor', data.get('mentor_name')],
    ];
    box.innerHTML = rows.map(function (r) {
      return '<div class="pass-row" style="color:#0f172a; border-color:#e4e8f1;"><span class="l" style="color:#64748a;">' + r[0] + '</span><span class="r">' + (r[1] || '—') + '</span></div>';
    }).join('');
  }

  async function uploadFile(file, type) {
    var initResponse = await fetch('/register/file-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, name: file.name, contentType: file.type, size: file.size })
    });
    var init = await initResponse.json();
    if (!initResponse.ok) throw new Error(init.error || 'Could not initialize file upload.');

    var uploadResponse = await fetch(init.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    });
    if (!uploadResponse.ok) throw new Error('Could not upload "' + file.name + '".');
    return { type: type, name: file.name, path: init.path, contentType: file.type, size: file.size };
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var submit = form.querySelector('button[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = 'Uploading files...'; }

    try {
      var uploads = [];
      var abstract = form.querySelector('[name="abstract"]').files[0];
      var presentation = form.querySelector('[name="presentation"]').files[0];
      if (abstract) uploads.push(await uploadFile(abstract, 'abstract'));
      if (presentation) uploads.push(await uploadFile(presentation, 'presentation'));
      var images = Array.from(form.querySelector('[name="images"]').files || []).slice(0, 3);
      for (var i = 0; i < images.length; i++) uploads.push(await uploadFile(images[i], 'image'));

      var data = new FormData(form);
      data.delete('abstract');
      data.delete('presentation');
      data.delete('images');
      data.set('storage_files', JSON.stringify(uploads));
      var response = await fetch(form.action, { method: 'POST', body: data });
      window.location.assign(response.url);
    } catch (error) {
      if (submit) { submit.disabled = false; submit.textContent = 'Submit Registration'; }
      alert(error.message || 'File upload failed. Please try again.');
    }
  });

  showStep(0);
})();
