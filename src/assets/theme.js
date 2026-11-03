/*
 * 自留地 · 全站外观设置
 * 原任务清单内的「外观设置」上移到全站：主色 / 明暗模式 / 背景。
 * 配置存 localStorage，背景图片存 IndexedDB，均在浏览器本地。
 */
(function () {
  'use strict';

  var KEY = 'site:theme:v1';
  var DB_NAME = 'site-theme-db';
  var STORE = 'images';

  var PALETTES = [
    { id: 'rust',   name: '锈红',   light: { accent: '#b23a1f', ink: '#8c2c17', soft: '#f1dbd2' }, dark: { accent: '#e07154', ink: '#f08b71', soft: '#3a221a' } },
    { id: 'pine',   name: '松针绿', light: { accent: '#3f6d4a', ink: '#2f5138', soft: '#ddebe0' }, dark: { accent: '#6aa87a', ink: '#9ad0a9', soft: '#233026' } },
    { id: 'navy',   name: '海盐蓝', light: { accent: '#3b6ea5', ink: '#2c5279', soft: '#dbe7f4' }, dark: { accent: '#71a6d8', ink: '#a9cbe8', soft: '#1c2938' } },
    { id: 'violet', name: '紫藤',   light: { accent: '#7a5ea8', ink: '#5d4687', soft: '#e7dff5' }, dark: { accent: '#a98bd6', ink: '#c8b4e8', soft: '#2a2138' } },
    { id: 'amber',  name: '暖橙',   light: { accent: '#c97b3d', ink: '#a55f2b', soft: '#f7e3d0' }, dark: { accent: '#e5a15f', ink: '#f0bb84', soft: '#38291a' } },
    { id: 'rose',   name: '玫瑰',   light: { accent: '#c25b76', ink: '#9e4560', soft: '#f6dfe5' }, dark: { accent: '#da839b', ink: '#eaa9bb', soft: '#382029' } },
    { id: 'slate',  name: '石墨',   light: { accent: '#3a3a44', ink: '#292932', soft: '#e4e4e8' }, dark: { accent: '#8b8b98', ink: '#b4b4c0', soft: '#2a2a31' } }
  ];

  var BGS = [
    { id: 'default', name: '点阵纸',   css: 'none' },
    { id: 'paper', name: '暖纸白', css: 'linear-gradient(180deg,#fffdf4,#f6f1e6)' },
    { id: 'cream', name: '奶油米', css: 'linear-gradient(160deg,#fbf5e8,#f0e6d2)' },
    { id: 'mist',  name: '晨雾蓝', css: 'linear-gradient(160deg,#eef3fb,#dbe6f4)' },
    { id: 'blush', name: '柔粉',   css: 'linear-gradient(160deg,#fdf0f3,#f5dde5)' },
    { id: 'mint',  name: '薄荷',   css: 'linear-gradient(160deg,#eef8f0,#d9ecd8)' },
    { id: 'dusk',  name: '暮霭紫', css: 'linear-gradient(160deg,#f1ecfb,#dcd2ef)' },
    { id: 'night', name: '子夜蓝', css: 'linear-gradient(160deg,#1f2c3f,#0f1720)' }
  ];

  var MODES = [
    { id: 'auto',  name: '跟随系统', icon: '🌓' },
    { id: 'light', name: '始终浅色', icon: '☀️' },
    { id: 'dark',  name: '始终深色', icon: '🌙' }
  ];

  var DEFAULTS = { accent: 'rust', mode: 'auto', bg: 'default', hasImage: false, scrim: null };
  var state = load();
  var imageUrl = null;

  /* ---------- 存储 ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return Object.assign({}, DEFAULTS);
      var o = JSON.parse(raw);
      return {
        accent: typeof o.accent === 'string' ? o.accent : DEFAULTS.accent,
        mode: o.mode === 'light' || o.mode === 'dark' ? o.mode : 'auto',
        bg: typeof o.bg === 'string' ? o.bg : DEFAULTS.bg,
        hasImage: !!o.hasImage,
        scrim: typeof o.scrim === 'number' ? Math.max(0, Math.min(100, o.scrim)) : null
      };
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 忽略配额错误 */ }
  }

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbSet(id, dataUrl) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ id: id, dataUrl: dataUrl, updatedAt: Date.now() });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbGet(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(id);
        req.onsuccess = function () { resolve(req.result ? req.result.dataUrl : null); };
        req.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function idbDel(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () {});
  }

  /* ---------- 应用 ---------- */

  function paletteById(id) {
    for (var i = 0; i < PALETTES.length; i++) if (PALETTES[i].id === id) return PALETTES[i];
    return PALETTES[0];
  }

  function bgById(id) {
    for (var i = 0; i < BGS.length; i++) if (BGS[i].id === id) return BGS[i];
    return BGS[0];
  }

  function resolveDark() {
    if (state.mode === 'dark') return true;
    if (state.mode === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function apply() {
    var root = document.documentElement;
    var dark = resolveDark();
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.style.colorScheme = dark ? 'dark' : 'light';

    var tri = dark ? paletteById(state.accent).dark : paletteById(state.accent).light;
    root.style.setProperty('--accent', tri.accent);
    root.style.setProperty('--accent-ink', tri.ink);
    root.style.setProperty('--accent-soft', tri.soft);

    var css = 'none';
    if (state.bg === 'image' && imageUrl) css = 'url("' + imageUrl + '")';
    else if (state.bg !== 'image') css = bgById(state.bg).css;

    // 背景类型：照片 / 渐变 / 点阵纸
    var kind = state.bg === 'image' && imageUrl ? 'image' : (state.bg === 'default' ? 'none' : 'gradient');
    var alpha = 0;
    if (kind === 'image') alpha = state.scrim == null ? 0.72 : state.scrim / 100;
    else if (kind === 'gradient' && dark) alpha = state.scrim == null ? 0.88 : state.scrim / 100;
    var scrimCss = 'none';
    if (alpha > 0) {
      var rgb = dark ? '21,19,14' : '251,248,239';
      scrimCss = 'linear-gradient(rgba(' + rgb + ',' + alpha + '), rgba(' + rgb + ',' + alpha + '))';
    }

    root.setAttribute('data-bg', kind);
    root.style.setProperty('--page-bg', css);
    root.style.setProperty('--page-bg-size', css === 'none' ? 'auto' : 'cover');
    root.style.setProperty('--page-scrim', scrimCss);

    // 缓存已解析的值，供 next 页面首屏内联脚本直接恢复（避免闪烁）
    try {
      localStorage.setItem('site:theme:resolved', JSON.stringify({
        theme: dark ? 'dark' : 'light',
        accent: tri.accent,
        ink: tri.ink,
        soft: tri.soft,
        bg: css === 'none' ? 'none' : (state.bg === 'image' ? 'none' : css),
        bgSize: css === 'none' ? 'auto' : 'cover',
        scrim: state.bg === 'image' ? 'none' : scrimCss
      }));
    } catch (e) { /* 忽略配额错误 */ }
  }

  function saveAndApply() {
    save();
    apply();
    if (typeof window.__renderThemePanel === 'function') window.__renderThemePanel();
  }

  function setAccent(id) { state.accent = id; saveAndApply(); }
  function setMode(id) { state.mode = id; saveAndApply(); }

  function setBg(id) {
    state.bg = id;
    saveAndApply();
  }

  // 拖动遮罩浓度时不重绘面板，避免输入框失焦
  function setScrim(v) {
    state.scrim = v;
    save();
    apply();
  }

  function useImage(dataUrl) {
    imageUrl = dataUrl;
    state.bg = 'image';
    state.hasImage = true;
    idbSet('bg', dataUrl).then(saveAndApply);
  }

  function reset() {
    state = Object.assign({}, DEFAULTS);
    imageUrl = null;
    idbDel('bg');
    saveAndApply();
    renderPanel();
  }

  /* ---------- 面板 ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderPanel() {
    var host = document.getElementById('themePanelBody');
    if (!host) return;
    var dark = resolveDark();
    var current = paletteById(state.accent);

    var html = '';

    html += '<h3 class="theme-h3">界面模式</h3><div class="theme-options">';
    MODES.forEach(function (m) {
      html += '<button type="button" class="theme-opt' + (state.mode === m.id ? ' active' : '') + '" data-theme-mode="' + m.id + '">'
        + '<span class="theme-radio" aria-hidden="true"></span>' + m.icon + ' ' + m.name + '</button>';
    });
    html += '</div>';

    html += '<h3 class="theme-h3">界面主色</h3><div class="theme-swatches">';
    PALETTES.forEach(function (p) {
      var c = dark ? p.dark.accent : p.light.accent;
      html += '<button type="button" class="theme-swatch' + (state.accent === p.id ? ' active' : '') + '"'
        + ' data-theme-accent="' + p.id + '" title="' + esc(p.name) + '" aria-label="' + esc(p.name) + '"'
        + ' style="--sw:' + c + '"><span></span></button>';
    });
    html += '</div><p class="theme-note">当前主色：' + esc(current.name) + '</p>';

    html += '<h3 class="theme-h3">背景</h3><div class="theme-bgs">';
    BGS.forEach(function (b) {
      html += '<button type="button" class="theme-bg' + (state.bg === b.id ? ' active' : '') + '" data-theme-bg="' + b.id + '"'
        + ' style="background:' + b.css + '"><span>' + esc(b.name) + '</span></button>';
    });
    var imgBg = !!(state.bg === 'image' && imageUrl);
    html += '<button type="button" class="theme-bg' + (imgBg ? ' active' : '') + '" data-theme-image="1"'
      + (imgBg ? ' style="background-image:url(\'' + imageUrl + '\');background-size:cover;"' : '')
      + '><span>📷 本地图片</span></button>';
    html += '</div>';

    if (state.bg === 'image') {
      var pct = state.scrim == null ? 72 : state.scrim;
      html += '<div class="theme-scrim">'
        + '<label for="themeScrim">遮罩浓度</label>'
        + '<input id="themeScrim" type="range" min="0" max="100" step="1" value="' + pct + '" data-theme-scrim>'
        + '<output>' + pct + '%</output>'
        + '</div>'
        + '<p class="theme-note">调低能看清图片细节，调高文字更清晰。</p>';
    }

    html += '<div class="theme-actions">'
      + '<button type="button" class="theme-reset" data-theme-reset="1">恢复默认</button>'
      + '<button type="button" class="theme-done" data-theme-close="1">完成</button>'
      + '</div>';

    host.innerHTML = html;

    host.querySelectorAll('[data-theme-mode]').forEach(function (el) {
      el.addEventListener('click', function () { setMode(el.getAttribute('data-theme-mode')); renderPanel(); });
    });
    host.querySelectorAll('[data-theme-accent]').forEach(function (el) {
      el.addEventListener('click', function () { setAccent(el.getAttribute('data-theme-accent')); renderPanel(); });
    });
    host.querySelectorAll('[data-theme-bg]').forEach(function (el) {
      el.addEventListener('click', function () { setBg(el.getAttribute('data-theme-bg')); renderPanel(); });
    });
    var imgBtn = host.querySelector('[data-theme-image]');
    if (imgBtn) imgBtn.addEventListener('click', pickImage);
    var slider = host.querySelector('[data-theme-scrim]');
    if (slider) {
      slider.addEventListener('input', function () {
        setScrim(Number(slider.value));
        var out = slider.parentNode.querySelector('output');
        if (out) out.textContent = slider.value + '%';
      });
    }
    var resetBtn = host.querySelector('[data-theme-reset]');
    if (resetBtn) resetBtn.addEventListener('click', reset);
    var doneBtn = host.querySelector('[data-theme-close]');
    if (doneBtn) doneBtn.addEventListener('click', close);
  }

  function pickImage() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var scale = Math.min(1, 1600 / img.width);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          useImage(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  function panel() { return document.getElementById('themeOverlay'); }

  function open() {
    var el = panel();
    if (!el) return;
    renderPanel();
    el.classList.add('show');
    var first = el.querySelector('button');
    if (first) first.focus();
  }

  function close() {
    var el = panel();
    if (el) el.classList.remove('show');
  }

  /* ---------- 绑定 ---------- */

  document.addEventListener('click', function (e) {
    var opener = e.target.closest && e.target.closest('[data-theme-open]');
    if (opener) { e.preventDefault(); open(); return; }
    if (e.target.closest && e.target.closest('[data-theme-close]')) { close(); return; }
    var ov = e.target.closest && e.target.closest('#themeOverlay');
    if (ov && e.target === ov) close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () { if (state.mode === 'auto') { apply(); renderPanel(); } };
    mq.addEventListener ? mq.addEventListener('change', onScheme) : mq.addListener(onScheme);
  }

  // 背景图片异步加载后再应用
  function boot() {
    apply();
    if (state.hasImage) idbGet('bg').then(function (url) { imageUrl = url; apply(); });
  }
  boot();

  window.SiteTheme = {
    open: open,
    close: close,
    apply: apply,
    getState: function () { return Object.assign({}, state); }
  };
  window.__renderThemePanel = renderPanel;
})();
