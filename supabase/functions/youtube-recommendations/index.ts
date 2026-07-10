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

const MAX_RESULTS = 6;

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
      maxResults: String(MAX_RESULTS),
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

    return jsonResponse({ videos });
  } catch (error) {
    console.error(error);
    // Soft-fail here too — see file header.
    return jsonResponse({ videos: [] as YoutubeVideo[] });
  }
});
