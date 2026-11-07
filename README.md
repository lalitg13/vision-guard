<div align="center">

# VisionGuard

A local webcam dashboard for a computer vision portfolio. OpenCV finds a face, an LBPH model checks it against one enrolled admin, and a Flask page shows the stream, an activity log, and charts.

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![OpenCV](https://img.shields.io/badge/OpenCV-4.10%2B-5C3EE8?style=flat-square&logo=opencv&logoColor=white)](https://opencv.org)
[![Flask](https://img.shields.io/badge/Flask-3.0%2B-000000?style=flat-square&logo=flask&logoColor=white)](https://palletsprojects.com/p/flask/)
[![Matplotlib](https://img.shields.io/badge/Matplotlib-3.9%2B-11557C?style=flat-square&logo=python&logoColor=white)](https://matplotlib.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

`python app.py` → open **http://localhost:5001**

</div>

## See it

The dashboard, with no webcam connected. The video panel is the offline frame from `vision_engine.py`. Counters, the threat banner, the activity log, and the chart are filled from `data/events.json`.

![VisionGuard dashboard with the camera offline, KPI cards, activity log, and telemetry chart](assets/dashboard_overview.png)

The vision engine draws a badge on each detected face. Green means the LBPH distance is under 75 (`ACCESS GRANTED: Admin`). Red means the face is unknown, or the model has not been trained yet (`ALERT: UNIDENTIFIED PERSON`). Cyan is used while 20 enrollment crops are being captured. The picture below is a layout sample of those badges: the labels and colors match the engine, and the faces are placeholders.

![Illustration of the green authorized and red unidentified HUD badges](assets/visionguard_hud_stream.png)

`analytics.py` draws this two-panel chart in memory and the dashboard refreshes it every 4 seconds. The left panel counts authorized matches and unidentified alerts over the last 8 hours. The right panel plots the last 15 confidence scores.

![Dark telemetry chart of hourly detections and recent confidence scores](assets/telemetry_analytics.png)

## What this project does

* Detects frontal faces with OpenCV's Haar cascade (`scaleFactor=1.15`, `minNeighbors=5`, minimum box `80×80`).
* Compares each face with `cv2.face.LBPHFaceRecognizer` after resizing the crop to `200×200` grayscale.
* Enrolls one admin from the live camera: 20 crops saved under `data/known_faces/`, then written to `data/trainer.yml`.
* Logs an event at most once every 6 seconds per class (authorized or unidentified), so a person standing in frame does not create a row on every frame.
* Shows the log, four counters, and a Matplotlib chart in a dark dashboard.
* Sends an email through Gmail SMTP SSL when `VISIONGUARD_EMAIL` and `VISIONGUARD_APP_PASSWORD` are set. With those unset, the same alert is printed and kept in an in-memory history list.

Recognition, the event file, and the chart all run on the computer that starts `app.py`. Camera frames stay on that machine. The HTML page does load Geist and Plus Jakarta Sans from Google Fonts.

The activity log shipped in `data/events.json` is sample history (28 generated rows) so the page has something to show before a camera session. **Simulate Intrusion** appends one more sample alert and runs the dispatcher. **Reset** replaces the file with a fresh set of 28 generated rows. Every one of those rows is generated text.

## Architecture

![VisionGuard architecture diagram from webcam ingest through Haar and LBPH to the Flask dashboard](assets/architecture_diagram.svg)

The camera open path uses OpenCV's AVFoundation backend and tries device indexes 0 and 1 at `640×480`. That matches a Mac webcam. If `VideoCapture` does not return a frame, every MJPEG chunk is the offline frame shown in the dashboard screenshot above.

```
Webcam (AVFoundation index 0 or 1)
        │
        ▼
Haar frontal cascade  →  200×200 gray crop
        │
        ├─ enrolling  → cyan badge, save admin_1.jpg … admin_20.jpg, train LBPH
        ├─ distance < 75  → green "ACCESS GRANTED: Admin (NN%)"
        └─ otherwise  → red "ALERT: UNIDENTIFIED PERSON"
                │
                ▼
        6 second cooldown per class
                │
        ┌───────┴────────┐
        ▼                ▼
  data/events.json    AlertDispatcher
        │              (Gmail SSL, or console)
        ▼
  Matplotlib Agg chart  →  Flask page on port 5001
```

## How a match is decided

LBPH describes the texture of a small grayscale face and compares that description to the enrolled admin. It is a classical CPU method, it only knows the one person you enrolled, and the distance cutoff is a fixed rule in `vision_engine.py`.

OpenCV's `predict` returns a label and a distance. The rule in this repo is:

* Distance under 75: authorized admin.
* Distance 75 or higher, or no `trainer.yml` yet: unidentified.

The percentage on the green badge is a display mapping of that distance:

```text
confidence = clamp(100 - (distance * 0.45), 60, 99)
```

Unidentified events stored from the live loop use a fixed confidence of 32. **Simulate Intrusion** picks a random confidence between 25 and 46.

## Add Admin Face

Enrollment needs a working camera and a face inside the frame. The button only flips an in-memory flag. Crops are saved when Haar actually finds a face, up to 20 samples, and each sample is labeled `1`.

![Add Admin Face dialog with the three capture steps](assets/enroll_modal.png)

1. Click **Add Admin Face** or the smaller button on the camera panel.
2. Look at the webcam and click **Start Biometric Capture**.
3. The engine writes `data/known_faces/admin_1.jpg` through `admin_20.jpg`.
4. It trains the LBPH recognizer and saves `data/trainer.yml`.
5. The model badge switches to `Trained (LBPH Active)`, and one authorized event is logged: "Admin face enrolled successfully (20 samples trained)".

`data/known_faces/*.jpg` and `data/trainer.yml` are gitignored, so a clone starts untrained until someone enrolls again.

## Alerts

Each class has its own clock. A face that stays in view updates the HUD every frame and writes a log row only when 6 seconds have passed since the last row of that class.

```python
self.last_event_time = {"Authorized": 0.0, "Unidentified": 0.0}

if now - self.last_event_time[person_type] >= 6.0:
    self.last_event_time[person_type] = now
    self.event_callback(person_type, confidence)
```

Unidentified events call `AlertDispatcher`:

1. **Gmail:** if `VISIONGUARD_EMAIL` and `VISIONGUARD_APP_PASSWORD` are both set, the app sends mail with `smtplib.SMTP_SSL` to `smtp.gmail.com` on port 465. The recipient is `VISIONGUARD_ALERT_TO`, or the sender address if that variable is empty.
2. **Console:** if either secret is missing, or SMTP raises, the alert is appended to `dispatch_history` and printed. The dashboard badge then reads `SMTP: Simulated`.

## Charts

Matplotlib is forced onto the `Agg` backend before `pyplot` is imported, and `MPLCONFIGDIR` is pointed at a temp directory. That avoids GUI backends inside the Flask process. The figure is saved to a `BytesIO` buffer, returned as `image/png` with `Cache-Control: no-store`, and closed with `plt.close(fig)`.

## REST API

| Method | Endpoint | What it returns |
| :---: | :--- | :--- |
| `GET` | `/` | Dashboard HTML |
| `GET` | `/video_feed` | MJPEG stream (`multipart/x-mixed-replace`) |
| `GET` | `/api/events` | Latest 35 events, newest alert, in-memory email history, and the four counters |
| `GET` | `/api/analytics.png` | Chart PNG generated from the current event list |
| `POST` | `/api/enroll` | Starts a 20-sample enrollment |
| `GET` | `/api/enroll_status` | Enrollment progress and whether `trainer.yml` loaded |
| `POST` | `/api/simulate_alert` | Inserts one sample unidentified event and runs the dispatcher |
| `POST` | `/api/clear_events` | Replaces the log with 28 newly generated sample rows and clears email history |

## Getting Started

### Prerequisites

* Python 3.9 or higher
* A webcam for live detection and enrollment. The open path is AVFoundation (macOS). If no frame arrives, the page stays up and the video panel shows the offline frame.

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/lalitg13/vision-guard.git
   cd vision-guard
   ```

2. Create a virtual environment and install dependencies:

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. (Optional) Set up email alerting credentials:

   ```bash
   export VISIONGUARD_EMAIL="your-email@gmail.com"
   export VISIONGUARD_APP_PASSWORD="your-app-password"
   export VISIONGUARD_ALERT_TO="security-recipient@example.com"
   ```

   If these are left unset, VisionGuard logs alerts to the console and to the in-memory dispatch history.

### Running the Server

```bash
python app.py
```

Then open **http://localhost:5001**.

Port 5001 is the default so the app does not collide with AirPlay Receiver on macOS. `debug=True` is on and the reloader is off, so a second process does not grab the camera.

## Project Structure

```
vision-guard/
├── app.py                     # Flask routes, event log, seed data
├── vision_engine.py           # Camera, Haar, LBPH, HUD, MJPEG
├── analytics.py               # Headless Matplotlib chart
├── alerts.py                  # Gmail SMTP or console alerts
├── requirements.txt
├── assets/
│   ├── dashboard_overview.png
│   ├── visionguard_hud_stream.png
│   ├── telemetry_analytics.png
│   ├── enroll_modal.png
│   └── architecture_diagram.svg
├── templates/
│   └── index.html
├── static/
│   ├── css/style.css
│   └── js/
│       ├── dashboard.js
│       └── shader-canvas.js
└── data/
    ├── events.json            # Sample log shipped with the repo
    ├── haarcascade_frontalface_default.xml
    └── known_faces/           # Enrollment crops (gitignored)
```

## License

MIT. See [LICENSE](LICENSE).
