(function () {
  var form = document.getElementById('student-project-form');
  if (!form) return;

  function filesFor(name) {
    var input = form.querySelector('[name="' + name + '"]');
    return input ? Array.from(input.files || []) : [];
  }

  async function uploadFile(endpoint, file, type) {
    var initResponse = await fetch(endpoint, {
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
      var abstract = filesFor('abstract')[0];
      var presentation = filesFor('presentation')[0];
      if (abstract) uploads.push(await uploadFile(form.dataset.uploadUrl, abstract, 'abstract'));
      if (presentation) uploads.push(await uploadFile(form.dataset.uploadUrl, presentation, 'presentation'));
      var images = filesFor('images').slice(0, 3);
      for (var i = 0; i < images.length; i++) uploads.push(await uploadFile(form.dataset.uploadUrl, images[i], 'image'));

      var data = new FormData(form);
      data.delete('abstract');
      data.delete('presentation');
      data.delete('images');
      data.set('storage_files', JSON.stringify(uploads));
      var response = await fetch(form.action, { method: 'POST', body: data });
      window.location.assign(response.url);
    } catch (error) {
      if (submit) { submit.disabled = false; submit.textContent = 'Save & Submit Project'; }
      alert(error.message || 'File upload failed. Please try again.');
    }
  });
})();
