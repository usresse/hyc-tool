import { useMemo, useState } from 'preact/hooks';
import { parse as parseYaml } from 'yaml';
import CopyButton from './CopyButton';

type Format = 'yaml' | 'properties';

const SAMPLE_YAML = `server:
  port: 8080
  servlet:
    context-path: /api
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/demo
    username: root
    hikari:
      maximum-pool-size: 10
  profiles:
    active: dev`;

const SAMPLE_PROPERTIES = `server.port=8080
server.servlet.context-path=/api
spring.datasource.url=jdbc:mysql://localhost:3306/demo
spring.datasource.username=root
spring.datasource.hikari.maximum-pool-size=10
# 井号开头是注释
spring.profiles.active=dev`;

function setNested(target: Record<string, unknown>, key: string, value: string) {
  const parts = key.split('.').filter(Boolean);
  if (parts.length === 0) return;

  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const next = cursor[part];
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      cursor = next as Record<string, unknown>;
    } else {
      const created: Record<string, unknown> = {};
      cursor[part] = created;
      cursor = created;
    }
  }

  cursor[parts[parts.length - 1]] = value;
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/** .properties → 嵌套对象：点号分段，值保持字符串（与 Java 读取结果一致） */
function parseProperties(source: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let pending = '';

  const handle = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) return;

    const index = trimmed.search(/[:=]/);
    if (index <= 0) return;

    const key = trimmed.slice(0, index).trim();
    const value = stripQuotes(trimmed.slice(index + 1).trim())
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');

    setNested(result, key, value);
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = pending + raw;

    // 行尾单个反斜杠表示续行
    if (line.endsWith('\\') && !line.endsWith('\\\\')) {
      pending = line.slice(0, -1);
      continue;
    }

    pending = '';
    handle(line);
  }

  if (pending.trim()) handle(pending);
  return result;
}

interface Conversion {
  json: string;
  error: string;
}

function convert(format: Format, source: string): Conversion {
  if (!source.trim()) return { json: '', error: '' };

  try {
    const data = format === 'yaml' ? parseYaml(source) : parseProperties(source);

    if (format === 'properties' && Object.keys(data as Record<string, unknown>).length === 0) {
      return { json: '', error: '没解析出任何键值对：每行需要写成 key=value 或 key: value。' };
    }

    return { json: JSON.stringify(data ?? null, null, 2), error: '' };
  } catch (err) {
    return {
      json: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default function ConfigTool() {
  const [format, setFormat] = useState<Format>('yaml');
  const [yamlInput, setYamlInput] = useState(SAMPLE_YAML);
  const [propertiesInput, setPropertiesInput] = useState(SAMPLE_PROPERTIES);

  const source = format === 'yaml' ? yamlInput : propertiesInput;
  const setSource = format === 'yaml' ? setYamlInput : setPropertiesInput;
  const result = useMemo(() => convert(format, source), [format, source]);

  return (
    <div class="tool-stage">
      <div class="tool-panel stack">
        <div class="row row--between">
          <div class="segmented" role="group" aria-label="配置格式">
            <button
              type="button"
              aria-pressed={format === 'yaml'}
              onClick={() => setFormat('yaml')}
            >
              YAML（application.yml）
            </button>
            <button
              type="button"
              aria-pressed={format === 'properties'}
              onClick={() => setFormat('properties')}
            >
              Properties
            </button>
          </div>
          <button
            type="button"
            class="btn btn--ghost"
            onClick={() => setSource(format === 'yaml' ? SAMPLE_YAML : SAMPLE_PROPERTIES)}
          >
            用示例
          </button>
        </div>

        <div class="tool-grid">
          <div class="stack">
            <div class="label">
              <label for="config-input">原始配置</label>
              <span>{source.split('\n').length} 行</span>
            </div>
            <textarea
              id="config-input"
              class="textarea"
              spellcheck={false}
              placeholder={
                format === 'yaml' ? '粘贴 application.yml 内容' : '粘贴 application.properties 内容'
              }
              value={source}
              onInput={(event) => setSource((event.target as HTMLTextAreaElement).value)}
            />
          </div>

          <div class="stack">
            <div class="label">
              <span>JSON</span>
              <CopyButton value={result.json} disabled={!result.json} />
            </div>
            {result.error ? (
              <div class="alert">❌ {result.error}</div>
            ) : (
              <pre class="code code--tall">{result.json || '// 粘贴配置后这里会实时转成 JSON'}</pre>
            )}
          </div>
        </div>

        <p class="hint">
          YAML 支持锚点、多文档等完整语法；Properties 会按点号拆成嵌套对象，值保持字符串
          （Spring 里本来也是字符串再转换类型）。注释行 <code>#</code> / <code>!</code> 会被忽略。
        </p>
      </div>
    </div>
  );
}
