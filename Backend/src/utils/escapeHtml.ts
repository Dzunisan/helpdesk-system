// Escapes a value for safe use inside HTML text or a quoted attribute. Use it on EVERY value
// interpolated into an email's html body: ticket titles, comments and names are user input.
export const escapeHtml = (value: unknown): string =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
