import type { SVGProps } from "react";

/**
 * alphaXiv (alphaxiv.org) mark — the site's red "αχ" monogram: an alpha whose
 * tail runs into the long stroke of a chi. Inline because the brand has no
 * Simple Icons glyph.
 */
export function AlphaxivIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="#A83131"
			strokeWidth="2.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden
			{...props}
		>
			<title>alphaXiv</title>
			<path d="M3 12.4 8.8 6.8l4.4 4.2" />
			<path d="M20.6 6.6 7.6 18.6a2.3 2.3 0 0 1-3.2-3.3l5.1-5" />
			<path d="m16.6 13.6 4 4" />
		</svg>
	);
}
