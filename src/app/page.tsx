"use client";

import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "./warehouse.css";

type AuditStatus = "correct" | "misplaced" | "unknown";

type AuditItem = {
  package: number;
  sku: string;
  abc: string;
  actual_bin: string;
  expected_bin: string;
  allowed_level: string;
  location_check: boolean;
  abc_check: boolean;
  status: AuditStatus;
  instruction: string;
};

type AuditSummary = {
  total_packages: number;
  correct_count?: number;
  misplaced_count?: number;
  unknown_count?: number;
  misplaced_percent?: number;
  unknown_percent?: number;
  items?: AuditItem[];
};

type AuditResult = {
  outputImage: string | null;
  summary: AuditSummary | null;
  correctCount: number;
  misplacedCount: number;
  unknownCount: number;
  misplacedPercent: number;
  unknownPercent: number;
  isCompliant: boolean;
  instructions: string[];
};

type PanPosition = {
  x: number;
  y: number;
};

type DragStart = {
  pointerX: number;
  pointerY: number;
  imageX: number;
  imageY: number;
};

type TorchMediaTrackCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
};

type TorchMediaTrackConstraintSet = MediaTrackConstraintSet & {
  torch?: boolean;
};

async function runWarehouseAudit(file: File): Promise<AuditResult> {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch("/api/inspect", {
    method: "POST",
    body: formData,
  });

  const contentType = response.headers.get("content-type") ?? "";

  const data = contentType.includes("application/json")
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.details?.message ||
        `Không thể kiểm tra ảnh. Mã lỗi: ${response.status}`
    );
  }

  return data as AuditResult;
}

function statusLabel(status: AuditStatus) {
  if (status === "correct") return "Correct";
  if (status === "misplaced") return "Misplaced";
  return "Unknown";
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [result, setResult] = useState<AuditResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);

  const [viewerImage, setViewerImage] = useState<string | null>(
    null
  );
  const [viewerTitle, setViewerTitle] = useState("");
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState<PanPosition>({
    x: 0,
    y: 0,
  });
  const [dragging, setDragging] = useState(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [flashChanging, setFlashChanging] = useState(false);
  const [cameraNotice, setCameraNotice] = useState("");

  const dragStartRef = useRef<DragStart | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!previewUrl) return;

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!viewerImage && !cameraOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (cameraOpen) {
          closeCamera();
        } else {
          closeImageViewer();
        }
      }

      if (viewerImage && (event.key === "+" || event.key === "=")) {
        zoomIn();
      }

      if (viewerImage && event.key === "-") {
        zoomOut();
      }

      if (viewerImage && event.key === "0") {
        resetZoom();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewerImage, cameraOpen]);

  const totalPackages =
    result?.summary?.total_packages ??
    (result
      ? result.correctCount +
        result.misplacedCount +
        result.unknownCount
      : 0);

  const chartPercentages = useMemo(() => {
    if (!result || totalPackages <= 0) {
      return {
        correct: 0,
        misplaced: 0,
        unknown: 0,
      };
    }

    return {
      correct: Number(
        ((result.correctCount / totalPackages) * 100).toFixed(1)
      ),
      misplaced: Number(
        ((result.misplacedCount / totalPackages) * 100).toFixed(1)
      ),
      unknown: Number(
        ((result.unknownCount / totalPackages) * 100).toFixed(1)
      ),
    };
  }, [result, totalPackages]);

  const pieBackground = useMemo(() => {
    const correctEnd = chartPercentages.correct;
    const misplacedEnd =
      chartPercentages.correct + chartPercentages.misplaced;

    return `conic-gradient(
      #22a95b 0% ${correctEnd}%,
      #e53935 ${correctEnd}% ${misplacedEnd}%,
      #7b8495 ${misplacedEnd}% 100%
    )`;
  }, [chartPercentages]);

  const auditItems = result?.summary?.items ?? [];

  function stopCameraStream() {
    const stream = streamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    setFlashOn(false);
    setFlashSupported(false);
    setFlashChanging(false);
    setCameraNotice("");
  }

  function closeCamera() {
    stopCameraStream();
    setCameraOpen(false);
    setCameraStarting(false);
  }

  function openImageViewer(imageUrl: string, title: string) {
    if (!imageUrl) return;

    setViewerImage(imageUrl);
    setViewerTitle(title);
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setDragging(false);
    dragStartRef.current = null;
  }

  function closeImageViewer() {
    setViewerImage(null);
    setViewerTitle("");
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setDragging(false);
    dragStartRef.current = null;
  }

  function applySelectedImage(selectedFile: File) {
    if (!selectedFile.type.startsWith("image/")) {
      setError("Vui lòng chọn một tệp ảnh hợp lệ.");
      return;
    }

    if (selectedFile.size > 15 * 1024 * 1024) {
      setError("Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 15 MB.");
      return;
    }

    const newPreviewUrl = URL.createObjectURL(selectedFile);

    setFile(selectedFile);
    setPreviewUrl(newPreviewUrl);
    setResult(null);
    setError("");
    setUploadMenuOpen(false);

    closeCamera();
    closeImageViewer();
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    event.target.value = "";

    if (!selectedFile) return;

    applySelectedImage(selectedFile);
  }

  async function waitForVideo(video: HTMLVideoElement) {
    await new Promise<void>((resolve, reject) => {
      let finished = false;

      const cleanup = () => {
        video.removeEventListener(
          "loadedmetadata",
          handleLoadedMetadata
        );
        video.removeEventListener("error", handleVideoError);
      };

      const handleLoadedMetadata = async () => {
        if (finished) return;

        finished = true;
        cleanup();

        try {
          await video.play();
          resolve();
        } catch (playError) {
          reject(playError);
        }
      };

      const handleVideoError = () => {
        if (finished) return;

        finished = true;
        cleanup();
        reject(new Error("Không thể phát hình ảnh từ camera."));
      };

      video.addEventListener(
        "loadedmetadata",
        handleLoadedMetadata
      );
      video.addEventListener("error", handleVideoError);

      if (video.readyState >= 1) {
        void handleLoadedMetadata();
      }
    });
  }

  async function openCamera() {
    setUploadMenuOpen(false);
    setError("");
    setCameraNotice("");
    setFlashOn(false);
    setFlashSupported(false);

    const cameraSupported =
      typeof window !== "undefined" &&
      window.isSecureContext &&
      Boolean(navigator.mediaDevices?.getUserMedia);

    if (!cameraSupported) {
      setError(
        "Camera trực tiếp cần kết nối HTTPS. Hãy mở ứng dụng bằng URL Vercel HTTPS thay vì địa chỉ HTTP LAN."
      );
      return;
    }

    try {
      stopCameraStream();

      setCameraOpen(true);
      setCameraStarting(true);

      /*
       * Đợi React render modal và tạo thẻ video.
       */
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      const video = videoRef.current;

      if (!video) {
        throw new Error("Không tìm thấy thành phần hiển thị camera.");
      }

      let stream: MediaStream;

      /*
       * Ưu tiên chính xác camera sau để tăng khả năng sử dụng flash.
       * Nếu thiết bị không đáp ứng exact, thử lại với ideal.
       */
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              exact: "environment",
            },
            width: {
              ideal: 1920,
            },
            height: {
              ideal: 1080,
            },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
            width: {
              ideal: 1920,
            },
            height: {
              ideal: 1080,
            },
          },
          audio: false,
        });
      }

      streamRef.current = stream;
      video.srcObject = stream;

      await waitForVideo(video);

      const videoTrack = stream.getVideoTracks()[0];

      if (
        videoTrack &&
        typeof videoTrack.getCapabilities === "function"
      ) {
        const capabilities =
          videoTrack.getCapabilities() as TorchMediaTrackCapabilities;

        setFlashSupported(capabilities.torch === true);
      } else {
        setFlashSupported(false);
      }

      setCameraStarting(false);
    } catch (caughtError) {
      console.error("Không thể mở camera:", caughtError);

      stopCameraStream();
      setCameraOpen(false);
      setCameraStarting(false);

      if (
        caughtError instanceof DOMException &&
        caughtError.name === "NotAllowedError"
      ) {
        setError(
          "Quyền sử dụng camera đã bị từ chối. Hãy cho phép Camera trong cài đặt trang web rồi thử lại."
        );
        return;
      }

      if (
        caughtError instanceof DOMException &&
        caughtError.name === "NotFoundError"
      ) {
        setError("Không tìm thấy camera trên thiết bị.");
        return;
      }

      if (
        caughtError instanceof DOMException &&
        caughtError.name === "NotReadableError"
      ) {
        setError(
          "Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng camera khác rồi thử lại."
        );
        return;
      }

      setError(
        "Không thể mở camera trực tiếp. Hãy kiểm tra quyền Camera và đảm bảo trang đang chạy qua HTTPS."
      );
    }
  }

  async function toggleFlash() {
    if (flashChanging || cameraStarting) return;

    const videoTrack = streamRef.current?.getVideoTracks()[0];

    if (!videoTrack) {
      setCameraNotice("Camera chưa sẵn sàng.");
      return;
    }

    const capabilities =
      typeof videoTrack.getCapabilities === "function"
        ? (videoTrack.getCapabilities() as TorchMediaTrackCapabilities)
        : undefined;

    if (!capabilities?.torch) {
      setFlashSupported(false);
      setCameraNotice(
        "Camera hoặc trình duyệt này không hỗ trợ điều khiển đèn flash."
      );
      return;
    }

    const nextFlashState = !flashOn;

    try {
      setFlashChanging(true);
      setCameraNotice("");

      const torchConstraint: TorchMediaTrackConstraintSet = {
        torch: nextFlashState,
      };

      await videoTrack.applyConstraints({
        advanced: [torchConstraint],
      });

      setFlashOn(nextFlashState);
      setFlashSupported(true);
    } catch (flashError) {
      console.error("Không thể thay đổi đèn flash:", flashError);

      setCameraNotice(
        "Không thể thay đổi đèn flash trên camera này."
      );
    } finally {
      setFlashChanging(false);
    }
  }

  function captureCameraImage() {
    const video = videoRef.current;

    if (
      !video ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      setCameraNotice("Camera chưa sẵn sàng. Vui lòng thử lại.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setCameraNotice("Không thể chụp ảnh từ camera.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraNotice("Không thể tạo ảnh từ camera.");
          return;
        }

        const capturedFile = new File(
          [blob],
          `warehouse-${Date.now()}.jpg`,
          {
            type: "image/jpeg",
          }
        );

        applySelectedImage(capturedFile);
      },
      "image/jpeg",
      0.92
    );
  }

  async function handleAudit() {
    if (!file) {
      setError("Vui lòng tải hoặc chụp một ảnh kho.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setUploadMenuOpen(false);

      const data = await runWarehouseAudit(file);

      setResult({
        outputImage: data.outputImage ?? null,
        summary: data.summary ?? null,
        correctCount: data.correctCount ?? 0,
        misplacedCount: data.misplacedCount ?? 0,
        unknownCount: data.unknownCount ?? 0,
        misplacedPercent: data.misplacedPercent ?? 0,
        unknownPercent: data.unknownPercent ?? 0,
        isCompliant: data.isCompliant ?? false,
        instructions: data.instructions ?? [],
      });

      window.setTimeout(() => {
        document.getElementById("audit-result")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Đã xảy ra lỗi khi kiểm tra ảnh."
      );
    } finally {
      setLoading(false);
    }
  }

  function resetAudit() {
    setFile(null);
    setPreviewUrl("");
    setResult(null);
    setError("");
    setUploadMenuOpen(false);

    closeCamera();
    closeImageViewer();
  }

  function changeZoom(nextZoom: number) {
    const limitedZoom = Math.min(
      4,
      Math.max(0.5, Number(nextZoom.toFixed(2)))
    );

    setImageZoom(limitedZoom);

    if (limitedZoom <= 1) {
      setImagePan({ x: 0, y: 0 });
    }
  }

  function zoomIn() {
    setImageZoom((currentZoom) =>
      Math.min(4, Number((currentZoom + 0.25).toFixed(2)))
    );
  }

  function zoomOut() {
    setImageZoom((currentZoom) => {
      const nextZoom = Math.max(
        0.5,
        Number((currentZoom - 0.25).toFixed(2))
      );

      if (nextZoom <= 1) {
        setImagePan({ x: 0, y: 0 });
      }

      return nextZoom;
    });
  }

  function resetZoom() {
    setImageZoom(1);
    setImagePan({ x: 0, y: 0 });
    setDragging(false);
    dragStartRef.current = null;
  }

  function handleViewerWheel(
    event: ReactWheelEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const zoomStep = event.deltaY < 0 ? 0.2 : -0.2;

    setImageZoom((currentZoom) => {
      const nextZoom = Math.min(
        4,
        Math.max(
          0.5,
          Number((currentZoom + zoomStep).toFixed(2))
        )
      );

      if (nextZoom <= 1) {
        setImagePan({ x: 0, y: 0 });
      }

      return nextZoom;
    });
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (imageZoom <= 1) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      imageX: imagePan.x,
      imageY: imagePan.y,
    };

    setDragging(true);
  }

  function handlePointerMove(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (!dragging || !dragStartRef.current || imageZoom <= 1) {
      return;
    }

    const deltaX =
      event.clientX - dragStartRef.current.pointerX;
    const deltaY =
      event.clientY - dragStartRef.current.pointerY;

    setImagePan({
      x: dragStartRef.current.imageX + deltaX,
      y: dragStartRef.current.imageY + deltaY,
    });
  }

  function endPointerDrag(
    event: ReactPointerEvent<HTMLDivElement>
  ) {
    if (
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDragging(false);
    dragStartRef.current = null;
  }

  return (
    <main className="warehouse-page">
      <div className="warehouse-container">
        <header className="page-header">
          <div className="brand-header">
            <div className="brand-title-row">
              <h1>Ultra Vision</h1>
              <span className="version-badge">v0.7</span>
            </div>

            <p className="brand-subtitle">
              Kiểm tra vị trí hàng hóa
            </p>
          </div>

          <div className="connection-badge">
            <span className="connection-dot" />
            Hệ thống sẵn sàng
          </div>
        </header>

        <section className="panel upload-panel">
          <div className="section-heading">
            <h2>Nhập ảnh kho thực tế</h2>
          </div>

          <div className="warehouse-image-frame">
            {previewUrl ? (
              <>
                <button
                  type="button"
                  className="preview-image-button"
                  onClick={() =>
                    openImageViewer(
                      previewUrl,
                      "Kiểm tra ảnh đầu vào"
                    )
                  }
                  aria-label="Mở ảnh để xem chi tiết"
                >
                  <img
                    className="warehouse-preview-image"
                    src={previewUrl}
                    alt="Ảnh kho đã chọn"
                  />

                  <span className="preview-hint">
                    Nhấn vào ảnh để xem chi tiết
                  </span>
                </button>

                <div className="change-image-area">
                  <button
                    type="button"
                    className="small-plus-button"
                    onClick={() =>
                      setUploadMenuOpen((current) => !current)
                    }
                    aria-label="Chọn ảnh khác"
                    aria-expanded={uploadMenuOpen}
                  >
                    +
                  </button>

                  {uploadMenuOpen && (
                    <div className="upload-choice-menu">
                      <button
                        type="button"
                        className="upload-choice-button"
                        onClick={openCamera}
                      >
                        <span
                          className="scan-choice-icon"
                          aria-hidden="true"
                        >
                          ◎
                        </span>
                        <span>Quét mã hàng</span>
                      </button>

                      <button
                        type="button"
                        className="upload-choice-button gallery-choice"
                        onClick={() =>
                          galleryInputRef.current?.click()
                        }
                      >
                        <span
                          className="gallery-choice-icon"
                          aria-hidden="true"
                        >
                          ▣
                        </span>
                        <span>Chọn từ ảnh</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="image-frame-placeholder">
                <div className="upload-menu-wrapper">
                  <button
                    type="button"
                    className="placeholder-plus-button"
                    onClick={() =>
                      setUploadMenuOpen((current) => !current)
                    }
                    aria-label="Mở lựa chọn nhập ảnh"
                    aria-expanded={uploadMenuOpen}
                  >
                    +
                  </button>

                  {uploadMenuOpen && (
                    <div className="upload-choice-menu centered-upload-menu">
                      <button
                        type="button"
                        className="upload-choice-button"
                        onClick={openCamera}
                      >
                        <span
                          className="scan-choice-icon"
                          aria-hidden="true"
                        >
                          ◎
                        </span>
                        <span>Quét mã hàng</span>
                      </button>

                      <button
                        type="button"
                        className="upload-choice-button gallery-choice"
                        onClick={() =>
                          galleryInputRef.current?.click()
                        }
                      >
                        <span
                          className="gallery-choice-icon"
                          aria-hidden="true"
                        >
                          ▣
                        </span>
                        <span>Chọn từ ảnh</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <input
            ref={galleryInputRef}
            className="hidden-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={selectImage}
          />

          {file && (
            <div className="file-information">
              <div>
                <strong>{file.name}</strong>
                <span>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>

              <button
                type="button"
                className="remove-image-button"
                onClick={resetAudit}
                disabled={loading}
              >
                Xóa ảnh
              </button>
            </div>
          )}

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <div className="submit-row">
            <button
              type="button"
              className="audit-button"
              onClick={handleAudit}
              disabled={!file || loading}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Đang kiểm tra...
                </>
              ) : (
                "Kiểm tra vị trí"
              )}
            </button>

            {(file || result) && !loading && (
              <button
                type="button"
                className="reset-button"
                onClick={resetAudit}
              >
                Làm lại
              </button>
            )}
          </div>

          {loading && (
            <p className="loading-note">
              Hệ thống đang đọc SKU, Bin và kiểm tra quy tắc
              ABC. Vui lòng không đóng trang.
            </p>
          )}
        </section>

        {result && (
          <section
            id="audit-result"
            className="result-section"
            aria-live="polite"
          >
            <div className="result-layout">
              <article className="panel annotated-image-panel">
                <div className="panel-title-row">
                  <div>
                    <span className="panel-kicker">
                      KẾT QUẢ HÌNH ẢNH
                    </span>
                    <h2>Ảnh được đánh dấu</h2>
                  </div>

                  {result.outputImage && (
                    <button
                      type="button"
                      className="view-result-button"
                      onClick={() =>
                        openImageViewer(
                          result.outputImage as string,
                          "Ảnh kết quả kiểm tra"
                        )
                      }
                    >
                      Xem chi tiết
                    </button>
                  )}
                </div>

                {result.outputImage ? (
                  <button
                    type="button"
                    className="result-image-button"
                    onClick={() =>
                      openImageViewer(
                        result.outputImage as string,
                        "Ảnh kết quả kiểm tra"
                      )
                    }
                    aria-label="Mở ảnh kết quả để xem chi tiết"
                  >
                    <img
                      src={result.outputImage}
                      alt="Ảnh kết quả kiểm tra vị trí hàng hóa"
                    />

                    <span className="result-image-hint">
                      Nhấn vào ảnh để phóng to
                    </span>
                  </button>
                ) : (
                  <div className="result-image-empty">
                    Workflow không trả về ảnh đánh dấu.
                  </div>
                )}

                <div className="legend image-legend">
                  <span>
                    <i className="legend-color correct-color" />
                    Correct
                  </span>
                  <span>
                    <i className="legend-color misplaced-color" />
                    Misplaced
                  </span>
                  <span>
                    <i className="legend-color unknown-color" />
                    Unknown
                  </span>
                </div>
              </article>

              <aside className="result-sidebar">
                <article className="panel status-overview-panel">
                  <div className="status-overview-header">
                    <div>
                      <span className="panel-kicker">
                        KẾT QUẢ KIỂM TRA
                      </span>

                      <h2>
                        {result.isCompliant
                          ? "Hàng hóa đúng vị trí"
                          : "Phát hiện hàng cần xử lý"}
                      </h2>
                    </div>

                    <span
                      className={`overall-status ${
                        result.isCompliant ? "passed" : "failed"
                      }`}
                    >
                      {result.isCompliant ? "Đạt" : "Chưa đạt"}
                    </span>
                  </div>

                  <div className="metrics-square">
                    <div className="square-metric total-metric">
                      <span>Tổng số kiện</span>
                      <strong>{totalPackages}</strong>
                    </div>

                    <div className="square-metric correct-metric">
                      <span>Correct</span>
                      <strong>{result.correctCount}</strong>
                    </div>

                    <div className="square-metric misplaced-metric">
                      <span>Misplaced</span>
                      <strong>{result.misplacedCount}</strong>
                    </div>

                    <div className="square-metric unknown-metric">
                      <span>Unknown</span>
                      <strong>{result.unknownCount}</strong>
                    </div>
                  </div>
                </article>

                <article className="panel ratio-chart-panel">
                  <div className="chart-heading">
                    <span className="panel-kicker">
                      PHÂN BỐ KẾT QUẢ
                    </span>
                    <h2>Tỷ lệ kiểm tra vị trí</h2>
                  </div>

                  <div className="pie-chart-layout">
                    <div
                      className="pie-chart"
                      style={{ background: pieBackground }}
                      role="img"
                      aria-label={`Tỷ lệ đúng ${chartPercentages.correct}%, tỷ lệ sai ${chartPercentages.misplaced}%, tỷ lệ không xác định ${chartPercentages.unknown}%`}
                    >
                      <div className="pie-chart-center">
                        <strong>{totalPackages}</strong>
                        <span>kiện hàng</span>
                      </div>
                    </div>

                    <div className="pie-legend">
                      <div className="pie-legend-item">
                        <i className="pie-dot correct-dot" />
                        <div>
                          <span>Tỷ lệ đúng</span>
                          <strong>
                            {chartPercentages.correct}%
                          </strong>
                        </div>
                      </div>

                      <div className="pie-legend-item">
                        <i className="pie-dot misplaced-dot" />
                        <div>
                          <span>Tỷ lệ sai</span>
                          <strong>
                            {chartPercentages.misplaced}%
                          </strong>
                        </div>
                      </div>

                      <div className="pie-legend-item">
                        <i className="pie-dot unknown-dot" />
                        <div>
                          <span>Không xác định</span>
                          <strong>
                            {chartPercentages.unknown}%
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </aside>
            </div>

            {auditItems.length > 0 && (
              <article className="panel item-details-panel">
                <div className="panel-title-row">
                  <div>
                    <span className="panel-kicker">CHI TIẾT</span>
                    <h2>Trạng thái từng kiện hàng</h2>
                  </div>
                </div>

                <div className="item-list">
                  {auditItems.map((item) => (
                    <div
                      className={`item-card status-${item.status}`}
                      key={`${item.package}-${item.sku}`}
                    >
                      <div className="item-card-header">
                        <div>
                          <span className="package-number">
                            Kiện {item.package}
                          </span>
                          <strong>{item.sku}</strong>
                        </div>

                        <span
                          className={`status-pill ${item.status}`}
                        >
                          {statusLabel(item.status)}
                        </span>
                      </div>

                      <dl className="item-details">
                        <div>
                          <dt>Nhóm ABC</dt>
                          <dd>{item.abc}</dd>
                        </div>

                        <div>
                          <dt>Bin hiện tại</dt>
                          <dd>{item.actual_bin}</dd>
                        </div>

                        <div>
                          <dt>Bin được gán</dt>
                          <dd>{item.expected_bin}</dd>
                        </div>

                        <div>
                          <dt>Tầng ABC</dt>
                          <dd>{item.allowed_level}</dd>
                        </div>
                      </dl>

                      <p className="instruction">
                        {item.instruction}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            )}

            {result.instructions.length > 0 && (
              <article className="panel instruction-panel">
                <div className="panel-title-row">
                  <div>
                    <span className="panel-kicker">
                      ĐỀ XUẤT XỬ LÝ
                    </span>
                    <h2>Hướng dẫn di chuyển</h2>
                  </div>
                </div>

                <ol>
                  {result.instructions.map(
                    (instruction, index) => (
                      <li key={`${index}-${instruction}`}>
                        {instruction}
                      </li>
                    )
                  )}
                </ol>
              </article>
            )}
          </section>
        )}
      </div>

      {viewerImage && (
        <div
          className="image-viewer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={viewerTitle}
          onClick={closeImageViewer}
        >
          <div
            className="image-viewer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="image-viewer-header">
              <div>
                <strong>{viewerTitle}</strong>
                <span>
                  {Math.round(imageZoom * 100)}%
                  {imageZoom > 1
                    ? " · Giữ chuột và kéo để di chuyển"
                    : ""}
                </span>
              </div>

              <button
                type="button"
                className="viewer-close-button"
                onClick={closeImageViewer}
                aria-label="Đóng cửa sổ xem ảnh"
              >
                ×
              </button>
            </div>

            <div
              className={`image-viewer-canvas ${
                imageZoom > 1 ? "can-drag" : ""
              } ${dragging ? "is-dragging" : ""}`}
              onWheel={handleViewerWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endPointerDrag}
              onPointerCancel={endPointerDrag}
              onDoubleClick={resetZoom}
            >
              <img
                className="viewer-main-image"
                src={viewerImage}
                alt={viewerTitle}
                draggable={false}
                style={{
                  transform: `translate3d(${imagePan.x}px, ${imagePan.y}px, 0) scale(${imageZoom})`,
                }}
              />
            </div>

            <div className="image-viewer-controls">
              <button
                type="button"
                onClick={zoomOut}
                disabled={imageZoom <= 0.5}
                aria-label="Thu nhỏ ảnh"
              >
                −
              </button>

              <input
                type="range"
                min="0.5"
                max="4"
                step="0.1"
                value={imageZoom}
                onChange={(event) =>
                  changeZoom(Number(event.target.value))
                }
                aria-label="Mức phóng ảnh"
              />

              <button
                type="button"
                onClick={zoomIn}
                disabled={imageZoom >= 4}
                aria-label="Phóng to ảnh"
              >
                +
              </button>

              <button
                type="button"
                className="reset-zoom-button"
                onClick={resetZoom}
              >
                Vừa khung
              </button>
            </div>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div
          className="camera-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Quét mã hàng"
        >
          <video
            ref={videoRef}
            className="camera-video"
            autoPlay
            muted
            playsInline
          />

          <div className="camera-shade" />

          <header className="camera-header">
            <div className="camera-header-left">
              <button
                type="button"
                className="camera-back-button"
                onClick={closeCamera}
                aria-label="Đóng camera"
              >
                ‹
              </button>

              <h2>Quét mã hàng</h2>
            </div>

            <button
              type="button"
              className={`camera-flash-button ${
                flashOn ? "flash-active" : ""
              }`}
              onClick={toggleFlash}
              disabled={cameraStarting || flashChanging}
              aria-pressed={flashOn}
              aria-label={
                flashOn ? "Tắt đèn flash" : "Bật đèn flash"
              }
              title={
                flashSupported
                  ? flashOn
                    ? "Tắt đèn flash"
                    : "Bật đèn flash"
                  : "Thiết bị có thể không hỗ trợ flash"
              }
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="flash-icon"
              >
                <path
                  d="M13.2 2 5.8 13.1h5.1L10.3 22l7.9-11.7h-5.3L13.2 2Z"
                  fill="currentColor"
                />
              </svg>

              <span className="flash-button-text">
                {flashChanging
                  ? "..."
                  : flashOn
                    ? "Bật"
                    : "Tắt"}
              </span>
            </button>
          </header>

          {cameraNotice && (
            <div className="camera-notice" role="status">
              <span>{cameraNotice}</span>

              <button
                type="button"
                onClick={() => setCameraNotice("")}
                aria-label="Đóng thông báo"
              >
                ×
              </button>
            </div>
          )}

          <div className="camera-bottom-controls">
            <button
              type="button"
              className="camera-gallery-button"
              onClick={() => galleryInputRef.current?.click()}
            >
              <span aria-hidden="true">▣</span>
              Chọn từ ảnh
            </button>

            <button
              type="button"
              className="camera-capture-button"
              onClick={captureCameraImage}
              disabled={cameraStarting}
              aria-label="Chụp ảnh"
            >
              <span />
            </button>
          </div>

          {cameraStarting && (
            <div className="camera-loading">
              <span className="camera-loading-spinner" />
              <p>Đang khởi động camera...</p>

              <button
                type="button"
                className="camera-loading-close"
                onClick={closeCamera}
              >
                Đóng
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
