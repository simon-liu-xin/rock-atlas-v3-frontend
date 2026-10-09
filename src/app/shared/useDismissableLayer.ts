import { useEffect, useRef, type RefObject } from "react";

export type DismissReason = "escape" | "outside";

export function useDismissableLayer(
  open: boolean,
  onDismiss: (reason: DismissReason) => void,
  ...containers: Array<RefObject<HTMLElement | null>>
) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && containers.some((container) => container.current?.contains(target))) return;
      onDismissRef.current("outside");
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onDismissRef.current("escape");
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, ...containers]);
}
