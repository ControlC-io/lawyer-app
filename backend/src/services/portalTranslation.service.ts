export const SUPPORTED_PORTAL_LANGUAGES = ['fr', 'en', 'de', 'lb', 'pt', 'es'] as const;

export type PortalLanguage = (typeof SUPPORTED_PORTAL_LANGUAGES)[number];
export type TranslationRecord = Record<string, string>;

export interface PortalTranslationRow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  section: 'workflow' | 'field' | 'option' | 'form_page' | 'form_block' | 'form_column';
  path: string;
  label: string;
  source_text: string;
  translations: TranslationRecord;
}

const SUPPORTED_SET = new Set<string>(SUPPORTED_PORTAL_LANGUAGES);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizePortalLanguages(input: unknown, fallback: PortalLanguage = 'en'): PortalLanguage[] {
  const values = Array.isArray(input) ? input : [];
  const normalized = values
    .map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''))
    .filter((v): v is PortalLanguage => SUPPORTED_SET.has(v));

  const deduped = Array.from(new Set(normalized));
  if (!deduped.includes(fallback)) deduped.unshift(fallback);
  return deduped.length > 0 ? deduped : [fallback];
}

export function normalizePortalDefaultLanguage(input: unknown, enabledLanguages: PortalLanguage[]): PortalLanguage {
  const normalized = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (SUPPORTED_SET.has(normalized) && enabledLanguages.includes(normalized as PortalLanguage)) {
    return normalized as PortalLanguage;
  }
  return enabledLanguages[0] ?? 'en';
}

function toTranslationRecord(input: unknown): TranslationRecord {
  if (!isObjectRecord(input)) return {};
  const out: TranslationRecord = {};
  for (const lang of SUPPORTED_PORTAL_LANGUAGES) {
    const value = input[lang];
    if (typeof value === 'string') out[lang] = value;
  }
  return out;
}

function withTranslationValue(
  existing: unknown,
  lang: PortalLanguage,
  value: string | null | undefined,
): TranslationRecord {
  const next = toTranslationRecord(existing);
  if (typeof value === 'string') next[lang] = value;
  else delete next[lang];
  return next;
}

function firstNonEmptyValue(record: TranslationRecord): string | undefined {
  for (const lang of SUPPORTED_PORTAL_LANGUAGES) {
    const value = record[lang];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

export function resolveLocalizedText(
  baseText: unknown,
  translations: unknown,
  requestedLanguage: string,
  defaultLanguage: PortalLanguage,
): string {
  const base = typeof baseText === 'string' ? baseText : '';
  const map = toTranslationRecord(translations);
  const requested = (requestedLanguage || '').trim().toLowerCase();

  const requestedValue = map[requested];
  if (typeof requestedValue === 'string' && requestedValue.trim()) return requestedValue;

  const defaultValue = map[defaultLanguage];
  if (typeof defaultValue === 'string' && defaultValue.trim()) return defaultValue;

  const enValue = map.en;
  if (typeof enValue === 'string' && enValue.trim()) return enValue;

  const anyValue = firstNonEmptyValue(map);
  if (anyValue) return anyValue;

  return base;
}

function toFieldArray(dataStructure: unknown): any[] {
  if (Array.isArray(dataStructure)) return dataStructure;
  if (isObjectRecord(dataStructure) && Array.isArray(dataStructure.fields)) return dataStructure.fields as any[];
  return [];
}

function fieldLabel(field: any): string {
  if (!isObjectRecord(field)) return '';
  if (typeof field.label === 'string' && field.label.trim()) return field.label;
  if (typeof field.name === 'string' && field.name.trim()) return field.name;
  return typeof field.id === 'string' ? field.id : '';
}

function optionValue(option: any): string {
  if (typeof option === 'string') return option;
  if (isObjectRecord(option) && typeof option.value === 'string') return option.value;
  if (isObjectRecord(option) && typeof option.label === 'string') return option.label;
  return '';
}

function optionLabel(option: any): string {
  if (typeof option === 'string') return option;
  if (isObjectRecord(option) && typeof option.label === 'string' && option.label.trim()) return option.label;
  if (isObjectRecord(option) && typeof option.value === 'string') return option.value;
  return '';
}

function buildTranslationsForOutput(input: unknown, enabledLanguages: PortalLanguage[]): TranslationRecord {
  const base = toTranslationRecord(input);
  const out: TranslationRecord = {};
  for (const lang of enabledLanguages) out[lang] = base[lang] ?? '';
  return out;
}

function pushRow(rows: PortalTranslationRow[], row: PortalTranslationRow): void {
  if (!row.source_text?.trim() && Object.values(row.translations).every((v) => !v?.trim())) return;
  rows.push(row);
}

export function collectPortalTranslationRows(args: {
  workflow: {
    id: string;
    name: string;
    name_i18n?: unknown;
    description: string | null;
    description_i18n?: unknown;
    data_structure: unknown;
  };
  formStepConfig: unknown;
  enabledLanguages: PortalLanguage[];
}): PortalTranslationRow[] {
  const { workflow, formStepConfig, enabledLanguages } = args;
  const rows: PortalTranslationRow[] = [];

  pushRow(rows, {
    id: `${workflow.id}:workflow.name`,
    workflow_id: workflow.id,
    workflow_name: workflow.name,
    section: 'workflow',
    path: 'workflow.name',
    label: 'Workflow title',
    source_text: workflow.name ?? '',
    translations: buildTranslationsForOutput(workflow.name_i18n, enabledLanguages),
  });

  pushRow(rows, {
    id: `${workflow.id}:workflow.description`,
    workflow_id: workflow.id,
    workflow_name: workflow.name,
    section: 'workflow',
    path: 'workflow.description',
    label: 'Workflow description',
    source_text: workflow.description ?? '',
    translations: buildTranslationsForOutput(workflow.description_i18n, enabledLanguages),
  });

  const fields = toFieldArray(workflow.data_structure);
  for (const field of fields) {
    if (!isObjectRecord(field) || typeof field.id !== 'string') continue;

    const baseLabel = fieldLabel(field);
    pushRow(rows, {
      id: `${workflow.id}:field.${field.id}.label`,
      workflow_id: workflow.id,
      workflow_name: workflow.name,
      section: 'field',
      path: `field.${field.id}.label`,
      label: `Field label (${field.id})`,
      source_text: baseLabel,
      translations: buildTranslationsForOutput(field.label_i18n, enabledLanguages),
    });

    if (typeof field.placeholder === 'string') {
      pushRow(rows, {
        id: `${workflow.id}:field.${field.id}.placeholder`,
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        section: 'field',
        path: `field.${field.id}.placeholder`,
        label: `Placeholder (${field.id})`,
        source_text: field.placeholder,
        translations: buildTranslationsForOutput(field.placeholder_i18n, enabledLanguages),
      });
    }

    if (typeof field.help_text === 'string') {
      pushRow(rows, {
        id: `${workflow.id}:field.${field.id}.help_text`,
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        section: 'field',
        path: `field.${field.id}.help_text`,
        label: `Help text (${field.id})`,
        source_text: field.help_text,
        translations: buildTranslationsForOutput(field.help_text_i18n, enabledLanguages),
      });
    }

    const options = Array.isArray(field.options) ? field.options : [];
    options.forEach((option, optionIndex) => {
      pushRow(rows, {
        id: `${workflow.id}:field.${field.id}.option.${optionIndex}.label`,
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        section: 'option',
        path: `field.${field.id}.option.${optionIndex}.label`,
        label: `Option (${field.id} #${optionIndex + 1})`,
        source_text: optionLabel(option),
        translations: buildTranslationsForOutput(isObjectRecord(option) ? option.label_i18n : undefined, enabledLanguages),
      });
    });
  }

  const config = isObjectRecord(formStepConfig) ? formStepConfig : {};
  const formPages = Array.isArray(config.form_pages) ? config.form_pages : [];
  formPages.forEach((page: any, pageIndex: number) => {
    if (!isObjectRecord(page)) return;
    const pageId = typeof page.id === 'string' ? page.id : `page-${pageIndex}`;

    if (typeof page.title === 'string') {
      pushRow(rows, {
        id: `${workflow.id}:form_page.${pageId}.title`,
        workflow_id: workflow.id,
        workflow_name: workflow.name,
        section: 'form_page',
        path: `form_page.${pageId}.title`,
        label: `Page title (${pageId})`,
        source_text: page.title,
        translations: buildTranslationsForOutput(page.title_i18n, enabledLanguages),
      });
    }

    const blocks = Array.isArray(page.blocks) ? page.blocks : [];
    blocks.forEach((block: any, blockIndex: number) => {
      if (!isObjectRecord(block)) return;
      const blockId = typeof block.id === 'string' ? block.id : `block-${blockIndex}`;

      if (typeof block.title === 'string') {
        pushRow(rows, {
          id: `${workflow.id}:form_page.${pageId}.block.${blockId}.title`,
          workflow_id: workflow.id,
          workflow_name: workflow.name,
          section: 'form_block',
          path: `form_page.${pageId}.block.${blockId}.title`,
          label: `Block title (${pageId}/${blockId})`,
          source_text: block.title,
          translations: buildTranslationsForOutput(block.title_i18n, enabledLanguages),
        });
      }

      const columnNames = Array.isArray(block.column_names) ? block.column_names : [];
      const columnNameI18n = isObjectRecord(block.column_names_i18n) ? block.column_names_i18n : {};
      columnNames.forEach((columnName: unknown, columnIndex: number) => {
        if (typeof columnName !== 'string') return;
        pushRow(rows, {
          id: `${workflow.id}:form_page.${pageId}.block.${blockId}.column.${columnIndex}.name`,
          workflow_id: workflow.id,
          workflow_name: workflow.name,
          section: 'form_column',
          path: `form_page.${pageId}.block.${blockId}.column.${columnIndex}.name`,
          label: `Column name (${pageId}/${blockId} #${columnIndex + 1})`,
          source_text: columnName,
          translations: buildTranslationsForOutput(
            isObjectRecord(columnNameI18n[columnIndex]) ? columnNameI18n[columnIndex] : undefined,
            enabledLanguages,
          ),
        });
      });
    });
  });

  return rows;
}

function findFieldById(dataStructure: unknown, fieldId: string): any | null {
  const fields = toFieldArray(dataStructure);
  return fields.find((f: any) => isObjectRecord(f) && f.id === fieldId) ?? null;
}

function parsePortalTranslationPath(path: string): { type: string; match: RegExpMatchArray | null } {
  if (path === 'workflow.name') return { type: 'workflow_name', match: null };
  if (path === 'workflow.description') return { type: 'workflow_description', match: null };

  let match = path.match(/^field\.([^\.]+)\.(label|placeholder|help_text)$/);
  if (match) return { type: 'field_value', match };

  match = path.match(/^field\.([^\.]+)\.option\.(\d+)\.label$/);
  if (match) return { type: 'field_option', match };

  match = path.match(/^form_page\.([^\.]+)\.title$/);
  if (match) return { type: 'page_title', match };

  match = path.match(/^form_page\.([^\.]+)\.block\.([^\.]+)\.title$/);
  if (match) return { type: 'block_title', match };

  match = path.match(/^form_page\.([^\.]+)\.block\.([^\.]+)\.column\.(\d+)\.name$/);
  if (match) return { type: 'column_name', match };

  return { type: 'unknown', match: null };
}

function ensureColumnNameI18nStore(block: Record<string, unknown>): Record<string, unknown> {
  const raw = block.column_names_i18n;
  if (isObjectRecord(raw)) return raw;
  const created: Record<string, unknown> = {};
  block.column_names_i18n = created;
  return created;
}

function findPageAndBlock(config: Record<string, unknown>, pageId: string, blockId?: string): { page: any; block: any | null } {
  const pages = Array.isArray(config.form_pages) ? config.form_pages : [];
  const page = pages.find((p: any) => isObjectRecord(p) && p.id === pageId);
  if (!page) return { page: null, block: null };
  if (!blockId) return { page, block: null };
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const block = blocks.find((b: any) => isObjectRecord(b) && b.id === blockId) ?? null;
  return { page, block };
}

export function applyPortalTranslationUpdate(args: {
  workflowNameI18n: unknown;
  workflowDescriptionI18n: unknown;
  dataStructure: unknown;
  formStepConfig: unknown;
  path: string;
  language: PortalLanguage;
  value: string | null;
}): {
  workflowNameI18n: TranslationRecord;
  workflowDescriptionI18n: TranslationRecord;
  dataStructure: unknown;
  formStepConfig: unknown;
  applied: boolean;
} {
  const workflowNameI18n = toTranslationRecord(args.workflowNameI18n);
  const workflowDescriptionI18n = toTranslationRecord(args.workflowDescriptionI18n);
  const dataStructure = Array.isArray(args.dataStructure)
    ? [...args.dataStructure]
    : isObjectRecord(args.dataStructure)
      ? { ...args.dataStructure }
      : args.dataStructure;
  const config = isObjectRecord(args.formStepConfig) ? { ...args.formStepConfig } : {};

  const parsed = parsePortalTranslationPath(args.path);
  const value = typeof args.value === 'string' ? args.value.trim() : null;

  if (parsed.type === 'workflow_name') {
    return {
      workflowNameI18n: withTranslationValue(workflowNameI18n, args.language, value),
      workflowDescriptionI18n,
      dataStructure,
      formStepConfig: config,
      applied: true,
    };
  }

  if (parsed.type === 'workflow_description') {
    return {
      workflowNameI18n,
      workflowDescriptionI18n: withTranslationValue(workflowDescriptionI18n, args.language, value),
      dataStructure,
      formStepConfig: config,
      applied: true,
    };
  }

  if (parsed.type === 'field_value' && parsed.match) {
    const [, fieldId, target] = parsed.match;
    const field = findFieldById(dataStructure, fieldId);
    if (!field || !isObjectRecord(field)) {
      return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: false };
    }
    const key = `${target}_i18n`;
    field[key] = withTranslationValue(field[key], args.language, value);
    return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: true };
  }

  if (parsed.type === 'field_option' && parsed.match) {
    const [, fieldId, optionIndexRaw] = parsed.match;
    const optionIndex = Number(optionIndexRaw);
    const field = findFieldById(dataStructure, fieldId);
    if (!field || !isObjectRecord(field) || !Array.isArray(field.options) || Number.isNaN(optionIndex)) {
      return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: false };
    }
    const existingOption = field.options[optionIndex];
    if (existingOption === undefined) {
      return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: false };
    }

    if (typeof existingOption === 'string') {
      field.options[optionIndex] = {
        value: existingOption,
        label: existingOption,
        label_i18n: withTranslationValue(undefined, args.language, value),
      };
    } else if (isObjectRecord(existingOption)) {
      existingOption.label_i18n = withTranslationValue(existingOption.label_i18n, args.language, value);
    } else {
      return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: false };
    }

    return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: true };
  }

  if (parsed.type === 'page_title' && parsed.match) {
    const [, pageId] = parsed.match;
    const { page } = findPageAndBlock(config, pageId);
    if (!page || !isObjectRecord(page)) {
      return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: false };
    }
    page.title_i18n = withTranslationValue(page.title_i18n, args.language, value);
    return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: true };
  }

  if (parsed.type === 'block_title' && parsed.match) {
    const [, pageId, blockId] = parsed.match;
    const { block } = findPageAndBlock(config, pageId, blockId);
    if (!block || !isObjectRecord(block)) {
      return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: false };
    }
    block.title_i18n = withTranslationValue(block.title_i18n, args.language, value);
    return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: true };
  }

  if (parsed.type === 'column_name' && parsed.match) {
    const [, pageId, blockId, columnIndexRaw] = parsed.match;
    const columnIndex = Number(columnIndexRaw);
    if (Number.isNaN(columnIndex)) {
      return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: false };
    }
    const { block } = findPageAndBlock(config, pageId, blockId);
    if (!block || !isObjectRecord(block)) {
      return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: false };
    }
    const store = ensureColumnNameI18nStore(block);
    store[String(columnIndex)] = withTranslationValue(store[String(columnIndex)], args.language, value);
    return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: true };
  }

  return { workflowNameI18n, workflowDescriptionI18n, dataStructure, formStepConfig: config, applied: false };
}

export function localizeDataStructure(
  dataStructure: unknown,
  language: string,
  defaultLanguage: PortalLanguage,
): unknown {
  const applyFieldLocalization = (field: any): any => {
    if (!isObjectRecord(field)) return field;
    const localized: Record<string, unknown> = { ...field };

    const baseFieldLabel = typeof field.label === 'string' && field.label.trim()
      ? field.label
      : (typeof field.name === 'string' ? field.name : '');
    localized.label = resolveLocalizedText(baseFieldLabel, field.label_i18n, language, defaultLanguage);

    if (typeof field.placeholder === 'string' || field.placeholder_i18n) {
      localized.placeholder = resolveLocalizedText(field.placeholder ?? '', field.placeholder_i18n, language, defaultLanguage);
    }
    if (typeof field.help_text === 'string' || field.help_text_i18n) {
      localized.help_text = resolveLocalizedText(field.help_text ?? '', field.help_text_i18n, language, defaultLanguage);
    }

    if (Array.isArray(field.options)) {
      localized.options = field.options.map((option: any) => {
        const value = optionValue(option);
        const baseLabel = optionLabel(option);
        if (typeof option === 'string') {
          return {
            value,
            label: resolveLocalizedText(baseLabel, undefined, language, defaultLanguage),
          };
        }
        if (isObjectRecord(option)) {
          return {
            ...option,
            value,
            label: resolveLocalizedText(baseLabel, option.label_i18n, language, defaultLanguage),
          };
        }
        return option;
      });
    }

    return localized;
  };

  if (Array.isArray(dataStructure)) {
    return dataStructure.map((field) => applyFieldLocalization(field));
  }
  if (isObjectRecord(dataStructure)) {
    const localized = { ...dataStructure } as Record<string, unknown>;
    if (Array.isArray(localized.fields)) {
      localized.fields = localized.fields.map((field) => applyFieldLocalization(field));
    }
    return localized;
  }
  return dataStructure;
}

export function localizeFormStepConfig(
  config: unknown,
  language: string,
  defaultLanguage: PortalLanguage,
): unknown {
  if (!isObjectRecord(config)) return config;

  const localized = { ...config } as Record<string, unknown>;
  if (!Array.isArray(localized.form_pages)) return localized;

  localized.form_pages = localized.form_pages.map((page: any) => {
    if (!isObjectRecord(page)) return page;
    const localizedPage: Record<string, unknown> = { ...page };
    if (typeof page.title === 'string' || page.title_i18n) {
      localizedPage.title = resolveLocalizedText(page.title ?? '', page.title_i18n, language, defaultLanguage);
    }

    if (Array.isArray(page.blocks)) {
      localizedPage.blocks = page.blocks.map((block: any) => {
        if (!isObjectRecord(block)) return block;
        const localizedBlock: Record<string, unknown> = { ...block };
        if (typeof block.title === 'string' || block.title_i18n) {
          localizedBlock.title = resolveLocalizedText(block.title ?? '', block.title_i18n, language, defaultLanguage);
        }

        if (Array.isArray(block.column_names)) {
          const i18nByColumn = isObjectRecord(block.column_names_i18n) ? block.column_names_i18n : {};
          localizedBlock.column_names = block.column_names.map((name: unknown, index: number) => {
            const baseName = typeof name === 'string' ? name : '';
            const i18n = isObjectRecord(i18nByColumn[String(index)]) ? i18nByColumn[String(index)] : undefined;
            return resolveLocalizedText(baseName, i18n, language, defaultLanguage);
          });
        }
        return localizedBlock;
      });
    }

    return localizedPage;
  });

  return localized;
}
