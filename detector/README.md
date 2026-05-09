# OBS Card Detector

Local companion for breakers. It reads an OBS Virtual Camera feed, detects a card-like rectangle, and posts recognition events to the web app overlay endpoint.

## Run

```bash
python3 -m venv .venv-detector
source .venv-detector/bin/activate
pip install -r detector/requirements.txt
python detector/obs_card_detector.py --overlay-key demo --api-url http://localhost:3000
```

For a real break session, copy the `overlayKey` from `/studio` and use that instead of `demo`.

## Current Scope

This first detector proves the local OBS-to-overlay bridge:

- captures frames from a camera device
- finds the largest card-shaped contour
- throttles duplicate sends
- posts set/card/player/autograph fields to the platform

The next production step is replacing the placeholder metadata with OCR and image matching against Neon.
