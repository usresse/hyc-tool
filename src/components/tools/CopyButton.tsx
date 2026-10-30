import { useEffect, useRef, useState } from 'preact/hooks';
import { copyText } from '../../lib/clipboard';

interface Props {
  value: string;
  label?: string;
  class?: string;
  disabled?: boolean;
}

export default function CopyButton({
  value,
  label = '复制',
  class: className = 'btn btn--ghost btn--sm',
  disabled = false,
}: Props) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, []);

  const handleClick = async () => {
    const ok = await copyText(value);
    if (!ok) return;
    setDone(true);
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDone(false), 1400);
  };

  return (
    <button
      type="button"
      class={`${className}${done ? ' is-done' : ''}`}
      onClick={handleClick}
      disabled={disabled}
    >
      {done ? '已复制' : label}
    </button>
  );
}
