
(function () {
  'use strict';

  /* 0. 常量 */
  const LS_SETTINGS = 'todo-app:settings:v1';
  const LS_LEGACY_V2 = 'todo-app:v2';
  const LS_LEGACY_V1 = 'todo-app:v1';
  const LS_LEGACY_THEME = 'todo-app:theme';
  const DB_NAME = 'todo-app-db';
  const DB_VERSION = 2;
  const STORE_TASKS = 'tasks';
  const STORE_IMAGES = 'images';
  const STORE_TRASH = 'trash';
  const STORE_META = 'meta';
  const SCHEMA_VERSION = 3;
  const APP_ID = 'todo-app';
  const TRASH_RETENTION_DAYS = 30;

  const PALETTES = [
    { id: 'pine',   name: '松针绿', accent: '#3f6d4a', dark: '#2f5138', light: '#5d8a68', ink: '#2e3a2f', bg: '#f6f1e6' },
    { id: 'navy',   name: '海盐蓝', accent: '#3b6ea5', dark: '#2c5279', light: '#5d8fc2', ink: '#24364a', bg: '#eff3fa' },
    { id: 'violet', name: '紫藤',   accent: '#7a5ea8', dark: '#5d4687', light: '#9a80c4', ink: '#342b45', bg: '#f4effa' },
    { id: 'amber',  name: '暖橙',   accent: '#c97b3d', dark: '#a55f2b', light: '#dd9a66', ink: '#3d2f24', bg: '#faf1e7' },
    { id: 'rose',   name: '玫瑰',   accent: '#c25b76', dark: '#9e4560', light: '#d88399', ink: '#432b32', bg: '#faf0f2' },
    { id: 'slate',  name: '石墨',   accent: '#3a3a44', dark: '#292932', light: '#5b5b66', ink: '#2c2c33', bg: '#f0f0f2' }
  ];
  const BG_PRESETS = [
    { id: 'paper',  name: '暖纸白', css: 'linear-gradient(180deg,#fffdf4,#f6f1e6)' },
    { id: 'cream',  name: '奶油米', css: 'linear-gradient(160deg,#fbf5e8,#f0e6d2)' },
    { id: 'mist',   name: '晨雾蓝', css: 'linear-gradient(160deg,#eef3fb,#dbe6f4)' },
    { id: 'blush',  name: '柔粉',   css: 'linear-gradient(160deg,#fdf0f3,#f5dde5)' },
    { id: 'mint',   name: '薄荷',   css: 'linear-gradient(160deg,#eef8f0,#d9ecd8)' },
    { id: 'dusk',   name: '暮霭紫', css: 'linear-gradient(160deg,#f1ecfb,#dcd2ef)' },
    { id: 'night',  name: '子夜蓝', css: 'linear-gradient(160deg,#1f2c3f,#0f1720)', darkInk: true }
  ];
  const TAG_PRESETS = ['工作', '生活', '学习', '购物', '健康'];
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const PRIO_NAME = { 0: '低', 1: '中', 2: '高' };

  const PWA_SUPPORT = (function () {
    if (!('serviceWorker' in navigator)) return '当前浏览器不支持 Service Worker';
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      return '当前为 file:// 或 http://，部署到 https 后可用';
    }
    return '环境支持离线；请在同目录创建并注册 sw.js';
  })();

  /* 1. 通用工具 */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateFromStr(s) { if (!s) return new Date(); const p = String(s).split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(s, n) { const d = dateFromStr(s); d.setDate(d.getDate() + n); return fmtDate(d); }
  function diffDays(a, b) { const da = dateFromStr(a), db = dateFromStr(b); return Math.round((da - db) / 86400000); }
  function uid() {
    if (window.crypto && crypto.getRandomValues) {
      const b = crypto.getRandomValues(new Uint8Array(8));
      return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    }
    return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function debounce(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function dateLabelText(s) {
    const d = diffDays(todayStr(), s);
    if (d === 0) return '今天';
    if (d === 1) return '昨天';
    if (d === -1) return '明天';
    if (d === -2) return '后天';
    return s;
  }
  function weekText(s) {
    const w = WEEK[dateFromStr(s).getDay()];
    const p = s.split('-');
    return p[0] + '年' + Number(p[1]) + '月' + Number(p[2]) + '日 · 周' + w;
  }

  /* 2. IndexedDB 存储层 */
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_TASKS)) {
          const s = db.createObjectStore(STORE_TASKS, { keyPath: 'id' });
          s.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_TRASH)) db.createObjectStore(STORE_TRASH, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }
  function idbGetAll(store) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbGet(store, key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbPut(store, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbDelete(store, key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbClear(store) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function persistTask(t) { return idbPut(STORE_TASKS, t).catch(function (e) { toast('保存失败：' + (e && e.message || e), 'error'); throw e; }); }
  function persistTrash(t) { return idbPut(STORE_TRASH, t).catch(function (e) { toast('保存失败：' + (e && e.message || e), 'error'); throw e; }); }
  function persistMeta(key, val) { return idbPut(STORE_META, { key: key, value: val }); }
  function getMeta(key) { return idbGet(STORE_META, key).then(function (r) { return r ? r.value : null; }); }
  function idbPutMany(store, list) {
    if (!list.length) return Promise.resolve();
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(store, 'readwrite');
        const s = tx.objectStore(store);
        list.forEach(function (v) { s.put(v); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* 3. 设置 */
  const DEFAULT_SETTINGS = {
    theme: { paletteId: 'pine', bgMode: 'color', bgId: 'paper', bgImageId: null, dark: 'auto' },
    overduePolicy: 'keep',
    reminders: { enabled: false, notified: {} },
    sortMode: 'manual',
    viewMode: 'day',
    migrated: false
  };
  let settings = loadSettings();
  function loadSettings() {
    const def = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    try {
      const raw = localStorage.getItem(LS_SETTINGS);
      if (raw) {
        const p = JSON.parse(raw);
        return Object.assign(def, p, {
          theme: Object.assign(def.theme, p.theme || {}),
          reminders: Object.assign(def.reminders, p.reminders || {})
        });
      }
    } catch (e) {}
    return def;
  }
  function saveSettings() {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); broadcast({ type: 'settings' }); }
    catch (e) { toast('设置保存失败：' + e.message, 'error'); }
  }

  /* 4. 状态 */
  let todos = [];
  let trash = [];
  let viewDate = todayStr();
  let viewMode = settings.viewMode || 'day';
  let searchQuery = '';
  let currentFilter = 'all';
  let currentList = 'all';
  let batchMode = false;
  let selected = new Set();
  let editingId = null;
  let draggingId = null;
  let calMonth = null;
  let newTaskIds = new Set();   // 本次渲染新增的 id，用于入场动画

  /* 5. 迁移 */
  function migrateFromLocalStorage() {
    return getMeta('migrated').then(function (migrated) {
      if (migrated) return false;
      const migratedTasks = [];
      try {
        const raw2 = localStorage.getItem(LS_LEGACY_V2);
        if (raw2) {
          const arr = JSON.parse(raw2);
          if (Array.isArray(arr)) {
            arr.forEach(function (t, i) {
              if (t && t.date && typeof t.title === 'string') {
                migratedTasks.push(normalizeTask({
                  id: t.id || ('mig-' + i + '-' + uid()),
                  title: t.title, desc: t.desc || '', date: t.date, done: !!t.done,
                  priority: t.priority, tags: t.tags, due: t.due, dueTime: t.dueTime,
                  remind: t.remind, repeat: t.repeat, subtasks: t.subtasks,
                  order: typeof t.order === 'number' ? t.order : i,
                  createdAt: t.createdAt, completedAt: t.completedAt
                }));
              }
            });
          }
        }
      } catch (e) {}
      if (migratedTasks.length === 0) {
        try {
          const raw1 = localStorage.getItem(LS_LEGACY_V1);
          if (raw1) {
            const arr = JSON.parse(raw1);
            if (Array.isArray(arr)) {
              arr.forEach(function (t, i) {
                if (t && typeof t.title === 'string') {
                  migratedTasks.push(normalizeTask({
                    id: 'mig-' + i + '-' + uid(), title: t.title, desc: t.desc || '',
                    date: todayStr(), done: !!t.done, order: i
                  }));
                }
              });
            }
          }
        } catch (e) {}
      }
      try {
        const rawTheme = localStorage.getItem(LS_LEGACY_THEME);
        if (rawTheme) {
          const t = JSON.parse(rawTheme);
          if (t && t.paletteId) settings.theme.paletteId = t.paletteId;
          if (t && t.bgMode) settings.theme.bgMode = t.bgMode;
          if (t && t.bgId) settings.theme.bgId = t.bgId;
          if (t && t.bgImage) {
            return idbPut(STORE_IMAGES, { id: 'bg-image', dataUrl: t.bgImage, migratedAt: Date.now() })
              .then(function () { settings.theme.bgImageId = 'bg-image'; settings.theme.bgMode = 'image'; return writeMigratedTasks(migratedTasks); });
          }
        }
      } catch (e) {}
      return writeMigratedTasks(migratedTasks);
    });
  }
  function writeMigratedTasks(list) {
    if (list.length === 0) { settings.migrated = true; saveSettings(); return persistMeta('migrated', true); }
    // P0-5：单事务写入
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE_TASKS, 'readwrite');
        const s = tx.objectStore(STORE_TASKS);
        list.forEach(function (t) { s.put(t); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).then(function () { settings.migrated = true; saveSettings(); return persistMeta('migrated', true); });
  }
  function normalizeTask(t) {
    const now = Date.now();
    return {
      id: t.id || uid(),
      title: String(t.title || '').trim().slice(0, 500),
      desc: String(t.desc || '').trim(),
      date: t.date || todayStr(),
      done: !!t.done,
      priority: (t.priority === 0 || t.priority === 1 || t.priority === 2) ? t.priority : 1,
      tags: Array.isArray(t.tags) ? t.tags.filter(Boolean).slice(0, 20) : [],
      due: t.due || null,
      dueTime: t.dueTime || null,
      remind: !!t.remind,
      repeat: t.repeat && typeof t.repeat === 'object' ? t.repeat : null,
      repeatGeneratedAt: t.repeatGeneratedAt || null,
      subtasks: Array.isArray(t.subtasks) ? t.subtasks.map(function (s) { return { id: s.id || uid(), title: String(s.title || ''), done: !!s.done }; }) : [],
      order: typeof t.order === 'number' ? t.order : 0,
      createdAt: t.createdAt || now,
      updatedAt: now,
      completedAt: t.completedAt || null,
      notifiedAt: t.notifiedAt || null,
      rolledFrom: t.rolledFrom || null,
      deletedAt: t.deletedAt || null
    };
  }

  /* 6. 数据加载 + 30 天回收站清理 */
  function loadAll() {
    return Promise.all([idbGetAll(STORE_TASKS), idbGetAll(STORE_TRASH)])
      .then(function (res) {
        todos = res[0].map(normalizeTask).filter(function (t) { return !t.deletedAt; }).sort(byOrder);
        trash = res[1].map(normalizeTask);
        // P1-7：30 天自动清理
        const cutoff = Date.now() - TRASH_RETENTION_DAYS * 86400000;
        const expired = trash.filter(function (t) { return (t.deletedAt || 0) < cutoff; });
        if (expired.length) {
          trash = trash.filter(function (t) { return (t.deletedAt || 0) >= cutoff; });
          expired.forEach(function (t) { idbDelete(STORE_TRASH, t.id).catch(function () {}); });
        }
        return todos;
      });
  }

  /* 7. Toast / 确认 / 撤销 */
  function toast(msg, type, duration) {
    const wrap = document.getElementById('toastWrap');
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 350); }, duration || 3200);
    return el;
  }
  function toastWithUndo(msg, undoFn, duration) {
    const wrap = document.getElementById('toastWrap');
    const el = document.createElement('div');
    el.className = 'toast';
    const span = document.createElement('span');
    span.textContent = msg;
    const btn = document.createElement('button');
    btn.className = 'undo'; btn.textContent = '撤销';
    el.appendChild(span); el.appendChild(btn);
    wrap.appendChild(el);
    const done = function () { el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 350); };
    btn.addEventListener('click', function () { try { undoFn(); } catch (e) {} done(); });
    setTimeout(done, duration || 6000);
    return el;
  }
  let confirmCallback = null;
  function confirmDialog(title, text, okLabel, onOk) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmText').textContent = text;
    document.getElementById('confirmOk').textContent = okLabel || '确定';
    confirmCallback = onOk;
    document.getElementById('confirmOverlay').classList.add('show');
    focusPanel(document.getElementById('confirmOverlay'));
  }
  function closeConfirm() { document.getElementById('confirmOverlay').classList.remove('show'); confirmCallback = null; }

  /* 8. 主题 */
  function paletteById(id) { for (let i = 0; i < PALETTES.length; i++) if (PALETTES[i].id === id) return PALETTES[i]; return PALETTES[0]; }
  function bgById(id) { for (let i = 0; i < BG_PRESETS.length; i++) if (BG_PRESETS[i].id === id) return BG_PRESETS[i]; return BG_PRESETS[0]; }
  function effectiveDark() {
    const d = settings.theme.dark;
    if (d === 'dark') return true;
    if (d === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function applyTheme() {
    return Promise.resolve().then(function () {
      const pal = paletteById(settings.theme.paletteId);
      // 关键改造：主题变量只写入 .app-tasks 作用域，绝不污染全站 token
      const rootEl = document.querySelector('.app-tasks') || document.documentElement;
      const root = rootEl.style;
      ['--bg', '--ink', '--paper', '--line', '--muted'].forEach(function (k) { root.removeProperty(k); });
      root.setProperty('--accent', pal.accent);
      root.setProperty('--accent-dark', pal.dark);
      root.setProperty('--accent-light', pal.light);

      const doDark = function () {
        // 深色由站点 prefers-color-scheme 统一控制；仅在应用作用域补充调色板
        if (effectiveDark()) {
          root.setProperty('--accent', pal.accent);
          root.setProperty('--accent-dark', pal.light);
          root.setProperty('--accent-light', pal.light);
        }
        if (typeof renderThemePanel === 'function') renderThemePanel();
      };
      // 背景交给站点，不再接管整页背景图
      doDark();
    });
  }
  function saveBgImage(dataUrl) {
    return idbPut(STORE_IMAGES, { id: 'bg-image', dataUrl: dataUrl, updatedAt: Date.now() })
      .then(function () { settings.theme.bgImageId = 'bg-image'; settings.theme.bgMode = 'image'; saveSettings(); return applyTheme(); })
      .catch(function (e) { toast('图片保存失败：' + e.message, 'error'); });
  }
  function renderThemePanel() {
    const colorSwatches = document.getElementById('colorSwatches');
    if (!colorSwatches) return;
    const colorName = document.getElementById('colorName');
    const bgOptions = document.getElementById('bgOptions');
    colorSwatches.innerHTML = '';
    PALETTES.forEach(function (p) {
      const s = document.createElement('div');
      s.className = 'swatch' + (settings.theme.paletteId === p.id ? ' active' : '');
      s.style.background = p.accent;
      s.title = p.name;
      s.addEventListener('click', function () { settings.theme.paletteId = p.id; saveSettings(); applyTheme(); });
      colorSwatches.appendChild(s);
    });
    colorName.textContent = '当前主色：' + paletteById(settings.theme.paletteId).name;

    const darkOptions = document.getElementById('darkModeOptions');
    darkOptions.innerHTML = '';
    [
      { id: 'auto', name: '跟随系统', icon: '🌓' },
      { id: 'light', name: '始终浅色', icon: '☀️' },
      { id: 'dark', name: '始终深色', icon: '🌙' }
    ].forEach(function (d) {
      const label = document.createElement('label');
      label.className = 'bg-choice' + (settings.theme.dark === d.id ? ' active' : '');
      label.innerHTML = '<span class="radio"></span><span>' + d.icon + ' ' + d.name + '</span>';
      label.addEventListener('click', function () { settings.theme.dark = d.id; saveSettings(); applyTheme(); });
      darkOptions.appendChild(label);
    });

    bgOptions.innerHTML = '';
    BG_PRESETS.forEach(function (b) {
      const label = document.createElement('label');
      label.className = 'bg-choice' + (settings.theme.bgMode === 'color' && settings.theme.bgId === b.id ? ' active' : '');
      label.innerHTML = '<span class="radio"></span><span>' + b.name + '</span>';
      label.style.background = b.css;
      label.style.color = b.darkInk ? '#e8edf2' : '#333';
      label.addEventListener('click', function () { settings.theme.bgMode = 'color'; settings.theme.bgId = b.id; settings.theme.bgImageId = null; saveSettings(); applyTheme(); });
      bgOptions.appendChild(label);
    });
    const custom = document.createElement('label');
    custom.className = 'bg-choice' + (settings.theme.bgMode === 'image' ? ' active' : '');
    custom.innerHTML = '<span class="radio"></span><span>📷 使用本地图片</span>';
    custom.addEventListener('click', function () {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.addEventListener('change', function () {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
          const img = new Image();
          img.onload = function () {
            const canvas = document.createElement('canvas');
            const maxW = 1600;
            const scale = Math.min(1, maxW / img.width);
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            saveBgImage(canvas.toDataURL('image/jpeg', 0.8)).then(function () { toast('背景图片已更新'); });
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
      input.click();
    });
    bgOptions.appendChild(custom);
  }

  /* 9. 列表渲染 */
  function byOrder(a, b) { return (a.order || 0) - (b.order || 0); }
  function isOverdue(t) { return !t.done && t.date < todayStr(); }

  function visibleTasks() {
    let list = todos.filter(function (t) { return !t.deletedAt; });
    // P1-1：聚合视图优先
    if (viewMode === 'today') {
      list = list.filter(function (t) { return t.date === todayStr(); });
    } else if (viewMode === 'undone') {
      list = list.filter(function (t) { return !t.done; });
    } else if (viewMode === 'overdue') {
      list = list.filter(function (t) { return !t.done && t.date < todayStr(); });
    } else {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter(function (t) {
          return (t.title || '').toLowerCase().indexOf(q) >= 0 ||
                 (t.desc || '').toLowerCase().indexOf(q) >= 0 ||
                 (t.tags || []).some(function (tag) { return String(tag).toLowerCase().indexOf(q) >= 0; });
        });
      } else {
        list = list.filter(function (t) { return t.date === viewDate; });
      }
    }
    // 聚合视图下搜索依然生效
    if (viewMode !== 'day' && searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(function (t) {
        return (t.title || '').toLowerCase().indexOf(q) >= 0 ||
               (t.desc || '').toLowerCase().indexOf(q) >= 0 ||
               (t.tags || []).some(function (tag) { return String(tag).toLowerCase().indexOf(q) >= 0; });
      });
    }
    if (currentList !== 'all') list = list.filter(function (t) { return (t.tags || []).indexOf(currentList) >= 0; });
    if (currentFilter === 'active') list = list.filter(function (t) { return !t.done; });
    else if (currentFilter === 'done') list = list.filter(function (t) { return t.done; });
    return sortTasks(list);
  }

  function sortTasks(list) {
    const arr = list.slice();
    const mode = settings.sortMode;
    if (viewMode === 'overdue') {
      arr.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
      return arr;
    }
    if (mode === 'priority') {
      arr.sort(function (a, b) { return (b.priority || 0) - (a.priority || 0) || (a.order || 0) - (b.order || 0); });
    } else if (mode === 'due') {
      arr.sort(function (a, b) {
        const av = (a.due || a.date || '') + ' ' + (a.dueTime || '');
        const bv = (b.due || b.date || '') + ' ' + (b.dueTime || '');
        return av < bv ? -1 : av > bv ? 1 : (a.order || 0) - (b.order || 0);
      });
    } else if (mode === 'created') {
      arr.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    } else {
      arr.sort(byOrder);
    }
    return arr;
  }

  function subtaskDoneCount(t) { return (t.subtasks || []).filter(function (s) { return s.done; }).length; }

  function taskHTML(t) {
    const prio = t.priority;
    const subDone = subtaskDoneCount(t);
    const subTotal = (t.subtasks || []).length;
    const overdueDays = isOverdue(t) ? diffDays(todayStr(), t.date) : 0;
    let chips = '';
    // P2-1：低优先级不显示 chip
    if (prio === 2) chips += '<span class="chip pri p2" title="优先级：高">↑ 高</span>';
    (t.tags || []).forEach(function (tag) { chips += '<span class="chip tag">#' + esc(tag) + '</span>'; });
    if (t.repeat) chips += '<span class="chip" title="重复任务">↻ ' + repeatName(t.repeat) + '</span>';
    // P1-3：计划日期 + 截止
    if (t.date) chips += '<span class="chip plan-chip" title="计划：' + esc(t.date) + '">📅 计划 ' + esc(t.date) + '</span>';
    if (t.due) chips += '<span class="chip due-chip" title="截止：' + esc(t.due) + (t.dueTime ? ' ' + esc(t.dueTime) : '') + '">⏰ 截止 ' + esc(t.due) + (t.dueTime ? ' ' + esc(t.dueTime) : '') + '</span>';
    if (t.remind && ('Notification' in window) && Notification.permission !== 'denied') chips += '<span class="chip" title="到点提醒">🔔</span>';
    if (overdueDays > 0) chips += '<span class="chip overdue-chip">⏰ 逾期 ' + overdueDays + ' 天</span>';

    let subHTML = '';
    if (subTotal > 0) {
      const pct = Math.round(subDone / subTotal * 100);
      subHTML = '<div class="subtask-progress" data-action="toggle-subtasks" title="展开/收起子任务"><span>' + subDone + '/' + subTotal + '</span><span class="bar"><i style="width:' + pct + '%"></i></span></div>' +
        '<div class="subtask-list">' + (t.subtasks || []).map(function (s) {
          return '<div class="st-row' + (s.done ? ' done' : '') + '"><button class="st-check" data-action="toggle-subtask" data-sid="' + s.id + '" aria-label="勾选子任务"></button><span class="st-title">' + esc(s.title) + '</span></div>';
        }).join('') + '</div>';
    }

    const batchChk = batchMode
      ? '<button class="batch-check' + (selected.has(t.id) ? ' checked' : '') + '" data-action="batch-select" aria-label="选择任务"></button>'
      : '';

    const descBtn = (t.desc ? '<button class="desc-toggle" data-action="toggle-desc" aria-expanded="false">备注 <span class="arrow">▼</span></button>' : '');
    const descHTML = (t.desc ? '<div class="todo-desc">' + esc(t.desc) + '</div>' : '');

    // P1-5：移动端上下移动按钮
    const moveBtns = (settings.sortMode === 'manual' && !batchMode) ? (
      '<button class="icon-btn" data-action="move-up" aria-label="上移">↑</button>' +
      '<button class="icon-btn" data-action="move-down" aria-label="下移">↓</button>'
    ) : '';

    return '<div class="todo-item' + (t.done ? ' done' : '') + (isOverdue(t) ? ' overdue' : '') + (batchMode ? ' batch-mode' : '') + (selected.has(t.id) ? ' batch-on' : '') + (newTaskIds.has(t.id) ? ' is-new' : '') + '" data-id="' + t.id + '" draggable="' + (settings.sortMode === 'manual' && !batchMode) + '">' +
      batchChk +
      '<button class="todo-check" data-action="toggle" role="checkbox" aria-checked="' + t.done + '" aria-label="' + (t.done ? '标记为未完成' : '标记为已完成') + '"><svg viewBox="0 0 24 24"><polyline points="4 12 9 17 20 6"/></svg></button>' +
      '<div class="todo-body">' +
        '<div class="todo-head-row">' +
          '<div class="todo-title">' + esc(t.title) + '</div>' +
          descBtn +
        '</div>' +
        (chips ? '<div class="todo-head-row" style="margin-top:4px;">' + chips + '</div>' : '') +
        descHTML +
        subHTML +
      '</div>' +
      '<div class="todo-actions">' +
        moveBtns +
        '<button class="icon-btn" data-action="edit" aria-label="编辑"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>' +
        (isOverdue(t) ? '<button class="icon-btn" data-action="roll" aria-label="顺延到今天" title="顺延到今天"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg></button>' : '') +
        '<button class="icon-btn del" data-action="delete" aria-label="删除"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
      '</div>' +
    '</div>';
  }

  function editFormHTML(t) {
    const prioOpts = [0, 1, 2].map(function (p) { return '<option value="' + p + '"' + (t.priority === p ? ' selected' : '') + '>优先级：' + PRIO_NAME[p] + '</option>'; }).join('');
    const repOpts = [
      ['', '不重复'], ['daily', '每天'], ['weekday', '工作日'], ['weekly', '每周'], ['custom', '自定义（周几）']
    ].map(function (r) { return '<option value="' + r[0] + '"' + (t.repeat && t.repeat.freq === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('');
    const wd = (t.repeat && t.repeat.freq === 'custom' && t.repeat.weekdays) ? t.repeat.weekdays : [1, 3, 5];
    const wdPicker = '<div class="weekday-picker' + (t.repeat && t.repeat.freq === 'custom' ? ' show' : '') + '" id="ef-weekdays">' +
      [1,2,3,4,5,6,0].map(function (d) {
        return '<label class="' + (wd.indexOf(d) >= 0 ? 'on' : '') + '"><input type="checkbox" value="' + d + '"' + (wd.indexOf(d) >= 0 ? ' checked' : '') + '>' + WEEK[d] + '</label>';
      }).join('') + '</div>';
    const subEditor = '<div class="subtask-editor" id="ef-subtasks">' +
      (t.subtasks || []).map(function (s) {
        return '<div class="se-row" data-sid="' + s.id + '"><input type="checkbox"' + (s.done ? ' checked' : '') + '><input type="text" value="' + esc(s.title) + '" placeholder="子任务"><button class="se-del" type="button">✕</button></div>';
      }).join('') +
      '<button class="se-add" type="button" data-action="se-add">+ 添加子任务</button></div>';
    return '<div class="todo-item editing" data-id="' + t.id + '">' +
      '<div class="edit-form">' +
        '<input type="text" id="ef-title" class="input-todo" value="' + esc(t.title) + '" placeholder="任务标题" aria-label="任务标题">' +
        '<textarea id="ef-desc" placeholder="备注（可选）" rows="2" aria-label="备注">' + esc(t.desc || '') + '</textarea>' +
        '<div class="edit-grid">' +
          '<label>优先级<select id="ef-prio" aria-label="优先级">' + prioOpts + '</select></label>' +
          '<label>计划日期<input type="date" id="ef-date" value="' + esc(t.date) + '" aria-label="计划日期"></label>' +
          '<label>截止日期<input type="date" id="ef-due" value="' + esc(t.due || '') + '" aria-label="截止日期"></label>' +
          '<label>截止时间<input type="time" id="ef-duetime" value="' + esc(t.dueTime || '') + '" aria-label="截止时间"></label>' +
          '<label>重复<select id="ef-repeat" aria-label="重复">' + repOpts + '</select></label>' +
          '<label>标签（逗号分隔）<input type="text" id="ef-tags" value="' + esc((t.tags || []).join(',')) + '" aria-label="标签"></label>' +
        '</div>' +
        wdPicker +
        '<label class="edit-remind"><input type="checkbox" id="ef-remind"' + (t.remind ? ' checked' : '') + '> 截止时本地通知（仅页面打开时）</label>' +
        subEditor +
        '<div class="edit-actions">' +
          '<button class="btn-cancel" data-action="cancel-edit">取消</button>' +
          '<button class="btn-save" data-action="save-edit">保存</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function repeatName(r) {
    if (!r) return '';
    if (r.freq === 'daily') return '每天';
    if (r.freq === 'weekday') return '工作日';
    if (r.freq === 'weekly') return '每周';
    if (r.freq === 'custom' && r.weekdays) return '每周' + r.weekdays.map(function (d) { return WEEK[d]; }).join('、');
    return '重复';
  }

  // P2-3：keyed 局部更新
  function render() {
    const dateLabel = document.getElementById('dateLabel');
    const weekLabel = document.getElementById('weekLabel');
    dateLabel.textContent = dateLabelText(viewDate);
    weekLabel.textContent = weekText(viewDate);

    // 聚合视图时隐藏日期翻页
    const dateNav = document.querySelector('.date-nav');
    if (dateNav) dateNav.style.visibility = viewMode === 'day' ? 'visible' : 'hidden';
    // 更新 tabs 激活态
    document.querySelectorAll('.view-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === viewMode);
      b.setAttribute('aria-selected', b.dataset.view === viewMode ? 'true' : 'false');
    });

    const searchClear = document.getElementById('searchClear');
    searchClear.classList.toggle('show', !!searchQuery);

    const list = visibleTasks();
    const todoList = document.getElementById('todoList');
    const existing = {};
    Array.prototype.forEach.call(todoList.querySelectorAll('.todo-item'), function (el) { existing[el.dataset.id] = el; });

    const frag = document.createDocumentFragment();
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      const emoji = document.createElement('span');
      emoji.className = 'emoji';
      emoji.textContent = currentFilter === 'done' ? '🎉' : (viewMode === 'overdue' ? '✅' : '🗒️');
      const text = document.createElement('span');
      if (searchQuery) text.textContent = '没有匹配「' + searchQuery + '」的任务';
      else if (currentFilter === 'done') text.textContent = '暂无已完成事项';
      else if (viewMode === 'overdue') text.textContent = '没有逾期任务，真棒！';
      else if (viewMode === 'undone') text.textContent = '所有任务都完成了 🎉';
      else if (currentFilter === 'active') text.textContent = '这一天没有未完成的事项';
      else text.textContent = '还没有待办，添加一个开始吧';
      empty.appendChild(emoji); empty.appendChild(text);
      if (!searchQuery && !batchMode) {
        const hint = document.createElement('div');
        hint.className = 'hint';
        hint.textContent = '支持自然语言：明天3点开会 #工作 !高 · 每天跑步';
        empty.appendChild(hint);
      }
      frag.appendChild(empty);
    } else {
      list.forEach(function (t) {
        const wrap = document.createElement('div');
        wrap.innerHTML = editingId === t.id ? editFormHTML(t) : taskHTML(t);
        const newEl = wrap.firstElementChild;
        // keyed 复用：如果已有节点且不是编辑态，直接替换内容
        if (existing[t.id] && editingId !== t.id) {
          const oldEl = existing[t.id];
          oldEl.className = newEl.className;
          oldEl.innerHTML = newEl.innerHTML;
          frag.appendChild(oldEl);
        } else {
          frag.appendChild(newEl);
        }
      });
    }
    todoList.innerHTML = '';
    todoList.appendChild(frag);
    newTaskIds.clear();

    updateStats();
    renderListChips();
  }

  function refreshTask(id) {
    const el = document.querySelector('#todoList .todo-item[data-id="' + id + '"]');
    if (!el) return;
    const t = todos.find(function (x) { return x.id === id; });
    if (!t) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = editingId === id ? editFormHTML(t) : taskHTML(t);
    el.replaceWith(wrap.firstElementChild);
  }

  function updateStats() {
    const countEl = document.getElementById('count');
    let day;
    if (viewMode === 'today') day = todos.filter(function (t) { return t.date === todayStr() && !t.deletedAt; });
    else if (viewMode === 'undone') day = todos.filter(function (t) { return !t.done && !t.deletedAt; });
    else if (viewMode === 'overdue') day = todos.filter(function (t) { return !t.done && t.date < todayStr() && !t.deletedAt; });
    else day = todos.filter(function (t) { return t.date === viewDate && !t.deletedAt; });
    const remaining = day.filter(function (t) { return !t.done; }).length;
    const done = day.length - remaining;
    if (searchQuery) countEl.textContent = '搜索到 ' + visibleTasks().length + ' 项';
    else if (viewMode === 'overdue') countEl.textContent = remaining + ' 项逾期';
    else if (viewMode === 'undone') countEl.textContent = remaining + ' 项未完成';
    else countEl.textContent = remaining + ' 项未完成' + (done > 0 ? ' · ' + done + ' 项已完成' : '');
    const clearBtn = document.getElementById('clearDoneBtn');
    clearBtn.style.display = done > 0 ? '' : 'none';
    const total = todos.filter(function (t) { return !t.deletedAt; }).length;
    document.getElementById('footerNote').textContent = '共 ' + total + ' 项任务 · 本地离线可用 · 数据存于 IndexedDB';
  }

  // P1-4：动态标签
  function renderListChips() {
    const chipsEl = document.getElementById('listChips');
    chipsEl.innerHTML = '';
    const tagCount = {};
    todos.forEach(function (t) {
      if (t.deletedAt) return;
      (t.tags || []).forEach(function (tag) { tagCount[tag] = (tagCount[tag] || 0) + 1; });
    });
    let tags = Object.keys(tagCount).sort(function (a, b) { return tagCount[b] - tagCount[a]; }).slice(0, 10);
    if (tags.length === 0) tags = TAG_PRESETS.slice();
    if (currentList !== 'all' && tags.indexOf(currentList) < 0) currentList = 'all';
    const defs = ['all'].concat(tags);
    defs.forEach(function (tag) {
      const b = document.createElement('button');
      b.className = 'chip-btn' + (currentList === tag ? ' active' : '');
      b.textContent = tag === 'all' ? '全部清单' : '#' + tag;
      b.addEventListener('click', function () { currentList = tag; render(); });
      chipsEl.appendChild(b);
    });
  }

  /* 10. 任务操作 */
  function nextOrderFor() {
    let min = 0;
    todos.forEach(function (t) { if (t.date === viewDate && (t.order || 0) < min) min = t.order; });
    return min - 1;
  }

  function parseNaturalInput(str) {
    const out = { title: '', date: viewDate, dueTime: '', priority: 1, tags: [], repeat: null };
    let s = str.trim();
    if (!s) return out;
    const pm = s.match(/!(高|中|低)/);
    if (pm) { out.priority = { '高': 2, '中': 1, '低': 0 }[pm[1]]; s = s.replace(pm[0], ' '); }
    s = s.replace(/#([^\s#，,]+)/g, function (m, t) { out.tags.push(t); return ' '; });
    const rm = s.match(/(每天|每日|每周|工作日)/);
    if (rm) {
      out.repeat = { freq: rm[1] === '每天' || rm[1] === '每日' ? 'daily' : rm[1] === '每周' ? 'weekly' : 'weekday', interval: 1 };
      s = s.replace(rm[0], ' ');
    }
    const dm = s.match(/(大后天|后天|明天|今天|下个?周[一二三四五六日天]|下周[一二三四五六日天]|周[一二三四五六日天]|星期[一二三四五六日天]|(\d{4})[-/](\d{1,2})[-/](\d{1,2})|(\d{1,2})月(\d{1,2})[日号])/);
    if (dm) {
      let d;
      const tok = dm[0];
      if (tok === '今天') d = dateFromStr(viewDate);
      else if (tok === '明天') d = dateFromStr(addDays(viewDate, 1));
      else if (tok === '后天') d = dateFromStr(addDays(viewDate, 2));
      else if (tok === '大后天') d = dateFromStr(addDays(viewDate, 3));
      else if (tok.indexOf('下周') === 0 || tok.indexOf('下个周') === 0) {
        const wd = WEEK.indexOf(tok.replace('下周', '').replace('下个周', '').replace('周', '').replace('天', '日'));
        d = dateFromStr(addDays(viewDate, 7));
        d.setDate(d.getDate() + ((wd + 7 - d.getDay()) % 7));
      } else if (tok.indexOf('周') === 0 || tok.indexOf('星期') === 0) {
        const wd = WEEK.indexOf(tok.replace('周', '').replace('星期', '').replace('天', '日'));
        d = dateFromStr(viewDate);
        d.setDate(d.getDate() + ((wd + 7 - d.getDay()) % 7));
      } else if (dm[2]) {
        d = new Date(Number(dm[2]), Number(dm[3]) - 1, Number(dm[4]));
      } else if (dm[5]) {
        const y = viewDate.slice(0, 4);
        d = new Date(Number(y), Number(dm[5]) - 1, Number(dm[6]));
        if (d < dateFromStr(viewDate)) d = new Date(Number(y) + 1, Number(dm[5]) - 1, Number(dm[6]));
      }
      out.date = fmtDate(d);
      s = s.replace(dm[0], ' ');
    }
    const tm = s.match(/(凌晨|早上|上午|中午|下午|晚上|傍晚)?\s*(\d{1,2})[：:点时](?:(\d{1,2})|(半))?\s*(?:分)?\s*(?=[^\d]|$)/);
    if (tm) {
      let h = Number(tm[2]);
      const part = tm[1] || '';
      if ((part === '下午' || part === '晚上' || part === '傍晚') && h < 12) h += 12;
      if (part === '中午' && h < 12) h = 12;
      const m = tm[3] ? Number(tm[3]) : (tm[4] === '半' ? 30 : 0);
      if (h >= 0 && h < 24 && m >= 0 && m < 60) out.dueTime = pad(h) + ':' + pad(m);
      s = s.replace(tm[0], ' ');
    }
    out.title = s.replace(/\s+/g, ' ').trim();
    return out;
  }

  function getAddWeekdays() {
    const els = document.querySelectorAll('#addWeekdays input:checked');
    return Array.from(els).map(function (e) { return Number(e.value); });
  }

  function addTodo() {
    const input = document.getElementById('todoInput');
    const raw = input.value.trim();
    const rawDesc = document.getElementById('descInput').value.replace(/\s+$/g, '');
    if (!raw) { document.getElementById('errorMsg').classList.add('show'); input.focus(); return; }
    document.getElementById('errorMsg').classList.remove('show');

    const parsed = parseNaturalInput(raw);
    let date = viewDate, priority = 1, tags = [], repeat = null, remind = false, dueTime = parsed.dueTime;
    let due = null;

    const dateSel = document.getElementById('addDateSel');
    const datePicker = document.getElementById('addDatePicker');
    if (dateSel.value === 'today') date = todayStr();
    else if (dateSel.value === 'tomorrow') date = addDays(todayStr(), 1);
    else if (dateSel.value === 'custom' && datePicker.value) date = datePicker.value;
    priority = Number(document.getElementById('addPrio').value);

    // P1-3：显式截止
    const dueDateInput = document.getElementById('addDueDate').value;
    const dueTimeInput = document.getElementById('addDueTime').value;
    if (dueDateInput) due = dueDateInput;
    if (dueTimeInput) dueTime = dueTimeInput;

    const tagRaw = document.getElementById('addTags').value.trim();
    if (tagRaw) tags = tagRaw.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
    const repSel = document.getElementById('addRepeat').value;
    if (repSel) {
      repeat = { freq: repSel, interval: 1 };
      if (repSel === 'custom') {
        const wd = getAddWeekdays();
        repeat.weekdays = wd.length ? wd : [1, 3, 5];
      }
    }
    remind = document.getElementById('addRemind').checked;

    if (parsed.date !== viewDate) date = parsed.date;
    if (parsed.dueTime && !remind) { dueTime = parsed.dueTime; remind = true; }
    if (parsed.tags.length) tags = tags.concat(parsed.tags);
    if (parsed.priority !== 1 && priority === 1) priority = parsed.priority;
    if (parsed.repeat && !repeat) repeat = parsed.repeat;

    // P1-2：解析出的时间同时设置 due
    if (dueTime && !due) due = (parsed.date !== viewDate ? parsed.date : date) || date;

    const title = parsed.title || raw;
    const task = normalizeTask({
      id: uid(), title: title, desc: rawDesc, date: date, done: false,
      priority: priority, tags: tags.slice(0, 20),
      due: due, dueTime: dueTime, remind: remind, repeat: repeat,
      order: nextOrderFor(), createdAt: Date.now()
    });
    todos.unshift(task);
    newTaskIds.add(task.id);
    persistTask(task)
      .then(function () { broadcast({ type: 'data' }); render(); })
      .catch(function () { todos = todos.filter(function (t) { return t.id !== task.id; }); render(); });
    input.value = '';
    document.getElementById('descInput').value = '';
    document.getElementById('addTags').value = '';
    document.getElementById('addPrio').value = '1';
    document.getElementById('addDateSel').value = 'today';
    document.getElementById('addDatePicker').value = '';
    document.getElementById('addDueDate').value = '';
    document.getElementById('addDueTime').value = '';
    document.getElementById('addRepeat').value = '';
    document.getElementById('addRemind').checked = false;
    document.getElementById('addWeekdays').classList.remove('show');
    document.querySelectorAll('#addWeekdays input').forEach(function (c) { c.checked = false; document.querySelectorAll('#addWeekdays label').forEach(function (l) { l.classList.remove('on'); }); });
    input.focus();
    if (remind && !('Notification' in window)) toast('提醒需要较新浏览器支持', 'error');
  }

  function toggleDone(id) {
    const t = todos.find(function (x) { return x.id === id; });
    if (!t) return;
    t.done = !t.done;
    t.completedAt = t.done ? Date.now() : null;
    t.updatedAt = Date.now();
    persistTask(t).then(function () {
      if (t.done) maybeGenerateRepeats();
      broadcast({ type: 'data' });
      render();
    }).catch(function () { render(); });
  }

  function toggleSubtask(id, sid) {
    const t = todos.find(function (x) { return x.id === id; });
    if (!t) return;
    const s = (t.subtasks || []).find(function (x) { return x.id === sid; });
    if (!s) return;
    s.done = !s.done;
    t.updatedAt = Date.now();
    persistTask(t).then(function () { render(); });
  }

  function startEdit(id) {
    editingId = id;
    render();
    const inp = document.getElementById('ef-title');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  function saveEdit(id) {
    const t = todos.find(function (x) { return x.id === id; });
    if (!t) return;
    const title = (document.getElementById('ef-title').value || '').trim();
    if (!title) { toast('标题不能为空', 'error'); return; }
    t.title = title;
    t.desc = (document.getElementById('ef-desc').value || '').replace(/\s+$/g, '');
    t.priority = Number(document.getElementById('ef-prio').value);
    t.date = document.getElementById('ef-date').value || t.date;
    t.due = document.getElementById('ef-due').value || null;
    t.dueTime = document.getElementById('ef-duetime').value || null;
    t.remind = document.getElementById('ef-remind').checked;
    const rep = document.getElementById('ef-repeat').value;
    if (rep) {
      t.repeat = { freq: rep, interval: 1 };
      if (rep === 'custom') {
        const wd = Array.from(document.querySelectorAll('#ef-weekdays input:checked')).map(function (e) { return Number(e.value); });
        t.repeat.weekdays = wd.length ? wd : [1, 3, 5];
      }
    } else { t.repeat = null; }
    // 子任务
    const subEls = document.querySelectorAll('#ef-subtasks .se-row');
    t.subtasks = Array.from(subEls).map(function (row) {
      const cb = row.querySelector('input[type="checkbox"]');
      const tx = row.querySelector('input[type="text"]');
      return { id: row.dataset.sid || uid(), title: (tx.value || '').trim(), done: cb.checked };
    }).filter(function (s) { return s.title; });
    const tagRaw = document.getElementById('ef-tags').value.trim();
    t.tags = tagRaw ? tagRaw.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 20) : [];
    t.updatedAt = Date.now();
    editingId = null;
    // P0-4：成功才提示
    persistTask(t)
      .then(function () { broadcast({ type: 'data' }); render(); toast('已保存'); })
      .catch(function () { editingId = id; render(); });
  }

  function cancelEdit(id) { editingId = null; render(); }

  // P0-3：删除补 trash.push
  function deleteTaskWithUndo(id) {
    const t = todos.find(function (x) { return x.id === id; });
    if (!t) return;
    const backup = JSON.parse(JSON.stringify(t));
    t.deletedAt = Date.now();
    todos = todos.filter(function (x) { return x.id !== id; });
    const tr = Object.assign(backup, { deletedAt: t.deletedAt });
    trash.push(tr);
    Promise.all([idbPut(STORE_TRASH, tr), idbDelete(STORE_TASKS, id)])
      .then(function () {
        broadcast({ type: 'data' }); render();
        toastWithUndo('已删除「' + backup.title + '」', function () { restoreTask(id); });
      })
      .catch(function (e) {
        trash = trash.filter(function (x) { return x.id !== id; });
        todos.push(t);
        toast('删除失败：' + e.message, 'error'); render();
      });
  }

  function restoreTask(id) {
    const t = trash.find(function (x) { return x.id === id; });
    if (!t) return;
    t.deletedAt = null; t.updatedAt = Date.now();
    trash = trash.filter(function (x) { return x.id !== id; });
    todos.push(t);
    Promise.all([idbPut(STORE_TASKS, t), idbDelete(STORE_TRASH, id)])
      .then(function () { broadcast({ type: 'data' }); render(); toast('已恢复'); })
      .catch(function (e) { toast('恢复失败：' + e.message, 'error'); });
  }

  function purgeTask(id) {
    const t = trash.find(function (x) { return x.id === id; });
    if (!t) return;
    confirmDialog('彻底删除', '「' + t.title + '」将被永久删除，无法恢复。', '永久删除', function () {
      trash = trash.filter(function (x) { return x.id !== id; });
      idbDelete(STORE_TRASH, id).then(function () { renderTrashPanel(); toast('已永久删除'); }).catch(function (e) { toast('删除失败：' + e.message, 'error'); });
    });
  }

  function clearDone() {
    let done;
    if (viewMode === 'day') done = todos.filter(function (t) { return t.date === viewDate && t.done; });
    else if (viewMode === 'today') done = todos.filter(function (t) { return t.date === todayStr() && t.done; });
    else done = todos.filter(function (t) { return t.done; });
    if (!done.length) return;
    confirmDialog('清除已完成', '将把 ' + done.length + ' 项已完成任务移入回收站（可撤销）。', '清除', function () {
      const now = Date.now();
      done.forEach(function (t) { t.deletedAt = now; trash.push(Object.assign({}, t)); });
      todos = todos.filter(function (t) { return !done.some(function (d) { return d.id === t.id; }); });
      Promise.all([
        idbPutMany(STORE_TRASH, done),
        Promise.all(done.map(function (t) { return idbDelete(STORE_TASKS, t.id); }))
      ]).then(function () {
        broadcast({ type: 'data' }); render();
        toastWithUndo('已清除 ' + done.length + ' 项已完成任务', function () {
          const moved = trash.filter(function (t) { return t.deletedAt === now; });
          moved.forEach(function (t) { t.deletedAt = null; todos.push(t); });
          trash = trash.filter(function (t) { return t.deletedAt !== now; });
          Promise.all([
            idbPutMany(STORE_TASKS, moved),
            Promise.all(moved.map(function (t) { return idbDelete(STORE_TRASH, t.id); }))
          ]).then(function () { broadcast({ type: 'data' }); render(); toast('已恢复'); });
        });
      }).catch(function (e) { toast('清除失败：' + e.message, 'error'); });
    });
  }

  function rollTask(id) {
    const t = todos.find(function (x) { return x.id === id; });
    if (!t) return;
    if (!t.rolledFrom) t.rolledFrom = t.date;
    t.date = todayStr(); t.updatedAt = Date.now();
    persistTask(t).then(function () { broadcast({ type: 'data' }); render(); toast('已顺延到今天'); });
  }

  // P1-5：上下移动
  function moveTask(id, dir) {
    const vis = visibleTasks();
    const idx = vis.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return;
    const target = vis[idx + dir];
    if (!target) return;
    const a = todos.find(function (t) { return t.id === id; });
    const b = todos.find(function (t) { return t.id === target.id; });
    if (!a || !b) return;
    const tmp = a.order; a.order = b.order; b.order = tmp;
    a.updatedAt = Date.now(); b.updatedAt = Date.now();
    Promise.all([idbPut(STORE_TASKS, a), idbPut(STORE_TASKS, b)])
      .then(function () { broadcast({ type: 'data' }); render(); })
      .catch(function (e) { toast('移动失败：' + e.message, 'error'); });
  }

  /* 11. 重复任务 */
  function nextOccurrence(dateStr, rep) {
    const d = dateFromStr(dateStr);
    if (rep.freq === 'daily') d.setDate(d.getDate() + (rep.interval || 1));
    else if (rep.freq === 'weekday') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); }
    else if (rep.freq === 'weekly') d.setDate(d.getDate() + 7 * (rep.interval || 1));
    else if (rep.freq === 'custom') {
      const wd = rep.weekdays && rep.weekdays.length ? rep.weekdays : [1, 3, 5];
      do { d.setDate(d.getDate() + 1); } while (wd.indexOf(d.getDay()) < 0);
    }
    return fmtDate(d);
  }

  // P1-6：提前生成未来 7 天实例
  function maybeGenerateRepeats() {
    const today = todayStr();
    const changed = [];
    todos.slice().forEach(function (t) {
      if (!t.repeat || t.done) return;
      // 从 t.date 往后最多推 7 天，若无同标题同日期的重复实例则生成
      let cursor = t.date;
      for (let i = 0; i < 7; i++) {
        cursor = nextOccurrence(cursor, t.repeat);
        if (cursor > addDays(today, 7)) break;
        if (t.repeat.until && cursor > t.repeat.until) break;
        const exists = todos.some(function (x) {
          return x.id !== t.id && x.title === t.title && x.date === cursor && x.repeat &&
                 JSON.stringify(x.repeat) === JSON.stringify(t.repeat);
        });
        if (!exists) {
          const copy = normalizeTask({
            id: uid(), title: t.title, desc: t.desc, date: cursor, done: false,
            priority: t.priority, tags: t.tags, due: null, dueTime: t.dueTime, remind: t.remind,
            repeat: t.repeat, subtasks: (t.subtasks || []).map(function (s) { return { id: uid(), title: s.title, done: false }; }),
            order: 0, createdAt: Date.now()
          });
          todos.push(copy);
          changed.push(copy);
        }
      }
    });
    if (changed.length) {
      idbPutMany(STORE_TASKS, changed)
        .then(function () { broadcast({ type: 'data' }); render(); })
        .catch(function (e) { toast('重复任务生成失败：' + e.message, 'error'); });
    }
  }

  /* 12. 逾期策略 */
  function applyOverduePolicy() {
    const overdue = todos.filter(function (t) { return !t.done && t.date < todayStr() && !t.repeat && !t.deletedAt; });
    if (!overdue.length) return;
    const policy = settings.overduePolicy;
    if (policy === 'roll') {
      overdue.forEach(function (t) { if (!t.rolledFrom) t.rolledFrom = t.date; t.date = todayStr(); t.updatedAt = Date.now(); });
      idbPutMany(STORE_TASKS, overdue).then(function () { broadcast({ type: 'data' }); render(); toast('已将 ' + overdue.length + ' 项逾期任务顺延到今天'); });
    } else if (policy === 'ask') {
      openOverdueAsk(overdue);
    }
  }
  function openOverdueAsk(list) {
    document.getElementById('overdueText').textContent = list.length + ' 项任务已逾期。选择处理方式：';
    document.getElementById('overdueOverlay').classList.add('show');
    focusPanel(document.getElementById('overdueOverlay'));
  }
  function closeOverdueAsk() { document.getElementById('overdueOverlay').classList.remove('show'); }

  /* 13. 批量 */
  function enterBatch() { batchMode = true; selected.clear(); render(); document.getElementById('batchBar').classList.add('show'); updateBatchCount(); }
  function exitBatch() { batchMode = false; selected.clear(); render(); document.getElementById('batchBar').classList.remove('show'); document.getElementById('batchBtn').classList.remove('on'); }
  function updateBatchCount() { document.getElementById('selCount').textContent = selected.size + ' 项'; }
  function toggleBatchSelect(id) {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    render(); updateBatchCount();
  }
  function batchSelectAll() {
    const vis = visibleTasks();
    const allSelected = vis.length > 0 && vis.every(function (t) { return selected.has(t.id); });
    if (allSelected) selected.clear(); else vis.forEach(function (t) { selected.add(t.id); });
    render(); updateBatchCount();
  }
  function batchMarkDone(done) {
    const ids = Array.from(selected);
    const tasks = todos.filter(function (t) { return ids.indexOf(t.id) >= 0; });
    tasks.forEach(function (t) { t.done = done; t.completedAt = done ? Date.now() : null; t.updatedAt = Date.now(); });
    idbPutMany(STORE_TASKS, tasks).then(function () {
      if (done) maybeGenerateRepeats();
      broadcast({ type: 'data' }); render(); updateBatchCount();
      toast('已更新 ' + tasks.length + ' 项');
    }).catch(function (e) { toast('批量操作失败：' + e.message, 'error'); });
  }
  // P0-6：批量改日期
  function batchChangeDate() {
    const picker = document.createElement('input');
    picker.type = 'date'; picker.value = viewDate;
    picker.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(picker);
    let cleaned = false;
    const cleanup = function () { if (cleaned) return; cleaned = true; if (document.body.contains(picker)) picker.remove(); };
    picker.addEventListener('change', function () {
      if (!picker.value) { cleanup(); return; }
      const ids = Array.from(selected);
      const tasks = todos.filter(function (t) { return ids.indexOf(t.id) >= 0; });
      tasks.forEach(function (t) { t.date = picker.value; t.updatedAt = Date.now(); });
      idbPutMany(STORE_TASKS, tasks).then(function () {
        broadcast({ type: 'data' }); render(); updateBatchCount();
        toast('已将 ' + tasks.length + ' 项移到 ' + picker.value);
      }).catch(function (e) { toast('批量改期失败：' + e.message, 'error'); });
      cleanup();
    });
    picker.addEventListener('cancel', cleanup);
    setTimeout(function () {
      try { picker.showPicker ? picker.showPicker() : picker.click(); }
      catch (e) { try { picker.click(); } catch (e2) {} }
    }, 0);
    setTimeout(cleanup, 30000);
  }
  function batchDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    confirmDialog('批量删除', '将把 ' + ids.length + ' 项任务移入回收站（可撤销）。', '删除', function () {
      const now = Date.now();
      const tasks = todos.filter(function (t) { return ids.indexOf(t.id) >= 0; });
      tasks.forEach(function (t) { t.deletedAt = now; trash.push(Object.assign({}, t)); });
      todos = todos.filter(function (t) { return ids.indexOf(t.id) < 0; });
      Promise.all([
        idbPutMany(STORE_TRASH, tasks),
        Promise.all(tasks.map(function (t) { return idbDelete(STORE_TASKS, t.id); }))
      ]).then(function () {
        selected.clear();
        broadcast({ type: 'data' }); render(); updateBatchCount();
        toastWithUndo('已删除 ' + tasks.length + ' 项', function () {
          const moved = trash.filter(function (t) { return t.deletedAt === now; });
          moved.forEach(function (t) { t.deletedAt = null; todos.push(t); });
          trash = trash.filter(function (t) { return t.deletedAt !== now; });
          Promise.all([
            idbPutMany(STORE_TASKS, moved),
            Promise.all(moved.map(function (t) { return idbDelete(STORE_TRASH, t.id); }))
          ]).then(function () { broadcast({ type: 'data' }); render(); toast('已恢复'); });
        });
      }).catch(function (e) { toast('批量删除失败：' + e.message, 'error'); });
    });
  }

  /* 14. 拖拽（P1-5：dragover 只做视觉，drop 才写库） */
  function initDrag() {
    const list = document.getElementById('todoList');
    let dropTargetId = null, dropPos = null;
    list.addEventListener('dragstart', function (e) {
      const item = e.target.closest('.todo-item');
      if (!item || batchMode) { e.preventDefault(); return; }
      draggingId = item.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      item.classList.add('dragging');
    });
    list.addEventListener('dragend', function () {
      list.querySelectorAll('.todo-item').forEach(function (el) { el.classList.remove('dragging', 'drop-before', 'drop-after'); });
      draggingId = null; dropTargetId = null; dropPos = null;
    });
    list.addEventListener('dragover', function (e) {
      if (!draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const item = e.target.closest('.todo-item');
      list.querySelectorAll('.todo-item').forEach(function (el) { el.classList.remove('drop-before', 'drop-after'); });
      if (!item || item.dataset.id === draggingId) { dropTargetId = null; dropPos = null; return; }
      const rect = item.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      item.classList.add(after ? 'drop-after' : 'drop-before');
      dropTargetId = item.dataset.id; dropPos = after ? 'after' : 'before';
    });
    list.addEventListener('drop', function (e) {
      e.preventDefault();
      if (!draggingId || !dropTargetId) { draggingId = null; return; }
      const vis = visibleTasks();
      const fromIdx = vis.findIndex(function (t) { return t.id === draggingId; });
      const toIdx = vis.findIndex(function (t) { return t.id === dropTargetId; });
      if (fromIdx < 0 || toIdx < 0) { draggingId = null; return; }
      // 用 order 重新分配
      const ordered = vis.slice();
      const [moved] = ordered.splice(fromIdx, 1);
      const insertAt = dropPos === 'after' ? toIdx + (toIdx > fromIdx ? 0 : 1) : toIdx - (toIdx > fromIdx ? 1 : 0);
      ordered.splice(Math.max(0, insertAt), 0, moved);
      const updates = ordered.map(function (t, i) { t.order = i; t.updatedAt = Date.now(); return t; });
      idbPutMany(STORE_TASKS, updates).then(function () { broadcast({ type: 'data' }); render(); })
        .catch(function (err) { toast('排序保存失败：' + err.message, 'error'); });
      draggingId = null; dropTargetId = null; dropPos = null;
    });
  }

  /* 15. 回收站 */
  function openTrash() {
    renderTrashPanel();
    document.getElementById('trashOverlay').classList.add('show');
    focusPanel(document.getElementById('trashOverlay'));
  }
  function renderTrashPanel() {
    const el = document.getElementById('trashList');
    if (!trash.length) { el.innerHTML = '<div class="trash-empty">🗑 回收站是空的</div>'; return; }
    const frag = document.createDocumentFragment();
    trash.slice().sort(function (a, b) { return (b.deletedAt || 0) - (a.deletedAt || 0); }).forEach(function (t) {
      const row = document.createElement('div');
      row.className = 'trash-item';
      const title = document.createElement('div');
      title.className = 't'; title.textContent = t.title;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const dd = t.deletedAt ? new Date(t.deletedAt) : null;
      meta.textContent = (t.done ? '已完成 · ' : '') + (dd ? dd.toLocaleString('zh-CN') : '');
      const restore = document.createElement('button');
      restore.className = 'fbtn'; restore.textContent = '恢复';
      restore.addEventListener('click', function () { restoreTask(t.id); });
      const purge = document.createElement('button');
      purge.className = 'fbtn danger'; purge.textContent = '删除';
      purge.addEventListener('click', function () { purgeTask(t.id); });
      row.appendChild(title); row.appendChild(meta); row.appendChild(restore); row.appendChild(purge);
      frag.appendChild(row);
    });
    el.innerHTML = ''; el.appendChild(frag);
  }
  function clearTrash() {
    if (!trash.length) return;
    confirmDialog('清空回收站', '将永久删除 ' + trash.length + ' 项，无法恢复。', '清空', function () {
      trash = [];
      idbClear(STORE_TRASH).then(function () { renderTrashPanel(); toast('回收站已清空'); });
    });
  }

  /* 16. 导入导出 */
  function exportJSON() {
    const payload = {
      app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
      tasks: todos.map(function (t) { return normalizeTask(t); }),
      trash: trash.map(function (t) { return normalizeTask(t); }),
      settings: settings
    };
    download('todo-backup-' + todayStr() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('JSON 备份已导出');
  }
  function exportCSV() {
    const rows = [['id', 'title', 'desc', 'date', 'done', 'priority', 'tags', 'due', 'dueTime', 'createdAt']];
    todos.forEach(function (t) { rows.push([t.id, t.title, t.desc, t.date, t.done ? '1' : '0', t.priority, (t.tags || []).join('|'), t.due || '', t.dueTime || '', t.createdAt || '']); });
    const csv = rows.map(function (r) {
      return r.map(function (c) { const s = String(c == null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
    }).join('\n');
    download('todo-export-' + todayStr() + '.csv', '\uFEFF' + csv, 'text/csv;charset=utf-8');
    toast('CSV 已导出');
  }
  function exportMD() {
    const groups = {};
    todos.forEach(function (t) { (groups[t.date] = groups[t.date] || []).push(t); });
    let md = '# 待办清单导出\n\n';
    Object.keys(groups).sort().reverse().forEach(function (d) {
      md += '## ' + d + '\n';
      groups[d].forEach(function (t) {
        md += '- [' + (t.done ? 'x' : ' ') + '] ' + t.title;
        if (t.priority === 2) md += ' **!高**';
        if (t.tags && t.tags.length) md += ' ' + t.tags.map(function (x) { return '#' + x; }).join(' ');
        if (t.due) md += ' (截止 ' + t.due + (t.dueTime ? ' ' + t.dueTime : '') + ')';
        md += '\n';
        if (t.desc) md += '  - ' + t.desc.replace(/\n/g, '\n  ') + '\n';
        (t.subtasks || []).forEach(function (s) { md += '  - [' + (s.done ? 'x' : ' ') + '] ' + s.title + '\n'; });
      });
      md += '\n';
    });
    download('todo-export-' + todayStr() + '.md', md, 'text/markdown;charset=utf-8');
    toast('Markdown 已导出');
  }
  function exportICS() {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//todo-app//v3//ZH_CN'];
    todos.forEach(function (t) {
      const dueDate = t.due || t.date;
      if (!dueDate) return;
      const d = dueDate.replace(/-/g, '');
      const tm = (t.dueTime || '09:00').replace(':', '');
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + t.id + '@todo-app');
      lines.push('DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''));
      lines.push('DTSTART:' + d + 'T' + tm + '00');
      lines.push('SUMMARY:' + t.title.replace(/[;,]/g, '\\$&'));
      if (t.desc) lines.push('DESCRIPTION:' + t.desc.replace(/\n/g, '\\n'));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    download('todo-calendar.ics', lines.join('\r\n'), 'text/calendar;charset=utf-8');
    toast('ICS 已导出');
  }
  function backupBeforeImport() { exportJSON(); }

  function importJSONFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (data.app !== APP_ID && !data.tasks) throw new Error('不是本应用的备份文件');
        const tasks = (data.tasks || []).map(normalizeTask);
        const trs = (data.trash || []).map(normalizeTask);
        confirmDialog('导入 JSON', '将用备份替换当前所有任务。请确认已保存当前数据备份。共 ' + tasks.length + ' 项任务。', '已备份，导入', function () {
          backupBeforeImport();
          // P1-7：等待下载发起 800ms 再清空
          setTimeout(function () {
            Promise.all([idbClear(STORE_TASKS), idbClear(STORE_TRASH)])
              .then(function () { return Promise.all([idbPutMany(STORE_TASKS, tasks), idbPutMany(STORE_TRASH, trs)]); })
              .then(function () { return loadAll(); })
              .then(function () { broadcast({ type: 'data' }); render(); toast('导入成功'); })
              .catch(function (err) { toast('导入失败：' + err.message, 'error'); });
          }, 800);
        });
      } catch (err) { toast('文件解析失败：' + err.message, 'error'); }
    };
    reader.readAsText(file);
  }
  function importCSVFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const lines = String(e.target.result).replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
      if (lines.length < 2) { toast('CSV 内容为空', 'error'); return; }
      function parseLine(line) {
        const out = []; let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
          else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
          else cur += c;
        }
        out.push(cur); return out;
      }
      const header = parseLine(lines[0]);
      const idx = {};
      header.forEach(function (h, i) { idx[String(h).toLowerCase()] = i; });
      const created = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseLine(lines[i]);
        const get = function (k) { return idx[k] != null ? (cells[idx[k]] || '') : ''; };
        const title = get('title') || get('任务') || cells[0] || '';
        if (!title) continue;
        created.push(normalizeTask({
          title: title, desc: get('desc') || get('备注') || '',
          date: get('date') || viewDate,
          done: get('done') === '1' || get('done') === 'true' || get('完成') === '1',
          priority: get('priority') ? Number(get('priority')) : 1,
          tags: (get('tags') || '').split('|').filter(Boolean),
          due: get('due') || null, dueTime: get('duetime') || null
        }));
      }
      if (!created.length) { toast('未解析到任务', 'error'); return; }
      confirmDialog('导入 CSV', '将追加 ' + created.length + ' 项任务。', '导入', function () {
        idbPutMany(STORE_TASKS, created)
          .then(function () { todos = todos.concat(created); broadcast({ type: 'data' }); render(); toast('导入成功 ' + created.length + ' 项'); })
          .catch(function (err) { toast('导入失败：' + err.message, 'error'); });
      });
    };
    reader.readAsText(file);
  }

  /* 17. 提醒（P1-2 修复） */
  function enableReminders(enable) {
    if (enable && !('Notification' in window)) { toast('当前浏览器不支持通知', 'error'); settings.reminders.enabled = false; saveSettings(); return; }
    if (enable && Notification.permission === 'default') {
      Notification.requestPermission().then(function (perm) {
        if (perm === 'granted') { settings.reminders.enabled = true; saveSettings(); toast('提醒已开启（仅页面打开时生效）'); renderSettingsPanel(); }
        else { settings.reminders.enabled = false; saveSettings(); toast('通知权限被拒绝', 'error'); renderSettingsPanel(); }
      });
    } else if (enable && Notification.permission === 'granted') {
      settings.reminders.enabled = true; saveSettings(); toast('提醒已开启（仅页面打开时生效）');
    } else if (enable && Notification.permission === 'denied') {
      settings.reminders.enabled = false; saveSettings(); toast('通知权限已被拒绝', 'error');
    } else {
      settings.reminders.enabled = false; saveSettings();
    }
  }
  function checkReminders() {
    if (!settings.reminders.enabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = new Date();
    const today = todayStr();
    const hhmm = pad(now.getHours()) + ':' + pad(now.getMinutes());
    todos.forEach(function (t) {
      if (t.done || !t.remind) return;
      if (!t.dueTime) return;
      // 允许 5 分钟窗口内补发
      const target = t.dueTime;
      const [th, tm] = target.split(':').map(Number);
      const targetMin = th * 60 + tm;
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin < targetMin || nowMin - targetMin > 5) return;
      const dueDate = t.due || t.date;
      if (dueDate !== today) return;
      const key = today + ' ' + target;
      if (settings.reminders.notified[t.id] === key) return;
      settings.reminders.notified[t.id] = key;
      saveSettings();
      try { new Notification('⏰ ' + t.title, { body: target + ' 截止' + (t.desc ? ' · ' + t.desc : '') }); } catch (e) {}
    });
  }

  /* 18. 统计 */
  function dateKeySet() {
    const set = {};
    todos.forEach(function (t) {
      if (t.done && t.completedAt) {
        const k = fmtDate(new Date(t.completedAt));
        set[k] = (set[k] || 0) + 1;
      }
    });
    return set;
  }
  function calcStreak() {
    const set = dateKeySet();
    let streak = 0;
    let d = dateFromStr(todayStr());
    while (true) {
      const k = fmtDate(d);
      if (set[k]) { streak++; d.setDate(d.getDate() - 1); } else break;
    }
    return streak;
  }
  function openStats() {
    const grid = document.getElementById('statGrid');
    const day = todos.filter(function (t) { return t.date === todayStr(); });
    const doneToday = day.filter(function (t) { return t.done; }).length;
    const rate = day.length ? Math.round(doneToday / day.length * 100) : 0;
    grid.innerHTML =
      '<div class="stat-cell"><div class="num">' + day.length + '</div><div class="lbl">今日任务</div></div>' +
      '<div class="stat-cell"><div class="num">' + rate + '%</div><div class="lbl">今日完成率</div></div>' +
      '<div class="stat-cell"><div class="num">' + calcStreak() + '</div><div class="lbl">连续完成(天)</div></div>';

    // P2-2：热力图 7 行 × N 列
    const heat = document.getElementById('heatmap');
    heat.innerHTML = '';
    const set = dateKeySet();
    const end = dateFromStr(todayStr());
    const totalWeeks = 26;
    const start = new Date(end);
    // 对齐到周一
    const startOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - startOffset - (totalWeeks - 1) * 7);
    for (let w = 0; w < totalWeeks; w++) {
      for (let d = 0; d < 7; d++) {
        const cur = new Date(start);
        cur.setDate(cur.getDate() + w * 7 + d);
        const k = fmtDate(cur);
        const n = set[k] || 0;
        const lvl = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4;
        const cell = document.createElement('div');
        cell.className = 'heat-cell h' + lvl;
        cell.title = k + ' 完成 ' + n + ' 项';
        heat.appendChild(cell);
      }
    }

    const report = document.getElementById('weekReport');
    let html = '<table><thead><tr><th>日期</th><th>新增</th><th>完成</th><th>未完成</th></tr></thead><tbody>';
    for (let i = 6; i >= 0; i--) {
      const d = fmtDate(new Date(end.getFullYear(), end.getMonth(), end.getDate() - i));
      const dTasks = todos.filter(function (t) { return t.date === d; });
      const added = dTasks.length;
      const doneN = dTasks.filter(function (t) { return t.done; }).length;
      const pend = dTasks.filter(function (t) { return !t.done; }).length;
      html += '<tr><td>' + d + (d === todayStr() ? ' (今)' : '') + '</td><td>' + added + '</td><td>' + doneN + '</td><td>' + pend + '</td></tr>';
    }
    html += '</tbody></table>';
    report.innerHTML = html;
    document.getElementById('statsOverlay').classList.add('show');
    focusPanel(document.getElementById('statsOverlay'));
  }

  /* 19. 日历 */
  function openCalendar() {
    const now = dateFromStr(viewDate);
    calMonth = { y: now.getFullYear(), m: now.getMonth() };
    renderCalendar();
    document.getElementById('calOverlay').classList.add('show');
    focusPanel(document.getElementById('calOverlay'));
  }
  function renderCalendar() {
    const title = document.getElementById('calTitle');
    title.textContent = calMonth.y + '年' + (calMonth.m + 1) + '月';
    const grid = document.getElementById('calGrid');
    grid.innerHTML = '<div class="cal-dow">一</div><div class="cal-dow">二</div><div class="cal-dow">三</div><div class="cal-dow">四</div><div class="cal-dow">五</div><div class="cal-dow">六</div><div class="cal-dow">日</div>';
    const first = new Date(calMonth.y, calMonth.m, 1);
    const startDow = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
    const prevDays = new Date(calMonth.y, calMonth.m, 0).getDate();
    const today = todayStr();
    const countByDate = {};
    todos.forEach(function (t) { if (!t.deletedAt) countByDate[t.date] = (countByDate[t.date] || 0) + 1; });
    for (let i = 0; i < startDow; i++) {
      const d = fmtDate(new Date(calMonth.y, calMonth.m - 1, prevDays - startDow + 1 + i));
      grid.insertAdjacentHTML('beforeend', '<button class="cal-day dim" data-date="' + d + '">' + (prevDays - startDow + 1 + i) + '</button>');
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const d = fmtDate(new Date(calMonth.y, calMonth.m, i));
      const cls = ['cal-day'];
      if (d === today) cls.push('today');
      if (d === viewDate) cls.push('active');
      grid.insertAdjacentHTML('beforeend', '<button class="' + cls.join(' ') + '" data-date="' + d + '">' + i + (countByDate[d] ? '<span class="dot"></span>' : '') + '</button>');
    }
    const nextStart = (startDow + daysInMonth) % 7;
    for (let i = 1; nextStart + i <= 7; i++) {
      const d = fmtDate(new Date(calMonth.y, calMonth.m + 1, i));
      grid.insertAdjacentHTML('beforeend', '<button class="cal-day dim" data-date="' + d + '">' + i + '</button>');
    }
    grid.querySelectorAll('.cal-day').forEach(function (btn) {
      btn.addEventListener('click', function () {
        viewDate = btn.dataset.date;
        viewMode = 'day';
        document.getElementById('calOverlay').classList.remove('show');
        render();
      });
    });
  }
  function calShift(delta) {
    const d = new Date(calMonth.y, calMonth.m + delta, 1);
    calMonth = { y: d.getFullYear(), m: d.getMonth() };
    renderCalendar();
  }

  /* 20. 模板 */
  const TEMPLATES = [
    { name: '今日三件事', desc: '每天最重要的三件事', items: [{ title: '规划今日三件要事' }, { title: '处理重要邮件', tags: ['工作'] }, { title: '运动 30 分钟', tags: ['健康'] }] },
    { name: '购物清单', desc: '常用采购项', items: [{ title: '牛奶' }, { title: '鸡蛋' }, { title: '蔬菜水果', tags: ['购物'] }] },
    { name: '每周复盘', desc: '周末总结与规划', items: [{ title: '总结本周成果', tags: ['工作'] }, { title: '规划下周目标', tags: ['工作'] }] },
    { name: '学习计划', desc: '阅读 / 课程', items: [{ title: '阅读 30 页书', tags: ['学习'] }, { title: '复习课程笔记', tags: ['学习'] }] },
    { name: '旅行打包', desc: '出发前检查', items: [{ title: '证件：身份证 / 护照' }, { title: '充电器与充电宝' }, { title: '换洗衣物' }] },
    { name: '健康习惯', desc: '每日打卡', items: [{ title: '喝水 8 杯', tags: ['健康'] }, { title: '早睡 23:30 前', tags: ['健康'] }, { title: '步行 6000 步', tags: ['健康'] }] }
  ];
  function renderTemplates() {
    const grid = document.getElementById('tmplGrid');
    grid.innerHTML = '';
    TEMPLATES.forEach(function (tmpl) {
      const card = document.createElement('button');
      card.className = 'tmpl-card';
      card.innerHTML = '<div class="n">' + esc(tmpl.name) + '</div><div class="s">' + esc(tmpl.desc) + '</div>';
      card.addEventListener('click', function () {
        const created = tmpl.items.map(function (it, i) {
          return normalizeTask({ id: uid(), title: it.title, desc: '', date: viewDate, done: false, priority: 1, tags: it.tags || [], order: -100 - i, createdAt: Date.now() });
        });
        created.forEach(function (t) { todos.unshift(t); });
        idbPutMany(STORE_TASKS, created).then(function () {
          document.getElementById('tmplOverlay').classList.remove('show');
          toast('已添加 ' + tmpl.name + '（' + created.length + ' 项）');
          broadcast({ type: 'data' }); render();
        });
      });
      grid.appendChild(card);
    });
  }

  /* 21. 设置面板 */
  function renderSettingsPanel() {
    const panel = document.getElementById('settingsPanel');
    panel.innerHTML =
      '<button class="panel-close" data-close="settingsOverlay" aria-label="关闭">✕</button>' +
      '<h2>⚙ 设置</h2>' +
      '<div class="setting-row"><div class="lbl">逾期处理策略<small>启动时对未完成的过期任务：保留并标记逾期 / 顺延到今天 / 每次询问</small></div>' +
        '<select id="set-overdue"><option value="keep"' + (settings.overduePolicy === 'keep' ? ' selected' : '') + '>保留并标记逾期</option><option value="roll"' + (settings.overduePolicy === 'roll' ? ' selected' : '') + '>顺延今天</option><option value="ask"' + (settings.overduePolicy === 'ask' ? ' selected' : '') + '>每次询问</option></select></div>' +
      '<div class="setting-row"><div class="lbl">本地到点提醒<small>仅页面打开时生效，关闭页面后不再提醒</small></div>' +
        '<label class="toggle"><input type="checkbox" id="set-remind"' + (settings.reminders.enabled ? ' checked' : '') + '><span class="slider"></span></label></div>' +
      '<div class="setting-row"><div class="lbl">云同步（预留）<small>多端同步需部署服务端，当前仅保留接口</small></div>' +
        '<select id="set-sync"><option value="off">关闭</option><option value="on">开启（未配置）</option></select></div>' +
      '<div class="setting-row"><div class="lbl">PWA 可安装<small>需部署到 https 后启用离线与安装</small></div><div id="pwaStatus" style="font-size:12px;color:var(--muted);">' + esc(PWA_SUPPORT) + '</div></div>';
    document.getElementById('set-overdue').addEventListener('change', function (e) { settings.overduePolicy = e.target.value; saveSettings(); toast('逾期策略已更新'); render(); });
    document.getElementById('set-remind').addEventListener('change', function (e) { enableReminders(e.target.checked); });
    document.getElementById('set-sync').addEventListener('change', function (e) { toast(e.target.value === 'on' ? '云同步需配置服务端，暂未启用' : '云同步关闭'); });
    document.getElementById('settingsOverlay').classList.add('show');
    focusPanel(document.getElementById('settingsOverlay'));
    initPWA();
  }

  /* 22. PWA */
  function initPWA() {
    const el = document.getElementById('pwaStatus');
    if (el) el.textContent = PWA_SUPPORT;
  }

  /* 23. 云同步占位 */
  const sync = { enabled: false, endpoints: null, init: function () {}, push: function () {}, pull: function () {} };

  /* 24. 多标签页 */
  let bc = null;
  function initBroadcast() {
    if ('BroadcastChannel' in window) {
      try {
        bc = new BroadcastChannel('todo-app-sync');
        bc.onmessage = function (e) {
          if (!e.data) return;
          if (e.data.type === 'data') loadAll().then(function () { if (!editingId) render(); });
          else if (e.data.type === 'settings') {
            const prev = settings;
            settings = loadSettings();
            applyTheme();
            if (prev.sortMode !== settings.sortMode) { document.getElementById('sortSelect').value = settings.sortMode; render(); }
          }
        };
      } catch (e) {}
    }
    window.addEventListener('storage', function (e) {
      if (e.key === LS_SETTINGS) { settings = loadSettings(); applyTheme(); }
    });
  }
  function broadcast(msg) { if (bc) { try { bc.postMessage(msg); } catch (e) {} } }

  /* 25. 快捷键 */
  function initShortcuts() {
    document.addEventListener('keydown', function (e) {
      const tag = (e.target.tagName || '').toLowerCase();
      const isField = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if (isField) {
        if (e.key === 'Escape' && editingId) { e.preventDefault(); cancelEdit(editingId); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && editingId) { e.preventDefault(); saveEdit(editingId); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !editingId) { e.preventDefault(); addTodo(); }
        return;
      }
      const anyOpen = document.querySelector('.overlay.show');
      if (e.key === 'Escape') {
        if (batchMode) { exitBatch(); return; }
        if (anyOpen) { anyOpen.classList.remove('show'); return; }
        if (searchQuery) { document.getElementById('searchInput').value = ''; searchQuery = ''; render(); }
        return;
      }
      if (e.key === '/' && !anyOpen) { e.preventDefault(); const si = document.getElementById('searchInput'); si.focus(); si.select(); return; }
      if ((e.key === 'n' || e.key === 'N') && !anyOpen) { e.preventDefault(); document.getElementById('todoInput').focus(); return; }
      if ((e.key === 'g' || e.key === 'G') && !anyOpen) { viewDate = todayStr(); viewMode = 'day'; render(); }
    });
  }

  /* 26. 弹层焦点 */
  let lastFocus = null;
  function focusPanel(overlay) {
    lastFocus = document.activeElement;
    const btn = overlay.querySelector('button, input, select, textarea, [tabindex]');
    if (btn) setTimeout(function () { btn.focus(); }, 10);
  }
  function closeOverlay(el) {
    el.classList.remove('show');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  document.addEventListener('click', function (e) {
    const closer = e.target.closest('[data-close]');
    if (closer) {
      const ov = document.getElementById(closer.getAttribute('data-close'));
      if (ov) closeOverlay(ov);
    }
    document.querySelectorAll('.overlay').forEach(function (ov) {
      if (ov.classList.contains('show') && e.target === ov && !e.target.closest('.panel')) ov.classList.remove('show');
    });
  });

  /* 27. 事件绑定 */
  function bindEvents() {
    const $ = function (id) { return document.getElementById(id); };

    // 视图 tabs
    document.querySelectorAll('.view-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        viewMode = btn.dataset.view;
        settings.viewMode = viewMode;
        saveSettings();
        render();
      });
    });

    $('prevDay').addEventListener('click', function () { viewDate = addDays(viewDate, -1); render(); });
    $('nextDay').addEventListener('click', function () { viewDate = addDays(viewDate, 1); render(); });
    $('todayBtn').addEventListener('click', function () { viewDate = todayStr(); viewMode = 'day'; render(); });
    $('dateLabel').addEventListener('click', openCalendar);
    $('dateLabel').addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCalendar(); } });
    $('calBtn').addEventListener('click', openCalendar);
    $('calPrev').addEventListener('click', function () { calShift(-1); });
    $('calNext').addEventListener('click', function () { calShift(1); });

    $('searchInput').addEventListener('input', debounce(function () {
      searchQuery = $('searchInput').value.trim();
      render();
    }, 150));
    $('searchClear').addEventListener('click', function () { $('searchInput').value = ''; searchQuery = ''; render(); $('searchInput').focus(); });

    document.querySelectorAll('.filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentFilter = btn.dataset.filter;
        document.querySelectorAll('.filter').forEach(function (b) { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
        render();
      });
    });

    $('sortSelect').addEventListener('change', function (e) {
      settings.sortMode = e.target.value;
      saveSettings(); render(); toast('排序方式已切换');
    });

    $('addBtn').addEventListener('click', addTodo);
    $('todoInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTodo(); } });
    $('todoInput').addEventListener('input', function () { $('errorMsg').classList.remove('show'); });
    $('optToggle').addEventListener('click', function () {
      const opts = $('addOpts');
      const show = !opts.classList.contains('show');
      opts.classList.toggle('show', show);
      this.setAttribute('aria-expanded', show);
    });
    $('addDateSel').addEventListener('change', function () { $('addDatePicker').style.display = this.value === 'custom' ? '' : 'none'; });
    $('addRepeat').addEventListener('change', function () {
      $('addWeekdays').classList.toggle('show', this.value === 'custom');
    });
    // P1-6：自定义周几 label 高亮
    document.querySelectorAll('#addWeekdays label').forEach(function (label) {
      label.addEventListener('click', function (e) {
        setTimeout(function () {
          const cb = label.querySelector('input');
          label.classList.toggle('on', cb.checked);
        }, 0);
      });
    });

    const list = $('todoList');
    list.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action]');
      const subProg = e.target.closest('.subtask-progress');
      if (subProg) {
        const item = subProg.closest('.todo-item');
        const subList = item.querySelector('.subtask-list');
        if (subList) subList.classList.toggle('show');
        return;
      }
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const item = btn.closest('.todo-item');
      if (action === 'toggle-desc') {
        const descEl = item.querySelector('.todo-desc');
        if (!descEl) return;
        descEl.classList.toggle('show');
        btn.classList.toggle('open');
        btn.setAttribute('aria-expanded', btn.classList.contains('open') ? 'true' : 'false');
        return;
      }
      if (action === 'toggle-subtask') {
        const id = item.dataset.id;
        toggleSubtask(id, btn.dataset.sid);
        return;
      }
      if (action === 'se-add') {
        const editor = document.getElementById('ef-subtasks');
        const row = document.createElement('div');
        row.className = 'se-row';
        row.innerHTML = '<input type="checkbox"><input type="text" placeholder="子任务"><button class="se-del" type="button">✕</button>';
        editor.insertBefore(row, editor.querySelector('.se-add'));
        return;
      }
      if (!item) return;
      const id = item.dataset.id;
      if (action === 'toggle') toggleDone(id);
      else if (action === 'batch-select') toggleBatchSelect(id);
      else if (action === 'edit') startEdit(id);
      else if (action === 'delete') deleteTaskWithUndo(id);
      else if (action === 'roll') rollTask(id);
      else if (action === 'save-edit') saveEdit(id);
      else if (action === 'cancel-edit') cancelEdit(id);
      else if (action === 'move-up') moveTask(id, -1);
      else if (action === 'move-down') moveTask(id, 1);
    });
    // 子任务删除（编辑态）
    list.addEventListener('click', function (e) {
      if (e.target.classList.contains('se-del')) {
        e.target.closest('.se-row').remove();
      }
    });
    // 编辑态重复选择显示周几
    list.addEventListener('change', function (e) {
      if (e.target.id === 'ef-repeat') {
        const wd = document.getElementById('ef-weekdays');
        if (wd) wd.classList.toggle('show', e.target.value === 'custom');
      }
    });

    $('batchBtn').addEventListener('click', function () {
      if (batchMode) exitBatch(); else enterBatch();
      this.classList.toggle('on', batchMode);
      this.setAttribute('aria-pressed', batchMode);
    });
    $('batchExit').addEventListener('click', exitBatch);
    $('batchSelectAll').addEventListener('click', batchSelectAll);
    $('batchDone').addEventListener('click', function () { batchMarkDone(true); });
    $('batchUndone').addEventListener('click', function () { batchMarkDone(false); });
    $('batchDate').addEventListener('click', batchChangeDate);
    $('batchDelete').addEventListener('click', batchDelete);

    $('themeBtn').addEventListener('click', function () { renderThemePanel(); $('themeOverlay').classList.add('show'); focusPanel($('themeOverlay')); });
    $('themeClose').addEventListener('click', function () { closeOverlay($('themeOverlay')); });
    $('themeReset').addEventListener('click', function () {
      settings.theme = { paletteId: 'pine', bgMode: 'color', bgId: 'paper', bgImageId: null, dark: 'auto' };
      saveSettings(); applyTheme();
    });

    $('statsBtn').addEventListener('click', openStats);
    $('trashBtn').addEventListener('click', openTrash);
    $('trashClear').addEventListener('click', clearTrash);
    $('tmplBtn').addEventListener('click', function () { renderTemplates(); $('tmplOverlay').classList.add('show'); focusPanel($('tmplOverlay')); });
    $('ioBtn').addEventListener('click', function () { $('ioOverlay').classList.add('show'); focusPanel($('ioOverlay')); });
    $('settingsBtn').addEventListener('click', renderSettingsPanel);
    $('clearDoneBtn').addEventListener('click', clearDone);

    $('exportJson').addEventListener('click', exportJSON);
    $('exportCsv').addEventListener('click', exportCSV);
    $('exportMd').addEventListener('click', exportMD);
    $('exportIcs').addEventListener('click', exportICS);
    $('importJson').addEventListener('click', function () {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.addEventListener('change', function () { if (inp.files && inp.files[0]) importJSONFile(inp.files[0]); });
      inp.click();
    });
    $('importCsv').addEventListener('click', function () {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv';
      inp.addEventListener('change', function () { if (inp.files && inp.files[0]) importCSVFile(inp.files[0]); });
      inp.click();
    });

    $('confirmCancel').addEventListener('click', closeConfirm);
    $('confirmOk').addEventListener('click', function () { const cb = confirmCallback; closeConfirm(); if (cb) cb(); });

    $('overdueRoll').addEventListener('click', function () {
      closeOverdueAsk();
      const overdue = todos.filter(function (t) { return !t.done && t.date < todayStr() && !t.repeat; });
      overdue.forEach(function (t) { if (!t.rolledFrom) t.rolledFrom = t.date; t.date = todayStr(); t.updatedAt = Date.now(); });
      idbPutMany(STORE_TASKS, overdue).then(function () { broadcast({ type: 'data' }); render(); toast('已顺延 ' + overdue.length + ' 项'); });
    });
    $('overdueKeep').addEventListener('click', function () { closeOverdueAsk(); toast('已保留原日期，逾期任务已标记'); });

    $('rollDismiss').addEventListener('click', function () { $('rollBanner').classList.remove('show'); });
  }

  /* 28. 启动 */
  function init() {
    document.getElementById('sortSelect').value = settings.sortMode;
    bindEvents();
    initShortcuts();
    initDrag();
    initBroadcast();
    initPWA();
    // P1-7：申请持久化存储
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(function () {});
    }

    migrateFromLocalStorage()
      .then(loadAll)
      .then(function () {
        applyOverduePolicy();
        maybeGenerateRepeats();
        return applyTheme();
      })
      .then(function () { render(); })
      .catch(function (e) {
        toast('初始化失败：' + (e && e.message || e), 'error');
        console.error(e);
        render();
      });

    // P1-2：提醒文案诚实化
    setInterval(checkReminders, 30000);
    // P0-1：系统主题跟随
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onScheme = function () { if (settings.theme.dark === 'auto') applyTheme(); };
      mq.addEventListener ? mq.addEventListener('change', onScheme) : mq.addListener(onScheme);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
