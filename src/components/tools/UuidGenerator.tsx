import { useEffect, useState } from 'preact/hooks';
import CopyButton from './CopyButton';

const COUNTS = [1, 5, 10, 50];
const NIL = '00000000-0000-0000-0000-000000000000';

type Version = 'v4' | 'v7' | 'nil';

function formatBytes(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatBytes(bytes);
}

/** RFC 9562 UUIDv7：前 48 位是毫秒时间戳，可按生成时间排序 */
function uuidv7(): string {
  const ms = Date.now();
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  return formatBytes(bytes);
}

export default function UuidGenerator() {
  const [count, setCount] = useState(5);
  const [version, setVersion] = useState<Version>('v4');
  const [uppercase, setUppercase] = useState(false);
  const [noDashes, setNoDashes] = useState(false);
  const [list, setList] = useState<string[]>([]);

  const generate = (nextCount: number, nextVersion: Version) => {
    setCount(nextCount);
    setVersion(nextVersion);

    if (nextVersion === 'nil') {
      setList([NIL]);
      return;
    }

    const factory = nextVersion === 'v7' ? uuidv7 : uuidv4;
    setList(Array.from({ length: nextCount }, factory));
  };

  useEffect(() => {
    setList(Array.from({ length: 5 }, uuidv4));
  }, []);

  /** 展示与复制都走同一份格式化结果 */
  const formatted = list.map((uuid) => {
    let value = uuid;
    if (noDashes) value = value.replace(/-/g, '');
    if (uppercase) value = value.toUpperCase();
    return value;
  });

  const json = JSON.stringify(formatted, null, 2);
  const effectiveCount = version === 'nil' ? 1 : count;

  return (
    <div class="tool-stage">
      <div class="tool-panel stack">
        <div class="row row--between">
          <div class="row">
            <div class="segmented" role="group" aria-label="UUID 版本">
              <button
                type="button"
                aria-pressed={version === 'v4'}
                onClick={() => generate(effectiveCount, 'v4')}
              >
                v4 随机
              </button>
              <button
                type="button"
                aria-pressed={version === 'v7'}
                onClick={() => generate(effectiveCount, 'v7')}
              >
                v7 时间有序
              </button>
              <button
                type="button"
                aria-pressed={version === 'nil'}
                onClick={() => generate(effectiveCount, 'nil')}
              >
                NIL
              </button>
            </div>
            <div class="segmented" role="group" aria-label="生成数量">
              {COUNTS.map((value) => (
                <button
                  type="button"
                  aria-pressed={count === value && list.length === value}
                  onClick={() => generate(value, version)}
                >
                  {value} 个
                </button>
              ))}
            </div>
          </div>

          <div class="row">
            <button
              type="button"
              class="btn btn--primary"
              onClick={() => generate(effectiveCount, version)}
            >
              重新生成
            </button>
            <CopyButton value={formatted.join('\n')} label="复制全部" />
            <CopyButton value={json} label="复制为 JSON 数组" />
          </div>
        </div>

        <div class="row" role="group" aria-label="输出格式">
          <label class="chip">
            <input
              type="checkbox"
              checked={uppercase}
              onChange={() => setUppercase((previous) => !previous)}
            />
            <span class="chip__box" aria-hidden="true"></span>
            大写
          </label>
          <label class="chip">
            <input
              type="checkbox"
              checked={noDashes}
              onChange={() => setNoDashes((previous) => !previous)}
            />
            <span class="chip__box" aria-hidden="true"></span>
            去连字符
          </label>
        </div>

        <p class="hint">
          v4 用浏览器原生 <code>crypto.randomUUID()</code>；v7 按 RFC 9562
          把毫秒时间戳放进前 48 位，适合做数据库主键（索引友好）；NIL 是全零占位符，固定只有一个。
        </p>
      </div>

      <div class="tool-panel">
        {list.length === 0 ? (
          <p class="hint">点击「重新生成」开始。</p>
        ) : (
          <div class="result-list">
            {formatted.map((uuid, index) => (
              <div class="result-row">
                <span class="result-row__index">{String(index + 1).padStart(2, '0')}</span>
                <span class="result-row__text">{uuid}</span>
                <CopyButton
                  value={uuid}
                  label="复制"
                  class="btn btn--ghost btn--sm"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
