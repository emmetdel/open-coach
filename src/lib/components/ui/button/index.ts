import { type VariantProps, tv } from 'tailwind-variants';
import type { Snippet } from 'svelte';
import type { HTMLButtonAttributes } from 'svelte/elements';
import Root from './button.svelte';

const buttonVariants = tv({
	base: 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-925 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
	variants: {
		variant: {
			default: 'bg-forest-600 text-white hover:bg-forest-500 shadow-lg shadow-forest-900/30',
			destructive: 'bg-coral-600 text-white hover:bg-coral-500 shadow-lg shadow-coral-900/30',
			outline:
				'border border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:border-slate-600',
			secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700',
			ghost: 'text-slate-300 hover:bg-slate-800 hover:text-slate-100',
			link: 'text-forest-400 underline-offset-4 hover:underline'
		},
		size: {
			default: 'h-11 px-5 py-2',
			sm: 'h-9 px-4 text-xs',
			lg: 'h-12 px-8 text-base',
			icon: 'h-10 w-10'
		}
	},
	defaultVariants: {
		variant: 'default',
		size: 'default'
	}
});

type Variant = VariantProps<typeof buttonVariants>['variant'];
type Size = VariantProps<typeof buttonVariants>['size'];

interface ButtonProps extends HTMLButtonAttributes {
	variant?: Variant;
	size?: Size;
	children?: Snippet;
}

export {
	Root,
	type ButtonProps,
	Root as Button,
	buttonVariants
};

