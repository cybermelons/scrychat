// Placeholder click handler for controls whose backend is not built yet:
// logs to console and shows a visible inline error chip next to the control.
export function stub(feature: string) {
  return (e: { currentTarget: Element; nativeEvent?: Event }): void => {
    console.error(`[stub] ${feature}: not implemented`);
    document.querySelectorAll(".stub-error").forEach((n) => n.remove());
    const span = document.createElement("span");
    span.className = "sc-chip sc-chip-error stub-error";
    span.textContent = `${feature}: not built yet`;
    e.currentTarget.insertAdjacentElement("afterend", span);
    // Remove on the next click elsewhere (skip the click that opened it).
    const off = (ev: Event) => {
      if (ev === (e.nativeEvent ?? e)) return;
      span.remove();
      document.removeEventListener("click", off);
    };
    document.addEventListener("click", off);
  };
}
