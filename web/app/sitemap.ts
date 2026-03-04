import type { MetadataRoute } from "next";
import { COMMUNITY_BOARD_GROUPS } from "@/lib/data";
import { ENABLE_CPA, ENABLE_TRANSFER } from "@/lib/featureFlags";
import { getSiteUrl } from "@/lib/siteUrl";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  const sitemapEntries: MetadataRoute.Sitemap = allRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: route === "/" ? 1 : route.startsWith("/transfer") ? 0.9 : 0.7,
  }));

  try {
    const supabase = getSupabaseAdmin();
    const { data: recentPosts } = await supabase
      .from("posts")
      .select("id, created_at, boards!inner(slug, exams!inner(slug))")
      .order("created_at", { ascending: false })
      .limit(500);

    if (recentPosts) {
      recentPosts.forEach((post: any) => {
        const examSlug = post.boards?.exams?.slug;
        const boardSlug = post.boards?.slug;
        if (examSlug && boardSlug) {
          if (examSlug === "cpa" && !ENABLE_CPA) return;
          if (examSlug === "transfer" && !ENABLE_TRANSFER) return;

          sitemapEntries.push({
            url: `${siteUrl}/c/${examSlug}/${boardSlug}/${post.id}`,
            lastModified: post.created_at ? new Date(post.created_at) : now,
            changeFrequency: "weekly",
            priority: 0.6,
          });
        }
      });
    }
  } catch (error) {
    console.error("Failed to fetch posts for sitemap", error);
  }

  return sitemapEntries;
}
