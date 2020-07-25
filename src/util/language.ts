export function languageCodeMatches(
    candidate: string,
    target: string,
) {
    // this could definitely be more robust...
    return candidate.startsWith(target);
}
