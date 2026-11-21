<script setup lang="ts">
// Settings › Specs: what the app does, feature by feature, and what it doesn't do yet
// (utils/specs.ts), filtered by status.
import { keysText } from '~/utils/platform-keys'
import { SPEC_GROUPS } from '~/utils/specs'

useHead({ title: 'Specs' })

type Filter = 'all' | 'available' | 'later'

const filter = ref<Filter>('all')
const all = SPEC_GROUPS.flatMap((group) => group.features)
const filters = [
  { value: 'all', label: `All · ${all.length}` },
  { value: 'available', label: `Available · ${all.filter((f) => !f.later).length}` },
  { value: 'later', label: `Not yet · ${all.filter((f) => f.later).length}` },
]

const groups = computed(() =>
  SPEC_GROUPS.map((group) => ({
    id: group.id,
    icon: group.icon,
    title: group.title,
    features: group.features.filter((feature) =>
      filter.value === 'all' ? true : filter.value === 'later' ? feature.later : !feature.later,
    ),
  })).filter((group) => group.features.length),
)
</script>

<template>
  <div class="space-y-10" data-testid="specs">
    <div class="space-y-4">
      <p class="text-sm text-muted">
        Everything Tandem does, in a few words, and what it doesn’t do yet. Features marked Optional
        are turned on or off in Settings › Features.
      </p>
      <UTabs
        v-model="filter"
        :items="filters"
        :content="false"
        size="sm"
        aria-label="Show features"
      />
    </div>

    <section v-for="group in groups" :key="group.id" :aria-labelledby="`specs-${group.id}`">
      <div class="mb-3 flex items-center gap-2 border-b border-default pb-2">
        <UIcon :name="group.icon" class="size-4 shrink-0 text-primary" />
        <h2 :id="`specs-${group.id}`" class="text-base font-semibold text-highlighted">
          {{ group.title }}
        </h2>
      </div>
      <ul class="space-y-3">
        <li
          v-for="feature in group.features"
          :key="feature.title"
          class="text-sm"
          data-testid="spec"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium" :class="feature.later ? 'text-muted' : 'text-highlighted'">{{
              feature.title
            }}</span>
            <UBadge v-if="feature.later" label="Not yet" color="neutral" variant="soft" size="sm" />
            <UBadge
              v-if="feature.optional"
              label="Optional"
              color="primary"
              variant="soft"
              size="sm"
            />
          </div>
          <p :class="feature.later ? 'text-dimmed' : 'text-muted'">
            {{ keysText(feature.description) }}
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
