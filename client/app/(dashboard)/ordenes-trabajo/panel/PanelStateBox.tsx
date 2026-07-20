// panel/PanelStateBox.tsx — presentational only, no hooks, no 'use client'.
type PanelStateVariant = 'loading' | 'error' | 'empty';

interface PanelStateBoxProps {
  variant: PanelStateVariant;
  message: string;
  onRetry?: () => void; // rendered only when variant === 'error'
  className?: string; // caller supplies top margin (panel uses mt-6, workload mt-8)
}

export default function PanelStateBox({ variant, message, onRetry, className = '' }: PanelStateBoxProps) {
  if (variant === 'error') {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 ${className}`}
      >
        <span>{message}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 font-medium text-red-700 underline hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  }

  if (variant === 'loading') {
    return (
      <div
        className={`flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 ${className}`}
      >
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-rose-500 dark:border-stone-700 dark:border-t-rose-500"
          aria-hidden="true"
        />
        {message}
      </div>
    );
  }

  // 'empty'
  return (
    <div
      className={`rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 ${className}`}
    >
      {message}
    </div>
  );
}
