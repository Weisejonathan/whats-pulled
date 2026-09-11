import type { NextRequest } from "next/server";

const blockedCrawlerPattern = /(?:GPTBot|meta-externalagent|meta-externalfetcher|Amazonbot)/i;

export function proxy(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";

  if (!blockedCrawlerPattern.test(userAgent)) {
    return;
  }

  return new Response("Automated crawling is not permitted.", {
    status: 403,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const config = {
  matcher: [
    {
      source: "/:path*",
      has: [
        {
          type: "header",
          key: "user-agent",
          value: ".*(GPTBot|meta-externalagent|meta-externalfetcher|Amazonbot).*",
        },
      ],
    },
  ],
};
