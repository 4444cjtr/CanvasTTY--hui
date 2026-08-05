export function tryPtyOperation(operation: () => void): boolean {
  try {
    operation();
    return true;
  } catch {
    // PTY exit and renderer resize/input events may cross in flight.
    return false;
  }
}
