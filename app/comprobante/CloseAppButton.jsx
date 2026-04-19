"use client";

export default function CloseAppButton({ className }) {
  const handleClick = () => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage("close");
    }

    window.close();
    window.history.back();
  };

  return (
    <button type="button" onClick={handleClick} className={className}>
      Cerrar y Volver a la App
    </button>
  );
}
