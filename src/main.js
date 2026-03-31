const btnOpen = document.getElementById('btn-open');
const dirPathEl = document.getElementById('dir-path');
const fileList = document.getElementById('file-list');
const videoPlayer = document.getElementById('video-player');
const audioPlayer = document.getElementById('audio-player');
const imageViewer = document.getElementById('image-viewer');
const emptyHint = document.getElementById('empty-hint');
const folderView = document.getElementById('folder-view');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const autoPlayCheck = document.getElementById('auto-play');
const btnOptions = document.getElementById('btn-options');
const optionsMenu = document.getElementById('options-menu');
const optRepeat = document.getElementById('opt-repeat');
const optImgTime = document.getElementById('opt-img-time');
const btnRefresh = document.getElementById('btn-refresh');
const volumeSlider = document.getElementById('volume-slider');
const volumeIcon = document.getElementById('volume-icon');
const voiceSelect = document.getElementById('voice-select');

let files = [];       // flat list of all media files (for playback navigation)
let tree = null;      // directory tree structure
let currentIndex = -1;
let currentPlayCount = 0;
let currentFolderFiles = null; // scoped file list for current folder playback

// Restore saved options
{
  const savedRepeat = localStorage.getItem('optRepeat');
  const savedImgTime = localStorage.getItem('optImgTime');
  const savedAutoPlay = localStorage.getItem('autoPlay');
  if (savedRepeat !== null) optRepeat.value = savedRepeat;
  if (savedImgTime !== null) optImgTime.value = savedImgTime;
  if (savedAutoPlay !== null) autoPlayCheck.checked = savedAutoPlay === 'true';
}

// Save options on change
optRepeat.addEventListener('change', () => localStorage.setItem('optRepeat', optRepeat.value));
optImgTime.addEventListener('change', () => localStorage.setItem('optImgTime', optImgTime.value));
autoPlayCheck.addEventListener('change', () => localStorage.setItem('autoPlay', autoPlayCheck.checked));

// Volume control
let currentVolume = 1;
let muted = false;
function applyVolume() {
  const vol = muted ? 0 : currentVolume;
  videoPlayer.volume = vol;
  audioPlayer.volume = vol;
  // Apply to folder-view media elements
  folderView.querySelectorAll('video, audio').forEach(el => { el.volume = vol; });
  volumeIcon.textContent = muted || currentVolume === 0 ? '🔇' : currentVolume < 0.5 ? '🔉' : '🔊';
}
volumeSlider.addEventListener('input', () => {
  currentVolume = volumeSlider.value / 100;
  muted = false;
  applyVolume();
});
volumeIcon.addEventListener('click', () => {
  muted = !muted;
  applyVolume();
});
applyVolume();

// Voice selection
function populateVoices() {
  const voices = speechSynthesis.getVoices();
  const savedVoice = localStorage.getItem('voiceName');
  voiceSelect.innerHTML = '<option value="">默认语音</option>';
  for (const voice of voices) {
    const opt = document.createElement('option');
    opt.value = voice.name;
    opt.textContent = `${voice.name} (${voice.lang})`;
    if (voice.name === savedVoice) opt.selected = true;
    voiceSelect.appendChild(opt);
  }
}
populateVoices();
speechSynthesis.addEventListener('voiceschanged', populateVoices);
voiceSelect.addEventListener('change', () => {
  localStorage.setItem('voiceName', voiceSelect.value);
});

function getSelectedVoice() {
  const name = voiceSelect.value;
  if (!name) return null;
  return speechSynthesis.getVoices().find(v => v.name === name) || null;
}

// Options menu toggle
btnOptions.addEventListener('click', (e) => {
  e.stopPropagation();
  optionsMenu.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!optionsMenu.contains(e.target) && e.target !== btnOptions) {
    optionsMenu.classList.add('hidden');
  }
});

const TYPE_ICONS = { video: '🎬', audio: '🎵', image: '🖼️', text: '📝', office: '📎', pdf: '📕', ppt: '📊' };
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];

// Find a same-name image file as poster for a video, within a list of files
function findPoster(videoFile, siblingFiles) {
  const baseName = videoFile.name.replace(/\.[^.]+$/, '').toLowerCase();
  return siblingFiles.find(f =>
    f.type === 'image' && f.name.replace(/\.[^.]+$/, '').toLowerCase() === baseName
  );
}

// Flatten tree into a file array (for playback navigation order)
function flattenTree(node) {
  const result = [];
  if (!node.isDir) {
    result.push(node);
  } else if (node.children) {
    for (const child of node.children) {
      result.push(...flattenTree(child));
    }
  }
  return result;
}

// Find the parent folder node's direct files for a given file
function findParentFolderFiles(file, node) {
  if (!node || !node.isDir) return null;
  const directFiles = node.children.filter(c => !c.isDir);
  if (directFiles.includes(file)) return directFiles;
  for (const child of node.children) {
    if (child.isDir) {
      const found = findParentFolderFiles(file, child);
      if (found) return found;
    }
  }
  return null;
}

// Load a directory: scan tree and render
async function loadDirectory(dir) {
  document.body.style.cursor = 'wait';
  dirPathEl.textContent = dir;
  tree = await window.api.scanDirectoryTree(dir);
  files = flattenTree(tree);
  localStorage.setItem('lastDir', dir);
  hideAll();
  currentIndex = -1;
  renderTree();
  if (files.length === 0) {
    emptyHint.textContent = '该文件夹中没有可播放的内容文件';
    emptyHint.style.display = '';
  }
  document.body.style.cursor = '';
}

// Select folder
btnOpen.addEventListener('click', async () => {
  const dir = await window.api.selectDirectory();
  if (!dir) return;
  loadDirectory(dir);
});

// Refresh playlist
btnRefresh.addEventListener('click', () => {
  const lastDir = localStorage.getItem('lastDir');
  if (lastDir) loadDirectory(lastDir);
});

// Auto-load last directory on startup
{
  const lastDir = localStorage.getItem('lastDir');
  if (lastDir) loadDirectory(lastDir);
}

function renderTree() {
  fileList.innerHTML = '';
  if (!tree) return;
  // Render the root's children directly (skip the root folder itself)
  for (const child of tree.children) {
    renderNode(child, fileList, 0);
  }
}

function renderNode(node, container, depth) {
  if (node.isDir) {
    // Directory node
    const dirLi = document.createElement('li');
    dirLi.className = 'tree-dir';
    dirLi.style.paddingLeft = (16 + depth * 16) + 'px';
    dirLi.innerHTML = `<span class="dir-arrow">▶</span><span class="dir-icon">📁</span><span class="dir-name" title="${node.name}">${node.name}</span>`;

    const childUl = document.createElement('ul');
    childUl.className = 'tree-children';
    childUl.style.display = 'none'; // Default collapsed

    dirLi.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasActive = dirLi.classList.contains('active');

      if (wasActive) {
        // Click on already-selected folder: toggle expand/collapse
        const expanded = dirLi.classList.toggle('expanded');
        dirLi.querySelector('.dir-arrow').textContent = expanded ? '▼' : '▶';
        childUl.style.display = expanded ? '' : 'none';
      } else {
        // First click: collapse if expanded, highlight, show files
        dirLi.classList.remove('expanded');
        dirLi.querySelector('.dir-arrow').textContent = '▶';
        childUl.style.display = 'none';

        fileList.querySelectorAll('.tree-dir').forEach(d => d.classList.remove('active'));
        fileList.querySelectorAll('.tree-file').forEach(f => f.classList.remove('active'));
        dirLi.classList.add('active');

        showFolder(node);
      }
    });

    container.appendChild(dirLi);
    container.appendChild(childUl);

    for (const child of node.children) {
      renderNode(child, childUl, depth + 1);
    }
  } else {
    // File node
    const fileIndex = files.indexOf(node);
    const li = document.createElement('li');
    li.className = 'tree-file';
    li.style.paddingLeft = (16 + depth * 16) + 'px';
    li.dataset.fileIndex = fileIndex;
    li.innerHTML = `<span class="file-icon">${TYPE_ICONS[node.type] || '📄'}</span><span class="file-name" title="${node.name}">${node.name}</span>`;
    li.addEventListener('click', (e) => {
      e.stopPropagation();
      play(fileIndex);
    });
    container.appendChild(li);
  }
}

let folderMode = false; // whether we're in folder view mode

// Speech synthesis helpers
function stopSpeech() {
  speechSynthesis.cancel();
}

function createSpeechBtn(text, onEnd) {
  const btn = document.createElement('button');
  btn.className = 'speech-btn';
  btn.textContent = '播音';
  let speaking = false;
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (speaking) {
      stopSpeech();
      btn.textContent = '播音';
      speaking = false;
      return;
    }
    stopSpeech();
    let playCount = 0;
    const repeatCount = parseInt(optRepeat.value, 10) || 1;

    function speakOnce() {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.volume = muted ? 0 : currentVolume;
      const voice = getSelectedVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        playCount++;
        if (playCount < repeatCount) {
          speakOnce();
        } else {
          btn.textContent = '播音';
          speaking = false;
          if (onEnd) onEnd();
        }
      };
      utterance.onerror = () => {
        btn.textContent = '播音';
        speaking = false;
      };
      speechSynthesis.speak(utterance);
    }

    speakOnce();
    btn.textContent = '停止';
    speaking = true;
  });
  return btn;
}

function hideAll() {
  videoPlayer.style.display = 'none';
  audioPlayer.style.display = 'none';
  imageViewer.style.display = 'none';
  emptyHint.style.display = 'none';
  folderView.style.display = 'none';
  videoPlayer.pause();
  audioPlayer.pause();
  stopSpeech();
  // Stop all media in folder view
  folderView.querySelectorAll('video, audio').forEach(el => el.pause());
  folderView.innerHTML = '';
  folderView.classList.remove('single-file');
  folderMode = false;
}

function fileUrl(filePath) {
  // Convert Windows path to file URL
  return 'file:///' + filePath.replace(/\\/g, '/');
}

let imageTimer = null;

// Show direct children files from a folder in the player area (non-recursive)
function showFolder(node) {
  const folderFiles = node.children ? node.children.filter(c => !c.isDir) : [];

  hideAll();
  if (imageTimer) {
    clearTimeout(imageTimer);
    imageTimer = null;
  }

  if (folderFiles.length === 0) return;

  currentFolderFiles = folderFiles;
  folderMode = true;
  folderView.style.display = '';

  // Collect images used as video posters so they can be hidden
  const posterSet = new Set();
  for (const file of folderFiles) {
    if (file.type === 'video') {
      const poster = findPoster(file, folderFiles);
      if (poster) posterSet.add(poster);
    }
  }

  // Track all video/audio elements in this folder view for mutual exclusion
  const mediaElements = [];

  for (const file of folderFiles) {
    // Skip images already used as video poster
    if (posterSet.has(file)) continue;
    const item = document.createElement('div');
    item.className = 'folder-item';

    const nameEl = document.createElement('div');
    nameEl.className = 'folder-item-name';
    nameEl.textContent = file.name;
    nameEl.title = file.name;
    item.appendChild(nameEl);

    const url = fileUrl(file.path);

    if (file.type === 'video') {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      const poster = findPoster(file, folderFiles);
      if (poster) video.poster = fileUrl(poster.path);
      video.addEventListener('play', () => {
        // Pause all other playing media in folder view
        for (const el of mediaElements) {
          if (el !== video && !el.paused) el.pause();
        }
      });
      mediaElements.push(video);
      item.appendChild(video);
    } else if (file.type === 'audio') {
      const audio = document.createElement('audio');
      audio.src = url;
      audio.controls = true;
      audio.addEventListener('play', () => {
        for (const el of mediaElements) {
          if (el !== audio && !el.paused) el.pause();
        }
      });
      mediaElements.push(audio);
      item.appendChild(audio);
    } else if (file.type === 'image') {
      const img = document.createElement('img');
      img.src = url;
      item.appendChild(img);
    } else if (file.type === 'text') {
      const pre = document.createElement('pre');
      pre.className = 'text-content';
      pre.textContent = '加载中…';
      const speechBtn = createSpeechBtn('', null);
      item.appendChild(speechBtn);
      item.appendChild(pre);
      window.api.readTextFile(file.path).then(content => {
        pre.textContent = content;
        // Replace button with one that has the loaded content
        const newBtn = createSpeechBtn(content, null);
        item.replaceChild(newBtn, speechBtn);
      });
    } else if (file.type === 'pdf') {
      item.style.height = '600px';
      const embed = document.createElement('embed');
      embed.src = url;
      embed.type = 'application/pdf';
      embed.className = 'pdf-embed';
      item.appendChild(embed);
    } else if (file.type === 'office') {
      const contentDiv = document.createElement('div');
      contentDiv.className = 'office-content';
      contentDiv.textContent = '加载中…';
      item.appendChild(contentDiv);
      const btn = document.createElement('button');
      btn.className = 'office-open-btn';
      btn.textContent = '使用默认程序打开';
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); window.api.openFileExternal(file.path); });
      item.appendChild(btn);
      window.api.readOfficeFile(file.path).then(result => {
        if (result.html && !result.unsupported) {
          contentDiv.innerHTML = result.html;
        } else {
          contentDiv.textContent = result.error ? `读取失败: ${result.error}` : '该格式暂不支持内容预览';
          item.classList.add('office-hint');
        }
      });
    }

    folderView.appendChild(item);
  }

  applyVolume();
  updateSpeechControlsState(folderFiles.some(f => f.type === 'text'));

  // Clear single-file active state
  const allFileItems = fileList.querySelectorAll('.tree-file');
  allFileItems.forEach(li => li.classList.remove('active'));
  currentIndex = -1;

}

function updateSpeechControlsState(enabled) {
  voiceSelect.disabled = !enabled;
  volumeSlider.disabled = !enabled;
  volumeIcon.classList.toggle('disabled', !enabled);
  voiceSelect.classList.toggle('disabled', !enabled);
  volumeSlider.classList.toggle('disabled', !enabled);
}

function play(index, { isRepeat = false, autoStart = true } = {}) {
  if (index < 0 || index >= files.length) return;

  if (!isRepeat) {
    currentPlayCount = 0;
  }

  currentIndex = index;
  const file = files[index];

  // Set folder scope if not already set or file is outside current scope
  if (!currentFolderFiles || !currentFolderFiles.includes(file)) {
    currentFolderFiles = findParentFolderFiles(file, tree) || [file];
  }

  // Update active state in list, clear folder highlight
  fileList.querySelectorAll('.tree-dir').forEach(d => d.classList.remove('active'));
  const allFileItems = fileList.querySelectorAll('.tree-file');
  allFileItems.forEach(li => li.classList.toggle('active', parseInt(li.dataset.fileIndex) === index));

  // Scroll active item into view and ensure parent dirs are expanded
  const activeLi = fileList.querySelector(`.tree-file[data-file-index="${index}"]`);
  if (activeLi) {
    // Expand all ancestor directories
    let parent = activeLi.parentElement;
    while (parent && parent !== fileList) {
      if (parent.tagName === 'UL' && parent.classList.contains('tree-children')) {
        parent.style.display = '';
        // The dirLi is the previous sibling of this UL
        const dirLi = parent.previousElementSibling;
        if (dirLi && dirLi.classList.contains('tree-dir')) {
          dirLi.classList.add('expanded');
          const arrow = dirLi.querySelector('.dir-arrow');
          if (arrow) arrow.textContent = '▼';
        }
      }
      parent = parent.parentElement;
    }
    activeLi.scrollIntoView({ block: 'nearest' });
  }

  hideAll();
  if (imageTimer) {
    clearTimeout(imageTimer);
    imageTimer = null;
  }

  const url = fileUrl(file.path);
  applyVolume();
  updateSpeechControlsState(file.type === 'text');

  if (file.type === 'video') {
    const poster = findPoster(file, files);
    videoPlayer.poster = poster ? fileUrl(poster.path) : '';
    videoPlayer.src = url;
    videoPlayer.style.display = 'block';
    if (autoStart) videoPlayer.play();
  } else if (file.type === 'audio') {
    audioPlayer.src = url;
    audioPlayer.style.display = 'block';
    if (autoStart) audioPlayer.play();
  } else if (file.type === 'image') {
    imageViewer.src = url;
    imageViewer.style.display = 'block';
    const imgTime = (parseInt(optImgTime.value, 10) || 5) * 1000;
    if (autoStart && autoPlayCheck.checked) {
      imageTimer = setTimeout(() => {
        if (currentIndex === index && autoPlayCheck.checked) {
          playNext();
        }
      }, imgTime);
    }
  } else if (file.type === 'text') {
    showTextFile(file);
  } else if (file.type === 'pdf') {
    showPdfFile(file);
  } else if (file.type === 'office') {
    showOfficeFile(file);
  }
}

// Display text file content
async function showTextFile(file) {
  folderView.innerHTML = '';
  folderView.style.display = '';
  folderView.classList.add('single-file');
  const content = await window.api.readTextFile(file.path);
  const item = document.createElement('div');
  item.className = 'folder-item full';
  const btn = createSpeechBtn(content, () => {
    if (autoPlayCheck.checked) playNext();
  });
  item.appendChild(btn);
  const pre = document.createElement('pre');
  pre.className = 'text-content';
  pre.textContent = content;
  item.appendChild(pre);
  folderView.appendChild(item);
}

// Display PDF file in embedded viewer
function showPdfFile(file) {
  folderView.innerHTML = '';
  folderView.style.display = '';
  folderView.classList.add('single-file');
  const item = document.createElement('div');
  item.className = 'folder-item full';
  const embed = document.createElement('embed');
  embed.src = fileUrl(file.path);
  embed.type = 'application/pdf';
  embed.className = 'pdf-embed';
  item.appendChild(embed);
  folderView.appendChild(item);
}

// Display office file with inline content
async function showOfficeFile(file) {
  folderView.innerHTML = '';
  folderView.style.display = '';
  folderView.classList.add('single-file');
  const item = document.createElement('div');
  item.className = 'folder-item full';

  const result = await window.api.readOfficeFile(file.path);

  if (result.html && !result.unsupported) {
    const contentDiv = document.createElement('div');
    contentDiv.className = 'office-content';
    contentDiv.innerHTML = result.html;
    item.appendChild(contentDiv);
    const btn = document.createElement('button');
    btn.className = 'office-open-btn';
    btn.textContent = '使用默认程序打开';
    btn.addEventListener('click', () => window.api.openFileExternal(file.path));
    item.appendChild(btn);
  } else {
    item.classList.add('office-hint');
    const icon = document.createElement('div');
    icon.className = 'office-icon';
    icon.textContent = file.ext.includes('doc') ? '📄' : '📊';
    const name = document.createElement('div');
    name.className = 'office-name';
    name.textContent = file.name;
    const info = document.createElement('div');
    info.className = 'office-name';
    info.textContent = result.error ? `读取失败: ${result.error}` : '该格式暂不支持内容预览';
    const btn = document.createElement('button');
    btn.className = 'office-open-btn';
    btn.textContent = '使用默认程序打开';
    btn.addEventListener('click', () => window.api.openFileExternal(file.path));
    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(info);
    item.appendChild(btn);
  }

  folderView.appendChild(item);
}

function playNext() {
  if (!currentFolderFiles || currentFolderFiles.length === 0) return;
  const idx = currentFolderFiles.indexOf(files[currentIndex]);
  const nextFile = currentFolderFiles[(idx + 1) % currentFolderFiles.length];
  play(files.indexOf(nextFile));
}

function playPrev() {
  if (!currentFolderFiles || currentFolderFiles.length === 0) return;
  const idx = currentFolderFiles.indexOf(files[currentIndex]);
  const prevFile = currentFolderFiles[(idx - 1 + currentFolderFiles.length) % currentFolderFiles.length];
  play(files.indexOf(prevFile));
}

btnNext.addEventListener('click', playNext);
btnPrev.addEventListener('click', playPrev);

// Auto-play: repeat current or advance to next when video/audio ends
function onMediaEnded() {
  if (!autoPlayCheck.checked) return;
  const repeatCount = parseInt(optRepeat.value, 10) || 1;
  currentPlayCount++;
  if (currentPlayCount < repeatCount) {
    play(currentIndex, { isRepeat: true });
  } else {
    playNext();
  }
}
videoPlayer.addEventListener('ended', onMediaEnded);
audioPlayer.addEventListener('ended', onMediaEnded);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    playNext();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    playPrev();
  } else if (e.key === ' ') {
    e.preventDefault();
    // Toggle play/pause for video/audio
    const active = files[currentIndex];
    if (active?.type === 'video') {
      videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
    } else if (active?.type === 'audio') {
      audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
    }
  }
});
