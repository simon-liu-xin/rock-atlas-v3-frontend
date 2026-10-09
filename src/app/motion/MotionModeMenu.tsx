import { Check, Waves } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import type { TranslationKey } from "../../i18n/locales/en.ts";
import { useDismissableLayer } from "../shared/useDismissableLayer.ts";
import type { MotionMode } from "./motion-mode.ts";
import { useMotionMode } from "./MotionModeProvider.tsx";

const options: Array<{ detailKey: TranslationKey; labelKey: TranslationKey; mode: MotionMode }> = [
  { mode: "full", labelKey: "motion.full", detailKey: "motion.fullDetail" },
  { mode: "reduced", labelKey: "motion.reduced", detailKey: "motion.reducedDetail" },
  { mode: "system", labelKey: "motion.system", detailKey: "motion.systemDetail" },
];

export function MotionModeMenu() {
  const { t } = useTranslation();
  const { mode, setMode } = useMotionMode();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentOption = options.find((option) => option.mode === mode)!;

  useDismissableLayer(open, (reason) => closeMenu(reason === "escape"), rootRef);

  useEffect(() => {
    if (open) optionRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, open]);

  function openMenu() {
    setFocusedIndex(options.findIndex((option) => option.mode === mode));
    setOpen(true);
  }

  function closeMenu(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }

    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) return;

    event.preventDefault();
    const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const current = optionRefs.current.findIndex((button) => button === document.activeElement);
    const next = ((current >= 0 ? current : focusedIndex) + delta + options.length) % options.length;
    setFocusedIndex(next);
    setMode(options[next]!.mode);
  }

  return (
    <div className="motion-mode-menu" ref={rootRef}>
      <button
        aria-controls="motion-mode-popover"
        aria-expanded={open}
        aria-label={t("motion.label")}
        className="motion-mode-trigger"
        data-motion-mode={mode}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        ref={triggerRef}
        title={t("motion.label")}
        type="button"
      >
        <Waves aria-hidden="true" size={16} />
        <span>{t(currentOption.labelKey)}</span>
      </button>
      <div
        aria-label={t("motion.label")}
        className="motion-mode-popover"
        hidden={!open}
        id="motion-mode-popover"
        onKeyDown={handleMenuKeyDown}
        role="radiogroup"
      >
        {options.map((option, index) => (
          <button
            aria-checked={mode === option.mode}
            key={option.mode}
            onClick={() => {
              setMode(option.mode);
              closeMenu();
            }}
            onFocus={() => setFocusedIndex(index)}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            role="radio"
            tabIndex={focusedIndex === index ? 0 : -1}
            type="button"
          >
            <span>
              <strong>{t(option.labelKey)}</strong>
              <small>{t(option.detailKey)}</small>
            </span>
            {mode === option.mode ? <Check aria-hidden="true" size={14} /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
