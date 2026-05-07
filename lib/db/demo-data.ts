export type ChaseCard = {
  player: string;
  card: string;
  serial: string;
  status: "Open" | "Pulled" | "Claimed" | "Available" | "Sold";
  breaker: string;
  value: string;
};

export type BreakerScore = {
  name: string;
  hits: number;
  value: string;
};

export type CardOption = {
  id: string;
  label: string;
};

export type RecentlyPulledCard = {
  player: string;
  card: string;
  serial: string;
  pulledBy: string;
  imageUrl: string | null;
  cardUrl: string;
};

export type HomepageMetrics = {
  openCards: string;
  verifiedPulls: string;
  claimedValue: string;
};

export type HomepageData = {
  chaseCards: ChaseCard[];
  breakers: BreakerScore[];
  cardOptions: CardOption[];
  databaseReady: boolean;
  metrics: HomepageMetrics;
  recentlyPulled: RecentlyPulledCard[];
};

export const demoHomepageData: HomepageData = {
  chaseCards: [
    {
      player: "Carlos Alcaraz",
      card: "Topps Chrome Tennis 2025 Superfractor",
      serial: "1/1",
      status: "Pulled",
      breaker: "Court Kings Breaks",
      value: "$18,500",
    },
    {
      player: "Novak Djokovic",
      card: "Topps Chrome Tennis 2025 Superfractor",
      serial: "1/1",
      status: "Open",
      breaker: "-",
      value: "-",
    },
    {
      player: "Jannik Sinner",
      card: "Topps Chrome Tennis 2025 Red Refractor",
      serial: "/5",
      status: "Available",
      breaker: "Nordic Card Store",
      value: "$4,200",
    },
  ],
  breakers: [
    { name: "Court Kings Breaks", hits: 18, value: "$72,400" },
    { name: "Nordic Card Store", hits: 12, value: "$44,900" },
    { name: "Prime Pulls EU", hits: 9, value: "$31,250" },
  ],
  cardOptions: [
    {
      id: "demo-carlos-alcaraz",
      label: "Carlos Alcaraz - Topps Chrome Tennis 2025 Superfractor - 1/1",
    },
    {
      id: "demo-novak-djokovic",
      label: "Novak Djokovic - Topps Chrome Tennis 2025 Superfractor - 1/1",
    },
    {
      id: "demo-jannik-sinner",
      label: "Jannik Sinner - Topps Chrome Tennis 2025 Red Refractor - /5",
    },
  ],
  databaseReady: false,
  metrics: {
    openCards: "128",
    verifiedPulls: "342",
    claimedValue: "$1.8M",
  },
  recentlyPulled: [
    {
      player: "Novak Djokovic",
      card: "Topps Chrome Tennis 2025 Superfractor",
      serial: "1/1",
      pulledBy: "Erick Schmerick23",
      imageUrl: "/card-images/novak-djokovic-superfractor-1-1.jpg",
      cardUrl: "/cards/novak-djokovic-1-superfractor",
    },
  ],
};
