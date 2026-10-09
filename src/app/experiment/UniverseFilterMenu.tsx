import { Check, ChevronDown } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { useDismissableLayer } from "../shared/useDismissableLayer.ts";

export interface UniverseFilterOption {
  label: string;
  value: string;
}

interface UniverseFilterMenuProps {
  disabled?: boolean;
  id: string;
  label: string;
  options: readonly UniverseFilterOption[];
  value: string;
  onChange: (value: string) => void;
}

export function UniverseFilterMenu({
  disabled = false,
  id,
  label,
  options,
  value,
  onChange,
}: UniverseFilterMenuProps) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useDismissableLayer(open, (reason) => closeMenu(reason === "escape"), rootRef);

  useEffect(() => {
    if (open) optionRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, open]);

  function openMenu(index = selectedIndex) {
    setFocusedIndex(index);
    setOpen(true);
  }

  function closeMenu(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function moveFocus(index: number) {
    setFocusedIndex((index + options.length) % options.length);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openMenu(
      event.key === "ArrowDown"
        ? selectedIndex
        : (selectedIndex - 1 + options.length) % options.length,
    );
  }

  function handleListboxKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveFocus(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    moveFocus(focusedIndex + (event.key === "ArrowDown" ? 1 : -1));
  }

  const selected = options[selectedIndex] ?? options[0];

  return (
    <div className="universe-filter-menu" ref={rootRef}>
      <button
        aria-controls={id}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className="universe-filter-menu-trigger"
        disabled={disabled}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span>{selected?.label ?? ""}</span>
        <ChevronDown aria-hidden="true" size={12} />
      </button>
      <div
        aria-label={label}
        className="universe-filter-menu-popover"
        hidden={!open}
        id={id}
        onKeyDown={handleListboxKeyDown}
        role="listbox"
      >
        {options.map((option, index) => (
          <button
            aria-selected={option.value === value}
            data-value={option.value}
            key={option.value || "all"}
            onClick={() => {
              onChange(option.value);
              closeMenu(true);
            }}
            onFocus={() => setFocusedIndex(index)}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            role="option"
            tabIndex={focusedIndex === index ? 0 : -1}
            type="button"
          >
            <span>{option.label}</span>
            {option.value === value ? <Check aria-hidden="true" size={10} /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
