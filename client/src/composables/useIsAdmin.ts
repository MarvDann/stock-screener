import { onMounted, ref, type Ref } from "vue";
import { getSessionUser } from "../auth";

/** Whether the signed-in user is an admin; false until the (cached) session lookup answers. */
export function useIsAdmin(): Ref<boolean> {
  const isAdmin = ref(false);
  onMounted(async () => {
    isAdmin.value = (await getSessionUser())?.isAdmin ?? false;
  });
  return isAdmin;
}
