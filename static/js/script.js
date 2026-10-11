// Wait for the DOM to fully load before attaching event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Bind buttons to their respective functions
  document
    .getElementById("pasteBtn")
    .addEventListener("click", pasteFromClipboard);
  document
    .getElementById("downloadBtn")
    .addEventListener("click", initiateDownload);
});

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById("urlInput").value = text;
  } catch (err) {
    alert("Clipboard access denied. Please paste manually.");
  }
}

async function initiateDownload() {
  const urlInput = document.getElementById("urlInput");
  const formatSelect = document.getElementById("formatSelect");
  const downloadBtn = document.getElementById("downloadBtn");
  const btnText = document.getElementById("btnText");
  const speedLabel = document.getElementById("speedLabel");
  const etaLabel = document.getElementById("etaLabel");
  const progressBar = document.getElementById("progressBar");
  const progressPercent = document.getElementById("progressPercent");
  const progressText = document.getElementById("progressText");
  const errorMsg = document.getElementById("errorMsg");

  const url = urlInput.value.trim();
  if (!url) {
    errorMsg.innerText = "Please enter a valid YouTube URL.";
    errorMsg.classList.remove("hidden");
    return;
  }

  // Generate a unique ID for this download session
  const clientId = crypto.randomUUID();

  // Set initial loading UI
  errorMsg.classList.add("hidden");
  downloadBtn.disabled = true;
  downloadBtn.classList.add("opacity-50", "cursor-not-allowed");
  btnText.innerText = "Starting Download...";
  progressBar.style.width = "2%";
  progressPercent.innerText = "0%";
  speedLabel.innerText = "--";
  etaLabel.innerText = "--";

  // Start polling the server for progress every 500ms
  const progressInterval = setInterval(async () => {
    try {
      const res = await fetch(`/progress/${clientId}`);
      if (res.ok) {
        const data = await res.json();
        
        if (data.status === 'downloading') {
          btnText.innerText = "Downloading...";
          progressText.innerText = "Downloading from YouTube...";
          progressBar.style.width = data.percent;
          progressPercent.innerText = data.percent;
          speedLabel.innerText = data.speed;
          etaLabel.innerText = data.eta;
        } else if (data.status === 'processing') {
          btnText.innerText = "Processing...";
          progressText.innerText = "Converting file format...";
          progressBar.style.width = "100%";
          progressPercent.innerText = "100%";
          speedLabel.innerText = "Done";
          etaLabel.innerText = "00:00";
        }
      }
    } catch (e) {
      console.log("Polling error:", e);
    }
  }, 500);

  // Send the actual download request
  try {
    const response = await fetch("/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: url,
        format: formatSelect.value,
        client_id: clientId // Send the ID to the server
      }),
    });

    if (!response.ok) {
      let errorMessage = "Download failed on server.";
      try {
        const errData = await response.json();
        errorMessage = errData.error || errorMessage;
      } catch (parseError) {
        errorMessage = "Server error. Check the Python terminal for details.";
      }
      throw new Error(errorMessage);
    }

    progressText.innerText = "Sending file to browser...";

    // Extract filename and trigger download
    const disposition = response.headers.get("Content-Disposition");
    let filename = "download." + formatSelect.value;
    if (disposition && disposition.includes("filename=")) {
      filename = disposition.split("filename=")[1].replace(/["']/g, "");
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);

    // Reset UI to success state
    progressText.innerText = "Download complete!";

  } catch (error) {
    errorMsg.innerText = error.message;
    errorMsg.classList.remove("hidden");
    progressBar.style.width = "0%";
    progressPercent.innerText = "0%";
    progressText.innerText = "Failed";
    speedLabel.innerText = "--";
    etaLabel.innerText = "--";
  } finally {
    // Stop polling and re-enable button
    clearInterval(progressInterval);
    downloadBtn.disabled = false;
    downloadBtn.classList.remove("opacity-50", "cursor-not-allowed");
    btnText.innerText = "Download Video";
  }
}
