import { createHash } from "node:crypto";

import { load } from "cheerio";
import Parser from "rss-parser";

import type { PinterestImportItem } from "@/types/pinterest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_FEED_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const PINTEREST_HOST = "pinterest.com";
const PINTEREST_IMAGE_HOST = "i.pinimg.com";

const parser = new Parser<Record<string, never>, PinterestFeedFields>({
  customFields: {
    item: ["description", ["content:encoded", "contentEncoded"]],
  },
});

interface PinterestFeedFields {
  description?: string;
  contentEncoded?: string;
}

class RouteError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

function isPinterestHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return (
    normalizedHostname === PINTEREST_HOST ||
    normalizedHostname.endsWith(`.${PINTEREST_HOST}`)
  );
}

function normalizeBoardUrl(input: string): URL {
  let candidate: URL;

  try {
    candidate = new URL(input.trim());
  } catch {
    throw new RouteError(400, "Enter a valid Pinterest board URL.");
  }

  if (
    !["http:", "https:"].includes(candidate.protocol) ||
    !isPinterestHost(candidate.hostname)
  ) {
    throw new RouteError(400, "Only Pinterest board URLs are supported.");
  }

  if (candidate.username || candidate.password || candidate.port) {
    throw new RouteError(400, "Enter a standard Pinterest board URL.");
  }

  const pathnameWithoutFeedSuffix = candidate.pathname
    .replace(/\/+$/, "")
    .replace(/\.rss$/i, "");
  const encodedSegments = pathnameWithoutFeedSuffix.split("/").filter(Boolean);

  if (encodedSegments.length !== 2) {
    throw new RouteError(
      400,
      "Use a full Pinterest board URL, for example pinterest.com/user/board.",
    );
  }

  let segments: string[];
  try {
    segments = encodedSegments.map((segment) => decodeURIComponent(segment));
  } catch {
    throw new RouteError(400, "The Pinterest board URL is malformed.");
  }

  const [profileSegment, boardSegment] = segments;
  const reservedRoutes = new Set([
    "business",
    "explore",
    "ideas",
    "join",
    "login",
    "pin",
    "search",
    "settings",
    "today",
  ]);

  if (
    !profileSegment ||
    !boardSegment ||
    reservedRoutes.has(profileSegment.toLowerCase()) ||
    segments.some((segment) => segment.includes("/") || segment.includes("\\"))
  ) {
    throw new RouteError(400, "That URL does not look like a Pinterest board.");
  }

  candidate.protocol = "https:";
  candidate.hash = "";
  candidate.search = "";
  candidate.pathname = `${pathnameWithoutFeedSuffix}.rss`;

  return candidate;
}

function assertSafePinterestUrl(url: URL): void {
  if (
    url.protocol !== "https:" ||
    !isPinterestHost(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new RouteError(502, "Pinterest returned an unsafe redirect.");
  }
}

async function fetchWithSafeRedirects(
  initialUrl: URL,
  signal: AbortSignal,
): Promise<Response> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    assertSafePinterestUrl(currentUrl);

    const response = await fetch(currentUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        "User-Agent":
          "Mozilla/5.0 (compatible; DigitalClosetPinterestImporter/1.0)",
      },
      redirect: "manual",
      signal,
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new RouteError(502, "Pinterest returned an invalid redirect.");
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new RouteError(502, "Pinterest redirected too many times.");
    }

    currentUrl = new URL(location, currentUrl);
  }

  throw new RouteError(502, "Pinterest redirected too many times.");
}

async function readResponseWithLimit(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
    throw new RouteError(502, "The Pinterest feed is too large to import safely.");
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    bytesRead += value.byteLength;
    if (bytesRead > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new RouteError(502, "The Pinterest feed is too large to import safely.");
    }

    result += decoder.decode(value, { stream: true });
  }

  return result + decoder.decode();
}

function toPinterestImageUrl(candidate: string | undefined): string | null {
  if (!candidate) return null;

  try {
    const url = new URL(candidate, "https://www.pinterest.com");
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== PINTEREST_IMAGE_HOST) {
      return null;
    }

    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function extractImageFromHtml(html: string | undefined): string | null {
  if (!html) return null;

  const findImage = (markup: string): string | null => {
    const $ = load(markup);
    for (const image of $("img").toArray()) {
      const imageUrl =
        toPinterestImageUrl($(image).attr("src")) ??
        toPinterestImageUrl($(image).attr("data-src"));
      if (imageUrl) return imageUrl;
    }

    return null;
  };

  const directImage = findImage(html);
  if (directImage) return directImage;

  // Some feeds encode their HTML twice. Cheerio safely decodes the text for a
  // second parse without executing any of it.
  const decodedMarkup = load(html).root().text();
  return decodedMarkup.includes("<img") ? findImage(decodedMarkup) : null;
}

function normalizePinLink(candidate: string | undefined, boardUrl: URL): string {
  if (!candidate) return boardUrl.toString();

  try {
    const url = new URL(candidate, boardUrl);
    if (!["http:", "https:"].includes(url.protocol) || !isPinterestHost(url.hostname)) {
      return boardUrl.toString();
    }

    url.protocol = "https:";
    url.username = "";
    url.password = "";
    url.port = "";
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return boardUrl.toString();
  }
}

function cleanTitle(candidate: string | undefined, index: number): string {
  if (!candidate) return `Pinterest item ${index + 1}`;

  const title = load(candidate).root().text().replace(/\s+/g, " ").trim();
  return title.slice(0, 180) || `Pinterest item ${index + 1}`;
}

function stableId(seed: string): string {
  return `pin_${createHash("sha256").update(seed).digest("hex").slice(0, 20)}`;
}

function publicBoardUrl(feedUrl: URL): URL {
  const boardUrl = new URL(feedUrl);
  boardUrl.pathname = boardUrl.pathname.replace(/\.rss$/i, "/");
  return boardUrl;
}

function errorResponse(message: string, status: number): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  const rawUrl = new URL(request.url).searchParams.get("url");
  if (!rawUrl?.trim()) {
    return errorResponse("A Pinterest board URL is required.", 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const feedUrl = normalizeBoardUrl(rawUrl);
    const response = await fetchWithSafeRedirects(feedUrl, controller.signal);

    if ([401, 403, 404].includes(response.status)) {
      throw new RouteError(
        404,
        "That board was not found. Make sure it exists and is public.",
      );
    }

    if (response.status === 429) {
      throw new RouteError(503, "Pinterest is rate limiting imports. Try again shortly.");
    }

    if (!response.ok) {
      throw new RouteError(502, "Pinterest could not provide that board feed.");
    }

    const xml = await readResponseWithLimit(response);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      !xml.trim() ||
      contentType.includes("text/html") ||
      /^\s*<!doctype\s+html/i.test(xml)
    ) {
      throw new RouteError(
        404,
        "That board is private, unavailable, or does not expose a public RSS feed.",
      );
    }

    let feed: Awaited<ReturnType<typeof parser.parseString>>;
    try {
      feed = await parser.parseString(xml);
    } catch {
      throw new RouteError(502, "Pinterest returned an invalid RSS feed.");
    }

    const boardUrl = publicBoardUrl(feedUrl);
    const seenImages = new Set<string>();
    const pins: PinterestImportItem[] = [];

    for (const [index, item] of feed.items.entries()) {
      const imageUrl =
        extractImageFromHtml(item.contentEncoded) ??
        extractImageFromHtml(item.content) ??
        extractImageFromHtml(item.description) ??
        toPinterestImageUrl(item.enclosure?.url);

      if (!imageUrl || seenImages.has(imageUrl)) continue;
      seenImages.add(imageUrl);

      const link = normalizePinLink(item.link, boardUrl);
      pins.push({
        id: stableId(`${item.guid ?? link}|${imageUrl}`),
        title: cleanTitle(item.title, index),
        imageUrl,
        link,
      });
    }

    if (pins.length === 0) {
      throw new RouteError(
        404,
        "No public pins were found. The board may be empty or private.",
      );
    }

    return Response.json(pins, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof RouteError) {
      return errorResponse(error.message, error.status);
    }

    if (error instanceof Error && error.name === "AbortError") {
      return errorResponse("Pinterest took too long to respond. Try again.", 504);
    }

    return errorResponse("Could not connect to Pinterest. Try again shortly.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
