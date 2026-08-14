'use client';

import { useState } from 'react';
import { avatarUrl } from '@/lib/avatar';

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

interface AvatarMember {
  id: string;
  name: string;
}

function Avatar({ member }: { member: AvatarMember }) {
  // Falls back to the initials badge whenever there's no photo — the
  // deterministic URL 404s if the member never uploaded one, which is the
  // normal case, not an error worth treating specially.
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="avatar" style={{ background: colourFor(member.name) }} title={member.name}>
        {initials(member.name)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external S3 URL
    // with an onError fallback next/image doesn't support cleanly.
    <img
      src={avatarUrl(member.id)}
      alt={member.name}
      title={member.name}
      className="avatar avatar-img"
      onError={() => setFailed(true)}
    />
  );
}

export function Avatars({ members, max = 4 }: { members: AvatarMember[]; max?: number }) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;

  return (
    <div className="avatars">
      {shown.map((member) => (
        <Avatar key={member.id} member={member} />
      ))}
      {rest > 0 && <span className="avatar avatar-rest">+{rest}</span>}
    </div>
  );
}