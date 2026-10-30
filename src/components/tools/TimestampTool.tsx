import { useEffect, useState } from 'preact/hooks';
import CopyButton from './CopyButton';

const TZ = 'Asia/Shanghai';
const TZ_LABEL = 'Asia/Shanghai（UTC+8）';

const SHANGHAI_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const UTC_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

type Parts = Record<string, string>;

function partsOf(ms: number, formatter: Intl.DateTimeFormat): Parts {
  const result: Parts = {};
  for (const part of formatter.formatToParts(new Date(ms))) {
    result[part.type] = part.value;
  }
  return result;
}

function formatShanghai(ms: number): string {
  const p = partsOf(ms, SHANGHAI_FORMAT);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} ${p.weekday ?? ''}`.trim();
}

function formatUtc(ms: number): string {
  const p = partsOf(ms, UTC_FORMAT);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} UTC`;
}

function toInputValue(ms: number): string {
  const p = partsOf(ms, SHANGHAI_FORMAT);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** 相对基准时刻的口语化描述，如「3 小时前」「20 分钟后」 */
function relativeLabel(ms: number, base: number): string {
  const diff = ms - base;
  const abs = Math.abs(diff);

  const units: Array<[limit: number, size: number, name: string]> = [
    [60_000, 1000, '秒'],
    [3_600_000, 60_000, '分钟'],
    [86_400_000, 3_600_000, '小时'],
    [2_592_000_000, 86_400_000, '天'],
    [31_536_000_000, 2_592_000_000, '个月'],
    [Number.POSITIVE_INFINITY, 31_536_000_000, '年'],
  ];

  if (abs < 5000) return '就在刚才';

  for (const [limit, size, name] of units) {
    if (abs < limit) {
      const amount = Math.floor(abs / size);
      return diff < 0 ? `${amount} ${name}前` : `${amount} ${name}后`;
    }
  }

  return '';
}

/** 某一时刻在上海时区相对 UTC 的偏移（毫秒） */
function shanghaiOffsetMs(ms: number): number {
  const p = partsOf(ms, SHANGHAI_FORMAT);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** 把 datetime-local 的字符串按东八区解释，返回 UTC 毫秒 */
function shanghaiInputToMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second = '0'] = match;
  const guess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  return guess - shanghaiOffsetMs(guess);
}

interface TsResult {
  detected: 'seconds' | 'milliseconds';
  millis: number;
  seconds: number;
  shanghai: string;
  utc: string;
  iso: string;
  rfc2822: string;
  relative: string;
}

interface DtResult {
  millis: number;
  seconds: number;
  shanghai: string;
}

export default function TimestampTool() {
  const [now, setNow] = useState(0);
  const [unit, setUnit] = useState<'auto' | 'seconds' | 'milliseconds'>('auto');
  const [tsInput, setTsInput] = useState('');
  const [tsResult, setTsResult] = useState<TsResult | null>(null);
  const [tsError, setTsError] = useState('');
  const [dtInput, setDtInput] = useState('');
  const [dtResult, setDtResult] = useState<DtResult | null>(null);
  const [dtError, setDtError] = useState('');

  useEffect(() => {
    setNow(Date.now());
    setDtInput(toInputValue(Date.now()));

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const convertTs = () => {
    const raw = tsInput.trim();
    setTsError('');
    setTsResult(null);

    if (!raw) {
      setTsError('先填一个时间戳，例如 1700000000 或 1700000000000。');
      return;
    }

    if (!/^-?\d+$/.test(raw)) {
      setTsError('时间戳只能包含数字（可以带一个负号）。');
      return;
    }

    const value = Number(raw);
    if (!Number.isSafeInteger(value)) {
      setTsError('这个数字超出了安全整数范围，无法准确换算。');
      return;
    }

    const detected: 'seconds' | 'milliseconds' =
      unit === 'auto'
        ? raw.replace('-', '').length <= 10
          ? 'seconds'
          : 'milliseconds'
        : unit;

    const millis = detected === 'seconds' ? value * 1000 : value;
    const date = new Date(millis);

    if (Number.isNaN(date.getTime())) {
      setTsError('超出 JavaScript 能表示的时间范围。');
      return;
    }

    setTsResult({
      detected,
      millis,
      seconds: Math.floor(millis / 1000),
      shanghai: formatShanghai(millis),
      utc: formatUtc(millis),
      iso: date.toISOString(),
      rfc2822: date.toUTCString(),
      relative: relativeLabel(millis, Date.now()),
    });
  };

  const convertDt = () => {
    setDtError('');
    setDtResult(null);

    if (!dtInput) {
      setDtError('先选择一个日期时间。');
      return;
    }

    const millis = shanghaiInputToMs(dtInput);
    if (millis === null || Number.isNaN(millis) || Number.isNaN(new Date(millis).getTime())) {
      setDtError('日期格式无法识别，请用输入框里的日期时间控件。');
      return;
    }

    setDtResult({
      millis,
      seconds: Math.floor(millis / 1000),
      shanghai: formatShanghai(millis),
    });
  };

  const fillNow = () => {
    setDtInput(toInputValue(Date.now()));
    setDtResult(null);
    setDtError('');
  };

  const seconds = Math.floor(now / 1000);

  return (
    <div class="tool-stage">
      <div class="tool-panel">
        <div class="row row--between">
          <div>
            <div class="label">
              <span>Now</span>
              <span>{TZ_LABEL}</span>
            </div>
            <p style="margin-top: 6px;">
              <span class="stat">{now ? seconds : '—'}</span>
              <span class="stat__unit">秒</span>
            </p>
            <p class="hint mono">{now ? `${now} ms` : '等待浏览器时间…'}</p>
          </div>
          <div class="row">
            <CopyButton
              value={now ? String(seconds) : ''}
              label="复制秒级"
              disabled={!now}
            />
            <CopyButton value={now ? String(now) : ''} label="复制毫秒" disabled={!now} />
          </div>
        </div>
      </div>

      <div class="tool-panel">
        <div class="tool-grid">
          <div class="stack">
            <div class="label">
              <label for="ts-input">时间戳 → 日期时间</label>
              <span>固定 {TZ}</span>
            </div>

            <input
              id="ts-input"
              class="input"
              inputMode="numeric"
              spellcheck={false}
              placeholder="1700000000 或 1700000000000"
              value={tsInput}
              onInput={(event) => setTsInput((event.target as HTMLInputElement).value)}
            />

            <div class="segmented" role="group" aria-label="时间戳精度">
              <button
                type="button"
                aria-pressed={unit === 'auto'}
                onClick={() => setUnit('auto')}
              >
                自动识别
              </button>
              <button
                type="button"
                aria-pressed={unit === 'seconds'}
                onClick={() => setUnit('seconds')}
              >
                秒
              </button>
              <button
                type="button"
                aria-pressed={unit === 'milliseconds'}
                onClick={() => setUnit('milliseconds')}
              >
                毫秒
              </button>
            </div>

            <div class="row">
              <button type="button" class="btn btn--primary" onClick={convertTs}>
                转换
              </button>
            </div>

            {tsError && <div class="alert">{tsError}</div>}

            {tsResult && (
              <>
                <dl class="kv">
                  <div>
                    <dt>东八区</dt>
                    <dd>{tsResult.shanghai}</dd>
                  </div>
                  <div>
                    <dt>识别为</dt>
                    <dd>{tsResult.detected === 'seconds' ? '秒（10 位）' : '毫秒（13 位）'}</dd>
                  </div>
                  <div>
                    <dt>UTC</dt>
                    <dd>{tsResult.utc}</dd>
                  </div>
                  <div>
                    <dt>ISO 8601</dt>
                    <dd>{tsResult.iso}</dd>
                  </div>
                  <div>
                    <dt>RFC 2822</dt>
                    <dd>{tsResult.rfc2822}</dd>
                  </div>
                  <div>
                    <dt>相对时间</dt>
                    <dd>{tsResult.relative}</dd>
                  </div>
                </dl>
                <div class="row">
                  <CopyButton value={tsResult.shanghai} label="复制东八区时间" />
                  <CopyButton value={tsResult.iso} label="复制 ISO" />
                </div>
              </>
            )}
          </div>

          <div class="stack">
            <div class="label">
              <label for="dt-input">日期时间 → 时间戳</label>
              <span>按 {TZ} 解释</span>
            </div>

            <input
              id="dt-input"
              class="input"
              type="datetime-local"
              step="1"
              value={dtInput}
              onInput={(event) => setDtInput((event.target as HTMLInputElement).value)}
            />

            <div class="row">
              <button type="button" class="btn btn--primary" onClick={convertDt}>
                转换
              </button>
              <button type="button" class="btn btn--ghost" onClick={fillNow}>
                填入当前时间
              </button>
            </div>

            {dtError && <div class="alert">{dtError}</div>}

            {dtResult && (
              <>
                <dl class="kv">
                  <div>
                    <dt>秒级</dt>
                    <dd>{dtResult.seconds}</dd>
                  </div>
                  <div>
                    <dt>毫秒级</dt>
                    <dd>{dtResult.millis}</dd>
                  </div>
                  <div>
                    <dt>回显</dt>
                    <dd>{dtResult.shanghai}</dd>
                  </div>
                </dl>
                <div class="row">
                  <CopyButton value={String(dtResult.seconds)} label="复制秒级" />
                  <CopyButton value={String(dtResult.millis)} label="复制毫秒" />
                </div>
              </>
            )}

            <p class="hint">输入框里选的是东八区墙上时间，转换时会先减去 UTC+8 的偏移。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
