import {
  applyPortalTranslationUpdate,
  collectPortalTranslationRows,
  localizeDataStructure,
  localizeFormStepConfig,
  normalizePortalDefaultLanguage,
  normalizePortalLanguages,
} from '../services/portalTranslation.service';

describe('portalTranslation.service', () => {
  it('normalizes enabled and default languages safely', () => {
    const enabled = normalizePortalLanguages(['fr', 'de']);
    const defaultLang = normalizePortalDefaultLanguage('es', enabled);

    expect(enabled).toEqual(['en', 'fr', 'de']);
    expect(defaultLang).toBe('en');
  });

  it('collects rows for workflow, fields, options and page config', () => {
    const rows = collectPortalTranslationRows({
      workflow: {
        id: 'wf-1',
        name: 'Request form',
        description: 'Submit your request',
        name_i18n: { fr: 'Formulaire de demande' },
        description_i18n: { fr: 'Soumettez votre demande' },
        data_structure: [
          {
            id: 'f-name',
            name: 'Name',
            placeholder: 'Enter your name',
            options: ['A', 'B'],
          },
        ],
      },
      formStepConfig: {
        form_pages: [
          {
            id: 'p-1',
            title: 'Main page',
            blocks: [
              {
                id: 'b-1',
                title: 'Section A',
                column_names: ['Left'],
              },
            ],
          },
        ],
      },
      enabledLanguages: ['en', 'fr'],
    });

    expect(rows.some((r) => r.path === 'workflow.name')).toBe(true);
    expect(rows.some((r) => r.path === 'field.f-name.label')).toBe(true);
    expect(rows.some((r) => r.path === 'field.f-name.option.0.label')).toBe(true);
    expect(rows.some((r) => r.path === 'form_page.p-1.title')).toBe(true);
    expect(rows.some((r) => r.path === 'form_page.p-1.block.b-1.column.0.name')).toBe(true);
  });

  it('applies option translation on legacy string options', () => {
    const result = applyPortalTranslationUpdate({
      workflowNameI18n: {},
      workflowDescriptionI18n: {},
      dataStructure: [
        {
          id: 'f-option',
          name: 'Choice',
          options: ['Yes'],
        },
      ],
      formStepConfig: {},
      path: 'field.f-option.option.0.label',
      language: 'fr',
      value: 'Oui',
    });

    const field = (result.dataStructure as any[])[0];
    expect(field.options[0]).toEqual({
      value: 'Yes',
      label: 'Yes',
      label_i18n: { fr: 'Oui' },
    });
  });

  it('localizes field labels and options', () => {
    const localized = localizeDataStructure(
      [
        {
          id: 'f-1',
          name: 'Status',
          label_i18n: { fr: 'Statut' },
          options: [{ value: 'approved', label: 'Approved', label_i18n: { fr: 'Approuvé' } }],
        },
      ],
      'fr',
      'en',
    ) as any[];

    expect(localized[0].label).toBe('Statut');
    expect(localized[0].options[0].value).toBe('approved');
    expect(localized[0].options[0].label).toBe('Approuvé');
  });

  it('localizes form pages, blocks and column names', () => {
    const localized = localizeFormStepConfig(
      {
        form_pages: [
          {
            id: 'p-1',
            title: 'Main',
            title_i18n: { fr: 'Principal' },
            blocks: [
              {
                id: 'b-1',
                title: 'Block',
                title_i18n: { fr: 'Bloc' },
                column_names: ['Left'],
                column_names_i18n: { '0': { fr: 'Gauche' } },
              },
            ],
          },
        ],
      },
      'fr',
      'en',
    ) as any;

    expect(localized.form_pages[0].title).toBe('Principal');
    expect(localized.form_pages[0].blocks[0].title).toBe('Bloc');
    expect(localized.form_pages[0].blocks[0].column_names[0]).toBe('Gauche');
  });
});
