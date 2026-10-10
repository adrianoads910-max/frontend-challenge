import { useCallback, useRef, useState, type FormEvent } from "react";
import type { z } from "zod";
import { ApiError } from "@/lib/http";

/*
 * Minimal form state on top of the shared zod contracts:
 *  - client validation on blur and on submit (same schema the mock server uses);
 *  - server errors (ApiError.fields) mapped back onto the fields;
 *  - focus moves to the first invalid field after a failed submit (keyboard + screen readers).
 */

type Values = Record<string, unknown>;

export function useZodForm<S extends z.ZodType<Values>>(schema: S, initial: z.input<S>) {
  const [values, setValues] = useState<z.input<S>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const validate = useCallback(
    (v: z.input<S>) => {
      const result = schema.safeParse(v);
      const next: Record<string, string> = {};
      if (!result.success) for (const issue of result.error.issues) next[issue.path.join(".")] ??= issue.message;
      return { result, next };
    },
    [schema],
  );

  const focusFirstError = (fieldErrors: Record<string, string>) => {
    const first = Object.keys(fieldErrors)[0];
    if (!first) return;
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
  };

  const set = <K extends keyof z.input<S> & string>(name: K, value: z.input<S>[K]) => {
    setValues((prev) => ({ ...(prev as Values), [name]: value }) as z.input<S>);
    if (errors[name]) setErrors(({ [name]: _removed, ...rest }) => rest);
  };

  const field = <K extends keyof z.input<S> & string>(name: K) => ({
    name,
    value: (values[name] ?? "") as string,
    error: errors[name],
    onChange: (e: { target: { value: string } }) => set(name, e.target.value as z.input<S>[K]),
    onBlur: () => {
      const { next } = validate(values);
      setErrors((prev) => {
        const { [name]: _old, ...rest } = prev;
        return next[name] ? { ...rest, [name]: next[name]! } : rest;
      });
    },
  });

  /** Applies a failed API call to the form; returns true when it was handled as field errors. */
  const applyApiError = (error: unknown) => {
    if (error instanceof ApiError && error.fields && Object.keys(error.fields).length) {
      setErrors(error.fields);
      setFormError(error.message);
      focusFirstError(error.fields);
      return true;
    }
    setFormError(error instanceof ApiError ? error.message : "Algo deu errado. Tente novamente.");
    return false;
  };

  const handleSubmit = (onValid: (data: z.output<S>) => void | Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const { result, next } = validate(values);
    setErrors(next);
    if (!result.success) {
      focusFirstError(next);
      return;
    }
    await onValid(result.data as z.output<S>);
  };

  return { values, set, field, errors, setErrors, formError, setFormError, applyApiError, handleSubmit, formRef, reset: setValues };
}
