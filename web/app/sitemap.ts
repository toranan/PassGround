import type { MetadataRoute } from "next";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_TRANSFER } from "@/lib/featureFlags";
import { getSiteUrl } from "@/lib/siteUrl";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const staticRoutes = ["/", "/community", "/transfer", "/community/transfer"];
  if (ENABLE_TRANSFER) {
    staticRoutes.push("/verification", "/mypage", "/points");
  }
  if (ENABLE_CPA) {
    staticRoutes.push("/cpa", "/community/cpa");
  }

  const boardRoutes = COMMUNITY_BOARD_GROUPS.filter((group) => {
    if (group.examSlug === "cpa") return ENABLE_CPA;
    if (group.examSlug === "transfer") return ENABLE_TRANSFER;
    return false;
  }).flatMap((group) => group.boards.map((board) => `/c/${group.examSlug}/${board.slug}`));

  const allRoutes = Array.from(new Set([...staticRoutes, ...boardRoutes]));

  return allRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: route === "/" ? 1 : route.startsWith("/transfer") ? 0.9 : 0.7,
  }));
}
