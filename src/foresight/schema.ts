/**
 * Foresight parameter schema system.
 *
 * One declaration per tool gives three things at once: runtime validation of
 * planner-proposed parameters, the compact JSON-schema manifest the planner
 * reads, and human-readable parameter docs for the registry inspector.
 *
 * Deliberately not zod: the planner manifest must be small (it rides in every
 * planning prompt), deterministic, and serializable — a ~120-line spec walker
 * in application code beats a schema-library bridge for that job.
 */

export type ParamSpec =
  | { type: "string"; description?: string; required?: boolean; default?: string; pattern?: string; maxLength?: number }
  | { type: "number"; description?: string; required?: boolean; default?: number; min?: number; max?: number; integer?: boolean }
  | { type: "boolean"; description?: string; required?: boolean; default?: boolean }
  | { type: "enum"; description?: string; required?: boolean; default?: string; values: readonly string[] }
  | { type: "array"; description?: string; required?: boolean; items: ParamSpec; minItems?: number; maxItems?: number }
  | { type: "object"; description?: string; required?: boolean; properties: Record<string, ParamSpec>; open?: boolean };

export type ParamShape = Record<string, ParamSpec>;

export interface ValidationResult {
  ok: boolean;
  /** Cleaned params with defaults applied (only when ok). */
  value?: Record<string, unknown>;
  errors: string[];
}

function validateSpec(spec: ParamSpec, value: unknown, path: string, errors: string[]): unknown {
  if (value === undefined || value === null) {
    if ("default" in spec && spec.default !== undefined) return spec.default;
    if (spec.required) errors.push(`${path}: required`);
    return undefined;
  }
  switch (spec.type) {
    case "string": {
      if (typeof value !== "string") { errors.push(`${path}: expected string`); return undefined; }
      if (spec.maxLength && value.length > spec.maxLength) return value.slice(0, spec.maxLength);
      if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
        errors.push(`${path}: does not match ${spec.pattern}`);
        return undefined;
      }
      return value;
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) { errors.push(`${path}: expected number`); return undefined; }
      if (spec.integer && !Number.isInteger(n)) { errors.push(`${path}: expected integer`); return undefined; }
      if (spec.min !== undefined && n < spec.min) { errors.push(`${path}: below min ${spec.min}`); return undefined; }
      if (spec.max !== undefined && n > spec.max) { errors.push(`${path}: above max ${spec.max}`); return undefined; }
      return n;
    }
    case "boolean": {
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      errors.push(`${path}: expected boolean`);
      return undefined;
    }
    case "enum": {
      const s = String(value);
      if (!spec.values.includes(s)) {
        // Tolerate case drift from the planner, but nothing else.
        const ci = spec.values.find((v) => v.toLowerCase() === s.toLowerCase());
        if (ci) return ci;
        errors.push(`${path}: must be one of ${spec.values.join(", ")}`);
        return undefined;
      }
      return s;
    }
    case "array": {
      const arr = Array.isArray(value) ? value : [value];
      if (spec.minItems !== undefined && arr.length < spec.minItems) {
        errors.push(`${path}: needs at least ${spec.minItems} item(s)`);
        return undefined;
      }
      const bounded = spec.maxItems !== undefined ? arr.slice(0, spec.maxItems) : arr;
      return bounded.map((v, i) => validateSpec(spec.items, v, `${path}[${i}]`, errors));
    }
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) { errors.push(`${path}: expected object`); return undefined; }
      const out: Record<string, unknown> = {};
      const src = value as Record<string, unknown>;
      for (const [k, child] of Object.entries(spec.properties)) {
        const v = validateSpec(child, src[k], `${path}.${k}`, errors);
        if (v !== undefined) out[k] = v;
      }
      if (spec.open) {
        for (const [k, v] of Object.entries(src)) if (!(k in spec.properties)) out[k] = v;
      }
      return out;
    }
  }
}

/** Validate raw params against a shape. Applies defaults, coerces scalars. */
export function validateParams(shape: ParamShape, raw: unknown): ValidationResult {
  const errors: string[] = [];
  const src = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const value: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(shape)) {
    const v = validateSpec(spec, src[key], key, errors);
    if (v !== undefined) value[key] = v;
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value, errors };
}

/** Compact JSON-schema-style rendering for the planner manifest. */
export function specToManifest(spec: ParamSpec): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  if (spec.description) base.desc = spec.description;
  if ("default" in spec && spec.default !== undefined) base.default = spec.default;
  switch (spec.type) {
    case "enum":
      return { ...base, enum: spec.values };
    case "array":
      return { ...base, type: "array", items: specToManifest(spec.items) };
    case "object": {
      const props: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(spec.properties)) props[k] = specToManifest(v);
      return { ...base, type: "object", properties: props };
    }
    default:
      return { ...base, type: spec.type };
  }
}

export function shapeToManifest(shape: ParamShape): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, spec] of Object.entries(shape)) {
    properties[k] = specToManifest(spec);
    if (spec.required) required.push(k);
  }
  return required.length > 0 ? { properties, required } : { properties };
}
