"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  getSafeRedirectPath,
  loginUser,
  loginWithAccessCode,
  logoutAdmin,
  logoutUser,
  registerUser,
  requireAdminSession,
  requireUserSession,
} from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { awardPullPoints } from "@/lib/db/points";
import {
  breakers,
  cardBids,
  cardFavorites,
  cards,
  cardSets,
  claims,
  listings,
  pullReports,
  stores,
} from "@/lib/db/schema";
import { slugify } from "@/lib/slug";

const cardStatuses = ["open", "pulled", "claimed", "available", "sold"] as const;

type CardStatus = (typeof cardStatuses)[number];

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

const optionalMoney = (formData: FormData, name: string) => {
  const value = optionalText(formData, name);

  if (!value) {
    return null;
  }

  const amount = Number(value.replace(/[$,\s]/g, ""));

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${name} must be a valid amount.`);
  }

  return amount.toFixed(2);
};

const readCurrency = (formData: FormData, name: string, fallback = "EUR") => {
  const value = optionalText(formData, name)?.toUpperCase();
  return value && /^[A-Z]{3}$/.test(value) ? value : fallback;
};

const requireDb = () => {
  const db = getDb();

  if (!db) {
    throw new Error("DATABASE_URL is missing.");
  }

  return db;
};

const readStatus = (formData: FormData): CardStatus => {
  const status = optionalText(formData, "status");
  return cardStatuses.includes(status as CardStatus) ? (status as CardStatus) : "open";
};

export async function loginAction(formData: FormData) {
  const accessCode = requiredText(formData, "accessCode");
  const nextPath = getSafeRedirectPath(optionalText(formData, "next"));
  const didLogin = await loginWithAccessCode(accessCode);

  if (!didLogin) {
    redirect(`/login?error=1&next=${encodeURIComponent(nextPath)}`);
  }

  redirect(nextPath);
}

export async function logoutAction() {
  await logoutAdmin();
  await logoutUser();
  redirect("/");
}

export async function userLoginAction(formData: FormData) {
  const email = requiredText(formData, "email");
  const password = requiredText(formData, "password");
  const nextPath = getSafeRedirectPath(optionalText(formData, "next"));
  const didLogin = await loginUser(email, password);

  if (!didLogin) {
    redirect(`/login?userError=1&next=${encodeURIComponent(nextPath)}`);
  }

  redirect(nextPath);
}

export async function registerUserAction(formData: FormData) {
  const displayName = requiredText(formData, "displayName");
  const email = requiredText(formData, "email");
  const password = requiredText(formData, "password");
  const nextPath = getSafeRedirectPath(optionalText(formData, "next"));

  if (password.length < 8) {
    redirect(`/login?registerError=short-password&next=${encodeURIComponent(nextPath)}`);
  }

  try {
    await registerUser(displayName, email, password);
  } catch {
    redirect(`/login?registerError=1&next=${encodeURIComponent(nextPath)}`);
  }

  redirect(nextPath);
}

export async function createCardAction(formData: FormData) {
  await requireAdminSession("/#database");

  const db = requireDb();
  const now = new Date();
  const setName = requiredText(formData, "setName");
  const brand = requiredText(formData, "brand");
  const sport = requiredText(formData, "sport");
  const year = Number(requiredText(formData, "year"));
  const playerName = requiredText(formData, "playerName");
  const cardName = requiredText(formData, "cardName");
  const parallel = optionalText(formData, "parallel");
  const serialNumber = requiredText(formData, "serialNumber");
  const estimatedValue = optionalMoney(formData, "estimatedValue");
  const status = readStatus(formData);

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error("year must be valid.");
  }

  const setSlug = slugify(setName);
  const cardSlug = slugify(
    [playerName, setName, cardName, parallel, serialNumber].filter(Boolean).join(" "),
  );

  const [set] = await db
    .insert(cardSets)
    .values({
      name: setName,
      slug: setSlug,
      brand,
      year,
      sport,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: cardSets.slug,
      set: {
        name: setName,
        brand,
        year,
        sport,
        updatedAt: now,
      },
    })
    .returning();

  await db
    .insert(cards)
    .values({
      setId: set.id,
      playerName,
      slug: cardSlug,
      cardName,
      parallel,
      serialNumber,
      status,
      estimatedValue,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: cards.slug,
      set: {
        setId: set.id,
        playerName,
        cardName,
        parallel,
        serialNumber,
        status,
        estimatedValue,
        updatedAt: now,
      },
    });

  revalidatePath("/");
  redirect("/#sets");
}

export async function reportPullAction(formData: FormData) {
  const returnTo = optionalText(formData, "returnTo");
  await requireAdminSession(returnTo ?? "/#leaderboard");

  const db = requireDb();
  const now = new Date();
  const cardId = requiredText(formData, "cardId");
  const breakerName = requiredText(formData, "breakerName");
  const country = optionalText(formData, "breakerCountry");
  const estimatedValue = optionalMoney(formData, "estimatedValue");
  const proofUrl = optionalText(formData, "proofUrl");
  const breakerSlug = slugify(breakerName);

  const [breaker] = await db
    .insert(breakers)
    .values({
      displayName: breakerName,
      slug: breakerSlug,
      country,
      verified: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: breakers.slug,
      set: {
        displayName: breakerName,
        country,
        verified: true,
        updatedAt: now,
      },
    })
    .returning();

  await db
    .insert(pullReports)
    .values({
      cardId,
      breakerId: breaker.id,
      reportedByName: "Frontend submission",
      proofUrl,
      externalRef: `pull-${cardId}-${breakerSlug}`,
      pulledAt: now,
      estimatedValue,
      verificationStatus: "verified",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pullReports.externalRef,
      set: {
        breakerId: breaker.id,
        proofUrl,
        pulledAt: now,
        estimatedValue,
        verificationStatus: "verified",
        updatedAt: now,
      },
    });

  await db
    .update(cards)
    .set({
      status: "pulled",
      ...(estimatedValue ? { estimatedValue } : {}),
      updatedAt: now,
    })
    .where(eq(cards.id, cardId));

  revalidatePath("/");

  if (returnTo) {
    revalidatePath(returnTo);
    redirect(returnTo);
  }

  redirect("/#leaderboard");
}

export async function submitPullAction(formData: FormData) {
  const returnTo = getSafeRedirectPath(optionalText(formData, "returnTo"));
  const user = await requireUserSession(returnTo);
  const db = requireDb();
  const now = new Date();
  const cardId = requiredText(formData, "cardId");
  const breakerName = optionalText(formData, "breakerName") ?? user.displayName;
  const estimatedValue = optionalMoney(formData, "estimatedValue");
  const proofUrl = optionalText(formData, "proofUrl");

  const [card] = await db
    .select({
      slug: cards.slug,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new Error("Card not found.");
  }

  await db.insert(pullReports).values({
    cardId,
    userId: user.id,
    reportedByName: breakerName,
    proofUrl,
    externalRef: `user-pull-${cardId}-${user.id}-${now.getTime()}`,
    pulledAt: now,
    estimatedValue,
    verificationStatus: "pending",
    updatedAt: now,
  });

  revalidatePath("/");
  revalidatePath(returnTo);
  revalidatePath(`/cards/${card.slug}`);
  redirect(`${returnTo}?pullSubmitted=1`);
}

export async function claimCardAction(formData: FormData) {
  const returnTo = optionalText(formData, "returnTo");
  await requireAdminSession(returnTo ?? "/");

  const db = requireDb();
  const now = new Date();
  const cardId = requiredText(formData, "cardId");
  const ownerDisplayName = requiredText(formData, "ownerDisplayName");
  const proofUrl = optionalText(formData, "proofUrl");
  const ownerSlug = slugify(ownerDisplayName);

  const [card] = await db
    .select({
      slug: cards.slug,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new Error("Card not found.");
  }

  await db
    .insert(claims)
    .values({
      cardId,
      ownerDisplayName,
      proofUrl,
      externalRef: `claim-${cardId}-${ownerSlug}`,
      verificationStatus: "verified",
      claimedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: claims.externalRef,
      set: {
        ownerDisplayName,
        proofUrl,
        verificationStatus: "verified",
        claimedAt: now,
        updatedAt: now,
      },
    });

  await db
    .insert(pullReports)
    .values({
      cardId,
      reportedByName: ownerDisplayName,
      proofUrl,
      externalRef: `claim-pull-${cardId}-${ownerSlug}`,
      pulledAt: now,
      verificationStatus: "verified",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pullReports.externalRef,
      set: {
        reportedByName: ownerDisplayName,
        proofUrl,
        pulledAt: now,
        verificationStatus: "verified",
        updatedAt: now,
      },
    });

  await db
    .update(cards)
    .set({
      status: "claimed",
      updatedAt: now,
    })
    .where(eq(cards.id, cardId));

  revalidatePath("/");
  revalidatePath(`/cards/${card.slug}`);

  if (returnTo) {
    revalidatePath(returnTo);
    redirect(returnTo);
  }

  redirect(`/cards/${card.slug}`);
}

export async function requestClaimAction(formData: FormData) {
  const returnTo = getSafeRedirectPath(optionalText(formData, "returnTo"));
  const user = await requireUserSession(returnTo);
  const db = requireDb();
  const now = new Date();
  const cardId = requiredText(formData, "cardId");
  const ownerDisplayName = optionalText(formData, "ownerDisplayName") ?? user.displayName;
  const proofUrl = optionalText(formData, "proofUrl");
  const imageUrl = optionalText(formData, "imageUrl");
  const note = optionalText(formData, "note");

  const [card] = await db
    .select({
      slug: cards.slug,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new Error("Card not found.");
  }

  await db
    .insert(claims)
    .values({
      cardId,
      ownerDisplayName,
      userId: user.id,
      proofUrl,
      imageUrl,
      note,
      externalRef: `request-claim-${cardId}-${user.id}`,
      verificationStatus: "pending",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: claims.externalRef,
      set: {
        ownerDisplayName,
        proofUrl,
        imageUrl,
        note,
        verificationStatus: "pending",
        updatedAt: now,
      },
    });

  revalidatePath("/");
  revalidatePath(`/cards/${card.slug}`);
  revalidatePath(returnTo);
  redirect(`${returnTo}?claimRequested=1`);
}

export async function favoriteCardAction(formData: FormData) {
  const returnTo = getSafeRedirectPath(optionalText(formData, "returnTo"));
  const user = await requireUserSession(returnTo);
  const db = requireDb();
  const now = new Date();
  const cardId = requiredText(formData, "cardId");
  const userEmail = user.email;
  const userDisplayName = user.displayName;
  const favoriteSlug = slugify(userEmail);

  const [card] = await db
    .select({
      slug: cards.slug,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new Error("Card not found.");
  }

  await db
    .insert(cardFavorites)
    .values({
      cardId,
      userId: user.id,
      userEmail,
      userDisplayName,
      externalRef: `favorite-${cardId}-${favoriteSlug}`,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: cardFavorites.externalRef,
      set: {
        userDisplayName,
        updatedAt: now,
      },
    });

  revalidatePath(returnTo);
  revalidatePath(`/cards/${card.slug}`);
  redirect(`${returnTo}?favoriteSaved=1`);
}

export async function submitBidAction(formData: FormData) {
  const returnTo = getSafeRedirectPath(optionalText(formData, "returnTo"));
  const user = await requireUserSession(returnTo);
  const db = requireDb();
  const now = new Date();
  const cardId = requiredText(formData, "cardId");
  const bidderDisplayName = user.displayName;
  const bidderEmail = user.email;
  const amount = optionalMoney(formData, "amount");
  const currency = readCurrency(formData, "currency");
  const note = optionalText(formData, "note");

  if (!amount || Number(amount) <= 0) {
    throw new Error("Bid amount is required.");
  }

  const [card] = await db
    .select({
      slug: cards.slug,
    })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  if (!card) {
    throw new Error("Card not found.");
  }

  await db.insert(cardBids).values({
    cardId,
    userId: user.id,
    bidderDisplayName,
    bidderEmail,
    amount,
    currency,
    note,
    externalRef: `bid-${cardId}-${slugify(bidderEmail)}-${now.getTime()}`,
    updatedAt: now,
  });

  revalidatePath(returnTo);
  revalidatePath(`/cards/${card.slug}`);
  redirect(`${returnTo}?bidSubmitted=1`);
}

export async function approveClaimRequestAction(formData: FormData) {
  await requireAdminSession("/admin/requests");

  const db = requireDb();
  const now = new Date();
  const claimId = requiredText(formData, "claimId");
  const returnTo = getSafeRedirectPath(optionalText(formData, "returnTo"));

  const [request] = await db
    .select({
      id: claims.id,
      cardId: claims.cardId,
      ownerDisplayName: claims.ownerDisplayName,
      proofUrl: claims.proofUrl,
      imageUrl: claims.imageUrl,
      cardSlug: cards.slug,
    })
    .from(claims)
    .innerJoin(cards, eq(claims.cardId, cards.id))
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!request) {
    throw new Error("Claim request not found.");
  }

  await db
    .update(claims)
    .set({
      verificationStatus: "verified",
      claimedAt: now,
      updatedAt: now,
    })
    .where(eq(claims.id, request.id));

  await db
    .insert(pullReports)
    .values({
      cardId: request.cardId,
      reportedByName: request.ownerDisplayName,
      proofUrl: request.proofUrl,
      externalRef: `approved-claim-pull-${request.id}`,
      pulledAt: now,
      verificationStatus: "verified",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pullReports.externalRef,
      set: {
        reportedByName: request.ownerDisplayName,
        proofUrl: request.proofUrl,
        pulledAt: now,
        verificationStatus: "verified",
        updatedAt: now,
      },
    });

  await db
    .update(cards)
    .set({
      status: "claimed",
      ...(request.imageUrl ? { imageUrl: request.imageUrl } : {}),
      updatedAt: now,
    })
    .where(eq(cards.id, request.cardId));

  revalidatePath("/");
  revalidatePath("/admin/requests");
  revalidatePath(`/cards/${request.cardSlug}`);
  redirect(`${returnTo}?approved=1`);
}

export async function approvePullRequestAction(formData: FormData) {
  await requireAdminSession("/admin/requests");

  const db = requireDb();
  const now = new Date();
  const pullId = requiredText(formData, "pullId");
  const returnTo = getSafeRedirectPath(optionalText(formData, "returnTo"));

  const [request] = await db
    .select({
      id: pullReports.id,
      cardId: pullReports.cardId,
      cardSlug: cards.slug,
      estimatedValue: pullReports.estimatedValue,
    })
    .from(pullReports)
    .innerJoin(cards, eq(pullReports.cardId, cards.id))
    .where(eq(pullReports.id, pullId))
    .limit(1);

  if (!request) {
    throw new Error("Pull request not found.");
  }

  await db
    .update(pullReports)
    .set({
      pulledAt: now,
      verificationStatus: "verified",
      updatedAt: now,
    })
    .where(eq(pullReports.id, request.id));

  await db
    .update(cards)
    .set({
      status: "pulled",
      ...(request.estimatedValue ? { estimatedValue: request.estimatedValue } : {}),
      updatedAt: now,
    })
    .where(eq(cards.id, request.cardId));

  await awardPullPoints(db, request.id);

  revalidatePath("/");
  revalidatePath("/admin/requests");
  revalidatePath("/leaderboard");
  revalidatePath(`/cards/${request.cardSlug}`);
  redirect(`${returnTo}?pullApproved=1`);
}

export async function rejectPullRequestAction(formData: FormData) {
  await requireAdminSession("/admin/requests");

  const db = requireDb();
  const now = new Date();
  const pullId = requiredText(formData, "pullId");
  const returnTo = getSafeRedirectPath(optionalText(formData, "returnTo"));

  await db
    .update(pullReports)
    .set({
      verificationStatus: "rejected",
      updatedAt: now,
    })
    .where(eq(pullReports.id, pullId));

  revalidatePath("/admin/requests");
  redirect(`${returnTo}?pullRejected=1`);
}

export async function rejectClaimRequestAction(formData: FormData) {
  await requireAdminSession("/admin/requests");

  const db = requireDb();
  const now = new Date();
  const claimId = requiredText(formData, "claimId");
  const returnTo = getSafeRedirectPath(optionalText(formData, "returnTo"));

  const [request] = await db
    .select({
      id: claims.id,
      cardSlug: cards.slug,
    })
    .from(claims)
    .innerJoin(cards, eq(claims.cardId, cards.id))
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!request) {
    throw new Error("Claim request not found.");
  }

  await db
    .update(claims)
    .set({
      verificationStatus: "rejected",
      updatedAt: now,
    })
    .where(eq(claims.id, request.id));

  revalidatePath("/");
  revalidatePath("/admin/requests");
  revalidatePath(`/cards/${request.cardSlug}`);
  redirect(`${returnTo}?rejected=1`);
}

export async function createListingAction(formData: FormData) {
  await requireAdminSession("/#market");

  const db = requireDb();
  const now = new Date();
  const cardId = requiredText(formData, "cardId");
  const storeName = requiredText(formData, "storeName");
  const country = optionalText(formData, "storeCountry");
  const price = optionalMoney(formData, "price");
  const currency = (optionalText(formData, "currency") ?? "USD").toUpperCase();
  const imageUrl = optionalText(formData, "imageUrl");
  const storeSlug = slugify(storeName);

  if (!price) {
    throw new Error("price is required.");
  }

  const [store] = await db
    .insert(stores)
    .values({
      displayName: storeName,
      slug: storeSlug,
      country,
      verified: true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: stores.slug,
      set: {
        displayName: storeName,
        country,
        verified: true,
        updatedAt: now,
      },
    })
    .returning();

  await db
    .insert(listings)
    .values({
      cardId,
      storeId: store.id,
      price,
      currency,
      imageUrl,
      externalRef: `listing-${cardId}-${storeSlug}`,
      status: "active",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: listings.externalRef,
      set: {
        storeId: store.id,
        price,
        currency,
        imageUrl,
        status: "active",
        updatedAt: now,
      },
    });

  await db
    .update(cards)
    .set({
      status: "available",
      estimatedValue: price,
      updatedAt: now,
    })
    .where(eq(cards.id, cardId));

  revalidatePath("/");
  redirect("/#market");
}
