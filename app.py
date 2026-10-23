"""VisionGuard Flask Application Backend.

Serves the real-time facial recognition and security telemetry dashboard,
MJPEG camera stream, Matplotlib analytics generator, and RESTful API endpoints.
"""

import os
import json
import uuid
import random
import threading
from datetime import datetime, timedelta
from flask import Flask, render_template, Response, jsonify, request, make_response

from vision_engine import VisionEngine
from analytics import generate_analytics_chart
from alerts import AlertDispatcher

app = Flask(__name__)

# Data paths
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
EVENTS_FILE = os.path.join(DATA_DIR, "events.json")
os.makedirs(DATA_DIR, exist_ok=True)

# State & Dispatcher
events_lock = threading.Lock()
events = []
alert_dispatcher = AlertDispatcher()


def _generate_seed_events():
    """Generates 28 realistic historical events distributed across the past 8 hours."""
    now = datetime.now()
    seed_list = []
    
    # 28 timestamps over the last 8 hours (approx every 15-20 minutes)
    for i in range(28):
        # Evenly spread with jitter
        offset_minutes = int((8 * 60) * (28 - i) / 29) + random.randint(-5, 5)
        offset_minutes = max(2, offset_minutes)
        evt_time = now - timedelta(minutes=offset_minutes)
        
        # ~75% Authorized Admin, ~25% Unidentified Alert
        is_alert = (i in [2, 7, 12, 17, 21, 25, 27])
        
        if is_alert:
            confidence = random.randint(22, 45)
            seed_list.append({
                "id": f"evt-{uuid.uuid4().hex[:6]}",
                "timestamp": evt_time.strftime("%Y-%m-%d %H:%M:%S"),
                "type": "Alert",
                "person": "Unidentified Person",
                "confidence": confidence,
                "details": random.choice([
                    "Unidentified subject detected at perimeter portal",
                    "Intruder anomaly detected: unknown facial geometry",
                    "Unauthorized subject in biometric checkpoint",
                    "Security breach alarm: face mismatch against known database",
                ]),
                "status": "ALERT",
            })
        else:
            confidence = random.randint(72, 97)
            seed_list.append({
                "id": f"evt-{uuid.uuid4().hex[:6]}",
                "timestamp": evt_time.strftime("%Y-%m-%d %H:%M:%S"),
                "type": "Authorized",
                "person": "Admin",
                "confidence": confidence,
                "details": random.choice([
                    "Admin biometric access verified (LBPH confidence)",
                    "Authorized personnel entry granted at Main Gate",
                    "Facial biometric match confirmed: Admin ID #01",
                    "Access authorized: Terminal Security Clear",
                ]),
                "status": "GRANTED",
            })

    # Sort descending by timestamp (newest first)
    seed_list.sort(key=lambda x: x["timestamp"], reverse=True)
    return seed_list


def _load_or_seed_events():
    """Loads existing events from disk or initializes seed data."""
    global events
    if os.path.exists(EVENTS_FILE):
        try:
            with open(EVENTS_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, list) and len(loaded) > 0:
                    events = loaded
                    return
        except Exception as e:
            print(f"[App] Failed to load {EVENTS_FILE}: {e}. Reseeding.")

    # Reseed
    events = _generate_seed_events()
    _save_events()


def _save_events():
    """Flushes current event list to JSON storage."""
    try:
        with open(EVENTS_FILE, "w", encoding="utf-8") as f:
            json.dump(events, f, indent=2)
    except Exception as e:
        print(f"[App] Error saving events: {e}")


def on_vision_event(person_type, confidence, details=None):
    """Callback fired by VisionEngine when a recognition event passes the cooldown window."""
    is_auth = (person_type == "Authorized")
    new_event = {
        "id": f"evt-{uuid.uuid4().hex[:6]}",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "type": "Authorized" if is_auth else "Alert",
        "person": "Admin" if is_auth else "Unidentified Person",
        "confidence": int(confidence),
        "details": details or (
            "Admin biometric facial match verified" if is_auth else "Unidentified subject detected in monitored area"
        ),
        "status": "GRANTED" if is_auth else "ALERT",
    }

    with events_lock:
        events.insert(0, new_event)
        # Keep list reasonably sized
        if len(events) > 200:
            events.pop()
        _save_events()

    if not is_auth:
        alert_dispatcher.trigger_security_alert(new_event)


# Initialize Vision Engine
vision = VisionEngine(event_callback=on_vision_event, data_dir=DATA_DIR)

# Initialize Events Data
_load_or_seed_events()


# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

@app.route("/")
def index():
    """Renders the main VisionGuard dashboard."""
    return render_template("index.html")


@app.route("/video_feed")
def video_feed():
    """Streams MJPEG frames from the VisionEngine."""
    return Response(
        vision.generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@app.route("/api/events", methods=["GET"])
def get_events():
    """Returns the latest events, telemetry stats, and active alerts."""
    with events_lock:
        latest_35 = events[:35]
        latest_alert = next((e for e in events if e.get("type") == "Alert" or e.get("status") == "ALERT"), None)
        total_events = len(events)
        alerts_count = sum(1 for e in events if e.get("type") == "Alert" or e.get("status") == "ALERT")
        authorized_count = sum(1 for e in events if e.get("type") == "Authorized" or e.get("status") == "GRANTED")

    return jsonify({
        "events": latest_35,
        "latest_alert": latest_alert,
        "dispatched_emails": alert_dispatcher.get_history(),
        "stats": {
            "total_events": total_events,
            "alerts_count": alerts_count,
            "authorized_count": authorized_count,
            "model_trained": vision.model_trained,
            "is_enrolling": getattr(vision, "is_enrolling", False),
            "enrollment_count": getattr(vision, "enrollment_count", 0),
            "target_samples": getattr(vision, "target_samples", 20),
        },
    })


@app.route("/api/analytics.png", methods=["GET"])
def analytics_chart():
    """Generates and returns the dark-mode telemetry analytics figure."""
    with events_lock:
        events_copy = list(events)

    png_bytes = generate_analytics_chart(events_copy)
    response = make_response(png_bytes)
    response.headers["Content-Type"] = "image/png"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.route("/api/enroll", methods=["POST"])
def enroll():
    """Triggers live biometric face enrollment."""
    result = vision.start_enrollment()
    return jsonify({
        "status": "enrolling",
        "message": "Biometric enrollment sequence started. Look directly at camera for 20 frames.",
        "target": result.get("target", 20),
    })


@app.route("/api/enroll_status", methods=["GET"])
def enroll_status():
    """Returns real-time facial crop capture progress and model status."""
    return jsonify({
        "is_enrolling": getattr(vision, "is_enrolling", False),
        "count": getattr(vision, "enrollment_count", 0),
        "target": getattr(vision, "target_samples", 20),
        "model_trained": getattr(vision, "model_trained", False),
    })


@app.route("/api/simulate_alert", methods=["POST"])
def simulate_alert():
    """Simulates an intruder detection event and triggers the alert dispatcher."""
    new_event = {
        "id": f"evt-{uuid.uuid4().hex[:6]}",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "type": "Alert",
        "person": "Unidentified Person",
        "confidence": random.randint(25, 46),
        "details": "Simulated security alert: Unidentified subject penetrated Zone B",
        "status": "ALERT",
    }

    with events_lock:
        events.insert(0, new_event)
        _save_events()

    dispatch_result = alert_dispatcher.trigger_security_alert(new_event)

    return jsonify({
        "status": "ok",
        "event": new_event,
        "dispatch": dispatch_result,
    })


@app.route("/api/clear_events", methods=["POST"])
def clear_events():
    """Resets the event log back to fresh seed data."""
    global events
    with events_lock:
        events = _generate_seed_events()
        _save_events()
        alert_dispatcher.clear_history()

    return jsonify({
        "status": "ok",
        "message": "Telemetry event log reset to fresh historical seed data.",
    })


if __name__ == "__main__":
    # use_reloader=False prevents camera device conflict on macOS from duplicate processes
    app.run(host="0.0.0.0", port=5001, debug=True, use_reloader=False, threaded=True)
