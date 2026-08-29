import type {
    HttpMethod,
    HttpResponse,
    HttpTransport
} from "../../jellyfin/client";

export function createIinaHttpTransport(http: IINA.API.HTTP): HttpTransport {
    return {
        async send(request): Promise<HttpResponse> {
            const options: IINA.HTTPRequestOption<unknown> = {
                params: {},
                headers: request.headers,
                data: request.body === undefined ? null : request.body
            };
            const response = await sendIinaRequest(http, request.method, request.url, options);
            return {
                status: response.statusCode || 0,
                statusText: response.reason || "",
                data: response.data,
                text: response.text
            };
        }
    };
}

function sendIinaRequest(
    http: IINA.API.HTTP,
    method: HttpMethod,
    url: string,
    options: IINA.HTTPRequestOption<unknown>
): Promise<IINA.HTTPResponse<unknown>> {
    switch (method) {
        case "GET":
            return http.get<unknown, unknown>(url, options);
        case "POST":
            return http.post<unknown, unknown>(url, options);
        case "PUT":
            return http.put<unknown, unknown>(url, options);
        case "PATCH":
            return http.patch<unknown, unknown>(url, options);
        case "DELETE":
            return http.delete<unknown, unknown>(url, options);
    }
}
