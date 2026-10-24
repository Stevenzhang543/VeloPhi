/** 模板发现查询：按用户筛选条件查找内置模板并返回匹配结果。 */
import type { ProjectTemplateCategory, ProjectTemplateDescriptor, ProjectTemplateDifficulty } from './templates'

export interface TemplateDiscoveryFilters {
  category: ProjectTemplateCategory | 'all'
  difficulty: ProjectTemplateDifficulty | 'all'
  query: string
  sort: 'catalog' | 'name' | 'time' | 'newest'
  locale: string
}

/** Search every word in displayed and original metadata, without changing the catalog. */
/** 按分类、难度及本地化全文查询筛选模板，再按所选名称、设置时间或引入版本排序。 */ export function discoverTemplates(catalog: readonly ProjectTemplateDescriptor[], filters: TemplateDiscoveryFilters, display: (template: ProjectTemplateDescriptor) => string): ProjectTemplateDescriptor[] {
  const words = filters.query.toLocaleLowerCase(filters.locale).split(/\s+/u).filter(Boolean)
  const results = catalog.filter(/** 先匹配分类及难度，再要求每个查询词都出现在模板元信息或本地化显示文本中。 */ template => {
    if (filters.category !== 'all' && template.category !== filters.category) return false
    if (filters.difficulty !== 'all' && template.difficulty !== filters.difficulty) return false
    const searchable = `${template.id} ${template.name} ${template.description} ${template.features.join(' ')} ${template.tags.join(' ')} ${display(template)}`.toLocaleLowerCase(filters.locale)
    return words.every(/* 调用 searchable.includes(word) 并返回调用结果。 */ word => searchable.includes(word))
  })
  // 26.47: in catalog order the rhythm starters and labs come before the classic examples.
  if (filters.sort === 'catalog') results.sort((a, b) => Number(!!a.classic) - Number(!!b.classic))
  if (filters.sort === 'name') results.sort(/* 调用 display(a).localeCompare(display(b), filters.locale) 并返回调用结果。 */ (a, b) => display(a).localeCompare(display(b), filters.locale))
  if (filters.sort === 'time') results.sort(/* 计算表达式 a.setupMinutes - b.setupMinutes 并返回结果，沿用操作数的原有类型规则。 */ (a, b) => a.setupMinutes - b.setupMinutes)
  if (filters.sort === 'newest') results.sort(/* 调用 (b.introduced ?? '').localeCompare(a.introduced ?? '', undefined, { numeric: true }) 并返回调用结果。 */ (a, b) => (b.introduced ?? '').localeCompare(a.introduced ?? '', undefined, { numeric: true }))
  return results
}
