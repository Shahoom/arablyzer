import type { PageFacts } from '@arablyzer/collectors'
import {
  entries,
  isEmpty,
  isObject,
  objects,
  objectsIn,
  parsedBlocks,
  placeProblems,
  shown,
  typesOf,
  type JsonObject,
  type Located,
  type Problem,
} from '../../lib/jsonld-objects'
import { defineRule, type DetectorFinding } from '../../rule'

const MESSAGES = [
  'no-items',
  'bad-position',
  'position-order',
  'no-name',
  'no-item',
  'item-relative',
] as const
type Message = (typeof MESSAGES)[number]

/**
 * M6.1: a breadcrumb's markup as Google asks: a list of items, each with a `position` written in
 * digits 0–9 and running 1, 2, 3, a `name`, and an `item` address that is a full one, except
 * the last, which may leave it out (it is the page itself). The page's own trail in the markup, not
 * the one it shows.
 */
export const rule = defineRule({
  id: 'breadcrumb-schema-invalid',
  version: '1.0.0',
  category: 'schema',
  severity: 'moderate',
  needs: ['html'],
  messages: MESSAGES,
  appliesTo: (page) => lists(page).length > 0,
  detect: ({ page }) =>
    placeProblems(lists(page).flatMap(problemsOf)).map(
      (finding): DetectorFinding<Message> => finding,
    ),
})

function lists(page: PageFacts): Located<JsonObject>[] {
  return [...objectsIn(parsedBlocks(page))].filter((object) =>
    typesOf(object.value).includes('BreadcrumbList'),
  )
}

function problemsOf(list: Located<JsonObject>): Problem<Message>[] {
  const items = objects(entries(list, 'itemListElement'))
  if (items.length === 0) return [{ message: 'no-items', at: list, values: {} }]
  const problems: Problem<Message>[] = []
  const positions: (number | null)[] = []
  items.forEach((item, index) => {
    const position = entries(item, 'position').find((entry) => !isEmpty(entry.value))
    const parsed =
      typeof position?.value === 'number'
        ? position.value
        : typeof position?.value === 'string' && /^\d+$/.test(position.value.trim())
          ? Number(position.value.trim())
          : null
    positions.push(Number.isInteger(parsed) && (parsed ?? 0) >= 1 ? parsed : null)
    if (parsed === null || !Number.isInteger(parsed) || parsed < 1) {
      problems.push({
        message: 'bad-position',
        at: position ?? item,
        values: { value: position === undefined ? '' : shown(position.value) },
      })
    }
    const target = entries(item, 'item').find((entry) => !isEmpty(entry.value))
    const targetObject = target !== undefined && isObject(target.value) ? target.value : null
    const hasName =
      entries(item, 'name').some((entry) => !isEmpty(entry.value)) ||
      (targetObject !== null && !isEmpty(targetObject.name ?? null))
    if (!hasName) problems.push({ message: 'no-name', at: item, values: {} })
    const address =
      typeof target?.value === 'string'
        ? target.value.trim()
        : targetObject !== null && typeof targetObject['@id'] === 'string'
          ? targetObject['@id'].trim()
          : ''
    if (address === '') {
      if (index < items.length - 1) problems.push({ message: 'no-item', at: item, values: {} })
    } else if (!/^[a-z][a-z0-9+.-]*:/i.test(address)) {
      problems.push({
        message: 'item-relative',
        at: target ?? item,
        values: { item: shown(address) },
      })
    }
  })
  const numbers = positions.filter((value): value is number => value !== null)
  if (numbers.length === items.length && numbers.some((value, index) => value !== index + 1)) {
    problems.push({
      message: 'position-order',
      at: list,
      values: { positions: numbers.join(', ') },
    })
  }
  return problems
}
