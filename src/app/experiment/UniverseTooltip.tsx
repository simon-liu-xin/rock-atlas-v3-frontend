import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";

interface UniverseTooltipButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  expanded?: boolean;
  icon: ReactNode;
  label: string;
}

export function UniverseTooltipButton({
  className = "",
  expanded,
  icon,
  label,
  type = "button",
  ...buttonProps
}: UniverseTooltipButtonProps) {
  const tooltipId = useId();
  return (
    <span className="universe-tooltip-wrap">
      <button
        {...buttonProps}
        aria-describedby={tooltipId}
        aria-expanded={expanded}
        aria-label={label}
        className={className}
        type={type}
      >
        <span
          aria-hidden="true"
          className="universe-icon-slot"
          data-expanded={expanded === undefined ? undefined : String(expanded)}
        >
          {icon}
        </span>
      </button>
      <span className="universe-tooltip-content" id={tooltipId} role="tooltip">
        {label}
      </span>
    </span>
  );
}
