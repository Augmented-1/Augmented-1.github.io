// Moving Boxes - single-file web app
// All data is stored locally in IndexedDB. QR codes encode full box data in the URL.

// ============================================================
// STORAGE - IndexedDB wrapper
// ============================================================
const DB_NAME = 'movingBoxes';
const DB_VERSION = 1;
const STORE = 'boxes';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function getAllBoxes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror = e => reject(e.target.error);
  });
}

async function saveBox(box) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(box);
    req.onsuccess = () => resolve(box);
    req.onerror = e => reject(e.target.error);
  });
}

async function deleteBoxById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

async function clearAllBoxes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = e => reject(e.target.error);
  });
}

// ============================================================
// QR PAYLOAD - compress + encode a box for the URL
// ============================================================
const EMOJIS = ['📦','🍳','📚','👕','🛋️','💻','🎮','🪴','🧸','🛁','🔧','🎨','🍷','🏋️','🖼️','🧺','🎵','💊','🎒','🖥️','📷','🧴','👟','⚽','📀','🪑','🎲','🛏️'];
const PRIORITIES = ['Open first', 'Normal', 'Last to unpack'];

function encodeBox(box) {
  const payload = {
    l: box.label, e: box.emoji, r: box.room || '',
    p: box.priority, n: box.notes || '',
    i: box.items, ph: box.photo || null, c: box.created
  };
  const json = JSON.stringify(payload);
  const compressed = pako.deflate(new TextEncoder().encode(json));
  let binary = '';
  compressed.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function decodeBox(encoded) {
  try {
    let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(pako.inflate(bytes));
    return JSON.parse(json);
  } catch (e) {
    console.error('Decode failed:', e);
    return null;
  }
}

function buildViewerURL(box) {
  const encoded = encodeBox(box);
  const base = window.location.origin + window.location.pathname;
  return base + '?box=' + encoded;
}

// ============================================================
// PHOTO HANDLING - resize and compress for QR
// ============================================================
async function processPhoto(file, maxDim = 400, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) { height = (height * maxDim) / width; width = maxDim; }
        } else {
          if (height > maxDim) { width = (width * maxDim) / height; height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// UI HELPERS
// ============================================================
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  const append = (parent, child) => {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(x => append(parent, x)); return; }
    if (child instanceof Node) { parent.appendChild(child); return; }
    // Coerce numbers, booleans, anything else to a text node.
    parent.appendChild(document.createTextNode(String(child)));
  };
  for (const c of children) append(node, c);
  return node;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function toast(msg, duration = 2200) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = el('div', { class: 'toast' }, msg);
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, duration);
}

function priorityClass(p) {
  if (p === 'Open first') return 'priority-high';
  if (p === 'Last to unpack') return 'priority-low';
  return '';
}

function formatDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ============================================================
// ROUTER
// ============================================================
const state = {
  boxes: [],
  currentView: 'home',
  editingBox: null,
  viewingBox: null,
  qrBox: null,
  searchQuery: ''
};

function nav(view, opts = {}) {
  state.currentView = view;
  Object.assign(state, opts);
  render();
  window.scrollTo(0, 0);
}

// ============================================================
// VIEWS
// ============================================================
function renderApp() {
  const app = document.getElementById('app');
  try {
    app.innerHTML = '';

    const params = new URLSearchParams(window.location.search);
    if (params.get('box')) {
      const decoded = decodeBox(params.get('box'));
      if (decoded) return app.appendChild(renderViewerMode(decoded));
      app.appendChild(renderBrokenLink());
      return;
    }

    if (state.currentView === 'home') app.appendChild(renderHome());
    else if (state.currentView === 'editor') app.appendChild(renderEditor(state.editingBox));
    else if (state.currentView === 'detail') app.appendChild(renderDetail(state.viewingBox));
    else if (state.currentView === 'qr') app.appendChild(renderQR(state.qrBox));
    else if (state.currentView === 'scanner') app.appendChild(renderScanner());
    else if (state.currentView === 'settings') app.appendChild(renderSettings());
  } catch (err) {
    console.error('Render error:', err);
    app.innerHTML = '';
    const wrap = el('div', { style: { padding: '20px', maxWidth: '600px', margin: '40px auto' } },
      el('h2', { style: { fontSize: '18px', marginBottom: '12px', color: 'var(--danger, #a32d2d)' } }, 'Something went wrong'),
      el('p', { class: 'muted', style: { marginBottom: '16px' } }, 'The app hit an error rendering this screen. Your data is safe.'),
      el('pre', { style: { background: 'var(--surface-alt)', padding: '12px', borderRadius: '8px', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '16px' } }, String(err && err.stack || err)),
      el('button', { class: 'btn primary block', onclick: () => { state.currentView = 'home'; renderApp(); } }, 'Back to home')
    );
    app.appendChild(wrap);
  }
}

const render = renderApp;

// ------------------------------------------------------------
// Home / box list
// ------------------------------------------------------------
function renderHome() {
  const wrap = el('div');
  wrap.appendChild(renderTopbar({
    title: 'Moving boxes',
    actions: [
      { icon: iconScan(), label: 'Scan', onClick: () => nav('scanner') },
      { icon: iconGear(), label: 'Settings', onClick: () => nav('settings') },
    ]
  }));

  if (state.boxes.length === 0) {
    wrap.appendChild(el('div', { class: 'empty' },
      el('div', { class: 'empty-icon' }, '📦'),
      el('h2', {}, 'No boxes yet'),
      el('p', {}, 'Create your first box to get started.'),
      el('button', { class: 'btn primary', onclick: () => nav('editor', { editingBox: null }) },
        el('span', { html: '+ New box' })
      )
    ));
    return wrap;
  }

  const search = el('div', { class: 'search' },
    el('span', { class: 'search-icon', html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' }),
    el('input', {
      class: 'input', type: 'search', placeholder: 'Search boxes or items',
      value: state.searchQuery,
      oninput: e => { state.searchQuery = e.target.value; renderBoxList(list); }
    })
  );
  wrap.appendChild(search);

  const list = el('div', { class: 'box-list' });
  renderBoxList(list);
  wrap.appendChild(list);

  const actions = el('div', { class: 'sticky-actions' },
    el('button', { class: 'btn primary block', onclick: () => nav('editor', { editingBox: null }) }, '+ New box')
  );
  wrap.appendChild(actions);
  return wrap;
}

function renderBoxList(container) {
  container.innerHTML = '';
  const q = state.searchQuery.trim().toLowerCase();
  const filtered = state.boxes.filter(b => {
    if (!q) return true;
    return b.label.toLowerCase().includes(q) ||
           (b.room || '').toLowerCase().includes(q) ||
           (b.items || []).some(it => it.toLowerCase().includes(q));
  });

  if (filtered.length === 0) {
    container.appendChild(el('div', { class: 'empty' },
      el('p', {}, 'No boxes match your search.')
    ));
    return;
  }

  for (const priority of PRIORITIES) {
    const inGroup = filtered.filter(b => b.priority === priority);
    if (inGroup.length === 0) continue;
    container.appendChild(el('div', { class: 'section-head' }, priority));
    for (const box of inGroup) {
      container.appendChild(renderBoxRow(box));
    }
  }
}

function renderBoxRow(box) {
  return el('div', { class: 'box-row', onclick: () => nav('detail', { viewingBox: box }) },
    el('div', { class: 'emoji' }, box.emoji || '📦'),
    el('div', { class: 'meta' },
      el('div', { class: 'name' }, box.label),
      el('div', { class: 'sub' },
        (box.room ? box.room + ' · ' : '') +
        box.items.length + ' item' + (box.items.length === 1 ? '' : 's')
      )
    ),
    box.photo ? el('span', { class: 'has-photo', title: 'Has photo' }, '📷') : null,
    el('span', { class: 'chev' }, '›')
  );
}

// ------------------------------------------------------------
// Editor (create / edit)
// ------------------------------------------------------------
function renderEditor(existing) {
  const editing = !!existing;
  const box = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: uid(),
    label: '',
    emoji: '📦',
    room: '',
    priority: 'Normal',
    items: [],
    notes: '',
    photo: null,
    created: new Date().toISOString()
  };

  const wrap = el('div');
  wrap.appendChild(renderBackButton(() => nav('home')));
  wrap.appendChild(el('h1', { style: { fontSize: '22px', fontWeight: 600, marginBottom: '4px' } }, editing ? 'Edit box' : 'New box'));
  wrap.appendChild(el('p', { class: 'muted', style: { marginBottom: '20px' } }, 'Fill in details, then save to generate a QR label.'));

  const card = el('div', { class: 'card' });
  wrap.appendChild(card);

  // Label
  card.appendChild(el('div', { class: 'field' },
    el('label', {}, 'Box label'),
    el('input', {
      class: 'input', type: 'text', id: 'f-label',
      placeholder: 'e.g. Kitchen essentials, Books…',
      value: box.label
    })
  ));

  // Emoji picker
  const emojiField = el('div', { class: 'field' }, el('label', {}, 'Icon'));
  const emojiGrid = el('div', { class: 'emoji-grid' });
  EMOJIS.forEach(e => {
    const btn = el('button', {
      type: 'button',
      class: 'emoji-btn' + (e === box.emoji ? ' active' : ''),
      onclick: () => {
        box.emoji = e;
        emojiGrid.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    }, e);
    emojiGrid.appendChild(btn);
  });
  emojiField.appendChild(emojiGrid);
  card.appendChild(emojiField);

  // Room
  card.appendChild(el('div', { class: 'field' },
    el('label', {}, 'Room / destination'),
    el('input', { class: 'input', type: 'text', id: 'f-room', placeholder: 'e.g. Master bedroom', value: box.room })
  ));

  // Priority
  const prioritySelect = el('select', { class: 'select', id: 'f-priority' },
    ...PRIORITIES.map(p => el('option', { value: p, selected: p === box.priority }, p))
  );
  card.appendChild(el('div', { class: 'field' }, el('label', {}, 'Priority'), prioritySelect));

  // Items
  const itemsField = el('div', { class: 'field' }, el('label', {}, 'Items (' + box.items.length + ')'));
  const chips = el('div', { class: 'chips' });

  const renderChips = () => {
    chips.innerHTML = '';
    itemsField.querySelector('label').textContent = 'Items (' + box.items.length + ')';
    box.items.forEach((item, i) => {
      chips.appendChild(el('span', { class: 'chip' },
        item,
        el('button', { class: 'x', type: 'button', onclick: () => { box.items.splice(i, 1); renderChips(); } }, '✕')
      ));
    });
  };
  renderChips();
  itemsField.appendChild(chips);

  const itemInput = el('input', { class: 'input', type: 'text', placeholder: 'Add an item, press Enter' });
  const addItem = () => {
    const v = itemInput.value.trim();
    if (v && !box.items.includes(v)) { box.items.push(v); renderChips(); }
    itemInput.value = ''; itemInput.focus();
  };
  itemInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addItem(); }
  });
  itemsField.appendChild(el('div', { class: 'inline-add' },
    itemInput,
    el('button', { class: 'btn sm', type: 'button', onclick: addItem }, 'Add')
  ));
  card.appendChild(itemsField);

  // Photo
  const photoField = el('div', { class: 'field' }, el('label', {}, 'Photo of contents'));
  const photoPrev = el('img', { class: 'photo-preview', alt: 'Contents', style: { display: box.photo ? 'block' : 'none' } });
  if (box.photo) photoPrev.src = box.photo;
  photoField.appendChild(photoPrev);

  const photoDrop = el('div', { class: 'photo-drop' },
    el('span', {}, box.photo ? 'Tap to change photo' : 'Tap to upload or take a photo'),
    el('input', {
      type: 'file', accept: 'image/*', capture: 'environment',
      onchange: async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const dataUrl = await processPhoto(file);
          box.photo = dataUrl;
          photoPrev.src = dataUrl; photoPrev.style.display = 'block';
          photoDrop.querySelector('span').textContent = 'Tap to change photo';
        } catch (err) { toast('Could not load photo'); }
      }
    })
  );
  photoField.appendChild(photoDrop);
  if (box.photo) {
    photoField.appendChild(el('button', {
      class: 'btn sm danger', type: 'button',
      style: { marginTop: '8px' },
      onclick: () => {
        box.photo = null;
        photoPrev.style.display = 'none'; photoPrev.src = '';
        photoDrop.querySelector('span').textContent = 'Tap to upload or take a photo';
      }
    }, 'Remove photo'));
  }
  card.appendChild(photoField);

  // Notes
  card.appendChild(el('div', { class: 'field' },
    el('label', {}, 'Notes'),
    el('textarea', { class: 'textarea', id: 'f-notes', placeholder: 'Fragile, heavy, this side up…' }, box.notes)
  ));

  // Save/cancel
  wrap.appendChild(el('div', { class: 'sticky-actions' },
    el('button', {
      class: 'btn primary block',
      onclick: async () => {
        box.label = card.querySelector('#f-label').value.trim();
        if (!box.label) { toast('Please enter a box label'); return; }
        box.room = card.querySelector('#f-room').value.trim();
        box.priority = card.querySelector('#f-priority').value;
        box.notes = card.querySelector('#f-notes').value.trim();
        try {
          await saveBox(box);
          state.boxes = await getAllBoxes();
          toast(editing ? 'Saved' : 'Box created');
          nav('qr', { qrBox: box });
        } catch (e) { toast('Save failed'); console.error(e); }
      }
    }, editing ? 'Save changes' : 'Save & show QR')
  ));

  return wrap;
}

// ------------------------------------------------------------
// Detail
// ------------------------------------------------------------
function renderDetail(box) {
  const wrap = el('div');
  wrap.appendChild(renderBackButton(() => nav('home')));

  // Menu for actions
  const menuPanel = el('div', { class: 'menu-panel', style: { display: 'none' } });
  const menu = el('div', { class: 'menu' },
    el('button', {
      class: 'icon-btn',
      onclick: e => {
        e.stopPropagation();
        menuPanel.style.display = menuPanel.style.display === 'none' ? 'block' : 'none';
      }
    }, '⋯'),
    menuPanel
  );
  document.addEventListener('click', () => menuPanel.style.display = 'none');

  menuPanel.appendChild(el('button', { onclick: () => nav('qr', { qrBox: box }) }, '📱 QR code & label'));
  menuPanel.appendChild(el('button', { onclick: () => nav('editor', { editingBox: box }) }, '✏️ Edit'));
  menuPanel.appendChild(el('div', { class: 'divider' }));
  menuPanel.appendChild(el('button', {
    class: 'danger',
    onclick: async () => {
      if (!confirm('Delete this box? This cannot be undone.')) return;
      await deleteBoxById(box.id);
      state.boxes = await getAllBoxes();
      toast('Box deleted');
      nav('home');
    }
  }, '🗑️ Delete'));

  // Top actions
  wrap.appendChild(el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' } }, menu));

  if (box.photo) {
    wrap.appendChild(el('img', { src: box.photo, class: 'detail-photo', alt: 'Box contents' }));
  }

  wrap.appendChild(el('div', { class: 'detail-head' },
    el('span', { class: 'emoji' }, box.emoji),
    el('div', {},
      el('h2', {}, box.label),
      box.room ? el('div', { class: 'room' }, box.room) : null
    )
  ));

  wrap.appendChild(el('div', { class: 'detail-meta' },
    el('span', { class: 'pill ' + priorityClass(box.priority) }, box.priority),
    el('span', { class: 'pill' }, 'Packed ' + formatDate(box.created))
  ));

  if (box.items.length) {
    wrap.appendChild(el('div', { class: 'section-head' }, 'Items (' + box.items.length + ')'));
    const list = el('div', { class: 'item-list' });
    box.items.forEach(i => list.appendChild(el('div', { class: 'item' }, i)));
    wrap.appendChild(list);
  }

  if (box.notes) {
    wrap.appendChild(el('div', { class: 'section-head' }, 'Notes'));
    wrap.appendChild(el('div', { class: 'notes-block' }, box.notes));
  }

  wrap.appendChild(el('div', { class: 'sticky-actions' },
    el('button', { class: 'btn primary block', onclick: () => nav('qr', { qrBox: box }) }, 'View QR label')
  ));

  return wrap;
}

// ------------------------------------------------------------
// QR label
// ------------------------------------------------------------
function renderQR(box) {
  const wrap = el('div', { class: 'qr-screen' });
  wrap.appendChild(renderBackButton(() => nav('detail', { viewingBox: box })));
  wrap.appendChild(el('h1', { class: 'print-hide', style: { fontSize: '22px', fontWeight: 600, marginBottom: '4px' } }, 'QR label ready'));

  if (typeof QRCode === 'undefined' || typeof pako === 'undefined') {
    wrap.appendChild(el('div', { class: 'warning-banner' },
      el('span', {}, '⚠️'),
      el('div', {},
        el('strong', {}, 'QR library not loaded. '),
        'Try fully closing and reopening the app, or pull down to refresh in Safari.'
      )
    ));
    return wrap;
  }

  wrap.appendChild(el('p', { class: 'muted print-hide', style: { marginBottom: '20px' } }, 'Print this label and tape it to your box. Anyone can scan it with their camera to see the contents.'));

  const url = buildViewerURL(box);
  const urlSize = url.length;
  if (urlSize > 2800) {
    wrap.appendChild(el('div', { class: 'warning-banner print-hide' },
      el('span', {}, '⚠️'),
      el('div', {},
        el('strong', {}, 'Dense QR warning: '),
        'This box has a large photo or many items. The QR code may be hard to scan. Consider shrinking the photo or removing it.'
      )
    ));
  }

  const card = el('div', { class: 'qr-card' });
  card.appendChild(el('div', { class: 'emoji' }, box.emoji));
  card.appendChild(el('h3', {}, box.label));
  if (box.room) card.appendChild(el('div', { class: 'room' }, box.room));
  card.appendChild(el('span', { class: 'pill' }, box.priority));

  if (box.items.length) {
    const ul = el('ul', { class: 'items-preview' });
    box.items.slice(0, 8).forEach(i => ul.appendChild(el('li', {}, i)));
    if (box.items.length > 8) ul.appendChild(el('li', {}, '+' + (box.items.length - 8) + ' more'));
    card.appendChild(ul);
  }

  const qrCanvas = el('canvas');
  card.appendChild(qrCanvas);
  card.appendChild(el('div', { class: 'hint' }, 'Scan to view full contents'));

  wrap.appendChild(card);

  const errorCorrection = urlSize > 1500 ? 'L' : (urlSize > 800 ? 'M' : 'Q');
  QRCode.toCanvas(qrCanvas, url, {
    width: 400,
    margin: 1,
    errorCorrectionLevel: errorCorrection,
    color: { dark: '#000000', light: '#ffffff' }
  }, err => {
    if (err) {
      console.error(err);
      card.replaceChild(
        el('div', { style: { padding: '40px 20px', color: 'red', fontSize: '14px' } }, 'QR too large — try removing the photo or some items.'),
        qrCanvas
      );
    }
  });

  wrap.appendChild(el('div', { class: 'sticky-actions print-hide' },
    el('button', { class: 'btn primary block', onclick: () => window.print() }, '🖨️ Print label'),
    el('button', { class: 'btn', onclick: () => shareQR(box, qrCanvas) }, '⤴'),
  ));

  wrap.appendChild(el('div', { class: 'muted print-hide', style: { textAlign: 'center', marginTop: '10px', fontSize: '11px', wordBreak: 'break-all', padding: '0 20px' } },
    'Scan URL: ' + url.slice(0, 80) + (url.length > 80 ? '…' : '')
  ));

  return wrap;
}

async function shareQR(box, canvas) {
  try {
    canvas.toBlob(async blob => {
      if (!blob) { toast('Could not generate image'); return; }
      const file = new File([blob], `${box.label}-qr.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: box.label });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${box.label}-qr.png`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('QR image downloaded');
      }
    });
  } catch (e) {
    if (e.name !== 'AbortError') toast('Share cancelled');
  }
}

// ------------------------------------------------------------
// Scanner
// ------------------------------------------------------------
function renderScanner() {
  const wrap = el('div');
  wrap.appendChild(renderBackButton(() => nav('home')));
  wrap.appendChild(el('h1', { style: { fontSize: '22px', fontWeight: 600, marginBottom: '4px' } }, 'Scan a box'));
  wrap.appendChild(el('p', { class: 'muted', style: { marginBottom: '20px' } }, 'Point your camera at any box QR code.'));

  const scanWrap = el('div', { class: 'scan-wrap' });
  const video = el('video', { playsinline: true, autoplay: true, muted: true });
  scanWrap.appendChild(video);
  scanWrap.appendChild(el('div', { class: 'scan-frame' }));
  wrap.appendChild(scanWrap);

  const msg = el('div', { class: 'scan-msg' }, 'Requesting camera…');
  wrap.appendChild(msg);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let running = true;
  let stream = null;

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
      msg.textContent = 'Align the QR code inside the frame.';
      const loop = () => {
        if (!running) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            running = false;
            if (stream) stream.getTracks().forEach(t => t.stop());
            try { window.location.href = code.data; }
            catch { toast('Invalid QR'); }
            return;
          }
        }
        requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      msg.textContent = 'Camera access denied. Check your browser permissions.';
    }
  })();

  // Stop camera when leaving
  const originalNav = nav;
  const cleanup = () => { running = false; if (stream) stream.getTracks().forEach(t => t.stop()); };
  wrap.addEventListener('DOMNodeRemovedFromDocument', cleanup);
  window.addEventListener('hashchange', cleanup, { once: true });

  wrap.appendChild(el('div', { style: { marginTop: '16px', textAlign: 'center' } },
    el('p', { class: 'muted' }, 'Tip: You can also share this app\'s URL with anyone; they can scan directly with their phone camera.')
  ));

  return wrap;
}

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------
function renderSettings() {
  const wrap = el('div');
  wrap.appendChild(renderBackButton(() => nav('home')));
  wrap.appendChild(el('h1', { style: { fontSize: '22px', fontWeight: 600, marginBottom: '20px' } }, 'Settings'));

  // Stats
  const totalItems = state.boxes.reduce((sum, b) => sum + b.items.length, 0);
  const withPhotos = state.boxes.filter(b => b.photo).length;
  const statsCard = el('div', { class: 'card' },
    el('div', { class: 'section-head', style: { padding: 0, marginBottom: '10px' } }, 'Your data'),
    el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
      el('div', {}, el('div', { class: 'muted' }, 'Boxes'), el('div', { style: { fontSize: '22px', fontWeight: 600 } }, state.boxes.length)),
      el('div', {}, el('div', { class: 'muted' }, 'Total items'), el('div', { style: { fontSize: '22px', fontWeight: 600 } }, totalItems)),
      el('div', {}, el('div', { class: 'muted' }, 'With photos'), el('div', { style: { fontSize: '22px', fontWeight: 600 } }, withPhotos)),
      el('div', {}, el('div', { class: 'muted' }, 'Storage'), el('div', { style: { fontSize: '14px' } }, 'On device only'))
    )
  );
  wrap.appendChild(statsCard);

  // Backup
  const backupCard = el('div', { class: 'card' },
    el('div', { class: 'section-head', style: { padding: 0, marginBottom: '10px' } }, 'Backup'),
    el('p', { class: 'muted', style: { marginBottom: '12px' } }, 'Save all boxes as a JSON file for safekeeping. Restore any time.'),
    el('div', { class: 'stack' },
      el('button', { class: 'btn', onclick: exportBackup }, '⤴ Export all boxes'),
      el('label', { class: 'btn', style: { position: 'relative' } },
        '⤵ Import from backup',
        el('input', {
          type: 'file', accept: 'application/json',
          style: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' },
          onchange: importBackup
        })
      )
    )
  );
  wrap.appendChild(backupCard);

  // Danger
  const dangerCard = el('div', { class: 'card' },
    el('div', { class: 'section-head', style: { padding: 0, marginBottom: '10px', color: 'var(--danger)' } }, 'Danger zone'),
    el('button', {
      class: 'btn danger block',
      onclick: async () => {
        if (!confirm('Delete ALL boxes? This cannot be undone. Export a backup first if you want to keep them.')) return;
        if (!confirm('Really delete everything?')) return;
        await clearAllBoxes();
        state.boxes = [];
        toast('All boxes deleted');
        nav('home');
      }
    }, 'Delete all boxes')
  );
  wrap.appendChild(dangerCard);

  // About
  const aboutCard = el('div', { class: 'card' },
    el('div', { class: 'section-head', style: { padding: 0, marginBottom: '10px' } }, 'About'),
    el('p', { class: 'muted' }, 'Moving Boxes is a web app that stores all data locally on your device. QR codes encode each box\'s contents directly in the URL — anyone who scans can see what\'s inside without needing the app.'),
    el('p', { class: 'muted', style: { marginTop: '8px' } }, 'To install on iPhone: tap the Share button in Safari, then "Add to Home Screen".')
  );
  wrap.appendChild(aboutCard);

  return wrap;
}

async function exportBackup() {
  const boxes = await getAllBoxes();
  const data = { version: 1, exportedAt: new Date().toISOString(), boxes };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `moving-boxes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Backup downloaded');
}

async function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const boxes = Array.isArray(data) ? data : (data.boxes || []);
    if (!boxes.length) { toast('No boxes found in file'); return; }
    if (!confirm(`Import ${boxes.length} box${boxes.length === 1 ? '' : 'es'}? Existing boxes with the same ID will be replaced.`)) return;
    for (const box of boxes) {
      if (!box.id) box.id = uid();
      await saveBox(box);
    }
    state.boxes = await getAllBoxes();
    toast(`Imported ${boxes.length} box${boxes.length === 1 ? '' : 'es'}`);
    nav('home');
  } catch (err) {
    toast('Import failed — invalid file');
    console.error(err);
  }
}

// ------------------------------------------------------------
// Public viewer mode (when scanning a QR)
// ------------------------------------------------------------
function renderViewerMode(box) {
  const wrap = el('div', { class: 'viewer-wrap' });

  wrap.appendChild(el('div', { class: 'topbar' },
    el('h1', {}, 'Box contents'),
    el('button', {
      class: 'icon-btn', title: 'Open Moving Boxes',
      onclick: () => { window.location.search = ''; }
    }, iconHome())
  ));

  if (box.ph) {
    wrap.appendChild(el('img', { src: box.ph, class: 'detail-photo', alt: 'Box contents' }));
  }

  wrap.appendChild(el('div', { class: 'detail-head' },
    el('span', { class: 'emoji' }, box.e || '📦'),
    el('div', {},
      el('h2', {}, box.l || 'Untitled box'),
      box.r ? el('div', { class: 'room' }, box.r) : null
    )
  ));

  wrap.appendChild(el('div', { class: 'detail-meta' },
    box.p ? el('span', { class: 'pill ' + priorityClass(box.p) }, box.p) : null,
    box.c ? el('span', { class: 'pill' }, 'Packed ' + (box.c.includes('T') ? formatDate(box.c) : box.c)) : null
  ));

  if (Array.isArray(box.i) && box.i.length) {
    wrap.appendChild(el('div', { class: 'section-head' }, 'Items (' + box.i.length + ')'));
    const list = el('div', { class: 'item-list' });
    box.i.forEach(i => list.appendChild(el('div', { class: 'item' }, i)));
    wrap.appendChild(list);
  }

  if (box.n) {
    wrap.appendChild(el('div', { class: 'section-head' }, 'Notes'));
    wrap.appendChild(el('div', { class: 'notes-block' }, box.n));
  }

  wrap.appendChild(el('div', { style: { textAlign: 'center', marginTop: '32px' } },
    el('p', { class: 'muted', style: { marginBottom: '10px', fontSize: '12px' } }, 'Want to create your own box labels?'),
    el('button', {
      class: 'btn', onclick: () => { window.location.search = ''; }
    }, 'Open Moving Boxes')
  ));

  return wrap;
}

function renderBrokenLink() {
  return el('div', { class: 'empty' },
    el('div', { class: 'empty-icon' }, '❓'),
    el('h2', {}, 'Couldn\'t read this QR code'),
    el('p', {}, 'The link may be damaged. Try scanning again.'),
    el('button', { class: 'btn primary', onclick: () => { window.location.search = ''; } }, 'Open Moving Boxes')
  );
}

// ------------------------------------------------------------
// Shared components
// ------------------------------------------------------------
function renderTopbar({ title, actions = [] }) {
  const actionBtns = actions.map(a =>
    el('button', { class: 'icon-btn', onclick: a.onClick, title: a.label, 'aria-label': a.label }, a.icon)
  );
  return el('div', { class: 'topbar' },
    el('h1', {}, title),
    el('div', { class: 'actions' }, ...actionBtns)
  );
}

function renderBackButton(onClick) {
  return el('button', { class: 'back-btn', onclick: onClick }, '‹ Back');
}

// Icons (inline SVG)
function iconScan() {
  return el('span', { html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>' });
}
function iconGear() {
  return el('span', { html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' });
}
function iconHome() {
  return el('span', { html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' });
}

// ============================================================
// BOOT
// ============================================================
(async function boot() {
  try {
    state.boxes = await getAllBoxes();
  } catch (e) {
    console.error('DB load failed:', e);
  }
  render();
})();
