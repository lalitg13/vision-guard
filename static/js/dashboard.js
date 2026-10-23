/**
 * VisionGuard — Dashboard Client Controller
 * Ultra-clean UI controls, real-time telemetry, threat alerts, and Add Admin Face enrollment.
 */

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements — Alert Banner & Feedback
  const alertBanner = document.getElementById("alert-banner");
  const alertBannerTime = document.getElementById("alert-banner-time");
  const alertBannerTitle = document.getElementById("alert-banner-title");
  const alertBannerDetails = document.getElementById("alert-banner-details");
  const alertDismissBtn = document.getElementById("alert-dismiss-btn");
  const toast = document.getElementById("toast");

  // DOM Elements — Action Buttons
  const btnOpenEnroll = document.getElementById("btn-open-enroll");
  const btnCameraEnroll = document.getElementById("btn-camera-enroll");
  const btnSimulate = document.getElementById("btn-simulate");
  const btnReset = document.getElementById("btn-reset");

  // DOM Elements — KPIs & Stream
  const kpiTotal = document.getElementById("kpi-total");
  const kpiAuthorized = document.getElementById("kpi-authorized");
  const kpiAlerts = document.getElementById("kpi-alerts");
  const kpiModelStatus = document.getElementById("kpi-model-status");

  const analyticsImg = document.getElementById("analytics-img");
  const activityLog = document.getElementById("activity-log");
  const eventsCountBadge = document.getElementById("events-count-badge");
  const smtpBadge = document.getElementById("smtp-badge");
  const serverClock = document.getElementById("server-clock");

  // DOM Elements — Add Admin Face Modal
  const adminModal = document.getElementById("admin-modal");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalStartBtn = document.getElementById("modal-start-btn");
  const modalDoneBtn = document.getElementById("modal-done-btn");
  const modalProgressBox = document.getElementById("modal-progress-box");
  const modalProgressBar = document.getElementById("modal-progress-bar");
  const modalStatusText = document.getElementById("modal-status-text");
  const modalCountText = document.getElementById("modal-count-text");
  const modalSuccessBox = document.getElementById("modal-success-box");
  const modalBackdrop = adminModal ? adminModal.querySelector(".modal-backdrop") : null;

  // State
  let lastSeenAlertId = null;
  let dismissedAlertId = null;
  let isPolling = false;
  let toastTimeout = null;
  let enrollmentPollInterval = null;

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
      toast.style.backgroundColor = "rgba(30, 8, 14, 0.95)";
      toast.style.color = "#fda4af";
    } else {
      toast.style.borderColor = "rgba(255, 255, 255, 0.15)";
      toast.style.backgroundColor = "rgba(18, 22, 30, 0.95)";
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
      serverClock.textContent = `SYSTEM TIME: ${now.toLocaleTimeString()}`;
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
    if (!latestAlert || !latestAlert.id) return;

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
  // Data Fetching & Metric Updates (2s Interval)
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
        if (kpiTotal) kpiTotal.textContent = data.stats.total_events?.toLocaleString() || "0";
        if (kpiAuthorized) kpiAuthorized.textContent = data.stats.authorized_count?.toLocaleString() || "0";
        if (kpiAlerts) kpiAlerts.textContent = data.stats.alerts_count?.toLocaleString() || "0";

        if (kpiModelStatus) {
          if (data.stats.model_trained) {
            kpiModelStatus.textContent = "Trained (LBPH Active)";
            kpiModelStatus.className = "model-badge badge-trained font-mono";
          } else {
            kpiModelStatus.textContent = "Untrained (Add Face)";
            kpiModelStatus.className = "model-badge badge-untrained font-mono";
          }
        }
      }

      // 2. Update Header Badges
      if (eventsCountBadge && data.events) {
        eventsCountBadge.textContent = `${data.events.length} events`;
      }

      if (smtpBadge && data.dispatched_emails) {
        const hasLiveGmail = data.dispatched_emails.some(d => d.mode === "GMAIL_SMTP");
        if (hasLiveGmail) {
          smtpBadge.textContent = "Gmail SMTP: Active";
          smtpBadge.style.color = "#34d399";
          smtpBadge.style.borderColor = "rgba(16, 185, 129, 0.35)";
        } else {
          smtpBadge.textContent = "SMTP: Simulated";
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
  // Clean Activity Feed Renderer
  // -------------------------------------------------------------------------
  function renderActivityLog(events) {
    if (!activityLog) return;

    if (events.length === 0) {
      activityLog.innerHTML = `
        <div class="feed-empty font-mono">
          <span>No security events recorded in buffer.</span>
        </div>
      `;
      return;
    }

    const html = events.map(evt => {
      const isAuth = (evt.type === "Authorized" || evt.status === "GRANTED");
      const rowClass = isAuth ? "item-auth" : "item-alert";
      const tagClass = isAuth ? "tag-auth" : "tag-alert";
      const tagText = isAuth ? "AUTHORIZED" : "ALERT";
      const confClass = evt.confidence >= 60 ? "conf-high" : "conf-low";

      return `
        <div class="activity-item ${rowClass}">
          <div class="item-top">
            <div class="item-badges">
              <span class="item-tag ${tagClass}">${tagText}</span>
              <span class="item-name">${escapeHtml(evt.person || (isAuth ? "Admin" : "Unidentified"))}</span>
              <span class="item-conf font-mono ${confClass}">${evt.confidence}% match</span>
            </div>
            <span class="font-mono text-muted text-xs">${escapeHtml(evt.timestamp || "")}</span>
          </div>
          <div class="item-details">${escapeHtml(evt.details || "")}</div>
          <div class="item-footer font-mono">
            <span>ID: ${escapeHtml(evt.id || "N/A")}</span>
            <span>STATUS: ${escapeHtml(evt.status || (isAuth ? "GRANTED" : "ALERT"))}</span>
          </div>
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
  // Add Admin Face Modal Workflow
  // -------------------------------------------------------------------------
  function openAdminModal() {
    if (!adminModal) return;
    // Reset modal state
    modalProgressBox?.classList.add("hidden");
    modalSuccessBox?.classList.add("hidden");
    modalStartBtn?.classList.remove("hidden");
    modalDoneBtn?.classList.add("hidden");
    if (modalProgressBar) modalProgressBar.style.width = "0%";
    if (modalCountText) modalCountText.textContent = "0 / 20";
    if (modalStatusText) modalStatusText.textContent = "Ready to start facial scan.";

    adminModal.classList.remove("hidden");
  }

  function closeAdminModal() {
    if (!adminModal) return;
    adminModal.classList.add("hidden");
    if (enrollmentPollInterval) {
      clearInterval(enrollmentPollInterval);
      enrollmentPollInterval = null;
    }
  }

  // Open triggers
  btnOpenEnroll?.addEventListener("click", openAdminModal);
  btnCameraEnroll?.addEventListener("click", openAdminModal);

  // Close triggers
  modalCloseBtn?.addEventListener("click", closeAdminModal);
  modalCancelBtn?.addEventListener("click", closeAdminModal);
  modalDoneBtn?.addEventListener("click", () => {
    closeAdminModal();
    showToast("Administrator face enrolled successfully!");
    fetchEvents();
    refreshAnalytics();
  });
  modalBackdrop?.addEventListener("click", closeAdminModal);

  // Start Enrollment Sequence
  modalStartBtn?.addEventListener("click", async () => {
    try {
      modalStartBtn.disabled = true;
      modalStartBtn.style.opacity = "0.5";
      modalProgressBox?.classList.remove("hidden");
      modalSuccessBox?.classList.add("hidden");

      if (modalStatusText) modalStatusText.textContent = "Initializing camera sensor...";

      // Trigger server-side enrollment
      const res = await fetch("/api/enroll", { method: "POST" });
      const data = await res.json();

      const target = data.target || 20;

      // Start rapid status polling
      if (enrollmentPollInterval) clearInterval(enrollmentPollInterval);
      enrollmentPollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/enroll_status");
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();

          const count = statusData.count || 0;
          const percent = Math.min(100, Math.round((count / target) * 100));

          if (modalProgressBar) modalProgressBar.style.width = `${percent}%`;
          if (modalCountText) modalCountText.textContent = `${count} / ${target}`;

          if (statusData.is_enrolling) {
            if (modalStatusText) {
              modalStatusText.textContent = `Capturing biometric samples (${count}/${target})... Please look at the camera.`;
            }
          } else if (statusData.model_trained || count >= target) {
            // Finished!
            clearInterval(enrollmentPollInterval);
            enrollmentPollInterval = null;

            if (modalProgressBar) modalProgressBar.style.width = "100%";
            modalProgressBox?.classList.add("hidden");
            modalSuccessBox?.classList.remove("hidden");
            modalStartBtn?.classList.add("hidden");
            modalDoneBtn?.classList.remove("hidden");

            // Update main dashboard metrics immediately
            fetchEvents();
            refreshAnalytics();
          }
        } catch (e) {
          console.warn("[VisionGuard] Error polling enroll status:", e);
        }
      }, 250);

    } catch (err) {
      if (modalStatusText) modalStatusText.textContent = "Failed to start camera capture.";
      showToast("Unable to start facial scan.", true);
    } finally {
      modalStartBtn.disabled = false;
      modalStartBtn.style.opacity = "1";
    }
  });

  // -------------------------------------------------------------------------
  // Other Action Button Handlers
  // -------------------------------------------------------------------------

  // Simulate Intruder Alert
  btnSimulate?.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/simulate_alert", { method: "POST" });
      const data = await res.json();

      showToast("Intrusion threat simulated and dispatched.", true);
      fetchEvents();
      refreshAnalytics();
    } catch (err) {
      showToast("Unable to simulate intrusion alert.", true);
    }
  });

  // Reset Demo Database
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
  // Initial Ingestion & Recurring Polls
  // -------------------------------------------------------------------------
  fetchEvents();
  setInterval(fetchEvents, 2000);
  setInterval(refreshAnalytics, 4000);
});
