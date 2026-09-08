/** All size-`size` combinations of `items`, in input order. */
export function combinations<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  if (size <= 0 || size > items.length) return out;
  const current: T[] = [];
  const walk = (start: number): void => {
    if (current.length === size) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]!);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}
