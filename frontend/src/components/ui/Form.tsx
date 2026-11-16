import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const control = 'w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-muted/70 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60'

interface FieldProps { label: string; error?: string; hint?: string; children: (id: string) => ReactNode; className?: string }
export function Field({ label, error, hint, children, className = '' }: FieldProps) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      {children(id)}
      {error ? <p role="alert" className="mt-1 text-xs text-bad">{error}</p>
        : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, className = '', ...rest }, ref) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {id => <input id={id} ref={ref} aria-invalid={!!error} className={`${control} h-10 ${error ? 'border-bad' : ''}`} {...rest} />}
    </Field>
  )
})

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string }
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, error, hint, className = '', children, ...rest }, ref) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {id => <select id={id} ref={ref} aria-invalid={!!error} className={`${control} h-10 ${error ? 'border-bad' : ''}`} {...rest}>{children}</select>}
    </Field>
  )
})

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string }
export const Textarea = forwardRef<HTMLTextAreaElement, AreaProps>(function Textarea({ label, error, className = '', ...rest }, ref) {
  return (
    <Field label={label} error={error} className={className}>
      {id => <textarea id={id} ref={ref} rows={3} aria-invalid={!!error} className={`${control} py-2 ${error ? 'border-bad' : ''}`} {...rest} />}
    </Field>
  )
})

/**
 * Compact filter controls used in toolbars (no label, aria-label instead).
 * Inputs fill their container unless the caller sets a width (w-36 etc.); selects size to their content.
 */
const filterBase = control.replace('w-full ', '')
const hasWidth = (cls: string) => /(^|\s)(w-|min-w-|max-w-)/.test(cls)
export const FilterInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function FilterInput({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`${filterBase} h-9 ${hasWidth(className) ? '' : 'w-full'} ${className}`} {...rest} />
})
export function FilterSelect({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${filterBase} h-9 ${className}`} {...rest}>{children}</select>
}
