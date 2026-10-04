import { defineRule, type DetectorFinding } from '../../rule'

type Message = 'known'

/**
 * Information alone: whether Google's Knowledge Graph knows the site's brand, by the name the
 * page gives (its Organization or WebSite JSON-LD, `og:site_name` or its title), asked in Arabic and
 * English. A finding names the entity, its types, its description and its Wikipedia article.
 * A brand Google does not know has no finding, and the report's facts say so. Never deducted:
 * most sites are not in the Knowledge Graph, and having no entity is not a fault. It needs a key; without one, or for a page that gives no
 * name, the rule does not apply.
 */
export const rule = defineRule({
  id: 'knowledge-graph-entity',
  version: '1.0.0',
  category: 'trust',
  severity: 'info',
  needs: ['knowledge-graph'],
  messages: ['known'],
  appliesTo: (_page, evidence) =>
    evidence?.knowledgeGraph !== undefined && evidence.knowledgeGraph.outcome !== 'no-name',
  detect: ({ knowledgeGraph }): DetectorFinding<Message>[] => {
    if (knowledgeGraph === undefined) return []
    const brand = knowledgeGraph.brand ?? ''
    return knowledgeGraph.entities.map((entity) => ({
      message: 'known',
      values: {
        brand,
        name: entity.name,
        lang: entity.lang,
        types: entity.types.join(', '),
        description: entity.description ?? '',
        wikipedia: entity.wikipediaUrl ?? '',
      },
      key: entity.lang,
    }))
  },
})
