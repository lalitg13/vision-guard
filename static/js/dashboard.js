/**
 * VisionGuard Biometric & Security Telemetry HUD Client
 * 
 * Handles real-time polling of events, threat detection alerts,
 * headless Matplotlib analytics chart refresh, and interactive biometric enrollment.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Elements
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
  // Toast Notifications
  // -------------------------------------------------------------------------
  function showToast(message, isAlert = false, duration = 4000) {
    if (!toast) return;
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.remove("hidden");
    if (isAlert) {
      toast.style.borderColor = "#ef4444";
      toast.style.backgroundColor = "#450a0a";
    } else {
      toast.style.borderColor = "#38bdf8";
      toast.style.backgroundColor = "#1e293b";
    }
    toastTimeout = setTimeout(() => {
      toast.classList.add("hidden");
    }, duration);
  }

  // -------------------------------------------------------------------------
  // Digital Clock
  // -------------------------------------------------------------------------
  function updateClock() {
    if (serverClock) {
      const now = new Date();
      serverClock.textContent = `SYSTEM TIME: ${now.toTimeString().split(" ")[0]} UTC${now.getTimezoneOffset() <= 0 ? "+" : "-"}${Math.abs(Math.floor(now.getTimezoneOffset() / 60))}`;
    }
  }
  setInterval(updateClock, 1000);
  updateClock();

  // -------------------------------------------------------------------------
  // Threat Alert Banner
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
        alertBannerTitle.textContent = `${latestAlert.person || "Unidentified Person"} Detected!`;
        alertBannerDetails.textContent = `${latestAlert.details || "Facial biometric signature mismatch."} (Confidence: ${latestAlert.confidence}%)`;
        alertBanner.classList.remove("hidden");
      }
    }
  }

  // -------------------------------------------------------------------------
  // Fetch Events & Update KPIs
  // -------------------------------------------------------------------------
  async function fetchEvents() {
    if (isPolling) return;
    isPolling = true;

    try {
      const response = await fetch("/api/events");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // 1. Update KPIs
      if (data.stats) {
        kpiTotal.textContent = data.stats.total_events?.toLocaleString() || "0";
        kpiAuthorized.textContent = data.stats.authorized_count?.toLocaleString() || "0";
        kpiAlerts.textContent = data.stats.alerts_count?.toLocaleString() || "0";

        if (data.stats.model_trained) {
          kpiModelStatus.textContent = "TRAINED (LBPH)";
          kpiModelStatus.className = "kpi-badge kpi-badge-trained";
        } else {
          kpiModelStatus.textContent = "UNTRAINED (ENROLL NEEDED)";
          kpiModelStatus.className = "kpi-badge kpi-badge-untrained";
        }
      }

      // 2. Update Header Badges
      if (eventsCountBadge && data.events) {
        eventsCountBadge.textContent = `${data.events.length} EVENTS`;
      }

      if (smtpBadge && data.dispatched_emails) {
        const hasLiveGmail = data.dispatched_emails.some(d => d.mode === "GMAIL_SMTP");
        if (hasLiveGmail) {
          smtpBadge.textContent = "SMTP: GMAIL LIVE";
          smtpBadge.style.color = "#10b981";
          smtpBadge.style.borderColor = "rgba(16, 185, 129, 0.4)";
        } else {
          smtpBadge.textContent = "SMTP: SIMULATED";
        }
      }

      // 3. Check for New Threat Alert
      handleThreatAlert(data.latest_alert);

      // 4. Render Activity Log
      renderActivityLog(data.events || []);

    } catch (err) {
      console.warn("[VisionGuard HUD] Events fetch error:", err);
    } finally {
      isPolling = false;
    }
  }

  // -------------------------------------------------------------------------
  // Render Activity Log Feed
  // -------------------------------------------------------------------------
  function renderActivityLog(events) {
    if (!activityLog) return;

    if (events.length === 0) {
      activityLog.innerHTML = `
        <div class="empty-state">
          <span>No security events recorded in current telemetry buffer.</span>
        </div>
      `;
      return;
    }

    const html = events.map(evt => {
      const isAuth = (evt.type === "Authorized" || evt.status === "GRANTED");
      const itemClass = isAuth ? "item-auth" : "item-alert";
      const badgeClass = isAuth ? "item-type-auth" : "item-type-alert";
      const badgeText = isAuth ? "AUTHORIZED" : "SECURITY ALERT";
      const confClass = evt.confidence >= 60 ? "high" : "low";

      return `
        <div class="activity-item ${itemClass}">
          <div class="item-top">
            <div class="item-badge-group">
              <span class="item-type-badge ${badgeClass}">${badgeText}</span>
              <span class="item-person">${escapeHtml(evt.person || (isAuth ? "Admin" : "Unidentified"))}</span>
              <span class="item-confidence ${confClass}">${evt.confidence}% MATCH</span>
            </div>
            <span class="item-timestamp">${escapeHtml(evt.timestamp || "")}</span>
          </div>
          <div class="item-details">${escapeHtml(evt.details || "")}</div>
          <div class="item-id">EVENT ID: ${escapeHtml(evt.id || "N/A")}</div>
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
  // Auto-Refresh Analytics Chart (Every 4 Seconds)
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
      showToast("📸 Initializing Biometric Face Enrollment... Look directly at the camera!");

      const res = await fetch("/api/enroll", { method: "POST" });
      const data = await res.json();

      if (data.status === "enrolling") {
        showToast("📸 Capturing 20 biometric crops. Keep your face centered in the camera feed...", false, 6000);
      }
    } catch (err) {
      showToast("❌ Failed to initiate enrollment sequence.", true);
    } finally {
      setTimeout(() => btnEnroll.classList.remove("loading"), 2500);
    }
  });

  // 2. Simulate Intruder Alert
  btnSimulate?.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/simulate_alert", { method: "POST" });
      const data = await res.json();

      showToast("🚨 Security Alert: Intrusion simulation dispatched!", true);
      // Immediately refresh telemetry
      fetchEvents();
      refreshAnalytics();
    } catch (err) {
      showToast("❌ Failed to simulate alert.", true);
    }
  });

  // 3. Reset Demo Data
  btnReset?.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/clear_events", { method: "POST" });
      const data = await res.json();

      dismissedAlertId = null;
      lastSeenAlertId = null;
      alertBanner.classList.add("hidden");

      showToast("🔄 Telemetry database reset to 28 fresh seed events.");
      fetchEvents();
      refreshAnalytics();
    } catch (err) {
      showToast("❌ Failed to reset demo data.", true);
    }
  });

  // -------------------------------------------------------------------------
  // Initialization & Timers
  // -------------------------------------------------------------------------
  // Initial fetch
  fetchEvents();

  // Poll events every 2 seconds
  setInterval(fetchEvents, 2000);

  // Refresh analytics chart every 4 seconds with cache-buster
  setInterval(refreshAnalytics, 4000);
});
