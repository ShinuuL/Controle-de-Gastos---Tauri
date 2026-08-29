import { strawberryBerryColors } from "./categoryColor";

interface CategoryMarkerProps {
  color: string;
  strawberry: boolean;
  size?: "compact" | "default";
}

export default function CategoryMarker({
  color,
  strawberry,
  size = "default",
}: CategoryMarkerProps) {
  const sizeClass = size === "compact" ? "size-2" : "size-3";
  const berry = strawberryBerryColors(color);

  if (!strawberry) {
    return (
      <span
        data-category-marker="dot"
        className={`${sizeClass} shrink-0 rounded-full`}
        style={{ backgroundColor: color }}
        aria-hidden
      />
    );
  }

  return (
    <svg
      data-category-marker="berry"
      className={`${size === "compact" ? "size-[11px]" : "size-[15px]"} shrink-0`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5.3 9.1c.2 6.2 2.6 10 6.7 12.1 4.1-2.1 6.5-5.9 6.7-12.1C16.6 7.6 14.3 7 12 7S7.4 7.6 5.3 9.1Z"
        fill={berry.fill}
        stroke={berry.stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 7 8.2 4.1l.8 3.8L5.3 6.8l2.4 3.4L12 8.7l4.3 1.5L18.7 6.8 15 7.9l.8-3.8L12 7Z"
        fill="#4B8B45"
        stroke={berry.stroke}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="11.4" r="1" fill="#FFE6A3" />
      <circle cx="14.8" cy="11.4" r="1" fill="#FFE6A3" />
      <circle cx="12" cy="15.2" r="1" fill="#FFE6A3" />
    </svg>
  );
}
