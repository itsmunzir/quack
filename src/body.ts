import type { FormPart, Header } from "./api";

export type BodyType = "raw" | "form" | "multipart";

/** A form or multipart field. For a file field, `value` is the file's path. */
export interface FormField {
  name: string;
  value: string;
  file?: boolean;
}

export const BODY_TYPES: readonly { id: BodyType; name: string }[] = [
  { id: "raw", name: "Raw" },
  { id: "form", name: "Form" },
  { id: "multipart", name: "Multipart" },
];

const isStr = (v: unknown): v is string => typeof v === "string";
export const isBodyType = (v: unknown): v is BodyType => BODY_TYPES.some((b) => b.id === v);
export const isField = (f: unknown): f is FormField => !!f && isStr((f as FormField).name) && isStr((f as FormField).value);

const named = (fields: FormField[] = []) => fields.filter((f) => f.name.trim());

/** `a=1&b=two` from the text fields. */
export const urlEncode = (fields: FormField[] = []) =>
  named(fields)
    .filter((f) => !f.file)
    .map((f) => `${encodeURIComponent(f.name)}=${encodeURIComponent(f.value)}`)
    .join("&");

type WithBody = { headers: Header[]; body: string; bodyType?: BodyType; form?: FormField[] };

/** Turns form fields into what goes on the wire: an encoded body, or multipart parts for the engine. */
export function withBody<R extends WithBody>(r: R): R & { multipart?: FormPart[] } {
  if (r.bodyType === "form") {
    const hasType = r.headers.some(([k]) => k.trim().toLowerCase() === "content-type");
    const headers: Header[] = hasType ? r.headers : [...r.headers, ["Content-Type", "application/x-www-form-urlencoded"]];
    return { ...r, headers, body: urlEncode(r.form) };
  }
  if (r.bodyType === "multipart") return { ...r, body: "", multipart: named(r.form).map(({ name, value, file }) => ({ name, value, file: !!file })) };
  return r;
}
