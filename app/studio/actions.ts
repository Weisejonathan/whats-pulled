"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createBreakSession } from "@/lib/db/live-breaks";

const requiredText = (formData: FormData, name: string) => {
  const value = formData.get(name);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
};

const optionalText = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export async function createBreakSessionAction(formData: FormData) {
  const session = await createBreakSession({
    breakerName: requiredText(formData, "breakerName"),
    title: requiredText(formData, "title"),
    streamPlatform: optionalText(formData, "streamPlatform"),
  });

  revalidatePath("/studio");
  redirect(`/studio?session=${session.overlayKey}`);
}
