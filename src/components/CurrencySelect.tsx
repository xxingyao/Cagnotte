'use client';

import { useEffect, useMemo, useState } from 'react';
import { WORLD_CURRENCIES, currencyName } from '@/lib/currencies';
import {
  FALLBACK_CURRENCY,
  addCurrency,
  getCurrencies,
  onPrefsChange,
  removeCurrency,
} from '@/lib/prefs';

interface Props {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}

const ADD = '__add__';

export function CurrencySelect({ value, onChange, className = 'select' }: Props) {
  // Start from a single known code so the server render and the first client
  // render agree; the saved list lands right after mount.
  const [codes, setCodes] = useState<string[]>([FALLBACK_CURRENCY]);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setCodes(getCurrencies());
    sync();
    return onPrefsChange(sync);
  }, []);

  // An existing group may sit on a currency since removed from the shortlist —
  // keep it selectable so opening the form doesn't silently change it.
  const options = codes.includes(value) ? codes : [value, ...codes];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WORLD_CURRENCIES;
    return WORLD_CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [query]);

  function pickCurrency(code: string) {
    addCurrency(code);
    onChange(code);
    setPicking(false);
    setQuery('');
    setNotice(null);
  }

  function dropCurrency(code: string) {
    if (!removeCurrency(code)) {
      setNotice(`${code} is your default currency — change it in Settings first.`);
      return;
    }
    setNotice(null);
  }

  return (
    <>
      <select
        className={className}
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD) { setPicking(true); return; }
          onChange(e.target.value);
        }}
      >
        {options.map((code) => (
          <option key={code} value={code}>
            {code} — {currencyName(code)}
          </option>
        ))}
        <option value={ADD}>＋ Add a currency…</option>
      </select>

      {picking && (
        <div className="modal-backdrop" onClick={() => setPicking(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Add a currency</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setPicking(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by code or name — MYR, ringgit, peso…"
              autoFocus
            />

            {notice && (
              <p className="split-hint" style={{ color: 'var(--negative)', marginTop: 8 }}>
                {notice}
              </p>
            )}

            <ul className="currency-list">
              {results.length === 0 && (
                <li className="currency-empty">No currency matches “{query}”.</li>
              )}
              {results.map((c) => {
                const added = codes.includes(c.code);
                return (
                  <li key={c.code} className={`currency-row${added ? ' is-added' : ''}`}>
                    <button
                      type="button"
                      className="currency-pick"
                      onClick={() => pickCurrency(c.code)}
                    >
                      <span className="currency-code">{c.code}</span>
                      <span className="currency-name">{c.name}</span>
                    </button>
                    {added && (
                      <button
                        type="button"
                        className="currency-remove"
                        onClick={() => dropCurrency(c.code)}
                        title={`Remove ${c.code} from your list`}
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="split-hint" style={{ marginTop: 12, marginBottom: 0 }}>
              Added currencies stay in your list. Manage them in Settings.
            </p>
          </div>
        </div>
      )}
    </>
  );
}