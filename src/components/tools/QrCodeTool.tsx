import { useMemo, useState } from 'preact/hooks';
import qrcode from 'qrcode-generator';

type Level = 'L' | 'M' | 'Q' | 'H';

const LEVELS: Array<{ value: Level; label: string; desc: string }> = [
  { value: 'L', label: 'L', desc: '约 7% 容错' },
  { value: 'M', label: 'M', desc: '约 15% 容错' },
  { value: 'Q', label: 'Q', desc: '约 25% 容错' },
  { value: 'H', label: 'H', desc: '约 30% 容错' },
];

const SIZES = [
  { label: '小', px: 180 },
  { label: '中', px: 260 },
  { label: '大', px: 360 },
];

const MARGIN = 4;

interface QrResult {
  path: string;
  viewBox: string;
  modules: number;
  version: number;
  error: string;
}

const EMPTY: QrResult = { path: '', viewBox: '', modules: 0, version: 0, error: '' };

function build(text: string, level: Level): QrResult {
  if (!text.trim()) return EMPTY;

  try {
    const qr = qrcode(0, level);
    qr.addData(text);
    qr.make();

    const modules = qr.getModuleCount();
    let path = '';

    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) {
        if (qr.isDark(row, col)) {
          path += `M${col + MARGIN} ${row + MARGIN}h1v1h-1z`;
        }
      }
    }

    const total = modules + MARGIN * 2;
    return {
      path,
      viewBox: `0 0 ${total} ${total}`,
      modules,
      version: (modules - 17) / 4,
      error: '',
    };
  } catch (err) {
    return {
      ...EMPTY,
      error: `生成失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export default function QrCodeTool() {
  const [text, setText] = useState('https://example.com');
  const [level, setLevel] = useState<Level>('M');
  const [size, setSize] = useState(260);

  const qr = useMemo(() => build(text, level), [text, level]);

  const download = () => {
    if (!qr.path) return;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${qr.viewBox}" width="${size}" height="${size}"><rect width="100%" height="100%" fill="#ffffff"/><path d="${qr.path}" fill="#000000"/></svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'qrcode.svg';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div class="tool-grid">
      <div class="stack">
        <div class="label">
          <label for="qr-input">内容</label>
          <span>{text.length} 字符</span>
        </div>
        <textarea
          id="qr-input"
          class="textarea"
          spellcheck={false}
          placeholder="链接、文本、一段 JSON 都可以"
          value={text}
          onInput={(event) => setText((event.target as HTMLTextAreaElement).value)}
        />

        <div class="label" style="margin-top: 4px;">
          <span>容错级别</span>
          <span>级别越高，图越密</span>
        </div>
        <div class="segmented" role="group" aria-label="容错级别">
          {LEVELS.map((item) => (
            <button
              type="button"
              aria-pressed={level === item.value}
              onClick={() => setLevel(item.value)}
              title={item.desc}
            >
              {item.label} · {item.desc}
            </button>
          ))}
        </div>

        <div class="label">
          <span>尺寸</span>
          <span>{size} px</span>
        </div>
        <div class="segmented" role="group" aria-label="二维码尺寸">
          {SIZES.map((item) => (
            <button
              type="button"
              aria-pressed={size === item.px}
              onClick={() => setSize(item.px)}
            >
              {item.label} {item.px}
            </button>
          ))}
        </div>

        <div class="row">
          <button type="button" class="btn btn--primary" onClick={download} disabled={!qr.path}>
            下载 SVG
          </button>
          <span class="hint">
            {qr.error
              ? ''
              : qr.modules
                ? `版本 ${qr.version} · ${qr.modules}×${qr.modules} 模块`
                : '输入内容后实时生成'}
          </span>
        </div>

        {qr.error && <div class="alert">❌ {qr.error}</div>}

        <p class="hint">
          二维码在浏览器本地绘制成 SVG 路径，内容不会发往服务器。SVG 适合打印或再放大；微信/支付宝扫码都能识别。
        </p>
      </div>

      <div class="stack">
        <div class="label">
          <span>预览</span>
          <span>扫描即可读取</span>
        </div>
        <div class="qr-box">
          {qr.path ? (
            <svg
              viewBox={qr.viewBox}
              width={size}
              height={size}
              role="img"
              aria-label="二维码预览"
            >
              <rect x="0" y="0" width="100%" height="100%" fill="#ffffff" />
              <path d={qr.path} fill="#000000" />
            </svg>
          ) : (
            <p class="hint">{qr.error ? '内容过长，换个容错级别或缩短内容。' : '输入内容后这里会出现二维码。'}</p>
          )}
        </div>
      </div>
    </div>
  );
}
