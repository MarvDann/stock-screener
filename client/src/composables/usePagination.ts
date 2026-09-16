import { ref, computed, Ref } from "vue";

export function usePagination<T>(items: Ref<T[]>, perPage = 12) {
  const page = ref(1);

  const totalPages = computed(() => Math.max(1, Math.ceil(items.value.length / perPage)));

  const paged = computed(() => {
    const start = (page.value - 1) * perPage;
    return items.value.slice(start, start + perPage);
  });

  function goTo(p: number) {
    page.value = Math.max(1, Math.min(p, totalPages.value));
  }

  function reset() {
    page.value = 1;
  }

  return { page, totalPages, paged, goTo, reset };
}
