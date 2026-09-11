# Unified live card detector

Use `/stream-detector` for screen capture or `/detector` for camera / OBS Virtual Camera. Both use the same PaddleOCR/MediaPipe worker and review queue.

The old Tesseract interface, Instagram detection, training upload interface, Python companion and mock sender have been removed. Legacy endpoints return HTTP 410; historical data remains intact.

See [Live pipeline](LIVE-PIPELINE.md) for setup, measurements and limitations.
