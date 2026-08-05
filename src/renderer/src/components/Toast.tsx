interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps): React.JSX.Element {
  return <div className={`toast ${message ? "toast--visible" : ""}`}>{message}</div>;
}
