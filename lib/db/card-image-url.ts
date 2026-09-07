import { sql } from "drizzle-orm";
import { cards } from "./schema";

export function publicCardImageUrl() {
  return sql<string | null>`case
    when ${cards.imageUrl} is null or ${cards.imageUrl} = '' then null
    when ${cards.imageUrl} like 'data:%' then '/api/card-images/' || ${cards.slug}
    else ${cards.imageUrl}
  end`;
}
