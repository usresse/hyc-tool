import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { marked } from 'marked';

const STORAGE_KEY = 'ziliudi.notes.v1';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

type Status = 'saved' | 'saving' | 'error';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function welcomeNote(): Note {
  const now = Date.now();
  return {
    id: newId(),
    title: '欢迎来到自留地',
    content: `## 这块地只有你自己看得到

- 笔记存在浏览器的 \`localStorage\` 里，换设备或清缓存就没了
- 列表按更新时间倒序，没有分类和标签
- 支持 Markdown 预览，点右上角切换

\`\`\`bash
npm run dev
\`\`\`

> 随手记命令、片段、踩坑点。写完就走。
`,
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeNotes(input: unknown): Note[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now();
      return {
        id: typeof item.id === 'string' ? item.id : newId(),
        title: typeof item.title === 'string' ? item.title : '',
        content: typeof item.content === 'string' ? item.content : '',
        createdAt,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : createdAt,
      };
    });
}

const TIME_FORMAT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function formatTime(ms: number): string {
  return TIME_FORMAT.format(new Date(ms));
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return formatTime(ms);
}

export default function NoteEditor() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [status, setStatus] = useState<Status>('saved');
  const [storageError, setStorageError] = useState('');
  const [ready, setReady] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let loaded: Note[] = [];
    let issue = '';

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        loaded = [welcomeNote()];
      } else {
        loaded = sanitizeNotes(JSON.parse(raw));
      }
    } catch {
      issue = '读取本地数据失败，浏览器可能禁用了 localStorage。';
    }

    setNotes(loaded);
    setActiveId(loaded[0]?.id ?? null);
    setReady(true);
    if (issue) {
      setStatus('error');
      setStorageError(issue);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;

    setStatus('saving');
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
        setStatus('saved');
        setStorageError('');
      } catch {
        setStatus('error');
        setStorageError('写入失败：浏览器可能禁用了存储，或空间已经满了。');
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [notes, ready]);

  const active = notes.find((note) => note.id === activeId) ?? null;

  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
    [notes],
  );

  const previewHtml = useMemo(() => {
    if (!active) return '';
    return marked.parse(active.content, {
      async: false,
      gfm: true,
      breaks: true,
    }) as string;
  }, [active?.content]);

  const createNote = () => {
    const now = Date.now();
    const note: Note = {
      id: newId(),
      title: '',
      content: '',
      createdAt: now,
      updatedAt: now,
    };
    setNotes((previous) => [note, ...previous]);
    setActiveId(note.id);
    setMode('edit');
    window.requestAnimationFrame(() => titleRef.current?.focus());
  };

  const updateNote = (patch: Partial<Pick<Note, 'title' | 'content'>>) => {
    if (!active) return;
    setNotes((previous) =>
      previous.map((note) =>
        note.id === active.id ? { ...note, ...patch, updatedAt: Date.now() } : note,
      ),
    );
  };

  const removeNote = () => {
    if (!active) return;
    const label = active.title.trim() || '这条笔记';
    if (!window.confirm(`删除「${label}」？删掉就找不回来了。`)) return;

    const remaining = notes.filter((note) => note.id !== active.id);
    setNotes(remaining);
    setActiveId(remaining[0]?.id ?? null);
  };

  const statusText = storageError
    ? storageError
    : status === 'saving'
      ? '保存中…'
      : status === 'error'
        ? '保存失败'
        : '已保存';

  return (
    <div class="stack">
      {storageError && <div class="alert">{storageError}</div>}

      <div class="notes-app">
        <aside class="notes-side" aria-label="笔记列表">
          <div class="notes-side__head">
            <span class="notes-side__title">Notes · {notes.length}</span>
            <button type="button" class="btn btn--primary btn--sm" onClick={createNote}>
              新建
            </button>
          </div>

          <div class="notes-list">
            {sorted.length === 0 ? (
              <p class="notes-empty">
                还没有笔记。
                <br />
                点「新建」写第一条。
              </p>
            ) : (
              sorted.map((note) => (
                <button
                  type="button"
                  class="note-item"
                  data-active={note.id === activeId}
                  onClick={() => {
                    setActiveId(note.id);
                    setMode('edit');
                  }}
                >
                  <span class="note-item__title">{note.title.trim() || '未命名笔记'}</span>
                  <span class="note-item__meta">
                    {timeAgo(note.updatedAt)} · {note.content.length} 字
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section class="notes-main" aria-label="笔记编辑区">
          {active ? (
            <>
              <div class="notes-main__head">
                <input
                  ref={titleRef}
                  class="notes-title-input"
                  type="text"
                  placeholder="未命名笔记"
                  value={active.title}
                  onInput={(event) =>
                    updateNote({ title: (event.target as HTMLInputElement).value })
                  }
                />

                <div class="row">
                  <span class="notes-status" data-dirty={status !== 'saved'}>
                    {statusText}
                  </span>
                  <div class="segmented" role="group" aria-label="编辑模式">
                    <button
                      type="button"
                      aria-pressed={mode === 'edit'}
                      onClick={() => setMode('edit')}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      aria-pressed={mode === 'preview'}
                      onClick={() => setMode('preview')}
                    >
                      预览
                    </button>
                  </div>
                  <button type="button" class="btn btn--ghost btn--sm" onClick={removeNote}>
                    删除
                  </button>
                </div>
              </div>

              <div class="notes-main__meta">
                创建 {formatTime(active.createdAt)} · 更新 {formatTime(active.updatedAt)} ·{' '}
                {active.content.length} 字符
              </div>

              <div class="notes-main__body">
                {mode === 'edit' ? (
                  <textarea
                    class="notes-textarea"
                    spellcheck={false}
                    placeholder="随手写点什么：代码片段、命令、踩坑点……"
                    value={active.content}
                    onInput={(event) =>
                      updateNote({ content: (event.target as HTMLTextAreaElement).value })
                    }
                  />
                ) : (
                  <div
                    class="notes-preview"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                )}
              </div>
            </>
          ) : (
            <div class="notes-empty-main">
              <div>
                <strong>还没有选中笔记</strong>
                <p>新建一条，随手记点东西。</p>
                <button type="button" class="btn btn--primary" onClick={createNote}>
                  新建笔记
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <p class="hint">
        数据只存在这台浏览器的 localStorage（键名 <code>{STORAGE_KEY}</code>），不会上传；
        清缓存或换设备就没了，重要的东西记得另存一份。
      </p>
    </div>
  );
}
