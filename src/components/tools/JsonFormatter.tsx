import { useState } from 'preact/hooks';
import CopyButton from './CopyButton';

const MAX_WARN_BYTES = 500 * 1024;

const SAMPLE = `{"name":"自留地","tools":["json","timestamp","cron"],"version":1,"owner":{"role":"self","online":true},"tags":[]}`;

/** 递归把对象的键按字母排序；数组保持原有顺序 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([key, item]) => [key, sortKeysDeep(item)]));
  }
  return value;
}

export default function JsonFormatter() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [indent, setIndent] = useState<2 | 4>(2);
  const [sortKeys, setSortKeys] = useState(true);

  const byteSize = new TextEncoder().encode(input).length;
  const tooLarge = byteSize > MAX_WARN_BYTES;

  const run = (space: number) => {
    const raw = input.trim();
    if (!raw) {
      setOutput('');
      setError('');
      return;
    }

    try {
      const parsed: unknown = JSON.parse(input);
      const finalValue = sortKeys ? sortKeysDeep(parsed) : parsed;
      setOutput(JSON.stringify(finalValue, null, space));
      setError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const match = /position (\d+)/.exec(message);
      let detail = message;

      if (match) {
        const offset = Number(match[1]);
        const before = input.slice(0, offset);
        const line = before.split('\n').length;
        const column = offset - before.lastIndexOf('\n');
        detail = `${message}\n定位：第 ${line} 行，第 ${column} 列（偏移 ${offset}）`;
      }

      setError(`❌ ${detail}`);
      setOutput('');
    }
  };

  /** 转义：把任意文本包装成一个 JSON 字符串字面量 */
  const escapeString = () => {
    if (!input) return;
    setOutput(JSON.stringify(input));
    setError('');
  };

  /** 去转义：输入必须是一个带双引号的 JSON 字符串字面量，还原出内部文本 */
  const unescapeString = () => {
    const raw = input.trim();
    if (!raw) return;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'string') {
        setOutput('');
        setError('❌ 去转义只接受 JSON 字符串字面量（双引号包裹），当前内容解析出来不是字符串。');
        return;
      }
      setOutput(parsed);
      setError('');
    } catch (err) {
      setOutput('');
      setError(`❌ 去转义失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const clear = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  const loadSample = () => {
    setInput(SAMPLE);
    setOutput('');
    setError('');
  };

  return (
    <div class="tool-grid tool-grid--wide-left">
      <div class="stack">
        <div class="label">
          <label for="json-input">输入</label>
          <span>
            {input.length} 字符 · {(byteSize / 1024).toFixed(1)} KB
          </span>
        </div>

        {tooLarge && (
          <div class="alert alert--warn">
            输入超过 500 KB，解析可能需要一点时间。如果浏览器卡住，请换一段更小的内容再试。
          </div>
        )}

        <textarea
          id="json-input"
          class="textarea"
          spellcheck={false}
          placeholder='把 JSON 粘贴到这里，例如 {"a":1,"b":[2,3]}'
          value={input}
          onInput={(event) => setInput((event.target as HTMLTextAreaElement).value)}
        />

        <div class="row">
          <button type="button" class="btn btn--primary" onClick={() => run(indent)}>
            格式化
          </button>
          <button type="button" class="btn" onClick={() => run(0)}>
            压缩
          </button>
          <button type="button" class="btn" onClick={escapeString} disabled={!input}>
            转义
          </button>
          <button type="button" class="btn" onClick={unescapeString} disabled={!input}>
            去转义
          </button>
          <button type="button" class="btn btn--ghost" onClick={loadSample}>
            示例
          </button>
          <button type="button" class="btn btn--ghost" onClick={clear}>
            清空
          </button>
        </div>

        <div class="row">
          <div class="segmented" role="group" aria-label="格式化缩进">
            <button
              type="button"
              aria-pressed={indent === 2}
              onClick={() => setIndent(2)}
            >
              2 空格
            </button>
            <button
              type="button"
              aria-pressed={indent === 4}
              onClick={() => setIndent(4)}
            >
              4 空格
            </button>
          </div>
          <label class="chip">
            <input
              type="checkbox"
              checked={sortKeys}
              onChange={() => setSortKeys((previous) => !previous)}
            />
            <span class="chip__box" aria-hidden="true"></span>
            键排序 a→z
          </label>
        </div>

        <p class="hint">
          键排序会递归重排所有对象的键（数组顺序不变）；「转义」把文本变成 JSON
          字符串字面量，「去转义」是它的逆操作。
        </p>
      </div>

      <div class="stack">
        <div class="label">
          <span>输出</span>
          <CopyButton value={output} disabled={!output} />
        </div>

        {error ? (
          <div class="alert">{error}</div>
        ) : (
          <pre class="code code--tall">{output || '// 输出会出现在这里'}</pre>
        )}

        {output && (
          <p class="hint">
            {output.length} 字符 · {output.split('\n').length} 行
          </p>
        )}
      </div>
    </div>
  );
}
