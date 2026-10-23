"""VisionGuard Headless Matplotlib Telemetry Engine.

Generates dark-mode telemetry figures comparing authorized access vs. security alerts
and plotting recent biometric confidence trends.
"""

import os
import io
import tempfile
from datetime import datetime, timedelta

# CRITICAL for macOS and multi-threaded Flask: configure headless backend before importing pyplot
os.environ.setdefault("MPLCONFIGDIR", os.path.join(tempfile.gettempdir(), "visionguard_matplotlib"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def _parse_timestamp(ts):
    """Safely parses timestamp strings or datetime objects."""
    if isinstance(ts, datetime):
        return ts
    if not isinstance(ts, str):
        return datetime.now()

    # Try common formats
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
    ):
        try:
            return datetime.strptime(ts, fmt)
        except ValueError:
            pass
    return datetime.now()


def generate_analytics_chart(events):
    """Renders a 2-subplot dark mode telemetry chart from historical event records.

    Returns:
        bytes: Raw PNG image bytes.
    """
    if events is None:
        events = []

    # Zinc dark mode color palette
    bg_color = "#18181b"
    card_color = "#18181b"
    grid_color = "#27272a"
    text_color = "#f4f4f5"
    muted_text = "#a1a1aa"
    color_auth = "#10b981"  # Emerald Green
    color_alert = "#ef4444"  # Crimson Red

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11.5, 4.2), facecolor=bg_color)

    # -------------------------------------------------------------
    # Left Subplot: Last 8 Rolling Hours Grouped Bar Chart
    # -------------------------------------------------------------
    now = datetime.now()
    rolling_labels = []
    auth_counts = [0] * 8
    alert_counts = [0] * 8

    # Create 8 rolling 1-hour bins (-7h, -6h, ..., now)
    for i in range(7, -1, -1):
        bin_time = now - timedelta(hours=i)
        if i == 0:
            rolling_labels.append("Current")
        else:
            rolling_labels.append(bin_time.strftime("%H:00"))

    # Aggregate events into hourly bins
    for evt in events:
        ts = _parse_timestamp(evt.get("timestamp"))
        diff_hours = int((now - ts).total_seconds() // 3600)
        if 0 <= diff_hours < 8:
            bin_idx = 7 - diff_hours
            evt_type = str(evt.get("type", "")).lower()
            if "auth" in evt_type or "admin" in evt_type or evt.get("status") == "GRANTED":
                auth_counts[bin_idx] += 1
            else:
                alert_counts[bin_idx] += 1

    x = np.arange(8)
    bar_width = 0.36

    rects1 = ax1.bar(
        x - bar_width / 2,
        auth_counts,
        bar_width,
        label="Authorized Access",
        color=color_auth,
        edgecolor="#059669",
        linewidth=0.8,
        alpha=0.9,
    )
    rects2 = ax1.bar(
        x + bar_width / 2,
        alert_counts,
        bar_width,
        label="Unidentified Alert",
        color=color_alert,
        edgecolor="#dc2626",
        linewidth=0.8,
        alpha=0.9,
    )

    ax1.set_facecolor(card_color)
    ax1.set_title("Activity by Hour (Last 8h)", color=text_color, fontsize=11, fontweight="bold", pad=12)
    ax1.set_xticks(x)
    ax1.set_xticklabels(rolling_labels, color=muted_text, fontsize=8.5, rotation=15)
    ax1.set_ylabel("Detection Count", color=muted_text, fontsize=9)
    ax1.tick_params(colors=muted_text, labelsize=8.5)
    ax1.grid(color=grid_color, linestyle="-", linewidth=0.7, axis="y", alpha=0.8)
    ax1.set_axisbelow(True)

    # Style spines
    for spine in ax1.spines.values():
        spine.set_color(grid_color)
        spine.set_linewidth(0.8)

    # Integer y-ticks
    max_val = max(max(auth_counts), max(alert_counts), 3)
    ax1.set_ylim(0, max_val + 1.5)
    ax1.yaxis.get_major_locator().set_params(integer=True)

    ax1.legend(
        facecolor="#27272a",
        edgecolor="#3f3f46",
        labelcolor=text_color,
        fontsize=8.5,
        loc="upper left",
        framealpha=0.9,
    )

    # -------------------------------------------------------------
    # Right Subplot: Last 15 Detections Confidence Scores (Line + Scatter)
    # -------------------------------------------------------------
    ax2.set_facecolor(card_color)
    ax2.set_title("Biometric Confidence Trend (Last 15)", color=text_color, fontsize=11, fontweight="bold", pad=12)

    # Take the latest 15 detections (chronological: oldest to newest of the 15)
    recent_events = events[:15] if len(events) <= 15 else events[-15:]
    # If list came in descending (newest first), reverse to show progression
    if len(recent_events) > 1:
        first_ts = _parse_timestamp(recent_events[0].get("timestamp"))
        last_ts = _parse_timestamp(recent_events[-1].get("timestamp"))
        if first_ts > last_ts:
            recent_events = list(reversed(recent_events))

    if recent_events:
        indices = np.arange(1, len(recent_events) + 1)
        confidences = []
        is_auth_list = []

        for e in recent_events:
            conf = e.get("confidence", 50)
            try:
                conf = float(conf)
            except (ValueError, TypeError):
                conf = 50.0
            confidences.append(conf)

            evt_type = str(e.get("type", "")).lower()
            is_auth = "auth" in evt_type or "admin" in evt_type or e.get("status") == "GRANTED"
            is_auth_list.append(is_auth)

        # Plot trend line
        ax2.plot(
            indices,
            confidences,
            color="#52525b",
            linestyle="--",
            linewidth=1.6,
            alpha=0.85,
            zorder=2,
            label="Confidence Path",
        )

        # Scatter points color-coded
        for idx, conf, is_auth in zip(indices, confidences, is_auth_list):
            color = color_auth if is_auth else color_alert
            ax2.scatter(
                idx,
                conf,
                color=color,
                edgecolor=card_color,
                linewidth=1.5,
                s=80,
                zorder=3,
            )

        # Custom dummy handles for scatter legend
        ax2.scatter([], [], color=color_auth, s=60, label="Authorized Match")
        ax2.scatter([], [], color=color_alert, s=60, label="Unidentified Alert")

        ax2.set_xticks(indices)
        ax2.set_xticklabels([f"#{i}" for i in indices], color=muted_text, fontsize=8)
        ax2.set_xlim(0.5, len(recent_events) + 0.5)
    else:
        # Empty placeholder state
        ax2.text(
            0.5,
            0.5,
            "No Telemetry Events Recorded",
            color=muted_text,
            ha="center",
            va="center",
            transform=ax2.transAxes,
            fontsize=10,
        )
        ax2.set_xticks([])

    ax2.set_ylabel("Confidence Score (%)", color=muted_text, fontsize=9)
    ax2.set_ylim(0, 105)
    ax2.tick_params(colors=muted_text, labelsize=8.5)
    ax2.grid(color=grid_color, linestyle="-", linewidth=0.7, alpha=0.8)
    ax2.set_axisbelow(True)

    for spine in ax2.spines.values():
        spine.set_color(grid_color)
        spine.set_linewidth(0.8)

    ax2.legend(
        facecolor="#27272a",
        edgecolor="#3f3f46",
        labelcolor=text_color,
        fontsize=8.5,
        loc="lower left",
        framealpha=0.9,
    )

    plt.tight_layout(pad=2.0)

    # Save to memory buffer
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, facecolor=fig.get_facecolor(), bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()
