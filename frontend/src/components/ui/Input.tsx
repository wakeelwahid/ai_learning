import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef, useId } from "react";
import clsx from "clsx";

interface FieldWrapperProps {
  label?: string;
  helperText?: string;
  error?: string;
  id?: string;
  required?: boolean;
}

function FieldChrome({
  id,
  label,
  helperText,
  error,
  required,
  children,
}: FieldWrapperProps & { children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="text-danger-600 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="error-text">{error}</p>
      ) : helperText ? (
        <p className="helper-text">{helperText}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldWrapperProps {}

/** Text input primitive with label, helper text, and error state. */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, helperText, error, required, className, id, ...rest }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldChrome id={fieldId} label={label} helperText={helperText} error={error} required={required}>
        <input
          ref={ref}
          id={fieldId}
          className={clsx("input", error && "input-error", className)}
          aria-invalid={!!error}
          {...rest}
        />
      </FieldChrome>
    );
  }
);
Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldWrapperProps {}

/** Textarea primitive with label, helper text, and error state. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helperText, error, required, className, id, ...rest }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldChrome id={fieldId} label={label} helperText={helperText} error={error} required={required}>
        <textarea
          ref={ref}
          id={fieldId}
          className={clsx("input", error && "input-error", className)}
          aria-invalid={!!error}
          {...rest}
        />
      </FieldChrome>
    );
  }
);
Textarea.displayName = "Textarea";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldWrapperProps {
  options?: SelectOption[];
}

/** Select primitive with label, helper text, and error state. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, helperText, error, required, className, id, options, children, ...rest }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldChrome id={fieldId} label={label} helperText={helperText} error={error} required={required}>
        <select
          ref={ref}
          id={fieldId}
          className={clsx("input", error && "input-error", className)}
          aria-invalid={!!error}
          {...rest}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
      </FieldChrome>
    );
  }
);
Select.displayName = "Select";

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

/** Checkbox primitive with trailing label. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, id, ...rest }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <label htmlFor={fieldId} className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <input ref={ref} id={fieldId} type="checkbox" className={clsx("checkbox", className)} {...rest} />
        {label}
      </label>
    );
  }
);
Checkbox.displayName = "Checkbox";

export interface RadioProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

/** Radio primitive with trailing label. */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ label, className, id, ...rest }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <label htmlFor={fieldId} className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <input ref={ref} id={fieldId} type="radio" className={clsx("radio", className)} {...rest} />
        {label}
      </label>
    );
  }
);
Radio.displayName = "Radio";
