import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

async function consumeDetectorBudget(kind: "vision" | "upload") {
  const db = getDb();
  if (!db) return false;
  const limits = [{ bucket: `${kind}-minute`, seconds: 60, max: kind === "vision" ? 20 : 40 }, { bucket: `${kind}-hour`, seconds: 3600, max: 400 }];
  for (const limit of limits) {
    const result = await db.execute(sql`
      insert into detector_request_budget(bucket, window_start, requests) values (${limit.bucket}, now(), 1)
      on conflict (bucket) do update set
        requests = case when detector_request_budget.window_start <= now() - make_interval(secs => ${limit.seconds}) then 1 else detector_request_budget.requests + 1 end,
        window_start = case when detector_request_budget.window_start <= now() - make_interval(secs => ${limit.seconds}) then now() else detector_request_budget.window_start end
      where detector_request_budget.requests < ${limit.max} or detector_request_budget.window_start <= now() - make_interval(secs => ${limit.seconds})
      returning requests
    `);
    if (!result.rows.length) return false;
  }
  return true;
}

export const consumeVisionBudget = () => consumeDetectorBudget("vision");
export const consumeUploadBudget = () => consumeDetectorBudget("upload");
