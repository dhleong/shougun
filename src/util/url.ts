import querystring from "querystring";

export function withQuery(
    url: string,
    queryParams: querystring.ParsedUrlQueryInput,
) {
    const hasAnyQuery = url.includes("?");
    const separator = hasAnyQuery ? "&" : "?";
    return url + separator + querystring.stringify(queryParams);
}
