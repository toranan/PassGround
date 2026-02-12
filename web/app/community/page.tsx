import { redirect } from "next/navigation";
import { ENABLE_TRANSFER } from "@/lib/featureFlags";

export default function CommunityPage() {
  if (ENABLE_TRANSFER) {
    redirect("/community/transfer");
  }
  redirect("/community/cpa");
}
