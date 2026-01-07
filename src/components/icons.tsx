import type { SVGProps } from "react";

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 12h2" />
      <path d="M6 12h2" />
      <path d="M10 12h2" />
      <path d="M14 12h2" />
      <path d="M18 12h2" />
      <path d="m5 7 2-2 2 2" />
      <path d="m17 17 2 2 2-2" />
      <path d="M7 12v-5" />
      <path d="M17 12v5" />
    </svg>
  );
}
