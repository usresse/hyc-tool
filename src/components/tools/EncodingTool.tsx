import { useMemo, useState } from 'preact/hooks';
import CopyButton from './CopyButton';

type Tab = 'base64' | 'url' | 'jwt' | 'hash';
type Direction = 'encode' | 'decode';

const TZ_LABEL = 'Asia/Shanghai（UTC+8）';

const TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

function formatTime(ms: number): string {
  const parts: Record<string, string> = {};
  for (const part of TIME_FORMAT.formatToParts(new Date(ms))) {
    parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.weekday ?? ''}`.trim();
}

/** 「3 天后」「2 小时前」这类相对描述 */
function relativeTime(ms: number): string {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return diff < 0 ? '刚刚' : '即将';

  const units: Array<[limit: number, size: number, name: string]> = [
    [3_600_000, 60_000, '分钟'],
    [86_400_000, 3_600_000, '小时'],
    [2_592_000_000, 86_400_000, '天'],
    [31_536_000_000, 2_592_000_000, '个月'],
    [Number.POSITIVE_INFINITY, 31_536_000_000, '年'],
  ];

  for (const [limit, size, name] of units) {
    if (abs < limit) {
      const amount = Math.floor(abs / size);
      return diff < 0 ? `已过去 ${amount} ${name}` : `还有 ${amount} ${name}`;
    }
  }

  return '';
}

/** JWT 各段是 base64url，需要补填充后再按 UTF-8 解码 */
function base64UrlDecode(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

interface JwtResult {
  header: string;
  payload: string;
  algorithm: string;
  type: string;
  signatureLength: number;
  claims: Array<{ label: string; value: string; note?: string }>;
  error: string;
}

const EMPTY_JWT: JwtResult = {
  header: '',
  payload: '',
  algorithm: '',
  type: '',
  signatureLength: 0,
  claims: [],
  error: '',
};

function decodeJwt(raw: string): JwtResult {
  const token = raw.trim().replace(/^Bearer\s+/i, '');
  if (!token) return EMPTY_JWT;

  const segments = token.split('.');
  if (segments.length !== 3) {
    return {
      ...EMPTY_JWT,
      error: `JWT 应该是 3 段（header.payload.signature），当前是 ${segments.length} 段。`,
    };
  }

  try {
    const headerObject = JSON.parse(base64UrlDecode(segments[0])) as Record<string, unknown>;
    const payloadObject = JSON.parse(base64UrlDecode(segments[1])) as Record<string, unknown>;

    const claims: JwtResult['claims'] = [];
    const timeClaims: Array<[string, string]> = [
      ['exp', '过期时间'],
      ['iat', '签发时间'],
      ['nbf', '生效时间'],
    ];

    for (const [key, label] of timeClaims) {
      const value = payloadObject[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = value * 1000;
        const expired = key === 'exp' && ms <= Date.now();
        claims.push({
          label,
          value: `${formatTime(ms)}（${relativeTime(ms)}）`,
          note: expired ? '已过期' : undefined,
        });
      }
    }

    return {
      header: JSON.stringify(headerObject, null, 2),
      payload: JSON.stringify(payloadObject, null, 2),
      algorithm: typeof headerObject.alg === 'string' ? headerObject.alg : '—',
      type: typeof headerObject.typ === 'string' ? headerObject.typ : '—',
      signatureLength: segments[2].length,
      claims,
      error: '',
    };
  } catch (err) {
    return {
      ...EMPTY_JWT,
      error: `解析失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ==================== Hash ====================

const HASH_BIG_FILE = 32 * 1024 * 1024;
const HASH_MAX_FILE = 128 * 1024 * 1024;

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = new Uint32Array(64);
for (let i = 0; i < 64; i += 1) {
  MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
}
const rotl = (value: number, bits: number) => ((value << bits) | (value >>> (32 - bits))) >>> 0;

/** 纯前端 MD5（RFC 1321），crypto.subtle 不提供 MD5，所以这里自己实现 */
function md5(bytes: Uint8Array): string {
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const words = new Uint32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      words[i] = view.getUint32(offset + i * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      f = (f + a + MD5_K[i] + words[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(f, MD5_SHIFTS[i])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0]
    .flatMap((word) => [
      word & 0xff,
      (word >>> 8) & 0xff,
      (word >>> 16) & 0xff,
      (word >>> 24) & 0xff,
    ])
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512', bytes: Uint8Array): Promise<string> {
  // 复制一份，保证拿到的是独占的 ArrayBuffer，兼容 crypto.subtle 的类型要求
  const copy = Uint8Array.from(bytes);
  return toHex(await crypto.subtle.digest(algorithm, copy.buffer as ArrayBuffer));
}

interface HashResults {
  md5: string;
  sha1: string;
  sha256: string;
  sha512: string;
}

const HASH_ROWS: Array<{ label: string; key: keyof HashResults }> = [
  { label: 'MD5', key: 'md5' },
  { label: 'SHA-1', key: 'sha1' },
  { label: 'SHA-256', key: 'sha256' },
  { label: 'SHA-512', key: 'sha512' },
];

// ==================== EncodingTool ====================

export default function EncodingTool() {
  const [tab, setTab] = useState<Tab>('base64');

  // Base64
  const [b64Mode, setB64Mode] = useState<Direction>('encode');
  const [b64Input, setB64Input] = useState('');
  const [b64Output, setB64Output] = useState('');
  const [b64Error, setB64Error] = useState('');
  const [urlSafe, setUrlSafe] = useState(false);

  // URL
  const [urlMode, setUrlMode] = useState<Direction>('encode');
  const [urlInput, setUrlInput] = useState('');
  const [urlOutput, setUrlOutput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [wholeUrl, setWholeUrl] = useState(false);

  // JWT
  const [jwtInput, setJwtInput] = useState('');
  const jwt = useMemo(() => decodeJwt(jwtInput), [jwtInput]);

  // Hash
  const [hashText, setHashText] = useState('');
  const [hashFileName, setHashFileName] = useState('');
  const [hashFileBytes, setHashFileBytes] = useState<Uint8Array | null>(null);
  const [hashResults, setHashResults] = useState<HashResults | null>(null);
  const [hashBusy, setHashBusy] = useState(false);
  const [hashError, setHashError] = useState('');

  const runBase64 = () => {
    if (!b64Input) {
      setB64Output('');
      setB64Error('');
      return;
    }

    try {
      if (b64Mode === 'encode') {
        const bytes = new TextEncoder().encode(b64Input);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const standard = btoa(binary);
        setB64Output(
          urlSafe ? standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : standard,
        );
        setB64Error('');
        return;
      }

      const normalized = b64Input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
      const remainder = normalized.length % 4;
      if (remainder === 1) {
        setB64Output('');
        setB64Error('解码失败：这不是合法的 Base64（长度对不上，缺了字符）。');
        return;
      }
      const cleaned = normalized + '='.repeat((4 - remainder) % 4);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
        setB64Output('');
        setB64Error('解码失败：这不是合法的 Base64（含非法字符）。');
        return;
      }

      const binary = atob(cleaned);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      setB64Output(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      setB64Error('');
    } catch {
      setB64Output('');
      setB64Error(
        b64Mode === 'decode'
          ? '解码失败：内容能转成二进制，但不是合法的 UTF-8 文本，无法还原成字符。'
          : '编码失败：输入内容无法按 UTF-8 处理。',
      );
    }
  };

  const runUrl = () => {
    if (!urlInput) {
      setUrlOutput('');
      setUrlError('');
      return;
    }

    try {
      if (urlMode === 'encode') {
        setUrlOutput(wholeUrl ? encodeURI(urlInput) : encodeURIComponent(urlInput));
      } else {
        setUrlOutput(decodeURIComponent(urlInput));
      }
      setUrlError('');
    } catch {
      setUrlOutput('');
      setUrlError('解码失败：内容里有不完整或非法的百分号转义（例如单独的 %）。');
    }
  };

  const hashInputBytes = () => {
    if (hashFileBytes) return hashFileBytes;
    return new TextEncoder().encode(hashText);
  };

  const runHash = async () => {
    const bytes = hashInputBytes();
    if (bytes.length === 0) {
      setHashResults(null);
      setHashError('');
      return;
    }

    setHashBusy(true);
    setHashError('');

    try {
      const md5Value = md5(bytes);
      const [sha1, sha256, sha512] = await Promise.all([
        digest('SHA-1', bytes),
        digest('SHA-256', bytes),
        digest('SHA-512', bytes),
      ]);
      setHashResults({ md5: md5Value, sha1, sha256, sha512 });
    } catch (err) {
      setHashResults(null);
      setHashError(`计算失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setHashBusy(false);
    }
  };

  const pickHashFile = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setHashError('');
    setHashResults(null);

    if (file.size > HASH_MAX_FILE) {
      setHashFileName('');
      setHashFileBytes(null);
      setHashError('文件超过 128 MB，纯前端计算会让页面卡很久，换个小一点的吧。');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      setHashFileName(file.name);
      setHashFileBytes(bytes);

      if (file.size > HASH_BIG_FILE) {
        setHashError(`文件 ${(file.size / 1024 / 1024).toFixed(1)} MB 偏大，MD5 是纯 JS 实现，计算可能要几秒。`);
      }
    } catch (err) {
      setHashError(`读取文件失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const switchTab = (next: Tab) => setTab(next);

  const hashByteSize = hashInputBytes().length;

  return (
    <div class="tool-stage">
      <div class="tool-panel stack">
        <div class="segmented" role="group" aria-label="编码类型">
          <button type="button" aria-pressed={tab === 'base64'} onClick={() => switchTab('base64')}>
            Base64
          </button>
          <button type="button" aria-pressed={tab === 'url'} onClick={() => switchTab('url')}>
            URL 编解码
          </button>
          <button type="button" aria-pressed={tab === 'hash'} onClick={() => switchTab('hash')}>
            Hash 摘要
          </button>
          <button type="button" aria-pressed={tab === 'jwt'} onClick={() => switchTab('jwt')}>
            JWT 解析
          </button>
        </div>
      </div>

      {tab === 'base64' && (
        <div class="tool-panel stack">
          <div class="row row--between">
            <div class="segmented" role="group" aria-label="转换方向">
              <button
                type="button"
                aria-pressed={b64Mode === 'encode'}
                onClick={() => {
                  setB64Mode('encode');
                  setB64Output('');
                  setB64Error('');
                }}
              >
                编码 TEXT → BASE64
              </button>
              <button
                type="button"
                aria-pressed={b64Mode === 'decode'}
                onClick={() => {
                  setB64Mode('decode');
                  setB64Output('');
                  setB64Error('');
                }}
              >
                解码 BASE64 → TEXT
              </button>
            </div>
            <div class="row">
              <label class="chip">
                <input
                  type="checkbox"
                  checked={urlSafe}
                  onChange={() => setUrlSafe((previous) => !previous)}
                />
                <span class="chip__box" aria-hidden="true"></span>
                URL-safe
              </label>
              <span class="hint">{b64Mode === 'encode' ? 'UTF-8 → Base64' : 'Base64 → UTF-8'}</span>
            </div>
          </div>

          <div class="tool-grid">
            <div class="stack">
              <div class="label">
                <label for="b64-input">{b64Mode === 'encode' ? '原文' : 'Base64'}</label>
                <span>{b64Input.length} 字符</span>
              </div>
              <textarea
                id="b64-input"
                class="textarea"
                spellcheck={false}
                placeholder={
                  b64Mode === 'encode' ? '支持中文、emoji 和换行……' : '粘贴 Base64 字符串，例如 5L2g5aW9'
                }
                value={b64Input}
                onInput={(event) => setB64Input((event.target as HTMLTextAreaElement).value)}
              />
              <div class="row">
                <button type="button" class="btn btn--primary" onClick={runBase64}>
                  {b64Mode === 'encode' ? '编码' : '解码'}
                </button>
                <button
                  type="button"
                  class="btn btn--ghost"
                  disabled={!b64Output}
                  onClick={() => {
                    setB64Input(b64Output);
                    setB64Mode(b64Mode === 'encode' ? 'decode' : 'encode');
                    setB64Output('');
                    setB64Error('');
                  }}
                >
                  用结果反向转换
                </button>
                <button
                  type="button"
                  class="btn btn--ghost"
                  onClick={() => {
                    setB64Input('');
                    setB64Output('');
                    setB64Error('');
                  }}
                >
                  清空
                </button>
              </div>
            </div>

            <div class="stack">
              <div class="label">
                <span>结果</span>
                <CopyButton value={b64Output} disabled={!b64Output} />
              </div>
              {b64Error ? (
                <div class="alert">{b64Error}</div>
              ) : (
                <pre class="code code--tall">{b64Output || '// 结果会出现在这里'}</pre>
              )}
              <p class="hint">
                Unicode 走 TextEncoder / TextDecoder，不会出现 btoa 的中文报错。勾选 URL-safe 后按
                RFC 4648 输出 base64url（+/ → -_，去掉 =）；解码时两种字母表都认，缺少的填充会自动补齐。
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'url' && (
        <div class="tool-panel stack">
          <div class="row row--between">
            <div class="segmented" role="group" aria-label="转换方向">
              <button
                type="button"
                aria-pressed={urlMode === 'encode'}
                onClick={() => {
                  setUrlMode('encode');
                  setUrlOutput('');
                  setUrlError('');
                }}
              >
                编码 → 转义
              </button>
              <button
                type="button"
                aria-pressed={urlMode === 'decode'}
                onClick={() => {
                  setUrlMode('decode');
                  setUrlOutput('');
                  setUrlError('');
                }}
              >
                解码 → 还原
              </button>
            </div>
            {urlMode === 'encode' && (
              <div class="row">
                <label class="chip">
                  <input
                    type="checkbox"
                    checked={wholeUrl}
                    onChange={() => setWholeUrl((previous) => !previous)}
                  />
                  <span class="chip__box" aria-hidden="true"></span>
                  整段 URL（encodeURI）
                </label>
                <span class="hint">{wholeUrl ? '保留 : / ? & = 等分隔符' : 'encodeURIComponent'}</span>
              </div>
            )}
          </div>

          <div class="tool-grid">
            <div class="stack">
              <div class="label">
                <label for="url-input">{urlMode === 'encode' ? '原始文本' : '转义后的文本'}</label>
                <span>{urlInput.length} 字符</span>
              </div>
              <textarea
                id="url-input"
                class="textarea"
                spellcheck={false}
                placeholder={
                  urlMode === 'encode'
                    ? '例如 keyword=中文 或 https://example.com/?q=搜索'
                    : '例如 keyword%3D%E4%B8%AD%E6%96%87'
                }
                value={urlInput}
                onInput={(event) => setUrlInput((event.target as HTMLTextAreaElement).value)}
              />
              <div class="row">
                <button type="button" class="btn btn--primary" onClick={runUrl}>
                  {urlMode === 'encode' ? '编码' : '解码'}
                </button>
                <button
                  type="button"
                  class="btn btn--ghost"
                  disabled={!urlOutput}
                  onClick={() => {
                    setUrlInput(urlOutput);
                    setUrlMode(urlMode === 'encode' ? 'decode' : 'encode');
                    setUrlOutput('');
                    setUrlError('');
                  }}
                >
                  用结果反向转换
                </button>
                <button
                  type="button"
                  class="btn btn--ghost"
                  onClick={() => {
                    setUrlInput('');
                    setUrlOutput('');
                    setUrlError('');
                  }}
                >
                  清空
                </button>
              </div>
              <p class="hint">
                拼请求参数用 <code>encodeURIComponent</code>（会把 <code>/ ? & =</code> 也转义）；
                只想转义整条链接里的中文时勾选「整段 URL」，等价于 <code>encodeURI</code>。
              </p>
            </div>

            <div class="stack">
              <div class="label">
                <span>结果</span>
                <CopyButton value={urlOutput} disabled={!urlOutput} />
              </div>
              {urlError ? (
                <div class="alert">{urlError}</div>
              ) : (
                <pre class="code code--tall">{urlOutput || '// 结果会出现在这里'}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'hash' && (
        <div class="tool-panel stack">
          <div class="label">
            <label for="hash-input">输入文本</label>
            <span>
              {hashFileBytes ? `文件：${hashFileName}` : `${hashText.length} 字符 · ${hashByteSize} 字节`}
            </span>
          </div>

          <textarea
            id="hash-input"
            class="textarea textarea--short"
            spellcheck={false}
            placeholder="粘贴要计算摘要的文本；也可以直接选一个文件按字节计算。"
            value={hashFileBytes ? '' : hashText}
            disabled={!!hashFileBytes}
            onInput={(event) => setHashText((event.target as HTMLTextAreaElement).value)}
          />

          <div class="row">
            <button type="button" class="btn btn--primary" onClick={runHash} disabled={hashBusy}>
              {hashBusy ? '计算中…' : '计算摘要'}
            </button>
            <label class="btn">
              选择文件
              <input type="file" hidden onChange={pickHashFile} />
            </label>
            {hashFileBytes && (
              <button
                type="button"
                class="btn btn--ghost"
                onClick={() => {
                  setHashFileName('');
                  setHashFileBytes(null);
                  setHashResults(null);
                  setHashError('');
                }}
              >
                改回文本
              </button>
            )}
            <button
              type="button"
              class="btn btn--ghost"
              onClick={() => {
                setHashText('');
                setHashFileName('');
                setHashFileBytes(null);
                setHashResults(null);
                setHashError('');
              }}
            >
              清空
            </button>
          </div>

          {hashError && <div class={`alert${hashBusy ? '' : ' alert--warn'}`}>{hashError}</div>}

          <p class="hint">
            MD5 为内置实现，SHA-1 / SHA-256 / SHA-512 走浏览器 <code>crypto.subtle</code>。
            文本按 UTF-8 字节计算；选文件时按文件的原始字节计算，适合校验下载包。
          </p>

          <div class="label" style="margin-top: 6px;">
            <span>摘要结果</span>
            {hashResults && <span>hex · 小写</span>}
          </div>

          {hashResults ? (
            <div class="hash-list">
              {HASH_ROWS.map((row) => (
                <div class="hash-row">
                  <span class="hash-row__algo">{row.label}</span>
                  <span class="hash-row__value">{hashResults[row.key]}</span>
                  <CopyButton
                    value={hashResults[row.key]}
                    label="复制"
                    class="btn btn--ghost btn--sm"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p class="hint">点「计算摘要」后，四种算法的结果会一起列在这里。</p>
          )}
        </div>
      )}

      {tab === 'jwt' && (
        <div class="tool-panel stack">
          <div class="label">
            <label for="jwt-input">JWT Token</label>
            <span>{jwtInput.trim() ? `${jwtInput.trim().split('.').length} 段` : 'header.payload.signature'}</span>
          </div>
          <textarea
            id="jwt-input"
            class="textarea textarea--short"
            spellcheck={false}
            placeholder="粘贴 eyJhbGciOi... 开头的 Token，可带 Bearer 前缀"
            value={jwtInput}
            onInput={(event) => setJwtInput((event.target as HTMLTextAreaElement).value)}
          />

          {jwt.error && <div class="alert">{jwt.error}</div>}

          {!jwt.error && !jwtInput.trim() && (
            <p class="hint">
              粘贴后自动解析 Header 与 Payload，并把 <code>exp / iat / nbf</code> 换算成东八区时间。
              仅解码，不校验签名。
            </p>
          )}

          {!jwt.error && jwt.header && (
            <>
              <dl class="kv">
                <div>
                  <dt>alg</dt>
                  <dd>{jwt.algorithm}</dd>
                </div>
                <div>
                  <dt>typ</dt>
                  <dd>{jwt.type}</dd>
                </div>
                {jwt.claims.map((claim) => (
                  <div>
                    <dt>{claim.label}</dt>
                    <dd>
                      {claim.value}
                      {claim.note && <span class="accent mono"> · {claim.note}</span>}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>签名</dt>
                  <dd class="muted">{jwt.signatureLength} 字符 · 未验签</dd>
                </div>
              </dl>

              <div class="label">
                <span>Header</span>
                <CopyButton value={jwt.header} />
              </div>
              <pre class="code">{jwt.header}</pre>

              <div class="label">
                <span>Payload</span>
                <CopyButton value={jwt.payload} />
              </div>
              <pre class="code">{jwt.payload}</pre>

              <p class="hint">
                时间是按 {TZ_LABEL} 展示的。签名部分只统计长度，工具不会也不能替你验证签名合法性。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
