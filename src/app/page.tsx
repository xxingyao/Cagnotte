import Link from 'next/link';
import { Avatars } from '@/components/Avatars';
import { DesignNotice } from '@/components/DesignNotice';
import { groups } from '@/lib/sample-data';

export default function DashboardPage() {
  return (
    <main>
      <DesignNotice />

      <h1 className="page-title">Your groups</h1>
      <p className="page-sub">Three shared pots, all reported in their own base currency.</p>

      <ul className="group-list">
        {groups.map((group) => (
          <li key={group.id}>
            <Link href={`/groups/${group.id}`} className="group-card">
              <div className="group-card-main">
                <div className="group-card-name">{group.name}</div>
                <div className="group-card-meta">
                  {group.memberIds.length} members ·{' '}
                  <span className={group.standingTone}>{group.standing}</span>
                </div>
              </div>
              <Avatars ids={group.memberIds} />
              <span className="chip">{group.baseCurrency}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 className="card-title">Start a group</h2>
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input" placeholder="Lisbon flat, Semester 2…" readOnly />
          </label>
          <label className="field">
            <span className="field-label">Base currency</span>
            <select className="select" disabled defaultValue="EUR">
              <option>EUR</option>
            </select>
          </label>
          <span className="btn">Create group</span>
        </div>

        <div className="card">
          <h2 className="card-title">Join a group</h2>
          <label className="field">
            <span className="field-label">Invite code</span>
            <input className="input chip-code" placeholder="7KQ4-B2XM" readOnly />
          </label>
          <p className="split-hint">
            Ask whoever set the group up — the code is on the group&apos;s page.
          </p>
          <span className="btn btn-ghost">Join with code</span>
        </div>
      </div>
    </main>
  );
}
