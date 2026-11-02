"use client";

import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePresentationMotion } from '@/lib/use-presentation-motion';

export interface SearchOption { value: string; label: string; description?: string; }
interface Props {
  id: string; label: string; value: string; options: SearchOption[]; onChange: (value: string) => void;
  placeholder?: string; emptyMessage?: string; disabled?: boolean; allowCustom?: boolean; help?: string; maxLength?: number;
}

/** Manual-selection combobox: typing never silently chooses a different wallet. */
export function SearchSelect({ id, label, value, options, onChange, placeholder = 'Search or choose…', emptyMessage = 'No matching options.', disabled = false, allowCustom = false, help, maxLength }: Props) {
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState<string | null>(null), [active, setActive] = useState(-1);
  const [above, setAbove] = useState(false);
  const motionEnabled = usePresentationMotion();
  const selected = options.find(option => option.value === value);
  const matches = options.filter(option => (option.label+' '+(option.description || '')+' '+option.value).toLowerCase().includes((query || '').toLowerCase().trim()));
  const expanded = open && !disabled;
  const close = () => { setOpen(false); setQuery(null); setActive(-1); };
  const choose = (option: SearchOption) => { onChange(option.value); close(); input.current?.focus({ preventScroll: true }); };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setQuery(null); setActive(-1); }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (expanded && active >= 0) document.getElementById(id+'-option-'+active)?.scrollIntoView({ block: 'nearest' });
  }, [active, expanded, id]);
  useEffect(() => {
    if (!expanded) return;
    const position = () => {
      const box = root.current?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
      if (box) setAbove(bottom - box.bottom < 245 && box.top > 285);
    };
    position();
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    return () => { window.removeEventListener('resize', position); window.visualViewport?.removeEventListener('resize', position); };
  }, [expanded]);

  return <div className="search-select" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <label className="field-label" htmlFor={id}>{label}</label>
    <div className="search-select-control" data-open={expanded}>
      <Search size={16} className="search-select-leading" aria-hidden="true"/>
      <input id={id} ref={input} className="field" role="combobox" autoComplete="off" spellCheck={false} disabled={disabled}
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? id+'-list' : undefined} aria-activedescendant={expanded && active >= 0 && active < matches.length ? id+'-option-'+active : undefined}
        aria-describedby={help ? id+'-help' : undefined} maxLength={maxLength}
        placeholder={placeholder} value={query ?? selected?.label ?? value}
        onFocus={event => { setOpen(true); setActive(-1); event.currentTarget.select(); }}
        onChange={event => { const text = event.target.value; setQuery(text); setOpen(true); setActive(-1); onChange(allowCustom ? text : ''); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { if (expanded) event.preventDefault(); close(); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            if (!matches.length) return;
            setActive(index => event.key === 'ArrowDown' ? Math.min(index + 1, matches.length - 1) : index < 0 ? matches.length - 1 : Math.max(0, index - 1));
          }
          if (event.key === 'Enter' && expanded && active >= 0 && matches[active]) { event.preventDefault(); choose(matches[active]); }
          if (event.key === 'Tab') close();
        }}/>
      <button type="button" className="search-select-toggle" tabIndex={-1} aria-label={'Show options for '+label} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => { input.current?.focus(); setOpen(!expanded); setQuery(null); setActive(-1); }}><ChevronDown size={16} aria-hidden="true"/></button>
    </div>
    {help && <p id={id+'-help'} className="field-help">{help}</p>}
    <AnimatePresence initial={false}>{expanded && <motion.div className="search-select-popup" data-side={above ? 'above' : 'below'} key="options" initial={motionEnabled ? { opacity: 0, y: -5 } : false} animate={{ opacity: 1, y: 0 }} exit={motionEnabled ? { opacity: 0, y: -3 } : undefined} transition={{ duration: .15 }}>
      <ul id={id+'-list'} role="listbox" aria-label={label}>
        {matches.map((option, index) => <li id={id+'-option-'+index} role="option" aria-selected={option.value === value} data-active={active === index} key={option.value}
          onPointerDown={event => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => choose(option)}>
          <span className="select-option-copy"><strong>{option.label}</strong>{option.description && <span>{option.description}</span>}</span>{option.value === value && <Check size={16} aria-hidden="true"/>}
        </li>)}
      </ul>
      {!matches.length && <p className="search-select-empty">{emptyMessage}</p>}
      {!!matches.length && <p className="search-select-hint">↑ ↓ to browse · Enter to select</p>}
    </motion.div>}</AnimatePresence>
  </div>;
}
