import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { SearchableSelectOption } from "./SearchableSelect";

interface MultiSearchableSelectProps {
  label?: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  name?: string;
  id?: string;
}

// Combining diacritical marks (U+0300-U+036F), built from char codes to dodge editor unicode normalization.
const DIACRITICS_PATTERN = new RegExp(String.fromCharCode(0x5b, 0x5c, 0x75, 0x30, 0x33, 0x30, 0x30, 0x2d, 0x5c, 0x75, 0x30, 0x33, 0x36, 0x66, 0x5d), "g");

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .toLowerCase();
}

export function MultiSearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  error,
  name,
  id,
}: MultiSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOptions = useMemo(
    () => value.map((v) => options.find((o) => o.value === v)).filter((o): o is SearchableSelectOption => Boolean(o)),
    [value, options]
  );

  const available = useMemo(() => options.filter((o) => !value.includes(o.value)), [options, value]);

  const filtered = useMemo(() => {
    if (!query) return available;
    const normalizedQuery = normalize(query);
    return available.filter((option) => normalize(option.label).includes(normalizedQuery));
  }, [available, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectOption(option: SearchableSelectOption) {
    onChange([...value, option.value]);
    setQuery("");
    inputRef.current?.focus();
  }

  function removeValue(v: string) {
    onChange(value.filter((id) => id !== v));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlightedIndex];
      if (option) selectOption(option);
    } else if (e.key === "Backspace" && query === "" && selectedOptions.length > 0) {
      removeValue(selectedOptions[selectedOptions.length - 1].value);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div
        className={`flex w-full flex-wrap items-center gap-1 rounded border bg-white px-2 py-1.5 ${
          error ? "border-red-400 focus-within:border-red-500" : "border-slate-300 focus-within:border-slate-500"
        } ${disabled ? "bg-slate-50" : ""}`}
        onClick={() => {
          if (disabled) return;
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      >
        {selectedOptions.map((option) => (
          <span
            key={option.value}
            className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
          >
            {option.label}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeValue(option.value);
                }}
                className="text-slate-400 hover:text-slate-600"
                aria-label={`Remover ${option.label}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          placeholder={selectedOptions.length === 0 ? placeholder : ""}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="min-w-[8rem] flex-1 border-none px-1 py-0.5 text-sm outline-none"
        />
      </div>
      {isOpen && !disabled && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border border-slate-200 bg-white text-sm shadow-lg"
        >
          {filtered.length === 0 && <li className="px-3 py-2 text-slate-500">Nenhum resultado encontrado</li>}
          {filtered.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(option);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`cursor-pointer px-3 py-2 text-slate-700 ${index === highlightedIndex ? "bg-slate-100" : ""}`}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
