/**
 * Coach is a full-height flex column: the thread scrolls inside the glass
 * pane; the composer sits below. This wrapper participates in the global
 * `min-h-0` height chain so the page shell does not grow with message length.
 */
export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
}
