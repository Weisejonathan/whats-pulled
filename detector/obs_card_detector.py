import argparse
import json
import time
from dataclasses import dataclass
from typing import Any
from urllib import request


@dataclass
class Recognition:
    player_name: str
    set_name: str
    card_name: str
    card_number: str
    limitation: str
    is_autographed: bool
    confidence: float

    def to_payload(self) -> dict[str, Any]:
        return {
            "playerName": self.player_name,
            "setName": self.set_name,
            "cardName": self.card_name,
            "cardNumber": self.card_number,
            "limitation": self.limitation,
            "isAutographed": self.is_autographed,
            "confidence": self.confidence,
            "source": "obs-card-detector",
        }


def post_recognition(api_url: str, overlay_key: str, recognition: Recognition) -> None:
    endpoint = f"{api_url.rstrip('/')}/api/obs/recognitions/{overlay_key}"
    data = json.dumps(recognition.to_payload()).encode("utf-8")
    req = request.Request(
        endpoint,
        data=data,
        headers={"content-type": "application/json"},
        method="POST",
    )

    with request.urlopen(req, timeout=8) as response:
        response.read()


def detect_card_confidence(frame: Any) -> float:
    import cv2

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 60, 160)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return 0.0

    frame_area = frame.shape[0] * frame.shape[1]
    best_score = 0.0

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < frame_area * 0.04:
            continue

        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.03 * perimeter, True)
        if len(approx) != 4:
            continue

        x, y, width, height = cv2.boundingRect(approx)
        aspect = max(width, height) / max(1, min(width, height))
        aspect_score = max(0.0, 1.0 - abs(aspect - 1.4) / 1.4)
        area_score = min(1.0, area / (frame_area * 0.34))
        best_score = max(best_score, min(0.99, 0.35 + aspect_score * 0.35 + area_score * 0.3))

    return best_score


def run_detector(args: argparse.Namespace) -> None:
    try:
        import cv2
    except ImportError as error:
        raise SystemExit(
            "OpenCV is missing. Run: pip install -r detector/requirements.txt"
        ) from error

    capture = cv2.VideoCapture(args.camera)
    if not capture.isOpened():
        raise SystemExit(f"Could not open camera device {args.camera}.")

    last_sent_at = 0.0
    print("Detector running. Press Ctrl+C to stop.")

    while True:
        ok, frame = capture.read()
        if not ok:
            time.sleep(0.2)
            continue

        confidence = detect_card_confidence(frame)
        now = time.time()

        if confidence >= args.min_confidence and now - last_sent_at >= args.interval:
            recognition = Recognition(
                player_name=args.player_name,
                set_name=args.set_name,
                card_name=args.card_name,
                card_number=args.card_number,
                limitation=args.limitation,
                is_autographed=args.auto,
                confidence=confidence,
            )
            post_recognition(args.api_url, args.overlay_key, recognition)
            last_sent_at = now
            print(f"Posted card candidate with confidence {confidence:.2f}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OBS Virtual Camera card detector")
    parser.add_argument("--api-url", default="http://localhost:3000")
    parser.add_argument("--overlay-key", required=True)
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--interval", type=float, default=4.0)
    parser.add_argument("--min-confidence", type=float, default=0.72)
    parser.add_argument("--player-name", default="Unknown player")
    parser.add_argument("--set-name", default="Unknown set")
    parser.add_argument("--card-name", default="Detected card")
    parser.add_argument("--card-number", default="")
    parser.add_argument("--limitation", default="")
    parser.add_argument("--auto", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    run_detector(parse_args())
