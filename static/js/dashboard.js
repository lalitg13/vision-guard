/**
 * VisionGuard — Dashboard Client Controller
 * Polling, live telemetry updates, threat notification handling, and biometric enrollment.
 */

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const alertBanner = document.getElementById("alert-banner");
  const alertBannerTime = document.getElementById("alert-banner-time");
  const alertBannerTitle = document.getElementById("alert-banner-title");
  const alertBannerDetails = document.getElementById("alert-banner-details");
  const alertDismissBtn = document.getElementById("alert-dismiss-btn");

  const btnEnroll = document.getElementById("btn-enroll");
  const btnSimulate = document.getElementById("btn-simulate");
  const btnReset = document.getElementById("btn-reset");

  const kpiTotal = document.getElementById("kpi-total");
  const kpiAuthorized = document.getElementById("kpi-authorized");
  const kpiAlerts = document.getElementById("kpi-alerts");
  const kpiModelStatus = document.getElementById("kpi-model-status");

  const analyticsImg = document.getElementById("analytics-img");
  const activityLog = document.getElementById("activity-log");
  const eventsCountBadge = document.getElementById("events-count-badge");
  const smtpBadge = document.getElementById("smtp-badge");
  const serverClock = document.getElementById("server-clock");
  const toast = document.getElementById("toast");

  // State
  let lastSeenAlertId = null;
  let dismissedAlertId = null;
  let isPolling = false;
  let toastTimeout = null;

  // -------------------------------------------------------------------------
  // Feedback Toast
  // -------------------------------------------------------------------------
  function showToast(message, isAlert = false, duration = 3500) {
    if (!toast) return;
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.remove("hidden");

    if (isAlert) {
      toast.style.borderColor = "rgba(244, 63, 94, 0.4)";
      toast.style.backgroundColor = "#1a0f13";
      toast.style.color = "#fda4af";
    } else {
      toast.style.borderColor = "rgba(255, 255, 255, 0.15)";
      toast.style.backgroundColor = "#181b24";
      toast.style.color = "#f8fafc";
    }

    toastTimeout = setTimeout(() => {
      toast.classList.add("hidden");
    }, duration);
  }

  // -------------------------------------------------------------------------
  // System Clock
  // -------------------------------------------------------------------------
  function updateClock() {
    if (serverClock) {
      const now = new Date();
      serverClock.textContent = `System Time: ${now.toLocaleTimeString()}`;
    }
  }
  setInterval(updateClock, 1000);
  updateClock();

  // -------------------------------------------------------------------------
  // Security Alert Banner
  // -------------------------------------------------------------------------
  alertDismissBtn?.addEventListener("click", () => {
    alertBanner.classList.add("hidden");
    dismissedAlertId = lastSeenAlertId;
  });

  function handleThreatAlert(latestAlert) {
    if (!latestAlert || !latestAlert.id) {
      return;
    }

    // New alert detected that hasn't been dismissed yet
    if (latestAlert.id !== lastSeenAlertId) {
      lastSeenAlertId = latestAlert.id;

      if (latestAlert.id !== dismissedAlertId) {
        alertBannerTime.textContent = latestAlert.timestamp || new Date().toLocaleTimeString();
        alertBannerTitle.textContent = `${latestAlert.person || "Unidentified Person"} Detected`;
        alertBannerDetails.textContent = `${latestAlert.details || "Facial signature mismatch."} (Match score: ${latestAlert.confidence}%)`;
        alertBanner.classList.remove("hidden");
      }
    }
  }

  // -------------------------------------------------------------------------
  // Data Fetching & Metric Updates
  // -------------------------------------------------------------------------
  async function fetchEvents() {
    if (isPolling) return;
    isPolling = true;

    try {
      const response = await fetch("/api/events");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // 1. Update Metrics
      if (data.stats) {
        kpiTotal.textContent = data.stats.total_events?.toLocaleString() || "0";
        kpiAuthorized.textContent = data.stats.authorized_count?.toLocaleString() || "0";
        kpiAlerts.textContent = data.stats.alerts_count?.toLocaleString() || "0";

        if (data.stats.model_trained) {
          kpiModelStatus.textContent = "Trained (LBPH)";
          kpiModelStatus.className = "model-badge badge-trained";
        } else {
          kpiModelStatus.textContent = "Needs Enrollment";
          kpiModelStatus.className = "model-badge badge-untrained";
        }
      }

      // 2. Update Header Badges
      if (eventsCountBadge && data.events) {
        eventsCountBadge.textContent = `${data.events.length} events`;
      }

      if (smtpBadge && data.dispatched_emails) {
        const hasLiveGmail = data.dispatched_emails.some(d => d.mode === "GMAIL_SMTP");
        if (hasLiveGmail) {
          smtpBadge.textContent = "Live Gmail SMTP";
          smtpBadge.style.color = "#34d399";
          smtpBadge.style.borderColor = "rgba(16, 185, 129, 0.35)";
        } else {
          smtpBadge.textContent = "Simulated SMTP";
        }
      }

      // 3. Process Active Threat Alert
      handleThreatAlert(data.latest_alert);

      // 4. Render Activity Feed
      renderActivityLog(data.events || []);

    } catch (err) {
      console.warn("[VisionGuard] Event polling warning:", err);
    } finally {
      isPolling = false;
    }
  }

  // -------------------------------------------------------------------------
  // Activity Feed Renderer
  // -------------------------------------------------------------------------
  function renderActivityLog(events) {
    if (!activityLog) return;

    if (events.length === 0) {
      activityLog.innerHTML = `
        <div class="feed-placeholder">
          <span>No activity recorded in the telemetry buffer.</span>
        </div>
      `;
      return;
    }

    const html = events.map(evt => {
      const isAuth = (evt.type === "Authorized" || evt.status === "GRANTED");
      const rowClass = isAuth ? "activity-row-authorized" : "activity-row-alert";
      const tagClass = isAuth ? "row-tag-auth" : "row-tag-alert";
      const tagText = isAuth ? "Authorized" : "Alert";
      const confClass = evt.confidence >= 60 ? "conf-high" : "conf-low";

      return `
        <div class="activity-row ${rowClass}">
          <div class="row-top">
            <div class="row-badge-group">
              <span class="row-tag ${tagClass}">${tagText}</span>
              <span class="row-person">${escapeHtml(evt.person || (isAuth ? "Admin" : "Unidentified"))}</span>
              <span class="row-confidence ${confClass}">${evt.confidence}% match</span>
            </div>
            <span class="row-time">${escapeHtml(evt.timestamp || "")}</span>
          </div>
          <div class="row-details">${escapeHtml(evt.details || "")}</div>
          <div class="row-id">Event ID: ${escapeHtml(evt.id || "N/A")}</div>
        </div>
      `;
    }).join("");

    activityLog.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // -------------------------------------------------------------------------
  // Auto-Refresh Analytics Chart (Every 4s)
  // -------------------------------------------------------------------------
  function refreshAnalytics() {
    if (analyticsImg) {
      analyticsImg.src = `/api/analytics.png?t=${Date.now()}`;
    }
  }

  // -------------------------------------------------------------------------
  // Action Button Handlers
  // -------------------------------------------------------------------------

  // 1. Enroll Face
  btnEnroll?.addEventListener("click", async () => {
    try {
      btnEnroll.classList.add("loading");
      showToast("Starting face enrollment. Look directly at the camera.");

      const res = await fetch("/api/enroll", { method: "POST" });
      const data = await res.json();

      if (data.status === "enrolling") {
        showToast("Capturing 20 face samples. Please keep looking forward.", false, 5000);
      }
    } catch (err) {
      showToast("Unable to start enrollment sequence.", true);
    } finally {
      setTimeout(() => btnEnroll.classList.remove("loading"), 2500);
    }
  });

  // 2. Simulate Alert
  btnSimulate?.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/simulate_alert", { method: "POST" });
      const data = await res.json();

      showToast("Intrusion alert simulated.", true);
      fetchEvents();
      refreshAnalytics();
    } catch (err) {
      showToast("Unable to simulate alert.", true);
    }
  });

  // 3. Reset Demo
  btnReset?.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/clear_events", { method: "POST" });
      const data = await res.json();

      dismissedAlertId = null;
      lastSeenAlertId = null;
      alertBanner.classList.add("hidden");

      showToast("Demo database reset to seed events.");
      fetchEvents();
      refreshAnalytics();
    } catch (err) {
      showToast("Unable to reset demo data.", true);
    }
  });

  // -------------------------------------------------------------------------
  // Timers & Initial Ingestion
  // -------------------------------------------------------------------------
  fetchEvents();
  setInterval(fetchEvents, 2000);
  setInterval(refreshAnalytics, 4000);
});
