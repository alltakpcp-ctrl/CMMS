import { InputHTMLAttributes, forwardRef } from "react";

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ label, id, className = "", ...props }, ref) => (
  <label htmlFor={id} className="flex items-center gap-2 text-sm text-slate-700">
    <input
      ref={ref}
      id={id}
      type="checkbox"
      className={`h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 ${className}`}
      {...props}
    />
    {label}
  </label>
));
Checkbox.displayName = "Checkbox";
