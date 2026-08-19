'use client';

import { Fragment, useEffect, useState } from 'react';
import * as api from '@/lib/api';

interface Asset {
  id: string;
  name: string;
  category: string;
  icon: string;
  value: number;
  notes: string;
  lastUpdated: string;
}

const ASSET_CATEGORIES = [
  { value: 'property', label: 'Real Estate', icon: '🏡' },
  { value: 'vehicle', label: 'Vehicle', icon: '🚗' },
  { value: 'savings', label: 'Savings Account', icon: '🏦' },
  { value: 'insurance', label: 'Insurance / Endowment', icon: '🛡️' },
  { value: 'valuables', label: 'Valuables', icon: '💎' },
  { value: 'other', label: 'Other', icon: '📦' },
];

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fromWire(w: api.ApiAsset): Asset {
  return {
    id: w.assetId,
    name: w.name,
    category: w.category,
    icon: w.icon,
    value: w.value,
    notes: w.notes,
    lastUpdated: w.lastUpdated,
  };
}

export default function AssetsPage() {
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('property');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    api.listAssets()
      .then((list) => setItems(list.map(fromWire)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const totalValue = items.reduce((sum, a) => sum + a.value, 0);

  const grouped = ASSET_CATEGORIES.map((cat) => ({
    ...cat,
    assets: items.filter((a) => a.category === cat.value),
    subtotal: items.filter((a) => a.category === cat.value).reduce((s, a) => s + a.value, 0),
  })).filter((g) => g.assets.length > 0);

  function openAdd() {
    setEditId(null);
    setName('');
    setCategory('property');
    setValue('');
    setNotes('');
    setShowModal(true);
  }

  function openEdit(item: Asset) {
    setEditId(item.id);
    setName(item.name);
    setCategory(item.category);
    setValue(String(item.value));
    setNotes(item.notes);
    setShowModal(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const icon = ASSET_CATEGORIES.find((c) => c.value === category)?.icon ?? '📦';
    const input = {
      name: name.trim() || 'Untitled',
      category,
      icon,
      value: parseFloat(value) || 0,
      notes: notes.trim(),
    };
    try {
      if (editId) {
        await api.editAsset(editId, input);
        setItems((prev) =>
          prev.map((a) =>
            a.id === editId
              ? { id: editId, ...input, lastUpdated: new Date().toISOString().slice(0, 10) }
              : a,
          ),
        );
      } else {
        const created = await api.addAsset(input);
        setItems((prev) => [...prev, fromWire(created)]);
      }
      setShowModal(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api.deleteAsset(id);
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) return <p className="sub">Loading…</p>;

  return (
    <main>
      <div className="tracking-header">
        <h1 className="page-title">Assets</h1>
        <p className="page-sub">Track property, vehicles, savings, and other valuables.</p>
      </div>

      {error && (
        <p className="split-hint" style={{ color: 'var(--negative)', marginBottom: 16 }}>{error}</p>
      )}

      <div className="tracking-summary">
        <div className="summary-card">
          <p className="summary-card-label">Total asset value</p>
          <p className="summary-card-value">${fmt(totalValue)}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card-label">Categories</p>
          <p className="summary-card-value">{grouped.length}</p>
        </div>
        <div className="summary-card">
          <p className="summary-card-label">Total items</p>
          <p className="summary-card-value">{items.length}</p>
        </div>
      </div>

      <div className="tracking-table-wrap">
        <div className="tracking-table-head">
          <h2 className="tracking-table-title">Your assets</h2>
          <button type="button" className="tracking-add-btn" onClick={openAdd}>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Add asset
          </button>
        </div>

        {items.length === 0 ? (
          <div className="tracking-empty">
            <div className="tracking-empty-icon">🏦</div>
            <p>No assets tracked yet.</p>
            <p className="sub">Add property, vehicles, savings accounts, or other valuables.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tracking-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="hide-mobile">Notes</th>
                  <th className="hide-mobile">Last updated</th>
                  <th>Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((group) => (
                  <Fragment key={`cat-${group.value}`}>
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          background: 'var(--surface-sunken)',
                          fontWeight: 620,
                          fontSize: 12,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color: 'var(--ink-muted)',
                          padding: '8px 20px',
                        }}
                      >
                        {group.icon} {group.label}
                        <span style={{ float: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          ${fmt(group.subtotal)}
                        </span>
                      </td>
                    </tr>
                    {group.assets.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="tracking-name-cell">
                            <div className="tracking-icon">{item.icon}</div>
                            <div>
                              <div className="tracking-name">{item.name}</div>
                              <div className="tracking-type">
                                {ASSET_CATEGORIES.find((c) => c.value === item.category)?.label}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="hide-mobile" style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                          {item.notes || '—'}
                        </td>
                        <td className="hide-mobile" style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
                          {item.lastUpdated}
                        </td>
                        <td><strong>${fmt(item.value)}</strong></td>
                        <td>
                          <div className="tracking-actions">
                            <button type="button" className="icon-btn icon-btn-sm" onClick={() => openEdit(item)} title="Edit">
                              <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                                <path d="M13.5 3.5l3 3L6 17H3v-3L13.5 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <button type="button" className="icon-btn icon-btn-sm is-danger" onClick={() => remove(item.id)} title="Delete">
                              <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                                <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editId ? 'Edit asset' : 'Add asset'}</h2>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => setShowModal(false)} aria-label="Close">
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <label className="field">
              <span className="field-label">Asset name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDB flat / Toyota Corolla" />
            </label>
            <label className="field">
              <span className="field-label">Category</span>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Estimated value ($)</span>
              <input className="input" type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" />
            </label>
            <label className="field">
              <span className="field-label">Notes (optional)</span>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Bought Jan 2024" />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="button" className="btn" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Save changes' : 'Add asset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}