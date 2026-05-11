export type BreakPullPlaceholder = {
  cardUrl: string;
  player: string;
  serial: string;
  title: string;
  value: string;
};

export type PastBreakPlaceholder = {
  id: string;
  platform: string;
  pulls: BreakPullPlaceholder[];
  set: string;
  time: string;
};

export const pastBreakPlaceholders: PastBreakPlaceholder[] = [
  {
    id: "topps-chrome-tennis-case",
    platform: "Whatnot",
    set: "Topps Chrome Tennis 2025",
    time: "Letzten Sonntag",
    pulls: [
      {
        cardUrl: "/cards/novak-djokovic-1-superfractor",
        player: "Novak Djokovic",
        serial: "1/1",
        title: "Superfractor Auto",
        value: "$18,500",
      },
      {
        cardUrl: "/cards/carlos-alcaraz-1-superfractor",
        player: "Carlos Alcaraz",
        serial: "/5",
        title: "Red Refractor",
        value: "$4,800",
      },
      {
        cardUrl: "/cards/linda-noskova-75-green-sapphire",
        player: "Linda Noskova",
        serial: "/75",
        title: "Green Sapphire",
        value: "$620",
      },
    ],
  },
  {
    id: "sapphire-tennis-night",
    platform: "Whatnot",
    set: "Topps Chrome Sapphire Tennis 2025",
    time: "Vor 2 Wochen",
    pulls: [
      {
        cardUrl: "/cards/casper-ruud-75-green-sapphire",
        player: "Casper Ruud",
        serial: "/75",
        title: "Green Sapphire",
        value: "$540",
      },
      {
        cardUrl: "/cards/valentin-vacherot-25-orange-sapphire",
        player: "Valentin Vacherot",
        serial: "/25",
        title: "Orange Sapphire",
        value: "$390",
      },
      {
        cardUrl: "/cards/sebastian-korda-10-red-sapphire",
        player: "Sebastian Korda",
        serial: "/10",
        title: "Red Sapphire",
        value: "$1,250",
      },
    ],
  },
  {
    id: "chrome-hobby-case",
    platform: "Whatnot",
    set: "Chrome Tennis Hobby Case",
    time: "Vor 1 Monat",
    pulls: [
      {
        cardUrl: "/cards/iga-swiatek-25-orange-refractor",
        player: "Iga Swiatek",
        serial: "/25",
        title: "Orange Refractor",
        value: "$2,200",
      },
      {
        cardUrl: "/cards/jannik-sinner-10-red-refractor",
        player: "Jannik Sinner",
        serial: "/10",
        title: "Red Refractor",
        value: "$3,600",
      },
      {
        cardUrl: "/cards/ben-shelton-99-aqua-refractor",
        player: "Ben Shelton",
        serial: "/99",
        title: "Aqua Refractor",
        value: "$480",
      },
    ],
  },
];
