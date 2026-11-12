    const githubRepository = "chanespago/ResQ";
    const apkFileName = "com.technichan.resq-app.apk";
    const downloadLink = document.getElementById("apk-download");
    const downloadLabel = document.getElementById("apk-label");
    const downloadStatus = document.getElementById("download-status");
    const downloadModal = document.getElementById("download-modal");
    const downloadConfirm = document.getElementById("apk-download-confirm");
    const closeDownloadModal = () => downloadModal.close();

    document.getElementById("download-modal-close").addEventListener("click", closeDownloadModal);
    document.getElementById("download-modal-cancel").addEventListener("click", closeDownloadModal);
    downloadModal.addEventListener("click", (event) => {
      if (event.target === downloadModal) closeDownloadModal();
    });

    if (githubRepository) {
      const apkUrl = `https://github.com/${githubRepository}/releases/latest/download/${apkFileName}`;
      downloadLink.href = apkUrl;
      downloadConfirm.href = apkUrl;
      downloadLink.removeAttribute("aria-disabled");
      downloadLink.removeAttribute("tabindex");
      downloadLabel.textContent = "Download Android APK";
      downloadStatus.textContent = "Latest version from GitHub Releases · Android APK";
      downloadLink.addEventListener("click", (event) => {
        event.preventDefault();
        downloadModal.showModal();
      });
      document.querySelectorAll('a[href="#download"]').forEach((link) => {
        link.setAttribute("aria-label", "Download ResQ for Android");
      });
    } else {
      downloadLink.addEventListener("click", (event) => event.preventDefault());
    }

    const carousel = document.getElementById("screenshot-carousel");
    const track = carousel.querySelector(".carousel-track");
    const slides = Array.from(track.querySelectorAll(".screen-slide"));
    const dots = Array.from(document.querySelectorAll(".carousel-dot"));
    const previousButton = document.getElementById("screenshot-previous");
    const nextButton = document.getElementById("screenshot-next");
    const carouselStatus = document.getElementById("screenshot-status");
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const firstClone = slides[0].cloneNode(true);
    const lastClone = slides[slides.length - 1].cloneNode(true);
    let activeIndex = 1;
    let autoplayTimer;
    let isHovered = false;
    let hasFocus = false;
    let pointerStartX = null;

    [firstClone, lastClone].forEach((clone) => {
      clone.setAttribute("aria-hidden", "true");
      clone.removeAttribute("aria-current");
      clone.querySelector("img").alt = "";
    });
    track.append(firstClone);
    track.insertBefore(lastClone, track.firstElementChild);
    const allSlides = Array.from(track.querySelectorAll(".screen-slide"));

    const realIndexFor = (index) => (index - 1 + slides.length) % slides.length;

    const updateControls = () => {
      const realIndex = realIndexFor(activeIndex);
      slides.forEach((slide, index) => {
        if (index === realIndex) {
          slide.setAttribute("aria-current", "true");
          dots[index].setAttribute("aria-current", "true");
        } else {
          slide.removeAttribute("aria-current");
          dots[index].removeAttribute("aria-current");
        }
      });
      carouselStatus.textContent = `${realIndex + 1} of ${slides.length}`;
    };

    const positionSlide = (index, animate = true) => {
      activeIndex = index;
      const gap = Number.parseFloat(window.getComputedStyle(track).columnGap);
      const offset = activeIndex * (allSlides[0].offsetWidth + gap);
      track.style.transition = animate ? "" : "none";
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      updateControls();
    };

    const showSlide = (index) => {
      positionSlide((index + allSlides.length) % allSlides.length);
    };

    const stopAutoplay = () => {
      window.clearTimeout(autoplayTimer);
      autoplayTimer = undefined;
    };

    const scheduleAutoplay = () => {
      stopAutoplay();
      if (reducedMotionQuery.matches || isHovered || hasFocus || document.hidden) return;

      autoplayTimer = window.setTimeout(() => {
        showSlide(activeIndex + 1);
        scheduleAutoplay();
      }, 4000);
    };

    previousButton.addEventListener("click", () => {
      showSlide(activeIndex - 1);
      scheduleAutoplay();
    });
    nextButton.addEventListener("click", () => {
      showSlide(activeIndex + 1);
      scheduleAutoplay();
    });
    dots.forEach((dot, index) => dot.addEventListener("click", () => {
      showSlide(index + 1);
      scheduleAutoplay();
    }));

    track.addEventListener("transitionend", (event) => {
      if (event.target !== track || event.propertyName !== "transform") return;
      if (activeIndex === 0) positionSlide(slides.length, false);
      if (activeIndex === slides.length + 1) positionSlide(1, false);
    });

    carousel.addEventListener("mouseenter", () => {
      isHovered = true;
      scheduleAutoplay();
    });
    carousel.addEventListener("mouseleave", () => {
      isHovered = false;
      scheduleAutoplay();
    });
    carousel.addEventListener("focusin", () => {
      hasFocus = true;
      scheduleAutoplay();
    });
    carousel.addEventListener("focusout", (event) => {
      if (carousel.contains(event.relatedTarget)) return;
      hasFocus = false;
      scheduleAutoplay();
    });
    carousel.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      pointerStartX = event.clientX;
    });
    carousel.addEventListener("pointerup", (event) => {
      if (pointerStartX === null) return;
      const distance = event.clientX - pointerStartX;
      pointerStartX = null;
      if (Math.abs(distance) > 40) {
        showSlide(activeIndex + (distance < 0 ? 1 : -1));
        scheduleAutoplay();
      }
    });
    carousel.addEventListener("pointercancel", () => {
      pointerStartX = null;
    });
    document.addEventListener("visibilitychange", scheduleAutoplay);
    reducedMotionQuery.addEventListener("change", () => {
      scheduleAutoplay();
      positionSlide(activeIndex, false);
    });
    window.addEventListener("resize", () => positionSlide(activeIndex, false));

    positionSlide(activeIndex, false);
    scheduleAutoplay();
