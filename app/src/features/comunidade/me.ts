/* Quem está usando o app, do jeito que a API descreve (Me). A conta mora em state/auth.ts. */
import type { Me } from "../../api/types";
import { useAuth } from "../../state/auth";

export const useMe = () => useAuth((s) => s.user);
export const saveMe = (patch: Partial<Me>) => useAuth.getState().saveMe(patch);
