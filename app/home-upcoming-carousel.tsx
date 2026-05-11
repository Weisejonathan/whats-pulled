"use client";

import { useRef } from "react";

const upcomingBreaks = [
  {
    breaker: "Court Kings Breaks",
    href: "/breakers",
    image:
      "https://cdn.shopify.com/s/files/1/0662/9749/5709/files/0ad6b75b641ff6af446e1536f5e8aa58e19945f2_25TCTN_FGC6336_HOBBY.png?v=1774339466",
    platform: "Whatnot",
    set: "Topps Chrome Tennis 2025",
    time: "Heute, 20:30",
  },
  {
    breaker: "Prime Pulls EU",
    href: "/sets/topps-chrome-sapphire-tennis-2025",
    image: "https://images.topps.com/v3/assets/bltc7206971cb4b2bfc/bltbba8f89a25b6d820/69b466dd321ab56f0660284c/25TCTN_1499_FR_Sapphire_Purple.jpg",
    platform: "Whatnot",
    set: "Topps Chrome Sapphire Tennis 2025",
    time: "Morgen, 19:00",
  },
  {
    breaker: "Baseline Breaks",
    href: "/sets/topps-chrome-tennis-2025",
    image: "/card-images/novak-djokovic-superfractor-1-1.jpg",
    platform: "Whatnot",
    set: "Chrome Tennis Hobby Case",
    time: "Mi., 21:15",
  },
  {
    breaker: "Ace Card Club",
    href: "/breakers",
    image:
      "https://ripped.topps.com/wp-content/uploads/2026/01/Screenshot-2026-01-22-at-11.03.17-AM.webp",
    platform: "Whatnot",
    set: "Tennis Color Chase",
    time: "Fr., 18:45",
  },
];

export function HomeUpcomingCarousel() {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const scroll = (direction: -1 | 1) => {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    track.scrollBy({
      behavior: "smooth",
      left: direction * Math.min(track.clientWidth * 0.82, 720),
    });
  };

  return (
    <section className="home-break-carousel" aria-label="Upcoming Breaks">
      <div className="home-break-carousel-heading">
        <div>
          <p className="eyebrow">Upcoming Breaks</p>
          <h2>Live soon on Whatnot</h2>
        </div>
        <div className="home-carousel-controls">
          <button type="button" onClick={() => scroll(-1)} aria-label="Previous break">
            Prev
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label="Next break">
            Next
          </button>
        </div>
      </div>

      <div className="home-break-carousel-track" ref={trackRef}>
        {upcomingBreaks.map((event) => (
          <a className="home-break-slide" href={event.href} key={`${event.breaker}-${event.time}`}>
            <div className="home-break-media">
              <img src={event.image} alt={`${event.set} break`} />
              <span>{event.platform}</span>
            </div>
            <div className="home-break-copy">
              <small>{event.time}</small>
              <h3>{event.set}</h3>
              <p>{event.breaker}</p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
