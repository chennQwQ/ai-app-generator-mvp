interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onDismiss, onRetry }: ErrorBannerProps) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <div className="error-actions">
        {onRetry ? (
          <button onClick={onRetry} type="button">
            Retry
          </button>
        ) : null}
        <button onClick={onDismiss} type="button" aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}
