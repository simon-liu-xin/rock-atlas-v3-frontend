import { formatAnimatedCount } from "./ui-motion.ts";

export function AnimatedNumber({
  minimumDigits = 1,
  value,
}: {
  minimumDigits?: number;
  value: number;
}) {
  const formatted = formatAnimatedCount(value, minimumDigits);
  return (
    <span className="universe-animated-number" data-animated-value={formatted}>
      <span aria-hidden="true" className="universe-animated-number-value" key={formatted}>
        {formatted}
      </span>
      <span className="sr-only">{formatted}</span>
    </span>
  );
}
