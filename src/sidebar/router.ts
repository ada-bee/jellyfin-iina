export type SearchFilter = "all" | "movie" | "series" | "episode";

export type BrowseRoute =
    | { kind: "home" }
    | {
        kind: "library";
        id: string;
        name: string;
        collectionType: string;
    }
    | { kind: "movie"; id: string; name: string }
    | { kind: "series"; id: string; name: string };

export interface SearchRoute {
    kind: "search";
    query: string;
    filter: SearchFilter;
}

export type SidebarRoute = BrowseRoute | SearchRoute;

export interface RouterState {
    stack: SidebarRoute[];
}

export type BreadcrumbEntry = Exclude<BrowseRoute, { kind: "home" }>;

export function createRouterState(): RouterState {
    return { stack: [{ kind: "home" }] };
}

export function getCurrentRoute(router: RouterState): SidebarRoute {
    return router.stack[router.stack.length - 1] || { kind: "home" };
}

export function getCurrentBrowseRoute(router: RouterState): BrowseRoute {
    for (let index = router.stack.length - 1; index >= 0; index -= 1) {
        const route = router.stack[index];
        if (route?.kind !== "search") {
            return route || { kind: "home" };
        }
    }
    return { kind: "home" };
}

export function navigateHome(): RouterState {
    return createRouterState();
}

export function navigateLibrary(
    route: Omit<Extract<BrowseRoute, { kind: "library" }>, "kind">
): RouterState {
    return {
        stack: [
            { kind: "home" },
            { kind: "library", ...route }
        ]
    };
}

export function navigateToDetails(
    router: RouterState,
    route: Extract<BrowseRoute, { kind: "movie" | "series" }>
): RouterState {
    const stack = [...router.stack];
    if (getCurrentRoute(router).kind === "search") {
        stack.pop();
    }
    const current = stack[stack.length - 1];
    if (current?.kind === route.kind && current.id === route.id) {
        return { stack };
    }
    stack.push(route);
    return { stack };
}

export function beginSearch(
    router: RouterState,
    query: string,
    filter: SearchFilter
): RouterState {
    const current = getCurrentRoute(router);
    if (current?.kind === "search") {
        const stack = [...router.stack];
        stack[stack.length - 1] = { ...current, query, filter };
        return { stack };
    }
    const origin = current.kind === "library"
        ? router.stack
        : [{ kind: "home" } satisfies BrowseRoute];
    return { stack: [...origin, { kind: "search", query, filter }] };
}

export function updateSearch(
    router: RouterState,
    update: Partial<Pick<SearchRoute, "query" | "filter">>
): RouterState {
    const stack = [...router.stack];
    const current = stack[stack.length - 1];
    if (current?.kind !== "search") {
        return router;
    }
    stack[stack.length - 1] = { ...current, ...update };
    return { stack };
}

export function clearSearch(router: RouterState): RouterState {
    if (getCurrentRoute(router).kind !== "search") {
        return router;
    }
    return { stack: router.stack.slice(0, -1) };
}

export function navigateBack(router: RouterState): RouterState {
    if (router.stack.length <= 1) {
        return router;
    }
    return { stack: router.stack.slice(0, -1) };
}

export function getBreadcrumbs(router: RouterState): BreadcrumbEntry[] {
    return router.stack.filter((route): route is BreadcrumbEntry => (
        route.kind === "library" || route.kind === "movie" || route.kind === "series"
    ));
}

export function getSearchOrigin(router: RouterState): "home" | "library" | null {
    if (getCurrentRoute(router).kind !== "search") {
        return null;
    }
    return getCurrentBrowseRoute(router).kind === "library" ? "library" : "home";
}
