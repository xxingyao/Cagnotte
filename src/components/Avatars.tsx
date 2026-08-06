import { members, type Member } from '@/lib/sample-data';

function byId(id: string): Member | undefined {
  return members.find((m) => m.id === id);
}

/** Overlapping initials, capped so a big group doesn't overflow the row. */
export function Avatars({ ids, max = 4 }: { ids: string[]; max?: number }) {
  const shown = ids.slice(0, max);
  const rest = ids.length - shown.length;

  return (
    <div className="avatars">
      {shown.map((id) => {
        const member = byId(id);
        return (
          <span
            key={id}
            className="avatar"
            style={{ background: member?.colour ?? 'var(--border-strong)' }}
            title={member?.name}
          >
            {member?.initials ?? '??'}
          </span>
        );
      })}
      {rest > 0 && <span className="avatar avatar-rest">+{rest}</span>}
    </div>
  );
}
