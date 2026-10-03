// The next number of a named counter (the Sequence table): receipt numbers.
// Call it inside the transaction that saves the numbered row: the INSERT
// ... ON DUPLICATE KEY UPDATE locks the counter's row until that
// transaction ends, so two admins saving at once queue on it and never get
// the same number, and a failed save gives its number back. A counter that
// does not exist yet starts at 1 in the same statement (no create race).
export async function nextSequence(tx, name) {
  await tx.$executeRaw`INSERT INTO Sequence (name, value) VALUES (${name}, 1)
    ON DUPLICATE KEY UPDATE value = value + 1`;
  // Reads this transaction's own write.
  const [row] = await tx.$queryRaw`SELECT value FROM Sequence WHERE name = ${name}`;
  return Number(row.value);
}
