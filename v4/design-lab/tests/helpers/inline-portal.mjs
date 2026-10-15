// Test-only stand-in for "react-dom": server rendering has no DOM to portal
// into, so dialogs are rendered in place where the component returns them.
export const createPortal = (children) => children;
