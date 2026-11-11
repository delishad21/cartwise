export const money = (n: number) => `S$${n.toFixed(2)}`;

/** "3" → "Group 3"; a group already named "Group 3" stays as it is. */
export const groupLabel = (g: string) => (/^group\b/i.test(g.trim()) ? g : `Group ${g}`);
