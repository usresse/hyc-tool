import { useMemo, useState } from 'preact/hooks';
import cronstrue from 'cronstrue/i18n';
import cronParser from 'cron-parser';

const { parseExpression } = cronParser;

const TZ = 'Asia/Shanghai';

const NEXT_FORMAT = new Intl.DateTimeFormat('zh-CN', {
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

/** crontab 预定义别名 → 标准 5 段（crontab.guru 同款） */
const ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const EXAMPLES = [
  { label: '每分钟', expr: '* * * * *' },
  { label: '每 5 分钟', expr: '*/5 * * * *' },
  { label: '每小时整点', expr: '0 * * * *' },
  { label: '每小时半点', expr: '30 * * * *' },
  { label: '每天 00:00', expr: '0 0 * * *' },
  { label: '工作日 09:30', expr: '30 9 * * 1-5' },
  { label: '每周一 09:00', expr: '0 9 * * 1' },
  { label: '每月 1 号', expr: '0 0 1 * *' },
  { label: '每 30 秒', expr: '*/30 * * * * *' },
];

const NEXT_COUNTS = [5, 10, 20];

const FIELD_LABELS_5 = ['分', '时', '日', '月', '周'];
const FIELD_LABELS_6 = ['秒', '分', '时', '日', '月', '周'];

interface Parsed {
  description: string;
  english: string;
  next: string[];
  error: string;
  nextError: string;
  fieldCount: number;
  /** 规范化（别名展开）后的各段原值 */
  fields: string[];
  /** 例如 "@daily → 0 0 * * *"，无别名时为空 */
  aliasNote: string;
}

function formatNext(date: Date): string {
  const parts: Record<string, string> = {};
  for (const part of NEXT_FORMAT.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.weekday ?? ''}`.trim();
}

function parse(expression: string, nextCount: number): Parsed {
  let value = expression.trim();
  const empty: Parsed = {
    description: '',
    english: '',
    next: [],
    error: '',
    nextError: '',
    fieldCount: 0,
    fields: [],
    aliasNote: '',
  };

  if (!value) return empty;

  let aliasNote = '';
  if (value.startsWith('@')) {
    const key = value.toLowerCase();
    if (key === '@reboot') {
      return { ...empty, error: '❌ @reboot 表示「重启时运行」，没有可推算的固定时间。' };
    }
    const mapped = ALIASES[key];
    if (!mapped) {
      return {
        ...empty,
        error: `❌ 不认识的别名 ${value}。支持 ${Object.keys(ALIASES).join(' / ')}。`,
      };
    }
    aliasNote = `${value} → ${mapped}`;
    value = mapped;
  }

  const fields = value.split(/\s+/);
  const fieldCount = fields.length;
  if (fieldCount !== 5 && fieldCount !== 6) {
    return {
      ...empty,
      fieldCount,
      error: `❌ 需要 5 段或 6 段，当前是 ${fieldCount} 段。6 段格式的第一段是秒。`,
    };
  }

  let description = '';
  let english = '';

  try {
    description = cronstrue.toString(value, {
      locale: 'zh_CN',
      use24HourTimeFormat: true,
      throwExceptionOnParseError: true,
    });
    english = cronstrue.toString(value, {
      locale: 'en',
      use24HourTimeFormat: true,
      throwExceptionOnParseError: true,
    });
  } catch (err) {
    return {
      ...empty,
      fieldCount,
      fields,
      aliasNote,
      error: `❌ 表达式无法解析：${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const next: string[] = [];
  let nextError = '';

  try {
    const interval = parseExpression(value, { currentDate: new Date(), tz: TZ });
    for (let i = 0; i < nextCount; i += 1) {
      next.push(formatNext(interval.next().toDate()));
    }
  } catch (err) {
    nextError = `无法推算触发时间：${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    description,
    english,
    next,
    error: '',
    nextError,
    fieldCount,
    fields,
    aliasNote,
  };
}

export default function CronParser() {
  const [expression, setExpression] = useState('*/5 * * * *');
  const [nextCount, setNextCount] = useState(5);
  const result = useMemo(() => parse(expression, nextCount), [expression, nextCount]);

  const fieldLabels = result.fieldCount === 6 ? FIELD_LABELS_6 : FIELD_LABELS_5;

  return (
    <div class="tool-stage">
      <div class="tool-panel stack">
        <div class="label">
          <label for="cron-input">Cron 表达式</label>
          <span>5 段：分 时 日 月 周 · 6 段：秒 分 时 日 月 周 · 支持 @daily 等别名</span>
        </div>

        <input
          id="cron-input"
          class="input"
          spellcheck={false}
          placeholder="*/5 * * * * 或 @daily"
          value={expression}
          onInput={(event) => setExpression((event.target as HTMLInputElement).value)}
        />

        <div class="row">
          <span class="hint" style="margin-right: 4px;">常用：</span>
          {EXAMPLES.map((example) => (
            <button
              type="button"
              class="chip"
              onClick={() => setExpression(example.expr)}
              title={example.expr}
            >
              {example.label}
            </button>
          ))}
        </div>

        <div class="row">
          <span class="hint" style="margin-right: 4px;">别名：</span>
          {['@hourly', '@daily', '@weekly', '@monthly', '@yearly'].map((alias) => (
            <button
              type="button"
              class="chip"
              onClick={() => setExpression(alias)}
              title={ALIASES[alias]}
            >
              {alias}
            </button>
          ))}
        </div>

        <p class="hint">
          解析用 <code>cronstrue</code>，触发时间用 <code>cron-parser</code> 按东八区推算。
        </p>
      </div>

      <div class="tool-panel stack">
        <div class="label">
          <span>人类可读</span>
          {result.description && <span>{result.fieldCount} 段</span>}
        </div>

        {result.error ? (
          <div class="alert">{result.error}</div>
        ) : result.description ? (
          <>
            {result.aliasNote && <p class="hint mono">{result.aliasNote}</p>}
            <p class="cron-desc">{result.description}</p>
            <p class="hint mono">{result.english}</p>
            <p class="hint mono">
              {result.fields.map((field, index) => `${fieldLabels[index]} ${field}`).join(' · ')}
            </p>
          </>
        ) : (
          <p class="hint">输入表达式后，这里会显示中文描述。</p>
        )}
      </div>

      <div class="tool-panel stack">
        <div class="label">
          <span>接下来 {nextCount} 次触发</span>
          <div class="row">
            <div class="segmented" role="group" aria-label="推算次数">
              {NEXT_COUNTS.map((value) => (
                <button
                  type="button"
                  aria-pressed={nextCount === value}
                  onClick={() => setNextCount(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <span>{TZ}</span>
          </div>
        </div>

        {result.nextError ? (
          <div class="alert alert--warn">{result.nextError}</div>
        ) : result.next.length > 0 ? (
          <div class="result-list" style="max-height: 420px;">
            {result.next.map((time, index) => (
              <div class="result-row">
                <span class="result-row__index">{String(index + 1).padStart(2, '0')}</span>
                <span class="result-row__text">{time}</span>
              </div>
            ))}
          </div>
        ) : (
          <p class="hint">表达式有效后，这里会列出接下来的触发时间。</p>
        )}
      </div>
    </div>
  );
}
