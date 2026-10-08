// server/codes.ts — random gift card numbers and voucher codes
import { randomInt } from "node:crypto";

// No vowels: codes can't spell words and there's no O/0 or I/1 confusion.
const CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";

/** 12 digits: "7777" + 8 random digits, like the printed cards. */
export function newCardNumber(taken: Set<string>): string {
  for (;;) {
    const n = "7777" + String(randomInt(0, 100_000_000)).padStart(8, "0");
    if (!taken.has(n)) {
      taken.add(n);
      return n;
    }
  }
}

/** 8 consonants + the amount, e.g. LQNZDRKP50. `taken` must be upper-case. */
export function newVoucherCode(amount: number, taken: Set<string>): string {
  const suffix = Number.isInteger(amount) ? String(amount) : String(amount).replace(".", "");
  for (;;) {
    let stem = "";
    for (let i = 0; i < 8; i++) stem += CONSONANTS[randomInt(0, CONSONANTS.length)];
    const code = stem + suffix;
    if (!taken.has(code)) {
      taken.add(code);
      return code;
    }
  }
}
