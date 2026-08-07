// Recommends YouTube videos for a piece of study material — the study
// page sends a short query (course title + a couple of topic tags) and
// gets back a handful of relevant videos to embed as "watch next."
//
// Env var used: YOUTUBE_API_KEY — a YouTube Data API v3 key. Set it in
// Supabase (Project Settings → Edge Functions → Secrets, or via Lovable
// Cloud → the same secrets panel LOVABLE_API_KEY already lives in).
//
// Deliberately fails SOFT: if the key isn't set, the API errors, or the
// query is empty, this returns { videos: [] } rather than an error — the
// front end just hides the "recommended videos" section in that case,
// since this is a nice-to-have, not something that should ever block or
// visibly break the study page.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RAW_RESULTS = 10;
const MAX_RESULTS = 6;

// Words the query-builder itself adds for academic framing ("university
// lecture explained") or that are near-meaningless as a search signal on
// their own. Scoring on these would let a video match just by having
// "tutorial" in the title regardless of subject, which defeats the point.
const SCAFFOLD_WORDS = new Set([
  "university", "lecture", "explained", "tutorial", "example", "examples",
  "demonstration", "experiment", "animation", "derivation", "solution",
  "worked", "formula", "programming", "code", "real", "world", "past", "paper",
]);
const STOPWORDS = new Set(["a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "is", "are", "with", "by", "from"]);

function significantTerms(query: string): string[] {
  return [...new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !SCAFFOLD_WORDS.has(w)),
  )];
}

function scoreVideo(video: { title: string; channelTitle: string }, terms: string[]): number {
  const title = video.title.toLowerCase();
  const channel = video.channelTitle.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 1;
    else if (channel.includes(term)) score += 0.5;
  }
  return score;
}

type YoutubeVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) {
    // Not configured yet — quietly return no videos rather than an error.
    return jsonResponse({ videos: [] as YoutubeVideo[] });
  }

  try {
    const body = await req.json();
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) return jsonResponse({ videos: [] as YoutubeVideo[] });

    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: String(RAW_RESULTS),
      safeSearch: "strict",
      relevanceLanguage: "en",
      q: query,
      key: apiKey,
    });

    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
    if (!res.ok) {
      console.error("YouTube API error", res.status, await res.text());
      return jsonResponse({ videos: [] as YoutubeVideo[] });
    }

    const data = await res.json();
    const videos: YoutubeVideo[] = (data.items ?? [])
      .filter((item: any) => item?.id?.videoId)
      .map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet?.title ?? "Untitled",
        channelTitle: item.snippet?.channelTitle ?? "",
        thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
      }));

    // YouTube's own relevance ranking for a short, scoped query still
    // regularly surfaces something that only shares one loose keyword
    // with the material (a video about derivatives in general for a
    // query built around one slide mentioning "slope"). Re-rank by how
    // many of the query's real (non-scaffolding) terms actually show up
    // in the title/channel, and drop anything that matches none of them
    // — a shorter, on-topic list beats a full one padded with noise.
    const terms = significantTerms(query);
    let ranked = videos;
    if (terms.length > 0) {
      const scored = videos.map((v) => ({ v, score: scoreVideo(v, terms) }));
      const anyMatch = scored.some((s) => s.score > 0);
      ranked = anyMatch
        ? scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.v)
        : []; // Nothing matched anything real — better to show no section than a wrong one.
    }

    return jsonResponse({ videos: ranked.slice(0, MAX_RESULTS) });
  } catch (error) {
    console.error(error);
    // Soft-fail here too — see file header.
    return jsonResponse({ videos: [] as YoutubeVideo[] });
  }
});
