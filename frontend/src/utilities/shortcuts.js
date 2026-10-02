export function canonical(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toLowerCase();
  parts.push(key);
  return parts.join("+");
}

export function matchBinding(e, bindings, action) {
  return canonical(e) === (bindings && bindings[action]);
}

export function displayBinding(binding) {
  return String(binding || "")
    .split("+")
    .map((p) => (p === "Space" ? "Space" : p.length === 1 ? p.toUpperCase() : p))
    .join(" + ");
}
