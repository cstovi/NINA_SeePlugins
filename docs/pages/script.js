/* See Plugins — landing page interactions */

(function () {
  "use strict";

  // --- Copy repository URL ---
  var copyBtn = document.getElementById("copyBtn");
  var copyText = document.getElementById("copyText");
  var repoUrl = document.getElementById("repoUrl");
  var url = repoUrl ? repoUrl.textContent.trim() : "";

  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(url)
          .then(function () {
            flashCopied();
          })
          .catch(function () {
            fallbackCopy();
          });
      } else {
        fallbackCopy();
      }
    });
  }

  function flashCopied() {
    copyBtn.classList.add("copied");
    copyText.textContent = "Copied!";
    setTimeout(function () {
      copyBtn.classList.remove("copied");
      copyText.textContent = "Copy";
    }, 1800);
  }

  function fallbackCopy() {
    var ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      flashCopied();
    } catch (e) {
      copyText.textContent = "Select the URL above";
    }
    document.body.removeChild(ta);
  }

  // --- Reveal-on-scroll ---
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("visible");
    });
  }
})();
