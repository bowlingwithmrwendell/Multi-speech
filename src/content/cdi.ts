// Spec §2.2 Vocabulary Acquisition Mapping — MacArthur-Bates CDI semantic categories.
// Module lexical targets carry `cdi_category`; this is the fallback lookup and the
// canonical category list used by the dashboard.
import type { ContentModule } from '../types';

export const CDI_CATEGORIES = [
  'Sounds',
  'Animals',
  'Vehicles',
  'Toys',
  'Food and Drink',
  'Clothing',
  'Body Parts',
  'Household Items',
  'Furniture and Rooms',
  'Outside Things',
  'Places to Go',
  'People',
  'Games and Routines',
  'Action Words',
  'Descriptive Words',
  'Time Words',
  'Pronouns',
  'Question Words',
  'Locations',
  'Quantifiers',
] as const;

export function buildCdiLookup(modules: ContentModule[]): (lemma: string) => string {
  const map = new Map<string, string>();
  for (const m of modules) for (const t of m.lexical_targets) if (t.cdi_category) map.set(t.lemma, t.cdi_category);
  return (lemma) => map.get(lemma) ?? 'Uncategorized';
}
