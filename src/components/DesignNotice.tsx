/** Says plainly that nothing here works yet, so the mock is never mistaken for the app. */
export function DesignNotice() {
  return (
    <p className="notice">
      <strong>Design preview</strong>
      <span>Sample data, nothing saves yet. Buttons and fields are for looks only.</span>
    </p>
  );
}
