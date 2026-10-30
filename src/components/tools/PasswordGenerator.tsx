import { useEffect, useState } from 'preact/hooks';
import CopyButton from './CopyButton';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/';
const AMBIGUOUS = /[0O1lI]/g;

function randomInt(max: number): number {
  // 拒绝采样，避免取模带来的分布偏差
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

function pick(pool: string): string {
  return pool.charAt(randomInt(pool.length));
}

function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

function strengthOf(bits: number): { label: string; tone: string } {
  if (bits >= 100) return { label: '很强', tone: 'var(--green)' };
  if (bits >= 80) return { label: '强', tone: 'var(--green)' };
  if (bits >= 60) return { label: '中等', tone: 'var(--accent)' };
  return { label: '偏弱', tone: 'var(--accent)' };
}

export default function PasswordGenerator() {
  const [length, setLength] = useState(16);
  const [useUpper, setUseUpper] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useDigits, setUseDigits] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);
  const [noAmbiguous, setNoAmbiguous] = useState(true);
  const [count, setCount] = useState(3);
  const [list, setList] = useState<string[]>([]);

  const groups: string[] = [];
  if (useLower) groups.push(LOWER);
  if (useUpper) groups.push(UPPER);
  if (useDigits) groups.push(DIGITS);
  if (useSymbols) groups.push(SYMBOLS);

  const filtered = noAmbiguous ? groups.map((group) => group.replace(AMBIGUOUS, '')) : groups;
  const pool = filtered.join('');
  const entropy = pool ? Math.round(length * Math.log2(pool.length)) : 0;
  const strength = strengthOf(entropy);

  const generate = (nextCount = count) => {
    setCount(nextCount);

    if (pool.length === 0) {
      setList([]);
      return;
    }

    const makeOne = () => {
      const chars = filtered.map((group) => pick(group));
      while (chars.length < length) {
        chars.push(pick(pool));
      }
      return shuffle(chars).slice(0, length).join('');
    };

    setList(Array.from({ length: nextCount }, makeOne));
  };

  useEffect(() => {
    generate(3);
    // eslint-disable-next-line
  }, []);

  return (
    <div class="tool-stage">
      <div class="tool-panel stack">
        <div class="row row--between">
          <div class="label" style="margin: 0;">
            <label for="pwd-length">长度</label>
            <span>
              {length} 位 · 约 {entropy} bit ·{' '}
              <span class="mono" style={`color: ${strength.tone};`}>
                {pool ? strength.label : '未选择字符'}
              </span>
            </span>
          </div>
          <div class="row">
            <input
              id="pwd-length"
              class="input"
              type="range"
              min="4"
              max="64"
              step="1"
              value={length}
              onInput={(event) => setLength(Number((event.target as HTMLInputElement).value))}
              style="flex: 1 1 140px; min-width: 0; max-width: 260px;"
            />
            <input
              class="input"
              type="number"
              min="4"
              max="64"
              value={length}
              style="flex: 0 0 auto; width: 76px;"
              onInput={(event) => {
                const value = Number((event.target as HTMLInputElement).value);
                if (Number.isFinite(value)) setLength(Math.min(64, Math.max(4, Math.round(value))));
              }}
            />
          </div>
        </div>

        <div class="row" role="group" aria-label="字符集">
          <label class="chip">
            <input type="checkbox" checked={useUpper} onChange={() => setUseUpper((v) => !v)} />
            <span class="chip__box" aria-hidden="true"></span>
            大写 A-Z
          </label>
          <label class="chip">
            <input type="checkbox" checked={useLower} onChange={() => setUseLower((v) => !v)} />
            <span class="chip__box" aria-hidden="true"></span>
            小写 a-z
          </label>
          <label class="chip">
            <input type="checkbox" checked={useDigits} onChange={() => setUseDigits((v) => !v)} />
            <span class="chip__box" aria-hidden="true"></span>
            数字 0-9
          </label>
          <label class="chip">
            <input type="checkbox" checked={useSymbols} onChange={() => setUseSymbols((v) => !v)} />
            <span class="chip__box" aria-hidden="true"></span>
            符号 !@#$
          </label>
          <label class="chip">
            <input
              type="checkbox"
              checked={noAmbiguous}
              onChange={() => setNoAmbiguous((v) => !v)}
            />
            <span class="chip__box" aria-hidden="true"></span>
            排除易混 0O1lI
          </label>
        </div>

        <div class="row row--between">
          <div class="segmented" role="group" aria-label="生成数量">
            {[1, 3, 5, 10].map((value) => (
              <button
                type="button"
                aria-pressed={count === value && list.length === value}
                onClick={() => generate(value)}
              >
                {value} 个
              </button>
            ))}
          </div>
          <div class="row">
            <button
              type="button"
              class="btn btn--primary"
              onClick={() => generate()}
              disabled={pool.length === 0}
            >
              重新生成
            </button>
            <CopyButton value={list.join('\n')} label="复制全部" disabled={list.length === 0} />
          </div>
        </div>

        <p class="hint">
          随机数来自 <code>crypto.getRandomValues</code>；勾选的每一类字符至少出现一次，其余位从合并后的字符池里取。
          强度按「长度 × log2(字符池大小)」估算，仅供参考。
        </p>
      </div>

      <div class="tool-panel stack">
        <div class="label">
          <span>生成结果</span>
          <span>{list.length} 个</span>
        </div>

        {pool.length === 0 ? (
          <div class="alert alert--warn">至少勾选一类字符才能生成密码。</div>
        ) : list.length === 0 ? (
          <p class="hint">点「重新生成」开始。</p>
        ) : (
          <div class="result-list" style="max-height: none;">
            {list.map((password, index) => (
              <div class="result-row">
                <span class="result-row__index">{String(index + 1).padStart(2, '0')}</span>
                <span class="result-row__text">{password}</span>
                <CopyButton value={password} label="复制" class="btn btn--ghost btn--sm" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
