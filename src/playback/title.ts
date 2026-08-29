export function sanitizeMediaTitle(title: string): string {
    return String(title).replace(/[\n\r,=]/g, " ");
}
