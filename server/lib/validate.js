// Shared request-body validation helper (BUG_LIST.md bug #2 fix).
//
// Problem: every POST/PATCH route bound req.body.<field> straight into a
// prepared statement. When a required field was omitted, the value was
// `undefined` in JS — and better-sqlite3 throws a TypeError on an
// `undefined` bind parameter (it requires `null`, not `undefined`). That
// throw was caught by the generic error middleware in index.js and
// returned as a raw 500 with a driver stack-trace string leaking in
// `detail`, instead of the contract's clean 400 `{ "error": "message" }`.
//
// Fix: call assertRequired() at the top of every write route that has
// required fields. It returns true/false; routes return early on false
// (the helper has already sent the 400 response).
export function assertRequired(req, res, fields) {
  const body = req.body || {};
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length) {
    res.status(400).json({ error: `Missing required field(s): ${missing.join(", ")}` });
    return false;
  }
  return true;
}
