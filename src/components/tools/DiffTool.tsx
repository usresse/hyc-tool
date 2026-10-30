import { useMemo, useState } from 'preact/hooks';
import { diffLines, type Change } from 'diff';

const MAX_CHARS = 200_000;

const SAMPLE_LEFT = `server:
  port: 8080
  servlet:
    context-path: /api
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/demo
    username: root`;

const SAMPLE_RIGHT = `server:
  port: 9090
  servlet:
    context-path: /api
spring:
  datasource:
    url: jdbc:mysql://db.internal:3306/demo
    username: app
    password: ******`;

type LineType = 'same' | 'add' | 'del';

interface DiffLine {
  type: LineType;
  text: string;
}

function toLines(changes: Change[]): DiffLine[] {
  const lines: DiffLine[] = [];

  for (const change of changes) {
    const type: LineType = change.added ? 'add' : change.removed ? 'del' : 'same';
    const parts = change.value.split('\n');
    if (parts[parts.length - 1] === '') parts.pop();
    for (const text of parts) {
      lines.push({ type, text });
    }
  }

  return lines;
}

export default function DiffTool() {
  const [left, setLeft] = useState(SAMPLE_LEFT);
  const [right, setRight] = useState(SAMPLE_RIGHT);

  const tooLarge = left.length > MAX_CHARS || right.length > MAX_CHARS;

  const lines = useMemo<DiffLine[] | null>(() => {
    if (tooLarge) return null;
    if (!left && !right) return [];
    try {
      return toLines(diffLines(left, right));
    } catch {
      return null;
    }
  }, [left, right, tooLarge]);

  const stats = useMemo(() => {
    if (!lines) return { added: 0, removed: 0 };
    return {
      added: lines.filter((line) => line.type === 'add').length,
      removed: lines.filter((line) => line.type === 'del').length,
    };
  }, [lines]);

  return (
    <div class="tool-stage">
      <div class="tool-panel">
        <div class="tool-grid">
          <div class="stack">
            <div class="label">
              <label for="diff-left">左侧（旧）</label>
              <span>{left.split('\n').length} 行</span>
            </div>
            <textarea
              id="diff-left"
              class="textarea"
              spellcheck={false}
              placeholder="粘贴修改前的内容"
              value={left}
              onInput={(event) => setLeft((event.target as HTMLTextAreaElement).value)}
            />
          </div>

          <div class="stack">
            <div class="label">
              <label for="diff-right">右侧（新）</label>
              <span>{right.split('\n').length} 行</span>
            </div>
            <textarea
              id="diff-right"
              class="textarea"
              spellcheck={false}
              placeholder="粘贴修改后的内容"
              value={right}
              onInput={(event) => setRight((event.target as HTMLTextAreaElement).value)}
            />
          </div>
        </div>

        <div class="row" style="margin-top: 14px;">
          <button
            type="button"
            class="btn btn--ghost"
            onClick={() => {
              setLeft(right);
              setRight(left);
            }}
          >
            交换左右
          </button>
          <button
            type="button"
            class="btn btn--ghost"
            onClick={() => {
              setLeft(SAMPLE_LEFT);
              setRight(SAMPLE_RIGHT);
            }}
          >
            用示例
          </button>
          <button
            type="button"
            class="btn btn--ghost"
            onClick={() => {
              setLeft('');
              setRight('');
            }}
          >
            清空
          </button>
          <span class="hint">按行比对，实时更新；行内空白不算差异，但字符大小写算。</span>
        </div>
      </div>

      <div class="tool-panel stack">
        <div class="label">
          <span>差异</span>
          <span>
            <span class="accent mono">+{stats.added}</span> 行 ·{' '}
            <span class="accent mono">-{stats.removed}</span> 行
          </span>
        </div>

        {tooLarge ? (
          <div class="alert alert--warn">
            单侧超过 20 万字符，为避免页面卡住已暂停比对。请截取关键片段再比较。
          </div>
        ) : !lines || lines.length === 0 ? (
          <p class="hint">两边都空着的时候没有什么可比；粘贴内容后差异会立刻出现。</p>
        ) : stats.added === 0 && stats.removed === 0 ? (
          <>
            <p class="hint">两段文本完全一致。</p>
            <pre class="code diff-code">
              {lines.map((line) => (
                <span class="diff-line diff-line--same">
                  {'  '}
                  {line.text || ' '}
                  {'\n'}
                </span>
              ))}
            </pre>
          </>
        ) : (
          <pre class="code diff-code">
            {lines.map((line) => {
              const sign = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
              return (
                <span class={`diff-line diff-line--${line.type}`}>
                  {sign} {line.text || ' '}
                  {'\n'}
                </span>
              );
            })}
          </pre>
        )}
      </div>
    </div>
  );
}
