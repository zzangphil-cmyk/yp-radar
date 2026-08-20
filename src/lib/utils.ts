import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn 규약 헬퍼 — mapcn/mapcn-kr 컴포넌트가 @/lib/utils의 cn을 참조한다.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
