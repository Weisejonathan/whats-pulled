import type { MetadataRoute } from "next";

const blockedAiCrawlers = [
  "GPTBot",
  "meta-externalagent",
  "meta-externalfetcher",
  "Amazonbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: blockedAiCrawlers,
        disallow: "/",
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/account",
          "/admin",
          "/api/",
          "/detector",
          "/direct-uploader",
          "/login",
          "/stream-detector",
          "/studio",
        ],
      },
    ],
    host: "https://www.whatspulled.com",
  };
}
