import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed',
  secondary:
    'bg-[var(--color-surface-alt)] text-[var(--color-text)] hover:brightness-95 dark:hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed',
  ghost:
    'bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-alt)] disabled:opacity-40 disabled:cursor-not-allowed',
  danger: 'bg-[var(--color-danger)] text-white hover:brightness-90 disabled:opacity-40 disabled:cursor-not-allowed',
};

export function Button({ variant = 'primary', icon, className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
