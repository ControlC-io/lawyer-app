/**
 * Shared form configuration types and helpers for page → block → fields structure.
 * Used by workflow editor (FormBlocksEditor), execution panel (internal), and external form.
 */

export interface FormBlock {
  id: string;
  title?: string;
  columns: 1 | 2 | 3 | 4;
  columns_content: string[][];
  column_names?: string[];
  label_positions?: ("top" | "side")[];
  compact?: boolean;
}

export interface FormPage {
  id: string;
  title?: string;
  blocks: FormBlock[];
}

/**
 * Normalize step config to a list of form pages (page → block → fields).
 * - If form_pages exists and has items, use it.
 * - Else if form_blocks exists, treat as a single page with no title (backward compat).
 * - Else return empty array (caller will use fallback rendering).
 */
export function getFormPagesFromConfig(config: Record<string, unknown> | null | undefined): FormPage[] {
  if (!config) return [];

  const formPages = config.form_pages;
  if (Array.isArray(formPages) && formPages.length > 0) {
    return formPages as FormPage[];
  }

  const formBlocks = config.form_blocks;
  if (Array.isArray(formBlocks) && formBlocks.length > 0) {
    return [
      {
        id: "default-page",
        title: undefined,
        blocks: formBlocks as FormBlock[],
      },
    ];
  }

  return [];
}

/**
 * Check if config has any block-based or page-based form structure (so we use page/block rendering).
 */
export function hasStructuredForm(config: Record<string, unknown> | null | undefined): boolean {
  const pages = getFormPagesFromConfig(config);
  return pages.length > 0 && pages.some((p) => p.blocks.length > 0);
}

// ---------------------------------------------------------------------------
// Centralized field rules
// ---------------------------------------------------------------------------

export interface FieldRule {
  id: string;
  target_field_id: string;
  rule_type: "visibility" | "required";
  condition: "always" | "only_if";
  /** Only when condition === "only_if" */
  source_field_id?: string;
  operator?: string;
  value?: string | number | boolean;
}

export interface OperatorDef {
  value: string;
  label: string;
  /** Whether the operator requires a comparison value */
  needsValue: boolean;
}

const EMPTY_OPS: OperatorDef[] = [
  { value: "is_empty", label: "Is empty", needsValue: false },
  { value: "is_not_empty", label: "Is not empty", needsValue: false },
];

export const OPERATORS_BY_TYPE: Record<string, OperatorDef[]> = {
  text: [
    { value: "equals", label: "Equals", needsValue: true },
    { value: "not_equals", label: "Not equals", needsValue: true },
    { value: "contains", label: "Contains", needsValue: true },
    ...EMPTY_OPS,
  ],
  number: [
    { value: "equals", label: "Equals", needsValue: true },
    { value: "not_equals", label: "Not equals", needsValue: true },
    { value: "greater_than", label: "Greater than", needsValue: true },
    { value: "less_than", label: "Less than", needsValue: true },
    { value: "gte", label: "Greater or equal", needsValue: true },
    { value: "lte", label: "Less or equal", needsValue: true },
    ...EMPTY_OPS,
  ],
  boolean: [
    { value: "is_true", label: "Is true", needsValue: false },
    { value: "is_false", label: "Is false", needsValue: false },
  ],
  date: [
    { value: "equals", label: "Equals", needsValue: true },
    { value: "before", label: "Before", needsValue: true },
    { value: "after", label: "After", needsValue: true },
    ...EMPTY_OPS,
  ],
  time: [
    { value: "equals", label: "Equals", needsValue: true },
    { value: "before", label: "Before", needsValue: true },
    { value: "after", label: "After", needsValue: true },
    ...EMPTY_OPS,
  ],
  datetime: [
    { value: "equals", label: "Equals", needsValue: true },
    { value: "before", label: "Before", needsValue: true },
    { value: "after", label: "After", needsValue: true },
    ...EMPTY_OPS,
  ],
  option: [
    { value: "equals", label: "Equals", needsValue: true },
    { value: "not_equals", label: "Not equals", needsValue: true },
    ...EMPTY_OPS,
  ],
  multiple_option: [
    { value: "contains", label: "Contains", needsValue: true },
    { value: "not_contains", label: "Does not contain", needsValue: true },
    ...EMPTY_OPS,
  ],
  file: [...EMPTY_OPS],
  multiple_files: [...EMPTY_OPS],
  array: [...EMPTY_OPS],
  html: [...EMPTY_OPS],
  signature: [...EMPTY_OPS],
};

/**
 * Return the list of available operators for a given field type.
 * Falls back to is_empty / is_not_empty for unknown types.
 */
export function getOperatorsForFieldType(fieldType: string | undefined): OperatorDef[] {
  if (!fieldType) return EMPTY_OPS;
  return OPERATORS_BY_TYPE[fieldType] ?? EMPTY_OPS;
}

/**
 * Evaluate a single FieldRule against current form values.
 * Returns `true` when the rule's condition is met.
 */
export function evaluateFieldRule(
  rule: FieldRule,
  currentValues: Record<string, unknown>,
): boolean {
  if (rule.condition === "always") return true;

  // "only_if" — need source field + operator
  if (!rule.source_field_id || !rule.operator) return true;

  const value = currentValues[rule.source_field_id];

  switch (rule.operator) {
    // ---------- universal ----------
    case "is_empty":
      return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    case "is_not_empty":
      return value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0);

    // ---------- boolean ----------
    case "is_true":
      return value === true;
    case "is_false":
      return value === false || value === undefined || value === null;

    // ---------- equality ----------
    case "equals":
      // eslint-disable-next-line eqeqeq
      return value == rule.value;
    case "not_equals":
      // eslint-disable-next-line eqeqeq
      return value != rule.value;

    // ---------- text ----------
    case "contains":
      if (typeof value === "string") return value.includes(String(rule.value ?? ""));
      if (Array.isArray(value)) return value.includes(rule.value);
      return false;
    case "not_contains":
      if (typeof value === "string") return !value.includes(String(rule.value ?? ""));
      if (Array.isArray(value)) return !value.includes(rule.value);
      return true;

    // ---------- numeric ----------
    case "greater_than":
      return Number(value) > Number(rule.value);
    case "less_than":
      return Number(value) < Number(rule.value);
    case "gte":
      return Number(value) >= Number(rule.value);
    case "lte":
      return Number(value) <= Number(rule.value);

    // ---------- date / time ----------
    case "before":
      return String(value ?? "") < String(rule.value ?? "");
    case "after":
      return String(value ?? "") > String(rule.value ?? "");

    default:
      return true;
  }
}

/**
 * Given all field_rules, check if a field should be visible / required.
 * - If there are **no** rules of that type for the field, returns `defaultValue`.
 * - If there are rules, returns `true` when **any** matching rule evaluates to true.
 */
export function evaluateFieldRules(
  fieldId: string,
  ruleType: "visibility" | "required",
  fieldRules: FieldRule[] | undefined | null,
  currentValues: Record<string, unknown>,
  defaultValue: boolean,
): boolean {
  if (!fieldRules || fieldRules.length === 0) return defaultValue;

  const matching = fieldRules.filter(
    (r) => r.target_field_id === fieldId && r.rule_type === ruleType,
  );

  if (matching.length === 0) return defaultValue;

  // Any matching rule that evaluates true → field is visible / required
  return matching.some((r) => evaluateFieldRule(r, currentValues));
}

// ---------------------------------------------------------------------------
// Field validation rules (value-level constraints)
// ---------------------------------------------------------------------------

export type FieldValidationType =
  | "min_length"
  | "max_length"
  | "regex"
  | "email_format"
  | "url_format"
  | "phone_format"
  | "min_value"
  | "max_value"
  | "integer_only"
  | "date_before_today"
  | "date_after_today"
  | "date_before"
  | "date_after"
  | "min_selections"
  | "max_selections";

export interface FieldValidationRule {
  id: string;
  target_field_id: string;
  validation_type: FieldValidationType;
  /** Constraint parameter: regex pattern, min length, specific date, etc. */
  value?: string | number;
  /** Optional custom error message override */
  error_message?: string;
}

/** Metadata for each validation type */
export interface ValidationTypeDef {
  value: FieldValidationType;
  /** i18n key for the label shown in dropdowns */
  labelKey: string;
  /** Fallback label (English) */
  label: string;
  /** Whether this validation type requires a constraint value */
  needsValue: boolean;
  /** HTML input type for the value field when needsValue is true */
  valueInputType?: "number" | "text" | "date" | "datetime-local";
  /** Placeholder for the value input */
  valuePlaceholder?: string;
  /** Default error message key */
  errorKey: string;
}

export const VALIDATION_TYPE_CONFIG: Record<FieldValidationType, ValidationTypeDef> = {
  min_length: {
    value: "min_length",
    labelKey: "fieldValidation.types.min_length",
    label: "Min length",
    needsValue: true,
    valueInputType: "number",
    valuePlaceholder: "e.g. 3",
    errorKey: "fieldValidation.errors.min_length",
  },
  max_length: {
    value: "max_length",
    labelKey: "fieldValidation.types.max_length",
    label: "Max length",
    needsValue: true,
    valueInputType: "number",
    valuePlaceholder: "e.g. 255",
    errorKey: "fieldValidation.errors.max_length",
  },
  regex: {
    value: "regex",
    labelKey: "fieldValidation.types.regex",
    label: "Regex pattern",
    needsValue: true,
    valueInputType: "text",
    valuePlaceholder: "e.g. ^[A-Z]{2}\\d{4}$",
    errorKey: "fieldValidation.errors.regex",
  },
  email_format: {
    value: "email_format",
    labelKey: "fieldValidation.types.email_format",
    label: "Email format",
    needsValue: false,
    errorKey: "fieldValidation.errors.email_format",
  },
  url_format: {
    value: "url_format",
    labelKey: "fieldValidation.types.url_format",
    label: "URL format",
    needsValue: false,
    errorKey: "fieldValidation.errors.url_format",
  },
  phone_format: {
    value: "phone_format",
    labelKey: "fieldValidation.types.phone_format",
    label: "Phone format",
    needsValue: false,
    errorKey: "fieldValidation.errors.phone_format",
  },
  min_value: {
    value: "min_value",
    labelKey: "fieldValidation.types.min_value",
    label: "Min value",
    needsValue: true,
    valueInputType: "number",
    valuePlaceholder: "e.g. 0",
    errorKey: "fieldValidation.errors.min_value",
  },
  max_value: {
    value: "max_value",
    labelKey: "fieldValidation.types.max_value",
    label: "Max value",
    needsValue: true,
    valueInputType: "number",
    valuePlaceholder: "e.g. 1000",
    errorKey: "fieldValidation.errors.max_value",
  },
  integer_only: {
    value: "integer_only",
    labelKey: "fieldValidation.types.integer_only",
    label: "Integer only",
    needsValue: false,
    errorKey: "fieldValidation.errors.integer_only",
  },
  date_before_today: {
    value: "date_before_today",
    labelKey: "fieldValidation.types.date_before_today",
    label: "Before today",
    needsValue: false,
    errorKey: "fieldValidation.errors.date_before_today",
  },
  date_after_today: {
    value: "date_after_today",
    labelKey: "fieldValidation.types.date_after_today",
    label: "After today",
    needsValue: false,
    errorKey: "fieldValidation.errors.date_after_today",
  },
  date_before: {
    value: "date_before",
    labelKey: "fieldValidation.types.date_before",
    label: "Before date",
    needsValue: true,
    valueInputType: "date",
    errorKey: "fieldValidation.errors.date_before",
  },
  date_after: {
    value: "date_after",
    labelKey: "fieldValidation.types.date_after",
    label: "After date",
    needsValue: true,
    valueInputType: "date",
    errorKey: "fieldValidation.errors.date_after",
  },
  min_selections: {
    value: "min_selections",
    labelKey: "fieldValidation.types.min_selections",
    label: "Min selections",
    needsValue: true,
    valueInputType: "number",
    valuePlaceholder: "e.g. 1",
    errorKey: "fieldValidation.errors.min_selections",
  },
  max_selections: {
    value: "max_selections",
    labelKey: "fieldValidation.types.max_selections",
    label: "Max selections",
    needsValue: true,
    valueInputType: "number",
    valuePlaceholder: "e.g. 5",
    errorKey: "fieldValidation.errors.max_selections",
  },
};

/** Which validation types are available for each field type */
export const VALIDATIONS_BY_FIELD_TYPE: Record<string, FieldValidationType[]> = {
  text: ["min_length", "max_length", "regex", "email_format", "url_format", "phone_format"],
  email: ["min_length", "max_length", "regex", "email_format"],
  password: ["min_length", "max_length", "regex"],
  url: ["min_length", "max_length", "url_format"],
  number: ["min_value", "max_value", "integer_only"],
  date: ["date_before_today", "date_after_today", "date_before", "date_after"],
  datetime: ["date_before_today", "date_after_today", "date_before", "date_after"],
  time: [],
  boolean: [],
  option: [],
  multiple_option: ["min_selections", "max_selections"],
  file: [],
  multiple_files: [],
  array: [],
  html: [],
  signature: [],
};

/**
 * Return the list of available validation types for a given field type.
 */
export function getValidationsForFieldType(fieldType: string | undefined): ValidationTypeDef[] {
  if (!fieldType) return [];
  const types = VALIDATIONS_BY_FIELD_TYPE[fieldType];
  if (!types) return [];
  return types.map((t) => VALIDATION_TYPE_CONFIG[t]);
}

// Email regex (RFC 5322 simplified)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// URL regex (simplified)
const URL_RE = /^https?:\/\/.+/i;
// Phone regex (international, allows +, digits, spaces, dashes, parens)
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

/**
 * Evaluate a single FieldValidationRule against a field value.
 * Only validates non-empty values — empty/missing values should be caught by "required" rules.
 * Returns `{ valid: true }` or `{ valid: false, message: string }`.
 */
export function evaluateFieldValidation(
  rule: FieldValidationRule,
  fieldValue: unknown,
): { valid: boolean; message?: string } {
  // Skip validation for empty values (required rules handle that)
  if (fieldValue === undefined || fieldValue === null || fieldValue === "") {
    return { valid: true };
  }

  const cfg = VALIDATION_TYPE_CONFIG[rule.validation_type];
  const customMsg = rule.error_message?.trim();

  switch (rule.validation_type) {
    // ---- Text length ----
    case "min_length": {
      const len = String(fieldValue).length;
      const min = Number(rule.value ?? 0);
      if (len < min) return { valid: false, message: customMsg || `Must be at least ${min} characters` };
      return { valid: true };
    }
    case "max_length": {
      const len = String(fieldValue).length;
      const max = Number(rule.value ?? Infinity);
      if (len > max) return { valid: false, message: customMsg || `Must be at most ${max} characters` };
      return { valid: true };
    }

    // ---- Regex ----
    case "regex": {
      const pattern = String(rule.value ?? "");
      if (!pattern) return { valid: true };
      try {
        const re = new RegExp(pattern);
        if (!re.test(String(fieldValue))) {
          return { valid: false, message: customMsg || `Does not match the required pattern` };
        }
      } catch {
        // Invalid regex — skip validation
        return { valid: true };
      }
      return { valid: true };
    }

    // ---- Formats ----
    case "email_format": {
      if (!EMAIL_RE.test(String(fieldValue))) {
        return { valid: false, message: customMsg || "Must be a valid email address" };
      }
      return { valid: true };
    }
    case "url_format": {
      if (!URL_RE.test(String(fieldValue))) {
        return { valid: false, message: customMsg || "Must be a valid URL" };
      }
      return { valid: true };
    }
    case "phone_format": {
      if (!PHONE_RE.test(String(fieldValue))) {
        return { valid: false, message: customMsg || "Must be a valid phone number" };
      }
      return { valid: true };
    }

    // ---- Number constraints ----
    case "min_value": {
      const num = Number(fieldValue);
      const min = Number(rule.value ?? -Infinity);
      if (isNaN(num) || num < min) {
        return { valid: false, message: customMsg || `Must be at least ${min}` };
      }
      return { valid: true };
    }
    case "max_value": {
      const num = Number(fieldValue);
      const max = Number(rule.value ?? Infinity);
      if (isNaN(num) || num > max) {
        return { valid: false, message: customMsg || `Must be at most ${max}` };
      }
      return { valid: true };
    }
    case "integer_only": {
      const num = Number(fieldValue);
      if (isNaN(num) || !Number.isInteger(num)) {
        return { valid: false, message: customMsg || "Must be a whole number" };
      }
      return { valid: true };
    }

    // ---- Date constraints ----
    case "date_before_today": {
      const d = new Date(String(fieldValue));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(d.getTime()) || d >= today) {
        return { valid: false, message: customMsg || "Date must be before today" };
      }
      return { valid: true };
    }
    case "date_after_today": {
      const d = new Date(String(fieldValue));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(d.getTime()) || d < today) {
        return { valid: false, message: customMsg || "Date must be today or later" };
      }
      return { valid: true };
    }
    case "date_before": {
      const d = new Date(String(fieldValue));
      const target = new Date(String(rule.value ?? ""));
      if (isNaN(d.getTime()) || isNaN(target.getTime()) || d >= target) {
        return { valid: false, message: customMsg || `Date must be before ${rule.value}` };
      }
      return { valid: true };
    }
    case "date_after": {
      const d = new Date(String(fieldValue));
      const target = new Date(String(rule.value ?? ""));
      if (isNaN(d.getTime()) || isNaN(target.getTime()) || d <= target) {
        return { valid: false, message: customMsg || `Date must be after ${rule.value}` };
      }
      return { valid: true };
    }

    // ---- Selection count ----
    case "min_selections": {
      const count = Array.isArray(fieldValue) ? fieldValue.length : 0;
      const min = Number(rule.value ?? 0);
      if (count < min) {
        return { valid: false, message: customMsg || `Select at least ${min} option(s)` };
      }
      return { valid: true };
    }
    case "max_selections": {
      const count = Array.isArray(fieldValue) ? fieldValue.length : 0;
      const max = Number(rule.value ?? Infinity);
      if (count > max) {
        return { valid: false, message: customMsg || `Select at most ${max} option(s)` };
      }
      return { valid: true };
    }

    default:
      return { valid: true };
  }
}

/**
 * Validate all field_validation rules for a specific field.
 * Returns an array of error messages (empty = all valid).
 */
export function validateFieldValue(
  fieldId: string,
  fieldValidations: FieldValidationRule[] | undefined | null,
  fieldValue: unknown,
): string[] {
  if (!fieldValidations || fieldValidations.length === 0) return [];

  const matching = fieldValidations.filter((r) => r.target_field_id === fieldId);
  if (matching.length === 0) return [];

  const errors: string[] = [];
  for (const rule of matching) {
    const result = evaluateFieldValidation(rule, fieldValue);
    if (!result.valid && result.message) {
      errors.push(result.message);
    }
  }
  return errors;
}

/**
 * Validate all fields at once. Returns a map of fieldId → error messages.
 * Only returns entries for fields that have errors.
 */
export function validateAllFields(
  fieldValidations: FieldValidationRule[] | undefined | null,
  currentValues: Record<string, unknown>,
): Record<string, string[]> {
  if (!fieldValidations || fieldValidations.length === 0) return {};

  const result: Record<string, string[]> = {};
  // Get unique field ids
  const fieldIds = [...new Set(fieldValidations.map((r) => r.target_field_id))];

  for (const fieldId of fieldIds) {
    const errors = validateFieldValue(fieldId, fieldValidations, currentValues[fieldId]);
    if (errors.length > 0) {
      result[fieldId] = errors;
    }
  }
  return result;
}
