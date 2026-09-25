import { describe, it, expect } from "vitest";
import { ref } from "vue";
import { usePagination } from "../usePagination";

describe("usePagination", () => {
  it("slices items into pages of the given size", () => {
    const items = ref(Array.from({ length: 25 }, (_, i) => i));
    const { paged, totalPages } = usePagination(items, 10);

    expect(totalPages.value).toBe(3);
    expect(paged.value).toEqual(items.value.slice(0, 10));
  });

  it("defaults to 12 items per page", () => {
    const items = ref(Array.from({ length: 30 }, (_, i) => i));
    const { paged, totalPages } = usePagination(items);

    expect(totalPages.value).toBe(3);
    expect(paged.value).toHaveLength(12);
  });

  it("always reports at least 1 total page, even when empty", () => {
    const items = ref<number[]>([]);
    const { totalPages, paged } = usePagination(items, 10);

    expect(totalPages.value).toBe(1);
    expect(paged.value).toEqual([]);
  });

  it("goTo moves to the requested page and updates the slice", () => {
    const items = ref(Array.from({ length: 25 }, (_, i) => i));
    const { page, paged, goTo } = usePagination(items, 10);

    goTo(2);

    expect(page.value).toBe(2);
    expect(paged.value).toEqual(items.value.slice(10, 20));
  });

  it("goTo clamps below the first page", () => {
    const items = ref(Array.from({ length: 25 }, (_, i) => i));
    const { page, goTo } = usePagination(items, 10);

    goTo(-5);

    expect(page.value).toBe(1);
  });

  it("goTo clamps above the last page", () => {
    const items = ref(Array.from({ length: 25 }, (_, i) => i));
    const { page, goTo } = usePagination(items, 10);

    goTo(999);

    expect(page.value).toBe(3);
  });

  it("reset returns to page 1", () => {
    const items = ref(Array.from({ length: 25 }, (_, i) => i));
    const { page, goTo, reset } = usePagination(items, 10);

    goTo(3);
    reset();

    expect(page.value).toBe(1);
  });

  it("tracks the source ref reactively as items change", () => {
    const items = ref(Array.from({ length: 5 }, (_, i) => i));
    const { totalPages, paged } = usePagination(items, 10);

    expect(totalPages.value).toBe(1);

    items.value = Array.from({ length: 15 }, (_, i) => i);

    expect(totalPages.value).toBe(2);
    expect(paged.value).toEqual(items.value.slice(0, 10));
  });
});

describe("usePagination with an external page ref", () => {
  it("reads and writes the page through the ref", () => {
    const items = ref(Array.from({ length: 25 }, (_, i) => i));
    const pageRef = ref(2);
    const { page, paged, goTo } = usePagination(items, 10, pageRef);
    expect(page.value).toBe(2);
    expect(paged.value[0]).toBe(10);
    goTo(3);
    expect(pageRef.value).toBe(3);
  });

  it("clamps an out-of-range page to the last page that exists", () => {
    const items = ref(Array.from({ length: 25 }, (_, i) => i));
    const { page, paged } = usePagination(items, 10, ref(9));
    expect(page.value).toBe(3);
    expect(paged.value).toEqual([20, 21, 22, 23, 24]);

    items.value = items.value.slice(0, 5);
    expect(page.value).toBe(1);
  });
});
