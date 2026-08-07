const COLOURS = ['#0e6b63', '#8a5a2b', '#3f5b8f', '#7a3f6d', '#436b2f', '#8f3f3f'];

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '??';
}

/** Stable colour per name, so the same person keeps the same badge. */
function colourFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLOURS[hash % COLOURS.length];
}

export function Avatars({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;

  return (
    <div className="avatars">
      {shown.map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="avatar"
          style={{ background: colourFor(name) }}
          title={name}
        >
          {initials(name)}
        </span>
      ))}
      {rest > 0 && <span className="avatar avatar-rest">+{rest}</span>}
    </div>
  );
}