"""VisionGuard OpenCV Biometric & Telemetry Engine.

Provides real-time Haar-cascade face detection, LBPH facial recognition,
live biometric enrollment, HUD visual annotations, and MJPEG video streaming.
"""

import os
import time
import threading
import cv2
import numpy as np


class VisionEngine:
    def __init__(self, event_callback=None, data_dir="data"):
        self.data_dir = data_dir
        self.known_faces_dir = os.path.join(data_dir, "known_faces")
        self.trainer_path = os.path.join(data_dir, "trainer.yml")
        self.event_callback = event_callback

        os.makedirs(self.known_faces_dir, exist_ok=True)

        # Load Haar Cascade
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        if self.face_cascade.empty():
            local_cascade = os.path.join(self.data_dir, "haarcascade_frontalface_default.xml")
            if os.path.exists(local_cascade):
                self.face_cascade = cv2.CascadeClassifier(local_cascade)

        # LBPH Recognizer
        self.recognizer = cv2.face.LBPHFaceRecognizer_create()
        self.model_trained = False
        self._load_existing_trainer()

        # Enrollment state
        self.is_enrolling = False
        self.enrollment_count = 0
        self.target_samples = 20
        self.enrollment_samples = []

        # Cooldown management (6 seconds per person type)
        self.cooldown_seconds = 6.0
        self.last_event_time = {
            "Authorized": 0.0,
            "Unidentified": 0.0,
        }

        # Video capture & thread lock
        self.lock = threading.Lock()
        self.cap = None
        self._init_camera()

    def _init_camera(self):
        """Attempts to initialize cv2.VideoCapture(0)."""
        try:
            self.cap = cv2.VideoCapture(0)
            if not self.cap.isOpened():
                self.cap = None
        except Exception:
            self.cap = None

    def _load_existing_trainer(self):
        """Loads pre-trained LBPH weights if available."""
        if os.path.exists(self.trainer_path):
            try:
                self.recognizer.read(self.trainer_path)
                self.model_trained = True
            except Exception as e:
                print(f"[VisionEngine] Warning: Failed to load {self.trainer_path}: {e}")
                self.model_trained = False

    def start_enrollment(self):
        """Starts capturing 20 facial samples for the authorized administrator."""
        with self.lock:
            self.is_enrolling = True
            self.enrollment_count = 0
            self.enrollment_samples = []
            return {"status": "enrolling", "target": self.target_samples}

    def _finish_enrollment(self):
        """Trains the LBPH recognizer with captured samples and saves weights."""
        if not self.enrollment_samples:
            self.is_enrolling = False
            return False

        try:
            labels = np.ones(len(self.enrollment_samples), dtype=np.int32)
            self.recognizer.train(self.enrollment_samples, labels)
            # Both write and save exist across OpenCV releases
            if hasattr(self.recognizer, "write"):
                self.recognizer.write(self.trainer_path)
            else:
                self.recognizer.save(self.trainer_path)

            self.model_trained = True
            self.is_enrolling = False

            # Notify callback of successful enrollment
            if self.event_callback:
                self.event_callback(
                    person_type="Authorized",
                    confidence=99,
                    details="Admin face enrolled successfully (20 samples trained)",
                )
            return True
        except Exception as e:
            print(f"[VisionEngine] Error training model: {e}")
            self.is_enrolling = False
            return False

    def _draw_hud_box(self, frame, x, y, w, h, color, text):
        """Draws modern security HUD bounding box with corner highlights and a badge."""
        # Main bounding box
        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)

        # High-tech corner accents
        line_len = min(18, w // 4, h // 4)
        thickness = 3
        # Top-left
        cv2.line(frame, (x, y), (x + line_len, y), color, thickness)
        cv2.line(frame, (x, y), (x, y + line_len), color, thickness)
        # Top-right
        cv2.line(frame, (x + w, y), (x + w - line_len, y), color, thickness)
        cv2.line(frame, (x + w, y), (x + w, y + line_len), color, thickness)
        # Bottom-left
        cv2.line(frame, (x, y + h), (x + line_len, y + h), color, thickness)
        cv2.line(frame, (x, y + h), (x, y + h - line_len), color, thickness)
        # Bottom-right
        cv2.line(frame, (x + w, y + h), (x + w - line_len, y + h), color, thickness)
        cv2.line(frame, (x + w, y + h), (x + w, y + h - line_len), color, thickness)

        # Header Badge
        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.55
        text_thickness = 1
        (label_w, label_h), baseline = cv2.getTextSize(text, font, font_scale, text_thickness)

        badge_y = max(0, y - label_h - 10)
        # Background pill
        cv2.rectangle(
            frame,
            (x, badge_y),
            (x + label_w + 12, badge_y + label_h + 10),
            color,
            cv2.FILLED,
        )
        # Badge label text (dark contrast text on bright badge)
        cv2.putText(
            frame,
            text,
            (x + 6, badge_y + label_h + 4),
            font,
            font_scale,
            (10, 10, 15),
            text_thickness + 1,
            cv2.LINE_AA,
        )

    def _create_offline_frame(self):
        """Generates a stylish dark fallback frame when the webcam stream is unavailable."""
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        # Deep dark zinc background #121215
        frame[:] = (21, 18, 18)

        # Subtle defense-tech grid lines
        grid_color = (35, 30, 30)
        for gx in range(0, 640, 40):
            cv2.line(frame, (gx, 0), (gx, 480), grid_color, 1)
        for gy in range(0, 480, 40):
            cv2.line(frame, (0, gy), (640, gy), grid_color, 1)

        # Central alert box
        cv2.rectangle(frame, (60, 160), (580, 320), (30, 30, 45), -1)
        cv2.rectangle(frame, (60, 160), (580, 320), (50, 50, 220), 2)

        # Offline Warning Text
        font = cv2.FONT_HERSHEY_SIMPLEX
        main_text = "CAMERA STREAM OFFLINE / CHECK PERMISSIONS"
        (tw, th), _ = cv2.getTextSize(main_text, font, 0.65, 2)
        tx = (640 - tw) // 2
        cv2.putText(frame, main_text, (tx, 225), font, 0.65, (50, 50, 240), 2, cv2.LINE_AA)

        sub_text = "Connect webcam or grant camera access to activate live stream"
        (sw, sh), _ = cv2.getTextSize(sub_text, font, 0.45, 1)
        sx = (640 - sw) // 2
        cv2.putText(frame, sub_text, (sx, 260), font, 0.45, (160, 160, 175), 1, cv2.LINE_AA)

        # Top telemetry bar
        cv2.rectangle(frame, (0, 0), (640, 35), (25, 20, 20), -1)
        cv2.putText(frame, "VISIONGUARD // SYSTEM OFFLINE", (15, 23), font, 0.5, (120, 120, 140), 1, cv2.LINE_AA)
        
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, timestamp, (450, 23), font, 0.45, (100, 100, 120), 1, cv2.LINE_AA)

        return frame

    def process_frame(self, frame):
        """Performs face detection, recognition, and HUD annotations on a camera frame."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.15,
            minNeighbors=5,
            minSize=(80, 80),
        )

        now = time.time()

        for (x, y, w, h) in faces:
            # Crop 200x200 grayscale face
            face_roi = gray[y : y + h, x : x + w]
            try:
                face_crop = cv2.resize(face_roi, (200, 200))
            except Exception:
                continue

            # Case 1: Enrollment Mode
            if self.is_enrolling:
                self.enrollment_count += 1
                crop_path = os.path.join(
                    self.known_faces_dir, f"admin_{self.enrollment_count}.jpg"
                )
                cv2.imwrite(crop_path, face_crop)
                self.enrollment_samples.append(face_crop)

                # Cyan HUD Box (BGR: 255, 255, 0)
                cyan_color = (255, 255, 0)
                hud_text = f"ENROLLING: {self.enrollment_count}/{self.target_samples}"
                self._draw_hud_box(frame, x, y, w, h, cyan_color, hud_text)

                if self.enrollment_count >= self.target_samples:
                    self._finish_enrollment()
                continue

            # Case 2: Recognition with Trained Model
            if self.model_trained:
                try:
                    label, distance = self.recognizer.predict(face_crop)
                except Exception:
                    distance = 999

                # LBPH distance < 75 is an authorized match
                if distance < 75:
                    # Calculate confidence percentage (lower distance = higher confidence)
                    # Maps distance [0, 75] -> [98%, 68%]
                    conf_pct = int(max(60, min(99, 100 - (distance * 0.45))))

                    # Emerald Green Box (BGR: 129, 185, 16)
                    emerald_color = (129, 185, 16)
                    hud_text = f"ACCESS GRANTED: Admin ({conf_pct}%)"
                    self._draw_hud_box(frame, x, y, w, h, emerald_color, hud_text)

                    # Trigger event with 6s cooldown
                    if now - self.last_event_time["Authorized"] >= self.cooldown_seconds:
                        self.last_event_time["Authorized"] = now
                        if self.event_callback:
                            self.event_callback(
                                person_type="Authorized",
                                confidence=conf_pct,
                                details="Admin verified via facial biometrics",
                            )
                    continue

            # Case 3: Unidentified Person (Untrained or Distance >= 75)
            # Crimson Red Box (BGR: 40, 40, 220)
            crimson_color = (40, 40, 220)
            hud_text = "ALERT: UNIDENTIFIED PERSON"
            self._draw_hud_box(frame, x, y, w, h, crimson_color, hud_text)

            # Trigger alert with 6s cooldown
            if now - self.last_event_time["Unidentified"] >= self.cooldown_seconds:
                self.last_event_time["Unidentified"] = now
                if self.event_callback:
                    self.event_callback(
                        person_type="Unidentified",
                        confidence=32,
                        details="Unidentified person detected in restricted area",
                    )

        return frame

    def generate_frames(self):
        """Yields MJPEG stream chunks for Flask route."""
        while True:
            frame = None
            if self.cap is not None:
                with self.lock:
                    ret, raw_frame = self.cap.read()
                    if ret and raw_frame is not None:
                        frame = self.process_frame(raw_frame)
                    else:
                        # Attempt to re-open if camera lost
                        self._init_camera()

            if frame is None:
                frame = self._create_offline_frame()
                time.sleep(0.08)  # prevent tight loop when offline

            ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ret:
                continue

            frame_bytes = buffer.tobytes()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
            )

    def release(self):
        """Releases the video capture device."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None
