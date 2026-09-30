import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { IconAlert, IconChevronDown, IconSearch } from '../icons';
import styles from './Field.module.css';

type FieldShellProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

function FieldShell({ id, label, hint, error, required, className, children }: FieldShellProps) {
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={`${id}-error`} role="alert">
          <IconAlert size={16} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: ReactNode, error?: string | null) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  numeric?: boolean;
  suffix?: string;
  fieldClassName?: string;
};

export function TextField({ label, hint, error, numeric, suffix, fieldClassName, required, className, ...rest }: TextFieldProps) {
  const id = useId();
  const cls = [
    styles.control,
    numeric ? styles.numeric : '',
    suffix ? styles.withSuffix : '',
    error ? styles.invalid : '',
    className ?? '',
  ].join(' ');
  const input = (
    <input
      id={id}
      className={cls}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(id, hint, error)}
      aria-required={required || undefined}
      inputMode={numeric ? 'decimal' : undefined}
      autoComplete="off"
      {...rest}
    />
  );
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      {suffix ? (
        <div className={styles.adorned}>
          {input}
          <span className={styles.suffix} aria-hidden="true">
            {suffix}
          </span>
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  fieldClassName?: string;
  children: ReactNode;
};

export function SelectField({ label, hint, error, fieldClassName, required, className, children, ...rest }: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      <div className={styles.selectWrap}>
        <select
          id={id}
          className={[styles.control, styles.select, error ? styles.invalid : '', className ?? ''].join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          aria-required={required || undefined}
          {...rest}
        >
          {children}
        </select>
        <IconChevronDown size={18} className={styles.selectIcon} />
      </div>
    </FieldShell>
  );
}

type TextareaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  fieldClassName?: string;
};

export function TextareaField({ label, hint, error, fieldClassName, required, className, ...rest }: TextareaFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      <textarea
        id={id}
        className={[styles.control, styles.textarea, error ? styles.invalid : '', className ?? ''].join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </FieldShell>
  );
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode };

export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={[styles.checkbox, className ?? ''].join(' ')}>
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
}

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
};

/** Ô tìm kiếm theo bản vẽ: aria-label bằng đúng placeholder. */
export function SearchField({ value, onValueChange, placeholder, className, ...rest }: SearchFieldProps) {
  return (
    <label className={[styles.search, className ?? ''].join(' ')}>
      <IconSearch size={18} />
      <input
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        {...rest}
      />
    </label>
  );
}
