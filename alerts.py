"""VisionGuard Security Alert Dispatcher.

Handles alerting for security anomalies (unidentified persons or intrusion events).
Dispatches live alerts via Gmail SMTP SSL when configured, or logs in SIMULATED_SMTP mode.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime


class AlertDispatcher:
    def __init__(self):
        self.dispatch_history = []

    def trigger_security_alert(self, event):
        """Triggers a security alert notification based on the provided event.

        Args:
            event (dict): The event dictionary containing id, timestamp, type,
                          confidence, and details.

        Returns:
            dict: Summary record of the dispatch attempt.
        """
        sender_email = os.environ.get("VISIONGUARD_EMAIL")
        app_password = os.environ.get("VISIONGUARD_APP_PASSWORD")
        recipient_email = os.environ.get("VISIONGUARD_ALERT_TO", sender_email or "security-team@visionguard.local")

        event_id = event.get("id", "N/A")
        timestamp = event.get("timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        confidence = event.get("confidence", 0)
        details = event.get("details", "Unidentified subject detected in monitored area.")

        # Check if Gmail credentials are provided
        if sender_email and app_password:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = f"🚨 [VisionGuard Alert] Unidentified Subject Detected ({confidence}%)"
                msg["From"] = sender_email
                msg["To"] = recipient_email

                text_content = (
                    f"VISIONGUARD SECURITY ALERT\n"
                    f"========================\n"
                    f"Event ID:    {event_id}\n"
                    f"Timestamp:   {timestamp}\n"
                    f"Type:        UNIDENTIFIED_PERSON\n"
                    f"Confidence:  {confidence}%\n"
                    f"Details:     {details}\n\n"
                    f"Access the VisionGuard live HUD dashboard to review real-time telemetry."
                )
                msg.attach(MIMEText(text_content, "plain"))

                with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                    server.login(sender_email, app_password)
                    server.sendmail(sender_email, [recipient_email], msg.as_string())

                dispatch_record = {
                    "id": event_id,
                    "timestamp": timestamp,
                    "recipient": recipient_email,
                    "mode": "GMAIL_SMTP",
                    "status": "SENT",
                    "confidence": confidence,
                    "details": details,
                }
                self.dispatch_history.append(dispatch_record)
                print(f"🚨 [VISIONGUARD ALERT] Email dispatched via Gmail SMTP to {recipient_email} (Event {event_id})")
                return dispatch_record

            except Exception as e:
                print(f"🚨 [VISIONGUARD ALERT] SMTP transmission failed: {e}. Falling back to SIMULATED_SMTP.")

        # SIMULATED_SMTP Mode
        dispatch_record = {
            "id": event_id,
            "timestamp": timestamp,
            "recipient": recipient_email,
            "mode": "SIMULATED_SMTP",
            "status": "DISPATCHED",
            "confidence": confidence,
            "details": details,
        }
        self.dispatch_history.append(dispatch_record)

        print("\n" + "=" * 60)
        print("🚨 [VISIONGUARD ALERT] UNIDENTIFIED PERSON DETECTED")
        print(f"   Event ID:    {event_id}")
        print(f"   Timestamp:   {timestamp}")
        print(f"   Confidence:  {confidence}%")
        print(f"   Details:     {details}")
        print("   Mode:        SIMULATED_SMTP")
        print("   Notice:      Set VISIONGUARD_EMAIL and VISIONGUARD_APP_PASSWORD")
        print("                to dispatch live Gmail alerts.")
        print("=" * 60 + "\n")

        return dispatch_record

    def get_history(self):
        """Returns the full dispatch history."""
        return list(self.dispatch_history)

    def clear_history(self):
        """Clears all dispatch records."""
        self.dispatch_history.clear()
