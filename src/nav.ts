import { createNavigationContainerRef } from "@react-navigation/native";
import { RootStackParamList } from "./nav-types";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function go<Name extends keyof RootStackParamList>(
  nav: { getParent?: () => unknown; navigate: (...args: never[]) => void },
  name: Name,
  params?: RootStackParamList[Name]
) {
  const parent = nav.getParent?.() as { navigate?: (n: string, p?: unknown) => void } | undefined;
  if (parent?.navigate) {
    parent.navigate(name, params);
    return;
  }
  (nav.navigate as (n: string, p?: unknown) => void)(name, params);
}
