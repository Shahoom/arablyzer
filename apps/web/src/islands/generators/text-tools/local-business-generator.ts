import { localBusiness, BUSINESS_TYPES, COUNTRIES } from '@arablyzer/generators'
import { TEXT_TOOLS_UI } from '@arablyzer/i18n/text-tools'
import type { Block, TextToolSpec } from './spec'

/** The local business generator (M10.2): a LocalBusiness block for a Gulf business. */
export const spec: TextToolSpec = {
  kind: 'generator',
  fields: (lang) => {
    const t = TEXT_TOOLS_UI[lang].business
    return [
      {
        name: 'type',
        kind: 'select',
        label: t.type,
        options: BUSINESS_TYPES.map((value) => ({ value, label: t.types[value] })),
      },
      { name: 'nameAr', kind: 'text', label: t.nameAr, required: false },
      { name: 'nameEn', kind: 'text', label: t.nameEn, dir: 'ltr', required: false },
      {
        name: 'country',
        kind: 'select',
        label: t.country,
        options: (Object.keys(COUNTRIES) as (keyof typeof COUNTRIES)[]).map((value) => ({
          value,
          label: t.countries[value],
        })),
      },
      { name: 'city', kind: 'text', label: t.city, required: false },
      { name: 'street', kind: 'text', label: t.street, required: false },
      { name: 'postalCode', kind: 'text', label: t.postalCode, dir: 'ltr', required: false },
      {
        name: 'telephone',
        kind: 'text',
        label: t.telephone,
        hint: t.telephoneHint,
        dir: 'ltr',
        required: false,
      },
      {
        name: 'url',
        kind: 'text',
        label: t.url,
        dir: 'ltr',
        required: false,
        placeholder: 'https://example.com/',
      },
      {
        name: 'image',
        kind: 'text',
        label: t.image,
        dir: 'ltr',
        required: false,
        placeholder: 'https://example.com/shop.jpg',
      },
      {
        name: 'hours',
        kind: 'textarea',
        rows: 3,
        label: t.hours,
        hint: t.hoursHint,
        required: false,
        placeholder: 'السبت-الخميس 09:00-21:00',
      },
      { name: 'latitude', kind: 'text', label: t.latitude, dir: 'ltr', required: false },
      { name: 'longitude', kind: 'text', label: t.longitude, dir: 'ltr', required: false },
    ]
  },
  submit: (lang) => TEXT_TOOLS_UI[lang].business.submit,
  run: (values, lang) => {
    const t = TEXT_TOOLS_UI[lang].business
    const result = localBusiness({
      type: values.type ?? '',
      nameAr: values.nameAr ?? '',
      nameEn: values.nameEn ?? '',
      country: values.country ?? '',
      city: values.city ?? '',
      street: values.street ?? '',
      postalCode: values.postalCode ?? '',
      telephone: values.telephone ?? '',
      url: values.url ?? '',
      image: values.image ?? '',
      hours: values.hours ?? '',
      latitude: values.latitude ?? '',
      longitude: values.longitude ?? '',
    })
    if (result.problems.some(({ problem }) => problem === 'name-blank')) return { error: t.empty }
    const blocks: Block[] = [
      { kind: 'code', label: t.block, text: result.jsonLd },
      {
        kind: 'notes',
        items: [
          ...(result.problems.length === 0 ? [{ tone: 'ok' as const, text: t.ok }] : []),
          ...result.problems.map(({ problem, input }) => ({
            tone: 'warn' as const,
            text: t.problems[problem](input),
          })),
          { tone: 'info', text: t.where },
        ],
      },
    ]
    return { blocks }
  },
}
