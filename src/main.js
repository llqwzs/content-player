const btnOpen = document.getElementById('btn-open');
const dirPathEl = document.getElementById('dir-path');
const fileList = document.getElementById('file-list');
const videoPlayer = document.getElementById('video-player');
const audioPlayer = document.getElementById('audio-player');
const imageViewer = document.getElementById('image-viewer');
const emptyHint = document.getElementById('empty-hint');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const autoPlayCheck = document.getElementById('auto-play');
const btnOptions = document.getElementById('btn-options');
const optionsMenu = document.getElementById('options-menu');
const optRepeat = document.getElementById('opt-repeat');
const optImgTime = document.getElementById('opt-img-time');

let files = [];       // flat list of all media files (for playback navigation)
let tree = null;      // directory tree structure
let currentIndex = -1;
let currentPlayCount = 0;

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

const TYPE_ICONS = { video: '🎬', audio: '🎵', image: '🖼️' };

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

// Load a directory: scan tree and render
async function loadDirectory(dir) {
  dirPathEl.textContent = dir;
  tree = await window.api.scanDirectoryTree(dir);
  files = flattenTree(tree);
  localStorage.setItem('lastDir', dir);
  renderTree();
  if (files.length > 0) {
    play(0, { autoStart: false });
  } else {
    hideAll();
    emptyHint.textContent = '该文件夹中没有可播放的内容文件';
    emptyHint.style.display = '';
  }
}

// Select folder
btnOpen.addEventListener('click', async () => {
  const dir = await window.api.selectDirectory();
  if (!dir) return;
  loadDirectory(dir);
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

    // Default expanded
    dirLi.classList.add('expanded');
    dirLi.querySelector('.dir-arrow').textContent = '▼';

    dirLi.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = dirLi.classList.toggle('expanded');
      dirLi.querySelector('.dir-arrow').textContent = expanded ? '▼' : '▶';
      childUl.style.display = expanded ? '' : 'none';
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

function hideAll() {
  videoPlayer.style.display = 'none';
  audioPlayer.style.display = 'none';
  imageViewer.style.display = 'none';
  emptyHint.style.display = 'none';
  videoPlayer.pause();
  audioPlayer.pause();
}

function fileUrl(filePath) {
  // Convert Windows path to file URL
  return 'file:///' + filePath.replace(/\\/g, '/');
}

let imageTimer = null;

function play(index, { isRepeat = false, autoStart = true } = {}) {
  if (index < 0 || index >= files.length) return;

  if (!isRepeat) {
    currentPlayCount = 0;
  }

  currentIndex = index;
  const file = files[index];

  // Update active state in list
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

  if (file.type === 'video') {
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
  }
}

function playNext() {
  if (files.length === 0) return;
  const next = (currentIndex + 1) % files.length;
  play(next);
}

function playPrev() {
  if (files.length === 0) return;
  const prev = (currentIndex - 1 + files.length) % files.length;
  play(prev);
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
