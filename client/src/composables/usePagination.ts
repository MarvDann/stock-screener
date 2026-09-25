import { ref, computed, type Ref } from "vue";

/**
 * Pages over `items`. Pass `pageRef` to keep the page somewhere else, e.g.
 * in the URL; the page shown is clamped to the pages that exist, so a stale
 * page number (from a link, or after the list shrinks) lands on the last page.
 */
export function usePagination<T>(items: Ref<T[]>, perPage = 12, pageRef: Ref<number> = ref(1)) {
  const totalPages = computed(() => Math.max(1, Math.ceil(items.value.length / perPage)));

  const page = computed(() => Math.min(Math.max(1, pageRef.value), totalPages.value));

  const paged = computed(() => {
    const start = (page.value - 1) * perPage;
    return items.value.slice(start, start + perPage);
  });

  function goTo(p: number) {
    pageRef.value = Math.max(1, Math.min(p, totalPages.value));
  }

  function reset() {
    pageRef.value = 1;
  }

  return { page, totalPages, paged, goTo, reset };
}
