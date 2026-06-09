import { useState, useEffect, useRef } from 'react';
import { searchLocations, forwardGeocode } from '../utils/geocode';

export default function LocationSearchInput({
  onSelect,
  initialValue = '',
  placeholder = 'City, state or ZIP…',
  autoFocus = false,
  variant = 'default',
}) {
  const [query, setQuery]           = useState(initialValue);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen]         = useState(false);
  const [error, setError]           = useState('');
  const [selected, setSelected]     = useState(null);

  const inputRef    = useRef(null);
  const listRef     = useRef(null);
  const debounceRef = useRef(null);
  const abortRef    = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const handler = (e) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target) &&
        listRef.current  && !listRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setError('');
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (val.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const results = await searchLocations(val);
      if (!ctrl.signal.aborted) {
        setSuggestions(results);
        setIsOpen(results.length > 0);
        setActiveIndex(-1);
      }
    }, 300);
  };

  const select = (lat, lon, label) => {
    inputRef.current?.blur();
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setError('');
    setSelected(label);
    setTimeout(() => setSelected(null), 1500);
    onSelect(lat, lon, label);
  };

  const handleKeyDown = async (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        const s = suggestions[activeIndex];
        select(s.lat, s.lon, s.label);
      } else if (suggestions.length > 0) {
        const s = suggestions[0];
        select(s.lat, s.lon, s.label);
      } else if (query.trim()) {
        setError('');
        try {
          const { lat, lon, label } = await forwardGeocode(query.trim());
          select(lat, lon, label);
        } catch (err) {
          setError(err.message);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const inputStyle = variant === 'topbar'
    ? {
        flex: 1, minWidth: 0, width: '100%',
        fontSize: 11, fontFamily: 'var(--font-mono)',
        background: 'var(--soft)', border: '1px solid var(--accent)',
        borderRadius: 8, padding: '3px 8px',
        color: 'var(--tp)', outline: 'none',
      }
    : {
        width: '100%', padding: '10px 12px',
        background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 10, fontSize: 13, color: 'var(--tp)',
        fontFamily: 'var(--font-mono)', outline: 'none',
        boxSizing: 'border-box',
      };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {selected ? (
        <div style={{
          ...inputStyle,
          display: 'flex', alignItems: 'center', gap: 6,
          color: 'var(--accent)', borderColor: 'var(--accent)',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected}</span>
        </div>
      ) : (
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
      {error && (
        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>{error}</div>
      )}
      {isOpen && suggestions.length > 0 && (
        <ul
          ref={listRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 210, listStyle: 'none', margin: '4px 0 0', padding: '4px 0',
          }}
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              onMouseDown={() => select(s.lat, s.lon, s.label)}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                padding: '9px 12px',
                fontSize: 12, fontFamily: 'var(--font-mono)',
                color: i === activeIndex ? 'var(--accent)' : 'var(--tp)',
                background: i === activeIndex ? 'var(--soft)' : 'transparent',
                cursor: 'pointer',
                transition: 'background var(--tr-fast), color var(--tr-fast)',
              }}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
