import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import CopyButton from './CopyButton';

const FLAGS = ['g', 'i', 'm', 's', 'u'] as const;
type Flag = (typeof FLAGS)[number];

const SAMPLE_PATTERN = '[A-Z]-\\d+';
const SAMPLE_TEXT = `订单 A-1024 已发出，B-2048 还在路上。
邮箱 dev@example.com
备注：A-3000 需要复核，a-9 不算。`;

/** 常用模式库：点击即填入表达式（regex101 风格） */
const PRESETS = [
  { label: '邮箱', pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.]+' },
  { label: '手机号', pattern: '1[3-9]\\d{9}' },
  { label: 'URL', pattern: 'https?://[^\\s]+' },
  { label: 'IPv4', pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b' },
  { label: '日期 yyyy-mm-dd', pattern: '\\d{4}-\\d{2}-\\d{2}' },
  { label: '中文字符', pattern: '[\\u4e00-\\u9fa5]+' },
];

const CHEATSHEET = [
  {
    title: '字符类',
    rows: [
      ['\\d', '数字 0-9'],
      ['\\D', '非数字'],
      ['\\w', '字母、数字、下划线'],
      ['\\W', '非 \\w'],
      ['\\s', '空白：空格 / 换行 / 制表'],
      ['\\S', '非空白'],
      ['.', '除换行外任意字符（s 标记后含换行）'],
      ['[abc]', '括号内任一字符'],
      ['[^abc]', '不在括号内的字符'],
      ['[a-z]', '字符范围'],
    ],
  },
  {
    title: '量词',
    rows: [
      ['*', '0 次或多次'],
      ['+', '1 次或多次'],
      ['?', '0 次或 1 次'],
      ['{n}', '恰好 n 次'],
      ['{n,}', '至少 n 次'],
      ['{n,m}', 'n 到 m 次'],
      ['*?', '懒惰匹配，尽量少取'],
    ],
  },
  {
    title: '位置与断言',
    rows: [
      ['^', '开头（m 标记后是每行开头）'],
      ['$', '结尾（m 标记后是每行结尾）'],
      ['\\b', '单词边界'],
      ['\\B', '非单词边界'],
      ['(?=...)', '后面必须是'],
      ['(?!...)', '后面必须不是'],
      ['(?<=...)', '前面必须是'],
      ['(?<!...)', '前面必须不是'],
    ],
  },
  {
    title: '分组与选择',
    rows: [
      ['(...)', '捕获组，可用 $1 引用'],
      ['(?:...)', '不捕获分组'],
      ['(?<name>...)', '命名捕获组'],
      ['a|b', '二选一'],
      ['\\1', '反向引用第 1 组'],
    ],
  },
  {
    title: '常用转义',
    rows: [
      ['\\n', '换行'],
      ['\\t', '制表符'],
      ['\\.', '字面量点号'],
      ['\\\\', '反斜杠本身'],
      ['\\u4e00', 'Unicode 码点'],
    ],
  },
];

interface MatchInfo {
  start: number;
  end: number;
  text: string;
  /** 捕获组内容，$1 起；未参与匹配的组为 undefined */
  groups: (string | undefined)[];
}

interface ScanResult {
  matches: MatchInfo[];
  error: string;
}

function scan(pattern: string, text: string, flags: string): ScanResult {
  if (!pattern) return { matches: [], error: '' };

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (err) {
    return { matches: [], error: err instanceof Error ? err.message : String(err) };
  }

  const matches: MatchInfo[] = [];
  const global = flags.includes('g');

  try {
    if (!global) {
      const match = regex.exec(text);
      if (match) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0],
          groups: match.slice(1),
        });
      }
      return { matches, error: '' };
    }

    let match: RegExpExecArray | null;
    let guard = 0;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        groups: match.slice(1),
      });
      if (match[0] === '') regex.lastIndex += 1;
      if (++guard > 2000) break;
    }

    return { matches, error: '' };
  } catch (err) {
    return { matches: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export default function RegexTester() {
  const [pattern, setPattern] = useState(SAMPLE_PATTERN);
  const [text, setText] = useState(SAMPLE_TEXT);
  const [replacement, setReplacement] = useState('');
  const [flags, setFlags] = useState<Record<Flag, boolean>>({
    g: true,
    i: false,
    m: false,
    s: false,
    u: false,
  });

  const flagString = FLAGS.filter((flag) => flags[flag]).join('');
  const result = useMemo(() => scan(pattern, text, flagString), [pattern, text, flagString]);

  /** 替换预览：模板支持 $1、$&、$<name> 等 JS 原生占位符 */
  const replaced = useMemo(() => {
    if (!pattern || !replacement || result.error) return null;
    try {
      return text.replace(new RegExp(pattern, flagString), replacement);
    } catch (err) {
      return null;
    }
  }, [pattern, replacement, text, flagString, result.error]);

  const highlighted = useMemo<JSX.Element[] | null>(() => {
    if (result.matches.length === 0) return null;

    const nodes: JSX.Element[] = [];
    let cursor = 0;

    result.matches.forEach((match, index) => {
      if (match.start > cursor) {
        nodes.push(<span key={`t-${index}`}>{text.slice(cursor, match.start)}</span>);
      }
      nodes.push(<mark key={`m-${index}`}>{match.text || '​'}</mark>);
      cursor = Math.max(cursor, match.end);
    });

    if (cursor < text.length) {
      nodes.push(<span key="t-tail">{text.slice(cursor)}</span>);
    }

    return nodes;
  }, [result, text]);

  const toggleFlag = (flag: Flag) => {
    setFlags((previous) => ({ ...previous, [flag]: !previous[flag] }));
  };

  return (
    <div class="tool-stage">
      <div class="tool-panel stack">
        <div class="label">
          <label for="regex-pattern">正则表达式</label>
          <span>flags: {flagString || '（无）'}</span>
        </div>

        <div class="row" style="flex-wrap: nowrap; align-items: stretch;">
          <span class="mono muted" aria-hidden="true" style="align-self: center;">
            /
          </span>
          <input
            id="regex-pattern"
            class="input"
            spellcheck={false}
            placeholder="例如 [A-Z]-\d+"
            value={pattern}
            onInput={(event) => setPattern((event.target as HTMLInputElement).value)}
          />
          <span class="mono muted" aria-hidden="true" style="align-self: center;">
            /{flagString}
          </span>
        </div>

        <div class="row" role="group" aria-label="正则 flags">
          {FLAGS.map((flag) => (
            <label class="chip">
              <input
                type="checkbox"
                checked={flags[flag]}
                onChange={() => toggleFlag(flag)}
              />
              <span class="chip__box" aria-hidden="true"></span>
              {flag}
            </label>
          ))}
        </div>

        <div class="row">
          <span class="hint" style="margin-right: 4px;">常用：</span>
          {PRESETS.map((preset) => (
            <button
              type="button"
              class="chip"
              onClick={() => setPattern(preset.pattern)}
              title={preset.pattern}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {result.error ? (
          <div class="alert">❌ {result.error}</div>
        ) : (
          <p class="hint">
            实时匹配，语法错误会立刻提示但不会清空输入。未勾选 <code>g</code> 时只匹配第一处。
          </p>
        )}
      </div>

      <div class="tool-panel stack">
        <div class="label">
          <label for="regex-text">测试文本</label>
          <span>{text.length} 字符</span>
        </div>
        <textarea
          id="regex-text"
          class="textarea textarea--short"
          spellcheck={false}
          value={text}
          onInput={(event) => setText((event.target as HTMLTextAreaElement).value)}
        />
      </div>

      <div class="tool-panel stack">
        <div class="label">
          <span>匹配结果</span>
          <span>
            <span class="accent mono">{result.matches.length}</span> 处
          </span>
        </div>

        {!pattern ? (
          <p class="hint">写一个正则表达式，这里会实时高亮匹配内容。</p>
        ) : (
          <div class="highlight-box">
            {highlighted ?? (text ? '没有匹配项。' : '测试文本是空的。')}
          </div>
        )}

        {result.matches.length > 0 && (
          <div class="result-list">
            {result.matches.map((match, index) => (
              <div class="result-row">
                <span class="result-row__index">{String(index + 1).padStart(2, '0')}</span>
                <span class={`result-row__text${match.text ? '' : ' result-row__text--empty'}`}>
                  {match.text || '（空匹配）'}
                </span>
                {match.groups.map(
                  (group, groupIndex) =>
                    group !== undefined && (
                      <span class="muted" title={`捕获组 $${groupIndex + 1}`}>
                        ${groupIndex + 1}="{group}"
                      </span>
                    ),
                )}
                <span class="muted">index {match.start}–{match.end}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div class="tool-panel stack">
        <div class="label">
          <label for="regex-replace">替换预览</label>
          {replaced !== null && <CopyButton value={replaced} />}
        </div>

        <input
          id="regex-replace"
          class="input"
          spellcheck={false}
          placeholder='替换模板，例如「<$1>」或「$& 已处理」'
          value={replacement}
          onInput={(event) => setReplacement((event.target as HTMLInputElement).value)}
        />

        {replaced !== null ? (
          <pre class="code">{replaced}</pre>
        ) : (
          <p class="hint">
            填一个替换模板即可预览结果，支持 <code>$1</code>（捕获组）、<code>$&</code>（整个匹配）、
            <code>$&lt;name&gt;</code>（命名组）。未勾选 <code>g</code> 时只替换第一处。
          </p>
        )}
      </div>

      <div class="tool-panel stack cheatsheet-panel">
        <div class="label">
          <span>速查表</span>
          <span>忘了语法时随时看一眼</span>
        </div>
        <div class="cheatsheet">
          {CHEATSHEET.map((group) => (
            <div class="cheat-group">
              <h3>{group.title}</h3>
              {group.rows.map(([token, desc]) => (
                <div class="cheat-row">
                  <code>{token}</code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
