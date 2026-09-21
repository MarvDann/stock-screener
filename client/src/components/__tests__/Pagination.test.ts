import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Pagination from "../Pagination.vue";

describe("Pagination", () => {
  it("renders nothing when there is only one page", () => {
    const wrapper = mount(Pagination, { props: { page: 1, totalPages: 1 } });
    expect(wrapper.find(".pagination").exists()).toBe(false);
  });

  it("shows the current page and total pages", () => {
    const wrapper = mount(Pagination, { props: { page: 2, totalPages: 5 } });
    expect(wrapper.find(".page-info").text()).toBe("2 / 5");
  });

  it("disables Prev on the first page and Next on the last page", () => {
    const first = mount(Pagination, { props: { page: 1, totalPages: 3 } });
    const buttons = first.findAll("button");
    expect(buttons[0].attributes("disabled")).toBeDefined();
    expect(buttons[1].attributes("disabled")).toBeUndefined();

    const last = mount(Pagination, { props: { page: 3, totalPages: 3 } });
    const lastButtons = last.findAll("button");
    expect(lastButtons[0].attributes("disabled")).toBeUndefined();
    expect(lastButtons[1].attributes("disabled")).toBeDefined();
  });

  it("emits update:page with the previous page number", async () => {
    const wrapper = mount(Pagination, { props: { page: 2, totalPages: 3 } });
    await wrapper.findAll("button")[0].trigger("click");
    expect(wrapper.emitted("update:page")).toEqual([[1]]);
  });

  it("emits update:page with the next page number", async () => {
    const wrapper = mount(Pagination, { props: { page: 2, totalPages: 3 } });
    await wrapper.findAll("button")[1].trigger("click");
    expect(wrapper.emitted("update:page")).toEqual([[3]]);
  });

  it("does not emit when clicking a disabled button", async () => {
    const wrapper = mount(Pagination, { props: { page: 1, totalPages: 3 } });
    await wrapper.findAll("button")[0].trigger("click");
    expect(wrapper.emitted("update:page")).toBeUndefined();
  });
});
